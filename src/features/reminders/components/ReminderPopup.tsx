"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Bell, ExternalLink, PlayCircle, Tag, X } from "lucide-react";
import type { Reminder } from "@/features/reminders/types";

interface ReminderPopupProps {
  reminder: Reminder;
  onDismiss: () => void;
  onSnooze: (minutes: number) => void;
}

const WEEK_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function extractYoutubeId(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtu.be")) {
      const id = u.pathname.replace("/", "").split("/")[0];
      return id || null;
    }
    if (u.hostname.includes("youtube.com")) {
      if (u.pathname.includes("/watch")) return u.searchParams.get("v");
      if (u.pathname.includes("/shorts/")) return u.pathname.split("/shorts/")[1]?.split("/")[0] || null;
      if (u.pathname.includes("/embed/")) return u.pathname.split("/embed/")[1]?.split("/")[0] || null;
    }
  } catch {
    // ignore
  }
  return null;
}

function openVideo(url: string) {
  try {
    if (typeof window === "undefined") return;
    // Try to open in app if YouTube/intent available, else new tab
    window.open(url, "_blank", "noopener,noreferrer");
  } catch {
    // ignore
  }
}

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

  const videoUrl = reminder.videoUrl?.trim();
  const ytId = videoUrl ? extractYoutubeId(videoUrl) : null;

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
          {videoUrl && (
            <div className="mt-4">
              <Button
                onClick={() => openVideo(videoUrl)}
                className="w-full gap-2 bg-red-600 hover:bg-red-700 text-white"
                size="lg"
              >
                {ytId ? <PlayCircle className="h-5 w-5" /> : <ExternalLink className="h-5 w-5" />}
                Watch video
              </Button>
              {reminder.videoTitle && (
                <p className="mt-1 text-xs text-muted-foreground truncate">{reminder.videoTitle}</p>
              )}
            </div>
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