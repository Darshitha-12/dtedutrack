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

function readAlarms(): { alarms: Alarm[]; fired: Record<string, number> } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { alarms: [], fired: {} };
    const parsed = JSON.parse(raw);
    const alarms: Alarm[] = parsed.alarms ?? [];
    for (const a of alarms) {
      if (typeof a.sound === "string" && a.sound.startsWith("custom:")) {
        a.sound = "chime";
      }
    }
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

export function AlarmPortal() {
  const { currentAlarm, isRinging, triggerAlarm, dismiss, snooze } =
    useAlarmRinger();
  const firedRef = useRef<Record<string, number>>({});

  const checkDue = useCallback(() => {
    const { alarms, fired } = readAlarms();
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

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("biopulse:test-alarm", onTest);
    window.addEventListener("biopulse:alarms-dismiss", onDismissAll);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("biopulse:test-alarm", onTest);
      window.removeEventListener("biopulse:alarms-dismiss", onDismissAll);
    };
  }, [checkDue, dismiss, triggerAlarm]);

  if (!isRinging || !currentAlarm) return null;
  return (
    <AlarmPopup alarm={currentAlarm} onDismiss={dismiss} onSnooze={snooze} />
  );
}