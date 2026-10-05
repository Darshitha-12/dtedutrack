/**
 * Hands the next alarm time to the Android app so the OS can wake it up.
 *
 * Timers inside the app are not dependable for this: a hidden WebView has its timers throttled to
 * roughly one tick per minute, and once the process is killed they stop entirely, so an alarm
 * scheduled with `setTimeout` silently never rings. The native side schedules a real OS alarm
 * instead and only needs to know a single time — the next one due.
 */

import { nextOccurrenceFor, type Alarm } from "./scheduler";

interface NativeScheduleBridge {
  scheduleAlarm(epochMillis: number, label: string): void;
}

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
 * Publishes the earliest upcoming alarm to the native scheduler, or clears it when nothing is
 * scheduled. Safe to call often — it is idempotent.
 */
export function publishNextAlarm(alarms: Alarm[]): void {
  const bridge = nativeBridge();
  if (!bridge) return;

  let soonest: { at: number; label: string } | null = null;

  for (const alarm of alarms) {
    if (!alarm.enabled) continue;
    const next = nextOccurrenceFor(alarm);
    if (!next) continue;
    const at = next.getTime();
    // Leave a little room so a due-now alarm is not handed to the OS as a time in the past.
    if (at <= Date.now() + 1_000) continue;
    if (!soonest || at < soonest.at) {
      soonest = { at, label: labelFor(alarm) };
    }
  }

  try {
    if (soonest) {
      bridge.scheduleAlarm(soonest.at, soonest.label);
    } else {
      bridge.scheduleAlarm(0, "");
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
