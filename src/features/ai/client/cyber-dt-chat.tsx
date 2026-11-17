"use client";

import * as React from "react";
import { useEffect, useRef, useState, useCallback } from "react";
import {
  Send,
  Bot,
  Loader2,
  Sparkles,
  KeyRound,
  Trash2,
  Copy,
  Check,
  RefreshCw,
  Square,
  ClipboardList,
  Target,
  FileText,
  Lightbulb,
  History,
  Plus,
  ImagePlus,
  X,
  Phone,
  PhoneOff,
  Mic,
  MicOff,
  AudioLines,
} from "lucide-react";
import { useT, useLanguage } from "@/lib/language-context";
import {
  generateCyberDTResponse,
  getCyberDTAIBusyResponse,
  getCyberDTGreeting,
  renderCyberDTResponse,
  detectCyberDTLocale,
  type CyberDTResponse,
  type CyberDTLocale,
} from "@/features/ai/client/cyber-dt-ai";
import {
  buildGeminiRequestBody,
  extractGeminiStreamDelta,
  geminiStreamEndpoint,
  cyberDTModelChain,
  parseSSEBuffer,
  CYBER_DT_VOICE_PROMPT,
} from "@/features/ai/cyber-dt-shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { CyberDTMessageBody } from "@/features/ai/client/cyber-dt-markdown";
import {
  CYBER_DT_IMAGE_ACCEPT,
  prepareCyberDTImage,
  type CyberDTImageAttachment,
} from "@/features/ai/client/cyber-dt-image";
import { CONV_DELETED_KEY } from "@/lib/account-sync";

interface ChatMessage {
  id: string;
  role: "user" | "ai";
  text: string;
  emoji?: string;
  time?: string;
  /** True while the answer is still streaming in. */
  streaming?: boolean;
  /** True when the answer is the "AI is busy" notice, so we show a retry button. */
  busy?: boolean;
}

interface Conversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  updatedAt: number;
}

const CONV_STORAGE = "cyberdt_conversations";

/**
 * Asks the account sync loop to push the saved conversations right away. Without
 * this, chats written to localStorage only reached the account on the slow
 * background interval (and never while the tab was hidden), so they did not
 * appear on the account's other devices.
 */
function requestSync() {
  try {
    window.dispatchEvent(new Event("biopulse:sync-now"));
  } catch {
    /* no window (SSR) */
  }
}

const QUICK_QUESTIONS: Record<CyberDTLocale, string[]> = {
  en: [
    "Tell me about photosynthesis",
    "Explain cell structure",
    "What is DNA?",
    "What is mitosis?",
    "How do enzymes work?",
    "How do I prepare for exams?",
  ],
  si: [
    "ප්‍රභාසංස්ලේෂණය ගැන කියන්න",
    "සෛල ව්‍යූහය පැහැදිලි කරන්න",
    "DNA යනු කුමක්ද?",
    "මයිටෝසිස් යනු කුමක්ද?",
    "එන්සයිම ක්‍රියා කරන්නේ කෙසේද?",
    "විභාගයට සූදානම් වන්නේ කෙසේද?",
  ],
};

let msgCounter = 0;
function nextId() {
  msgCounter += 1;
  return `cdt-${Date.now()}-${msgCounter}`;
}

function nowTime(): string {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/** localStorage key for the user's own Gemini API key (browser-direct fallback). */
const GEMINI_KEY_STORAGE = "cyberdt_gemini_key";

/**
 * Where the chat page calls the AI route. On the hosted site this is the
 * relative /api/cyber-dt. In the offline APK the app boots from bundled
 * assets, so a relative fetch would hit the local origin and fail — the
 * offline build bakes NEXT_PUBLIC_SYNC_BASE (the deployed site) into the
 * bundle, and we then call the same route there cross-origin (it sends CORS
 * headers), so the APK also gets real Gemini answers when online.
 */
const CYBER_DT_API = (() => {
  const base = (process.env.NEXT_PUBLIC_SYNC_BASE || "").replace(/\/+$/, "");
  return base ? `${base}/api/cyber-dt` : "/api/cyber-dt";
})();

function getStoredGeminiKey(): string {
  try {
    return window.localStorage.getItem(GEMINI_KEY_STORAGE) || "";
  } catch {
    return "";
  }
}

/** Maps one SSE event to its text delta. */
type SSEEventMapper = (event: unknown) => string;

/**
 * Reveals a complete answer progressively, so it still feels like the AI is
 * typing it live. The server route returns whole answers at once (Netlify
 * cut long SSE streams mid-answer), and the browser-direct Gemini path
 * still streams for real — this typewriter covers the JSON shape.
 * Pressing Stop skips the animation and shows the full answer.
 */
async function typeOutAnswer(
  full: string,
  onDelta: (fullSoFar: string) => void,
  signal?: AbortSignal | null,
  instant?: boolean,
): Promise<void> {
  if (instant || full.length <= 480) {
    onDelta(full);
    return;
  }
  // Reveal fast: a long study plan is already fully written by the time it
  // arrives, so a slow typewriter just adds seconds of pointless waiting.
  // Short answers type out at a readable pace; long ones appear almost at once.
  const CHUNK = full.length > 4_000 ? 180 : 45; // characters per tick
  const TICK = 8; // ms per tick — short ~5,600 chars/s, long ~22,000 chars/s
  let shown = 0;
  while (shown < full.length && !signal?.aborted) {
    shown = Math.min(shown + CHUNK, full.length);
    onDelta(full.slice(0, shown));
    if (shown < full.length) await new Promise((resolve) => setTimeout(resolve, TICK));
  }
  if (signal?.aborted) onDelta(full); // Stop pressed — reveal the rest at once.
}

/**
 * Reads a streaming (SSE) or JSON fetch response and returns the full text.
 * `onDelta` is called with the accumulated text so the UI can render it
 * progressively while the answer is being written.
 */
async function readAnswerStream(
  url: string,
  init: RequestInit,
  mapEvent: SSEEventMapper,
  onDelta: (fullSoFar: string) => void,
  onServerBusy?: () => void,
  /** Reveal the answer at once instead of running the typewriter (voice mode). */
  instant?: boolean,
): Promise<string | null> {
  const res = await fetch(url, init);
  const contentType = res.headers.get("content-type") || "";

  if (res.ok && contentType.includes("text/event-stream") && res.body) {
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let acc = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const { events, rest } = parseSSEBuffer(buffer);
      buffer = rest;
      for (const event of events) {
        const delta = mapEvent(event);
        if (delta) acc += delta;
      }
      onDelta(acc);
    }
    return acc.trim() ? acc : null;
  }

  // Plain JSON response: the complete answer (typed out progressively so it
  // still looks like the AI is writing it), or a fallback shape.
  const data = await res.json().catch(() => null);
  if (data && data.ok && typeof data.text === "string" && data.text.trim()) {
    const full = data.text.trim();
    await typeOutAnswer(full, onDelta, init.signal, instant);
    return full;
  }
  // The route answered, but couldn't get an AI reply (busy/out of quota).
  // Distinguish that from "offline" so the caller can offer a retry instead of
  // a wrong offline answer.
  if (data && data.busy) onServerBusy?.();
  return null;
}

// ===== Live Voice Tutor helpers =============================================

type VoicePhase = "connecting" | "listening" | "thinking" | "speaking" | "error";

interface SpeechRecognitionAlternativeLike {
  transcript: string;
  confidence: number;
}
interface SpeechRecognitionResultLike {
  isFinal: boolean;
  length: number;
  [index: number]: SpeechRecognitionAlternativeLike;
}
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: SpeechRecognitionResultLike;
  };
}
interface SpeechRecognitionErrorEventLike {
  error?: string;
  message?: string;
}
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

