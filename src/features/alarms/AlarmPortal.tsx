"use client";

import { useCallback, useEffect, useRef } from "react";
import { AlarmPopup } from "@/features/alarms/components/AlarmPopup";
import { useAlarmRinger } from "@/features/alarms/hooks/use-alarm-ringer";
import { STORAGE_KEY } from "@/features/alarms/hooks/use-alarms";
import {
  checkAlarms,
  getDedupKey,
  nextOccurrenceFor,
} from "@/features/alarms/lib/scheduler";
import type { Alarm } from "@/features/alarms/lib/scheduler";
import { publishNextAlarm } from "@/features/alarms/lib/native-alarm-scheduler";

function readAlarms(): { alarms: Alarm[]; fired: Record<string, number> } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { alarms: [], fired: {} };
    const parsed = JSON.parse(raw);
    const alarms: Alarm[] = parsed.alarms ?? [];
    return { alarms, fired: parsed.fired ?? {} };
  } catch {
    return { alarms: [], fired: {} };
  }
}

function writeFired(fired: Record<string, number>) {
  try {
    const { alarms } = readAlarms();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ alarms, fired }));
  } catch {
    // ignore
  }
}

function preArmNative(alarms: Alarm[]) {
  try {
    const bridge = (window as any).BioPulseBridge;
    if (!bridge || typeof bridge.suppressAlarmSound !== "function") return;
    const now = Date.now();
    for (const a of alarms) {
      if (!a.enabled) continue;
      const next = nextOccurrenceFor(a);
      if (!next) continue;
      const ms = next.getTime() - now;
      if (ms > 0 && ms < 6000) {
        bridge.suppressAlarmSound(a.id);
      }
    }
  } catch {
    // ignore
  }
}

function pushNativeAlarms(alarms: Alarm[]) {
  // The OS owns the wake-up, so it needs to know the next time an alarm is due. Timers in a
  // backgrounded WebView are throttled far too heavily to be trusted with this.
  publishNextAlarm(alarms);
}

export function AlarmPortal() {
  const { currentAlarm, isRinging, triggerAlarm, dismiss, snooze } =
    useAlarmRinger();
  const firedRef = useRef<Record<string, number>>({});
  const lastAlarmPush = useRef("");

  const checkDue = useCallback(() => {
    const { alarms, fired } = readAlarms();
    const pushJson = JSON.stringify({ alarms });
    if (pushJson !== lastAlarmPush.current) {
      lastAlarmPush.current = pushJson;
      pushNativeAlarms(alarms);
    }
    const dedup = { ...firedRef.current, ...fired };
    firedRef.current = dedup;
    preArmNative(alarms);
    const due = checkAlarms(alarms, dedup);
    for (const alarm of due) {
      const key = getDedupKey(alarm, new Date());
      dedup[key] = Date.now();
      firedRef.current = dedup;
      writeFired(dedup);
      triggerAlarm(alarm);
    }
  }, [triggerAlarm]);

  useEffect(() => {
    checkDue();
    const id = setInterval(checkDue, 1000);

    const onFocus = () => checkDue();
    const onVisible = () => {
      if (document.visibilityState === "visible") checkDue();
    };
    const onTest = () => {
      const { alarms } = readAlarms();
      const sample = alarms.find((a) => a.enabled);
      if (sample) {
        triggerAlarm(sample);
      }
    };
    const onDismissAll = () => dismiss();

    // The OS woke the app up. `checkDue` only matches alarms inside the current minute, but an OS
    // alarm routinely lands a few seconds late, so allow a small window before giving up rather
    // than dropping the alarm the user set.
    const onNativeRing = () => {
      const { alarms } = readAlarms();
      const now = Date.now();
      const due = alarms.find((a) => {
        if (!a.enabled) return false;
        const next = nextOccurrenceFor(a);
        if (!next) return false;
        const delta = next.getTime() - now;
        return delta <= 0 && delta > -120_000;
      });
      if (due) {
        const dedup = { ...firedRef.current };
        dedup[getDedupKey(due, new Date(now))] = now;
        firedRef.current = dedup;
        writeFired(dedup);
        triggerAlarm(due);
      }
      // Whatever happened, hand the OS the following alarm so a long series keeps working.
      checkDue();
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("biopulse:test-alarm", onTest);
    window.addEventListener("biopulse:alarms-dismiss", onDismissAll);
    window.addEventListener("biopulse:alarm-ring", onNativeRing);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("biopulse:test-alarm", onTest);
      window.removeEventListener("biopulse:alarms-dismiss", onDismissAll);
      window.removeEventListener("biopulse:alarm-ring", onNativeRing);
    };
  }, [checkDue, dismiss, triggerAlarm]);

  if (!isRinging || !currentAlarm) return null;
  return (
    <AlarmPopup alarm={currentAlarm} onDismiss={dismiss} onSnooze={snooze} />
  );
}