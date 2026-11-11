"use client";

import { useState, useCallback, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { usePomodoro } from "@/features/pomodoro/PomodoroProvider";
import {
  Play,
  Pause,
  RotateCcw,
  SkipForward,
  BellOff,
} from "lucide-react";

const PHASE_LABEL: Record<string, string> = {
  idle: "Ready",
  study: "Focus",
  break: "Short Break",
  longbreak: "Long Break",
};

function formatTime(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function PomodoroTimer() {
  const {
    config,
    live,
    remainingMs,
    totalMs,
    start,
    pause,
    reset,
    skip,
    updateConfig,
  } = usePomodoro();

  const searchParams = useSearchParams();
  const taskName = useMemo(() => searchParams?.get("task")?.trim() || "", [searchParams]);
  const [notifPerm, setNotifPerm] = useState<NotificationPermission>("default");

  const requestNotif = useCallback(async () => {
    if ("Notification" in window) {
      const result = await Notification.requestPermission();
      setNotifPerm(result);
    }
  }, []);

  const progress = totalMs > 0 ? remainingMs / totalMs : 0;
  const phaseClass =
    live.phase === "study"
      ? "text-emerald-400"
      : live.phase === "longbreak"
        ? "text-sky-400"
        : live.phase === "break"
          ? "text-amber-400"
          : "text-muted-foreground";

  const numberOptions = (max: number) =>
    Array.from({ length: max }, (_, i) => String(i + 1));

  return (
    <div className="space-y-4">
      <Card className="p-6 text-center">
        <p className={cn("text-sm font-medium uppercase tracking-widest", phaseClass)}>
          {PHASE_LABEL[live.phase]}
        </p>

        <div className="relative mx-auto my-6 h-52 w-52">
          <svg className="h-full w-full -rotate-90" viewBox="0 0 100 100">
            <circle
              cx="50"
              cy="50"
              r="45"
              fill="none"
              strokeWidth="6"
              className="stroke-muted"
            />
            <circle
              cx="50"
              cy="50"
              r="45"
              fill="none"
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={2 * Math.PI * 45}
              strokeDashoffset={2 * Math.PI * 45 * (1 - Math.max(0, Math.min(1, progress)))}
              className={cn(
                "transition-[stroke-dashoffset] duration-500",
                live.phase === "study" ? "stroke-emerald-500" : "stroke-primary",
              )}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-5xl font-bold tabular-nums">
              {formatTime(remainingMs)}
            </span>
            <span className="mt-1 text-xs text-muted-foreground">
              {live.running
                ? "Running"
                : live.pausedMs > 0
                  ? "Paused"
                  : live.cyclesDone > 0
                    ? `${live.cyclesDone}/${config.cycles} cycles done`
                    : "Press start to begin"}
            </span>
          </div>
        </div>

        {taskName && (
          <p className="-mt-4 mb-1 text-center text-sm text-muted-foreground">
            Session: <span className="font-semibold text-foreground">{taskName}</span>
          </p>
        )}

        <div className="flex items-center justify-center gap-2">
          {live.running ? (
            <Button onClick={pause} variant="outline">
              <Pause className="h-4 w-4 mr-1" />
              Pause
            </Button>
          ) : (
            <Button onClick={start}>
              <Play className="h-4 w-4 mr-1" />
              {live.pausedMs > 0 ? "Resume" : "Start"}
            </Button>
          )}
          <Button
            onClick={skip}
            variant="outline"
            disabled={live.phase === "idle"}
          >
            <SkipForward className="h-4 w-4 mr-1" />
            Skip
          </Button>
          <Button onClick={reset} variant="ghost" size="icon" aria-label="Reset">
            <RotateCcw className="h-4 w-4" />
          </Button>
        </div>
      </Card>

      {notifPerm !== "granted" && (
        <div className="flex items-center gap-3 rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-3 text-sm">
          <BellOff className="h-4 w-4 shrink-0 text-yellow-600" />
          <p className="flex-1 text-yellow-700 dark:text-yellow-300">
            Enable notifications to hear an alert when each session ends — even
            while the app is in the background.
          </p>
          <Button variant="outline" size="sm" onClick={requestNotif}>
            Enable
          </Button>
        </div>
      )}

      <Card className="p-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">
              Focus (min)
            </label>
            <Select
              value={String(config.study)}
              disabled={live.running || live.pausedMs > 0}
              onChange={(e) =>
                updateConfig({ study: Number(e.target.value) })
              }
            >
              {numberOptions(90).map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">
              Short Break (min)
            </label>
            <Select
              value={String(config.break)}
              disabled={live.running || live.pausedMs > 0}
              onChange={(e) => updateConfig({ break: Number(e.target.value) })}
            >
              {Array.from({ length: 15 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">
              Long Break (min)
            </label>
            <Select
              value={String(config.longBreak)}
              disabled={live.running || live.pausedMs > 0}
              onChange={(e) =>
                updateConfig({ longBreak: Number(e.target.value) })
              }
            >
              {numberOptions(45).map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">
              Cycles
            </label>
            <Select
              value={String(config.cycles)}
              disabled={live.running || live.pausedMs > 0}
              onChange={(e) => updateConfig({ cycles: Number(e.target.value) })}
            >
              {numberOptions(8).map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Settings save automatically on this device and work even without an
          internet connection.
        </p>
      </Card>
    </div>
  );
}