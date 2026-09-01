import { describe, it, expect } from "vitest";
import {
  loginSchema,
  registerSchema,
  studentProfileSchema,
  onboardingSchema,
  notificationPrefsSchema,
} from "@/lib/validations";

describe("login validation", () => {
  it("accepts valid login", () => {
    const result = loginSchema.safeParse({
      email: "test@example.com",
      password: "password123",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid email", () => {
    const result = loginSchema.safeParse({
      email: "not-an-email",
      password: "password123",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty password", () => {
    const result = loginSchema.safeParse({
      email: "test@example.com",
      password: "",
    });
    expect(result.success).toBe(false);
  });
});

describe("register validation", () => {
  it("accepts valid registration", () => {
    const result = registerSchema.safeParse({
      name: "Test User",
      email: "test@example.com",
      password: "StrongPass1",
      confirmPassword: "StrongPass1",
    });
    expect(result.success).toBe(true);
  });

  it("rejects weak password (no uppercase)", () => {
    const result = registerSchema.safeParse({
      name: "Test User",
      email: "test@example.com",
      password: "weakpass1",
      confirmPassword: "weakpass1",
    });
    expect(result.success).toBe(false);
  });

  it("rejects weak password (no number)", () => {
    const result = registerSchema.safeParse({
      name: "Test User",
      email: "test@example.com",
      password: "WeakPassWord",
      confirmPassword: "WeakPassWord",
    });
    expect(result.success).toBe(false);
  });

  it("rejects short password", () => {
    const result = registerSchema.safeParse({
      name: "Test User",
      email: "test@example.com",
      password: "Ab1",
      confirmPassword: "Ab1",
    });
    expect(result.success).toBe(false);
  });

  it("rejects mismatched passwords", () => {
    const result = registerSchema.safeParse({
      name: "Test User",
      email: "test@example.com",
      password: "StrongPass1",
      confirmPassword: "DifferentPass1",
    });
    expect(result.success).toBe(false);
  });

  it("rejects short name", () => {
    const result = registerSchema.safeParse({
      name: "A",
      email: "test@example.com",
      password: "StrongPass1",
      confirmPassword: "StrongPass1",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid email", () => {
    const result = registerSchema.safeParse({
      name: "Test User",
      email: "not-email",
      password: "StrongPass1",
      confirmPassword: "StrongPass1",
    });
    expect(result.success).toBe(false);
  });
});

describe("student profile validation", () => {
  it("accepts valid profile with defaults", () => {
    const result = studentProfileSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("accepts valid complete profile", () => {
    const result = studentProfileSchema.safeParse({
      fullName: "Test User",
      language: "si",
      examYear: 2027,
      examDate: "2027-03-15",
      examType: "A/L Biology",
      dailyStudyTarget: 6,
      weeklyStudyTarget: 42,
      targetGrade: "A",
      currentLevel: "advanced",
      preferredTime: "evening",
      weakTopics: ["genetics", "ecology"],
      subjects: ["bio", "chem"],
      onboarded: true,
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid language", () => {
    const result = studentProfileSchema.safeParse({
      language: "fr",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid target grade", () => {
    const result = studentProfileSchema.safeParse({
      targetGrade: "X",
    });
    expect(result.success).toBe(false);
  });

  it("rejects daily study target out of range", () => {
    const result = studentProfileSchema.safeParse({
      dailyStudyTarget: 30,
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid current level", () => {
    const result = studentProfileSchema.safeParse({
      currentLevel: "expert",
    });
    expect(result.success).toBe(false);
  });
});

describe("onboarding validation", () => {
  it("accepts valid onboarding data", () => {
    const result = onboardingSchema.safeParse({
      fullName: "Test Student",
      language: "en",
      examYear: 2027,
      dailyStudyTarget: 4,
      weeklyStudyTarget: 28,
      currentLevel: "intermediate",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty name", () => {
    const result = onboardingSchema.safeParse({
      fullName: "",
      language: "en",
      examYear: 2027,
      dailyStudyTarget: 4,
      weeklyStudyTarget: 28,
      currentLevel: "intermediate",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid exam year", () => {
    const result = onboardingSchema.safeParse({
      fullName: "Test Student",
      language: "en",
      examYear: 1999,
      dailyStudyTarget: 4,
      weeklyStudyTarget: 28,
      currentLevel: "intermediate",
    });
    expect(result.success).toBe(false);
  });

  it("accepts Sinhala language", () => {
    const result = onboardingSchema.safeParse({
      fullName: "Test Student",
      language: "si",
      examYear: 2027,
      dailyStudyTarget: 4,
      weeklyStudyTarget: 28,
      currentLevel: "beginner",
    });
    expect(result.success).toBe(true);
  });

  it("accepts optional weak topics", () => {
    const result = onboardingSchema.safeParse({
      fullName: "Test Student",
      language: "en",
      examYear: 2027,
      dailyStudyTarget: 4,
      weeklyStudyTarget: 28,
      currentLevel: "advanced",
      weakTopics: ["genetics", "molecular biology"],
    });
    expect(result.success).toBe(true);
  });
});

describe("notification preferences validation", () => {
  it("accepts default values", () => {
    const result = notificationPrefsSchema.safeParse({
      browserEnabled: false,
      telegramEnabled: false,
      telegramToken: "",
      telegramChatId: "",
      telegramAll: false,
      ntfyEnabled: false,
      ntfyTopic: "",
    });
    expect(result.success).toBe(true);
  });

  it("accepts all enabled", () => {
    const result = notificationPrefsSchema.safeParse({
      browserEnabled: true,
      telegramEnabled: true,
      telegramToken: "abc123",
      telegramChatId: "123456",
      telegramAll: true,
      ntfyEnabled: true,
      ntfyTopic: "biopulse-alerts",
    });
    expect(result.success).toBe(true);
  });
});
