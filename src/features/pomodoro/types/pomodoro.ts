import type { Grade } from "@/lib/utils";

export interface PomodoroConfig {
  study: number;
  break: number;
  longBreak: number;
  cycles: number;
}

export type PomodoroPhase = "idle" | "study" | "break" | "longbreak";

export interface PomodoroLive {
  running: boolean;
  phase: PomodoroPhase;
  endTs: number;
  pausedMs: number;
  cyclesDone: number;
  setDone: number;
  lastHyd: number;
}

export const DEFAULT_POMODORO: PomodoroConfig = {
  study: 50,
  break: 10,
  longBreak: 30,
  cycles: 4,
};

export const DEFAULT_LIVE: PomodoroLive = {
  running: false,
  phase: "idle",
  endTs: 0,
  pausedMs: 0,
  cyclesDone: 0,
  setDone: 0,
  lastHyd: 0,
};

export interface StudySession {
  id: string;
  subjectId: string;
  minutes: number;
  end: number;
  userId?: string;
}
