// Quiz lifecycle + mistakes, served from the bundled question bank and
// attempt history kept in localStorage. Mirrors src/features/questions/service.ts.

import {
  getContentDb,
  serializeQuestion,
  correctOptionIdOf,
  questionById,
  type ContentDb,
  type QuestionData,
} from "./content";
import { getState, mutate, type OfflineState, type StoredAttempt, type StoredQuiz } from "./store";
import { nowIso, uid } from "./runtime";

type Result = { status: number; body: Record<string, unknown> };

interface TopicPerformance {
  topicId: string;
  topicTitle: string;
  topicSlug: string;
  attempted: number;
  correct: number;
  accuracy: number;
  averageTimeMs: number;
}

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function topicPerformances(state: OfflineState, db: ContentDb): TopicPerformance[] {
  const map = new Map<string, TopicPerformance>();
  for (const a of state.attempts) {
    const topic = db.topics.find((t) => t.id === a.topicId);
    const entry = map.get(a.topicId) ?? {
      topicId: a.topicId,
      topicTitle: (topic?.title as string) ?? "",
      topicSlug: (topic?.slug as string) ?? "",
      attempted: 0,
      correct: 0,
      accuracy: 0,
      averageTimeMs: 0,
    };
    entry.attempted += 1;
    if (a.isCorrect) entry.correct += 1;
    entry.accuracy = entry.correct / entry.attempted;
    map.set(a.topicId, entry);
  }
  return [...map.values()];
}

function weakTopicRows(state: OfflineState, db: ContentDb, limit: number) {
  return topicPerformances(state, db)
    .filter((p) => p.attempted >= 2 && p.accuracy < 0.7)
    .sort((a, b) => a.accuracy - b.accuracy)
    .slice(0, limit)
    .map((p) => ({
      topicId: p.topicId,
      topicTitle: p.topicTitle,
      topicSlug: p.topicSlug,
      accuracy: p.accuracy,
      attempted: p.attempted,
    }));
}

function wrongQuestionIds(state: OfflineState, topicId?: string | null): string[] {
  const seen = new Set<string>();
  const ids: string[] = [];
  const attempts = [...state.attempts].sort((a, b) => b.answeredAt.localeCompare(a.answeredAt));
  for (const a of attempts) {
    if (a.isCorrect) continue;
    if (topicId && a.topicId !== topicId) continue;
    if (seen.has(a.questionId)) continue;
    seen.add(a.questionId);
    ids.push(a.questionId);
    if (ids.length >= 50) break;
  }
  return ids;
}

function toSummary(q: StoredQuiz): Record<string, unknown> {
  return {
    id: q.id,
    mode: q.mode,
    status: q.status,
    score: q.score,
    total: q.total,
    startedAt: q.startedAt,
    completedAt: q.completedAt,
    createdAt: q.createdAt,
  };
}

async function toDetail(q: StoredQuiz): Promise<Record<string, unknown> | null> {
  const db = await getContentDb();
  const questions = [];
  for (const qq of [...q.questions].sort((a, b) => a.order - b.order)) {
    const raw = await questionById(qq.questionId);
    if (!raw) continue;
    questions.push({
      id: qq.id,
      quizId: qq.quizId,
      questionId: qq.questionId,
      order: qq.order,
      status: qq.status,
      selectedOptionId: qq.selectedOptionId,
      isCorrect: qq.isCorrect,
      timeMs: qq.timeMs,
      question: serializeQuestion(raw, db),
    });
  }
  return { ...toSummary(q), questions };
}

export async function listQuizzes(): Promise<Result> {
  const state = getState();
  const quizzes = [...state.quizzes]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 50)
    .map(toSummary);
  return { status: 200, body: { quizzes } };
}

