"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { Alarm } from "@/features/alarms/lib/scheduler";
import { nextOccurrenceFor } from "@/features/alarms/lib/scheduler";
import { Pencil, Trash2, Volume2 } from "lucide-react";

const DAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

interface AlarmListProps {
  alarms: Alarm[];
  onToggle: (id: string) => void;
  onEdit: (alarm: Alarm) => void;
  onDelete: (id: string) => void;
}

export function AlarmList({
  alarms,
  onToggle,
  onEdit,
  onDelete,
}: AlarmListProps) {
  const sorted = useMemo(() => {
    return [...alarms].sort((a, b) => {
      const nextA = nextOccurrenceFor(a);
      const nextB = nextOccurrenceFor(b);
      if (nextA && nextB) return nextA.getTime() - nextB.getTime();
      if (nextA) return -1;
      if (nextB) return 1;
      return a.createdAt - b.createdAt;
    });
  }, [alarms]);

  if (sorted.length === 0) {
    return (
      <Card className="p-8 text-center">
        <p className="text-muted-foreground">
          No alarms set. Create one above!
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      {sorted.map((alarm) => (
        <Card
          key={alarm.id}
          className={cn(
            "p-3 flex items-center gap-3 transition-opacity",
            !alarm.enabled && "opacity-50",
          )}
        >
          <div className="min-w-[4.5rem]">
            <span className="text-xl font-bold tabular-nums">
              {alarm.time}
            </span>
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium truncate">{alarm.label}</span>
              {alarm.priority === "high" && (
                <span className="shrink-0 rounded-full bg-red-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase text-red-600 dark:text-red-400">
                  High
                </span>
              )}
              {alarm.subject !== "none" && (
                <span className="shrink-0 rounded-full bg-blue-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase text-blue-600 dark:text-blue-400">
                  {alarm.subject}
                </span>
              )}
            </div>
            <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
              {alarm.repeatDays.length > 0 ? (
                <div className="flex gap-0.5">
                  {alarm.repeatDays.map((d) => (
                    <span
                      key={d}
                      className="inline-flex h-4 w-4 items-center justify-center rounded bg-muted text-[9px] font-medium"
                    >
                      {DAY_LABELS[d]}
                    </span>
                  ))}
                </div>
              ) : (
                <span>One-time</span>
              )}
              <Volume2 className="h-3 w-3" />
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => onToggle(alarm.id)}
              aria-label={alarm.enabled ? "Disable alarm" : "Enable alarm"}
              className={cn(
                "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors",
                alarm.enabled ? "bg-primary" : "bg-muted",
              )}
            >
              <span
                className={cn(
                  "pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-lg transition-transform",
                  alarm.enabled ? "translate-x-4" : "translate-x-0",
                )}
              />
            </button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => onEdit(alarm)}
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-destructive"
              onClick={() => onDelete(alarm.id)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </Card>
      ))}
    </div>
  );
}
