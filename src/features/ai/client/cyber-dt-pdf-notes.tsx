"use client";

import { useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from "react";
import { FileText, GraduationCap, Layers, ListChecks, Loader2, Send, Sparkles, X } from "lucide-react";
import { CyberDTMessageBody } from "@/features/ai/client/cyber-dt-markdown";
import {
  CYBER_DT_PDF_ACCEPT,
  prepareCyberDTPdf,
  type CyberDTPdfAttachment,
} from "@/features/ai/client/cyber-dt-pdf";

/**
 * PDF → Study Note workspace.
 *
 * The student uploads a PDF, Cyber DT writes a complete structured study note
 * from it, and then the SAME document can be used to learn: a step-by-step
 * lesson, a quiz, flashcards, or free questions answered straight from the PDF.
 * The document stays in memory (never on the server), so every action re-reads
 * the real file rather than a summary.
 */

const API_BASE = (() => {
  const base = (process.env.NEXT_PUBLIC_SYNC_BASE || "").replace(/\/+$/, "");
  return base ? `${base}/api/cyber-dt` : "/api/cyber-dt";
})();

const NO_KEY_MESSAGE =
  "The server has no Gemini key configured, so this tool cannot run right now. Ask your question in the main Cyber DT chat instead.";
const BUSY_MESSAGE = "The AI is busy right now. Please try again in a moment.";
const OFFLINE_MESSAGE = "Could not reach the AI. Check your connection and try again.";

type PdfMode = "note" | "teach" | "quiz" | "flashcards" | "ask";

interface ThreadTurn {
  q: string;
  a: string;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function CyberDTPdfNotes() {
  const [pdf, setPdf] = useState<CyberDTPdfAttachment | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfError, setPdfError] = useState("");
  const [subject, setSubject] = useState("");
  const [language, setLanguage] = useState<"English" | "Sinhala">("English");

  const [result, setResult] = useState<{ mode: PdfMode; text: string } | null>(null);
  const [thread, setThread] = useState<ThreadTurn[]>([]);
  const [loading, setLoading] = useState<PdfMode | null>(null);
  const [error, setError] = useState("");

  const [question, setQuestion] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const onPickPdf = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setPdfError("");
    setPdfBusy(true);
    try {
      const next = await prepareCyberDTPdf(file);
      setPdf(next);
      // A new document starts a fresh lesson.
      setResult(null);
      setThread([]);
      setError("");
    } catch (err) {
      setPdf(null);
      setPdfError(err instanceof Error ? err.message : "Could not read that PDF.");
    } finally {
      setPdfBusy(false);
    }
  };

  const run = async (mode: Exclude<PdfMode, "ask">) => {
    if (!pdf || loading) return;
    setLoading(mode);
    setError("");
    try {
      const res = await fetch(`${API_BASE}/pdf-note`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pdf: { mimeType: pdf.mimeType, data: pdf.base64 },
          mode,
          language,
          subject: subject.trim(),
        }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.ok && typeof data.text === "string" && data.text.trim()) {
        setResult({ mode, text: data.text.trim() });
        return;
      }
      setError(
        data?.error === "no_api_key"
          ? NO_KEY_MESSAGE
          : data?.error === "missing_pdf" || data?.error === "not_a_pdf"
            ? "That file could not be read as a PDF. Please upload it again."
            : BUSY_MESSAGE,
      );
    } catch {
      setError(OFFLINE_MESSAGE);
    } finally {
      setLoading(null);
    }
  };

  const doAsk = async (q: string) => {
    if (!pdf || !q || loading) return;
    setLoading("ask");
    setError("");
    try {
      const res = await fetch(`${API_BASE}/pdf-note`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pdf: { mimeType: pdf.mimeType, data: pdf.base64 },
          mode: "ask",
          language,
          subject: subject.trim(),
          question: q,
          history: thread.flatMap((t) => [
            { role: "user", text: t.q },
            { role: "ai", text: t.a },
          ]),
        }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.ok && typeof data.text === "string" && data.text.trim()) {
        setThread((prev) => [...prev, { q, a: data.text.trim() }]);
        setQuestion("");
        return;
      }
      setError(data?.error === "no_api_key" ? NO_KEY_MESSAGE : BUSY_MESSAGE);
    } catch {
      setError(OFFLINE_MESSAGE);
    } finally {
      setLoading(null);
    }
  };

  const ask = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    void doAsk(question.trim());
  };

  const learnActions: Array<{ mode: Exclude<PdfMode, "ask">; label: string; icon: ReactNode }> = [
    { mode: "teach", label: "Teach Me Step-by-Step", icon: <GraduationCap className="h-3.5 w-3.5" /> },
    { mode: "quiz", label: "Quiz Me", icon: <ListChecks className="h-3.5 w-3.5" /> },
    { mode: "flashcards", label: "Flashcards", icon: <Layers className="h-3.5 w-3.5" /> },
  ];

  return (
    <div className="space-y-4 rounded-xl border border-cyan-500/30 bg-gray-900 p-4">
      {/* --- Upload --- */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={pdfBusy}
            className="flex shrink-0 items-center gap-2 rounded-lg border border-cyan-400/50 bg-cyan-500/10 px-4 py-2 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-500/20 disabled:opacity-50"
          >
            {pdfBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
            {pdf ? "Choose another PDF" : "Upload a PDF"}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept={CYBER_DT_PDF_ACCEPT}
            className="hidden"
            onChange={onPickPdf}
          />

          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-cyan-400/70">Note language</span>
            {(["en", "si"] as const).map((lang) => (
              <button
                key={lang}
                type="button"
                onClick={() => setLanguage(lang === "si" ? "Sinhala" : "English")}
                aria-pressed={(lang === "si") === (language === "Sinhala")}
                className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                  (lang === "si") === (language === "Sinhala")
                    ? "border-cyan-300 bg-cyan-500/20 text-cyan-100"
                    : "border-cyan-500/40 text-cyan-400/80 hover:bg-cyan-900/40"
                }`}
              >
                {lang === "si" ? "සිංහල" : "English"}
              </button>
            ))}
          </div>

          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            maxLength={40}
            placeholder="Subject (optional) e.g. Biology"
            className="min-w-[10rem] flex-1 rounded-lg border border-cyan-500/30 bg-[#0b1220] px-3 py-2 text-sm text-cyan-50 placeholder:text-cyan-400/40 focus:border-cyan-400/60 focus:outline-none"
          />
        </div>

        {pdf && (
          <div className="flex items-center gap-3 rounded-lg border border-cyan-500/25 bg-[#0b1220] p-2.5">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-cyan-500/30 bg-cyan-500/10 text-cyan-200">
              <FileText className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1 truncate text-sm text-cyan-100">{pdf.name}</span>
            <span className="shrink-0 text-[0.65rem] text-cyan-400/60">{formatSize(pdf.size)}</span>
            <button
              type="button"
              onClick={() => {
                setPdf(null);
                setResult(null);
                setThread([]);
                setError("");
              }}
              title="Remove PDF"
              className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-cyan-300/80 transition hover:bg-rose-500/15 hover:text-rose-200"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {pdfError && (
          <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">
            {pdfError}
          </p>
        )}

        {!pdf && !pdfBusy && (
          <p className="text-xs text-cyan-400/50">
            Upload a chapter, class notes or a past paper (PDF, up to about 3 MB). Cyber DT reads the whole
            document — including scanned pages — and writes a study note you can learn from.
          </p>
        )}

        {pdf && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => run("note")}
              disabled={loading !== null}
              className="flex shrink-0 items-center gap-2 rounded-lg bg-cyan-500/80 px-4 py-2 text-sm font-semibold text-[#080D18] transition hover:bg-cyan-400 disabled:opacity-40"
            >
              {loading === "note" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              {loading === "note" ? "Writing your note…" : "Generate Study Note"}
            </button>
          </div>
        )}
      </div>

      {/* --- Learn actions --- */}
      {pdf && (
        <div className="border-t border-cyan-500/20 pt-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-cyan-400/70">
            Learn from this PDF
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {learnActions.map((action) => (
              <button
                key={action.mode}
                type="button"
                onClick={() => run(action.mode)}
                disabled={loading !== null}
                className="flex shrink-0 items-center gap-1.5 rounded-full border border-violet-400/50 bg-violet-500/15 px-3 py-1.5 text-xs font-semibold text-violet-200 transition hover:border-violet-300 hover:bg-violet-500/25 disabled:opacity-40"
              >
                {loading === action.mode ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  action.icon
                )}
                {action.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {loading === "teach" && <LoadingNote label="Preparing your step-by-step lesson…" />}
      {loading === "quiz" && <LoadingNote label="Writing quiz questions from your PDF…" />}
      {loading === "flashcards" && <LoadingNote label="Building flashcards from your PDF…" />}

      {error && (
        <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">
          {error}
        </p>
      )}

      {result && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-cyan-400/70">
            {result.mode === "note"
              ? "Study Note"
              : result.mode === "teach"
                ? "Step-by-Step Lesson"
                : result.mode === "quiz"
                  ? "Quiz"
                  : "Flashcards"}
          </p>
          <div className="rounded-lg border border-cyan-500/20 bg-[#0b1220] p-4 text-sm leading-relaxed text-cyan-50/90">
            <CyberDTMessageBody text={result.text} />
          </div>
        </div>
      )}

      {/* --- Ask about the PDF --- */}
      {pdf && (
        <div className="border-t border-cyan-500/20 pt-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-cyan-400/70">
            Ask a question about this PDF
          </p>

          {thread.length > 0 && (
            <div className="mb-3 space-y-3">
              {thread.map((turn, index) => (
                <div key={index} className="space-y-2">
                  <p className="rounded-lg bg-cyan-500/10 px-3 py-2 text-sm text-cyan-100">{turn.q}</p>
                  <div className="rounded-lg border border-cyan-500/20 bg-[#0b1220] p-3 text-sm leading-relaxed text-cyan-50/90">
                    <CyberDTMessageBody text={turn.a} />
                  </div>
                </div>
              ))}
            </div>
          )}

          {loading === "ask" && <LoadingNote label="Reading your PDF for the answer…" />}

          <form onSubmit={ask} className="flex items-end gap-2 rounded-2xl border border-cyan-500/20 bg-[#0b1220] p-2">
            <textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void doAsk(question.trim());
                }
              }}
              rows={1}
              disabled={loading !== null}
              placeholder="e.g. Explain figure 2 in simple Sinhala"
              className="flex-1 resize-none bg-transparent px-2 py-1.5 text-sm text-cyan-50 placeholder:text-cyan-400/40 focus:outline-none disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={!question.trim() || loading !== null}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-cyan-500/80 text-[#080D18] transition hover:bg-cyan-400 disabled:opacity-40"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

function LoadingNote({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-1.5 py-2">
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-cyan-300 [animation-delay:-0.3s]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-cyan-300 [animation-delay:-0.15s]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-cyan-300" />
      <span className="ml-2 text-xs text-cyan-400/70">{label}</span>
    </div>
  );
}
