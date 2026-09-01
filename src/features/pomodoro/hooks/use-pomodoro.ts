"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import {
  DEFAULT_POMODORO,
  DEFAULT_LIVE,
  type PomodoroConfig,
  type PomodoroLive,
  type PomodoroPhase,
} from "@/features/pomodoro/types/pomodoro";
import { AudioEngine } from "@/features/alarms/lib/audio-engine";
import { notificationService } from "@/services/notification";

const CONFIG_KEY = "biopulse_pomodoro_config_v1";
const LIVE_KEY = "biopulse_pomodoro_live_v1";
const STATUS_TAG = "biopulse-pomodoro-status";

function loadConfig(): PomodoroConfig {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_POMODORO, ...parsed };
    }
  } catch {
    // ignore corrupt data
  }
  return { ...DEFAULT_POMODORO };
}

function loadLive(): PomodoroLive {
  try {
    const raw = localStorage.getItem(LIVE_KEY);
    if (raw) {
      return { ...DEFAULT_LIVE, ...JSON.parse(raw) };
    }
  } catch {
    // ignore corrupt data
  }
  return { ...DEFAULT_LIVE };
}

function phaseDuration(phase: PomodoroPhase, config: PomodoroConfig): number {
  switch (phase) {
    case "study":
      return config.study * 60 * 1000;
    case "break":
      return config.break * 60 * 1000;
    case "longbreak":
      return config.longBreak * 60 * 1000;
    default:
      return 0;
  }
}

export function usePomodoroTimer() {
  const [config, setConfig] = useState<PomodoroConfig>(() =>
    loadConfig(),
  );
  const [live, setLive] = useState<PomodoroLive>(() => loadLive());

  const configRef = useRef(config);
  configRef.current = config;

  const liveRef = useRef(live);
  liveRef.current = live;

  const notify = useCallback((message: string) => {
    notificationService.sendBrowser("🧘 BioPulse Pomodoro", message);
    AudioEngine.cue("chime");
    if ("vibrate" in navigator) {
      navigator.vibrate([200, 100, 200, 100, 400]);
    }
  }, []);

  const advance = useCallback((snapshot: PomodoroLive, now: number) => {
    const cfg = configRef.current;
    let next: PomodoroLive;
    let message = "";

    if (snapshot.phase === "study") {
      const isLast = snapshot.cyclesDone + 1 >= cfg.cycles;
      next = {
        ...snapshot,
        phase: isLast ? "longbreak" : "break",
        cyclesDone: snapshot.cyclesDone + 1,
        endTs: now + phaseDuration(isLast ? "longbreak" : "break", cfg),
        pausedMs: 0,
        lastHyd: now,
      };
      message = isLast
        ? "Focus cycle complete — long break time!"
        : "Focus session complete — take a break!";
    } else if (snapshot.phase === "break") {
      next = {
        ...snapshot,
        phase: "study",
        endTs: now + phaseDuration("study", cfg),
        pausedMs: 0,
        lastHyd: now,
      };
      message = "Break is over — time to focus!";
    } else {
      next = {
        ...DEFAULT_LIVE,
        running: false,
        cyclesDone: 0,
        lastHyd: now,
      };
      message = "All cycles done. Great session! 🎉";
    }

    setLive(next);
    notify(message);
  }, [notify]);

  const tick = useCallback(() => {
    const current = liveRef.current;
    if (!current.running) return;
    const now = Date.now();
    if (now >= current.endTs) {
      advance(current, now);
    }
  }, [advance]);

  useEffect(() => {
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [tick]);

  useEffect(() => {
    const id = setInterval(() => {
      const current = liveRef.current;
      const cfg = configRef.current;
      if (!current.running && current.pausedMs === 0) {
        notificationService.clearStatus(STATUS_TAG);
        return;
      }
      const raw = current.running ? current.endTs - Date.now() : current.pausedMs;
      const remaining = Math.max(0, raw);
      const totalSec = Math.ceil(remaining / 1000);
      const mm = Math.floor(totalSec / 60);
      const ss = totalSec % 60;
      const timeLeft = `${mm}:${String(ss).padStart(2, "0")}`;
      const phaseName =
        current.phase === "longbreak" ? "Long Break" : current.phase === "break" ? "Short Break" : "Focus";
      const title = `🧘 BioPulse · ${phaseName}`;
      const body = `${timeLeft} left${current.running ? "" : " (paused)"} · ${current.cyclesDone}/${cfg.cycles} cycles`;
      notificationService.updateStatus(STATUS_TAG, title, body);
    }, 1000);
    return () => {
      clearInterval(id);
      notificationService.clearStatus(STATUS_TAG);
    };
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(LIVE_KEY, JSON.stringify(live));
    } catch {
      // storage full or unavailable
    }
  }, [live]);

  useEffect(() => {
    const current = liveRef.current;
    if (current.running && current.endTs <= Date.now()) {
      advance(current, Date.now());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const start = useCallback(() => {
    const now = Date.now();
    if (liveRef.current.running) return;
    if (liveRef.current.pausedMs > 0) {
      setLive((prev) => ({
        ...prev,
        running: true,
        endTs: now + prev.pausedMs,
        pausedMs: 0,
        lastHyd: now,
      }));
      return;
    }
    setLive((prev) => ({
      running: true,
      phase: prev.phase === "idle" ? "study" : prev.phase,
      endTs: now + phaseDuration(prev.phase === "idle" ? "study" : prev.phase, configRef.current),
      pausedMs: 0,
      cyclesDone: prev.cyclesDone,
      setDone: prev.setDone,
      lastHyd: now,
    }));
  }, []);

  const pause = useCallback(() => {
    const current = liveRef.current;
    if (!current.running) return;
    const remaining = Math.max(0, current.endTs - Date.now());
    setLive((prev) => ({ ...prev, running: false, pausedMs: remaining, lastHyd: Date.now() }));
  }, []);

  const reset = useCallback(() => {
    setLive({ ...DEFAULT_LIVE, lastHyd: Date.now() });
  }, []);

  const skip = useCallback(() => {
    const current = liveRef.current;
    if (current.phase === "idle") return;
    advance(current, Date.now());
  }, [advance]);

  const updateConfig = useCallback(
    (patch: Partial<PomodoroConfig>) => {
      setConfig((prev) => ({ ...prev, ...patch }));
      try {
        localStorage.setItem(
          CONFIG_KEY,
          JSON.stringify({ ...configRef.current, ...patch }),
        );
      } catch {
        // storage full or unavailable
      }
    },
    [],
  );

  const remainingMs =
    live.running || live.pausedMs > 0
      ? Math.max(0, live.running ? live.endTs - Date.now() : live.pausedMs)
      : phaseDuration(live.phase === "idle" ? "study" : live.phase, config);

  const totalMs =
    live.phase === "study" || live.phase === "idle"
      ? config.study * 60 * 1000
      : live.phase === "longbreak"
        ? config.longBreak * 60 * 1000
        : config.break * 60 * 1000;

  return {
    config,
    live,
    remainingMs,
    totalMs,
    start,
    pause,
    reset,
    skip,
    updateConfig,
  };
}