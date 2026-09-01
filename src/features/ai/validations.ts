import { z } from "zod";

const aiModeEnum = z.enum([
  "tutor", "beginner", "deep", "revision", "socratic",
  "exam", "compare", "quiz", "mistake",
]);

export const chatRequestSchema = z.object({
  conversationId: z.string().uuid().optional(),
  message: z.string().min(1).max(4000),
  topicId: z.string().optional(),
  subtopicId: z.string().optional(),
  mode: aiModeEnum.optional().default("tutor"),
  language: z.enum(["en", "si"]).optional().default("en"),
});

export type ChatRequestInput = z.infer<typeof chatRequestSchema>;

export const conversationIdSchema = z.object({
  conversationId: z.string().uuid(),
});

export const updateTitleSchema = z.object({
  title: z.string().min(1).max(200),
});

export const aiModeSchema = z.object({
  mode: aiModeEnum,
});