export async function startQuiz(body: Record<string, unknown>): Promise<Result> {
  const mode = (body.mode as string) ?? "PRACTICE";
  if (!["PRACTICE", "WEAK_TOPICS", "RETRY_WRONG", "MOCK"].includes(mode)) {
    return { status: 400, body: { error: "Invalid input" } };
  }
  const topicId = typeof body.topicId === "string" && body.topicId ? body.topicId : null;
  let count = typeof body.count === "number" ? Math.floor(body.count) : 10;
  if (!Number.isFinite(count)) count = 10;
  count = Math.max(1, Math.min(50, count));
  const difficulty = typeof body.difficulty === "string" ? body.difficulty : undefined;
  if (difficulty && !["easy", "medium", "hard"].includes(difficulty)) {
    return { status: 400, body: { error: "Invalid input" } };
  }

  const db = await getContentDb();
  const state = getState();
  let pool = db.questions.filter((q) => q.status === "PUBLISHED");
  if (topicId) pool = pool.filter((q) => q.topicId === topicId);
  if (difficulty) pool = pool.filter((q) => q.difficulty === difficulty);
  if (mode === "WEAK_TOPICS") {
    const weakIds = new Set(topicPerformances(state, db).filter((p) => p.attempted >= 2 && p.accuracy < 0.7).map((p) => p.topicId));
    pool = pool.filter((q) => weakIds.has(q.topicId as string));
  } else if (mode === "RETRY_WRONG") {
    const wrongIds = new Set(wrongQuestionIds(state, topicId));
    const wrongPool = pool.filter((q) => wrongIds.has(q.id as string));
    if (wrongPool.length > 0) pool = wrongPool;
  }
  if (pool.length === 0) {
    return { status: 500, body: { error: "No questions available for this selection" } };
  }

  const picked = shuffle([...pool]).slice(0, Math.min(count, pool.length));
  const now = nowIso();
  const quiz: StoredQuiz = {
    id: uid(),
    mode: mode as StoredQuiz["mode"],
    status: "IN_PROGRESS",
    score: 0,
    total: picked.length,
    topicId,
    difficulty: difficulty ?? null,
    startedAt: now,
    completedAt: null,
    createdAt: now,
    questions: picked.map((q, i) => ({
      id: uid(),
      quizId: "",
      questionId: q.id as string,
      order: i,
      status: "PENDING",
      selectedOptionId: null,
      isCorrect: null,
      timeMs: 0,
    })),
  };
  quiz.questions.forEach((qq) => (qq.quizId = quiz.id));
  mutate((s) => s.quizzes.push(quiz));
  const detail = await toDetail(quiz);
  return { status: 201, body: { quiz: detail } };
}

export async function getQuiz(quizId: string): Promise<Result> {
  const state = getState();
  const quiz = state.quizzes.find((q) => q.id === quizId);
  if (!quiz) return { status: 500, body: { error: "Quiz not found" } };
  return { status: 200, body: { quiz: await toDetail(quiz) } };
}

export async function answerQuestion(body: Record<string, unknown>): Promise<Result> {
  const quizId = String(body.quizId ?? "");
  const questionId = String(body.questionId ?? "");
  const selectedOptionId = String(body.selectedOptionId ?? "");
  const timeMs = typeof body.timeMs === "number" && body.timeMs >= 0 ? Math.floor(body.timeMs) : 0;

  const state = getState();
  const quiz = state.quizzes.find((q) => q.id === quizId);
  if (!quiz) return { status: 500, body: { error: "Quiz not found" } };
  const qq = quiz.questions.find((q) => q.questionId === questionId);
  if (!qq) return { status: 500, body: { error: "Quiz not found" } };
  const raw = await questionById(questionId);
  if (!raw) return { status: 500, body: { error: "Quiz not found" } };

  if (qq.status === "ANSWERED") {
    return {
      status: 200,
      body: {
        result: {
          correct: qq.isCorrect === true,
          correctOptionId: "",
          explanation: "",
          explanationSi: "",
          questionType: (raw.type as string) ?? "MCQ",
        },
      },
    };
  }

  const correctId = correctOptionIdOf(raw);
  const correct = selectedOptionId === correctId && correctId !== "";
  qq.status = "ANSWERED";
  qq.selectedOptionId = selectedOptionId;
  qq.isCorrect = correct;
  qq.timeMs = timeMs;
  if (correct) quiz.score += 1;

  const attempt: StoredAttempt = {
    id: uid(),
    questionId,
    topicId: (raw.topicId as string) ?? "",
    selectedOptionId,
    isCorrect: correct,
    answeredAt: nowIso(),
  };
  mutate((s) => {
    const q = s.quizzes.find((x) => x.id === quizId);
    if (q) {
      const target = q.questions.find((x) => x.questionId === questionId);
      if (target) Object.assign(target, qq);
      q.score = quiz.score;
    }
    s.attempts.push(attempt);
  });

  return {
    status: 200,
    body: {
      result: {
        correct,
        correctOptionId: correctId,
        explanation: (raw.explanation as string) ?? "",
        explanationSi: (raw.explanationSi as string) ?? "",
        questionType: (raw.type as string) ?? "MCQ",
      },
    },
  };
}

