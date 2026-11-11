import { describe, it, expect } from "vitest";
import { nextOccurrence, type Alarm } from "@/features/alarms/types/alarm";

function makeAlarm(overrides: Partial<Alarm> = {}): Alarm {
  return {
    id: "test-1",
    kind: "fixed",
    time: "08:00",
    fireAt: 0,
    label: "Test alarm",
    subjectId: null,
    priority: "normal",
    sound: "chime",
    tts: true,
    days: [],
    enabled: true,
    fired: false,
    lastFired: 0,
    snoozeCount: 0,
    reviewTopicId: null,
    createdAt: Date.now(),
    ...overrides,
  };
}

describe("alarm scheduler", () => {
  it("nextOccurrence returns future date for time-based alarm", () => {
    const alarm = makeAlarm({ time: "14:30", days: [] });
    const now = new Date(2026, 7, 26, 10, 0); // Aug 26, 2026 10:00
    const next = nextOccurrence(alarm, now);
    expect(next).not.toBeNull();
    expect(next!.getHours()).toBe(14);
    expect(next!.getMinutes()).toBe(30);
  });

  it("nextOccurrence filters by day of week", () => {
    const alarm = makeAlarm({ time: "08:00", days: [3] }); // Wed
    // Use a fixed UTC date that is a Wednesday
    const now = new Date("2026-08-26T09:00:00Z"); // Aug 26 2026 = Wednesday
    const next = nextOccurrence(alarm, now);
    expect(next).not.toBeNull();
    expect(next!.getUTCDay()).toBe(3); // Wednesday
  });

  it("nextOccurrence returns null for past fireAt", () => {
    const alarm = makeAlarm({ fireAt: Date.now() - 100000 });
    const next = nextOccurrence(alarm);
    expect(next).toBeNull();
  });

  it("nextOccurrence returns future fireAt if in future", () => {
    const future = Date.now() + 3600000;
    const alarm = makeAlarm({ fireAt: future });
    const next = nextOccurrence(alarm);
    expect(next).not.toBeNull();
    expect(next!.getTime()).toBe(future);
  });
});
