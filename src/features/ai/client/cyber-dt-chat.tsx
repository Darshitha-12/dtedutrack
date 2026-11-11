"use client";

import * as React from "react";
import { useEffect, useRef, useState, useCallback } from "react";
import { Send, Bot, Loader2, Sparkles, Globe, KeyRound } from "lucide-react";
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
  extractGeminiText,
  geminiEndpoint,
  defaultCyberDTModel,
} from "@/features/ai/cyber-dt-shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface ChatMessage {
  id: string;
  role: "user" | "ai";
  text: string;
  emoji?: string;
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

/** localStorage key for the user's own Gemini API key (browser-direct fallback). */
const GEMINI_KEY_STORAGE = "cyberdt_gemini_key";

function getStoredGeminiKey(): string {
  try {
    return window.localStorage.getItem(GEMINI_KEY_STORAGE) || "";
  } catch {
    return "";
  }
}

export function CyberDTChat() {
  const t = useT();
  const { locale } = useLanguage();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const timers = useRef<NodeJS.Timeout[]>([]);
  // Gemini API key state: server-configured key or a key pasted by the user.
  const [serverHasKey, setServerHasKey] = useState(false);
  const [localHasKey, setLocalHasKey] = useState(false);
  const [showKeyPanel, setShowKeyPanel] = useState(false);
  const [keyInput, setKeyInput] = useState("");

  // Ask the server once whether a Gemini key is configured there.
  useEffect(() => {
    fetch("/api/cyber-dt")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d && typeof d.serverKey === "boolean") setServerHasKey(d.serverKey);
      })
      .catch(() => {});
    setLocalHasKey(Boolean(getStoredGeminiKey()));
  }, []);

  const aiMode = serverHasKey || localHasKey;

  const greeting = useCallback((): ChatMessage => {
    const g = getCyberDTGreeting(locale as CyberDTLocale);
    return {
      id: nextId(),
      role: "ai",
      text: renderCyberDTResponse(g, locale as CyberDTLocale),
      emoji: g.emoji,
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
    };
  }, []);

  // Auto-scroll to the newest message.
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, isTyping]);

  const send = async (raw: string) => {
    const text = raw.trim();
    if (!text || isTyping) return;

    const userMessage: ChatMessage = { id: nextId(), role: "user", text };
    const history = messages.slice(-10).map((m) => ({ role: m.role, text: m.text }));
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsTyping(true);

    // Reply in the SAME language as the question: Sinhala script, Singlish
    // (Sinhala in English letters) or English — never the app language.
    const replyLocale = detectCyberDTLocale(text, locale as CyberDTLocale);

    // Minimum typing time so instant offline answers don't feel jarring.
    const minDelay = new Promise<void>((resolve) => {
      const t = setTimeout(resolve, 600);
      timers.current.push(t);
    });

    // 1) Try the real AI — Gemini through our own /api/cyber-dt route, so the
    //    API key stays on the server. It answers ANY question, in the right
    //    language, with complete exam-style answers.
    let aiText: string | null = null;
    let emoji = "✨";
    let serverHasNoKey = false;
    try {
      const res = await fetch("/api/cyber-dt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, history }),
      });
      if (res.ok) {
        const data = await res.json().catch(() => null);
        if (data && data.ok && typeof data.text === "string" && data.text.trim()) {
          aiText = data.text.trim();
          emoji = "✨";
        } else if (data && data.error === "no_api_key") {
          serverHasNoKey = true;
        }
      }
    } catch {
      /* offline or route error — try the local key, then the offline engine */
    }

    // 2) If the server has no key, use the user's own pasted key directly
    //    from the browser (personal free key from Google AI Studio).
    const storedKey = getStoredGeminiKey();
    if (!aiText && serverHasNoKey && storedKey) {
      try {
        const res = await fetch(geminiEndpoint(defaultCyberDTModel()), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": storedKey,
          },
          body: JSON.stringify(buildGeminiRequestBody(history, text)),
        });
        if (res.ok) {
          const data = await res.json().catch(() => null);
          const out = extractGeminiText(data);
          if (out) {
            aiText = out;
            emoji = "✨";
          }
        }
      } catch {
        /* fall through to the offline knowledge base */
      }
    }

    // 3) Offline fallback: the built-in knowledge base, replying in the
    //    detected language (works with zero internet or no API key).
    if (!aiText) {
      const aiResponse = generateCyberDTResponse(text, replyLocale);
      aiText = renderCyberDTResponse(aiResponse, replyLocale);
      emoji = aiResponse.emoji;
    }

    await minDelay;
    setMessages((prev) => [...prev, { id: nextId(), role: "ai", text: aiText ?? "", emoji }]);
    setIsTyping(false);
  };

  const quickQuestions = QUICK_QUESTIONS[locale as CyberDTLocale] ?? QUICK_QUESTIONS.en;

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
            onClick={() => setShowKeyPanel((v) => !v)}
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

      {/* Messages */}
      <div ref={listRef} className="scrollbar-slim flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.map((m) =>
          m.role === "user" ? (
            <div key={m.id} className="flex justify-end">
              <div className="max-w-[85%] whitespace-pre-line rounded-2xl rounded-br-sm border border-cyan-400/40 bg-cyan-500/15 px-4 py-2.5 text-sm text-cyan-50">
                {m.text}
              </div>
            </div>
          ) : (
            <div key={m.id} className="flex items-end gap-2">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-violet-400/40 bg-violet-500/15 text-sm">
                {m.emoji ?? "🤖"}
              </span>
              <div className="max-w-[85%] whitespace-pre-line rounded-2xl rounded-bl-sm border border-violet-400/30 bg-violet-500/10 px-4 py-2.5 text-sm text-violet-50">
                {m.text}
              </div>
            </div>
          ),
        )}

        {isTyping && (
          <div className="flex items-end gap-2">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-violet-400/40 bg-violet-500/15 text-sm">🤖</span>
            <div className="flex items-center gap-1.5 rounded-2xl rounded-bl-sm border border-violet-400/30 bg-violet-500/10 px-4 py-3">
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-cyan-300 [animation-delay:-0.3s]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-cyan-300 [animation-delay:-0.15s]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-cyan-300" />
              <span className="ml-2 text-2xs text-cyan-400/80">{t("cyberdt.typing")}</span>
            </div>
          </div>
        )}
      </div>

      {/* Quick questions */}
      <div className="scrollbar-slim flex gap-2 overflow-x-auto border-t border-cyan-500/20 px-4 py-2.5">
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
        <Button
          type="submit"
          size="icon"
          disabled={!input.trim() || isTyping}
          className="rounded-xl border border-cyan-400/50 bg-cyan-500/20 text-cyan-200 hover:bg-cyan-500/30 disabled:opacity-40"
        >
          {isTyping ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </form>
    </div>
  );
}
