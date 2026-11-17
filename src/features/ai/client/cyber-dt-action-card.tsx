"use client";

import { useState } from "react";
import {
  AlarmClock,
  BellRing,
  CalendarDays,
  Check,
  Compass,
  Pencil,
  Target,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  editCyberDTAction,
  undoCyberDTAction,
  type AppliedCyberDTAction,
} from "@/features/ai/client/cyber-dt-actions";

const ICONS = {
  set_alarm: AlarmClock,
  add_reminder: BellRing,
  add_micro_goal: Target,
  update_exam_tracker: CalendarDays,
  open_tool: Compass,
} as const;

const EDIT_LABELS: Record<AppliedCyberDTAction["action"]["type"], string> = {
  set_alarm: "Change alarm",
  add_reminder: "Change reminder",
  add_micro_goal: "Change goal",
  update_exam_tracker: "Change exam date",
  open_tool: "Open tool",
};

const inputClass =
  "w-full rounded-lg border border-cyan-500/30 bg-[#0b1220] px-2.5 py-1.5 text-xs text-cyan-50 [color-scheme:dark] placeholder:text-cyan-400/40 focus:border-cyan-400/60 focus:outline-none";

/**
 * Dark-neon confirmation card shown under the AI reply. Every action the AI
 * ran can be cancelled (removes the alarm/reminder/goal and restores the exam
 * date) or edited in place.
 */
export function CyberDTActionCard({
  item,
  onUpdate,
}: {
  item: AppliedCyberDTAction;
  onUpdate: (next: AppliedCyberDTAction) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [time, setTime] = useState(item.action.type === "set_alarm" ? item.action.time : "");
  const [label, setLabel] = useState(
    item.action.type === "set_alarm" ? item.action.label ?? "" : "",
  );
  const [datetime, setDatetime] = useState(
    item.action.type === "add_reminder" ? item.action.datetime : "",
  );
  const [title, setTitle] = useState(
    item.action.type === "add_reminder" || item.action.type === "add_micro_goal"
      ? item.action.title
      : "",
  );
  const [examDate, setExamDate] = useState(
    item.action.type === "update_exam_tracker" ? item.action.examDate : "",
  );
  const [targetStream, setTargetStream] = useState(
    item.action.type === "update_exam_tracker" ? item.action.targetStream ?? "" : "",
  );

  const Icon = ICONS[item.action.type] ?? Check;
  const cancelled = item.status === "cancelled";
  const failed = item.status === "failed";
  const editable = item.status === "done" && item.action.type !== "open_tool";

  const save = () => {
    const next = editCyberDTAction(item, {
      time: time || undefined,
      label: label || undefined,
      datetime: datetime || undefined,
      title: title || undefined,
      examDate: examDate || undefined,
      targetStream: item.action.type === "update_exam_tracker" ? targetStream : undefined,
    });
    onUpdate(next);
    setEditing(false);
  };

  return (
    <div
      className={cn(
        "mt-3 rounded-xl border p-3 transition",
        cancelled
          ? "border-white/10 bg-white/[0.03] opacity-70"
          : failed
            ? "border-rose-400/35 bg-rose-500/[0.07]"
            : "border-cyan-400/30 bg-gradient-to-br from-cyan-500/[0.10] via-[#0b1220] to-violet-500/[0.10] shadow-[0_0_22px_rgba(34,211,238,0.12)]",
      )}
    >
      <div className="flex items-start gap-2.5">
        <span
          className={cn(
            "mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg border",
            cancelled
              ? "border-white/10 bg-white/5 text-cyan-400/50"
              : failed
                ? "border-rose-400/40 bg-rose-500/15 text-rose-200"
                : "border-cyan-400/40 bg-cyan-500/15 text-cyan-200",
          )}
        >
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p
              className={cn(
                "text-xs font-bold",
                cancelled ? "text-cyan-300/50 line-through" : failed ? "text-rose-200" : "text-cyan-100",
              )}
            >
              {item.title}
            </p>
            {cancelled && (
              <span className="rounded-full border border-white/10 px-1.5 py-0.5 text-[0.6rem] font-semibold uppercase tracking-wide text-cyan-300/50">
                Cancelled
              </span>
            )}
          </div>
          <p className="mt-0.5 truncate text-[0.72rem] text-cyan-300/75" title={item.detail}>
            {failed && item.error ? item.error : item.detail}
          </p>

          {editable && !editing && (
            <div className="mt-2 flex items-center gap-3 text-[0.68rem] font-semibold">
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="flex items-center gap-1 text-cyan-300/80 transition hover:text-cyan-200"
              >
                <Pencil className="h-3 w-3" /> Edit
              </button>
              <button
                type="button"
                onClick={() => onUpdate(undoCyberDTAction(item))}
                className="flex items-center gap-1 text-rose-300/80 transition hover:text-rose-200"
              >
                <X className="h-3 w-3" /> Cancel
              </button>
            </div>
          )}

          {editable && editing && (
            <div className="mt-2 space-y-2">
              <p className="text-[0.62rem] font-semibold uppercase tracking-wide text-cyan-400/60">
                {EDIT_LABELS[item.action.type]}
              </p>
              {item.action.type === "set_alarm" && (
                <>
                  <input
                    type="time"
                    value={time}
                    onChange={(event) => setTime(event.target.value)}
                    className={inputClass}
                  />
                  <input
                    type="text"
                    value={label}
                    maxLength={80}
                    onChange={(event) => setLabel(event.target.value)}
                    placeholder="Alarm label"
                    className={inputClass}
                  />
                </>
              )}
              {item.action.type === "add_reminder" && (
                <>
                  <input
                    type="datetime-local"
                    value={datetime}
                    onChange={(event) => setDatetime(event.target.value)}
                    className={inputClass}
                  />
                  <input
                    type="text"
                    value={title}
                    maxLength={80}
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder="Reminder title"
                    className={inputClass}
                  />
                </>
              )}
              {item.action.type === "add_micro_goal" && (
                <input
                  type="text"
                  value={title}
                  maxLength={120}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="Goal task"
                  className={inputClass}
                />
              )}
              {item.action.type === "update_exam_tracker" && (
                <>
                  <input
                    type="date"
                    value={examDate}
                    onChange={(event) => setExamDate(event.target.value)}
                    className={inputClass}
                  />
                  <input
                    type="text"
                    value={targetStream}
                    maxLength={60}
                    onChange={(event) => setTargetStream(event.target.value)}
                    placeholder="Target stream (e.g. Biology)"
                    className={inputClass}
                  />
                </>
              )}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={save}
                  className="flex items-center gap-1 rounded-lg bg-cyan-500/80 px-2.5 py-1 text-[0.68rem] font-bold text-[#080D18] transition hover:bg-cyan-400"
                >
                  <Check className="h-3 w-3" /> Save
                </button>
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  className="rounded-lg border border-cyan-500/30 px-2.5 py-1 text-[0.68rem] font-semibold text-cyan-300/80 transition hover:bg-cyan-500/10"
                >
                  Close
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
