import { db } from "@/lib/db";
import type {
  QuestionData,
  QuestionType,
  QuestionDifficulty,
  QuestionStatus,
  QuizDetailData,
  QuizQuestionData,
  QuizSummaryData,
  AnswerResult,
  TopicPerformance,
  WeakTopicInfo,
  QuizMode,
  QuizStatus,
} from "./types";
import type { StartQuizInput, ListQuestionsInput, AnswerQuestionInput } from "./validations";

type QuestionRow = {
  id: string; subjectId: string; unitId: string; topicId: string;
  type: string; difficulty: string; stem: string; stemSi: string;
  explanation: string; explanationSi: string; marks: number; tags: string[];
  status: string; source: string;
  topic: { slug: string; title: string };
  unit: { slug: string; title: string };
  options: Array<{ id: string; text: string; textSi: string; isCorrect: boolean; order: number }>;
};

function serializeQuestionForPractice(q: QuestionRow): QuestionData {
  return {
    id: q.id,
    subjectId: q.subjectId,
    unitId: q.unitId,
    topicId: q.topicId,
    type: q.type as QuestionType,
    difficulty: q.difficulty as QuestionDifficulty,
    stem: q.stem,
    stemSi: q.stemSi,
    explanation: q.explanation,
    explanationSi: q.explanationSi,
    marks: q.marks,
    tags: q.tags,
    status: q.status as QuestionStatus,
    source: q.source,
    topicSlug: q.topic.slug,
    topicTitle: q.topic.title,
    unitSlug: q.unit.slug,
    unitTitle: q.unit.title,
    options: q.options
      .sort((a, b) => a.order - b.order)
      .map((o) => ({ id: o.id, text: o.text, textSi: o.textSi, order: o.order })),
  };
}

const questionInclude = {
  topic: { select: { slug: true, title: true } },
  unit: { select: { slug: true, title: true } },
  options: { select: { id: true, text: true, textSi: true, isCorrect: true, order: true } },
} as const;

// ---- Listing / browsing ----

export async function listQuestions(input: ListQuestionsInput): Promise<QuestionData[]> {
  const questions = await db.question.findMany({
    where: {
      status: "PUBLISHED",
      ...(input.topicId ? { topicId: input.topicId } : {}),
      ...(input.unitId ? { unitId: input.unitId } : {}),
      ...(input.difficulty ? { difficulty: input.difficulty } : {}),
      ...(input.type ? { type: input.type } : {}),
    },
    take: input.limit,
    include: questionInclude,
    orderBy: { createdAt: "asc" },
  });
  return questions.map(serializeQuestionForPractice);
}

export async function listPublishedCounts(): Promise<{ total: number; byTopic: Record<string, number> }> {
  const questions = await db.question.findMany({
    where: { status: "PUBLISHED" },
    select: { topicId: true },
  });
  const byTopic: Record<string, number> = {};
  let total = 0;
  for (const q of questions) {
    total += 1;
    byTopic[q.topicId] = (byTopic[q.topicId] || 0) + 1;
  }
  return { total, byTopic };
}

// ---- Full question (includes correct info, server-side only) ----

async function getQuestionForAnswer(questionId: string): Promise<{
  id: string; type: string; explanation: string; explanationSi: string;
  options: Array<{ id: string; isCorrect: boolean }>;
}> {
  const q = await db.question.findUnique({
    where: { id: questionId },
    select: {
      id: true, type: true, explanation: true, explanationSi: true,
      options: { select: { id: true, isCorrect: true } },
    },
  });
  if (!q) throw new Error("Question not found");
  return q;
}

// ---- Quiz lifecycle ----

export async function startQuiz(
  userId: string,
  input: StartQuizInput,
): Promise<QuizDetailData> {
  const mode = input.mode;
  const where: Record<string, unknown> = { status: "PUBLISHED" };
  if (input.topicId) where.topicId = input.topicId;
  if (input.difficulty) where.difficulty = input.difficulty;

  let questionIds: string[] = [];

  if (mode === "WEAK_TOPICS") {
    const weak = await db.question.findMany({
      where: {
        status: "PUBLISHED",
        topicId: { in: await getWeakTopicIds(userId, 0.7) },
        ...(input.difficulty ? { difficulty: input.difficulty } : {}),
      },
      select: { id: true },
    });
    questionIds = questionIdsFrom(weak);
  } else if (mode === "RETRY_WRONG") {
    const wrong = await getWrongQuestionIds(userId, input.topicId ?? undefined);
    if (wrong.length > 0) {
      questionIds = wrong;
    } else {
      const fallback = await db.question.findMany({ where, select: { id: true }, take: input.count });
      questionIds = questionIdsFrom(fallback);
    }
  } else {
    const pool = await db.question.findMany({ where, select: { id: true } });
    questionIds = questionIdsFrom(pool);
  }

  if (questionIds.length === 0) {
    throw new Error("No questions available for this selection");
  }

  const picked = pickRandom(questionIds, input.count);

  const quiz = await db.quiz.create({
    data: {
      userId,
      topicId: input.topicId || null,
      mode,
      status: "IN_PROGRESS",
      total: picked.length,
      questions: {
        create: picked.map((id, idx) => ({ questionId: id, order: idx })),
      },
    },
    select: { id: true },
  });

  return getQuiz(userId, quiz.id);
}

