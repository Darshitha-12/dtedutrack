import { describe, it, expect } from "vitest";
import {
  generateTimeTable,
  findConflicts,
  findFreeSlots,
  normalizeBlocks,
  dayTotalAvailable,
  formatClock,
  parseTimeToMinutes,
  formatDuration,
  dayOfWeekIndex,
  dateKeyOf,
  todaySummary,
  type GenerateInput,
  type TimeBlock,
} from "@/features/planner/lib/scheduler";

function baseInput(overrides: Partial<GenerateInput> = {}): GenerateInput {
  return {
    days: [],
    weeklyTargetMin: 0,
    subjects: [],
    weakTopics: [],
    sessionLengthMin: 60,
    breakAfterMin: 60,
    breakDurationMin: 10,
    showBreaks: true,
    studyTypes: [{ type: "Learn", weight: 1 }],
    ...overrides,
  };
}

describe("planner clock helpers", () => {
  it("parses exact 12h/24h times to minutes", () => {
    expect(parseTimeToMinutes("05:30")).toBe(330);
    expect(parseTimeToMinutes("18:00")).toBe(1080);
    expect(parseTimeToMinutes("08:15")).toBe(495);
  });

  it("formats 12-hour AM/PM", () => {
    expect(formatClock(330, "12h")).toBe("05:30 AM");
    expect(formatClock(1080, "12h")).toBe("06:00 PM");
    expect(formatClock(0, "12h")).toBe("12:00 AM");
  });

  it("formats 24-hour and durations", () => {
    expect(formatClock(330, "24h")).toBe("05:30");
    expect(formatDuration(150)).toBe("2h 30m");
    expect(formatDuration(45)).toBe("45m");
  });
});

describe("availability normalization", () => {
  it("correctly normalizes and merges overlapping blocks", () => {
    const merged = normalizeBlocks([
      { startMinute: 480, endMinute: 600 },
      { startMinute: 540, endMinute: 720 },
    ]);
    expect(merged).toEqual([{ startMinute: 480, endMinute: 720 }]);
  });

  it("sums total available minutes across multiple blocks", () => {
    const blocks: TimeBlock[] = [
      { startMinute: 360, endMinute: 420 }, // 06:00-07:00 = 60
      { startMinute: 960, endMinute: 1080 }, // 16:00-18:00 = 120
      { startMinute: 1200, endMinute: 1290 }, // 20:00-21:30 = 90
    ];
    expect(dayTotalAvailable(blocks)).toBe(270);
  });

  it("computes day of week index (Mon=0)", () => {
    // 2026-08-26 is a Wednesday
    expect(dayOfWeekIndex(new Date("2026-08-26T00:00:00Z"))).toBe(2);
    expect(dateKeyOf(new Date(2026, 7, 26))).toBe("2026-08-26");
  });
});

