"use client";

import { useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import {
  AudioEngine,
  type AlarmSoundName,
} from "@/features/alarms/lib/audio-engine";
import type { Alarm, CreateAlarmInput } from "@/features/alarms/lib/scheduler";
import { Bell, Play, X, Check } from "lucide-react";

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

  const testSound = useCallback(() => {
    AudioEngine.play(input.sound as AlarmSoundName);
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
              value={input.sound}
              onChange={(e) =>
                setInput((p) => ({
                  ...p,
                  sound: e.target.value as CreateAlarmInput["sound"],
                }))
              }
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
            >
              <option value="chime">Crystal Chimes</option>
              <option value="digital">Digital Buzzer</option>
              <option value="bio">Bio-Alert Sweep</option>
            </select>
          </div>
        </div>

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