/** Chrome/Edge expose the Web Speech API behind a webkit prefix. */
function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** Strips markdown so the text-to-speech engine reads words, not symbols. */
function speechFriendly(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+[.)]\s+/gm, "")
    .replace(/^\s*\|.*\|\s*$/gm, " ")
    .replace(/[*_~#>|]+/g, " ")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{2,}/g, ". ")
    .replace(/\n/g, " ")
    .trim();
}

/** Chooses a natural voice for the spoken language. */
function pickVoice(voices: SpeechSynthesisVoice[], sinhala: boolean): SpeechSynthesisVoice | undefined {
  if (sinhala) {
    return (
      voices.find((v) => v.lang.toLowerCase().startsWith("si")) ??
      voices.find((v) => v.name.toLowerCase().includes("sinhala"))
    );
  }
  return (
    voices.find((v) => v.lang === "en-US" && /google/i.test(v.name)) ??
    voices.find((v) => v.lang === "en-US") ??
    voices.find((v) => v.lang.toLowerCase().startsWith("en"))
  );
}

interface SendOptions {
  noUserMessage?: boolean;
  historyOverride?: Array<{ role: string; text: string }>;
  image?: CyberDTImageAttachment | null;
  /** Live Voice Tutor: ask for a short spoken-style answer. */
  voice?: boolean;
}

export function CyberDTChat({
  onClose,
  starter,
}: { onClose?: () => void; starter?: string } = {}) {
  const t = useT();
  const { locale } = useLanguage();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const timers = useRef<NodeJS.Timeout[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  // ===== Live Voice Tutor =====
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [voicePhase, setVoicePhase] = useState<VoicePhase>("connecting");
  const [voiceMuted, setVoiceMuted] = useState(false);
  const [voiceLang, setVoiceLang] = useState<"en-US" | "si-LK">(locale === "si" ? "si-LK" : "en-US");
  const [voiceHeard, setVoiceHeard] = useState("");
  const [voiceReply, setVoiceReply] = useState("");
  const [voiceError, setVoiceError] = useState("");
  // Refs that let the voice loop always see the newest chat + send().
  const messagesRef = useRef<ChatMessage[]>([]);
  messagesRef.current = messages;
  const sendRef = useRef<(raw: string, opts?: SendOptions) => Promise<string>>(async () => "");
  // Live Voice Tutor engine refs — the loop lives outside React's render cycle.
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const voiceActiveRef = useRef(false);
  const voiceMutedRef = useRef(false);
  const voiceLangRef = useRef<"en-US" | "si-LK">(voiceLang);
  const voicePhaseRef = useRef<VoicePhase>(voicePhase);
  voicePhaseRef.current = voicePhase;
  const voiceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const voiceSessionRef = useRef(0);
  const voiceSpeechEndRef = useRef<(() => void) | null>(null);
  // Gemini API key state: server-configured key or a key pasted by the user.
  const [serverHasKey, setServerHasKey] = useState(false);
  const [localHasKey, setLocalHasKey] = useState(false);
  const [showKeyPanel, setShowKeyPanel] = useState(false);
  const [keyInput, setKeyInput] = useState("");
  // Image attached to the next message — a textbook diagram, past-paper
  // question or handwritten note, read by the vision model.
  const [attachment, setAttachment] = useState<CyberDTImageAttachment | null>(null);
  const [attachBusy, setAttachBusy] = useState(false);
  const [attachError, setAttachError] = useState("");
  const attachInputRef = useRef<HTMLInputElement>(null);
  // Study plan mini-form. The date starts at the dashboard's default exam
  // target (2027-08-03) and is replaced by the student's saved exam date.
  const [showPlanPanel, setShowPlanPanel] = useState(false);
  const [planDate, setPlanDate] = useState("2027-08-03");
  const [planHours, setPlanHours] = useState("4");
  const [planWeak, setPlanWeak] = useState("");
  const [planDesc, setPlanDesc] = useState("");
  // The student's A/L subjects — plans cover ALL of them, not just Biology.
  const [planSubjects, setPlanSubjects] = useState("Biology, Chemistry, Physics");
  // True while the exam date shown is one auto-filled from the profile.
  const [planDateAuto, setPlanDateAuto] = useState(true);
  // Remembers whether the user typed their own values, so a late profile
  // fetch never overwrites what they entered.
  const planDateTouched = useRef(false);
  const planHoursTouched = useRef(false);

  // Chat history (persisted in localStorage so previous conversations survive
  // reloads and are shared between the /cyber-dt page and the floating widget).
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConvId, setCurrentConvId] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const initializedRef = useRef(false);

  // Ask the server once whether a Gemini key is configured there.
  useEffect(() => {
    fetch(CYBER_DT_API)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d && typeof d.serverKey === "boolean") setServerHasKey(d.serverKey);
      })
      .catch(() => {});
    setLocalHasKey(Boolean(getStoredGeminiKey()));
    // Opening the chat is a good moment to pull the account's latest
    // conversations, so a chat saved on another device shows up here.
    requestSync();
  }, []);

  // Pre-fill the study-plan form from the profile the student keeps on the
  // dashboard: their saved exam date and daily study target. Works offline
  // too — the offline fetch shim answers /api/profile from local storage.
  // When no exam date was saved (or the fetch fails), the dashboard countdown
  // still shows its default target (2027-08-03) — so the plan form keeps it.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/profile")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { examDate?: string; dailyTargetHours?: number } | null) => {
        if (cancelled || !d) return;
        const examDate = typeof d.examDate === "string" ? d.examDate.trim() : "";
        if (/^\d{4}-\d{2}-\d{2}$/.test(examDate) && !planDateTouched.current) {
          setPlanDate(examDate);
          setPlanDateAuto(true);
        }
        const hrs = Number(d.dailyTargetHours);
        if (Number.isFinite(hrs) && hrs >= 1 && hrs <= 12 && !planHoursTouched.current) {
          setPlanHours(String(Math.round(hrs)));
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const aiMode = serverHasKey || localHasKey;

  const greeting = useCallback((): ChatMessage => {
    const g = getCyberDTGreeting(locale as CyberDTLocale);
    return {
      id: nextId(),
      role: "ai",
      text: renderCyberDTResponse(g, locale as CyberDTLocale),
      emoji: g.emoji,
      time: nowTime(),
    };
  }, [locale]);

  // Seed the conversation: load the most recent saved conversation, otherwise
  // start fresh with the greeting.
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    let loaded = false;
    try {
      const raw = window.localStorage.getItem(CONV_STORAGE);
      if (raw) {
        const convs = JSON.parse(raw);
        if (Array.isArray(convs) && convs.length > 0) {
          setConversations(convs);
          setCurrentConvId(convs[0].id);
          setMessages(convs[0].messages);
          loaded = true;
        }
      }
    } catch {
      /* ignore corrupt storage */
    }
    if (!loaded) {
      setMessages([greeting()]);
    }
  }, [greeting]);

  // Pull conversations changed on another device (account sync) into the open
  // chat without a reload. Refs keep the listener stable so it never needs to be
  // re-registered while streaming.
  const syncViewRef = useRef({ currentConvId, isTyping, hasUserMessage: false });
  syncViewRef.current = {
    currentConvId,
    isTyping,
    hasUserMessage: messages.some((m) => m.role === "user"),
  };
  useEffect(() => {
    const onSynced = () => {
      try {
        const raw = window.localStorage.getItem(CONV_STORAGE);
        if (!raw) return;
        const convs = JSON.parse(raw) as Conversation[];
        if (!Array.isArray(convs) || convs.length === 0) return;
        const view = syncViewRef.current;
        setConversations(convs);
        const match = view.currentConvId
          ? convs.find((c) => c.id === view.currentConvId)
          : undefined;
        if (match) {
          if (!view.isTyping) setMessages(match.messages);
        } else if (!view.currentConvId && !view.hasUserMessage) {
          setCurrentConvId(convs[0].id);
          setMessages(convs[0].messages);
        }
      } catch {
        /* ignore corrupt storage */
      }
    };
    window.addEventListener("cyberdt:conversations-synced", onSynced);
    return () => window.removeEventListener("cyberdt:conversations-synced", onSynced);
  }, []);

  // Persist the current conversation whenever a turn finishes.
  useEffect(() => {
    if (isTyping) return;
    if (!messages.some((m) => m.role === "user")) return;
    const id = currentConvId || `conv-${Date.now()}`;
    if (!currentConvId) setCurrentConvId(id);
    const title = messages.find((m) => m.role === "user")?.text.slice(0, 40) || "New chat";
    setConversations((prev) => {
      // Skip a no-op write: when another device's copy was just applied the
      // messages are identical, and re-saving them would bump updatedAt and
      // bounce the conversation back and forth between devices forever.
      const existing = prev.find((c) => c.id === id);
      if (existing && JSON.stringify(existing.messages) === JSON.stringify(messages)) {
        return prev;
      }
      const conv: Conversation = { id, title, messages, updatedAt: Date.now() };
      const filtered = prev.filter((c) => c.id !== id);
      const next = [conv, ...filtered].slice(0, 20);
      try {
        window.localStorage.setItem(CONV_STORAGE, JSON.stringify(next));
      } catch {
        /* storage blocked */
      }
      return next;
    });
    requestSync();
  }, [messages, isTyping, currentConvId]);

  // Clear pending timers on unmount.
  useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach((timer) => clearTimeout(timer));
      timers.current = [];
      abortRef.current?.abort();
    };
  }, []);

  // Elapsed-seconds counter shown while the AI is thinking.
  useEffect(() => {
    if (!isTyping) return;
    setElapsed(0);
    const started = Date.now();
    const iv = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(iv);
  }, [isTyping]);

  // Auto-scroll to the newest message.
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, isTyping]);

  const send = async (raw: string, opts?: SendOptions): Promise<string> => {
    const image = opts?.image ?? null;
    // An image alone is a valid question ("explain this diagram").
    const text =
      raw.trim() ||
      (image
        ? locale === "si"
          ? "මේ පින්තූරයේ ඇති දේ NIE Resource Book එකට අනුව පැහැදිලි කරන්න."
          : "Explain this image according to the NIE resource book."
        : "");
    if (!text || isTyping) return "";

    const history =
      opts?.historyOverride ?? messages.slice(-10).map((m) => ({ role: m.role, text: m.text }));
    if (!opts?.noUserMessage) {
      setMessages((prev) => [...prev, { id: nextId(), role: "user", text, time: nowTime() }]);
    }
    setInput("");
    setIsTyping(true);

    // Reply in the SAME language as the question: Sinhala script, Singlish
    // (Sinhala in English letters) or English — never the app language.
    const replyLocale = detectCyberDTLocale(text, locale as CyberDTLocale);

    // AI placeholder that streams into view while the answer is written.
    const aiId = nextId();
    setMessages((prev) => [
      ...prev,
      { id: aiId, role: "ai", text: "", emoji: "✨", time: nowTime(), streaming: true },
    ]);

    const controller = new AbortController();
    abortRef.current = controller;

    // Throttled progressive rendering: update the message at most ~12×/s.
    let lastFlush = 0;
    let aiText = "";
    const onDelta = (full: string) => {
      aiText = full;
      const now = Date.now();
      if (now - lastFlush > 80) {
        lastFlush = now;
        setMessages((prev) => prev.map((m) => (m.id === aiId ? { ...m, text: full } : m)));
      }
    };
    const finishStreaming = (finalText?: string) => {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === aiId ? { ...m, text: finalText ?? m.text, streaming: false } : m,
        ),
      );
    };

    // 1) The real AI — Gemini through our own /api/cyber-dt route, so the
    //    API key stays on the server. The route returns the complete answer
    //    (Netlify cut long SSE streams mid-answer) and typeOutAnswer reveals
    //    it progressively, so it still looks like live typing.
    let answer: string | null = null;
    let serverFailed = false;
    // True when the route answered but the AI itself was busy (429/503) — the
    // device is online, so an offline knowledge-base answer would be wrong.
    let serverBusy = false;
    try {
      answer = await readAnswerStream(
        CYBER_DT_API,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: text,
            history,
            ...(image ? { image: { mimeType: image.mimeType, data: image.base64 } } : {}),
            ...(opts?.voice ? { mode: "voice" } : {}),
          }),
          signal: controller.signal,
        },
        (event) => {
          const delta = (event as { t?: string })?.t;
          return typeof delta === "string" ? delta : "";
        },
        onDelta,
        () => {
          serverBusy = true;
        },
        opts?.voice,
      );
      if (!answer) serverFailed = true;
    } catch {
      // Aborted by the user, offline, or route error.
      serverFailed = !controller.signal.aborted;
    }

    // 2) If the server couldn't answer, use the user's own pasted key
    //    directly from the browser (personal free key from Google AI Studio,
    //    which has its own separate quota).
    const storedKey = getStoredGeminiKey();
    if (!answer && serverFailed && storedKey && !controller.signal.aborted) {
      for (const model of cyberDTModelChain()) {
        try {
          answer = await readAnswerStream(
            geminiStreamEndpoint(model),
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "x-goog-api-key": storedKey,
              },
              body: JSON.stringify(
                buildGeminiRequestBody(
                  history,
                  text,
                  image ? { mimeType: image.mimeType, data: image.base64 } : undefined,
                  opts?.voice ? CYBER_DT_VOICE_PROMPT : undefined,
                ),
              ),
              signal: controller.signal,
            },
            (event) => extractGeminiStreamDelta(event),
            onDelta,
            undefined,
            opts?.voice,
          );
          if (answer) break;
          // Most likely rate-limited on this model — the loop tries the next.
        } catch {
          if (controller.signal.aborted) break;
          /* try the next model, then the offline knowledge base */
        }
      }
    }

    // The user pressed stop: keep whatever arrived, remove an empty bubble.
    if (controller.signal.aborted) {
      if (!aiText.trim()) {
        setMessages((prev) => prev.filter((m) => m.id !== aiId));
      } else {
        finishStreaming();
      }
      // Only clear the shared typing state if no newer send() has taken over,
      // otherwise stopping A after B started would unblock the composer mid-B.
      if (abortRef.current === controller) {
        setIsTyping(false);
        abortRef.current = null;
      }
      return aiText.trim();
    }

    // 3) No AI answer. If the AI itself was busy (the device is online), say so
    //    honestly and offer a retry — an offline answer would ignore the actual
    //    question. Otherwise (truly offline / no key) use the built-in
    //    knowledge base, replying in the detected language.
    let finalText: string;
    if (!answer && !aiText.trim()) {
      const aiResponse = serverBusy
        ? getCyberDTAIBusyResponse(replyLocale)
        : generateCyberDTResponse(text, replyLocale);
      const kbText = renderCyberDTResponse(aiResponse, replyLocale);
      // Minimum typing time so instant offline answers don't feel jarring.
      await new Promise<void>((resolve) => {
        const tm = setTimeout(resolve, 600);
        timers.current.push(tm);
      });
      finishStreaming(kbText);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === aiId
            ? { ...m, emoji: aiResponse.emoji, ...(serverBusy ? { busy: true } : {}) }
            : m,
        ),
      );
      finalText = kbText;
    } else {
      finalText = answer ?? aiText;
      finishStreaming(finalText);
    }

    setIsTyping(false);
    if (abortRef.current === controller) abortRef.current = null;
    return finalText;
  };

  // The voice loop runs outside React's render cycle, so it always calls the
  // newest send() through this ref (never a stale closure).
  sendRef.current = send;

  // Kick-off prompt from the feature panel (quiz, essay evaluator, flashcards,
  // organic pathways, study notes). Sent once after the chat has seeded, with
  // an empty history so an older saved conversation cannot steer the flow.
  const starterSent = useRef(false);
  useEffect(() => {
    if (!starter || starterSent.current) return;
    const id = setTimeout(() => {
      // Mark inside the timer: StrictMode clears this effect's timer on its
      // probe mount, and a flag set earlier would swallow the real send.
      starterSent.current = true;
      void send(starter, { historyOverride: [] });
    }, 400);
    return () => clearTimeout(id);
  }, [starter]);

  /** Re-asks the last question: drops the old answers and asks again. */
  const regenerate = () => {
    if (isTyping) return;
    let lastUserIdx = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "user") {
        lastUserIdx = i;
        break;
      }
    }
    if (lastUserIdx < 0) return;
    const text = messages[lastUserIdx].text;
    const hist = messages
      .slice(Math.max(0, lastUserIdx - 10), lastUserIdx)
      .map((m) => ({ role: m.role, text: m.text }));
    setMessages((prev) => prev.slice(0, lastUserIdx + 1));
    send(text, { noUserMessage: true, historyOverride: hist });
  };

  const copyMessage = async (m: ChatMessage) => {
    let ok = false;
    try {
      await navigator.clipboard.writeText(m.text);
      ok = true;
    } catch {
      // Clipboard API unavailable (e.g. Android WebView) — textarea fallback.
      try {
        const ta = document.createElement("textarea");
        ta.value = m.text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        ok = document.execCommand("copy");
        document.body.removeChild(ta);
      } catch {
        ok = false;
      }
    }
    if (ok) {
      setCopiedId(m.id);
      setTimeout(() => setCopiedId(null), 1500);
    }
  };

  const clearChat = () => {
    if (isTyping) abortRef.current?.abort();
    setMessages([greeting()]);
  };

  const newChat = () => {
    if (isTyping) abortRef.current?.abort();
    // Save the current conversation first.
    if (messages.some((m) => m.role === "user") && currentConvId) {
      const title = messages.find((m) => m.role === "user")?.text.slice(0, 40) || "New chat";
      const conv: Conversation = { id: currentConvId, title, messages, updatedAt: Date.now() };
      setConversations((prev) => {
        const filtered = prev.filter((c) => c.id !== currentConvId);
        const next = [conv, ...filtered].slice(0, 20);
        try {
          window.localStorage.setItem(CONV_STORAGE, JSON.stringify(next));
        } catch {
          /* ignore */
        }
        return next;
      });
    }
    setCurrentConvId(null);
    setMessages([greeting()]);
    requestSync();
  };

  const loadConversation = (id: string) => {
    const conv = conversations.find((c) => c.id === id);
    if (!conv) return;
    if (isTyping) abortRef.current?.abort();
    setCurrentConvId(conv.id);
    setMessages(conv.messages);
    setShowHistory(false);
  };

  const deleteConversation = (id: string) => {
    setConversations((prev) => {
      const next = prev.filter((c) => c.id !== id);
      try {
        window.localStorage.setItem(CONV_STORAGE, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
    // Record a tombstone so the union-merge in account sync does not resurrect
    // this conversation from the account's other device.
    try {
      const raw = window.localStorage.getItem(CONV_DELETED_KEY);
      const map = raw ? (JSON.parse(raw) as Record<string, number>) : {};
      map[id] = Date.now();
      window.localStorage.setItem(CONV_DELETED_KEY, JSON.stringify(map));
    } catch {
      /* ignore */
    }
    if (currentConvId === id) {
      setCurrentConvId(null);
      setMessages([greeting()]);
    }
    requestSync();
  };

  const stopGenerating = () => {
    abortRef.current?.abort();
    // Unblock the composer immediately; the aborted send() finishes cleaning up
    // its own bubble and must not clear a newer request's controller.
    setIsTyping(false);
  };

  const quickQuestions = QUICK_QUESTIONS[locale as CyberDTLocale] ?? QUICK_QUESTIONS.en;

  // --- Quick actions -------------------------------------------------------

  const replyLanguage = locale === "si" ? "Sinhala" : "English";
  const generateNote = async (
    topic: string,
    subject: "Biology" | "Physics" | "Chemistry" = noteSubject,
  ) => {
    const clean = topic.trim();
    setShowNotePanel(true);
    if (!clean) return;
    setNoteTopic(clean);
    setNoteLanguage(replyLanguage);
    setNoteGenerated(null);
    setNoteLoading(true);
    try {
      const res = await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: clean, language: replyLanguage, subject }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to generate note");
      }
      const note = await res.json();
      setNoteGenerated(note);
    } catch (err) {
      console.error("Note generation error:", err);
    } finally {
      setNoteLoading(false);
    }
  };

  const openPlanPanel = () => {
    setShowKeyPanel(false);
    setShowPlanPanel((v) => !v);
  };

  const generatePlan = () => {
    const today = new Date();
    const defaultExam = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);
    const examDate = planDate || defaultExam.toISOString().slice(0, 10);
    const weak = planWeak.trim() || "(not given — pick the units A/L students usually find hardest)";
    const desc = planDesc.trim();
    const subjects = planSubjects.trim() || "Biology";
    // Reply in the language the student wrote their notes in (Sinhala script,
    // Singlish or English); app language is only the fallback.
    const planLang = detectCyberDTLocale(
      `${planWeak} ${desc}`,
      locale === "si" ? "si" : "en",
    );
    const planReplyLanguage = planLang === "si" ? "Sinhala" : "English";
    const prompt = [
      `Create a personalized A/L revision study plan for me covering ALL of my subjects (${subjects}) — not only Biology.`,
      `- Today's date: ${today.toISOString().slice(0, 10)}`,
      `- My exam date: ${examDate}`,
      `- My subjects (give EVERY subject time): ${subjects}`,
      `- Hours I can study per day: ${planHours || "4"}`,
      `- Topics/units I find difficult: ${weak}`,
      desc
        ? `- My extra instructions (VERY IMPORTANT — the whole plan must follow these; where they conflict with the defaults above, these win): ${desc}`
        : "",
      "Make it a realistic DAILY ROUTINE plan as a markdown table (date/day, time block with real clock times like 06:30–08:00, subject + topic/unit, activity type — learning / revising / past papers).",
      "MUST include the full day: wake-up time, BREAKFAST, LUNCH, DINNER, short 10-15 min breaks between sessions, an evening rest/relax time and a sleep time — as their own rows in the table. Never put study across a meal or sleep time, and fit meals/rest around my school, class and tuition times.",
      "Split my daily hours across the subjects and rotate them so every subject appears several times a week. Include weekly goals, rest days, and 2-3 full past-paper days near the exam.",
      "If there is more than 2 months until my exam, first give a short phase-by-phase overview (what each month/week focuses on) and then the detailed day-wise table for the FINAL 4 weeks before the exam — do NOT try to list every single day of a very long period.",
      `Reply fully in ${planReplyLanguage}.`,
    ]
      .filter(Boolean)
      .join("\n");
    setShowPlanPanel(false);
    send(prompt);
  };

  const startQuiz = () => {
    send(
      `Start an interactive quiz for me. If I have not said which subject, ask me first whether I want Biology, Physics or Chemistry. Then ask ONE A/L multiple-choice question at a time from the official Sri Lankan A/L Resource Book (NIE) for that subject, with 4 options (A-D), and WAIT for my answer. After I reply, tell me if it is correct with a 1-2 line explanation, then ask the next. Ask 10 questions total with increasing difficulty, targeting the subtle definitions, diagrams and summary-box points in the resource book. Reply fully in ${replyLanguage}.`,
    );
  };

  const askPastPaper = () => {
    send(
      `Give me 3 G.C.E. A/L past-paper-style structured essay questions from the official Sri Lankan A/L Resource Book (NIE), and for each one list the key marking points (ලකුණු දෙන ප්‍රධාන ලක්ෂණ) that a full-mark answer must include. If I have not said which subject, ask me first whether I want Biology, Physics or Chemistry. Reply fully in ${replyLanguage}.`,
    );
  };

  const askTips = () => {
    send(
      `Give me your top 10 practical exam tips for the A/L Science papers (Biology, Physics, Chemistry) — time management, common mistakes to avoid, and how to write answers that score full marks under the Sri Lankan A/L marking scheme. Reply fully in ${replyLanguage}.`,
    );
  };

  // --- Key management -----------------------------------------------------

  const saveKey = () => {
    const key = keyInput.trim();
    try {
      if (key) {
        window.localStorage.setItem(GEMINI_KEY_STORAGE, key);
        setLocalHasKey(true);
      } else {
        window.localStorage.removeItem(GEMINI_KEY_STORAGE);
        setLocalHasKey(false);
      }
    } catch {
      /* storage blocked — the offline engine still works */
    }
    setKeyInput("");
    setShowKeyPanel(false);
  };

  const removeKey = () => {
    try {
      window.localStorage.removeItem(GEMINI_KEY_STORAGE);
    } catch {
      /* ignore */
    }
    setLocalHasKey(false);
    setKeyInput("");
  };

  const lastAiId = [...messages].reverse().find((m) => m.role === "ai")?.id;
  // Note generation state
  const [showNotePanel, setShowNotePanel] = useState(false);
  const [noteTopic, setNoteTopic] = useState("");
  const [noteInput, setNoteInput] = useState("");
  const [noteSubject, setNoteSubject] = useState<"Biology" | "Physics" | "Chemistry">("Biology");
  const [noteLoading, setNoteLoading] = useState(false);
  const [noteLanguage, setNoteLanguage] = useState<"English" | "Sinhala">("English");
  const [noteGenerated, setNoteGenerated] = useState<Note | null>(null);

  interface Note {
    id: string;
    title: string;
    content: string;
    createdAt: string;
  }

  const showWelcome = messages.length <= 1;

  // Auto-resize the composer textarea.
  const composerRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = composerRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 200) + "px";
  }, [input]);

  const handleComposerKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if ((input.trim() || attachment) && !isTyping) submitComposer();
    }
  };

  const onPickImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setAttachError("");
    setAttachBusy(true);
    try {
      setAttachment(await prepareCyberDTImage(file));
    } catch (err) {
      setAttachError(err instanceof Error ? err.message : "Could not read that image.");
    } finally {
      setAttachBusy(false);
    }
  };

  const submitComposer = () => {
    if (isTyping) return;
    if (!input.trim() && !attachment) return;
    const image = attachment;
    setAttachment(null);
    setAttachError("");
    void send(input, image ? { image } : undefined);
  };

  // ===== Live Voice Tutor engine ============================================
  // A hands-free loop: SpeechRecognition hears a sentence → send() asks the
  // same /api/cyber-dt route for a short spoken-style answer → speechSynthesis
  // reads it back → listening restarts. The mic is always stopped while the
  // answer is being written or spoken so the tutor never hears itself.

  const clearVoiceTimer = () => {
    if (voiceTimerRef.current) {
      clearTimeout(voiceTimerRef.current);
      voiceTimerRef.current = null;
    }
  };

  const stopRecognition = () => {
    const rec = recognitionRef.current;
    recognitionRef.current = null;
    if (!rec) return;
    try {
      rec.onresult = null;
      rec.onerror = null;
      rec.onend = null;
      rec.onstart = null;
      rec.abort();
    } catch {
      /* already stopped */
    }
  };

  // Stops the loop but keeps the overlay open so the reason stays readable.
  const failVoiceCall = (message: string) => {
    voiceActiveRef.current = false;
    clearVoiceTimer();
    stopRecognition();
    setVoiceError(message);
    setVoicePhase("error");
  };

  const speakText = (text: string) =>
    new Promise<void>((resolve) => {
      const synth = typeof window === "undefined" ? null : window.speechSynthesis;
      const spoken = speechFriendly(text);
      if (!synth || !spoken) {
        resolve();
        return;
      }
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        voiceSpeechEndRef.current = null;
        resolve();
      };
      voiceSpeechEndRef.current = finish;
      try {
        synth.cancel();
      } catch {
        /* ignore */
      }
      const utter = new SpeechSynthesisUtterance(spoken);
      const sinhala = /[\u0D80-\u0DFF]/.test(spoken);
      const voice = pickVoice(synth.getVoices(), sinhala);
      if (voice) utter.voice = voice;
      utter.lang = voice?.lang || (sinhala ? "si-LK" : "en-US");
      utter.rate = 1;
      utter.pitch = 1;
      utter.volume = 1;
      // A stuck utterance must never leave the call muted forever.
      const guard = setTimeout(finish, Math.min(90_000, 6_000 + spoken.length * 110));
      const clearGuard = () => clearTimeout(guard);
      utter.onend = () => {
        clearGuard();
        finish();
      };
      utter.onerror = () => {
        clearGuard();
        finish();
      };
      if (voiceActiveRef.current) setVoicePhase("speaking");
      try {
        synth.speak(utter);
      } catch {
        clearGuard();
        finish();
      }
    });

  const scheduleListen = (delay = 400) => {
    clearVoiceTimer();
    voiceTimerRef.current = setTimeout(() => {
      voiceTimerRef.current = null;
      if (!voiceActiveRef.current) return;
      if (voiceMutedRef.current) {
        setVoicePhase("listening");
        return;
      }
      beginListening();
    }, delay);
  };

  const handleUtterance = async (said: string) => {
    if (!voiceActiveRef.current) return;
    const session = voiceSessionRef.current;
    clearVoiceTimer();
    setVoiceError("");
    setVoiceHeard(said);
    setVoiceReply("");
    setVoicePhase("thinking");
    // History is read from the live chat so follow-up questions keep context.
    const history = messagesRef.current.slice(-10).map((m) => ({ role: m.role, text: m.text }));
    let reply = "";
    try {
      reply = await sendRef.current(said, { voice: true, historyOverride: history });
    } catch {
      reply = "";
    }
    // A newer call (or End Call) replaced this one while the answer was in flight.
    if (session !== voiceSessionRef.current || !voiceActiveRef.current) return;
    if (!reply.trim()) reply = "Sorry, I did not catch an answer to that. Could you say it again?";
    setVoiceReply(reply);
    await speakText(reply);
    if (session !== voiceSessionRef.current || !voiceActiveRef.current) return;
    setVoicePhase("listening");
    scheduleListen(300);
  };

  function beginListening() {
    if (!voiceActiveRef.current || voiceMutedRef.current) return;
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      setVoiceError("Live voice needs Chrome or Edge — this browser has no speech recognition.");
      setVoicePhase("error");
      return;
    }
    stopRecognition();
    const rec = new Ctor();
    rec.lang = voiceLangRef.current;
    rec.continuous = false;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    recognitionRef.current = rec;

    let finalText = "";
    let interimText = "";
    let handled = false;

    rec.onstart = () => {
      if (voiceActiveRef.current && !voiceMutedRef.current) setVoicePhase("listening");
    };
    rec.onresult = (event) => {
      interimText = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        const alt = result?.[0];
        if (!alt) continue;
        if (result.isFinal) finalText += `${alt.transcript} `;
        else interimText += alt.transcript;
      }
      const heard = `${finalText} ${interimText}`.trim();
      if (heard) setVoiceHeard(heard);
    };
    rec.onerror = (event) => {
      const code = event?.error || "";
      if (code === "not-allowed" || code === "service-not-allowed") {
        failVoiceCall("Microphone access was blocked. Allow the mic in the address bar, then start again.");
        return;
      }
      if (code === "audio-capture") {
        failVoiceCall(
          "The microphone could not be opened. Check Windows Settings → Privacy & security → Microphone (allow desktop apps) and that no other app is using the mic.",
        );
        return;
      }
      if (code === "network") {
        setVoiceError("Speech recognition needs an internet connection.");
      }
      if (code === "language-not-supported") {
        // Chrome has no Sinhala recogniser in every region — fall back to English
        // rather than leaving the call stuck.
        voiceLangRef.current = "en-US";
        setVoiceLang("en-US");
        setVoiceError("Sinhala speech recognition is not available here — switched to English.");
      }
      // "no-speech" / "aborted" are normal — onend restarts the loop.
    };
    rec.onend = () => {
      if (recognitionRef.current !== rec) return;
      recognitionRef.current = null;
      if (!voiceActiveRef.current) return;
      const said = `${finalText} ${interimText}`.trim();
      if (said && !handled) {
        handled = true;
        void handleUtterance(said);
      } else {
        scheduleListen(600);
      }
    };

    try {
      rec.start();
    } catch {
      // Chrome throws if start() races a previous stop().
      scheduleListen(900);
    }
  }

  const startVoiceCall = () => {
    voiceSessionRef.current += 1;
    voiceActiveRef.current = true;
    voiceMutedRef.current = false;
    setVoiceMuted(false);
    setVoiceHeard("");
    setVoiceReply("");
    setVoiceError("");
    setVoicePhase("connecting");
    setVoiceOpen(true);
    // Chrome loads the voice list asynchronously — warm it before the first reply.
    try {
      window.speechSynthesis?.getVoices();
    } catch {
      /* ignore */
    }
    if (!getSpeechRecognitionCtor()) {
      failVoiceCall("Live voice needs Chrome or Edge — this browser has no speech recognition.");
      return;
    }
    // Ask for the microphone up front. SpeechRecognition reports a blocked device as
    // the vague "no microphone found", so probing getUserMedia first lets the overlay
    // name the real cause (Windows privacy switch, busy device, missing mic).
    const md = typeof navigator === "undefined" ? undefined : navigator.mediaDevices;
    if (!md?.getUserMedia) {
      // Insecure context (plain http on a LAN address) — let recognition try anyway.
      scheduleListen(500);
      return;
    }
    void md
      .getUserMedia({ audio: true })
      .then((stream) => {
        try {
          stream.getTracks().forEach((track) => track.stop());
        } catch {
          /* ignore */
        }
        if (voiceActiveRef.current) scheduleListen(150);
      })
      .catch((err: unknown) => {
        const name = (err as { name?: string })?.name || "";
        if (name === "NotAllowedError" || name === "SecurityError") {
          failVoiceCall(
            "The microphone is blocked by Windows or the browser. Open Windows Settings → Privacy & security → Microphone and turn on “Let desktop apps access your microphone”, then try again.",
          );
        } else if (name === "NotFoundError" || name === "OverconstrainedError") {
          failVoiceCall("No microphone was found. Connect a microphone and try again.");
        } else if (name === "NotReadableError" || name === "AbortError") {
          failVoiceCall("The microphone is busy in another app. Close it (Zoom, OBS, a recorder) and try again.");
        } else {
          failVoiceCall(`Could not open the microphone${name ? ` (${name})` : ""}. Check Windows sound settings and try again.`);
        }
      });
  };

  function endVoiceCall() {
    voiceActiveRef.current = false;
    voiceSessionRef.current += 1;
    clearVoiceTimer();
    stopRecognition();
    try {
      voiceSpeechEndRef.current?.();
    } catch {
      /* ignore */
    }
    try {
      window.speechSynthesis?.cancel();
    } catch {
      /* ignore */
    }
    // Cancel an answer that is still being written for this call.
    if (abortRef.current) {
      try {
        abortRef.current.abort();
      } catch {
        /* ignore */
      }
    }
    setVoiceOpen(false);
    setVoicePhase("connecting");
    setVoiceHeard("");
    setVoiceReply("");
    setVoiceError("");
    setVoiceMuted(false);
    voiceMutedRef.current = false;
  }

  const toggleVoiceMute = () => {
    const next = !voiceMutedRef.current;
    voiceMutedRef.current = next;
    setVoiceMuted(next);
    if (next) {
      clearVoiceTimer();
      stopRecognition();
      if (voicePhaseRef.current !== "speaking" && voicePhaseRef.current !== "thinking") {
        setVoicePhase("listening");
      }
      return;
    }
    if (!voiceActiveRef.current) return;
    setVoiceError("");
    if (voicePhaseRef.current !== "speaking" && voicePhaseRef.current !== "thinking") {
      setVoicePhase("listening");
      scheduleListen(200);
    }
  };

  const changeVoiceLanguage = (lang: "en-US" | "si-LK") => {
    setVoiceLang(lang);
    voiceLangRef.current = lang;
    if (!voiceActiveRef.current || voicePhaseRef.current !== "listening") return;
    clearVoiceTimer();
    stopRecognition();
    scheduleListen(250);
  };

  // Tear the call down if the chat unmounts mid-conversation.
  useEffect(
    () => () => {
      voiceActiveRef.current = false;
      clearVoiceTimer();
      stopRecognition();
      try {
        window.speechSynthesis?.cancel();
      } catch {
        /* ignore */
      }
    },
    [],
  );

  const voiceStatus =
    voicePhase === "thinking"
      ? "Thinking..."
      : voicePhase === "speaking"
        ? "Speaking..."
        : voicePhase === "listening"
          ? voiceMuted
            ? "Muted"
            : "Listening..."
          : voicePhase === "error"
            ? "Microphone unavailable"
            : "Connecting...";

  return (
    <div className="flex h-screen w-full flex-col bg-[#080D18] text-[#F1F5F9]">
      {/* ===== Top bar ===== */}
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-white/5 bg-[#080D18]/80 px-4 py-3 backdrop-blur">
        <div className="flex min-w-0 items-center gap-3">
          <span className="relative grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-cyan-400/40 bg-cyan-500/10 text-cyan-300 shadow-[0_0_16px_rgba(34,211,238,0.35)]">
            <Bot className="h-5 w-5" />
            <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-[#080D18] bg-emerald-400" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-extrabold tracking-wide text-cyan-200">
              {t("cyberdt.name") || "Cyber DT AI"}
            </p>
            <p className="flex items-center gap-1.5 text-[0.65rem] text-cyan-400/70">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400 opacity-70" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-cyan-300" />
              </span>
              {t("cyberdt.responsesUnlimited") || "Online"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "hidden rounded-full px-2.5 py-1 text-[0.65rem] font-semibold sm:inline-block",
              aiMode
                ? "border border-fuchsia-400/40 bg-fuchsia-500/10 text-fuchsia-200"
                : "border border-cyan-400/30 bg-cyan-500/5 text-cyan-300",
            )}
          >
            {aiMode ? "✨ " + (t("cyberdt.aiMode") || "AI mode") : (t("cyberdt.offlineMode") || "Offline")}
          </span>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              title="Close"
              className="grid h-8 w-8 place-items-center rounded-xl border border-cyan-400/30 bg-cyan-500/5 text-cyan-300 transition hover:bg-cyan-500/15"
            >
              <span className="text-lg leading-none">×</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setShowPlanPanel(false);
              setShowKeyPanel((v) => !v);
            }}
            title={t("cyberdt.apiKey") || "API key"}
            className={cn(
              "grid h-8 w-8 place-items-center rounded-xl border transition",
              localHasKey || serverHasKey
                ? "border-fuchsia-400/50 bg-fuchsia-500/10 text-fuchsia-300"
                : "border-cyan-400/30 bg-cyan-500/5 text-cyan-300 hover:bg-cyan-500/15",
            )}
          >
            <KeyRound className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setShowHistory(true)}
            title="Chat history"
            className="grid h-8 w-8 place-items-center rounded-xl border border-cyan-400/30 bg-cyan-500/5 text-cyan-300 transition hover:bg-cyan-500/15"
          >
            <History className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={newChat}
            title="New chat"
            className="grid h-8 w-8 place-items-center rounded-xl border border-cyan-400/30 bg-cyan-500/5 text-cyan-300 transition hover:bg-cyan-500/15"
          >
            <Plus className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={clearChat}
            title={t("cyberdt.clearChat") || "Clear chat"}
            className="grid h-8 w-8 place-items-center rounded-xl border border-cyan-400/30 bg-cyan-500/5 text-cyan-300 transition hover:bg-cyan-500/15"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </header>

      {showKeyPanel && (
        <div className="shrink-0 space-y-2 border-b border-white/5 bg-cyan-500/5 px-4 py-3">
          <p className="text-xs leading-relaxed text-cyan-200/80">{t("cyberdt.apiKeyHint")}</p>
          <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-2">
            <Input
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              placeholder="AIza..."
              type="password"
              className="min-w-0 flex-1 rounded-xl border-cyan-500/20 bg-[#111B2D] text-sm text-cyan-50 placeholder:text-cyan-400/40 focus-visible:ring-cyan-400/60"
            />
            <Button type="button" size="sm" onClick={saveKey} className="rounded-xl bg-cyan-500/20 text-cyan-100 hover:bg-cyan-500/30">
              {t("cyberdt.apiKeySave") || "Save"}
            </Button>
            {localHasKey && (
              <Button type="button" size="sm" variant="outline" onClick={removeKey} className="rounded-xl border-rose-400/40 bg-rose-500/10 text-rose-200 hover:bg-rose-500/20">
                {t("cyberdt.apiKeyRemove") || "Remove"}
              </Button>
            )}
          </div>
        </div>
      )}

      {showPlanPanel && (
        <div className="shrink-0 space-y-3 border-b border-white/5 bg-violet-500/5 px-4 py-4">
          <p className="text-sm font-semibold text-violet-200">{t("cyberdt.planTitle") || "Personalized study plan"}</p>
          <div className="mx-auto grid max-w-3xl grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="space-y-1">
              <span className="text-xs text-cyan-300/80">
                {t("cyberdt.planExamDate") || "Exam date"}
                {planDateAuto && planDate && !planDateTouched.current ? (
                  <span className="ml-1 text-fuchsia-300/70">· {t("cyberdt.planAutoDate") || "from dashboard"}</span>
                ) : null}
              </span>
              <Input
                type="date"
                value={planDate}
                onChange={(e) => {
                  planDateTouched.current = true;
                  setPlanDateAuto(false);
                  setPlanDate(e.target.value);
                }}
                className="rounded-xl border-cyan-500/20 bg-[#111B2D] text-sm text-cyan-50 [color-scheme:dark] focus-visible:ring-cyan-400/60"
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-cyan-300/80">{t("cyberdt.planHours") || "Study hours per day"}</span>
              <Input
                type="number"
                min={1}
                max={12}
                value={planHours}
                onChange={(e) => {
                  planHoursTouched.current = true;
                  setPlanHours(e.target.value);
                }}
                className="rounded-xl border-cyan-500/20 bg-[#111B2D] text-sm text-cyan-50 [color-scheme:dark] focus-visible:ring-cyan-400/60"
              />
            </label>
            <label className="space-y-1 sm:col-span-2">
              <span className="text-xs text-cyan-300/80">{t("cyberdt.planSubjects") || "Subjects"}</span>
              <Input
                value={planSubjects}
                onChange={(e) => setPlanSubjects(e.target.value)}
                placeholder="Biology, Chemistry, Physics"
                className="rounded-xl border-cyan-500/20 bg-[#111B2D] text-sm text-cyan-50 placeholder:text-cyan-400/40 focus-visible:ring-cyan-400/60"
              />
            </label>
            <label className="space-y-1 sm:col-span-2">
              <span className="text-xs text-cyan-300/80">{t("cyberdt.planWeak") || "Difficult topics"}</span>
              <Input
                value={planWeak}
                onChange={(e) => setPlanWeak(e.target.value)}
                placeholder={t("cyberdt.planWeakPlaceholder") || "e.g. Genetics, Calculus"}
                className="rounded-xl border-cyan-500/20 bg-[#111B2D] text-sm text-cyan-50 placeholder:text-cyan-400/50 focus-visible:ring-cyan-400/60"
              />
            </label>
            <label className="space-y-1 sm:col-span-2">
              <span className="text-xs text-cyan-300/80">{t("cyberdt.planDesc") || "Extra instructions (VERY IMPORTANT)"}</span>
              <textarea
                value={planDesc}
                onChange={(e) => setPlanDesc(e.target.value)}
                placeholder={t("cyberdt.planDescPlaceholder") || "e.g. chemistry 6h, physics 6h video, bio unit 07 this week, start 4 AM"}
                rows={3}
                maxLength={600}
                className="w-full resize-y rounded-xl border border-cyan-500/20 bg-[#111B2D] px-3 py-2 text-sm text-cyan-50 outline-none placeholder:text-cyan-400/40 focus-visible:ring-2 focus-visible:ring-cyan-400/60"
              />
            </label>
          </div>
          <div className="mx-auto flex max-w-3xl items-center justify-end gap-2 pt-1">
            <Button type="button" size="sm" variant="outline" onClick={() => setShowPlanPanel(false)} className="rounded-xl border-cyan-400/30 bg-transparent text-cyan-300 hover:bg-cyan-500/10">
              {t("cyberdt.planCancel") || "Cancel"}
            </Button>
            <Button type="button" size="sm" onClick={generatePlan} disabled={isTyping} className="rounded-xl border border-violet-400/50 bg-violet-500/20 text-violet-100 hover:bg-violet-500/40 disabled:opacity-50">
              <ClipboardList className="mr-1 h-3.5 w-3.5" />
              {t("cyberdt.planGenerate") || "Generate plan"}
            </Button>
          </div>
        </div>
      )}

      {showNotePanel && (
        <div className="shrink-0 space-y-3 border-b border-white/5 bg-violet-500/5 px-4 py-4">
          <p className="text-sm font-semibold text-violet-200">{t("cyberdt.noteTitle") || "Study Note"}</p>
          <p className="text-xs text-cyan-300/80">{t("cyberdt.noteSubtitle") || "Generated AI study notes"}</p>
          <div className="mx-auto max-w-3xl space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Input
                value={noteInput}
                onChange={(e) => setNoteInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !noteLoading && noteInput.trim()) {
                    e.preventDefault();
                    void generateNote(noteInput);
                  }
                }}
                placeholder={t("cyberdt.noteTopicPlaceholder") || "e.g. Photosynthesis, Newton's laws, Alkenes"}
                className="min-w-0 flex-1 rounded-xl border-violet-500/20 bg-[#111B2D] text-sm text-violet-50 placeholder:text-violet-400/40 focus-visible:ring-violet-400/60"
              />
              <select
                value={noteSubject}
                onChange={(e) => setNoteSubject(e.target.value as "Biology" | "Physics" | "Chemistry")}
                className="rounded-xl border border-violet-500/20 bg-[#111B2D] px-2 py-2 text-sm text-violet-50 outline-none focus:ring-2 focus:ring-violet-400/60"
              >
                <option value="Biology">Biology</option>
                <option value="Physics">Physics</option>
                <option value="Chemistry">Chemistry</option>
              </select>
              <Button
                type="button"
                size="sm"
                onClick={() => void generateNote(noteInput)}
                disabled={noteLoading || !noteInput.trim()}
                className="rounded-xl border border-violet-400/50 bg-violet-500/20 text-violet-100 hover:bg-violet-500/40 disabled:opacity-50"
              >
                {noteLoading ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Lightbulb className="mr-1 h-3.5 w-3.5" />}
                {t("cyberdt.actionNote") || "Generate"}
              </Button>
            </div>
            {noteTopic && <p className="text-sm text-cyan-400/60">{noteTopic}</p>}
            {!noteGenerated && !noteLoading && !noteTopic && (
              <p className="text-sm text-cyan-400/60">{t("cyberdt.generateNotePrompt")}</p>
            )}
            {noteGenerated && (
              <pre className="max-h-64 overflow-auto rounded-xl border border-violet-400/30 bg-violet-500/10 p-3 text-sm text-violet-100">{noteGenerated.content}</pre>
            )}
          </div>
          <div className="mx-auto flex max-w-3xl items-center justify-end gap-2 pt-1">
            <Button type="button" size="sm" variant="outline" onClick={() => setShowNotePanel(false)} className="rounded-xl border-cyan-400/30 bg-transparent text-cyan-300 hover:bg-cyan-500/10">
              {t("cyberdt.close") || "Close"}
            </Button>
          </div>
        </div>
      )}

      {/* ===== Messages / Welcome ===== */}
      <div ref={listRef} className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-4 py-6">
          {showWelcome && (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <div className="relative mb-6 grid h-20 w-20 place-items-center rounded-3xl border border-cyan-400/30 bg-gradient-to-br from-cyan-500/20 to-violet-500/20 shadow-[0_0_40px_rgba(34,211,238,0.25)]">
                <Bot className="h-10 w-10 text-cyan-200" />
                <span className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full border-2 border-[#080D18] bg-emerald-400" />
              </div>
              <h2 className="text-2xl font-extrabold tracking-tight text-cyan-100">
                {t("cyberdt.welcomeTitle") || "How can I help you study today?"}
              </h2>
              <p className="mt-2 max-w-md text-sm text-cyan-300/70">
                {t("cyberdt.welcomeSubtitle") || "Ask me about any A/L Biology, Physics or Chemistry topic, generate study notes, create quizzes, or build a personalized study plan."}
              </p>
            </div>
          )}

          {messages.map((m) =>
            m.role === "user" ? (
              <div key={m.id} className="mb-6 flex justify-end">
                <div className="max-w-[80%] whitespace-pre-line rounded-2xl rounded-br-sm bg-cyan-500/15 px-4 py-2.5 text-sm text-cyan-50">
                  {m.text}
                </div>
              </div>
            ) : (
              <div key={m.id} className="mb-6 flex gap-3">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-violet-400/40 bg-violet-500/15 text-sm">
                  {m.emoji ?? "🤖"}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="whitespace-pre-line text-sm text-violet-50 [&_h4]:text-sm [&_h5]:text-sm [&_h6]:text-[0.92rem] [&_p]:text-sm">
                    {m.text ? (
                      <>
                        <CyberDTMessageBody text={m.text} />
                        {m.streaming && (
                          <span className="ml-0.5 inline-block h-4 w-[2px] animate-pulse rounded bg-cyan-300 align-middle" />
                        )}
                      </>
                    ) : (
                      <div className="flex items-center gap-1.5 py-1">
                        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-cyan-300 [animation-delay:-0.3s]" />
                        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-cyan-300 [animation-delay:-0.15s]" />
                        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-cyan-300" />
                        <span className="ml-2 text-xs text-cyan-400/80">
                          {t("cyberdt.thinking") || "Thinking"}
                          {elapsed > 0 ? ` · ${elapsed}s` : ""}
                        </span>
                      </div>
                    )}
                  </div>
                  {m.text && !m.streaming && m.busy && (
                    <button
                      type="button"
                      onClick={regenerate}
                      disabled={isTyping}
                      className="mt-2 flex items-center gap-1.5 rounded-lg bg-amber-500/90 px-3 py-1.5 text-xs font-bold text-[#2a1a00] transition hover:bg-amber-400 disabled:opacity-50"
                    >
                      <RefreshCw className={`h-3.5 w-3.5 ${isTyping ? "animate-spin" : ""}`} />
                      නැවත උත්සාහ කරන්න · Try again
                    </button>
                  )}
                  {m.text && !m.streaming && (
                    <div className="mt-2 flex items-center gap-3 text-[0.7rem] text-cyan-400/60">
                      {m.time && <span>{m.time}</span>}
                      <button type="button" onClick={() => copyMessage(m)} className="flex items-center gap-1 transition hover:text-cyan-300">
                        {copiedId === m.id ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                        {copiedId === m.id ? (t("cyberdt.copied") || "Copied") : (t("cyberdt.copy") || "Copy")}
                      </button>
                      {m.id === lastAiId && messages.length > 1 && !isTyping && (
                        <button type="button" onClick={regenerate} className="flex items-center gap-1 transition hover:text-violet-300">
                          <RefreshCw className="h-3 w-3" /> {t("cyberdt.regenerate") || "Regenerate"}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ),
          )}

          {isTyping && messages[messages.length - 1]?.role === "user" && (
            <div className="mb-6 flex gap-3">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-violet-400/40 bg-violet-500/15 text-sm">✨</span>
              <div className="flex items-center gap-1.5 py-1">
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-cyan-300 [animation-delay:-0.3s]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-cyan-300 [animation-delay:-0.15s]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-cyan-300" />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ===== Composer ===== */}
      <div className="shrink-0 border-t border-white/5 bg-[#080D18]/90 px-4 py-3 backdrop-blur">
        {/* Quick actions row — horizontal, right above the input, always a
            single row (scrolls sideways on narrow screens). */}
        <div className="mx-auto mb-2 flex max-w-3xl items-center gap-2 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <button type="button" onClick={openPlanPanel} disabled={isTyping} className="flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-violet-400/50 bg-violet-500/15 px-3 py-1 text-xs font-semibold text-violet-200 transition hover:border-violet-300 hover:bg-violet-500/25 disabled:opacity-50">
            <ClipboardList className="h-3.5 w-3.5" /> {t("cyberdt.actionPlan") || "Plan"}
          </button>
          <button type="button" onClick={startQuiz} disabled={isTyping} className="flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-violet-400/50 bg-violet-500/15 px-3 py-1 text-xs font-semibold text-violet-200 transition hover:border-violet-300 hover:bg-violet-500/25 disabled:opacity-50">
            <Target className="h-3.5 w-3.5" /> {t("cyberdt.actionQuiz") || "Quiz"}
          </button>
          <button type="button" onClick={askPastPaper} disabled={isTyping} className="flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-fuchsia-400/40 bg-fuchsia-500/10 px-3 py-1 text-xs font-semibold text-fuchsia-200 transition hover:border-fuchsia-300 hover:bg-fuchsia-500/20 disabled:opacity-50">
            <FileText className="h-3.5 w-3.5" /> {t("cyberdt.actionPaper") || "Past papers"}
          </button>
          <button type="button" onClick={askTips} disabled={isTyping} className="flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-fuchsia-400/40 bg-fuchsia-500/10 px-3 py-1 text-xs font-semibold text-fuchsia-200 transition hover:border-fuchsia-300 hover:bg-fuchsia-500/20 disabled:opacity-50">
            <Lightbulb className="h-3.5 w-3.5" /> {t("cyberdt.actionTips") || "Tips"}
          </button>
          <button type="button" onClick={() => generateNote(t("cyberdt.quickAsk"))} disabled={isTyping} className="flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-violet-400/50 bg-violet-500/15 px-3 py-1 text-xs font-semibold text-violet-200 transition hover:border-violet-300 hover:bg-violet-500/25 disabled:opacity-50">
            <Lightbulb className="h-3.5 w-3.5" /> {t("cyberdt.actionNote") || "Generate Note"}
          </button>
        </div>
        {attachment && (
          <div className="mx-auto mb-2 flex max-w-3xl items-center gap-3 rounded-xl border border-cyan-500/30 bg-[#111B2D] p-2">
            <div
              role="img"
              aria-label="Attached image preview"
              className="h-12 w-12 shrink-0 rounded-lg border border-cyan-500/30 bg-cover bg-center"
              style={{ backgroundImage: `url(${attachment.dataUrl})` }}
            />
            <span className="min-w-0 flex-1 truncate text-xs text-cyan-300/80">{attachment.name}</span>
            <button
              type="button"
              onClick={() => setAttachment(null)}
              title="Remove image"
              className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-cyan-300/80 transition hover:bg-rose-500/15 hover:text-rose-200"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
        {attachError && (
          <p className="mx-auto mb-2 max-w-3xl text-xs text-rose-300">{attachError}</p>
        )}
        <form onSubmit={(e) => { e.preventDefault(); submitComposer(); }} className="mx-auto flex max-w-3xl items-end gap-2 rounded-2xl border border-cyan-500/20 bg-[#111B2D] p-2">
          <button
            type="button"
            onClick={startVoiceCall}
            disabled={isTyping}
            title="Start the Live Voice Tutor"
            className="flex h-9 shrink-0 items-center gap-1.5 rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-2.5 text-xs font-semibold text-emerald-300 transition hover:bg-emerald-500/20 hover:text-emerald-200 disabled:opacity-40 disabled:hover:bg-emerald-500/10"
          >
            <Phone className="h-4 w-4" />
            <span className="hidden sm:inline">Live Voice</span>
          </button>
          <button
            type="button"
            onClick={() => attachInputRef.current?.click()}
            disabled={isTyping || attachBusy}
            title="Attach an image (PNG or JPEG)"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-cyan-300/80 transition hover:bg-cyan-500/10 hover:text-cyan-200 disabled:opacity-40"
          >
            {attachBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
          </button>
          <input
            ref={attachInputRef}
            type="file"
            accept={CYBER_DT_IMAGE_ACCEPT}
            className="hidden"
            onChange={onPickImage}
          />
          <textarea
            ref={composerRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleComposerKeyDown}
            placeholder={t("cyberdt.composerPlaceholder") || "Message Cyber DT AI..."}
            disabled={isTyping}
            rows={1}
            className="flex-1 resize-none bg-transparent px-2 py-1.5 text-sm text-cyan-50 placeholder:text-cyan-400/50 focus:outline-none disabled:opacity-50"
          />
          {isTyping ? (
            <button
              type="button"
              onClick={stopGenerating}
              title={t("cyberdt.stop") || "Stop"}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-rose-500/20 text-rose-200 transition hover:bg-rose-500/30"
            >
              <Square className="h-4 w-4" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={!input.trim() && !attachment}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-cyan-500/80 text-[#080D18] transition hover:bg-cyan-400 disabled:opacity-40 disabled:hover:bg-cyan-500/80"
            >
              <Send className="h-4 w-4" />
            </button>
          )}
        </form>
        <p className="mt-2 text-center text-[0.65rem] text-cyan-400/50">
          {t("cyberdt.disclaimer") || "Cyber DT AI can make mistakes. Verify important information."}
        </p>
      </div>

      {/* ===== Chat history modal ===== */}
      {showHistory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setShowHistory(false)}>
          <div className="w-full max-w-md rounded-2xl border border-cyan-500/30 bg-[#0D1424] p-4 shadow-[0_0_40px_rgba(34,211,238,0.2)]" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-bold text-cyan-200">Chat history</h3>
              <button type="button" onClick={() => setShowHistory(false)} className="grid h-7 w-7 place-items-center rounded-lg text-cyan-400/70 hover:bg-cyan-500/10 hover:text-cyan-300">
                <span className="text-lg leading-none">×</span>
              </button>
            </div>
            <div className="mb-3 flex items-center gap-2">
              <button type="button" onClick={newChat} className="flex items-center gap-1.5 rounded-xl border border-violet-400/50 bg-violet-500/15 px-3 py-1.5 text-xs font-semibold text-violet-200 transition hover:bg-violet-500/25">
                <Plus className="h-3.5 w-3.5" /> New chat
              </button>
              <span className="text-[0.65rem] text-cyan-400/50">{conversations.length} saved</span>
            </div>
            <div className="max-h-80 space-y-1.5 overflow-y-auto">
              {conversations.length === 0 && (
                <p className="py-6 text-center text-xs text-cyan-400/60">No saved conversations yet.</p>
              )}
              {conversations.map((c) => (
                <div
                  key={c.id}
                  className={cn(
                    "flex items-center gap-2 rounded-xl border px-3 py-2 text-sm transition",
                    c.id === currentConvId
                      ? "border-cyan-400/50 bg-cyan-500/15 text-cyan-100"
                      : "border-cyan-500/20 bg-[#111B2D] text-cyan-200 hover:border-cyan-400/40",
                  )}
                >
                  <button type="button" onClick={() => loadConversation(c.id)} className="min-w-0 flex-1 truncate text-left">
                    {c.title}
                  </button>
                  <span className="shrink-0 text-[0.6rem] text-cyan-500/60">
                    {new Date(c.updatedAt).toLocaleDateString()}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteConversation(c.id);
                    }}
                    title="Delete"
                    className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-rose-300/70 transition hover:bg-rose-500/15 hover:text-rose-200"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ===== Live Voice Tutor overlay ===== */}
      {voiceOpen && (
        <div className="fixed inset-0 z-[80] flex flex-col overflow-hidden bg-[#05080F]/95 backdrop-blur-xl">
          <style>{`
            @keyframes dtvBar { 0%,100% { transform: scaleY(.25); opacity:.4 } 50% { transform: scaleY(1); opacity:1 } }
            @keyframes dtvHalo { 0%,100% { transform: scale(1); opacity:.3 } 50% { transform: scale(1.16); opacity:.7 } }
            @keyframes dtvSpin { to { transform: rotate(360deg) } }
            .dtv-bar { animation: dtvBar 1s ease-in-out infinite; transform-origin: center; }
            .dtv-halo { animation: dtvHalo 2.8s ease-in-out infinite; }
            .dtv-ring { animation: dtvSpin 12s linear infinite; }
          `}</style>

          {/* neon bloom */}
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute left-1/2 top-[26%] h-80 w-80 -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-500/20 blur-[110px]" />
            <div className="absolute bottom-[-6rem] right-[-4rem] h-72 w-72 rounded-full bg-violet-600/25 blur-[100px]" />
            <div className="absolute bottom-[-8rem] left-[-4rem] h-72 w-72 rounded-full bg-emerald-500/15 blur-[100px]" />
          </div>

          <div className="relative mx-auto flex h-full w-full max-w-lg flex-col px-5 py-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="grid h-9 w-9 place-items-center rounded-xl border border-cyan-400/40 bg-cyan-500/10 text-cyan-300 shadow-[0_0_18px_rgba(34,211,238,0.35)]">
                  <AudioLines className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-[0.58rem] uppercase tracking-[0.3em] text-cyan-400/70">Live</p>
                  <p className="text-sm font-extrabold tracking-wide text-cyan-100">Cyber DT Live Voice</p>
                </div>
              </div>
              <button
                type="button"
                onClick={endVoiceCall}
                title="End call"
                className="grid h-8 w-8 place-items-center rounded-lg text-cyan-400/60 transition hover:bg-rose-500/15 hover:text-rose-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex flex-1 flex-col items-center justify-center gap-5 py-4">
              {/* mic pulse */}
              <div className="relative grid h-40 w-40 place-items-center">
                <span
                  className={cn(
                    "absolute inset-0 rounded-full border border-cyan-400/20",
                    voicePhase !== "error" && !voiceMuted && "dtv-halo",
                  )}
                />
                <span className="dtv-ring absolute inset-3 rounded-full border border-dashed border-cyan-400/15" />
                <span
                  className={cn(
                    "absolute inset-7 rounded-full blur-xl transition-colors",
                    voicePhase === "speaking"
                      ? "bg-violet-500/40"
                      : voicePhase === "thinking"
                        ? "bg-amber-400/30"
                        : voicePhase === "error"
                          ? "bg-rose-500/30"
                          : "bg-cyan-400/30",
                  )}
                />
                <span
                  className={cn(
                    "relative grid h-24 w-24 place-items-center rounded-full border text-cyan-100 transition-colors",
                    voiceMuted
                      ? "border-rose-400/40 bg-rose-500/10 text-rose-200"
                      : voicePhase === "speaking"
                        ? "border-violet-400/50 bg-violet-500/15 shadow-[0_0_40px_rgba(167,139,250,0.4)]"
                        : voicePhase === "thinking"
                          ? "border-amber-300/50 bg-amber-400/10 shadow-[0_0_40px_rgba(251,191,36,0.35)]"
                          : "border-cyan-400/50 bg-cyan-500/10 shadow-[0_0_40px_rgba(34,211,238,0.4)]",
                  )}
                >
                  {voiceMuted ? <MicOff className="h-9 w-9" /> : <Mic className="h-9 w-9" />}
                </span>
              </div>

              {/* waveform */}
              <div className="flex h-14 items-center gap-1.5">
                {Array.from({ length: 9 }).map((_, i) => (
                  <span
                    key={i}
                    className={cn(
                      "dtv-bar w-1.5 rounded-full bg-gradient-to-t from-cyan-500 to-violet-400",
                      (voiceMuted || voicePhase === "error") && "opacity-30",
                    )}
                    style={{
                      height: `${18 + (i % 4) * 10}px`,
                      animationDelay: `${i * 0.09}s`,
                      animationDuration:
                        voicePhase === "speaking" ? "0.55s" : voicePhase === "thinking" ? "1.7s" : "0.95s",
                      animationPlayState: voiceMuted || voicePhase === "error" ? "paused" : "running",
                    }}
                  />
                ))}
              </div>

              <p
                className={cn(
                  "text-lg font-bold tracking-wide",
                  voicePhase === "error"
                    ? "text-rose-300"
                    : voicePhase === "thinking"
                      ? "text-amber-200"
                      : voicePhase === "speaking"
                        ? "text-violet-200"
                        : "text-cyan-200",
                )}
              >
                {voiceStatus}
              </p>

              {/* language toggle */}
              <div className="flex items-center gap-1 rounded-full border border-white/10 bg-white/5 p-1">
                {(["en-US", "si-LK"] as const).map((lang) => (
                  <button
                    key={lang}
                    type="button"
                    onClick={() => changeVoiceLanguage(lang)}
                    className={cn(
                      "rounded-full px-3 py-1 text-xs font-semibold transition",
                      voiceLang === lang
                        ? "bg-cyan-500/90 text-[#05080F]"
                        : "text-cyan-300/70 hover:text-cyan-100",
                    )}
                  >
                    {lang === "en-US" ? "English" : "සිංහල"}
                  </button>
                ))}
              </div>
            </div>

            {/* captions */}
            <div className="w-full space-y-2">
              {voiceError && (
                <p className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
                  {voiceError}
                </p>
              )}
              <div className="rounded-2xl border border-white/5 bg-white/[0.03] px-3 py-2.5">
                <p className="mb-0.5 text-[0.58rem] font-semibold uppercase tracking-[0.2em] text-cyan-400/60">
                  You
                </p>
                <p className="max-h-20 overflow-y-auto text-sm leading-relaxed text-cyan-100/90">
                  {voiceHeard || "Say something to begin…"}
                </p>
              </div>
              <div className="rounded-2xl border border-cyan-400/20 bg-cyan-500/[0.06] px-3 py-2.5">
                <p className="mb-0.5 text-[0.58rem] font-semibold uppercase tracking-[0.2em] text-cyan-400/70">
                  Cyber DT
                </p>
                <p className="max-h-28 overflow-y-auto text-sm leading-relaxed text-cyan-50">
                  {voiceReply || "I'll answer out loud here."}
                </p>
              </div>
            </div>

            <div className="mt-4 flex w-full items-center justify-center gap-3">
              {voicePhase === "error" ? (
                <button
                  type="button"
                  onClick={startVoiceCall}
                  className="flex h-12 items-center gap-2 rounded-2xl border border-cyan-400/40 bg-cyan-500/15 px-5 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-500/25"
                >
                  <RefreshCw className="h-4 w-4" />
                  Try again
                </button>
              ) : (
                <button
                  type="button"
                  onClick={toggleVoiceMute}
                  className={cn(
                    "flex h-12 items-center gap-2 rounded-2xl border px-5 text-sm font-semibold transition",
                    voiceMuted
                      ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25"
                      : "border-white/10 bg-white/5 text-cyan-200 hover:bg-white/10",
                  )}
                >
                  {voiceMuted ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
                  {voiceMuted ? "Unmute" : "Mute"}
                </button>
              )}
              <button
                type="button"
                onClick={endVoiceCall}
                className="flex h-12 items-center gap-2 rounded-2xl border border-rose-400/40 bg-rose-500/15 px-5 text-sm font-semibold text-rose-200 transition hover:bg-rose-500/25"
              >
                <PhoneOff className="h-4 w-4" />
                End Call
              </button>
            </div>

            <p className="mt-3 text-center text-[0.62rem] text-cyan-400/50">
              Speak naturally — the tutor replies aloud and keeps listening.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}