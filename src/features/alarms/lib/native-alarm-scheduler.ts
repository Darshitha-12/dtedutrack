/**
 * Hands the upcoming alarm times to the Android app so the OS can wake it up.
 *
 * Timers inside the app are not dependable for this: a hidden WebView has its timers throttled to
 * roughly one tick per minute, and once the process is killed they stop entirely, so an alarm
 * scheduled with `setTimeout` silently never rings. The native side schedules real OS alarms
 * instead; we publish the whole upcoming set (each alarm's next occurrence, each class start and
 * each class pre-alert) and the native queue arms them all, ringing each in turn with the app
 * closed.
 */

import { nextOccurrenceFor, type Alarm } from "./scheduler";
import { ensureNativeSoundCopy } from "./custom-sounds";
import { getState, type StoredClass } from "@/lib/offline-api/store";

interface NativeEvent {
  at: number;
  label: string;
  soundId?: string | null;
  /** Optional spoken announcement (Sinhala), handed to the native TTS over the ringtone. */
  speech?: string | null;
  /** Plain text shown on the notification (e.g. the exam countdown), no speech involved. */
  text?: string | null;
  /** "ring" plays tone+speech like an alarm; "alert" posts a quiet notification only. */
  kind?: "ring" | "alert";
  /** "daily" makes the native side re-arm this event itself, every day, without the app open. */
  repeat?: "daily" | null;
  /** For the daily exam check-in: the dashboard exam date (YYYY-MM-DD) the native side counts to. */
  target?: string | null;
  /** Exam label ("A/L", …) prefixed to the native exam countdown text. */
  examLabel?: string | null;
}

interface NativeScheduleBridge {
  scheduleAlarm(epochMillis: number, label: string, soundId?: string | null): void;
  scheduleAlarms?(eventsJson: string): void;
}

/** How early a class rings its heads-up, e.g. a 07:00 class first rings at 05:00. */
const CLASS_LEAD_MS = 2 * 60 * 60 * 1000;
/** Mirrors the native queue's cap so nothing is silently dropped on the native side. */
const MAX_NATIVE_EVENTS = 32;

function nativeBridge(): NativeScheduleBridge | null {
  if (typeof window === "undefined") return null;
  const bridge = (window as unknown as { BioPulseBridge?: Partial<NativeScheduleBridge> })
    .BioPulseBridge;
  if (!bridge || typeof bridge.scheduleAlarm !== "function") return null;
  return bridge as NativeScheduleBridge;
}

/** A readable name for the lock-screen notification. */
function labelFor(alarm: Alarm): string {
  return alarm.label?.trim() || `Alarm ${alarm.time}`;
}

/**
 * First name of the logged-in profile, for the spoken announcement ("<name>, පන්තිය පටන්
 * ගන්නවා"). The default "Student" and an absent profile mean no name prefix.
 */
function userName(): string {
  try {
    const p = getState().profile;
    const raw = (p?.displayName || p?.name || "").trim();
    if (!raw || raw === "Student") return "";
    const first = raw.split(/\s+/)[0] || "";
    return first.length > 24 ? first.slice(0, 24) : first;
  } catch {
    return "";
  }
}

/**
 * Next time a weekly class starts, as epoch millis.
 *
 * Classes store their day as 0=Monday … 6=Sunday (the AI-timetable convention) while
 * `Date.getDay()` counts 0=Sunday, hence the shift.
 */
function nextClassStart(cls: StoredClass, now: number): number | null {
  const targetDay = (cls.dayOfWeek + 1) % 7;
  for (let offset = 0; offset <= 7; offset++) {
    const d = new Date(now);
    d.setDate(d.getDate() + offset);
    d.setHours(0, 0, 0, 0);
    if (d.getDay() !== targetDay) continue;
    d.setMinutes(cls.startMinute);
    const at = d.getTime();
    if (at > now + 1_000) return at;
  }
  return null;
}

