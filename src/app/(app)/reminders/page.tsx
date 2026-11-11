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
  CheckCircle2,
  ExternalLink,
  Plus,
  Repeat,
  Trash2,
  Youtube,
} from "lucide-react";
import type { Reminder, ReminderMode, ReminderSound } from "@/features/reminders/types";
import {
  REMINDER_DAYS,
  REVISION_PRESETS,
  addDaysToKey,
  advanceRevision,
  createReminder,
  createRevisionReminder,
  loadReminders,
  prettyDateKey,
  revisionSummary,
  saveReminders,
} from "@/features/reminders/types";
import { SoundPicker } from "@/features/alarms/components/SoundPicker";
import {
  SOUNDS_CHANGED_EVENT,
  listCustomSounds,
  soundLabel,
  type CustomSoundMeta,
} from "@/features/alarms/lib/custom-sounds";

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

/** A normal, swipe-away "Reminder set" notification (never pinned). */
function nativeReminderSetNotice(title: string, detail: string): void {
  try {
    const bridge = (
      window as unknown as {
        BioPulseBridge?: { reminderSetNotice?: (title: string, text: string) => void };
      }
    ).BioPulseBridge;
    if (!bridge || typeof bridge.reminderSetNotice !== "function") return;
    bridge.reminderSetNotice("Reminder set", `${title} · ${detail}`);
  } catch {
    /* not running inside the Android shell */
  }
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
  const [sound, setSound] = useState<ReminderSound>("chime");
  const [voice, setVoice] = useState(true);
  const [videoUrl, setVideoUrl] = useState("");
  const [videoTitle, setVideoTitle] = useState("");
  const [library, setLibrary] = useState<CustomSoundMeta[]>([]);
  // Revision plan (spaced repetition) builder
  const [revTitle, setRevTitle] = useState("");
  const [revNote, setRevNote] = useState("");
  const [revStart, setRevStart] = useState(todayKey());
  const [revTime, setRevTime] = useState("20:00");
  const [presetId, setPresetId] = useState(REVISION_PRESETS[0].id);

  useEffect(() => {
    const load = () => void listCustomSounds().then(setLibrary);
    load();
    window.addEventListener(SOUNDS_CHANGED_EVENT, load);
    return () => window.removeEventListener(SOUNDS_CHANGED_EVENT, load);
  }, []);

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
        sound,
        tts: voice,
        videoUrl,
        videoTitle,
      }),
      ...reminders,
    ];
    persist(next);
    nativeReminderSetNotice(next[0].title, `${time} · ${repeatLabel(next[0])}`);
    setTitle("");
    setNote("");
    setVideoUrl("");
    setVideoTitle("");
    showToast(`Reminder saved · ${time} · ${repeatLabel(next[0])}`, "success");
  };

  /** One reminder that walks the revision curve: 1 → 3 → 7 → 21 days. */
  const addRevision = () => {
    if (!revTitle.trim()) {
      showToast("Topic required", "error");
      return;
    }
    const preset = REVISION_PRESETS.find((p) => p.id === presetId) ?? REVISION_PRESETS[0];
    const next = [
      createRevisionReminder({
        title: revTitle,
        note: revNote,
        gaps: preset.gaps,
        time: revTime,
        startDate: revStart,
        sound,
        tts: voice,
      }),
      ...reminders,
    ];
    persist(next);
    nativeReminderSetNotice(
      next[0].title,
      `Revision plan · first ${prettyDateKey(next[0].date)}`,
    );
    setRevTitle("");
    setRevNote("");
    showToast(`Revision plan saved · first revision ${prettyDateKey(next[0].date)}`, "success");
  };

  const markRevised = (id: string) => {
    persist(reminders.map((r) => (r.id === id ? advanceRevision(r) : r)));
    const updated = loadReminders().find((r) => r.id === id);
    showToast(
      updated && !updated.enabled
        ? "Revision plan complete 🎉"
        : `Next revision ${prettyDateKey(updated?.date || "")}`,
      "success",
    );
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
    window.dispatchEvent(
      new CustomEvent("biopulse:test-reminder", { detail: { sound, tts: voice } }),
    );
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

      <Card className="border-primary/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Repeat className="h-4 w-4 text-primary" />
            Revision plan (spaced repetition)
          </CardTitle>
          <CardDescription>
            Study a topic once, then revise it just before you forget — 1, 3, 7 and 21 days later.
            One reminder reschedules itself after every revision.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="rev-title">Topic</Label>
            <Input
              id="rev-title"
              placeholder="e.g. Photosynthesis — light reactions"
              value={revTitle}
              onChange={(e) => setRevTitle(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="rev-note">What to recall (optional)</Label>
            <Input
              id="rev-note"
              placeholder="e.g. Draw the thylakoid membrane, explain cyclic flow"
              value={revNote}
              onChange={(e) => setRevNote(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Revision rhythm</Label>
            <div className="grid gap-2 sm:grid-cols-3">
              {REVISION_PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPresetId(p.id)}
                  className={cn(
                    "rounded-lg border px-3 py-2 text-left transition-colors",
                    presetId === p.id
                      ? "border-primary bg-primary/10"
                      : "border-border hover:bg-accent",
                  )}
                >
                  <span className="block text-sm font-semibold">{p.label}</span>
                  <span className="block text-[11px] text-muted-foreground">{p.hint}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-2">
              <Label htmlFor="rev-start">Studied on</Label>
              <Input
                id="rev-start"
                type="date"
                value={revStart}
                onChange={(e) => setRevStart(e.target.value || todayKey())}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rev-time">Remind at</Label>
              <Input
                id="rev-time"
                type="time"
                value={revTime}
                onChange={(e) => setRevTime(e.target.value || "20:00")}
              />
            </div>
          </div>

          <div className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
            {(() => {
              const preset = REVISION_PRESETS.find((p) => p.id === presetId) ?? REVISION_PRESETS[0];
              return (
                <>
                  <span className="font-medium text-foreground">
                    Next: {prettyDateKey(addDaysToKey(revStart, preset.gaps[0]))} at {revTime}
                  </span>
                  <span className="mt-1 block">
                    Then {preset.gaps.slice(1).join(" → ")} days. Tap &quot;I revised this&quot; on the
                    popup or the ✓ in the list and the next date is scheduled for you.
                  </span>
                </>
              );
            })()}
          </div>

          <Button onClick={addRevision}>
            <Plus className="h-4 w-4 mr-2" />
            Create revision plan
          </Button>
        </CardContent>
      </Card>

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

          <div className="space-y-2">
            <Label htmlFor="reminder-video">YouTube / Video link (optional)</Label>
            <Input
              id="reminder-video"
              placeholder="https://youtu.be/... or https://youtube.com/watch?v=..."
              value={videoUrl}
              onChange={(e) => setVideoUrl(e.target.value)}
            />
            {videoUrl.trim() && (
              <Input
                placeholder="Video title (shown on popup)"
                value={videoTitle}
                onChange={(e) => setVideoTitle(e.target.value)}
              />
            )}
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Youtube className="h-3 w-3" />
              Adds a &quot;Watch video&quot; button to the reminder popup.
            </p>
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

          <div className="space-y-2">
            <Label>Sound</Label>
            <SoundPicker value={sound} onChange={setSound} />
            <button
              type="button"
              onClick={() => setVoice((v) => !v)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium border transition-colors",
                voice
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-transparent text-muted-foreground border-border",
              )}
            >
              {voice ? "🔊 Voice announce On" : "🔇 Voice announce Off"}
            </button>
            <p className="text-[11px] text-muted-foreground">
              Speaks the title + note aloud when the reminder rings.
            </p>
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
                    {r.time} · {repeatLabel(r)} · {soundLabel(r.sound, library)} ·{" "}
                    {r.tts !== false ? "🔊 Voice" : "🔇 Silent"}
                  </p>
                  {r.note && (
                    <p className="mt-0.5 truncate text-xs text-muted-foreground/80">{r.note}</p>
                  )}
                  {r.kind === "revision" && r.revision && (
                    <p className="mt-1 inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                      <Repeat className="h-3 w-3" />
                      {revisionSummary(r)}
                    </p>
                  )}
                  {r.videoUrl && (
                    <a
                      href={r.videoUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-0.5 inline-flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      <ExternalLink className="h-3 w-3" />
                      {r.videoTitle || "Watch video"}
                    </a>
                  )}
                </div>

                {r.kind === "revision" && r.enabled && (
                  <button
                    onClick={() => markRevised(r.id)}
                    className="rounded-md p-1.5 text-muted-foreground hover:bg-primary/10 hover:text-primary"
                    aria-label="Mark revision done"
                    title="I revised this — schedule the next revision"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                  </button>
                )}

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