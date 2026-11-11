import { z } from "zod";

export const contentStatusSchema = z.enum(["DRAFT", "VERIFIED", "DEMO", "ARCHIVED"]);
export const contentSourceSchema = z.enum(["DEMO", "OFFICIAL", "TEACHER_CREATED", "AI_GENERATED", "USER_CREATED"]);
export const difficultySchema = z.enum(["beginner", "intermediate", "advanced"]);
export const importanceSchema = z.enum(["low", "normal", "high", "critical"]);
export const progressStatusSchema = z.enum(["NOT_STARTED", "IN_PROGRESS", "REVIEW", "MASTERED"]);
export const confidenceSchema = z.enum(["low", "medium", "high"]);

export const updateProgressSchema = z.object({
  topicId: z.string().min(1),
  subtopicId: z.string().nullable().optional(),
  status: progressStatusSchema.optional(),
  masteryScore: z.number().min(0).max(100).optional(),
  completionPercent: z.number().min(0).max(100).optional(),
  studyMinutes: z.number().int().min(0).optional(),
  confidence: confidenceSchema.optional(),
});

export type UpdateProgressInput = z.infer<typeof updateProgressSchema>;

export const searchQuerySchema = z.object({
  q: z.string().min(1).max(200),
  subjectId: z.string().optional(),
  limit: z.number().int().min(1).max(50).default(20),
});

export type SearchQuery = z.infer<typeof searchQuerySchema>;
