import { z } from "zod";

export const questionTypeSchema = z.enum(["MCQ", "MULTIPLE_SELECT", "TRUE_FALSE"]);
export const questionDifficultySchema = z.enum(["easy", "medium", "hard"]);
export const quizModeSchema = z.enum(["PRACTICE", "WEAK_TOPICS", "RETRY_WRONG", "MOCK"]);

export const startQuizSchema = z.object({
  mode: quizModeSchema.default("PRACTICE"),
  topicId: z.string().min(1).nullable().optional(),
  count: z.number().int().min(1).max(50).default(10),
  difficulty: questionDifficultySchema.optional(),
});

export type StartQuizInput = z.infer<typeof startQuizSchema>;

export const answerQuestionSchema = z.object({
  quizId: z.string().min(1),
  questionId: z.string().min(1),
  selectedOptionId: z.string().min(1),
  timeMs: z.number().int().min(0).default(0),
});

export type AnswerQuestionInput = z.infer<typeof answerQuestionSchema>;

export const completeQuizSchema = z.object({
  quizId: z.string().min(1),
});

export type CompleteQuizInput = z.infer<typeof completeQuizSchema>;

export const listQuestionsSchema = z.object({
  topicId: z.string().optional(),
  unitId: z.string().optional(),
  difficulty: questionDifficultySchema.optional(),
  type: questionTypeSchema.optional(),
  limit: z.number().int().min(1).max(100).default(50),
});

export type ListQuestionsInput = z.infer<typeof listQuestionsSchema>;
