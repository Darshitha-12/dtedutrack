"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AudioEngine } from "@/features/alarms/lib/audio-engine";
import { notificationService } from "@/services/notification";
import { ReminderPopup } from "@/features/reminders/components/ReminderPopup";
import {
  loadReminders,
  reminderMatches,
  saveReminders,
  toDateKey,
  REMINDERS_STORAGE_KEY,
} from "@/features/reminders/types";
import type { Reminder } from "@/features/reminders/types";

const POLL_MS = 15000;

function syncNative(reminders: Reminder[]) {
  if (typeof window === "undefined") return;
  const bridge = (
    window as unknown as {
      BioPulseBridge?: { syncReminders?: (json: string) => void };
      AndroidBridge?: { syncReminders?: (json: string) => void };
    }
  ).BioPulseBridge ?? (
    window as unknown as { AndroidBridge?: { syncReminders?: (json: string) => void } }
  ).AndroidBridge;
  if (bridge?.syncReminders) {
    try {
      bridge.syncReminders(JSON.stringify({ reminders }));
    } catch {
      // bridge serialization failure — ignore
    }
  }
}

export function ReminderPortal() {
  const [active, setActive] = useState<Reminder | null>(null);
  const remindersRef = useRef<Reminder[]>([]);
  const snoozeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const vibrationTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(() => {
    remindersRef.current = loadReminders();
  }, []);

  const startVibration = useCallback(() => {
    if (!("vibrate" in navigator)) return;
    const pattern = [300, 100, 300, 100, 500, 200];
    navigator.vibrate(pattern);
    vibrationTimerRef.current = setInterval(() => navigator.vibrate(pattern), 2500);
  }, []);

  const stopVibration = useCallback(() => {
    if (vibrationTimerRef.current !== null) {
      clearInterval(vibrationTimerRef.current);
      vibrationTimerRef.current = null;
    }
    if ("vibrate" in navigator) {
      navigator.vibrate(0);
    }
  }, []);

  const fire = useCallback(
    (reminder: Reminder) => {
      setActive(reminder);
      AudioEngine.play("chime");
      startVibration();
      notificationService
        .sendBrowser(`🔔 ${reminder.title}`, reminder.note || "BioPulse reminder")
        .catch(() => {});
    },
    [startVibration],
  );

  const checkDue = useCallback(() => {
    const now = new Date();
    const due = remindersRef.current.find((r) => reminderMatches(r, now));
    if (!due) return;
    const next = remindersRef.current.map((r) =>
      r.id === due.id ? { ...r, lastFiredKey: toDateKey(now) } : r,
    );
    remindersRef.current = next;
    saveReminders(next);
    syncNative(next);
    fire(due);
  }, [fire]);

  const dismiss = useCallback(() => {
    AudioEngine.stop();
    stopVibration();
    setActive(null);
  }, [stopVibration]);

  const snooze = useCallback(
    (minutes: number) => {
      const toFire = active;
      dismiss();
      if (toFire) {
        if (snoozeTimerRef.current !== null) {
          clearTimeout(snoozeTimerRef.current);
        }
        snoozeTimerRef.current = setTimeout(() => fire(toFire), minutes * 60 * 1000);
      }
    },
    [active, dismiss, fire],
  );

  useEffect(() => {
    refresh();
    syncNative(remindersRef.current);
    checkDue();

    const checker = setInterval(checkDue, POLL_MS);

    const onFocus = () => {
      refresh();
      syncNative(remindersRef.current);
      checkDue();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        refresh();
        syncNative(remindersRef.current);
        checkDue();
      }
    };
    const onTest = () => {
      fire({
        id: "test",
        title: "Test reminder",
        note: "Sound + full-screen popup working",
        mode: "daily",
        date: "",
        days: [],
        time: "00:00",
        enabled: true,
        lastFiredKey: "",
        createdAt: Date.now(),
      } as Reminder);
    };
    const onChanged = () => {
      refresh();
      syncNative(remindersRef.current);
      checkDue();
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === REMINDERS_STORAGE_KEY || e.key === null) onChanged();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("biopulse:test-reminder", onTest);
    window.addEventListener("biopulse:reminders-changed", onChanged);
    window.addEventListener("storage", onStorage);

    return () => {
      clearInterval(checker);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("biopulse:test-reminder", onTest);
      window.removeEventListener("biopulse:reminders-changed", onChanged);
      window.removeEventListener("storage", onStorage);
      AudioEngine.stop();
      stopVibration();
      if (snoozeTimerRef.current !== null) {
        clearTimeout(snoozeTimerRef.current);
      }
    };
  }, [refresh, fire, checkDue, stopVibration]);

  if (!active) return null;
  return <ReminderPopup reminder={active} onDismiss={dismiss} onSnooze={snooze} />;
}