function questionIdsFrom(list: Array<{ id: string }>): string[] {
  return list.map((x) => x.id);
}

function pickRandom<T>(arr: T[], count: number): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, count);
}

export async function getQuiz(userId: string, quizId: string): Promise<QuizDetailData> {
  const quiz = await db.quiz.findFirst({
    where: { id: quizId, userId },
    include: {
      questions: {
        orderBy: { order: "asc" },
        include: { question: { include: questionInclude } },
      },
    },
  });
  if (!quiz) throw new Error("Quiz not found");
  return serializeQuiz(quiz);
}

function serializeQuiz(quiz: any): QuizDetailData {
  const questions: QuizQuestionData[] = quiz.questions.map((qq: any) => ({
    id: qq.id,
    quizId: qq.quizId,
    questionId: qq.questionId,
    order: qq.order,
    status: qq.status,
    selectedOptionId: qq.selectedOptionId,
    isCorrect: qq.isCorrect,
    timeMs: qq.timeMs,
    question: serializeQuestionForPractice(qq.question),
  }));
  return {
    id: quiz.id,
    mode: quiz.mode,
    status: quiz.status,
    score: quiz.score,
    total: quiz.total,
    startedAt: quiz.startedAt.toISOString(),
    completedAt: quiz.completedAt ? quiz.completedAt.toISOString() : null,
    createdAt: quiz.createdAt.toISOString(),
    questions,
  };
}

// ---- Answering ----

export async function answerQuestion(
  userId: string,
  input: AnswerQuestionInput,
): Promise<AnswerResult> {
  const { quiz, qq } = await findPendingQuizQuestion(userId, input.quizId, input.questionId);
  if (!qq || qq.status === "ANSWERED") {
    return {
      correct: qq?.isCorrect === true,
      correctOptionId: "",
      explanation: "",
      explanationSi: "",
      questionType: "MCQ",
    };
  }

  const q = await getQuestionForAnswer(input.questionId);
  const correctOption = q.options.find((o) => o.isCorrect);
  const correctOptionId = correctOption?.id || "";
  const correct = q.options.some(
    (o) => o.id === input.selectedOptionId && o.isCorrect,
  );

  const [, updated] = await db.$transaction([
    db.quizQuestion.update({
      where: { id: qq.id },
      data: {
        status: "ANSWERED",
        selectedOptionId: input.selectedOptionId,
        isCorrect: correct,
        timeMs: input.timeMs,
        answeredAt: new Date(),
      },
    }),
    db.questionAttempt.create({
      data: {
        userId,
        questionId: input.questionId,
        selectedOptionId: input.selectedOptionId,
        isCorrect: correct,
      },
    }),
  ]);

  if (correct) {
    await db.quiz.update({
      where: { id: quiz.id },
      data: { score: { increment: 1 } },
    });
  }

  void updated;

  return {
    correct,
    correctOptionId,
    explanation: q.explanation,
    explanationSi: q.explanationSi,
    questionType: q.type as QuestionType,
  };
}

async function findPendingQuizQuestion(
  userId: string,
  quizId: string,
  questionId: string,
): Promise<{ quiz: { id: string }; qq: { id: string; status: string; isCorrect: boolean | null } | null }> {
  const quiz = await db.quiz.findFirst({ where: { id: quizId, userId } });
  if (!quiz) throw new Error("Quiz not found");
  const qq = await db.quizQuestion.findFirst({
    where: { quizId, questionId },
  });
  return { quiz: { id: quiz.id }, qq };
}

// ---- Completion ----

export async function completeQuiz(userId: string, quizId: string): Promise<QuizDetailData> {
  const quiz = await db.quiz.findFirst({ where: { id: quizId, userId } });
  if (!quiz) throw new Error("Quiz not found");

  const answered = await db.quizQuestion.findMany({
    where: { quizId, isCorrect: true },
    select: { id: true },
  });

  await db.quiz.update({
    where: { id: quizId },
    data: { status: "COMPLETED", score: answered.length, completedAt: new Date() },
  });

  // Bump topic progress based on accuracy
  if (quiz.topicId) {
    await bumpTopicProgress(userId, quiz.topicId);
  }

  return getQuiz(userId, quizId);
}

