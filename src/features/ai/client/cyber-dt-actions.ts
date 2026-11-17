"use client";

/**
 * Executes the in-app actions that Cyber DT returns with a reply.
 *
 * Everything is stored in the SAME localStorage keys the rest of BioPulse
 * already uses, and a change event is fired after every write so the mounted
 * ReminderPortal / AlarmPortal / ExamTracker reload immediately. That keeps one
 * source of truth: an alarm the AI set behaves exactly like one the student set
 * by hand (chime, popup, notification, vibration).
 */

import type {
  CyberDTAction,
  CyberDTSubject,
  CyberDTTool,
} from "@/features/ai/cyber-dt-shared";
import {
  createReminder,
  loadReminders,
  saveReminders,
} from "@/features/reminders/types";

/** Matches the keys used by the alarm/reminder/cyber-dt features. */
export const CYBER_DT_ALARMS_KEY = "biopulse_alarms_v1";
export const CYBER_DT_REMINDERS_KEY = "biopulse_reminders_v1";
export const CYBER_DT_EXAM_DATE_KEY = "cyberdt.examDate";
export const CYBER_DT_TARGET_STREAM_KEY = "cyberdt.targetStream";
export const CYBER_DT_GOALS_PREFIX = "cyberdt.goals.";

/** Fired after the AI changes the exam date or a micro-goal. */
export const CYBER_DT_EXAM_CHANGED_EVENT = "cyberdt:exam-changed";
export const CYBER_DT_GOALS_CHANGED_EVENT = "cyberdt:goals-changed";
/** Fired to switch the Cyber DT workspace to a tool (topic pre-filled). */
export const CYBER_DT_OPEN_TOOL_EVENT = "cyberdt:open-tool";

export type CyberDTActionStatus = "done" | "cancelled" | "failed";

/** A validated action plus the outcome the chat card renders. */
export interface AppliedCyberDTAction {
  /** Stable key for React + message updates. */
  key: string;
  action: CyberDTAction;
  status: CyberDTActionStatus;
  /** Short headline, e.g. "⏰ Alarm set". */
  title: string;
  /** One-line summary, e.g. "05:30 AM · Biology revision". */
  detail: string;
  /** Alarm / reminder id, used by Cancel and Edit. */
  createdId?: string;
  /** Micro-goal storage key (cyberdt.goals.YYYY-MM-DD). */
  goalDateKey?: string;
  /** Previous values so Cancel can restore the exam tracker. */
  previousExamDate?: string | null;
  previousTargetStream?: string | null;
  error?: string;
}

export interface MicroGoalRecord {
  subject: string;
  task: string;
  done: boolean;
}

function makeId(): string {
  return `cyberdt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function readJson<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): boolean {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function readString(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeString(key: string, value: string): boolean {
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function removeString(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* ignore blocked storage */
  }
}

function localDateKey(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatTime12(value: string): string {
  const [hours, minutes] = value.split(":").map(Number);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return value;
  const suffix = hours >= 12 ? "PM" : "AM";
  const h12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${String(h12).padStart(2, "0")}:${String(minutes).padStart(2, "0")} ${suffix}`;
}

function formatDateTime(date: string, time: string): string {
  try {
    const parsed = new Date(`${date}T${time}:00`);
    const day = parsed.toLocaleDateString(undefined, {
      weekday: "short",
      day: "numeric",
      month: "short",
    });
    return `${day} · ${formatTime12(time)}`;
  } catch {
    return `${date} ${formatTime12(time)}`;
  }
}

