"use client";

import { createContext, useContext } from "react";
import { usePomodoroTimer } from "@/features/pomodoro/hooks/use-pomodoro";

type PomodoroApi = ReturnType<typeof usePomodoroTimer>;

const PomodoroContext = createContext<PomodoroApi | null>(null);

export function PomodoroProvider({ children }: { children: React.ReactNode }) {
  const value = usePomodoroTimer();
  return (
    <PomodoroContext.Provider value={value}>{children}</PomodoroContext.Provider>
  );
}

export function usePomodoro(): PomodoroApi {
  const ctx = useContext(PomodoroContext);
  if (!ctx) {
    throw new Error("usePomodoro must be used within a PomodoroProvider");
  }
  return ctx;
}