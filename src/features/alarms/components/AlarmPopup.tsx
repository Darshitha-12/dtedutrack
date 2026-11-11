"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { Alarm } from "@/features/alarms/lib/scheduler";
import { Clock, BookOpen, X } from "lucide-react";

interface AlarmPopupProps {
  alarm: Alarm;
  onDismiss: () => void;
  onSnooze: (minutes: number) => void;
}

export function AlarmPopup({ alarm, onDismiss, onSnooze }: AlarmPopupProps) {
  const [tick, setTick] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setTick(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const isHigh = alarm.priority === "high";
  const hh = tick.getHours().toString().padStart(2, "0");
  const mm = tick.getMinutes().toString().padStart(2, "0");

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div
        className={cn(
          "mx-4 w-full max-w-md rounded-2xl border p-8 text-center shadow-2xl",
          "animate-in fade-in zoom-in-95 duration-300",
          isHigh
            ? "border-red-500/30 bg-red-950/90"
            : "border-primary/30 bg-card",
        )}
      >
        {/* Icon */}
        <div className="mb-6">
          <div
            className={cn(
              "mx-auto mb-4 inline-flex h-20 w-20 items-center justify-center rounded-full text-4xl",
              "animate-pulse",
              isHigh ? "bg-red-500/20" : "bg-primary/20",
            )}
          >
            {isHigh ? "🚨" : "⏰"}
          </div>

          <p
            className={cn(
              "mb-1 text-xs font-bold uppercase tracking-widest",
              isHigh ? "text-red-400" : "text-primary",
            )}
          >
            {isHigh ? "HIGH PRIORITY ALARM" : "STUDY ALARM"}
          </p>

          <h2 className="text-2xl font-bold">{alarm.label}</h2>
        </div>

        {/* Live clock */}
        <div className="mb-6 flex items-center justify-center gap-2 text-4xl font-mono font-bold tabular-nums">
          <Clock className="h-6 w-6 text-muted-foreground" />
          <span>
            {hh}:{mm}
          </span>
        </div>

        {/* Subject badge */}
        {alarm.subject !== "none" && (
          <div className="mb-6 inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs font-medium">
            <BookOpen className="h-3 w-3" />
            {alarm.subject.charAt(0).toUpperCase() + alarm.subject.slice(1)}
          </div>
        )}

        {/* Actions */}
        <div className="space-y-2">
          <Button
            onClick={onDismiss}
            className="w-full bg-green-600 hover:bg-green-700 text-white"
            size="lg"
          >
            <X className="h-4 w-4 mr-2" />
            DISMISS
          </Button>

          <div className="flex gap-2">
            {[5, 10, 15].map((m) => (
              <Button
                key={m}
                variant="outline"
                className="flex-1"
                onClick={() => onSnooze(m)}
              >
                Snooze {m}m
              </Button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
