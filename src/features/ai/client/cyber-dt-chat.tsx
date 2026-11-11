"use client";

import * as React from "react";
import { useEffect, useRef, useState, useCallback } from "react";
import { Send, Bot, Loader2, Sparkles, Globe } from "lucide-react";
import { useT, useLanguage } from "@/lib/language-context";
import {
  generateCyberDTResponse,
  getCyberDTGreeting,
  renderCyberDTResponse,
  detectCyberDTLocale,
  type CyberDTResponse,
  type CyberDTLocale,
} from "@/features/ai/client/cyber-dt-ai";
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

export function CyberDTChat() {
  const t = useT();
  const { locale } = useLanguage();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const timers = useRef<NodeJS.Timeout[]>([]);

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

  const send = (raw: string) => {
    const text = raw.trim();
    if (!text || isTyping) return;

    const userMessage: ChatMessage = { id: nextId(), role: "user", text };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsTyping(true);

    // Reply in the SAME language as the user's question: if the message
    // contains Sinhala characters, answer in Sinhala; otherwise use the
    // app language as the fallback.
    const replyLocale = detectCyberDTLocale(text, locale as CyberDTLocale);
    const aiResponse = generateCyberDTResponse(text, replyLocale);
    const timer = setTimeout(() => {
      const aiMessage: ChatMessage = {
        id: nextId(),
        role: "ai",
        text: renderCyberDTResponse(aiResponse, replyLocale),
        emoji: aiResponse.emoji,
      };
      setMessages((prev) => [...prev, aiMessage]);
      setIsTyping(false);
    }, 600);
    timers.current.push(timer);
  };

  const quickQuestions = QUICK_QUESTIONS[locale as CyberDTLocale] ?? QUICK_QUESTIONS.en;

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
        <Sparkles className="h-4 w-4 text-fuchsia-300/70" />
      </div>

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
