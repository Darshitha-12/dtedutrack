"use client";

import * as React from "react";
import { CyberDTChat } from "@/features/ai/client/cyber-dt-chat";

/**
 * Floating Cyber DT AI widget — a Gemini/ChatGPT-style chat button pinned
 * to the bottom-right of every page. Clicking it opens the chat in an
 * overlay panel without leaving the current page.
 */
export function CyberDTFloatingWidget() {
  const [open, setOpen] = React.useState(false);

  // Close on Escape.
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Lock body scroll while open.
  React.useEffect(() => {
    if (open) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [open]);

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Chat panel */}
      {open && (
        <div className="fixed inset-x-2 bottom-2 top-16 z-50 sm:inset-x-auto sm:bottom-4 sm:right-4 sm:top-auto sm:h-[85vh] sm:w-[460px]">
          <div className="h-full w-full overflow-hidden rounded-2xl border border-cyan-500/30 bg-[#080D18] shadow-[0_0_60px_rgba(34,211,238,0.25)]">
            <CyberDTChat onClose={() => setOpen(false)} />
          </div>
        </div>
      )}

      {/* Floating action button */}
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open Cyber DT AI"
          className="fixed bottom-5 right-5 z-40 grid h-14 w-14 place-items-center rounded-full border border-cyan-400/50 bg-gradient-to-br from-cyan-500/30 to-violet-500/30 text-cyan-200 shadow-[0_0_30px_rgba(34,211,238,0.45)] backdrop-blur transition hover:scale-105 hover:shadow-[0_0_40px_rgba(34,211,238,0.6)] focus:outline-none focus:ring-2 focus:ring-cyan-400/60 overflow-hidden"
        >
          <svg viewBox="0 0 56 56" className="h-14 w-14" aria-hidden="true">
            <defs>
              <linearGradient id="cdtAvGrad" x1="0" y1="0" x2="56" y2="56">
                <stop offset="0%" stopColor="#22d3ee" />
                <stop offset="100%" stopColor="#a78bfa" />
              </linearGradient>
            </defs>
            <circle cx="28" cy="28" r="28" fill="url(#cdtAvGrad)" />
            <circle cx="28" cy="21" r="9" fill="#0b1220" />
            <path d="M10 46c0-9.94 8.06-18 18-18s18 8.06 18 18" fill="#0b1220" />
          </svg>
          <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full border-2 border-[#080D18] bg-emerald-400" />
        </button>
      )}
    </>
  );
}
