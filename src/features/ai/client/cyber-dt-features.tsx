"use client";

import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
} from "react";
import { ImagePlus, Loader2, X } from "lucide-react";
import { CyberDTMessageBody } from "@/features/ai/client/cyber-dt-markdown";
import {
  CYBER_DT_IMAGE_ACCEPT,
  prepareCyberDTImage,
  type CyberDTImageAttachment,
} from "@/features/ai/client/cyber-dt-image";

export type CyberDTFeatureId =
  | "quiz"
  | "essay_eval"
  | "calc_guide"
  | "flashcards"
  | "organic"
  | "notes";

export interface CyberDTFeatureMeta {
  id: CyberDTFeatureId;
  icon: string;
  label: string;
  /**
   * Opening message for features that run inside the chat. Features with
   * their own workspace (solver, evaluator, flashcards, organic) omit it.
   */
  starter?: string;
}

export const CYBER_DT_FEATURES: CyberDTFeatureMeta[] = [
  {
    id: "quiz",
    icon: "🧠",
    label: "Interactive Quiz",
    starter:
      "Start an interactive A/L quiz. If I have not said which subject, ask me first whether I want Biology, Physics or Chemistry. Then ask ONE multiple-choice question at a time (4 options A-D), wait for my answer, tell me if it is correct with a short explanation, and continue. Take the questions from the official Sri Lankan A/L Resource Book (NIE).",
  },
  {
    id: "essay_eval",
    icon: "📝",
    label: "Essay Evaluator",
  },
  {
    id: "calc_guide",
    icon: "📐",
    label: "Physics/Chem Solver",
  },
  {
    id: "flashcards",
    icon: "🗂️",
    label: "Smart Flashcards",
  },
  {
    id: "organic",
    icon: "🧪",
    label: "Organic Pathways",
  },
  {
    id: "notes",
    icon: "📚",
    label: "Study Notes & Plan",
    starter:
      "Help me build study notes and a revision plan. Ask me which subjects and topics I want to cover and when my exam is, then give structured notes plus a realistic day-wise plan. Stay strictly inside the Sri Lankan A/L syllabus (NIE resource books).",
  },
];

/**
 * Cyber DT API root. Same rule as the chat: the offline APK boots from
 * bundled assets, so it calls the deployed site cross-origin.
 */
const API_BASE = (() => {
  const base = (process.env.NEXT_PUBLIC_SYNC_BASE || "").replace(/\/+$/, "");
  return base ? `${base}/api/cyber-dt` : "/api/cyber-dt";
})();

const NO_KEY_MESSAGE =
  "The server has no Gemini key configured, so this tool cannot run right now. Ask your question in the main Cyber DT chat instead.";
const BUSY_MESSAGE = "The AI is busy right now. Please try again in a moment.";
const OFFLINE_MESSAGE = "Could not reach the AI. Check your connection and try again.";

const SUBJECTS = ["Biology", "Physics", "Chemistry"] as const;
type CyberDTSubject = (typeof SUBJECTS)[number];

/* -------------------------------------------------------------------------- */
/* Shared building blocks                                                     */
/* -------------------------------------------------------------------------- */

