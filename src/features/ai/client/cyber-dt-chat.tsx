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
 * headers), so the APK also gets real streamed Gemini answers when online.
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

  // Plain JSON response (non-streaming answer or fallback shape).
  const data = await res.json().catch(() => null);
  if (data && data.ok && typeof data.text === "string" && data.text.trim()) {
    onDelta(data.text.trim());
    return data.text.trim();
  }
  return null;
}

export function CyberDTChat() {
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

  // Seed the conversation with the greeting once.
  useEffect(() => {
    setMessages([greeting()]);
  }, [greeting]);

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
    opts?: { noUserMessage?: boolean; historyOverride?: Array<{ role: string; text: string }> },
  ) => {
    const text = raw.trim();
    if (!text || isTyping) return;

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

    // 1) The real AI — Gemini streamed through our own /api/cyber-dt route,
    //    so the API key stays on the server. Words appear as they are written.
    let answer: string | null = null;
    let serverFailed = false;
    try {
      answer = await readAnswerStream(
        CYBER_DT_API,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: text, history, stream: true }),
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
              body: JSON.stringify(buildGeminiRequestBody(history, text)),
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

  const stopGenerating = () => abortRef.current?.abort();

  const quickQuestions = QUICK_QUESTIONS[locale as CyberDTLocale] ?? QUICK_QUESTIONS.en;

  // --- Quick actions -------------------------------------------------------

  const replyLanguage = locale === "si" ? "Sinhala" : "English";

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

  return (
    <div className="mx-auto flex h-[calc(100dvh-8rem)] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-cyan-500/30 bg-[#0b1220]/90 shadow-[0_0_40px_rgba(34,211,238,0.15)] backdrop-blur-xl">
      {/* Neon header */}
      <div className="flex items-center gap-3 border-b border-cyan-500/30 bg-gradient-to-r from-cyan-500/15 via-violet-500/10 to-fuchsia-500/15 px-5 py-4">
        <span className="relative grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-cyan-400/50 bg-cyan-500/10 text-cyan-300 shadow-[0_0_20px_rgba(34,211,238,0.4)]">
          <Bot className="h-6 w-6" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-extrabold tracking-wide text-cyan-200">
            {t("cyberdt.name")}
          </p>
          <p className="flex items-center gap-1.5 text-2xs text-cyan-400/80">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400 opacity-70" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-cyan-300" />
            </span>
            {t("cyberdt.responsesUnlimited")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "hidden rounded-full px-2 py-0.5 text-2xs font-semibold sm:inline-block",
              aiMode
                ? "border border-fuchsia-400/50 bg-fuchsia-500/15 text-fuchsia-200"
                : "border border-cyan-400/40 bg-cyan-500/10 text-cyan-300",
            )}
          >
            {aiMode ? "✨ " + t("cyberdt.aiMode") : t("cyberdt.offlineMode")}
          </span>
          <button
            type="button"
            onClick={clearChat}
            title={t("cyberdt.clearChat")}
            className="grid h-8 w-8 place-items-center rounded-xl border border-cyan-400/40 bg-cyan-500/10 text-cyan-300 transition hover:bg-cyan-500/20"
          >
            <Trash2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              setShowPlanPanel(false);
              setShowKeyPanel((v) => !v);
            }}
            title={t("cyberdt.apiKey")}
            className={cn(
              "grid h-8 w-8 place-items-center rounded-xl border transition",
              localHasKey || serverHasKey
                ? "border-fuchsia-400/60 bg-fuchsia-500/15 text-fuchsia-300"
                : "border-cyan-400/40 bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/20",
            )}
          >
            <KeyRound className="h-4 w-4" />
          </button>
          <Sparkles className="h-4 w-4 text-fuchsia-300/70" />
        </div>
      </div>

      {/* Gemini API key panel (optional, personal free key) */}
      {showKeyPanel && (
        <div className="space-y-2 border-b border-cyan-500/20 bg-cyan-500/5 px-4 py-3">
          <p className="text-2xs leading-relaxed text-cyan-200/80">{t("cyberdt.apiKeyHint")}</p>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              placeholder="AIza..."
              type="password"
              className="min-w-0 flex-1 rounded-xl border-cyan-500/30 bg-transparent text-sm text-cyan-50 placeholder:text-cyan-400/40 focus-visible:ring-cyan-400/60"
            />
            <Button
              type="button"
              size="sm"
              onClick={saveKey}
              className="rounded-xl border border-cyan-400/50 bg-cyan-500/20 text-cyan-100 hover:bg-cyan-500/30"
            >
              {t("cyberdt.apiKeySave")}
            </Button>
            {localHasKey && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={removeKey}
                className="rounded-xl border border-rose-400/40 bg-rose-500/10 text-rose-200 hover:bg-rose-500/20"
              >
                {t("cyberdt.apiKeyRemove")}
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Study plan mini-form */}
      {showPlanPanel && (
        <div className="space-y-2 border-b border-cyan-500/20 bg-violet-500/5 px-4 py-3">
          <p className="text-2xs font-semibold text-violet-200">{t("cyberdt.planTitle")}</p>
          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1">
              <span className="text-2xs text-cyan-300/80">
                {t("cyberdt.planExamDate")}
                {planDateAuto && planDate && !planDateTouched.current ? (
                  <span className="ml-1 text-fuchsia-300/70">· {t("cyberdt.planAutoDate")}</span>
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
                className="rounded-xl border-cyan-500/30 bg-transparent text-sm text-cyan-50 [color-scheme:dark] focus-visible:ring-cyan-400/60"
              />
            </label>
            <label className="space-y-1">
              <span className="text-2xs text-cyan-300/80">{t("cyberdt.planHours")}</span>
              <Input
                type="number"
                min={1}
                max={12}
                value={planHours}
                onChange={(e) => {
                  planHoursTouched.current = true;
                  setPlanHours(e.target.value);
                }}
                className="rounded-xl border-cyan-500/30 bg-transparent text-sm text-cyan-50 [color-scheme:dark] focus-visible:ring-cyan-400/60"
              />
            </label>
          </div>
          <label className="block space-y-1">
            <span className="text-2xs text-cyan-300/80">{t("cyberdt.planSubjects")}</span>
            <Input
              value={planSubjects}
              onChange={(e) => setPlanSubjects(e.target.value)}
              placeholder="Biology, Chemistry, Physics"
              className="rounded-xl border-cyan-500/30 bg-transparent text-sm text-cyan-50 placeholder:text-cyan-400/40 focus-visible:ring-cyan-400/60"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-2xs text-cyan-300/80">{t("cyberdt.planWeak")}</span>
            <Input
              value={planWeak}
              onChange={(e) => setPlanWeak(e.target.value)}
              placeholder={t("cyberdt.planWeakPlaceholder")}
              className="rounded-xl border-cyan-500/30 bg-transparent text-sm text-cyan-50 placeholder:text-cyan-400/40 focus-visible:ring-cyan-400/60"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-2xs text-cyan-300/80">{t("cyberdt.planDesc")}</span>
            <textarea
              value={planDesc}
              onChange={(e) => setPlanDesc(e.target.value)}
              placeholder={t("cyberdt.planDescPlaceholder")}
              rows={3}
              maxLength={600}
              className="w-full resize-y rounded-xl border border-cyan-500/30 bg-transparent px-3 py-2 text-sm text-cyan-50 outline-none placeholder:text-cyan-400/40 focus-visible:ring-2 focus-visible:ring-cyan-400/60"
            />
          </label>
          <div className="flex items-center justify-end gap-2 pt-1">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setShowPlanPanel(false)}
              className="rounded-xl border border-cyan-400/30 bg-transparent text-cyan-300 hover:bg-cyan-500/10"
            >
              {t("cyberdt.planCancel")}
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={generatePlan}
              disabled={isTyping}
              className="rounded-xl border border-violet-400/50 bg-violet-500/25 text-violet-100 hover:bg-violet-500/40 disabled:opacity-50"
            >
              <ClipboardList className="mr-1 h-3.5 w-3.5" />
              {t("cyberdt.planGenerate")}
            </Button>
          </div>
        </div>
      )}

      {/* Messages */}
      <div ref={listRef} className="scrollbar-slim flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.map((m) =>
          m.role === "user" ? (
            <div key={m.id} className="flex flex-col items-end">
              <div className="max-w-[85%] whitespace-pre-line rounded-2xl rounded-br-sm border border-cyan-400/40 bg-cyan-500/15 px-4 py-2.5 text-sm text-cyan-50">
                {m.text}
              </div>
              {m.time && <span className="mt-0.5 pr-1 text-[0.6rem] text-cyan-500/60">{m.time}</span>}
            </div>
          ) : (
            <div key={m.id} className="flex flex-col items-start">
              <div className="flex items-end gap-2">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-violet-400/40 bg-violet-500/15 text-sm">
                  {m.emoji ?? "🤖"}
                </span>
                <div className="max-w-[85%] whitespace-pre-line rounded-2xl rounded-bl-sm border border-violet-400/30 bg-violet-500/10 px-4 py-2.5 text-sm text-violet-50 [&_h4]:text-sm [&_h5]:text-sm [&_h6]:text-[0.92rem] [&_p]:text-sm">
                  {m.text ? (
                    <>
                      <CyberDTMessageBody text={m.text} />
                      {m.streaming && (
                        <span className="ml-0.5 inline-block h-4 w-[2px] animate-pulse rounded bg-cyan-300 align-middle" />
                      )}
                    </>
                  ) : (
                    // Thinking indicator while the first words are on their way.
                    <div className="flex items-center gap-1.5 py-1">
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-cyan-300 [animation-delay:-0.3s]" />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-cyan-300 [animation-delay:-0.15s]" />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-cyan-300" />
                      <span className="ml-2 text-2xs text-cyan-400/80">
                        {t("cyberdt.thinking")}
                        {elapsed > 0 ? ` · ${elapsed}s` : ""}
                      </span>
                    </div>
                  )}
                </div>
              </div>
              <div className="ml-9 mt-0.5 flex items-center gap-2">
                {m.time && <span className="text-[0.6rem] text-violet-400/50">{m.time}</span>}
                {m.text && !m.streaming && (
                  <button
                    type="button"
                    onClick={() => copyMessage(m)}
                    title={t("cyberdt.copy")}
                    className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[0.65rem] text-cyan-400/70 transition hover:bg-cyan-500/10 hover:text-cyan-300"
                  >
                    {copiedId === m.id ? (
                      <>
                        <Check className="h-3 w-3" /> {t("cyberdt.copied")}
                      </>
                    ) : (
                      <>
                        <Copy className="h-3 w-3" /> {t("cyberdt.copy")}
                      </>
                    )}
                  </button>
                )}
                {m.id === lastAiId && m.text && !m.streaming && !isTyping && messages.length > 1 && (
                  <button
                    type="button"
                    onClick={regenerate}
                    title={t("cyberdt.regenerate")}
                    className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[0.65rem] text-violet-400/70 transition hover:bg-violet-500/10 hover:text-violet-300"
                  >
                    <RefreshCw className="h-3 w-3" /> {t("cyberdt.regenerate")}
                  </button>
                )}
              </div>
            </div>
          ),
        )}
      </div>

      {/* Quick actions + quick questions */}
      <div className="scrollbar-slim flex gap-2 overflow-x-auto border-t border-cyan-500/20 px-4 py-2.5">
        <button
          type="button"
          onClick={openPlanPanel}
          disabled={isTyping}
          className="flex shrink-0 items-center gap-1 rounded-full border border-violet-400/50 bg-violet-500/15 px-3 py-1 text-2xs font-semibold text-violet-200 transition hover:border-violet-300 hover:bg-violet-500/25 disabled:opacity-50"
        >
          <ClipboardList className="h-3 w-3" /> {t("cyberdt.actionPlan")}
        </button>
        <button
          type="button"
          onClick={startQuiz}
          disabled={isTyping}
          className="flex shrink-0 items-center gap-1 rounded-full border border-violet-400/50 bg-violet-500/15 px-3 py-1 text-2xs font-semibold text-violet-200 transition hover:border-violet-300 hover:bg-violet-500/25 disabled:opacity-50"
        >
          <Target className="h-3 w-3" /> {t("cyberdt.actionQuiz")}
        </button>
        <button
          type="button"
          onClick={askPastPaper}
          disabled={isTyping}
          className="flex shrink-0 items-center gap-1 rounded-full border border-fuchsia-400/40 bg-fuchsia-500/10 px-3 py-1 text-2xs font-semibold text-fuchsia-200 transition hover:border-fuchsia-300 hover:bg-fuchsia-500/20 disabled:opacity-50"
        >
          <FileText className="h-3 w-3" /> {t("cyberdt.actionPaper")}
        </button>
        <button
          type="button"
          onClick={askTips}
          disabled={isTyping}
          className="flex shrink-0 items-center gap-1 rounded-full border border-fuchsia-400/40 bg-fuchsia-500/10 px-3 py-1 text-2xs font-semibold text-fuchsia-200 transition hover:border-fuchsia-300 hover:bg-fuchsia-500/20 disabled:opacity-50"
        >
          <Lightbulb className="h-3 w-3" /> {t("cyberdt.actionTips")}
        </button>
        <span className="mx-1 my-auto h-4 w-px shrink-0 bg-cyan-500/20" />
        {quickQuestions.map((q) => (
          <button
            key={q}
            onClick={() => send(q)}
            disabled={isTyping}
            className="shrink-0 rounded-full border border-cyan-400/30 bg-cyan-500/5 px-3 py-1 text-2xs font-semibold text-cyan-300 transition hover:border-cyan-300 hover:bg-cyan-500/15 disabled:opacity-50"
          >
            {q}
          </button>
        ))}
      </div>

      {/* Input */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="flex items-center gap-2 border-t border-cyan-500/30 bg-[#0b1220]/95 p-3"
      >
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={t("cyberdt.quickAsk")}
          disabled={isTyping}
          className="rounded-xl border-cyan-500/30 bg-transparent text-sm text-cyan-50 placeholder:text-cyan-400/50 focus-visible:ring-cyan-400/60"
        />
        {isTyping ? (
          <Button
            type="button"
            onClick={stopGenerating}
            title={t("cyberdt.stop")}
            className="rounded-xl border border-rose-400/50 bg-rose-500/20 text-rose-200 hover:bg-rose-500/30"
          >
            <Square className="h-4 w-4" />
          </Button>
        ) : (
          <Button
            type="submit"
            size="icon"
            disabled={!input.trim()}
            className="rounded-xl border border-cyan-400/50 bg-cyan-500/20 text-cyan-200 hover:bg-cyan-500/30 disabled:opacity-40"
          >
            <Send className="h-4 w-4" />
          </Button>
        )}
      </form>
    </div>
  );
}
