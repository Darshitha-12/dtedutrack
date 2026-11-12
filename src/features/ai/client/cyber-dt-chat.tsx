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
  Paperclip,
  X,
  Image as ImageIcon,
  History,
  Plus,
} from "lucide-react";
import { useT, useLanguage } from "@/lib/language-context";
import {
  generateCyberDTResponse,
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
  type CyberDTImage,
} from "@/features/ai/cyber-dt-shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { CyberDTMessageBody } from "@/features/ai/client/cyber-dt-markdown";

interface ChatMessage {
  id: string;
  role: "user" | "ai";
  text: string;
  emoji?: string;
  time?: string;
  /** True while the answer is still streaming in. */
  streaming?: boolean;
  /** Images attached to this message (user uploads). */
  images?: { id: string; preview: string }[];
}

interface Conversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  updatedAt: number;
}

const CONV_STORAGE = "cyberdt_conversations";

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

/** Compresses an image file to a max 1024px JPEG for Gemini (keeps payload small). */
async function compressImage(file: File): Promise<{ id: string; preview: string; mimeType: string; data: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const MAX = 1024;
        let w = img.width;
        let h = img.height;
        if (w > MAX || h > MAX) {
          if (w > h) {
            h = Math.round((h * MAX) / w);
            w = MAX;
          } else {
            w = Math.round((w * MAX) / h);
            h = MAX;
          }
        }
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("canvas unavailable"));
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        const preview = canvas.toDataURL("image/jpeg", 0.82);
        const data = preview.split(",")[1] || "";
        resolve({ id: `img-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, preview, mimeType: "image/jpeg", data });
      };
      img.onerror = () => reject(new Error("image load failed"));
      img.src = e.target?.result as string;
    };
    reader.onerror = () => reject(new Error("file read failed"));
    reader.readAsDataURL(file);
  });
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
): Promise<void> {
  if (full.length <= 480) {
    onDelta(full);
    return;
  }
  const CHUNK = 30; // characters per tick
  const TICK = 12; // ms per tick — ~2,500 chars/s
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
    await typeOutAnswer(full, onDelta, init.signal);
    return full;
  }
  return null;
}

export function CyberDTChat({ onClose }: { onClose?: () => void } = {}) {
  const t = useT();
  const { locale } = useLanguage();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [attachedImages, setAttachedImages] = useState<{ id: string; preview: string; mimeType: string; data: string }[]>([]);
  // Image generation state
  const [showImageGen, setShowImageGen] = useState(false);
  const [imageGenPrompt, setImageGenPrompt] = useState("");
  const [imageGenLoading, setImageGenLoading] = useState(false);
  // Canvas / whiteboard state
  const [showCanvas, setShowCanvas] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const timers = useRef<NodeJS.Timeout[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Canvas/whiteboard refs
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [canvasColor, setCanvasColor] = useState("#22d3ee");
  const [canvasSize, setCanvasSize] = useState(3);
  const [canvasTool, setCanvasTool] = useState<"pen" | "eraser">("pen");
  const isDrawing = useRef(false);
  const lastPos = useRef<{ x: number; y: number } | null>(null);
  // Gemini API key state: server-configured key or a key pasted by the user.
  const [serverHasKey, setServerHasKey] = useState(false);
  const [localHasKey, setLocalHasKey] = useState(false);
  const [showKeyPanel, setShowKeyPanel] = useState(false);
  const [keyInput, setKeyInput] = useState("");
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

  // Persist the current conversation whenever a turn finishes.
  useEffect(() => {
    if (isTyping) return;
    if (!messages.some((m) => m.role === "user")) return;
    const id = currentConvId || `conv-${Date.now()}`;
    if (!currentConvId) setCurrentConvId(id);
    const title = messages.find((m) => m.role === "user")?.text.slice(0, 40) || "New chat";
    const conv: Conversation = { id, title, messages, updatedAt: Date.now() };
    setConversations((prev) => {
      const filtered = prev.filter((c) => c.id !== id);
      const next = [conv, ...filtered].slice(0, 20);
      try {
        window.localStorage.setItem(CONV_STORAGE, JSON.stringify(next));
      } catch {
        /* storage blocked */
      }
      return next;
    });
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

  const send = async (
    raw: string,
    opts?: { noUserMessage?: boolean; historyOverride?: Array<{ role: string; text: string }>; images?: { id: string; preview: string; mimeType: string; data: string }[] },
  ) => {
    const text = raw.trim();
    const imgs = opts?.images ?? attachedImages;
    if (!text && imgs.length === 0) return;
    if (isTyping) return;

    const history =
      opts?.historyOverride ?? messages.slice(-10).map((m) => ({ role: m.role, text: m.text }));
    if (!opts?.noUserMessage) {
      setMessages((prev) => [...prev, { id: nextId(), role: "user", text, time: nowTime(), images: imgs.length > 0 ? imgs.map((i) => ({ id: i.id, preview: i.preview })) : undefined }]);
    }
    setInput("");
    setAttachedImages([]);
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
    try {
      answer = await readAnswerStream(
        CYBER_DT_API,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: text, history, images: imgs.map((i) => ({ mimeType: i.mimeType, data: i.data })) }),
          signal: controller.signal,
        },
        (event) => {
          const delta = (event as { t?: string })?.t;
          return typeof delta === "string" ? delta : "";
        },
        onDelta,
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
              body: JSON.stringify(buildGeminiRequestBody(history, text, imgs.map((i) => ({ mimeType: i.mimeType, data: i.data })))),
              signal: controller.signal,
            },
            (event) => extractGeminiStreamDelta(event),
            onDelta,
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
      setIsTyping(false);
      abortRef.current = null;
      return;
    }

    // 3) Offline fallback: the built-in knowledge base, replying in the
    //    detected language (works with zero internet or no API key).
    if (!answer && !aiText.trim()) {
      if (imgs.length > 0) {
        const kbText =
          "🖼️ I can't analyze images offline — the built-in knowledge base only answers text questions. " +
          "To get an answer about this image, please either:\n" +
          "• Try again in a few minutes (the AI service may be busy), or\n" +
          "• Paste your own free Google AI Studio key (🔑 button) — it has its own separate quota and usually works even when the shared key is busy.\n\n" +
          "In the meantime, you can ask me about any A/L Biology topic in text and I'll give you a full exam-style answer.";
        finishStreaming(kbText);
        setMessages((prev) => prev.map((m) => (m.id === aiId ? { ...m, emoji: "🖼️" } : m)));
      } else {
        const aiResponse = generateCyberDTResponse(text, replyLocale);
        const kbText = renderCyberDTResponse(aiResponse, replyLocale);
        // Minimum typing time so instant offline answers don't feel jarring.
        await new Promise<void>((resolve) => {
          const tm = setTimeout(resolve, 600);
          timers.current.push(tm);
        });
        finishStreaming(kbText);
        setMessages((prev) =>
          prev.map((m) => (m.id === aiId ? { ...m, emoji: aiResponse.emoji } : m)),
        );
      }
    } else {
      finishStreaming(answer ?? aiText);
    }

    setIsTyping(false);
    abortRef.current = null;
  };

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
    if (currentConvId === id) {
      setCurrentConvId(null);
      setMessages([greeting()]);
    }
  };

  const stopGenerating = () => abortRef.current?.abort();

  const generateImage = async () => {
    const prompt = imageGenPrompt.trim();
    if (!prompt) return;
    setImageGenLoading(true);
    try {
      const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=512&height=512&nologo=true`;
      // Preload the image to verify it loads
      await new Promise<void>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("Image generation failed"));
        img.src = url;
      });
      // Add as an AI message with the image
      const aiId = nextId();
      setMessages((prev) => [
        ...prev,
        { id: aiId, role: "ai", text: `🖼️ Generated image for: "${prompt}"`, emoji: "🎨", time: nowTime() },
      ]);
      // Insert the image URL into the message text as markdown
      setMessages((prev) =>
        prev.map((m) =>
          m.id === aiId
            ? { ...m, text: `🖼️ Generated image for: "${prompt}"\n\n![Generated image](${url})` }
            : m,
        ),
      );
      setShowImageGen(false);
      setImageGenPrompt("");
    } catch (e) {
      console.error("Image gen failed:", e);
    } finally {
      setImageGenLoading(false);
    }
  };

  const handleImageFiles = async (files: FileList | File[] | null) => {
    if (!files) return;
    const arr = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (arr.length === 0) return;
    try {
      const compressed = await Promise.all(arr.map(compressImage));
      setAttachedImages((prev) => [...prev, ...compressed].slice(0, 4));
    } catch (e) {
      console.error("Image compress failed:", e);
    }
  };

  // Canvas drawing helpers
  const getCanvasPos = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const clientX = "touches" in e ? e.touches[0]?.clientX ?? 0 : (e as React.MouseEvent).clientX;
    const clientY = "touches" in e ? e.touches[0]?.clientY ?? 0 : (e as React.MouseEvent).clientY;
    return { x: clientX - rect.left, y: clientY - rect.top };
  };

  const startDraw = (e: React.MouseEvent | React.TouchEvent) => {
    isDrawing.current = true;
    lastPos.current = getCanvasPos(e);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing.current || !lastPos.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const pos = getCanvasPos(e);
    if (!pos) return;
    ctx.beginPath();
    ctx.moveTo(lastPos.current.x, lastPos.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.strokeStyle = canvasTool === "eraser" ? "#080D18" : canvasColor;
    ctx.lineWidth = canvasTool === "eraser" ? canvasSize * 4 : canvasSize;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();
    lastPos.current = pos;
  };

  const endDraw = () => {
    isDrawing.current = false;
    lastPos.current = null;
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  const downloadCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement("a");
    link.download = "canvas.png";
    link.href = canvas.toDataURL("image/png");
    link.click();
  };

  // Paste images from clipboard.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (!e.clipboardData) return;
      const items = e.clipboardData.items;
      const files: File[] = [];
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        if (it.kind === "file" && it.type.startsWith("image/")) {
          const f = it.getAsFile();
          if (f) files.push(f);
        }
      }
      if (files.length > 0) {
        e.preventDefault();
        void handleImageFiles(files);
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);

  const quickQuestions = QUICK_QUESTIONS[locale as CyberDTLocale] ?? QUICK_QUESTIONS.en;

  // --- Quick actions -------------------------------------------------------

  const replyLanguage = locale === "si" ? "Sinhala" : "English";
  const generateNote = async (topic: string) => {
    setNoteTopic(topic);
    setNoteLanguage(replyLanguage);
    setNoteGenerated(null);
    setShowNotePanel(true);
    try {
      const res = await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, language: replyLanguage }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to generate note");
      }
      const note = await res.json();
      setNoteGenerated(note);
    } catch (err) {
      console.error("Note generation error:", err);
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
      "Make it a realistic plan as a markdown table (date, subject + topic/unit, activity type — learning / revising / past papers — and time blocks). Split my daily hours across the subjects and rotate them so every subject appears several times a week. Include weekly goals, rest days, and 2-3 full past-paper days near the exam.",
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
      `Start an interactive quiz for me. Ask ONE A/L Biology multiple-choice question at a time with 4 options (A-D) and WAIT for my answer. After I reply, tell me if it is correct with a 1-2 line explanation, then ask the next. Ask 10 questions total with increasing difficulty. Reply fully in ${replyLanguage}.`,
    );
  };

  const askPastPaper = () => {
    send(
      `Give me 3 G.C.E. A/L Biology past-paper-style structured essay questions, and for each one list the key marking points a full-mark answer must include. Reply fully in ${replyLanguage}.`,
    );
  };

  const askTips = () => {
    send(
      `Give me your top 10 practical exam tips for the A/L Biology paper — time management, common mistakes to avoid, and how to write answers that score full marks. Reply fully in ${replyLanguage}.`,
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
  const [noteLanguage, setNoteLanguage] = useState<"English" | "Sinhala">("English");
  const [noteGenerated, setNoteGenerated] = useState<Note | null>(null);

  interface Note {
    id: string;
    title: string;
    content: string;
    createdAt: string;
  }

  const showWelcome = messages.length <= 1;

  const suggestionCards = [
    {
      emoji: "🔬",
      title: t("cyberdt.actionExplain") || "Explain a topic",
      desc: t("cyberdt.actionExplainDesc") || "Get a full exam-style explanation",
      prompt: QUICK_QUESTIONS[locale as CyberDTLocale]?.[0] ?? "Explain photosynthesis",
    },
    {
      emoji: "📝",
      title: t("cyberdt.actionNote") || "Generate study notes",
      desc: t("cyberdt.actionNoteDesc") || "AI-written revision notes",
      prompt: t("cyberdt.quickAsk") || "Explain photosynthesis",
    },
    {
      emoji: "🎯",
      title: t("cyberdt.actionQuiz") || "Create a quiz",
      desc: t("cyberdt.actionQuizDesc") || "Test yourself with MCQs",
      prompt: `Start an interactive quiz for me. Ask ONE A/L Biology multiple-choice question at a time with 4 options (A-D) and WAIT for my answer. After I reply, tell me if it is correct with a 1-2 line explanation, then ask the next. Ask 10 questions total with increasing difficulty. Reply fully in ${replyLanguage}.`,
    },
    {
      emoji: "📄",
      title: t("cyberdt.actionPaper") || "Past paper help",
      desc: t("cyberdt.actionPaperDesc") || "Marking points & model answers",
      prompt: `Give me 3 G.C.E. A/L Biology past-paper-style structured essay questions, and for each one list the key marking points a full-mark answer must include. Reply fully in ${replyLanguage}.`,
    },
  ];

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
      if ((input.trim() || attachedImages.length > 0) && !isTyping) send(input, { images: attachedImages });
    }
  };

  return (
    <div className="flex h-full w-full flex-col bg-[#080D18] text-[#F1F5F9]">
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
            onClick={() => setShowImageGen((v) => !v)}
            title="Generate image"
            className="grid h-8 w-8 place-items-center rounded-xl border border-fuchsia-400/30 bg-fuchsia-500/5 text-fuchsia-300 transition hover:bg-fuchsia-500/15"
          >
            <span className="text-sm">🖼️</span>
          </button>
          <button
            type="button"
            onClick={() => send("Draw a labeled diagram using SVG. Pick a clear A/L Biology or Physics example (heart, neuron, force diagram, circuit, etc.) and generate a clean, labeled SVG diagram with proper colors and labels.")}
            title="Generate diagram"
            className="grid h-8 w-8 place-items-center rounded-xl border border-cyan-400/30 bg-cyan-500/5 text-cyan-300 transition hover:bg-cyan-500/15"
          >
            <span className="text-sm">📐</span>
          </button>
          <button
            type="button"
            onClick={() => setShowCanvas(true)}
            title="Whiteboard"
            className="grid h-8 w-8 place-items-center rounded-xl border border-cyan-400/30 bg-cyan-500/5 text-cyan-300 transition hover:bg-cyan-500/15"
          >
            <span className="text-sm">🎨</span>
          </button>
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

      {/* ===== Panels (key / plan / note) ===== */}
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
            <p className="text-sm text-cyan-400/60">{noteTopic || t("cyberdt.generateNotePrompt")}</p>
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

      {/* Image generation panel */}
      {showImageGen && (
        <div className="shrink-0 space-y-3 border-b border-white/5 bg-fuchsia-500/5 px-4 py-4">
          <p className="text-sm font-semibold text-fuchsia-200">Generate Image</p>
          <p className="text-xs text-cyan-300/80">Describe a diagram, force diagram, or biology illustration to generate.</p>
          <div className="mx-auto flex max-w-3xl gap-2">
            <Input
              value={imageGenPrompt}
              onChange={(e) => setImageGenPrompt(e.target.value)}
              placeholder="e.g. human heart anatomy diagram, labeled, educational"
              className="flex-1 rounded-xl border-cyan-500/20 bg-[#111B2D] text-sm text-cyan-50 placeholder:text-cyan-400/40 focus-visible:ring-cyan-400/60"
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void generateImage(); } }}
            />
            <Button type="button" size="sm" onClick={() => void generateImage()} disabled={imageGenLoading || !imageGenPrompt.trim()} className="rounded-xl border border-fuchsia-400/50 bg-fuchsia-500/20 text-fuchsia-100 hover:bg-fuchsia-500/40 disabled:opacity-50">
              {imageGenLoading ? "Generating..." : "Generate"}
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => { setShowImageGen(false); setImageGenPrompt(""); }} className="rounded-xl border-cyan-400/30 bg-transparent text-cyan-300 hover:bg-cyan-500/10">
              Close
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
                {t("cyberdt.welcomeSubtitle") || "Ask me about any A/L Biology topic, generate study notes, create quizzes, or build a personalized study plan."}
              </p>
              <div className="mt-8 grid w-full max-w-2xl grid-cols-1 gap-3 sm:grid-cols-2">
                {suggestionCards.map((card) => (
                  <button
                    key={card.title}
                    type="button"
                    onClick={() => send(card.prompt)}
                    disabled={isTyping}
                    className="group flex items-start gap-3 rounded-2xl border border-cyan-500/20 bg-[#111B2D] p-4 text-left transition hover:border-cyan-400/50 hover:bg-cyan-500/5 disabled:opacity-50"
                  >
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-cyan-500/10 text-xl">
                      {card.emoji}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-cyan-100">{card.title}</p>
                      <p className="mt-0.5 text-xs text-cyan-400/70">{card.desc}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m) =>
            m.role === "user" ? (
              <div key={m.id} className="mb-6 flex justify-end">
                <div className="max-w-[80%] space-y-2 rounded-2xl rounded-br-sm bg-cyan-500/15 px-4 py-2.5 text-sm text-cyan-50">
                  {m.images && m.images.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {m.images.map((img) => (
                        <img
                          key={img.id}
                          src={img.preview}
                          alt="attached"
                          className="max-h-40 max-w-full rounded-lg border border-cyan-400/30 object-cover"
                        />
                      ))}
                    </div>
                  )}
                  {m.text && <div className="whitespace-pre-line">{m.text}</div>}
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
        {attachedImages.length > 0 && (
          <div className="mx-auto mb-2 flex max-w-3xl flex-wrap gap-2">
            {attachedImages.map((img) => (
              <div key={img.id} className="relative">
                <img src={img.preview} alt="attached" className="h-16 w-16 rounded-xl border border-cyan-400/30 object-cover" />
                <button
                  type="button"
                  onClick={() => setAttachedImages((prev) => prev.filter((i) => i.id !== img.id))}
                  className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full bg-rose-500/90 text-white text-xs shadow hover:bg-rose-500"
                  aria-label="Remove image"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
        <form onSubmit={(e) => { e.preventDefault(); send(input, { images: attachedImages }); }} className="mx-auto flex max-w-3xl items-end gap-2 rounded-2xl border border-cyan-500/20 bg-[#111B2D] p-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              void handleImageFiles(e.target.files);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isTyping}
            title="Attach image"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-cyan-400/30 bg-cyan-500/5 text-cyan-300 transition hover:bg-cyan-500/15 disabled:opacity-40"
          >
            <Paperclip className="h-4 w-4" />
          </button>
          <textarea
            ref={composerRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleComposerKeyDown}
            placeholder={attachedImages.length > 0 ? "Add a message about the image (optional)..." : (t("cyberdt.composerPlaceholder") || "Message Cyber DT AI...")}
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
              disabled={!input.trim()}
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

      {/* ===== Canvas / Whiteboard overlay ===== */}
      {showCanvas && (
        <div className="fixed inset-0 z-50 flex flex-col bg-[#080D18]">
          <div className="flex items-center justify-between border-b border-white/5 px-4 py-3">
            <p className="text-sm font-bold text-cyan-200">🎨 Whiteboard</p>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setCanvasTool("pen")} className={`rounded-lg px-2 py-1 text-xs ${canvasTool === "pen" ? "bg-cyan-500/20 text-cyan-200" : "text-cyan-400/60 hover:bg-cyan-500/10"}`}>Pen</button>
              <button type="button" onClick={() => setCanvasTool("eraser")} className={`rounded-lg px-2 py-1 text-xs ${canvasTool === "eraser" ? "bg-rose-500/20 text-rose-200" : "text-cyan-400/60 hover:bg-cyan-500/10"}`}>Eraser</button>
              <input type="color" value={canvasColor} onChange={(e) => setCanvasColor(e.target.value)} className="h-7 w-7 cursor-pointer rounded border-0 bg-transparent" />
              <input type="range" min={1} max={12} value={canvasSize} onChange={(e) => setCanvasSize(Number(e.target.value))} className="w-20" />
              <button type="button" onClick={clearCanvas} className="rounded-lg px-2 py-1 text-xs text-rose-300 hover:bg-rose-500/10">Clear</button>
              <button type="button" onClick={downloadCanvas} className="rounded-lg px-2 py-1 text-xs text-cyan-300 hover:bg-cyan-500/10">Save PNG</button>
              <button type="button" onClick={() => setShowCanvas(false)} className="grid h-7 w-7 place-items-center rounded-lg text-cyan-400/70 hover:bg-cyan-500/10 hover:text-cyan-300">
                <span className="text-lg leading-none">×</span>
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-hidden p-2">
            <canvas
              ref={canvasRef}
              width={1200}
              height={800}
              className="h-full w-full cursor-crosshair rounded-xl border border-cyan-500/20 bg-[#0b1220]"
              onMouseDown={startDraw}
              onMouseMove={draw}
              onMouseUp={endDraw}
              onMouseLeave={endDraw}
              onTouchStart={startDraw}
              onTouchMove={draw}
              onTouchEnd={endDraw}
            />
          </div>
        </div>
      )}

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
    </div>
  );
}