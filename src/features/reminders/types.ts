import { CUSTOM_SOUND_PREFIX } from "@/features/alarms/lib/custom-sounds";

export type ReminderMode = "once" | "daily" | "weekly";

/** A built-in tone, or `custom:<soundId>` from the user's own audio library. */
export type ReminderSound =
  | "chime"
  | "digital"
  | "bio"
  | "study"
  | "romantic"
  | `custom:${string}`;

/**
 * Must list every value the shared {@link SoundPicker} can produce: the picker offers the two
 * music loops as well, and coercing those to "chime" made every reminder sound the same.
 */
const BUILT_IN_REMINDER_SOUNDS = ["chime", "digital", "bio", "study", "romantic"] as const;

export type ReminderKind = "standard" | "revision";

/** Spaced-repetition state: which revision of the plan this reminder waits for. */
export interface RevisionPlan {
  /** Day offsets from the study day, e.g. [1, 3, 7, 21]. */
  gaps: number[];
  /** Index in `gaps` of the revision this reminder is currently waiting for. */
  stage: number;
  /** The day the topic was studied (YYYY-MM-DD). */
  startedOn: string;
}

export interface RevisionPreset {
  id: string;
  label: string;
  hint: string;
  gaps: number[];
}

/**
 * Revision rhythm right before the memory fades (the "අමතක නොවෙන්න" method):
 * 1 → 3 → 7 → 21 days keeps a term's work alive without cramming.
 */
export const REVISION_PRESETS: RevisionPreset[] = [
  { id: "classic", label: "1 · 3 · 7 · 21", hint: "Classic forgetting curve", gaps: [1, 3, 7, 21] },
  { id: "exam", label: "1 · 2 · 4 · 8 · 16", hint: "Exam sprint (doubles each time)", gaps: [1, 2, 4, 8, 16] },
  { id: "light", label: "1 · 7 · 30", hint: "Light maintenance", gaps: [1, 7, 30] },
];

export interface Reminder {
  id: string;
  title: string;
  note: string;
  mode: ReminderMode;
  date: string;
  days: number[];
  time: string;
  sound: ReminderSound;
  /** Announce title/note with the TTS voice when it fires (default on). */
  tts: boolean;
  enabled: boolean;
  lastFiredKey: string;
  createdAt: number;
  /** Optional link to a YouTube/video to open from the reminder popup. */
  videoUrl?: string;
  /** Optional video title cached for display. */
  videoTitle?: string;
  /** "revision" reminders walk a spaced-repetition plan and reschedule themselves. */
  kind?: ReminderKind;
  revision?: RevisionPlan;
}

export interface CreateReminderInput {
  title: string;
  note?: string;
  mode: ReminderMode;
  date?: string;
  days?: number[];
  time: string;
  sound?: ReminderSound;
  tts?: boolean;
  videoUrl?: string;
  videoTitle?: string;
  kind?: ReminderKind;
  revision?: RevisionPlan;
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

/** Accepts built-in tones plus `custom:<soundId>` references. */
export function normalizeReminderSound(value: unknown): ReminderSound {
  if (
    typeof value === "string" &&
    (BUILT_IN_REMINDER_SOUNDS as readonly string[]).includes(value)
  ) {
    return value as ReminderSound;
  }
  if (
    typeof value === "string" &&
    value.startsWith(CUSTOM_SOUND_PREFIX) &&
    value.length > CUSTOM_SOUND_PREFIX.length
  ) {
    return value as ReminderSound;
  }
  return "chime";
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
    sound: normalizeReminderSound(input.sound),
    tts: input.tts !== false,
    enabled: true,
    lastFiredKey: "",
    createdAt: Date.now(),
    videoUrl: input.videoUrl?.trim() || undefined,
    videoTitle: input.videoTitle?.trim() || undefined,
    kind: input.kind,
    revision: input.revision,
  };
}