/** The time a weekly class ends (its start plus its duration). */
function nextClassEnd(cls: StoredClass, now: number): number | null {
  const start = nextClassStart(cls, now);
  if (start === null) return null;
  return start + Math.max(0, cls.endMinute - cls.startMinute) * 60_000;
}

/** Next occurrence of a fixed clock time (e.g. 3 AM), skipping any instant still lurking in the past. */
function nextDaily(hour: number, minute: number, now: number, dayOffset = 0): number {
  const d = new Date(now);
  d.setHours(hour, minute, 0, 0);
  if (d.getTime() <= now + 1_000) d.setTime(d.getTime() + 24 * 60 * 60 * 1000);
  if (dayOffset) d.setTime(d.getTime() + dayOffset * 24 * 60 * 60 * 1000);
  return d.getTime();
}

/**
 * One-line reminder for the profile's main exam date (the notification body of the 12 AM
 * check-in). Empty when no exam is configured, so the alert falls back to the title alone.
 */
function examReminderText(baseTime?: number): string {
  try {
    const p = getState().profile;
    const date = (p?.examDate || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return "";
    const target = new Date(date + "T00:00:00");
    if (Number.isNaN(target.getTime())) return "";
    const now = new Date(baseTime ?? Date.now());
    // Mirror the dashboard countdown: whole days of *remaining* time (floor), not the calendar-day
    // difference, so the notification never reads a day higher than the dashboard during the day.
    const days = Math.floor((target.getTime() - now.getTime()) / 86_400_000);
    const label = p?.examType ? p.examType + " " : "";
    if (days <= 0) return `${label}විභාගය අද තියෙනවා. වාසනාවන් වේවා!`;
    if (days === 1) return `${label}විභාගය හෙට (දවස් 1).`;
    if (days <= 365) return `${label}විභාගය දවස් ${days} කින්.`;
    return `${label}විභාගය: ${date}.`;
  } catch {
    return "";
  }
}
 /**
 * Publishes every upcoming event to the native scheduler queue, or clears it when nothing is
 * scheduled. Safe to call often — it is idempotent.
 *
 * The queue holds study alarms, class starts and the class pre-alert (two hours early), so a
 * 07:00 class rings at 05:00 and again at 07:00 with the app never opened in between; the native
 * receiver re-arms the remainder itself when one fires.
 */
export function publishNextAlarm(alarms: Alarm[]): void {
  const bridge = nativeBridge();
  if (!bridge) return;

  const now = Date.now();
  const events: NativeEvent[] = [];
  const name = userName();
  const namePrefix = name ? `${name}, ` : "";

  for (const alarm of alarms) {
    if (!alarm.enabled) continue;
    const next = nextOccurrenceFor(alarm);
    if (!next) continue;
    const at = next.getTime();
    // Leave a little room so a due-now alarm is not handed to the OS as a time in the past.
    if (at <= now + 1_000) continue;
    const label = labelFor(alarm);
    events.push({
      at,
      label,
      soundId: (alarm as any).sound || (alarm as any).soundId,
      // The user's own alarm text is spoken as-is; the native TTS picks the voice by script.
      speech: name && label ? `${name}, ${label}` : label,
    });
  }

  // Class reminders ride along: every class contributes its next start plus a two-hour
  // heads-up. `getState` only reads localStorage, and this whole branch is unreachable in the
  // online build (no bridge).
  try {
    const leadHours = CLASS_LEAD_MS / 3_600_000;
    for (const cls of getState().classes) {
      const at = nextClassStart(cls, now);
      if (!at) continue;
      events.push({
        at,
        label: `Class: ${cls.subjectName}`,
        soundId: "study",
        speech: `${namePrefix}පන්තිය පටන් ගන්නවා. ඉක්මනට එන්න.`,
      });
      const preAlertAt = at - CLASS_LEAD_MS;
      if (preAlertAt > now + 1_000) {
        events.push({
          at: preAlertAt,
          label: `Class soon: ${cls.subjectName}`,
          soundId: "study",
          speech: `${namePrefix}තව පැය ${leadHours} යි. සූදානම් වෙන්න.`,
        });
      }
      // When the class is over, post a quiet "finished" notification — no tone, no voice.
      const end = nextClassEnd(cls, now);
      if (end !== null) {
        events.push({
          at: end,
          label: `Class finished: ${cls.subjectName}`,
          kind: "alert",
        });
      }
    }
  } catch {
    /* no offline store (online build) — alarms alone are scheduled */
  }

  // Daily 12 AM (midnight) exam countdown, straight from the dashboard's exam date. The event is
  // published ONCE and marked `repeat:"daily"`: the native receiver re-arms it for the next
  // midnight itself, so the alert keeps firing every night even if the app is never opened. The
  // native side also recomputes the countdown from `target` at ring time, so the number of days
  // stays correct without a republish.
  let examDate = "";
  let examType = "";
  try {
    const p = getState().profile;
    examDate = (p?.examDate || "").trim();
    examType = (p?.examType || "").trim();
  } catch {
    /* no offline store — the alert still fires, just with the generic title */
  }
  const midnight = nextDaily(0, 0, now);
  events.push({
    at: midnight,
    label: "පාන්දර 12",
    soundId: "tink",
    text: examReminderText(midnight) || null,
    kind: "alert",
    repeat: "daily",
    target: /^\d{4}-\d{2}-\d{2}$/.test(examDate) ? examDate : null,
    examLabel: examType || null,
  });

  events.sort((a, b) => a.at - b.at);
  const capped = events.slice(0, MAX_NATIVE_EVENTS);

  try {
    // The sound travels with the schedule: with the app closed it is the only way the native
    // ringer knows which sound the user picked instead of ringing a generic system tone.
    const custom = capped.find((e) => e.soundId?.startsWith("custom:"));
    if (custom) void ensureNativeSoundCopy(custom.soundId!.slice("custom:".length));

    if (typeof bridge.scheduleAlarms === "function") {
      bridge.scheduleAlarms(
        JSON.stringify(
          capped.map((e) => ({
            at: e.at,
            label: e.label,
            soundId: e.soundId ?? null,
            speech: e.speech ?? null,
            text: e.text ?? null,
            kind: e.kind ?? "ring",
            repeat: e.repeat ?? null,
            target: e.target ?? null,
            examLabel: e.examLabel ?? null,
          }))
        )
      );
    } else if (capped.find((e) => e.kind !== "alert")) {
      // Older native builds only know the single-event API: arm the earliest ring event and the
      // rest republish when it fires. Notification-only alerts are skipped so they never ring.
      const first = capped.find((e) => e.kind !== "alert")!;
      bridge.scheduleAlarm(first.at, first.label, first.soundId ?? null);
    } else {
      bridge.scheduleAlarm(0, "", null);
    }
  } catch {
    /* the bridge is best effort; the in-app scheduler still covers a visible app */
  }
}

/** Fires an alarm right now through the native path. Used by the "Ring now" test button. */
export function ringAlarmNatively(label: string): void {
  const bridge = (window as unknown as { BioPulseBridge?: { ringAlarmNow?: (label: string) => void } })
    .BioPulseBridge;
  bridge?.ringAlarmNow?.(label);
}

/**
 * Fires the daily 12 AM exam check-in immediately (same notification the nightly alert posts), so
 * it can be tested without waiting for midnight. Returns false when there is no native shell.
 */
export function testExamAlertNow(): boolean {
  const bridge = (
    window as unknown as {
      BioPulseBridge?: { testExamReminder?: (t: string | null, l: string | null) => void };
    }
  ).BioPulseBridge;
  if (!bridge || typeof bridge.testExamReminder !== "function") return false;
  let examDate = "";
  let examType = "";
  try {
    const p = getState().profile;
    examDate = (p?.examDate || "").trim();
    examType = (p?.examType || "").trim();
  } catch {
    /* no offline store — still fire the alert with the generic title */
  }
  bridge.testExamReminder(/^\d{4}-\d{2}-\d{2}$/.test(examDate) ? examDate : null, examType || null);
  return true;
}