describe("smart generation", () => {
  it("builds sessions only inside available blocks on enabled days", () => {
    const days = [
      { dayOfWeek: 0, enabled: true, dailyTargetMin: 0, blocks: [{ startMinute: 960, endMinute: 1200 }] }, // Mon 16:00-20:00
    ];
    const res = generateTimeTable(baseInput({ days, sessionLengthMin: 60, showBreaks: false, subjects: [{ subjectId: "bio", name: "Biology", priority: "High" }] }));
    expect(res.sessions.length).toBeGreaterThan(0);
    for (const s of res.sessions) {
      expect(s.startMinute).toBeGreaterThanOrEqual(960);
      expect(s.endMinute).toBeLessThanOrEqual(1200);
      expect(s.dayOfWeek).toBe(0);
    }
  });

  it("generates sessions across multiple blocks with correct per-day total", () => {
    const days = [
      { dayOfWeek: 0, enabled: true, dailyTargetMin: 0, blocks: [{ startMinute: 360, endMinute: 420 }, { startMinute: 960, endMinute: 1080 }, { startMinute: 1200, endMinute: 1290 }] },
    ];
    const res = generateTimeTable(baseInput({ days, sessionLengthMin: 60, showBreaks: false, subjects: [{ subjectId: "bio", name: "Biology", priority: "Medium" }] }));
    const totalPlanned = res.sessions.reduce((s, x) => s + (x.endMinute - x.startMinute), 0);
    expect(res.weeklyAvailableMin).toBe(270);
    expect(totalPlanned).toBe(240); // 4 full 60-min sessions = 240
  });

  it("respects weekly target cap", () => {
    const days = [
      { dayOfWeek: 0, enabled: true, dailyTargetMin: 0, blocks: [{ startMinute: 0, endMinute: 480 }] }, // 8h
      { dayOfWeek: 1, enabled: true, dailyTargetMin: 0, blocks: [{ startMinute: 0, endMinute: 480 }] },
    ];
    const res = generateTimeTable(baseInput({ days, weeklyTargetMin: 240, sessionLengthMin: 60, showBreaks: false, subjects: [{ subjectId: "a", name: "Bio", priority: "Medium" }] }));
    expect(res.weeklyPlannedMin).toBe(240);
    const totalPlanned = res.sessions.reduce((s, x) => s + (x.endMinute - x.startMinute), 0);
    expect(totalPlanned).toBe(240);
    expect(res.weeklyAvailableMin).toBe(960);
    expect(res.remainingMin).toBe(720);
  });

  it("respects per-day daily target", () => {
    const days = [
      { dayOfWeek: 0, enabled: true, dailyTargetMin: 120, blocks: [{ startMinute: 0, endMinute: 480 }] },
    ];
    const res = generateTimeTable(baseInput({ days, sessionLengthMin: 60, showBreaks: false, subjects: [{ subjectId: "a", name: "Bio", priority: "Medium" }] }));
    const totalPlanned = res.sessions.reduce((s, x) => s + (x.endMinute - x.startMinute), 0);
    expect(totalPlanned).toBe(120);
  });

  it("resolves needed session length", () => {
    const days = [
      { dayOfWeek: 0, enabled: true, dailyTargetMin: 0, blocks: [{ startMinute: 900, endMinute: 1025 }] }, // 125 min
    ];
    const res = generateTimeTable(baseInput({ days, sessionLengthMin: 45, showBreaks: false, subjects: [{ subjectId: "a", name: "Bio", priority: "Medium" }] }));
    // 125 / 45 = 2 full sessions (90 min), 3rd would need 45> remaining 35
    expect(res.sessions.length).toBe(2);
    for (const s of res.sessions) expect(s.endMinute - s.startMinute).toBe(45);
  });

  it("includes breaks and counts only study sessions", () => {
    const days = [
      { dayOfWeek: 0, enabled: true, dailyTargetMin: 0, blocks: [{ startMinute: 0, endMinute: 1440 }] },
    ];
    const res = generateTimeTable(baseInput({ days, weeklyTargetMin: 300, sessionLengthMin: 60, breakAfterMin: 60, breakDurationMin: 10, showBreaks: true, subjects: [{ subjectId: "a", name: "Bio", priority: "Medium" }] }));
    // All emitted objects are study sessions (breaks are not part of returned list).
    for (const s of res.sessions) expect(s.isBreak).toBe(false);
  });

  it("distributes subjects by priority (High subject appears more)", () => {
    const days = [
      { dayOfWeek: 0, enabled: true, dailyTargetMin: 0, blocks: [{ startMinute: 0, endMinute: 600 }] },
    ];
    const res = generateTimeTable(baseInput({
      days,
      weeklyTargetMin: 360,
      sessionLengthMin: 60,
      showBreaks: false,
      subjects: [
        { subjectId: "bio", name: "Biology", priority: "High" },
        { subjectId: "chem", name: "Chemistry", priority: "Low" },
        { subjectId: "phy", name: "Physics", priority: "Medium" },
      ],
    }));
    const bio = res.sessions.filter((s) => s.subjectId === "bio").length;
    const chem = res.sessions.filter((s) => s.subjectId === "chem").length;
    expect(bio).toBeGreaterThan(chem);
    for (const s of res.sessions) expect(s.priority).toBeDefined();
  });

  it("tags weak topics on WeakTopic sessions", () => {
    const days = [
      { dayOfWeek: 0, enabled: true, dailyTargetMin: 0, blocks: [{ startMinute: 0, endMinute: 300 }] },
    ];
    const res = generateTimeTable(baseInput({
      days,
      sessionLengthMin: 60,
      showBreaks: false,
      weakTopics: ["Genetics"],
      studyTypes: [{ type: "WeakTopic", weight: 1 }],
      subjects: [{ subjectId: "bio", name: "Biology", priority: "Medium" }],
    }));
    const weak = res.sessions.find((s) => s.type === "WeakTopic");
    expect(weak?.topicTitle).toBe("Genetics");
  });

  it("falls back to a generic subject when none provided", () => {
    const days = [
      { dayOfWeek: 0, enabled: true, dailyTargetMin: 60, blocks: [{ startMinute: 0, endMinute: 120 }] },
    ];
    const res = generateTimeTable(baseInput({ days, sessionLengthMin: 30, showBreaks: false, subjects: [] }));
    expect(res.sessions.length).toBeGreaterThan(0);
    expect(res.sessions[0].subjectName).toBe("Study");
  });
});

