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
      let native = false;
      try {
        const bridge = getBridge();
        native = !!bridge && typeof bridge.triggerNativeAlarm === "function";
        if (native) {
          // Tell the native scheduled alarm to stay silent for this alarm —
          // the web is the in-app ringer and plays the exact same tone the
          // user picked in the Test Sound button. Only the (silent) native
          // full-screen + vibration remain, so no double/overlapping audio.
          // Note: this flag only survives ~60s and only while the app is open;
          // when the app is closed the native alarm rings with its bundled tone.
          if (typeof bridge.suppressAlarmSound === "function") {
            bridge.suppressAlarmSound(alarm.id);
          }
        }
      } catch {
        native = false;
      }
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
