"use client";

import { useState, useCallback, useEffect } from "react";
import type { Alarm, CreateAlarmInput } from "../lib/scheduler";

export const STORAGE_KEY = "biopulse_alarms_v1";

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function useAlarms() {
  const [alarms, setAlarms] = useState<Alarm[]>([]);
  const [fired, setFired] = useState<Record<string, number>>({});

  const loadAlarms = useCallback(() => {
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
            sound: a.sound === "digital" || a.sound === "bio" ? a.sound : "chime",
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

  useEffect(() => {
    if (alarms.length > 0 || Object.keys(fired).length > 0) {
      saveAlarms();
    }
  }, [alarms, fired, saveAlarms]);

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
