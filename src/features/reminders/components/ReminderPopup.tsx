"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Bell, Tag, X } from "lucide-react";
import type { Reminder } from "@/features/reminders/types";

interface ReminderPopupProps {
  reminder: Reminder;
  onDismiss: () => void;
  onSnooze: (minutes: number) => void;
}

const WEEK_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function ReminderPopup({ reminder, onDismiss, onSnooze }: ReminderPopupProps) {
  const [tick, setTick] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setTick(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const hh = tick.getHours().toString().padStart(2, "0");
  const mm = tick.getMinutes().toString().padStart(2, "0");

  const repeatLabel =
    reminder.mode === "once"
      ? reminder.date
      : reminder.mode === "daily"
        ? "Every day"
        : reminder.days.length
          ? reminder.days.map((d) => WEEK_SHORT[d]).join(" · ")
          : "Weekly";

  return (
    <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="mx-4 w-full max-w-md rounded-2xl border border-primary/30 bg-card p-8 text-center shadow-2xl animate-in fade-in zoom-in-95 duration-300">
        <div className="mb-6">
          <div className="mx-auto mb-4 inline-flex h-20 w-20 animate-pulse items-center justify-center rounded-full bg-primary/20 text-4xl">
            🔔
          </div>

          <p className="mb-1 text-xs font-bold uppercase tracking-widest text-primary">
            Reminder
          </p>

          <h2 className="text-2xl font-bold">{reminder.title}</h2>
          {reminder.note && (
            <p className="mt-2 text-sm text-muted-foreground">{reminder.note}</p>
          )}
        </div>

        <div className="mb-6 flex items-center justify-center gap-2 text-4xl font-mono font-bold tabular-nums">
          <Bell className="h-6 w-6 text-muted-foreground" />
          <span>
            {hh}:{mm}
          </span>
        </div>

        <div className="mb-6 inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs font-medium">
          <Tag className="h-3 w-3" />
          {repeatLabel}
        </div>

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