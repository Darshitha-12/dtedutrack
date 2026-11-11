import { describe, it, expect } from "vitest";
import { avg, slopeOf, stdev, gradeOf, pctOf, pad, clamp, dateKey } from "@/lib/utils";

describe("utils", () => {
  it("pad zero-pads numbers", () => {
    expect(pad(0)).toBe("00");
    expect(pad(5)).toBe("05");
    expect(pad(12)).toBe("12");
  });

  it("clamp restricts values", () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(15, 0, 10)).toBe(10);
  });

  it("dateKey formats date as YYYY-MM-DD", () => {
    const d = new Date("2026-08-26T12:00:00Z");
    expect(dateKey(d)).toBe("2026-08-26");
  });

  it("pctOf calculates percentage", () => {
    expect(pctOf(62, 100)).toBe(62);
    expect(pctOf(3, 4)).toBe(75);
    expect(pctOf(0, 0)).toBe(0);
  });

  it("avg calculates mean", () => {
    expect(avg([10, 20, 30])).toBe(20);
    expect(avg([])).toBe(0);
    expect(avg([5])).toBe(5);
  });

  it("slopeOf calculates linear regression slope", () => {
    expect(slopeOf([10, 20, 30])).toBeCloseTo(10, 5);
    expect(slopeOf([30, 20, 10])).toBeCloseTo(-10, 5);
    expect(slopeOf([5])).toBe(0);
  });

  it("stdev calculates standard deviation", () => {
    const result = stdev([2, 4, 4, 4, 5, 5, 7, 9]);
    expect(result).toBeCloseTo(2.138, 2);
    expect(stdev([])).toBe(0);
    expect(stdev([5])).toBe(0);
  });

  it("gradeOf maps percentage to letter grade", () => {
    expect(gradeOf(80)).toBe("A");
    expect(gradeOf(75)).toBe("A");
    expect(gradeOf(70)).toBe("B");
    expect(gradeOf(60)).toBe("C");
    expect(gradeOf(45)).toBe("S");
    expect(gradeOf(30)).toBe("W");
    expect(gradeOf(0)).toBe("W");
  });
});
