import { describe, it, expect } from "vitest";
import {
  createReminder,
  reminderMatches,
  toDateKey,
} from "@/features/reminders/types";

function makeReminder(overrides: Partial<{ mode: "once" | "daily" | "weekly"; time: string }> = {}) {
  return createReminder({
    title: "Study",
    mode: overrides.mode ?? "daily",
    time: overrides.time ?? "08:00",
  });
}

describe("reminder matching", () => {
  it("matches a daily reminder at its time", () => {
    const r = makeReminder();
    const now = new Date(2026, 8, 1, 8, 0);
    expect(reminderMatches(r, now)).toBe(true);
  });

  it("ignores a daily reminder at other times", () => {
    const r = makeReminder();
    const now = new Date(2026, 8, 1, 9, 0);
    expect(reminderMatches(r, now)).toBe(false);
  });

  it("fires within the grace window if the exact minute was missed", () => {
    const r = makeReminder();
    const now = new Date(2026, 8, 1, 8, 3);
    expect(reminderMatches(r, now)).toBe(true);
  });

  it("does not fire beyond the grace window", () => {
    const r = makeReminder();
    const now = new Date(2026, 8, 1, 8, 6);
    expect(reminderMatches(r, now)).toBe(false);
  });

  it("matches a disabled reminder never", () => {
    const r = { ...makeReminder(), enabled: false };
    const now = new Date(2026, 8, 1, 8, 0);
    expect(reminderMatches(r, now)).toBe(false);
  });

  it("does not re-fire on the same day after firing", () => {
    const r = { ...makeReminder(), lastFiredKey: "2026-09-01" };
    const now = new Date(2026, 8, 1, 8, 0);
    expect(reminderMatches(r, now)).toBe(false);
  });

  it("re-fires daily on the next day", () => {
    const r = { ...makeReminder(), lastFiredKey: "2026-08-31" };
    const now = new Date(2026, 8, 1, 8, 0);
    expect(reminderMatches(r, now)).toBe(true);
  });

  it("matches a one-time reminder only on its date", () => {
    const r = makeReminder({ mode: "once", time: "18:30" }) as ReturnType<
      typeof makeReminder
    > & { mode: "once"; date: string };
    r.date = "2026-09-15";
    expect(reminderMatches(r, new Date(2026, 8, 15, 18, 30))).toBe(true);
    expect(reminderMatches(r, new Date(2026, 8, 16, 18, 30))).toBe(false);
  });

  it("matches a weekly reminder only on chosen weekdays", () => {
    const r = makeReminder({ mode: "weekly", time: "07:00" }) as ReturnType<
      typeof makeReminder
    > & { mode: "weekly"; days: number[] };
    r.days = [2, 3];
    // 2026-09-01 is a Tuesday (2)
    expect(reminderMatches(r, new Date(2026, 8, 1, 7, 0))).toBe(true);
    // 2026-09-02 is a Wednesday (3)
    expect(reminderMatches(r, new Date(2026, 8, 2, 7, 0))).toBe(true);
    // 2026-09-04 is a Friday (5) — not selected
    expect(reminderMatches(r, new Date(2026, 8, 4, 7, 0))).toBe(false);
  });
});

describe("date key helper", () => {
  it("formats as yyyy-mm-dd with padding", () => {
    expect(toDateKey(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
});