describe("conflict detection", () => {
  it("detects overlapping sessions", () => {
    const existing = [
      { id: "1", dayOfWeek: 0, startMinute: 1080, endMinute: 1170 }, // 18:00-19:30
    ];
    const conflicts = findConflicts(existing, { dayOfWeek: 0, startMinute: 1140, endMinute: 1200 }); // 19:00-20:00
    expect(conflicts.length).toBe(1);
    expect(conflicts[0].overlapMin).toBe(30);
  });

  it("does not detect conflict for adjacent non-overlapping sessions", () => {
    const existing = [
      { id: "1", dayOfWeek: 0, startMinute: 1080, endMinute: 1140 },
    ];
    const conflicts = findConflicts(existing, { dayOfWeek: 0, startMinute: 1140, endMinute: 1200 });
    expect(conflicts.length).toBe(0);
  });

  it("does not detect conflict across different days/dates", () => {
    const existing = [
      { id: "1", date: "2026-09-03", startMinute: 1080, endMinute: 1200 },
    ];
    const conflicts = findConflicts(existing, { dayOfWeek: 0, startMinute: 1080, endMinute: 1200 });
    expect(conflicts.length).toBe(0);
  });
});

describe("free slot suggestions (reschedule)", () => {
  it("returns available free periods given blocks and booked sessions", () => {
    const blocks: TimeBlock[] = [
      { startMinute: 1020, endMinute: 1290 }, // 17:00-21:30
    ];
    const booked = [
      { dayOfWeek: 0, startMinute: 1080, endMinute: 1140 }, // 18:00-19:00
    ];
    const slots = findFreeSlots(blocks, booked);
    expect(slots).toEqual([
      { startMinute: 1020, endMinute: 1080 }, // 17:00-18:00
      { startMinute: 1140, endMinute: 1290 }, // 19:00-21:30
    ]);
  });
});

describe("today summary", () => {
  it("computes scheduled/completed/remaining from real data", () => {
    const sessions = [
      { id: "1", dayOfWeek: 1, subjectName: "Biology", type: "Revision" as const, priority: "High" as const, status: "completed" as const, startMinute: 1080, endMinute: 1140, recurrence: "Weekly" as const, reminderMin: 15 },
      { id: "2", dayOfWeek: 1, subjectName: "Chemistry", type: "Learn" as const, priority: "Medium" as const, status: "scheduled" as const, startMinute: 1170, endMinute: 1230, recurrence: "Weekly" as const, reminderMin: 0 },
    ];
    const now = new Date(2026, 7, 25, 19, 45); // Tue 19:45
    const sum = todaySummary(sessions, now);
    expect(sum.dayOfWeek).toBe(1);
    expect(sum.scheduledMin).toBe(120);
    expect(sum.completedMin).toBe(60);
    expect(sum.remainingMin).toBe(60);
    expect(sum.current?.subjectName).toBe("Chemistry");
  });
});