/** The words spoken when this reminder fires; "" means the voice is switched off. */
export function reminderSpeech(reminder: Reminder): string {
  if (reminder.tts === false) return "";
  return [reminder.title, reminder.note].filter(Boolean).join(". ");
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
    const list = Array.isArray(data?.reminders) ? data.reminders : [];
    // Skip malformed entries (missing/broken time) so a bad row can never
    // crash the reminder renderer and blank the app.
    return list
      .filter(
        (r: Reminder) =>
          r &&
          typeof r === "object" &&
          typeof r.time === "string" &&
          r.time.includes(":"),
      )
      .map((r: Reminder) => ({
        ...r,
        sound: normalizeReminderSound(r.sound),
        // Reminders saved before the voice toggle existed default to speaking.
        tts: r.tts !== false,
        videoUrl: typeof (r as any).videoUrl === "string" && (r as any).videoUrl.trim() ? (r as any).videoUrl.trim() : undefined,
        videoTitle: typeof (r as any).videoTitle === "string" && (r as any).videoTitle.trim() ? (r as any).videoTitle.trim() : undefined,
      }));
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

/* ------------------------------------------------------------------ *
 * Spaced-repetition revision plans
 * ------------------------------------------------------------------ */

/** "2026-11-10" + 3 → "2026-11-13", using local calendar days. */
export function addDaysToKey(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const now = new Date();
  const dt = new Date(y || now.getFullYear(), (m || 1) - 1, d || 1);
  dt.setDate(dt.getDate() + days);
  return toDateKey(dt);
}

/** "2026-11-10" → "Mon, 10 Nov" for plan previews. */
export function prettyDateKey(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  if (!y || !m || !d) return dateKey;
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

/**
 * One reminder that walks the whole revision curve instead of four separate rows:
 * it fires on the next revision day, and "I revised this" moves it to the next gap.
 */
export function createRevisionReminder(input: {
  title: string;
  note?: string;
  gaps: number[];
  time: string;
  startDate?: string;
  sound?: ReminderSound;
  tts?: boolean;
  videoUrl?: string;
  videoTitle?: string;
}): Reminder {
  const gaps = input.gaps.length ? input.gaps : [1, 3, 7, 21];
  const startedOn = input.startDate || toDateKey(new Date());
  const base = createReminder({
    title: input.title,
    note: input.note,
    mode: "once",
    date: addDaysToKey(startedOn, gaps[0]),
    time: input.time,
    sound: input.sound,
    tts: input.tts,
    videoUrl: input.videoUrl,
    videoTitle: input.videoTitle,
  });
  return { ...base, kind: "revision", revision: { gaps, stage: 0, startedOn } };
}

/** Move the plan one step forward after the user confirms they revised the topic. */
export function advanceRevision(reminder: Reminder, now: Date = new Date()): Reminder {
  const plan = reminder.revision;
  if (!plan) return { ...reminder, lastFiredKey: "" };

  const nextStage = plan.stage + 1;
  if (nextStage >= plan.gaps.length) {
    return { ...reminder, revision: { ...plan, stage: nextStage }, enabled: false, lastFiredKey: "" };
  }

  // Spacing counts from the day the revision actually happened, so a late revision
  // still gets its full next interval instead of firing again straight away.
  const delta = Math.max(1, plan.gaps[nextStage] - plan.gaps[plan.stage]);
  return {
    ...reminder,
    date: addDaysToKey(toDateKey(now), delta),
    revision: { ...plan, stage: nextStage },
    enabled: true,
    lastFiredKey: "",
  };
}

/** "Revision 2 of 4 · 3-day" — the chip shown on the popup and the list. */
export function revisionSummary(reminder: Reminder): string {
  const plan = reminder.revision;
  if (!plan) return "";
  const total = plan.gaps.length;
  if (plan.stage >= total) return `All ${total} revisions done`;
  return `Revision ${plan.stage + 1} of ${total} · ${plan.gaps[plan.stage]}-day`;
}