import { describe, it, expect } from "vitest";
import {
  toUserFacingError,
  toDiagnostic,
} from "@/features/ai/errors";

function makeOpenAIError(overrides: Record<string, unknown> = {}) {
  return Object.assign(
    new Error("You exceeded your current quota, please check your plan and billing details."),
    {
      status: 429,
      code: "insufficient_quota",
      error: {
        message: "You exceeded your current quota, please check your plan and billing details.",
        type: "insufficient_quota",
        code: "insufficient_quota",
      },
      ...overrides,
    },
  );
}

describe("toUserFacingError", () => {
  it("returns a quota-specific message for 429 insufficient_quota", () => {
    const msg = toUserFacingError(makeOpenAIError());
    expect(msg).toContain("quota");
    expect(msg).toContain("temporarily unavailable");
  });

  it("recognizes 429 with code property only", () => {
    expect(toUserFacingError(makeOpenAIError({ error: undefined }))).toContain("quota");
  });

  it("recognizes 429 via error.code without top-level code", () => {
    const err = makeOpenAIError({ code: null });
    expect(toUserFacingError(err)).toContain("quota");
  });

  it("recognizes 429 via message text when no code present", () => {
    const err = makeOpenAIError({ code: null, error: { message: "insufficient_quota exceeded" } });
    expect(toUserFacingError(err)).toContain("quota");
  });

  it("does NOT treat a generic 429 rate-limit as quota", () => {
    const err = makeOpenAIError({ code: "rate_limit_exceeded", error: { code: "rate_limit_exceeded", message: "Rate limit reached" } });
    expect(toUserFacingError(err)).toBe("Failed to get AI response. Please try again.");
  });

  it("does NOT treat other status codes as quota", () => {
    const err = makeOpenAIError({ status: 500, error: undefined });
    expect(toUserFacingError(err)).toBe("Failed to get AI response. Please try again.");
  });

  it("falls back to generic message for unknown errors", () => {
    expect(toUserFacingError(new Error("something else"))).toBe("Failed to get AI response. Please try again.");
  });

  it("handles null/undefined/string inputs without throwing", () => {
    expect(toUserFacingError(null)).toBe("Failed to get AI response. Please try again.");
    expect(toUserFacingError(undefined)).toBe("Failed to get AI response. Please try again.");
    expect(toUserFacingError("just a string")).toBe("Failed to get AI response. Please try again.");
  });

  it("never exposes the provider message or sensitive details", () => {
    const msg = toUserFacingError(makeOpenAIError());
    expect(msg).not.toContain("You exceeded your current quota");
    expect(msg).not.toContain("sk-proj");
    expect(msg).not.toContain("billing details.");
  });
});

describe("toDiagnostic", () => {
  it("returns a clear server-side quota diagnostic for 429 insufficient_quota", () => {
    const d = toDiagnostic(makeOpenAIError());
    expect(d).toMatch(/OpenAI quota\/billing error/i);
    expect(d).toContain("429");
    expect(d).toContain("insufficient_quota");
  });

  it("returns generic message for non-quota errors", () => {
    expect(toDiagnostic(new Error("boom"))).toBe("AI provider error: boom");
  });

  it("handles non-Error values", () => {
    expect(toDiagnostic("x")).toBe("AI provider error: unknown failure");
    expect(toDiagnostic(null)).toBe("AI provider error: unknown failure");
  });
});
