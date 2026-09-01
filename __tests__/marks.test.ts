import { describe, it, expect } from "vitest";
import { gradeOf, pctOf, avg, slopeOf } from "@/lib/utils";

describe("marks calculations", () => {
  it("pctOf handles edge cases", () => {
    expect(pctOf(0, 0)).toBe(0);
    expect(pctOf(50, 100)).toBe(50);
    expect(pctOf(1, 3)).toBe(33.3);
  });

  it("gradeOf grade bands", () => {
    expect(gradeOf(100)).toBe("A");
    expect(gradeOf(75)).toBe("A");
    expect(gradeOf(74.9)).toBe("B");
    expect(gradeOf(65)).toBe("B");
    expect(gradeOf(64.9)).toBe("C");
    expect(gradeOf(55)).toBe("C");
    expect(gradeOf(54.9)).toBe("S");
    expect(gradeOf(40)).toBe("S");
    expect(gradeOf(39.9)).toBe("W");
  });

  it("slopeOf detects upward trend", () => {
    const scores = [50, 60, 70, 80, 90];
    expect(slopeOf(scores)).toBeGreaterThan(0);
  });

  it("slopeOf detects downward trend", () => {
    const scores = [90, 80, 70, 60, 50];
    expect(slopeOf(scores)).toBeLessThan(0);
  });

  it("slopeOf returns 0 for flat data", () => {
    expect(slopeOf([50, 50, 50])).toBe(0);
  });

  it("avg works correctly", () => {
    expect(avg([60, 70, 80])).toBeCloseTo(70, 5);
    expect(avg([100])).toBe(100);
    expect(avg([])).toBe(0);
  });
});
