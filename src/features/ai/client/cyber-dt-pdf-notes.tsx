"use client";

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from "react";
import {
  FileText,
  GraduationCap,
  Layers,
  ListChecks,
  Loader2,
  RefreshCw,
  ScanLine,
  Send,
  Sparkles,
  X,
} from "lucide-react";
import { CyberDTMessageBody } from "@/features/ai/client/cyber-dt-markdown";
import {
  CYBER_DT_PDF_ACCEPT,
  analyzeCyberDTPdf,
  renderCyberDTPdfRange,
  type CyberDTPdfProgress,
  type CyberDTPdfSource,
} from "@/features/ai/client/cyber-dt-pdf";

/**
 * PDF → Study Note workspace.
 *
 * The student uploads a PDF (up to 50 MB), Cyber DT writes a complete
 * structured study note from it, and then the SAME document can be used to
 * learn: a step-by-step lesson, a quiz, flashcards, or free questions answered
 * straight from the document.
 *
 * A 50 MB file cannot be POSTed to the server (6 MB request cap), so the file
 * is read in the browser with pdf.js first: small PDFs are sent whole, large
 * text PDFs as their extracted text, and large scanned PDFs as rendered page
 * images.
 */

const API_BASE = (() => {
  const base = (process.env.NEXT_PUBLIC_SYNC_BASE || "").replace(/\/+$/, "");
  return base ? `${base}/api/cyber-dt` : "/api/cyber-dt";
})();

const NO_KEY_MESSAGE =
  "The server has no Gemini key configured, so this tool cannot run right now. Ask your question in the main Cyber DT chat instead.";
/**
 * Friendly, bilingual "the AI is busy" message. The backend already retries
 * 3× with backoff, so seeing this means the whole free tier was busy at once —
 * it is worth one more try a few seconds later, so the UI retries by itself and
 * also offers a button.
 */
const BUSY_MESSAGE =
  "AI එක දැන් කාර්යබහුලයි 😕 — තත්පර කිහිපයකින් නැවත උත්සාහ කරන්න. (The AI is busy right now — please try again in a few seconds.)";
const OFFLINE_MESSAGE = "Could not reach the AI. Check your connection and try again.";
const BAD_FILE_MESSAGE = "That file could not be read as a PDF. Please upload it again.";

/** How long the UI waits before retrying a busy request by itself. */
const AUTO_RETRY_SECONDS = 6;
/** Upper bound on batches when generating a full note from a long scan. */
const MAX_BATCHES = 6;

type PdfMode = "note" | "teach" | "quiz" | "flashcards" | "ask";

interface ThreadTurn {
  q: string;
  a: string;
}

/** One parsed reply from the /pdf-note route. */
interface PdfReply {
  ok: boolean;
  text: string;
  error: string;
  busy: boolean;
  status: number;
}