export async function completeQuiz(body: Record<string, unknown>): Promise<Result> {
  const quizId = String(body.quizId ?? "");
  const state = getState();
  const quiz = state.quizzes.find((q) => q.id === quizId);
  if (!quiz) return { status: 500, body: { error: "Quiz not found" } };

  const score = quiz.questions.filter((q) => q.isCorrect === true).length;
  quiz.status = "COMPLETED";
  quiz.score = score;
  quiz.completedAt = nowIso();

  if (quiz.topicId) bumpTopicProgress(quiz.topicId);

  mutate((s) => {
    const q = s.quizzes.find((x) => x.id === quizId);
    if (q) {
      q.status = "COMPLETED";
      q.score = score;
      q.completedAt = quiz.completedAt;
    }
  });
  return { status: 200, body: { quiz: await toDetail(quiz) } };
}

function bumpTopicProgress(topicId: string): void {
  const state = getState();
  const attempts = state.attempts.filter((a) => a.topicId === topicId);
  const attempted = attempts.length;
  const correct = attempts.filter((a) => a.isCorrect).length;
  if (attempted === 0) return;
  const mastery = Math.round((correct / attempted) * 100);
  const status = mastery >= 80 ? "MASTERED" : mastery >= 50 ? "IN_PROGRESS" : "REVIEW";
  const now = nowIso();
  mutate((s) => {
    const existing = s.progress.find((p) => p.topicId === topicId && p.subtopicId === "");
    if (existing) {
      if (!(existing.status === "MASTERED" && status !== "MASTERED")) existing.status = status;
      existing.masteryScore = mastery;
      existing.completionPercent = mastery;
      existing.questionsAttempted = attempted;
      existing.questionsCorrect = correct;
      existing.lastStudiedAt = now;
      existing.updatedAt = now;
    } else {
      s.progress.push({
        id: uid(),
        userId: "offline-user",
        topicId,
        subtopicId: "",
        status,
        masteryScore: mastery,
        completionPercent: mastery,
        questionsAttempted: attempted,
        questionsCorrect: correct,
        studyMinutes: 0,
        confidence: null,
        lastStudiedAt: now,
        lastReviewedAt: null,
        createdAt: now,
        updatedAt: now,
      });
    }
  });
}

export async function listQuizTopics(): Promise<Result> {
  const db = await getContentDb();
  const topics = db.topics
    .slice()
    .sort(byOrder)
    .map((t) => {
      const questionCount = db.questions.filter((q) => q.topicId === t.id && q.status === "PUBLISHED").length;
      const unit = db.units.find((u) => u.id === t.unitId);
      const subject = db.subjects.find((s) => s.id === unit?.subjectId);
      return {
        id: t.id as string,
        title: t.title as string,
        slug: t.slug as string,
        unitTitle: (unit?.title as string) ?? "",
        subjectName: (subject?.name as string) ?? "",
        questionCount,
      };
    })
    .filter((t) => t.questionCount > 0);
  return { status: 200, body: { topics } };
}

function byOrder(a: { order?: unknown }, b: { order?: unknown }) {
  return Number(a.order ?? 0) - Number(b.order ?? 0);
}

export async function getMistakes(): Promise<Result> {
  const db = await getContentDb();
  const state = getState();
  const ids = wrongQuestionIds(state);
  const wrongQuestions: QuestionData[] = [];
  for (const id of ids) {
    const raw = await questionById(id);
    if (raw && raw.status === "PUBLISHED") wrongQuestions.push(serializeQuestion(raw, db));
  }
  return {
    status: 200,
    body: {
      wrongQuestions: wrongQuestions.slice(0, 50),
      weakTopics: weakTopicRows(state, db, 10),
    },
  };
}

export { topicPerformances, weakTopicRows, wrongQuestionIds };
