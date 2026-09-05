"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { AudioEngine } from "../lib/audio-engine";
import { getCustomSound } from "../lib/custom-sounds";
import type { Alarm } from "../lib/scheduler";

export function useAlarmRinger() {
  const [currentAlarm, setCurrentAlarm] = useState<Alarm | null>(null);
  const [isRinging, setIsRinging] = useState(false);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const vibrationTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const snoozeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const requestWakeLock = useCallback(async () => {
    try {
      if ("wakeLock" in navigator) {
        wakeLockRef.current = await navigator.wakeLock.request("screen");
      }
    } catch {
      // wake lock denied or unavailable
    }
  }, []);

  const releaseWakeLock = useCallback(() => {
    if (wakeLockRef.current) {
      wakeLockRef.current.release().catch(() => {});
      wakeLockRef.current = null;
    }
  }, []);

  const startVibration = useCallback(() => {
    if ("vibrate" in navigator) {
      const pattern = [300, 100, 300, 100, 500, 200, 300, 100, 300];
      navigator.vibrate(pattern);
      vibrationTimerRef.current = setInterval(() => {
        navigator.vibrate(pattern);
      }, 2500);
    }
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

  const getBridge = useCallback((): any => {
    try {
      return (window as any).BioPulseBridge;
    } catch {
      return null;
    }
  }, []);

  const triggerAlarm = useCallback(
    async (alarm: Alarm) => {
      setCurrentAlarm(alarm);
      setIsRinging(true);
      // Web is the primary in-app ringer. The native side is told to
      // suppress its own scheduled-alarm sound when the web already fired,
      // so the alarm never plays twice (or from a "background" source).
      try {
        const bridge = getBridge();
        if (bridge && bridge.triggerNativeAlarm) {
          const [hh, mm] = (alarm.time || "00:00").split(":").map(Number);
          const soundId = alarm.sound.startsWith("custom:")
            ? alarm.sound.slice("custom:".length)
            : alarm.sound;
          bridge.triggerNativeAlarm(
            alarm.id,
            alarm.label || "Alarm",
            hh || 0,
            mm || 0,
            soundId,
          );
        }
      } catch {
        // non-Android — ignore
      }
      const native = !!getBridge() && typeof getBridge()!.triggerNativeAlarm === "function";
      if (alarm.sound.startsWith("custom:")) {
        const custom = await getCustomSound(alarm.sound.slice("custom:".length));
        AudioEngine.playSound(alarm.sound, custom?.blob);
      } else {
        AudioEngine.playSound(alarm.sound);
      }
      if (!native) {
        // Native full-screen already vibrates when inside the Android app.
        startVibration();
      }
      requestWakeLock();
    },
    [getBridge, startVibration, requestWakeLock],
  );

  const dismiss = useCallback(() => {
    AudioEngine.stop();
    stopVibration();
    releaseWakeLock();
    setCurrentAlarm(null);
    setIsRinging(false);
  }, [stopVibration, releaseWakeLock]);

  const snooze = useCallback(
    (minutes: number) => {
      const alarmToSnooze = currentAlarm;
      dismiss();
      if (alarmToSnooze) {
        snoozeTimerRef.current = setTimeout(() => {
          triggerAlarm(alarmToSnooze);
        }, minutes * 60 * 1000);
      }
    },
    [currentAlarm, dismiss, triggerAlarm],
  );

  const stopAll = useCallback(() => {
    if (snoozeTimerRef.current !== null) {
      clearTimeout(snoozeTimerRef.current);
      snoozeTimerRef.current = null;
    }
    dismiss();
  }, [dismiss]);

  useEffect(() => {
    return () => {
      AudioEngine.stop();
      stopVibration();
      releaseWakeLock();
      if (snoozeTimerRef.current !== null) {
        clearTimeout(snoozeTimerRef.current);
      }
    };
  }, [stopVibration, releaseWakeLock]);

  return {
    currentAlarm,
    isRinging,
    triggerAlarm,
    dismiss,
    snooze,
    stopAll,
  };
}
