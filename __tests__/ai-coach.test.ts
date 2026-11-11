import { describe, it, expect, vi, afterEach } from "vitest";
import { computeAdvice } from "@/services/ai/rule-engine";
import type { MarkRecord } from "@/features/marks/types/marks";

function makeMark(
  subjectId: "bio" | "chem" | "phy" | "agri",
  type: "MCQ" | "Structured" | "Essay",
  score: number,
  total: number,
  date: string,
): MarkRecord {
  return { id: `${subjectId}-${type}-${date}`, subjectId, type, score, total, date };
}

describe("AI coach rule engine", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("detects score drops", () => {
    const marks: MarkRecord[] = [
      makeMark("bio", "MCQ", 80, 100, "2026-07-01"),
      makeMark("bio", "MCQ", 82, 100, "2026-07-02"),
      makeMark("bio", "MCQ", 70, 100, "2026-07-03"),
      makeMark("bio", "MCQ", 65, 100, "2026-07-04"),
    ];
    const advice = computeAdvice(marks, 300, { bio: 180 });
    const drops = advice.filter((a) => a.icon === "📉");
    expect(drops.length).toBeGreaterThan(0);
  });

  it("detects core strengths", () => {
    const marks: MarkRecord[] = [
      makeMark("bio", "MCQ", 90, 100, "2026-07-01"),
      makeMark("bio", "MCQ", 88, 100, "2026-07-02"),
      makeMark("bio", "MCQ", 92, 100, "2026-07-03"),
      makeMark("bio", "MCQ", 95, 100, "2026-07-04"),
    ];
    const advice = computeAdvice(marks, 300, { bio: 180 });
    const strengths = advice.filter((a) => a.icon === "🏆");
    expect(strengths.length).toBeGreaterThan(0);
  });

  it("returns fallback when no data and before 10 AM", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-26T00:00:00Z"));
    const advice = computeAdvice([], 0, {});
    const noStudy = advice.filter((a) => a.icon === "🌱");
    const fallback = advice.filter((a) => a.icon === "✨");
    expect(noStudy.length).toBe(0);
    expect(fallback.length).toBe(1);
  });

  it("detects no study today after 10 AM", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-26T04:30:00Z"));
    const advice = computeAdvice([], 0, {});
    const noStudy = advice.filter((a) => a.icon === "🌱");
    expect(noStudy.length).toBe(1);
  });
});