async function bumpTopicProgress(userId: string, topicId: string) {
  const attempts = await db.questionAttempt.findMany({
    where: { userId, question: { topicId } },
    select: { isCorrect: true },
  });
  if (attempts.length === 0) return;

  const correct = attempts.filter((a) => a.isCorrect).length;
  const accuracy = correct / attempts.length;
  const mastery = Math.round(accuracy * 100);

  const existing = await db.userTopicProgress.findUnique({
    where: { userId_topicId_subtopicId: { userId, topicId, subtopicId: "" } },
  });

  const computedStatus = mastery >= 80 ? "MASTERED" : mastery >= 50 ? "IN_PROGRESS" : "REVIEW";
  // Never downgrade an already mastered topic; otherwise recompute from all attempts.
  const nextStatus =
    existing && existing.status === "MASTERED" ? "MASTERED" : computedStatus;

  await db.userTopicProgress.upsert({
    where: { userId_topicId_subtopicId: { userId, topicId, subtopicId: "" } },
    create: {
      userId,
      topicId,
      subtopicId: "",
      questionsAttempted: attempts.length,
      questionsCorrect: correct,
      masteryScore: mastery,
      status: nextStatus,
      completionPercent: Math.round(mastery),
      lastStudiedAt: new Date(),
    },
    update: {
      questionsAttempted: attempts.length,
      questionsCorrect: correct,
      masteryScore: mastery,
      status: nextStatus,
      completionPercent: Math.round(mastery),
      lastStudiedAt: new Date(),
    },
  });
}

// ---- History ----

export async function getUserQuizzes(userId: string): Promise<QuizSummaryData[]> {
  const quizzes = await db.quiz.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return quizzes.map((q) => ({
    id: q.id,
    mode: q.mode as QuizMode,
    status: q.status as QuizStatus,
    score: q.score,
    total: q.total,
    startedAt: q.startedAt.toISOString(),
    completedAt: q.completedAt ? q.completedAt.toISOString() : null,
    createdAt: q.createdAt.toISOString(),
  }));
}

// ---- Weak-topic engine ----

export async function getWeakTopicIds(userId: string, threshold = 0.7): Promise<string[]> {
  const perf = await getTopicPerformances(userId);
  return perf.filter((p) => p.attempted >= 2 && p.accuracy < threshold).map((p) => p.topicId);
}

export async function getWeakTopics(userId: string, limit = 5): Promise<WeakTopicInfo[]> {
  const perf = await getTopicPerformances(userId);
  const weak = perf
    .filter((p) => p.attempted >= 2 && p.accuracy < 0.7)
    .sort((a, b) => a.accuracy - b.accuracy)
    .slice(0, limit);
  return weak.map((p) => ({
    topicId: p.topicId,
    topicTitle: p.topicTitle,
    topicSlug: p.topicSlug,
    accuracy: p.accuracy,
    attempted: p.attempted,
  }));
}

export async function getTopicPerformances(userId: string): Promise<TopicPerformance[]> {
  const rows = await db.questionAttempt.findMany({
    where: { userId },
    select: {
      isCorrect: true,
      question: { select: { topicId: true, topic: { select: { title: true, slug: true } } } },
    },
  });

  const map = new Map<string, { topicTitle: string; topicSlug: string; attempted: number; correct: number; timeSum: number; timeCount: number }>();
  for (const r of rows) {
    const t = r.question.topicId;
    const entry = map.get(t) || {
      topicTitle: r.question.topic.title,
      topicSlug: r.question.topic.slug,
      attempted: 0,
      correct: 0,
      timeSum: 0,
      timeCount: 0,
    };
    entry.attempted += 1;
    if (r.isCorrect) entry.correct += 1;
    map.set(t, entry);
  }

  return Array.from(map.entries()).map(([topicId, e]) => ({
    topicId,
    topicTitle: e.topicTitle,
    topicSlug: e.topicSlug,
    attempted: e.attempted,
    correct: e.correct,
    accuracy: e.attempted > 0 ? e.correct / e.attempted : 0,
    averageTimeMs: e.timeCount > 0 ? Math.round(e.timeSum / e.timeCount) : 0,
  }));
}

export async function getWrongQuestionIds(userId: string, topicId?: string): Promise<string[]> {
  const wrongAttempts = await db.questionAttempt.findMany({
    where: {
      userId,
      isCorrect: false,
      ...(topicId ? { question: { topicId } } : {}),
    },
    select: { questionId: true },
    orderBy: { answeredAt: "desc" },
    distinct: ["questionId"],
  });
  return wrongAttempts.map((a) => a.questionId).slice(0, 50);
}

export async function getWrongQuestionSummaries(
  userId: string,
  limit = 20,
): Promise<QuestionData[]> {
  const ids = await getWrongQuestionIds(userId);
  if (ids.length === 0) return [];
  const questions = await db.question.findMany({
    where: { id: { in: ids.slice(0, limit) }, status: "PUBLISHED" },
    include: questionInclude,
  });
  return questions.map(serializeQuestionForPractice);
}
