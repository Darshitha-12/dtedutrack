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
      const native = !!getBridge() && typeof getBridge()!.triggerNativeAlarm === "function";
      if (native) {
        // Inside the Android app the native scheduled alarm is the single,
        // reliable sound source: it plays the exact tone for the selected
        // sound (bundled chime/digital/bio WAV matched by soundId). The web
        // must NOT play a second tone (that double/overlaps the audio) and
        // must NOT suppress the native sound either. Only the (silent)
        // in-app alarm popup + wake lock are handled here.
        requestWakeLock();
        return;
      }
      if (alarm.sound.startsWith("custom:")) {
        const custom = await getCustomSound(alarm.sound.slice("custom:".length));
        AudioEngine.playSound(alarm.sound, custom?.blob);
      } else {
        AudioEngine.playSound(alarm.sound);
      }
      startVibration();
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
