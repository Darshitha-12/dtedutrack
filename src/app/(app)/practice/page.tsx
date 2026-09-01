"use client";

import { useState, useCallback, useEffect } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { EmptyState } from "@/components/ui/empty-state";
import { Loader2, Play, CheckCircle2, XCircle, RotateCcw, History } from "lucide-react";

interface Topic {
  id: string;
  title: string;
  slug: string;
  unitTitle: string;
  subjectName: string;
  questionCount: number;
}

interface OptionData {
  id: string;
  text: string;
  textSi: string;
  order: number;
}

interface QuizQuestion {
  id: string;
  quizId: string;
  questionId: string;
  order: number;
  status: string;
  selectedOptionId: string | null;
  isCorrect: boolean | null;
  timeMs: number;
  question: {
    id: string;
    stem: string;
    explanation: string;
    options: OptionData[];
  };
}

interface QuizDetail {
  id: string;
  mode: string;
  status: string;
  score: number;
  total: number;
  questions: QuizQuestion[];
}

type Mode = "PRACTICE" | "WEAK_TOPICS" | "RETRY_WRONG" | "MOCK";
type Screen = "start" | "quiz" | "result";

export default function PracticePage() {
  const [topics, setTopics] = useState<Topic[]>([]);
  const [screen, setScreen] = useState<Screen>("start");
  const [quiz, setQuiz] = useState<QuizDetail | null>(null);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, { correct: boolean; correctOptionId: string; explanation: string }>>({});
  const [revealed, setRevealed] = useState(false);
  const [history, setHistory] = useState<Array<{ id: string; mode: string; score: number; total: number; createdAt: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");

  const [topicId, setTopicId] = useState("");
  const [count, setCount] = useState("10");
  const [difficulty, setDifficulty] = useState("");
  const [mode, setMode] = useState<Mode>("PRACTICE");

  const loadData = useCallback(async () => {
    try {
      const [tRes, hRes] = await Promise.all([
        fetch("/api/quiz/topics"),
        fetch("/api/quiz"),
      ]);
      const tData = await tRes.json();
      const hData = await hRes.json();
      setTopics(tData.topics || []);
      setHistory(hData.quizzes || []);
    } catch {
      setTopics([]);
      setHistory([]);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const startQuiz = async (targetMode?: Mode) => {
    setStarting(true);
    setError("");
    const finalMode = targetMode || mode;
    try {
      const res = await fetch("/api/quiz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: finalMode,
          topicId: topicId || null,
          count: Number(count),
          difficulty: difficulty || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to start quiz");
      const q: QuizDetail = data.quiz;
      setQuiz(q);
      setQuestions(q.questions);
      setCurrentIdx(0);
      setSelected(null);
      setRevealed(false);
      setAnswers({});
      setScreen("quiz");
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start quiz");
    } finally {
      setStarting(false);
    }
  };

  const answer = async (optionId: string) => {
    if (revealed || !quiz) return;
    setSelected(optionId);
    const current = questions[currentIdx];
    const started = performance.now();
    try {
      const res = await fetch("/api/quiz/answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quizId: quiz.id,
          questionId: current.questionId,
          selectedOptionId: optionId,
          timeMs: Math.max(0, Math.round(performance.now() - started)),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to submit answer");
      setAnswers((prev) => ({
        ...prev,
        [current.questionId]: {
          correct: data.result.correct,
          correctOptionId: data.result.correctOptionId,
          explanation: data.result.explanation,
        },
      }));
      setRevealed(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit answer");
      setRevealed(true);
    }
  };

  const next = async () => {
    if (currentIdx + 1 < questions.length) {
      setCurrentIdx((i) => i + 1);
      setSelected(null);
      setRevealed(false);
    } else {
      if (quiz) {
        await fetch("/api/quiz/complete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ quizId: quiz.id }),
        });
        await loadData();
      }
      setScreen("result");
    }
  };

  const reset = () => {
    setQuiz(null);
    setQuestions([]);
    setCurrentIdx(0);
    setSelected(null);
    setRevealed(false);
    setAnswers({});
    setError("");
    setScreen("start");
  };

  const correctCount = Object.values(answers).filter((a) => a.correct).length;

  if (screen === "quiz" && quiz && questions.length > 0) {
    const current = questions[currentIdx];
    const answerInfo = answers[current.questionId];
    return (
      <div className="space-y-6">
        <PageHeader
          title="Practice Questions"
          description={`Question ${currentIdx + 1} of ${questions.length}`}
        />
        <div className="flex items-center gap-2">
          <Badge variant="secondary">{modeLabel(mode)}</Badge>
          {topicId && (
            <Badge variant="outline">
              {topics.find((t) => t.id === topicId)?.title || "Selected topic"}
            </Badge>
          )}
          <span className="ml-auto text-sm text-muted-foreground">
            Score: {correctCount}
            {revealed ? (answerInfo?.correct ? " — correct" : " — incorrect") : ""}
          </span>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{current.question.stem}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {current.question.options.map((opt) => {
              const isChosen = selected === opt.id;
              const isCorrectOpt = answerInfo?.correctOptionId === opt.id;
              let cls =
                "flex items-start gap-3 rounded-md border border-input px-4 py-3 text-left text-sm";
              if (!revealed) {
                cls += " hover:bg-accent cursor-pointer";
              } else if (isCorrectOpt) {
                cls += " border-emerald-500/60 bg-emerald-500/10";
              } else if (isChosen) {
                cls += " border-destructive bg-destructive/10";
              } else {
                cls += " opacity-60";
              }
              return (
                <button
                  key={opt.id}
                  disabled={revealed}
                  onClick={() => answer(opt.id)}
                  className={cls}
                >
                  <span className="font-medium">{String.fromCharCode(65 + opt.order)}.</span>
                  <span className="flex-1">{opt.text}</span>
                  {revealed && isCorrectOpt && <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
                  {revealed && isChosen && !isCorrectOpt && <XCircle className="h-4 w-4 text-destructive" />}
                </button>
              );
            })}
          </CardContent>
          {revealed && answerInfo?.explanation && (
            <CardContent className="pt-0">
              <div className="rounded-md border border-border bg-muted/40 p-4 text-sm">
                <span className="font-semibold">Explanation: </span>
                {answerInfo.explanation}
              </div>
            </CardContent>
          )}
          {revealed && (
            <CardContent className="pt-0">
              <Button onClick={next} className="w-full gap-2">
                {currentIdx + 1 < questions.length ? "Next Question" : "Finish Quiz"}
              </Button>
            </CardContent>
          )}
          {error && (
            <CardContent className="pt-0">
              <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            </CardContent>
          )}
        </Card>
      </div>
    );
  }

  if (screen === "result") {
    const total = questions.length || quiz?.total || 0;
    const pct = total > 0 ? Math.round((correctCount / total) * 100) : 0;
    return (
      <div className="space-y-6">
        <PageHeader title="Results" />
        <Card>
          <CardContent className="flex flex-col items-center py-10 text-center">
            <div className="text-5xl font-bold">{correctCount}</div>
            <div className="text-sm text-muted-foreground">out of {total} correct</div>
            <Badge
              className="mt-4"
              variant={pct >= 70 ? "default" : pct >= 40 ? "secondary" : "destructive"}
            >
              {pct}%
            </Badge>
            <p className="mt-4 text-sm text-muted-foreground">
              {pct >= 80
                ? "Excellent! Keep it up."
                : pct >= 50
                  ? "Good effort — review the weak areas."
                  : "Review the explanations and retry."}
            </p>
            <div className="mt-6 flex gap-3">
              <Button variant="outline" onClick={reset} className="gap-2">
                <RotateCcw className="h-4 w-4" /> Back to Setup
              </Button>
              <Button onClick={() => startQuiz()} className="gap-2" disabled={starting}>
                {starting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
                Try Again
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Practice Questions"
        description="Test yourself with Biology practice questions across all topics."
      />

      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Play className="h-4 w-4 text-primary" /> Start a Quiz
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Mode</label>
              <Select value={mode} onChange={(e) => setMode(e.target.value as Mode)}>
                <option value="PRACTICE">Practice (all topics)</option>
                <option value="WEAK_TOPICS">Weak Topics</option>
                <option value="RETRY_WRONG">Retry Wrong</option>
                <option value="MOCK">Mock Exam</option>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Topic (optional)</label>
              <Select value={topicId} onChange={(e) => setTopicId(e.target.value)}>
                <option value="">All topics ({topics.reduce((s, t) => s + t.questionCount, 0)} questions)</option>
                {topics.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title} ({t.questionCount})
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Questions</label>
              <Select value={count} onChange={(e) => setCount(e.target.value)}>
                {[5, 10, 15, 20, 30, 50].map((n) => (
                  <option key={n} value={String(n)}>
                    {n}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Difficulty (optional)</label>
              <Select value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
                <option value="">Any</option>
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </Select>
            </div>
            {error && (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            )}
            <Button onClick={() => startQuiz()} className="w-full gap-2" disabled={starting || topics.length === 0}>
              {starting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Play className="h-4 w-4" />
              )}
              Start Quiz
            </Button>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <History className="h-4 w-4 text-primary" /> Recent Quizzes
              </CardTitle>
            </CardHeader>
            <CardContent>
              {history.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  No quizzes yet. Start your first practice session!
                </p>
              ) : (
                <ul className="space-y-2">
                  {history.slice(0, 10).map((h) => (
                    <li
                      key={h.id}
                      className="flex items-center gap-3 rounded-md border border-border px-3 py-2 text-sm"
                    >
                      <Badge variant="outline">{modeLabel(h.mode)}</Badge>
                      <span className="font-medium">
                        {h.score}/{h.total}
                      </span>
                      <span className="ml-auto text-xs text-muted-foreground">
                        {new Date(h.createdAt).toLocaleString()}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {topics.length === 0 && (
            <EmptyState
              icon="📋"
              title="No questions available"
              description="Questions are being prepared. Check back soon."
            />
          )}
        </div>
      </div>
    </div>
  );
}

function modeLabel(mode: string): string {
  switch (mode) {
    case "WEAK_TOPICS":
      return "Weak Topics";
    case "RETRY_WRONG":
      return "Retry Wrong";
    case "MOCK":
      return "Mock Exam";
    default:
      return "Practice";
  }
}
