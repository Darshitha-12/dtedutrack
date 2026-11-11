import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const registerSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(100),
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[a-z]/, "Password must contain at least one lowercase letter")
    .regex(/[0-9]/, "Password must contain at least one number"),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

export type RegisterInput = z.infer<typeof registerSchema>;

export const profileUpdateSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  email: z.string().email().optional(),
});

export const examYearNumber = z.preprocess(
  (v) => {
    if (typeof v === "string" && v.trim() !== "") return Number(v);
    return v;
  },
  z.number().int().min(2000).max(2045).optional(),
);

export const studentProfileSchema = z.object({
  fullName: z.string().max(100).default(""),
  language: z.enum(["en", "si"]).default("en"),
  examYear: examYearNumber,
  examDate: z.string().optional(),
  examType: z.string().default("A/L Biology"),
  dailyStudyTarget: z.preprocess(
    (v) => (typeof v === "string" && v.trim() !== "" ? Number(v) : v),
    z.number().int().min(0).max(24).default(4),
  ),
  weeklyStudyTarget: z.preprocess(
    (v) => (typeof v === "string" && v.trim() !== "" ? Number(v) : v),
    z.number().int().min(0).max(168).default(28),
  ),
  targetGrade: z
    .enum(["A", "B", "C", "D", "E", "F", "S", "W"])
    .default("A"),
  currentLevel: z
    .enum(["beginner", "intermediate", "advanced", "O/L", "A/L", "University", "Other"])
    .default("intermediate"),
  preferredTime: z.enum(["morning", "afternoon", "evening", "night"]).default("morning"),
  weakTopics: z.array(z.string()).default([]),
  subjects: z.array(z.string()).default(["bio"]),
  onboarded: z.boolean().default(false),
});

export type StudentProfileInput = z.infer<typeof studentProfileSchema>;

export const onboardingSchema = z.object({
  fullName: z.string().min(2, "Please enter your name").max(100),
  language: z.enum(["en", "si"]),
  examYear: examYearNumber,
  examDate: z.string().optional(),
  dailyStudyTarget: z.preprocess(
    (v) => (typeof v === "string" && v.trim() !== "" ? Number(v) : v),
    z.number().int().min(1).max(16),
  ),
  weeklyStudyTarget: z.preprocess(
    (v) => (typeof v === "string" && v.trim() !== "" ? Number(v) : v),
    z.number().int().min(1).max(112).optional(),
  ),
  currentLevel: z
    .enum(["beginner", "intermediate", "advanced", "O/L", "A/L", "University"])
    .default("intermediate"),
  weakTopics: z.array(z.string()).default([]),
});

export type OnboardingInput = z.infer<typeof onboardingSchema>;

export const notificationPrefsSchema = z.object({
  browserEnabled: z.boolean().default(false),
  telegramEnabled: z.boolean().default(false),
  telegramToken: z.string().default(""),
  telegramChatId: z.string().default(""),
  telegramAll: z.boolean().default(false),
  ntfyEnabled: z.boolean().default(false),
  ntfyTopic: z.string().default(""),
});
