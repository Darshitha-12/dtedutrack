"use client";

import { useState, useCallback, useRef, useMemo, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import {
  AudioEngine,
  type AlarmSoundName,
} from "@/features/alarms/lib/audio-engine";
import {
  saveCustomSound,
  deleteCustomSound,
  listCustomSounds,
  getCustomSound,
  formatSize,
} from "@/features/alarms/lib/custom-sounds";
import type { Alarm, CreateAlarmInput } from "@/features/alarms/lib/scheduler";
import { Bell, Play, X, Check, Upload, Music2 } from "lucide-react";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const defaultInput: CreateAlarmInput = {
  time: "07:00",
  label: "",
  priority: "normal",
  subject: "none",
  sound: "chime",
  tts: false,
  repeatDays: [],
};

interface AlarmFormProps {
  editing?: Alarm | null;
  onSubmit: (input: CreateAlarmInput) => void;
  onCancel?: () => void;
}

export function AlarmForm({ editing, onSubmit, onCancel }: AlarmFormProps) {
  const [input, setInput] = useState<CreateAlarmInput>(() =>
    editing
      ? {
          time: editing.time,
          label: editing.label,
          priority: editing.priority,
          subject: editing.subject,
          sound: editing.sound,
          tts: editing.tts,
          repeatDays: [...editing.repeatDays],
        }
      : { ...defaultInput },
  );

  const isCustomSound = (s: string) =>
    typeof s === "string" && s.startsWith("custom:");
  const [customInfo, setCustomInfo] = useState<{
    id: string;
    name: string;
    size: number;
  } | null>(null);
  const [showCustomPicker, setShowCustomPicker] = useState(
    editing ? isCustomSound(editing.sound) : false,
  );
  const [customError, setCustomError] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // If editing an alarm that uses a custom sound, load its name/size from the store.
  useEffect(() => {
    if (editing && isCustomSound(editing.sound)) {
      const id = editing.sound.slice("custom:".length);
      setCustomInfo({ id, name: "Custom audio", size: 0 });
      listCustomSounds(true).then((items) => {
        const hit = items.find((it) => it.id === id);
        if (hit) setCustomInfo({ id, name: hit.name, size: hit.sizeBytes });
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  const chooseCustom = useCallback(async (file: File) => {
    const id =
      Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    const ok = await saveCustomSound(id, file.name, file);
    if (!ok) {
      setCustomError("Could not store the audio on this device.");
      return;
    }
    setCustomError("");
    setCustomInfo({ id, name: file.name, size: file.size });
    setShowCustomPicker(true);
    setInput((p) => ({ ...p, sound: `custom:${id}` }));
  }, []);

  const clearCustom = useCallback(async () => {
    if (customInfo) {
      await deleteCustomSound(customInfo.id);
    }
    setCustomInfo(null);
    setShowCustomPicker(false);
    setInput((p) => ({ ...p, sound: "chime" }));
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [customInfo]);

  const soundChoice = useMemo(
    () => (isCustomSound(input.sound) ? "custom" : input.sound) as
      | "chime"
      | "digital"
      | "bio"
      | "custom",
    [input.sound],
  );

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!input.label.trim()) return;
      onSubmit(input);
      if (!editing) {
        setInput({ ...defaultInput });
      }
    },
    [input, editing, onSubmit],
  );

  const toggleDay = useCallback((day: number) => {
    setInput((prev) => ({
      ...prev,
      repeatDays: prev.repeatDays.includes(day)
        ? prev.repeatDays.filter((d) => d !== day)
        : [...prev.repeatDays, day].sort(),
    }));
  }, []);

  const testSound = useCallback(async () => {
    if (isCustomSound(input.sound)) {
      const id = input.sound.slice("custom:".length);
      const custom = await getCustomSound(id);
      AudioEngine.playSound(input.sound, custom?.blob);
    } else {
      AudioEngine.play(input.sound as AlarmSoundName);
    }
    setTimeout(() => AudioEngine.stop(), 5000);
  }, [input.sound]);

  return (
    <Card className="p-4">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <Bell className="h-4 w-4" />
          <span className="font-semibold text-sm">
            {editing ? "Edit Alarm" : "New Alarm"}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              Time
            </label>
            <Input
              type="time"
              value={input.time}
              onChange={(e) =>
                setInput((p) => ({ ...p, time: e.target.value }))
              }
              required
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              Priority
            </label>
            <select
              value={input.priority}
              onChange={(e) =>
                setInput((p) => ({
                  ...p,
                  priority: e.target.value as "normal" | "high",
                }))
              }
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
            >
              <option value="normal">Normal</option>
              <option value="high">High</option>
            </select>
          </div>
        </div>

        <div>
          <label className="text-xs text-muted-foreground mb-1 block">
            Label
          </label>
          <Input
            value={input.label}
            onChange={(e) =>
              setInput((p) => ({ ...p, label: e.target.value.slice(0, 90) }))
            }
            placeholder="e.g. Biology Chapter 5 Review"
            maxLength={90}
            required
          />
          <p className="text-[10px] text-muted-foreground mt-0.5 text-right">
            {input.label.length}/90
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              Subject
            </label>
            <select
              value={input.subject}
              onChange={(e) =>
                setInput((p) => ({
                  ...p,
                  subject: e.target.value as CreateAlarmInput["subject"],
                }))
              }
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
            >
              <option value="none">None</option>
              <option value="biology">Biology</option>
              <option value="chemistry">Chemistry</option>
              <option value="physics">Physics</option>
              <option value="agriculture">Agriculture</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              Sound
            </label>
            <select
              value={soundChoice}
              onChange={(e) => {
                const v = e.target.value;
                if (v === "custom") {
                  setShowCustomPicker(true);
                  if (customInfo) {
                    setInput((p) => ({ ...p, sound: `custom:${customInfo.id}` }));
                  }
                } else {
                  setInput((p) => ({ ...p, sound: v as CreateAlarmInput["sound"] }));
                }
              }}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
            >
              <option value="chime">Crystal Chimes</option>
              <option value="digital">Digital Buzzer</option>
              <option value="bio">Bio-Alert Sweep</option>
              <option value="custom">Custom Audio…</option>
            </select>
          </div>
        </div>

        {soundChoice === "custom" && (
          <div className="rounded-md border border-dashed p-3">
            <div className="flex items-center gap-2">
              <Music2 className="h-4 w-4 text-muted-foreground" />
              <p className="text-xs font-medium text-muted-foreground">
                Custom alarm audio
              </p>
            </div>

            {customInfo && (
              <div className="mt-2 flex items-center gap-2 rounded-md bg-muted/50 px-3 py-2 text-xs">
                <Check className="h-3.5 w-3.5 text-green-600" />
                <span className="flex-1 min-w-0 truncate font-medium">
                  {customInfo.name}
                </span>
                <span className="shrink-0 text-muted-foreground">
                  {formatSize(customInfo.size)}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Remove custom sound"
                  onClick={() => clearCustom()}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            )}

            {!customInfo && (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="audio/*,.mp3,.wav,.m4a,.ogg,.aac"
                  className="block w-full text-xs file:border file:rounded-md file:bg-transparent"
                  onChange={(e) => {
                    const file = e.target.files?.item(0);
                    if (file) chooseCustom(file);
                  }}
                />
                <p className="mt-1 text-[10px] text-muted-foreground">
                  Any audio file — stored on this device (offline), no size limit.
                </p>
                {customError && (
                  <p className="mt-1 text-[11px] text-destructive">{customError}</p>
                )}
              </>
            )}
          </div>
        )}

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setInput((p) => ({ ...p, tts: !p.tts }))}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium border transition-colors",
              input.tts
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-transparent text-muted-foreground border-border",
            )}
          >
            {input.tts ? "TTS On" : "TTS Off"}
          </button>
          <Button type="button" variant="outline" size="sm" onClick={testSound}>
            <Play className="h-3 w-3 mr-1" />
            Test Sound
          </Button>
        </div>

        <div>
          <label className="text-xs text-muted-foreground mb-1.5 block">
            Repeat
          </label>
          <div className="flex gap-1.5">
            {DAYS.map((day, i) => (
              <button
                key={day}
                type="button"
                onClick={() => toggleDay(i)}
                className={cn(
                  "h-8 min-w-[2rem] rounded-full text-xs font-medium border transition-colors",
                  input.repeatDays.includes(i)
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-transparent text-muted-foreground border-border hover:bg-muted",
                )}
              >
                {day}
              </button>
            ))}
          </div>
          {input.repeatDays.length === 0 && (
            <p className="text-xs text-muted-foreground mt-1">
              One-time alarm
            </p>
          )}
        </div>

        <div className="flex gap-2 pt-1">
          <Button type="submit" className="flex-1">
            <Check className="h-4 w-4 mr-1" />
            {editing ? "Update" : "Save Alarm"}
          </Button>
          {editing && onCancel && (
            <Button type="button" variant="outline" onClick={onCancel}>
              <X className="h-4 w-4 mr-1" />
              Cancel
            </Button>
          )}
        </div>
      </form>
    </Card>
  );
}