function SubjectPicker({
  value,
  onChange,
}: {
  value: CyberDTSubject;
  onChange: (subject: CyberDTSubject) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-semibold uppercase tracking-wide text-cyan-400/70">Subject</span>
      {SUBJECTS.map((subject) => (
        <button
          key={subject}
          type="button"
          onClick={() => onChange(subject)}
          aria-pressed={value === subject}
          className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
            value === subject
              ? "border-cyan-300 bg-cyan-500/20 text-cyan-100"
              : "border-cyan-500/40 text-cyan-400/80 hover:bg-cyan-900/40"
          }`}
        >
          {subject}
        </button>
      ))}
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
  rows = 4,
  maxLength,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  maxLength?: number;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-cyan-400/70">
        {label}
      </span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        maxLength={maxLength}
        placeholder={placeholder}
        className="w-full resize-y rounded-lg border border-cyan-500/30 bg-[#0b1220] p-3 text-sm text-cyan-50 placeholder:text-cyan-400/40 focus:border-cyan-400/60 focus:outline-none"
      />
    </label>
  );
}

function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">
      {children}
    </p>
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

function AnswerCard({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-cyan-500/20 bg-[#0b1220] p-4 text-sm leading-relaxed text-cyan-50/90">
      <CyberDTMessageBody text={text} />
    </div>
  );
}

/** Cyber DT feature navigation panel. */
export function CyberDTFeatures({
  activeFeature,
  setActiveFeature,
}: {
  activeFeature: CyberDTFeatureId | null;
  setActiveFeature: (feature: CyberDTFeatureId) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 rounded-xl border border-cyan-500/30 bg-gray-900 p-4 md:grid-cols-3">
      {CYBER_DT_FEATURES.map((feature) => {
        const active = activeFeature === feature.id;
        return (
          <button
            key={feature.id}
            type="button"
            onClick={() => setActiveFeature(feature.id)}
            aria-pressed={active}
            className={`rounded-lg border p-3 text-sm font-medium transition ${
              active
                ? "border-cyan-300 bg-cyan-800/60 text-cyan-100 shadow-[0_0_18px_rgba(34,211,238,0.25)]"
                : "border-cyan-500/50 bg-cyan-950/40 text-cyan-300 hover:bg-cyan-900/60"
            }`}
          >
            <span aria-hidden="true">{feature.icon}</span> {feature.label}
          </button>
        );
      })}
    </div>
  );
}

type SolverState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; solution: string }
  | { status: "error"; message: string };

/**
 * Numerical problem solver for Physics/Chemistry calculations. Sends the
 * problem to /api/cyber-dt/solver, which holds the Gemini key server-side.
 */
export function CyberDTSolver() {
  const [subject, setSubject] = useState<CyberDTSubject>("Physics");
  const [problem, setProblem] = useState("");
  const [state, setState] = useState<SolverState>({ status: "idle" });

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const text = problem.trim();
    if (!text || state.status === "loading") return;

    setState({ status: "loading" });
    try {
      const res = await fetch(`${API_BASE}/solver`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ problem: text, subject }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.ok && typeof data.solution === "string" && data.solution.trim()) {
        setState({ status: "done", solution: data.solution.trim() });
        return;
      }
      setState({
        status: "error",
        message: data?.error === "no_api_key" ? NO_KEY_MESSAGE : BUSY_MESSAGE,
      });
    } catch {
      setState({ status: "error", message: OFFLINE_MESSAGE });
    }
  };

  return (
    <div className="space-y-4 rounded-xl border border-cyan-500/30 bg-gray-900 p-4">
      <form onSubmit={onSubmit} className="space-y-3">
        <SubjectPicker value={subject} onChange={setSubject} />

        <TextField
          label="Problem"
          value={problem}
          onChange={setProblem}
          maxLength={2000}
          placeholder="Paste the numerical problem, e.g. a block of mass 2 kg slides down a 30° incline with μ = 0.2. Find the acceleration."
        />

        <div className="flex items-center justify-between gap-3">
          <span className="text-[0.65rem] text-cyan-400/50">
            Answers follow the NIE Resource Book format — given data, formula, substitution, final answer.
          </span>
          <button
            type="submit"
            disabled={!problem.trim() || state.status === "loading"}
            className="shrink-0 rounded-lg bg-cyan-500/80 px-4 py-2 text-sm font-semibold text-[#080D18] transition hover:bg-cyan-400 disabled:opacity-40"
          >
            {state.status === "loading" ? "Solving…" : "Solve"}
          </button>
        </div>
      </form>

      {state.status === "loading" && <LoadingNote label="Working through the steps…" />}
      {state.status === "error" && <ErrorNote>{state.message}</ErrorNote>}
      {state.status === "done" && <AnswerCard text={state.solution} />}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Essay evaluator                                                            */
/* -------------------------------------------------------------------------- */

type EvaluatorState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; evaluation: string }
  | { status: "error"; message: string };

/** Marks a structured essay answer against the official A/L marking scheme. */
export function CyberDTEssayEvaluator() {
  const [subject, setSubject] = useState<CyberDTSubject>("Biology");
  const [question, setQuestion] = useState("");
  const [studentAnswer, setStudentAnswer] = useState("");
  const [attachment, setAttachment] = useState<CyberDTImageAttachment | null>(null);
  const [attachBusy, setAttachBusy] = useState(false);
  const [attachError, setAttachError] = useState("");
  const [state, setState] = useState<EvaluatorState>({ status: "idle" });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const onPickImage = async (e: ChangeEvent<HTMLInputElement>) => {
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

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const q = question.trim();
    const answer = studentAnswer.trim();
    // The answer can be typed, photographed, or both.
    if (!q || (!answer && !attachment) || state.status === "loading") return;

    setState({ status: "loading" });
    try {
      const res = await fetch(`${API_BASE}/evaluator`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject,
          question: q,
          studentAnswer: answer,
          ...(attachment
            ? { image: { mimeType: attachment.mimeType, data: attachment.base64 } }
            : {}),
        }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.ok && typeof data.evaluation === "string" && data.evaluation.trim()) {
        setState({ status: "done", evaluation: data.evaluation.trim() });
        setAttachment(null);
        return;
      }
      setState({
        status: "error",
        message:
          data?.error === "no_api_key"
            ? NO_KEY_MESSAGE
            : data?.error === "invalid_image"
              ? "That image could not be read. Use a PNG or JPEG photo."
              : BUSY_MESSAGE,
      });
    } catch {
      setState({ status: "error", message: OFFLINE_MESSAGE });
    }
  };

  return (
    <div className="space-y-4 rounded-xl border border-cyan-500/30 bg-gray-900 p-4">
      <form onSubmit={onSubmit} className="space-y-3">
        <SubjectPicker value={subject} onChange={setSubject} />
        <TextField
          label="Question (with mark allocation if given)"
          value={question}
          onChange={setQuestion}
          rows={3}
          maxLength={1500}
          placeholder="Paste the essay question, e.g. Explain the process of photosynthesis and the factors affecting its rate. (10 marks)"
        />
        <div className="space-y-2">
          <TextField
            label="Your answer (or attach a photo of your handwriting)"
            value={studentAnswer}
            onChange={setStudentAnswer}
            rows={6}
            maxLength={6000}
            placeholder="Write or paste your structured essay answer here — or leave it empty and attach a photo of your handwritten answer."
          />

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={attachBusy || state.status === "loading"}
              className="flex items-center gap-1.5 rounded-full border border-cyan-500/40 px-3 py-1 text-xs font-semibold text-cyan-300 transition hover:bg-cyan-900/40 disabled:opacity-40"
            >
              {attachBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5" />}
              {attachment ? "Replace answer photo" : "Attach handwritten answer photo"}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept={CYBER_DT_IMAGE_ACCEPT}
              className="hidden"
              onChange={onPickImage}
            />
            <span className="text-[0.65rem] text-cyan-400/50">PNG or JPEG · Sinhala or English handwriting</span>
          </div>

          {attachment && (
            <div className="flex items-center gap-3 rounded-lg border border-cyan-500/30 bg-[#0b1220] p-2">
              <div
                role="img"
                aria-label="Attached answer preview"
                className="h-14 w-14 shrink-0 rounded-lg border border-cyan-500/30 bg-cover bg-center"
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
          {attachError && <p className="text-xs text-rose-300">{attachError}</p>}
        </div>

        <div className="flex items-center justify-between gap-3">
          <span className="text-[0.65rem] text-cyan-400/50">
            Marked against the official A/L marking scheme and NIE Resource Book.
          </span>
          <button
            type="submit"
            disabled={!question.trim() || (!studentAnswer.trim() && !attachment) || state.status === "loading"}
            className="shrink-0 rounded-lg bg-cyan-500/80 px-4 py-2 text-sm font-semibold text-[#080D18] transition hover:bg-cyan-400 disabled:opacity-40"
          >
            {state.status === "loading" ? "Evaluating…" : "Evaluate Answer"}
          </button>
        </div>
      </form>

      {state.status === "loading" && <LoadingNote label="Reading and marking your answer…" />}
      {state.status === "error" && <ErrorNote>{state.message}</ErrorNote>}
      {state.status === "done" && <AnswerCard text={state.evaluation} />}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Smart flashcards                                                           */
/* -------------------------------------------------------------------------- */

interface Flashcard {
  id: number;
  front: string;
  back: string;
}

type FlashcardsState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; cards: Flashcard[] }
  | { status: "error"; message: string };

/** Generates a flashcard deck and lets the student flip, browse and mark cards. */
export function CyberDTFlashcards() {
  const [subject, setSubject] = useState<CyberDTSubject>("Biology");
  const [topic, setTopic] = useState("");
  const [language, setLanguage] = useState<"si" | "en">("en");
  const [state, setState] = useState<FlashcardsState>({ status: "idle" });
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  // Cards marked for repeat practice stay in the deck (and on this list)
  // until the student marks them as mastered.
  const [reviewIds, setReviewIds] = useState<number[]>([]);

  const cards = state.status === "ready" ? state.cards : [];
  const current = cards[index];

  const generate = async () => {
    const value = topic.trim();
    if (!value || state.status === "loading") return;

    setState({ status: "loading" });
    try {
      const res = await fetch(`${API_BASE}/flashcards`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, topic: value, language }),
      });
      const data = await res.json().catch(() => null);
      const list = Array.isArray(data?.cards) ? (data.cards as Flashcard[]) : [];
      if (res.ok && data?.ok && list.length > 0) {
        setState({ status: "ready", cards: list });
        setIndex(0);
        setFlipped(false);
        setReviewIds([]);
        return;
      }
      setState({
        status: "error",
        message: data?.error === "no_api_key" ? NO_KEY_MESSAGE : BUSY_MESSAGE,
      });
    } catch {
      setState({ status: "error", message: OFFLINE_MESSAGE });
    }
  };

  const go = (delta: number) => {
    if (cards.length === 0) return;
    setIndex((step) => (step + delta + cards.length) % cards.length);
    setFlipped(false);
  };

  const toggleReview = () => {
    if (!current) return;
    setReviewIds((ids) =>
      ids.includes(current.id) ? ids.filter((id) => id !== current.id) : [...ids, current.id],
    );
  };

  const marked = current ? reviewIds.includes(current.id) : false;

  return (
    <div className="space-y-4 rounded-xl border border-cyan-500/30 bg-gray-900 p-4">
      <div className="space-y-3">
        <SubjectPicker value={subject} onChange={setSubject} />
        <div className="flex flex-wrap items-end gap-2">
          <label className="block min-w-[12rem] flex-1">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-cyan-400/70">
              Topic
            </span>
            <input
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              maxLength={120}
              placeholder="e.g. Photosynthesis, Electrochemistry, Newton's laws"
              className="w-full rounded-lg border border-cyan-500/30 bg-[#0b1220] px-3 py-2 text-sm text-cyan-50 placeholder:text-cyan-400/40 focus:border-cyan-400/60 focus:outline-none"
            />
          </label>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-cyan-400/70">Language</span>
            {(["si", "en"] as const).map((lang) => (
              <button
                key={lang}
                type="button"
                onClick={() => setLanguage(lang)}
                aria-pressed={language === lang}
                className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                  language === lang
                    ? "border-cyan-300 bg-cyan-500/20 text-cyan-100"
                    : "border-cyan-500/40 text-cyan-400/80 hover:bg-cyan-900/40"
                }`}
              >
                {lang === "si" ? "සිංහල" : "English"}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={generate}
            disabled={!topic.trim() || state.status === "loading"}
            className="shrink-0 rounded-lg bg-cyan-500/80 px-4 py-2 text-sm font-semibold text-[#080D18] transition hover:bg-cyan-400 disabled:opacity-40"
          >
            {state.status === "loading" ? "Generating…" : "Generate Cards"}
          </button>
        </div>
      </div>

      {state.status === "loading" && (
        <LoadingNote label="Writing your cards from the resource book…" />
      )}
      {state.status === "error" && <ErrorNote>{state.message}</ErrorNote>}

      {state.status === "ready" && current && (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs text-cyan-400/70">
            <span>
              Card {index + 1} of {cards.length}
            </span>
            <span>{reviewIds.length} marked for review</span>
          </div>

          <button
            type="button"
            onClick={() => setFlipped((value) => !value)}
            aria-label="Flip card"
            className="relative block h-52 w-full [perspective:1200px]"
          >
            <div
              className={`relative h-full w-full transition-transform duration-500 [transform-style:preserve-3d] ${
                flipped ? "[transform:rotateY(180deg)]" : ""
              }`}
            >
              <div className="absolute inset-0 flex flex-col items-center justify-center rounded-xl border border-cyan-500/40 bg-[#0b1220] p-6 text-center [backface-visibility:hidden]">
                <span className="text-[0.65rem] uppercase tracking-widest text-cyan-400/60">Front</span>
                <p className="mt-2 text-lg font-semibold text-cyan-100">{current.front}</p>
                <span className="mt-4 text-[0.65rem] text-cyan-400/40">Click to reveal the answer</span>
              </div>
              <div className="absolute inset-0 flex flex-col items-center justify-center rounded-xl border border-violet-400/40 bg-[#12101f] p-6 text-center [backface-visibility:hidden] [transform:rotateY(180deg)]">
                <span className="text-[0.65rem] uppercase tracking-widest text-violet-300/60">Back</span>
                <p className="mt-2 text-sm leading-relaxed text-violet-100">{current.back}</p>
              </div>
            </div>
          </button>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => go(-1)}
              className="rounded-lg border border-cyan-500/40 px-3 py-1.5 text-xs font-semibold text-cyan-300 transition hover:bg-cyan-900/40"
            >
              Previous Card
            </button>
            <button
              type="button"
              onClick={() => go(1)}
              className="rounded-lg border border-cyan-500/40 px-3 py-1.5 text-xs font-semibold text-cyan-300 transition hover:bg-cyan-900/40"
            >
              Next Card
            </button>
            <button
              type="button"
              onClick={toggleReview}
              aria-pressed={marked}
              className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                marked
                  ? "border-emerald-400/50 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25"
                  : "border-amber-400/50 bg-amber-500/10 text-amber-200 hover:bg-amber-500/20"
              }`}
            >
              {marked ? "Mastered — remove from review" : "Mark for Review (Repeat)"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Organic pathways                                                           */
/* -------------------------------------------------------------------------- */

type OrganicMode = "conversion" | "reagent_explain";

type OrganicState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; pathway: string }
  | { status: "error"; message: string };

/** Finds syllabus-only reaction pathways between two compounds. */
export function CyberDTOrganicAssistant() {
  const [mode, setMode] = useState<OrganicMode>("conversion");
  const [startCompound, setStartCompound] = useState("");
  const [targetCompound, setTargetCompound] = useState("");
  const [state, setState] = useState<OrganicState>({ status: "idle" });

  const needsTarget = mode === "conversion";

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const start = startCompound.trim();
    const target = targetCompound.trim();
    if (!start || (needsTarget && !target) || state.status === "loading") return;

    setState({ status: "loading" });
    try {
      const res = await fetch(`${API_BASE}/organic`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startCompound: start, targetCompound: target, mode }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.ok && typeof data.pathway === "string" && data.pathway.trim()) {
        setState({ status: "done", pathway: data.pathway.trim() });
        return;
      }
      setState({
        status: "error",
        message: data?.error === "no_api_key" ? NO_KEY_MESSAGE : BUSY_MESSAGE,
      });
    } catch {
      setState({ status: "error", message: OFFLINE_MESSAGE });
    }
  };

  return (
    <div className="space-y-4 rounded-xl border border-cyan-500/30 bg-gray-900 p-4">
      <form onSubmit={onSubmit} className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-cyan-400/70">Mode</span>
          <button
            type="button"
            onClick={() => setMode("conversion")}
            aria-pressed={mode === "conversion"}
            className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
              mode === "conversion"
                ? "border-cyan-300 bg-cyan-500/20 text-cyan-100"
                : "border-cyan-500/40 text-cyan-400/80 hover:bg-cyan-900/40"
            }`}
          >
            Find Conversion Pathway
          </button>
          <button
            type="button"
            onClick={() => setMode("reagent_explain")}
            aria-pressed={mode === "reagent_explain"}
            className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
              mode === "reagent_explain"
                ? "border-cyan-300 bg-cyan-500/20 text-cyan-100"
                : "border-cyan-500/40 text-cyan-400/80 hover:bg-cyan-900/40"
            }`}
          >
            Explain Reagents
          </button>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-cyan-400/70">
              Starting Compound (ආරම්භක සංයෝගය)
            </span>
            <input
              value={startCompound}
              onChange={(e) => setStartCompound(e.target.value)}
              maxLength={120}
              placeholder="e.g. ethene, propan-1-ol"
              className="w-full rounded-lg border border-cyan-500/30 bg-[#0b1220] px-3 py-2 text-sm text-cyan-50 placeholder:text-cyan-400/40 focus:border-cyan-400/60 focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-cyan-400/70">
              Target Compound (ලබාගත යුතු සංයෝගය)
            </span>
            <input
              value={targetCompound}
              onChange={(e) => setTargetCompound(e.target.value)}
              maxLength={120}
              placeholder={needsTarget ? "e.g. ethanoic acid" : "Optional"}
              className="w-full rounded-lg border border-cyan-500/30 bg-[#0b1220] px-3 py-2 text-sm text-cyan-50 placeholder:text-cyan-400/40 focus:border-cyan-400/60 focus:outline-none"
            />
          </label>
        </div>

        <div className="flex items-center justify-between gap-3">
          <span className="text-[0.65rem] text-cyan-400/50">
            Only reactions from the Sri Lankan A/L NIE Chemistry Resource Book are used.
          </span>
          <button
            type="submit"
            disabled={
              !startCompound.trim() ||
              (needsTarget && !targetCompound.trim()) ||
              state.status === "loading"
            }
            className="shrink-0 rounded-lg bg-cyan-500/80 px-4 py-2 text-sm font-semibold text-[#080D18] transition hover:bg-cyan-400 disabled:opacity-40"
          >
            {state.status === "loading" ? "Mapping…" : "Find Conversion Pathway"}
          </button>
        </div>
      </form>

      {state.status === "loading" && <LoadingNote label="Tracing the reaction steps…" />}
      {state.status === "error" && <ErrorNote>{state.message}</ErrorNote>}
      {state.status === "done" && <AnswerCard text={state.pathway} />}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Exam countdown & micro-goals                                               */
/* -------------------------------------------------------------------------- */

const EXAM_DATE_KEY = "cyberdt.examDate";
const GOALS_KEY_PREFIX = "cyberdt.goals.";

interface MicroGoal {
  subject: string;
  task: string;
  done: boolean;
}

function localDateKey(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function readJson<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or blocked — the UI still works for this session */
  }
}

/**
 * Exam countdown plus three daily micro-goals. The exam date and today's
 * checked goals live in localStorage so they survive reloads and offline use.
 */
export function CyberDTExamTracker() {
  const [examDate, setExamDate] = useState("");
  const [dateDraft, setDateDraft] = useState("");
  const [editingDate, setEditingDate] = useState(false);
  const [now, setNow] = useState<number | null>(null);
  const [today, setToday] = useState("");
  const [goals, setGoals] = useState<MicroGoal[]>([]);
  const [goalsLoading, setGoalsLoading] = useState(false);
  const [goalsError, setGoalsError] = useState("");

  useEffect(() => {
    const key = localDateKey();
    setToday(key);
    setNow(Date.now());

    const savedDate = window.localStorage.getItem(EXAM_DATE_KEY) || "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(savedDate)) {
      setExamDate(savedDate);
      setDateDraft(savedDate);
    }

    const savedGoals = readJson<MicroGoal[]>(`${GOALS_KEY_PREFIX}${key}`);
    if (Array.isArray(savedGoals)) setGoals(savedGoals);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const saveDate = () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateDraft)) return;
    setExamDate(dateDraft);
    try {
      window.localStorage.setItem(EXAM_DATE_KEY, dateDraft);
    } catch {
      /* ignore blocked storage */
    }
    setEditingDate(false);
  };

  const generateGoals = async () => {
    if (goalsLoading) return;
    setGoalsLoading(true);
    setGoalsError("");
    try {
      const res = await fetch(`${API_BASE}/micro-goals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: today }),
      });
      const data = await res.json().catch(() => null);
      const list: unknown[] = Array.isArray(data?.tasks) ? data.tasks : [];
      if (res.ok && data?.ok && list.length > 0) {
        const next: MicroGoal[] = list
          .map((task) => task as { subject?: unknown; task?: unknown })
          .map((task) => ({
            subject: typeof task.subject === "string" ? task.subject : "",
            task: typeof task.task === "string" ? task.task : "",
            done: false,
          }))
          .filter((goal) => goal.subject.length > 0 && goal.task.length > 0);
        setGoals(next);
        if (today) writeJson(`${GOALS_KEY_PREFIX}${today}`, next);
      } else {
        setGoalsError(data?.error === "no_api_key" ? NO_KEY_MESSAGE : BUSY_MESSAGE);
      }
    } catch {
      setGoalsError(OFFLINE_MESSAGE);
    } finally {
      setGoalsLoading(false);
    }
  };

  const toggleGoal = (index: number) => {
    setGoals((current) => {
      const next = current.map((goal, i) => (i === index ? { ...goal, done: !goal.done } : goal));
      if (today) writeJson(`${GOALS_KEY_PREFIX}${today}`, next);
      return next;
    });
  };

  const target = examDate ? new Date(`${examDate}T00:00:00`).getTime() : null;
  const diff = target !== null && now !== null ? target - now : null;
  const daysLeft = diff !== null ? Math.max(0, Math.floor(diff / 86_400_000)) : null;
  const hoursLeft = diff !== null ? Math.max(0, Math.floor((diff % 86_400_000) / 3_600_000)) : null;

  return (
    <section className="rounded-xl border border-cyan-500/30 bg-gray-900 p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-cyan-400/70">
            A/L Exam Countdown
          </p>
          {examDate ? (
            diff !== null && diff > 0 ? (
              <div className="mt-1 flex items-end gap-2">
                <span className="font-display text-4xl font-extrabold leading-none text-cyan-200 drop-shadow-[0_0_14px_rgba(34,211,238,0.55)]">
                  {daysLeft}
                </span>
                <span className="pb-1 text-sm text-cyan-400/70">days {hoursLeft}h to go</span>
              </div>
            ) : (
              <p className="mt-2 text-lg font-bold text-cyan-200">Exam day is here — good luck.</p>
            )
          ) : (
            <p className="mt-2 text-sm text-cyan-400/70">
              Set your G.C.E. A/L exam date to start the countdown.
            </p>
          )}
        </div>

        {editingDate ? (
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={dateDraft}
              onChange={(e) => setDateDraft(e.target.value)}
              className="rounded-lg border border-cyan-500/30 bg-[#0b1220] px-3 py-1.5 text-sm text-cyan-50 [color-scheme:dark] focus:border-cyan-400/60 focus:outline-none"
            />
            <button
              type="button"
              onClick={saveDate}
              disabled={!/^\d{4}-\d{2}-\d{2}$/.test(dateDraft)}
              className="rounded-lg bg-cyan-500/80 px-3 py-1.5 text-xs font-semibold text-[#080D18] transition hover:bg-cyan-400 disabled:opacity-40"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => setEditingDate(false)}
              className="rounded-lg border border-cyan-500/40 px-3 py-1.5 text-xs font-semibold text-cyan-300 transition hover:bg-cyan-900/40"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => {
              setDateDraft(examDate);
              setEditingDate(true);
            }}
            className="rounded-lg border border-cyan-500/40 px-3 py-1.5 text-xs font-semibold text-cyan-300 transition hover:bg-cyan-900/40"
          >
            {examDate ? "Change date" : "Set exam date"}
          </button>
        )}
      </div>

      <div className="mt-4 border-t border-cyan-500/20 pt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-cyan-400/70">
            Today&apos;s micro-goals
          </p>
          <button
            type="button"
            onClick={generateGoals}
            disabled={goalsLoading}
            className="rounded-lg bg-violet-500/80 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-violet-400 disabled:opacity-40"
          >
            {goalsLoading ? "Generating…" : "Generate Today's Micro-Goals"}
          </button>
        </div>

        {goalsError && (
          <div className="mt-3">
            <ErrorNote>{goalsError}</ErrorNote>
          </div>
        )}

        {goals.length > 0 && (
          <ul className="mt-3 space-y-2">
            {goals.map((goal, index) => (
              <li key={`${goal.subject}-${index}`}>
                <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-cyan-500/20 bg-[#0b1220] p-3 transition hover:border-cyan-500/40">
                  <input
                    type="checkbox"
                    checked={goal.done}
                    onChange={() => toggleGoal(index)}
                    className="mt-0.5 h-4 w-4 accent-cyan-400"
                  />
                  <span className="min-w-0">
                    <span className="mr-2 rounded bg-cyan-500/15 px-1.5 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-cyan-300">
                      {goal.subject}
                    </span>
                    <span
                      className={`text-sm ${
                        goal.done ? "text-cyan-400/40 line-through" : "text-cyan-50/90"
                      }`}
                    >
                      {goal.task}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}

        {goals.length === 0 && !goalsLoading && !goalsError && (
          <p className="mt-2 text-xs text-cyan-400/50">
            No goals yet — generate three short tasks for Biology, Physics and Chemistry.
          </p>
        )}
      </div>
    </section>
  );
}
