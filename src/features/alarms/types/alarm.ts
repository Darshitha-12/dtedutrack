import { z } from "zod";
import type { SubjectId } from "@/types/subject";

export const AlarmPriority = z.enum(["normal", "high"]);
export type AlarmPriority = z.infer<typeof AlarmPriority>;

export const AlarmKind = z.enum(["fixed", "reminder", "snooze", "hydration", "review"]);
export type AlarmKind = z.infer<typeof AlarmKind>;

export const AlarmSound = z.enum(["chime", "digital", "bio"]);
export type AlarmSound = z.infer<typeof AlarmSound>;

export interface Alarm {
  id: string;
  kind: AlarmKind;
  time: string; // HH:MM for recurring
  fireAt: number; // timestamp for one-shot
  label: string;
  subjectId: SubjectId | null;
  priority: AlarmPriority;
  sound: AlarmSound;
  tts: boolean;
  days: number[]; // 0=Sun..6=Sat, empty = one-time
  enabled: boolean;
  fired: boolean;
  lastFired: number;
  snoozeCount: number;
  reviewTopicId: string | null;
  createdAt: number;
}

export const createAlarmSchema = z.object({
  time: z.string().regex(/^\d{2}:\d{2}$/),
  label: z.string().min(1).max(90),
  subjectId: z.string().nullable().optional(),
  priority: AlarmPriority.default("normal"),
  sound: AlarmSound.default("chime"),
  tts: z.boolean().default(true),
  days: z.array(z.number().min(0).max(6)).default([]),
  kind: AlarmKind.default("fixed"),
  fireAt: z.number().optional(),
});

export type CreateAlarmInput = z.infer<typeof createAlarmSchema>;

export function nextOccurrence(alarm: Alarm, from?: Date): Date | null {
  const now = from ?? new Date();

  if (alarm.fireAt) {
    const fireDate = new Date(alarm.fireAt);
    return fireDate > now ? fireDate : null;
  }

  if (!alarm.time) return null;

  const [hh, mm] = alarm.time.split(":").map(Number);

  for (let dayOffset = 0; dayOffset <= 8; dayOffset++) {
    const candidate = new Date(now);
    candidate.setDate(candidate.getDate() + dayOffset);
    candidate.setHours(hh, mm, 0, 0);

    if (candidate <= now) continue;

    if (alarm.days.length > 0 && !alarm.days.includes(candidate.getDay())) {
      continue;
    }

    return candidate;
  }

  return null;
}
