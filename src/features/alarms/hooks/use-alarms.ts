"use client";

import { useState, useCallback, useEffect } from "react";
import type { Alarm, AlarmSoundValue, CreateAlarmInput } from "../lib/scheduler";
import { publishNextAlarm } from "../lib/native-alarm-scheduler";

export const STORAGE_KEY = "biopulse_alarms_v1";

/** Accepts built-in tones plus `custom:<soundId>` references. */
function normalizeSound(value: unknown): AlarmSoundValue {
  if (value === "digital" || value === "bio" || value === "chime") return value;
  if (typeof value === "string" && value.startsWith("custom:") && value.length > 7) {
    return value as AlarmSoundValue;
  }
  return "chime";
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

const TTS_MIGRATION_KEY = "biopulse_alarms_tts_migrated_v1";

/**
 * The voice toggle used to be a no-op (nothing read `tts`), so alarms saved back
 * then carry `tts: false` no matter what the user picked — honouring that today
 * would leave every pre-existing alarm silent. One-time migration: switch the
 * voice on for alarms saved before the toggle actually worked, then never touch
 * it again, so a later deliberate "Voice Off" still persists.
 */
export function migrateAlarmTts(): void {
  try {
    if (typeof window === "undefined") return;
    if (localStorage.getItem(TTS_MIGRATION_KEY)) return;
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const list: Array<{ tts?: boolean }> = Array.isArray(parsed?.alarms)
        ? parsed.alarms
        : [];
      let changed = false;
      const next = list.map((a) => {
        if (a && a.tts === false) {
          changed = true;
          return { ...a, tts: true };
        }
        return a;
      });
      if (changed) {
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({ ...parsed, alarms: next }),
        );
      }
    }
    localStorage.setItem(TTS_MIGRATION_KEY, String(Date.now()));
  } catch {
    /* storage blocked — voice just stays as saved */
  }
}

export function useAlarms() {
  const [alarms, setAlarms] = useState<Alarm[]>([]);
  const [fired, setFired] = useState<Record<string, number>>({});

  const loadAlarms = useCallback(() => {
    migrateAlarmTts();
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        const list: Alarm[] = parsed.alarms ?? [];
        const clean: Alarm[] = [];
        for (const a of list) {
          // A malformed entry (missing/broken time) would crash the alarm
          // renderer — drop it instead of blanking the whole app.
          if (!a || typeof a.time !== "string" || !a.time.includes(":")) continue;
          clean.push({
            id: String(a.id ?? ""),
            time: a.time,
            label: typeof a.label === "string" ? a.label : "Alarm",
            priority: a.priority === "high" ? "high" : "normal",
            subject: ["biology", "chemistry", "physics", "agriculture"].includes(a.subject)
              ? a.subject
              : "none",
            sound: normalizeSound(a.sound),
            tts: !!a.tts,
            repeatDays: Array.isArray(a.repeatDays)
              ? a.repeatDays.map(Number).filter((n) => !Number.isNaN(n))
              : [],
            enabled: a.enabled !== false,
            createdAt: typeof a.createdAt === "number" ? a.createdAt : Date.now(),
          });
        }
        setAlarms(clean);
        setFired(parsed.fired ?? {});
      }
    } catch {
      // ignore corrupt data
    }
  }, []);

  const saveAlarms = useCallback(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ alarms, fired }));
    } catch {
      // storage full or unavailable
    }
  }, [alarms, fired]);

  useEffect(() => {
    loadAlarms();
  }, [loadAlarms]);

  // Re-read when account sync writes a newer list from another device.
  useEffect(() => {
    const onRemote = () => loadAlarms();
    window.addEventListener("biopulse:alarms-changed", onRemote);
    return () => window.removeEventListener("biopulse:alarms-changed", onRemote);
  }, [loadAlarms]);

  useEffect(() => {
    if (alarms.length > 0 || Object.keys(fired).length > 0) {
      saveAlarms();
    }
  }, [alarms, fired, saveAlarms]);

  // Republish the next alarm to the OS whenever the list changes, and once when the app starts.
  // Without this the Android app has no alarm of its own and a reminder set here would only ever
  // ring while the app happened to be open in the foreground.
  useEffect(() => {
    if (alarms.length === 0) {
      publishNextAlarm([]);
      return;
    }
    publishNextAlarm(alarms);
  }, [alarms]);

  const addAlarm = useCallback((input: CreateAlarmInput) => {
    const alarm: Alarm = {
      ...input,
      id: generateId(),
      enabled: true,
      createdAt: Date.now(),
    };
    setAlarms((prev) => [...prev, alarm]);
  }, []);

  const updateAlarm = useCallback((id: string, input: Partial<CreateAlarmInput>) => {
    setAlarms((prev) => prev.map((a) => (a.id === id ? { ...a, ...input } : a)));
  }, []);

  const deleteAlarm = useCallback((id: string) => {
    setAlarms((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const toggleAlarm = useCallback((id: string) => {
    setAlarms((prev) =>
      prev.map((a) => (a.id === id ? { ...a, enabled: !a.enabled } : a)),
    );
  }, []);

  const markFired = useCallback((dedupKey: string) => {
    setFired((prev) => ({ ...prev, [dedupKey]: Date.now() }));
  }, []);

  return {
    alarms,
    fired,
    addAlarm,
    updateAlarm,
    deleteAlarm,
    toggleAlarm,
    loadAlarms,
    saveAlarms,
    markFired,
  };
}