function normalizeGoalSubject(value: string | undefined): CyberDTSubject {
  const text = (value || "").trim().toLowerCase();
  if (text.startsWith("phys")) return "Physics";
  if (text.startsWith("chem")) return "Chemistry";
  return "Biology";
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function describeDays(days: number[] | undefined): string {
  if (!days || days.length === 0) return "";
  if (days.length === 7) return " · every day";
  return ` · ${days.map((day) => DAY_NAMES[day]).filter(Boolean).join(", ")}`;
}

/* -------------------------------------------------------------------------- */
/* Alarms                                                                     */
/* -------------------------------------------------------------------------- */

interface StoredAlarm {
  id: string;
  time: string;
  label: string;
  priority: "normal" | "high";
  subject: "none" | "biology" | "chemistry" | "physics" | "agriculture";
  sound: "chime" | "digital" | "bio";
  tts: boolean;
  repeatDays: number[];
  enabled: boolean;
  createdAt: number;
}

interface AlarmStore {
  alarms?: StoredAlarm[];
  fired?: Record<string, number>;
}

function alarmSubject(value: string | undefined): StoredAlarm["subject"] {
  const subject = normalizeGoalSubject(value);
  return subject.toLowerCase() as StoredAlarm["subject"];
}

function readAlarmStore(): AlarmStore {
  const parsed = readJson<AlarmStore>(CYBER_DT_ALARMS_KEY);
  return {
    alarms: Array.isArray(parsed?.alarms) ? parsed!.alarms : [],
    fired: parsed?.fired && typeof parsed.fired === "object" ? parsed.fired : {},
  };
}

function writeAlarmStore(store: AlarmStore): boolean {
  const ok = writeJson(CYBER_DT_ALARMS_KEY, store);
  if (ok) window.dispatchEvent(new Event("biopulse:alarms-changed"));
  return ok;
}

/**
 * The alarm scheduler treats an alarm with no repeat days as a ONE-TIME alarm
 * that fires only on the calendar day stored in `createdAt`. To let the AI set
 * "tomorrow at 6 AM" we move `createdAt` to the next occurrence of that clock
 * time (today if it is still ahead, otherwise tomorrow).
 */
function oneShotCreatedAt(time: string): number {
  const now = new Date();
  const [hours, minutes] = time.split(":").map(Number);
  const target = new Date(now);
  target.setHours(hours, minutes, 0, 0);
  // Compare whole minutes so asking for "5:30" at 5:30:20 still fires today.
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  if (hours * 60 + minutes < nowMinutes) target.setDate(target.getDate() + 1);
  return target.getTime();
}

/* -------------------------------------------------------------------------- */
/* Apply / undo / edit                                                        */
/* -------------------------------------------------------------------------- */

function applySetAlarm(action: Extract<CyberDTAction, { type: "set_alarm" }>): AppliedCyberDTAction {
  const days = Array.isArray(action.days) ? action.days : [];
  const store = readAlarmStore();
  const alarm: StoredAlarm = {
    id: makeId(),
    time: action.time,
    label: (action.label || "Study alarm").slice(0, 80),
    priority: "normal",
    subject: alarmSubject(action.subject),
    sound: "chime",
    tts: true,
    repeatDays: days,
    enabled: true,
    createdAt: days.length > 0 ? Date.now() : oneShotCreatedAt(action.time),
  };
  store.alarms = [...(store.alarms ?? []), alarm];
  if (!writeAlarmStore(store)) {
    return {
      key: makeId(),
      action,
      status: "failed",
      title: "⏰ Alarm",
      detail: `${formatTime12(action.time)} · ${alarm.label}`,
      error: "Could not save the alarm — device storage is blocked.",
    };
  }
  return {
    key: makeId(),
    action,
    status: "done",
    title: "⏰ Alarm set",
    detail: `${formatTime12(action.time)} · ${alarm.label}${describeDays(days)}`,
    createdId: alarm.id,
  };
}

function applyAddReminder(
  action: Extract<CyberDTAction, { type: "add_reminder" }>,
): AppliedCyberDTAction {
  const [date, time] = action.datetime.split("T");
  const list = loadReminders();
  const reminder = createReminder({
    title: action.title,
    note: action.subject ? `${action.subject} · Cyber DT study reminder` : "Cyber DT study reminder",
    mode: "once",
    date,
    time,
    sound: "chime",
    tts: true,
  });
  saveReminders([...list, reminder]);
  window.dispatchEvent(new Event("biopulse:reminders-changed"));
  return {
    key: makeId(),
    action,
    status: "done",
    title: "🔔 Reminder scheduled",
    detail: `${formatDateTime(date, time)} · ${reminder.title}`,
    createdId: reminder.id,
  };
}

function applyAddMicroGoal(
  action: Extract<CyberDTAction, { type: "add_micro_goal" }>,
): AppliedCyberDTAction {
  const dateKey = localDateKey();
  const storageKey = `${CYBER_DT_GOALS_PREFIX}${dateKey}`;
  const goals = readJson<MicroGoalRecord[]>(storageKey);
  const list = Array.isArray(goals) ? goals : [];
  const subject = normalizeGoalSubject(action.subject);
  const existing = list.find(
    (goal) => goal.task.toLowerCase() === action.title.toLowerCase(),
  );
  const goal: MicroGoalRecord = existing ?? { subject, task: action.title, done: false };
  const next = existing ? list : [...list, goal];
  if (!writeJson(storageKey, next)) {
    return {
      key: makeId(),
      action,
      status: "failed",
      title: "🎯 Micro-goal",
      detail: `${subject} · ${action.title}`,
      error: "Could not save the goal — device storage is blocked.",
    };
  }
  window.dispatchEvent(new CustomEvent(CYBER_DT_GOALS_CHANGED_EVENT, { detail: { date: dateKey } }));
  return {
    key: makeId(),
    action,
    status: "done",
    title: existing ? "🎯 Goal already on your list" : "🎯 Micro-goal added",
    detail: `${subject} · ${action.title}`,
    goalDateKey: storageKey,
  };
}

function applyUpdateExam(
  action: Extract<CyberDTAction, { type: "update_exam_tracker" }>,
): AppliedCyberDTAction {
  const previousExamDate = readString(CYBER_DT_EXAM_DATE_KEY);
  const previousTargetStream = readString(CYBER_DT_TARGET_STREAM_KEY);
  if (!writeString(CYBER_DT_EXAM_DATE_KEY, action.examDate)) {
    return {
      key: makeId(),
      action,
      status: "failed",
      title: "📅 Exam date",
      detail: action.examDate,
      error: "Could not save the exam date — device storage is blocked.",
    };
  }
  if (action.targetStream) writeString(CYBER_DT_TARGET_STREAM_KEY, action.targetStream);
  window.dispatchEvent(new Event(CYBER_DT_EXAM_CHANGED_EVENT));
  return {
    key: makeId(),
    action,
    status: "done",
    title: "📅 Exam date updated",
    detail: [action.examDate, action.targetStream].filter(Boolean).join(" · "),
    previousExamDate,
    previousTargetStream,
  };
}

function openTool(tool: CyberDTTool, topic?: string): void {
  const safeTopic = topic?.trim() || "";
  if (tool === "diagram_generator") {
    window.location.assign(
      `/diagrams${safeTopic ? `?topic=${encodeURIComponent(safeTopic)}` : ""}`,
    );
    return;
  }
  // The Cyber DT workspace listens for this event and switches tools in place.
  if (window.location.pathname.includes("/cyber-dt")) {
    window.dispatchEvent(
      new CustomEvent(CYBER_DT_OPEN_TOOL_EVENT, { detail: { tool, topic: safeTopic } }),
    );
    return;
  }
  // The floating chat can run on any page — navigate to the workspace instead.
  const params = new URLSearchParams({ tool });
  if (safeTopic) params.set("topic", safeTopic);
  window.location.assign(`/cyber-dt?${params.toString()}`);
}

const TOOL_LABELS: Record<CyberDTTool, string> = {
  essay_evaluator: "Essay Evaluator",
  flashcards: "Smart Flashcards",
  organic_assistant: "Organic Pathways",
  diagram_generator: "Diagram Lab",
};

function applyOpenTool(
  action: Extract<CyberDTAction, { type: "open_tool" }>,
): AppliedCyberDTAction {
  openTool(action.tool, action.topic);
  return {
    key: makeId(),
    action,
    status: "done",
    title: `🧭 ${TOOL_LABELS[action.tool]} opened`,
    detail: action.topic ? `Topic: ${action.topic}` : "Ready when you are",
  };
}

/** Validates + applies one action. Never throws. */
export function applyCyberDTAction(action: CyberDTAction): AppliedCyberDTAction {
  try {
    switch (action.type) {
      case "set_alarm":
        return applySetAlarm(action);
      case "add_reminder":
        return applyAddReminder(action);
      case "add_micro_goal":
        return applyAddMicroGoal(action);
      case "update_exam_tracker":
        return applyUpdateExam(action);
      case "open_tool":
        return applyOpenTool(action);
      default:
        return {
          key: makeId(),
          action,
          status: "failed",
          title: "Action",
          detail: "",
          error: "Unknown action.",
        };
    }
  } catch (error) {
    return {
      key: makeId(),
      action,
      status: "failed",
      title: "Action failed",
      detail: "",
      error: error instanceof Error ? error.message : "Could not run that action.",
    };
  }
}

/** Removes whatever an action created and marks the card cancelled. */
export function undoCyberDTAction(item: AppliedCyberDTAction): AppliedCyberDTAction {
  if (item.status !== "done") return item;
  try {
    switch (item.action.type) {
      case "set_alarm": {
        const store = readAlarmStore();
        store.alarms = (store.alarms ?? []).filter((alarm) => alarm.id !== item.createdId);
        writeAlarmStore(store);
        break;
      }
      case "add_reminder": {
        const next = loadReminders().filter((reminder) => reminder.id !== item.createdId);
        saveReminders(next);
        window.dispatchEvent(new Event("biopulse:reminders-changed"));
        break;
      }
      case "add_micro_goal": {
        if (item.goalDateKey) {
          const goals = readJson<MicroGoalRecord[]>(item.goalDateKey) ?? [];
          const task = item.action.title.toLowerCase();
          writeJson(
            item.goalDateKey,
            goals.filter((goal) => goal.task.toLowerCase() !== task),
          );
          window.dispatchEvent(
            new CustomEvent(CYBER_DT_GOALS_CHANGED_EVENT, {
              detail: { date: item.goalDateKey.slice(CYBER_DT_GOALS_PREFIX.length) },
            }),
          );
        }
        break;
      }
      case "update_exam_tracker": {
        if (item.previousExamDate) writeString(CYBER_DT_EXAM_DATE_KEY, item.previousExamDate);
        else removeString(CYBER_DT_EXAM_DATE_KEY);
        if (item.previousTargetStream) {
          writeString(CYBER_DT_TARGET_STREAM_KEY, item.previousTargetStream);
        } else {
          removeString(CYBER_DT_TARGET_STREAM_KEY);
        }
        window.dispatchEvent(new Event(CYBER_DT_EXAM_CHANGED_EVENT));
        break;
      }
      default:
        break;
    }
    return { ...item, status: "cancelled" };
  } catch (error) {
    return {
      ...item,
      status: "failed",
      error: error instanceof Error ? error.message : "Could not cancel that action.",
    };
  }
}

/** Fields the inline editor can change for each action type. */
export interface CyberDTActionEdit {
  time?: string;
  label?: string;
  datetime?: string;
  title?: string;
  examDate?: string;
  targetStream?: string;
}

/** Applies an inline edit in place, keeping the same card. */
export function editCyberDTAction(
  item: AppliedCyberDTAction,
  fields: CyberDTActionEdit,
): AppliedCyberDTAction {
  if (item.status !== "done") return item;
  try {
    switch (item.action.type) {
      case "set_alarm": {
        const time = fields.time && /^([01]\d|2[0-3]):[0-5]\d$/.test(fields.time)
          ? fields.time
          : item.action.time;
        const label = (fields.label ?? item.action.label ?? "Study alarm").slice(0, 80);
        const store = readAlarmStore();
        store.alarms = (store.alarms ?? []).map((alarm) =>
          alarm.id === item.createdId
            ? {
                ...alarm,
                time,
                label,
                createdAt:
                  alarm.repeatDays.length > 0 ? alarm.createdAt : oneShotCreatedAt(time),
              }
            : alarm,
        );
        writeAlarmStore(store);
        const action = { ...item.action, time, label };
        return {
          ...item,
          action,
          detail: `${formatTime12(time)} · ${label}${describeDays(action.days)}`,
        };
      }
      case "add_reminder": {
        const datetime = fields.datetime || item.action.datetime;
        const [date, time] = datetime.split("T");
        const title = (fields.title ?? item.action.title).slice(0, 80);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
          return item;
        }
        const next = loadReminders().map((reminder) =>
          reminder.id === item.createdId ? { ...reminder, title, date, time } : reminder,
        );
        saveReminders(next);
        window.dispatchEvent(new Event("biopulse:reminders-changed"));
        const action = { ...item.action, datetime: `${date}T${time}`, title };
        return { ...item, action, detail: `${formatDateTime(date, time)} · ${title}` };
      }
      case "add_micro_goal": {
        const title = (fields.title ?? item.action.title).slice(0, 120);
        if (!title) return item;
        if (item.goalDateKey) {
          const goals = readJson<MicroGoalRecord[]>(item.goalDateKey) ?? [];
          const oldTask = item.action.title.toLowerCase();
          writeJson(
            item.goalDateKey,
            goals.map((goal) =>
              goal.task.toLowerCase() === oldTask ? { ...goal, task: title } : goal,
            ),
          );
          window.dispatchEvent(
            new CustomEvent(CYBER_DT_GOALS_CHANGED_EVENT, {
              detail: { date: item.goalDateKey.slice(CYBER_DT_GOALS_PREFIX.length) },
            }),
          );
        }
        const action = { ...item.action, title };
        return { ...item, action, detail: `${normalizeGoalSubject(action.subject)} · ${title}` };
      }
      case "update_exam_tracker": {
        const examDate =
          fields.examDate && /^\d{4}-\d{2}-\d{2}$/.test(fields.examDate)
            ? fields.examDate
            : item.action.examDate;
        const targetStream =
          fields.targetStream !== undefined ? fields.targetStream.slice(0, 60) : item.action.targetStream;
        writeString(CYBER_DT_EXAM_DATE_KEY, examDate);
        if (targetStream) writeString(CYBER_DT_TARGET_STREAM_KEY, targetStream);
        else removeString(CYBER_DT_TARGET_STREAM_KEY);
        window.dispatchEvent(new Event(CYBER_DT_EXAM_CHANGED_EVENT));
        const action = { ...item.action, examDate, targetStream };
        return { ...item, action, detail: [examDate, targetStream].filter(Boolean).join(" · ") };
      }
      default:
        return item;
    }
  } catch {
    return item;
  }
}
