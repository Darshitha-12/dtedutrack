"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";
import {
  Bell,
  BellOff,
  Plus,
  Trash2,
} from "lucide-react";
import type { Reminder, ReminderMode } from "@/features/reminders/types";
import {
  REMINDER_DAYS,
  createReminder,
  loadReminders,
  saveReminders,
} from "@/features/reminders/types";

const MODES: { value: ReminderMode; label: string }[] = [
  { value: "once", label: "One time" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
];

function Label({ htmlFor, children }: { htmlFor?: string; children: React.ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium">
      {children}
    </label>
  );
}

function todayKey(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function repeatLabel(r: Reminder): string {
  if (r.mode === "once") return r.date;
  if (r.mode === "daily") return "Every day";
  if (!r.days.length) return "Weekly";
  return r.days.map((d) => REMINDER_DAYS[d].slice(0, 3)).join(", ");
}

export default function RemindersPage() {
  const { showToast } = useToast();

  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [mode, setMode] = useState<ReminderMode>("daily");
  const [date, setDate] = useState(todayKey());
  const [time, setTime] = useState("08:00");
  const [days, setDays] = useState<number[]>([1, 3]);

  const reload = useCallback(() => setReminders(loadReminders()), []);

  const notifyChanged = useCallback(() => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("biopulse:reminders-changed"));
    }
  }, []);

  useEffect(() => {
    reload();
    notifyChanged();
  }, [reload, notifyChanged]);

  const persist = useCallback(
    (next: Reminder[]) => {
      setReminders(next);
      saveReminders(next);
      notifyChanged();
    },
    [notifyChanged],
  );

  const addReminder = () => {
    if (!title.trim()) {
      showToast("Title required", "error");
      return;
    }
    const next = [
      createReminder({
        title,
        note,
        mode,
        date: mode === "once" ? date : undefined,
        days: mode === "weekly" ? days : undefined,
        time,
      }),
      ...reminders,
    ];
    persist(next);
    setTitle("");
    setNote("");
    showToast(`Reminder saved · ${time} · ${repeatLabel(next[0])}`, "success");
  };

  const toggleEnabled = (id: string) => {
    persist(
      reminders.map((r) => (r.id === id ? { ...r, enabled: !r.enabled, lastFiredKey: "" } : r)),
    );
  };

  const removeReminder = (id: string) => {
    persist(reminders.filter((r) => r.id !== id));
    showToast("Reminder deleted", "info");
  };

  const askPermission = async () => {
    if (typeof window !== "undefined" && "Notification" in window) {
      const perm = await Notification.requestPermission();
      showToast(
        perm === "granted"
          ? "Notifications enabled"
          : "Notifications blocked — full-screen popups still work in-app",
        perm === "granted" ? "success" : "info",
      );
    }
  };

  const testAlert = () => {
    showToast("Playing test alert now...", "info");
    window.dispatchEvent(new CustomEvent("biopulse:test-reminder"));
  };

  const sorted = [...reminders].sort((a, b) => a.time.localeCompare(b.time));

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-bold">Reminders</h1>
        <p className="text-sm text-muted-foreground">
          Study reminders that pop up full-screen (like alarms) while the app is open.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Add reminder</CardTitle>
          <CardDescription>Choose a time; we fire it in-app with sound + full-screen popup.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="reminder-title">Title</Label>
            <Input
              id="reminder-title"
              placeholder="e.g. Revise photosynthesis"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="reminder-note">Note (optional)</Label>
            <Input
              id="reminder-note"
              placeholder="Extra detail shown on the popup"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {MODES.map((m) => (
              <Button
                key={m.value}
                type="button"
                variant={mode === m.value ? "default" : "outline"}
                className="justify-center"
                onClick={() => setMode(m.value)}
              >
                {m.label}
              </Button>
            ))}
          </div>

          {mode === "once" && (
            <div className="space-y-2">
              <Label htmlFor="reminder-date">Date</Label>
              <Input
                id="reminder-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
          )}

          {mode === "weekly" && (
            <div className="space-y-2">
              <Label>Repeat on</Label>
              <div className="flex flex-wrap gap-2">
                {REMINDER_DAYS.map((dayLabel, i) => {
                  const active = days.includes(i);
                  return (
                    <Button
                      key={dayLabel}
                      type="button"
                      variant={active ? "default" : "outline"}
                      size="sm"
                      className="justify-center"
                      onClick={() =>
                        setDays((prev) =>
                          active ? prev.filter((d) => d !== i) : [...prev, i].sort(),
                        )
                      }
                    >
                      {dayLabel.slice(0, 3)}
                    </Button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="reminder-time">Time</Label>
            <Input
              id="reminder-time"
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value || "08:00")}
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={addReminder}>
              <Plus className="h-4 w-4 mr-2" />
              Add reminder
            </Button>
            <Button variant="outline" onClick={testAlert}>
              <Bell className="h-4 w-4 mr-2" />
              Test alert
            </Button>
            <Button variant="outline" onClick={askPermission}>
              <Bell className="h-4 w-4 mr-2" />
              Enable browser notifications
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-2">
        <h2 className="text-lg font-semibold">Upcoming ({sorted.length})</h2>
        {sorted.length === 0 && (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              No reminders yet. Add one above to get started.
            </CardContent>
          </Card>
        )}

        {sorted.map((r) => {
          const Icon = r.enabled ? Bell : BellOff;
          return (
            <Card key={r.id} className={cn(!r.enabled && "opacity-60")}>
              <CardContent className="flex items-center gap-3 py-3">
                <div
                  className={cn(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
                    r.enabled ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground",
                  )}
                >
                  <Icon className="h-4 w-4" />
                </div>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{r.title}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {r.time} · {repeatLabel(r)}
                  </p>
                  {r.note && (
                    <p className="mt-0.5 truncate text-xs text-muted-foreground/80">{r.note}</p>
                  )}
                </div>

                <button
                  onClick={() => toggleEnabled(r.id)}
                  className={cn(
                    "rounded-md px-2 py-1 text-xs font-semibold",
                    r.enabled
                      ? "bg-primary/10 text-primary hover:bg-primary/20"
                      : "bg-muted text-muted-foreground hover:bg-accent",
                  )}
                >
                  {r.enabled ? "ON" : "OFF"}
                </button>

                <button
                  onClick={() => removeReminder(r.id)}
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  aria-label="Delete reminder"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}