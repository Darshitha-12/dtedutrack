export type ReminderMode = "once" | "daily" | "weekly";

export interface Reminder {
  id: string;
  title: string;
  note: string;
  mode: ReminderMode;
  date: string;
  days: number[];
  time: string;
  enabled: boolean;
  lastFiredKey: string;
  createdAt: number;
}

export interface CreateReminderInput {
  title: string;
  note?: string;
  mode: ReminderMode;
  date?: string;
  days?: number[];
  time: string;
}

export const REMINDER_DAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export const REMINDERS_STORAGE_KEY = "biopulse_reminders_v1";

export function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function createReminder(input: CreateReminderInput): Reminder {
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  return {
    id,
    title: input.title.trim().slice(0, 90),
    note: (input.note || "").trim().slice(0, 300),
    mode: input.mode,
    date: input.date || "",
    days: input.days || [],
    time: input.time,
    enabled: true,
    lastFiredKey: "",
    createdAt: Date.now(),
  };
}

export const REMINDER_GRACE_MINUTES = 5;

export function reminderMatches(reminder: Reminder, now: Date): boolean {
  if (!reminder.enabled) return false;
  const dateKey = toDateKey(now);
  if (reminder.lastFiredKey === dateKey) return false;

  const [hh, mm] = reminder.time.split(":").map(Number);
  if (Number.isNaN(hh) || Number.isNaN(mm)) return false;

  const targetMin = hh * 60 + mm;
  const nowMin = now.getHours() * 60 + now.getMinutes();
  // Tolerant matching: fire within a short grace window after the set time so a
  // throttled/backgrounded tab or a slightly-late app open still alerts.
  if (nowMin < targetMin || nowMin > targetMin + REMINDER_GRACE_MINUTES) return false;

  switch (reminder.mode) {
    case "once":
      return reminder.date === dateKey;
    case "daily":
      return true;
    case "weekly":
      return reminder.days.includes(now.getDay());
    default:
      return false;
  }
}

export function loadReminders(): Reminder[] {
  try {
    const raw = localStorage.getItem(REMINDERS_STORAGE_KEY);
    if (!raw) return [];
    const data = JSON.parse(raw);
    return Array.isArray(data?.reminders) ? data.reminders : [];
  } catch {
    return [];
  }
}

export function saveReminders(reminders: Reminder[]): void {
  try {
    localStorage.setItem(
      REMINDERS_STORAGE_KEY,
      JSON.stringify({ reminders, updatedAt: Date.now() }),
    );
  } catch {
    /* storage full or blocked */
  }
}