async function postPdfNote(payload: Record<string, unknown>): Promise<PdfReply> {
  const res = await fetch(`${API_BASE}/pdf-note`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => null);
  if (res.ok && data?.ok && typeof data.text === "string" && data.text.trim()) {
    return { ok: true, text: data.text.trim(), error: "", busy: false, status: res.status };
  }
  return {
    ok: false,
    text: "",
    error: typeof data?.error === "string" ? data.error : "",
    busy: Boolean(data?.busy) || res.status >= 500,
    status: typeof data?.status === "number" ? data.status : res.status,
  };
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** The request fields that carry the document, depending on how it was read. */
function sourceFields(source: CyberDTPdfSource): Record<string, unknown> {
  if (source.kind === "inline") {
    return { pdf: { mimeType: "application/pdf", data: source.base64 } };
  }
  if (source.kind === "text") {
    return { pdfText: source.text, pdfTruncated: source.truncated };
  }
  return { images: source.images, pageFrom: source.fromPage, pageTo: source.toPage };
}

function sourceBadge(source: CyberDTPdfSource): string {
  if (source.kind === "inline") return "Full PDF";
  if (source.kind === "text") return `Text · ${source.pageCount} pages`;
  return `Scanned · pages ${source.fromPage}–${source.toPage} of ${source.pageCount}`;
}

export function CyberDTPdfNotes() {
  const [source, setSource] = useState<CyberDTPdfSource | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [progress, setProgress] = useState<CyberDTPdfProgress | null>(null);
  const [pdfError, setPdfError] = useState("");
  const [subject, setSubject] = useState("");
  const [language, setLanguage] = useState<"English" | "Sinhala">("English");
  const [rangeFrom, setRangeFrom] = useState("1");
  const [rangeTo, setRangeTo] = useState("");

  const [result, setResult] = useState<{ mode: PdfMode; text: string } | null>(null);
  const [thread, setThread] = useState<ThreadTurn[]>([]);
  const [loading, setLoading] = useState<PdfMode | null>(null);
  const [error, setError] = useState("");
  /** True when the current error is a transient "AI busy" error. */
  const [busy, setBusy] = useState(false);
  /** Countdown shown while the UI waits to auto-retry a busy request. */
  const [autoRetryIn, setAutoRetryIn] = useState<number | null>(null);
  /** Progress of the multi-batch "generate the full note" flow. */
  const [batch, setBatch] = useState<{ current: number; total: number } | null>(null);

  const [question, setQuestion] = useState("");
  const fileRef = useRef<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  /** The last action, replayed by the "Try again" button and auto-retry. */
  const retryRef = useRef<(() => void) | null>(null);
  const countdownRef = useRef(0);

  const resetOutput = () => {
    setResult(null);
    setThread([]);
    setError("");
    setBusy(false);
    setBatch(null);
  };

  /** Flags a transient failure and remembers how to retry it. */
  const raiseBusy = (retry: () => void) => {
    retryRef.current = retry;
    setError(BUSY_MESSAGE);
    setBusy(true);
  };

  const clearError = () => {
    setError("");
    setBusy(false);
  };

  // Auto-retry a busy request after a short pause — the backend already tried
  // 3×, so a few more seconds is usually enough for the free tier to recover.
  useEffect(() => {
    if (!busy) {
      setAutoRetryIn(null);
      return;
    }
    countdownRef.current = AUTO_RETRY_SECONDS;
    setAutoRetryIn(AUTO_RETRY_SECONDS);
    const iv = setInterval(() => {
      countdownRef.current -= 1;
      if (countdownRef.current <= 0) {
        clearInterval(iv);
        setAutoRetryIn(null);
        retryRef.current?.();
      } else {
        setAutoRetryIn(countdownRef.current);
      }
    }, 1000);
    return () => clearInterval(iv);
  }, [busy]);

  const onPickPdf = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setPdfError("");
    setPdfBusy(true);
    setProgress(null);
    try {
      const next = await analyzeCyberDTPdf(file, setProgress);
      fileRef.current = file;
      setSource(next);
      setRangeFrom("1");
      setRangeTo(String(next.kind === "inline" ? "" : next.pageCount || ""));
      resetOutput();
    } catch (err) {
      fileRef.current = null;
      setSource(null);
      setPdfError(err instanceof Error ? err.message : "Could not read that PDF.");
    } finally {
      setPdfBusy(false);
      setProgress(null);
    }
  };

  /** Reads a specific page range of a scan into the current working window. */
  const loadRange = async () => {
    const file = fileRef.current;
    if (!file || pdfBusy || source?.kind !== "images") return;
    const from = Math.max(1, Number.parseInt(rangeFrom, 10) || 1);
    const to = Math.max(from, Number.parseInt(rangeTo, 10) || source.pageCount);
    setPdfError("");
    setPdfBusy(true);
    try {
      const next = await renderCyberDTPdfRange(file, from, to, setProgress);
      setSource({ ...source, ...next });
      // Pre-fill the next window so pressing Load again continues through the scan.
      if (next.toPage < source.pageCount) {
        setRangeFrom(String(next.toPage + 1));
        setRangeTo(String(source.pageCount));
      }
      resetOutput();
    } catch (err) {
      setPdfError(err instanceof Error ? err.message : "Could not read that PDF.");
    } finally {
      setPdfBusy(false);
      setProgress(null);
    }
  };

  const run = async (mode: Exclude<PdfMode, "ask">) => {
    if (!source || loading) return;
    setLoading(mode);
    clearError();
    try {
      const reply = await postPdfNote({
        ...sourceFields(source),
        mode,
        language,
        subject: subject.trim(),
      });
      if (reply.ok) {
        setResult({ mode, text: reply.text });
        return;
      }
      if (reply.error === "no_api_key") {
        setError(NO_KEY_MESSAGE);
        return;
      }
      if (
        reply.error === "missing_pdf" ||
        reply.error === "not_a_pdf" ||
        reply.error === "unreadable_pdf"
      ) {
        setError(BAD_FILE_MESSAGE);
        return;
      }
      raiseBusy(() => void run(mode));
    } catch {
      setError(OFFLINE_MESSAGE);
    } finally {
      setLoading(null);
    }
  };

  /**
   * Generates a study note for a LONG scanned PDF in several small batches.
   *
   * Each batch renders only the pages that fit one request and is sent with
   * partIndex/partTotal, so the route keeps every call small and the free-tier
   * quota is never hammered by one giant prompt. The note is appended as each
   * batch returns, so the student sees it grow.
   */
  const generateFullNote = async () => {
    const file = fileRef.current;
    if (!file || source?.kind !== "images" || loading) return;
    const totalPages = source.pageCount;
    const start = Math.max(1, Number.parseInt(rangeFrom, 10) || 1);
    const end = Math.min(totalPages, Math.max(start, Number.parseInt(rangeTo, 10) || totalPages));
    // How many pages the current window holds — a good estimate for a batch.
    const perBatch = Math.max(1, source.images.length);
    const batches = Math.min(MAX_BATCHES, Math.ceil((end - start + 1) / perBatch));

    setLoading("note");
    clearError();
    setBatch({ current: 1, total: batches });
    let acc = "";
    let page = start;
    try {
      // Loop on the real page cursor (not the estimate) so a batch that ends
      // up smaller than expected still gets its remaining pages covered.
      for (let i = 1; page <= end && i <= MAX_BATCHES; i++) {
        setBatch({ current: i, total: Math.max(batches, i) });
        const chunkEnd = Math.min(end, page + perBatch - 1);
        const rendered = await renderCyberDTPdfRange(file, page, chunkEnd, setProgress);
        if (rendered.images.length === 0) break;

        const isLast = rendered.toPage >= end || i >= MAX_BATCHES;
        const reply = await postPdfNote({
          images: rendered.images,
          pageFrom: rendered.fromPage,
          pageTo: rendered.toPage,
          mode: "note",
          language,
          subject: subject.trim(),
          partIndex: i,
          partTotal: isLast ? i : Math.max(batches, i + 1),
        });

        if (!reply.ok) {
          // Keep whatever was written so far, and offer a retry of the batch.
          if (acc) setResult({ mode: "note", text: acc });
          if (reply.error === "no_api_key") setError(NO_KEY_MESSAGE);
          else raiseBusy(() => void generateFullNote());
          return;
        }

        acc += (acc ? "\n\n---\n\n" : "") + reply.text;
        setResult({ mode: "note", text: acc });
        page = rendered.toPage + 1;
      }
    } catch {
      if (acc) setResult({ mode: "note", text: acc });
      setError(OFFLINE_MESSAGE);
    } finally {
      setLoading(null);
      setBatch(null);
      setProgress(null);
    }
  };

  const doAsk = async (q: string) => {
    if (!source || !q || loading) return;
    setLoading("ask");
    clearError();
    try {
      const reply = await postPdfNote({
        ...sourceFields(source),
        mode: "ask",
        language,
        subject: subject.trim(),
        question: q,
        history: thread.flatMap((t) => [
          { role: "user", text: t.q },
          { role: "ai", text: t.a },
        ]),
      });
      if (reply.ok) {
        setThread((prev) => [...prev, { q, a: reply.text }]);
        setQuestion("");
        return;
      }
      if (reply.error === "no_api_key") {
        setError(NO_KEY_MESSAGE);
        return;
      }
      raiseBusy(() => void doAsk(q));
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

  const progressLabel = (() => {
    if (!progress) return "Reading your PDF…";
    if (progress.phase === "reading") return "Opening your PDF…";
    if (progress.phase === "text") return `Reading text — page ${progress.page} of ${progress.pageCount}…`;
    return `Rendering page ${progress.page} of ${progress.pageCount}…`;
  })();

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
            {source ? "Choose another PDF" : "Upload a PDF"}
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

        {pdfBusy && (
          <div className="flex items-center gap-2 rounded-lg border border-cyan-500/25 bg-[#0b1220] p-3 text-sm text-cyan-200">
            <Loader2 className="h-4 w-4 animate-spin" />
            {progressLabel}
          </div>
        )}

        {source && (
          <div className="flex items-center gap-3 rounded-lg border border-cyan-500/25 bg-[#0b1220] p-2.5">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-cyan-500/30 bg-cyan-500/10 text-cyan-200">
              {source.kind === "images" ? <ScanLine className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm text-cyan-100">{source.name}</span>
              <span className="block truncate text-[0.7rem] text-cyan-400/70">
                {formatSize(source.size)} · {sourceBadge(source)}
              </span>
            </span>
            <button
              type="button"
              onClick={() => {
                fileRef.current = null;
                setSource(null);
                resetOutput();
              }}
              title="Remove PDF"
              className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-cyan-300/80 transition hover:bg-rose-500/15 hover:text-rose-200"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {source?.kind === "text" && source.truncated && (
          <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
            This document is very long, so the first part was read. The note still covers the opening
            chapters.
          </p>
        )}

        {source?.kind === "images" && (
          <div className="space-y-2 rounded-lg border border-cyan-500/20 bg-[#0b1220] p-2.5">
            <p className="text-xs text-cyan-300/80">
              This PDF has no text layer (it is a scan), so it is read as page images — about{" "}
              {Math.max(1, source.images.length)} pages per request, so the AI is never overloaded.
              {source.pageCount > source.toPage
                ? ` Currently loaded: pages ${source.fromPage}–${source.toPage} of ${source.pageCount}.`
                : " All pages are loaded."}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <span className="flex items-center gap-1.5">
                <span className="text-xs text-cyan-400/70">Pages</span>
                <input
                  type="number"
                  min={1}
                  max={Math.max(1, source.pageCount)}
                  value={rangeFrom}
                  onChange={(e) => setRangeFrom(e.target.value)}
                  disabled={pdfBusy}
                  aria-label="From page"
                  className="w-16 rounded-md border border-cyan-500/30 bg-[#080D18] px-2 py-1 text-xs text-cyan-50 focus:border-cyan-400/60 focus:outline-none"
                />
                <span className="text-xs text-cyan-400/70">to</span>
                <input
                  type="number"
                  min={1}
                  max={Math.max(1, source.pageCount)}
                  value={rangeTo}
                  onChange={(e) => setRangeTo(e.target.value)}
                  disabled={pdfBusy}
                  aria-label="To page"
                  placeholder={String(source.pageCount)}
                  className="w-16 rounded-md border border-cyan-500/30 bg-[#080D18] px-2 py-1 text-xs text-cyan-50 placeholder:text-cyan-400/40 focus:border-cyan-400/60 focus:outline-none"
                />
              </span>
              <button
                type="button"
                onClick={() => void loadRange()}
                disabled={pdfBusy || loading !== null}
                className="rounded-md border border-cyan-400/50 bg-cyan-500/10 px-2.5 py-1 text-xs font-semibold text-cyan-100 transition hover:bg-cyan-500/20 disabled:opacity-50"
              >
                Load these pages
              </button>
              <button
                type="button"
                onClick={() => void generateFullNote()}
                disabled={pdfBusy || loading !== null}
                className="flex items-center gap-1.5 rounded-md border border-violet-400/50 bg-violet-500/15 px-2.5 py-1 text-xs font-semibold text-violet-200 transition hover:border-violet-300 hover:bg-violet-500/25 disabled:opacity-50"
              >
                {batch ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                Generate full note (all pages)
              </button>
            </div>
            {batch && (
              <p className="text-xs text-violet-200/90">
                Reading the document in {batch.total} small batches — batch {batch.current} of{" "}
                {batch.total}…
              </p>
            )}
          </div>
        )}

        {pdfError && (
          <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">
            {pdfError}
          </p>
        )}

        {!source && !pdfBusy && (
          <p className="text-xs text-cyan-400/50">
            Upload a chapter, class notes or a past paper (PDF, up to 50 MB). Cyber DT reads the whole
            document — including scanned pages — and writes a study note you can learn from.
          </p>
        )}

        {source && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                if (source.kind === "images" && source.pageCount > source.images.length) {
                  void generateFullNote();
                } else {
                  void run("note");
                }
              }}
              disabled={loading !== null || pdfBusy}
              className="flex shrink-0 items-center gap-2 rounded-lg bg-cyan-500/80 px-4 py-2 text-sm font-semibold text-[#080D18] transition hover:bg-cyan-400 disabled:opacity-40"
            >
              {loading === "note" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              {loading === "note"
                ? batch
                  ? `Reading batches… (${batch.current}/${batch.total})`
                  : "Writing your note…"
                : "Generate Study Note"}
            </button>
          </div>
        )}
      </div>

      {/* --- Learn actions --- */}
      {source && (
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
                disabled={loading !== null || pdfBusy}
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
        <div
          className={`space-y-2 rounded-lg border p-3 text-sm ${
            busy ? "border-amber-500/40 bg-amber-500/10 text-amber-100" : "border-rose-500/30 bg-rose-500/10 text-rose-200"
          }`}
        >
          <p>{error}</p>
          {busy && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => retryRef.current?.()}
                disabled={loading !== null || pdfBusy}
                className="flex items-center gap-1.5 rounded-lg bg-amber-500/90 px-3 py-1.5 text-xs font-bold text-[#2a1a00] transition hover:bg-amber-400 disabled:opacity-50"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
                නැවත උත්සාහ කරන්න · Try again
              </button>
              {autoRetryIn !== null && loading === null && (
                <span className="text-xs text-amber-200/80">
                  Auto-retrying in {autoRetryIn}s…
                </span>
              )}
            </div>
          )}
        </div>
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
      {source && (
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
