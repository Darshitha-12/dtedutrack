"use client";

/**
 * Collects a lightweight snapshot of the logged-in student's own BioPulse state
 * from local storage, so Cyber DT can answer personalized questions ("how many
 * days to my exam?", "how long did I study today?", "what are my micro-goals?")
 * and act on data that already exists (delete an alarm, tick off a goal).
 *
 * This is READ-ONLY and defensive: every value is parsed inside a try/catch and
 * bounded, so corrupt or blocked storage can never break a chat request. The
 * snapshot is sent with each message and re-validated on the server.
 */

import { SUBJECTS } from "@/types/subject";
import type { CyberDTUserContext, CyberDTUserMark } from "@/features/ai/cyber-dt-shared";

const KEYS = {
  examDate: "cyberdt.examDate",
  targetStream: "cyberdt.targetStream",
  goalsPrefix: "cyberdt.goals.",
  alarms: "biopulse_alarms_v1",
  reminders: "biopulse_reminders_v1",
  pomodoroLive: "biopulse_pomodoro_live_v1",
  stopwatchLive: "bp_timer_live_v1",
  dashboard: "bp_dashboard_cache_v1",
  examMarks: "bp_exam_marks_v1",
  worklogQueue: "bp_worklog_queue_v1",
  offline: "biopulse-offline-v1",
} as const;

function readJson<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function readString(key: string): string {
  try {
    return window.localStorage.getItem(key) || "";
  } catch {
    return "";
  }
}

function localDateKey(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function subjectLabel(id: unknown): string {
  if (typeof id !== "string") return "";
  const subject = SUBJECTS[id as keyof typeof SUBJECTS];
  return subject ? subject.name : id;
}

function toNumber(value: unknown): number | undefined {
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function clampPercent(value: unknown): number | undefined {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return Math.max(0, Math.min(100, Math.round(n)));
}

/** "HH:MM" if the value looks like a clock time, otherwise undefined. */
function clockTime(value: unknown): string | undefined {
  return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value) ? value : undefined;
}

function daysOf(value: unknown): number[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const days = value
    .map((day) => Number(day))
    .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6);
  return days.length > 0 ? Array.from(new Set(days)).slice(0, 7) : undefined;
}

/* ---- localStorage shapes (kept loose + defensive on purpose) ------------- */

interface OfflineStore {
  profile?: {
    name?: unknown;
    examDate?: unknown;
    subjects?: unknown;
    weakTopics?: unknown;
  };
  marks?: Array<{ subjectId?: unknown; score?: unknown; total?: unknown; examDate?: unknown }>;
  workLogs?: Array<{ date?: unknown; minutes?: unknown }>;
}

interface DashboardCache {
  profile?: { name?: unknown; examDate?: unknown };
  stats?: { studyMinutes?: unknown; weeklyMinutes?: unknown };
  studyWeek?: Array<{ date?: unknown; minutes?: unknown }>;
  marks?: Array<{ subjectId?: unknown; total?: unknown; examDate?: unknown }>;
}

interface AlarmStore {
  alarms?: Array<{
    time?: unknown;
    label?: unknown;
    repeatDays?: unknown;
    enabled?: unknown;
  }>;
}

interface ReminderStore {
  reminders?: Array<{
    title?: unknown;
    note?: unknown;
    date?: unknown;
    time?: unknown;
    enabled?: unknown;
  }>;
}

interface GoalRecord {
  subject?: unknown;
  task?: unknown;
  done?: unknown;
}

interface LiveLike {
  running?: unknown;
  phase?: unknown;
}

/* ---- Study time ---------------------------------------------------------- */

/**
 * Reads today's + this week's logged study minutes. The offline store's
 * workLogs are the app's real offline source for "today"; the dashboard's
 * weekly stat is preferred for the week so the number matches what the student
 * sees on their dashboard.
 */
function readStudyMinutes(
  offline: OfflineStore | null,
  cache: DashboardCache | null,
  today: string,
): { today?: number; week?: number } {
  const week = Array.isArray(cache?.studyWeek) ? cache!.studyWeek : [];
  const weeklyStat = toNumber(cache?.stats?.weeklyMinutes);
  const weeklyFromWeek = week.reduce((sum, day) => sum + (toNumber(day?.minutes) ?? 0), 0);

  const workLogs = Array.isArray(offline?.workLogs) ? offline!.workLogs : null;
  let todayMinutes: number | undefined;
  if (workLogs && workLogs.length > 0) {
    todayMinutes = workLogs
      .filter((log) => log?.date === today)
      .reduce((sum, log) => sum + (toNumber(log?.minutes) ?? 0), 0);
  }
  if (todayMinutes === undefined) {
    const entry = week.find((day) => day?.date === today);
    if (entry) todayMinutes = toNumber(entry.minutes);
  }
  if (todayMinutes === undefined) {
    const queue = readJson<Array<{ date?: unknown; minutes?: unknown }>>(KEYS.worklogQueue);
    if (Array.isArray(queue)) {
      const total = queue
        .filter((item) => item?.date === today)
        .reduce((sum, item) => sum + (toNumber(item.minutes) ?? 0), 0);
      if (total > 0) todayMinutes = total;
    }
  }

  const weekly = weeklyStat !== undefined && weeklyStat > 0 ? weeklyStat : weeklyFromWeek;
  return {
    today: todayMinutes === undefined ? undefined : Math.max(0, Math.round(todayMinutes)),
    week: weekly > 0 ? Math.round(weekly) : undefined,
  };
}

/* ---- Marks & weak subjects ---------------------------------------------- */

interface MarkWithScore {
  subject: string;
  percent?: number;
  fullMarks?: number;
  date?: string;
}

/**
 * Reads exam marks. The offline store keeps the real `score`/`total`; the
 * dashboard cache only mirrors `total` (full marks), so it is used as a
 * fallback and never turned into a percentage.
 */
function readMarks(offline: OfflineStore | null, cache: DashboardCache | null): MarkWithScore[] {
  const marks: MarkWithScore[] = [];
  const push = (subject: string, score: unknown, total: unknown, date: unknown) => {
    const label = subject;
    if (!label) return;
    const full = toNumber(total);
    const scored = toNumber(score);
    const percent =
      scored !== undefined && full !== undefined && full > 0 ? clampPercent((scored / full) * 100) : undefined;
    marks.push({
      subject: label,
      percent,
      fullMarks: full !== undefined && full > 0 ? Math.round(full) : undefined,
      date: typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined,
    });
  };

  const offlineMarks = Array.isArray(offline?.marks) ? offline!.marks : [];
  if (offlineMarks.length > 0) {
    for (const mark of offlineMarks) {
      push(subjectLabel(mark?.subjectId), mark?.score, mark?.total, mark?.examDate);
    }
  } else {
    const examMarks = readJson<Array<{ subjectId?: unknown; score?: unknown; total?: unknown; examDate?: unknown }>>(
      KEYS.examMarks,
    );
    if (Array.isArray(examMarks)) {
      for (const mark of examMarks) push(subjectLabel(mark?.subjectId), mark?.score, mark?.total, mark?.examDate);
    }
    const cacheMarks = Array.isArray(cache?.marks) ? cache!.marks : [];
    for (const mark of cacheMarks) push(subjectLabel(mark?.subjectId), undefined, mark?.total, mark?.examDate);
  }

  return marks
    .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""))
    .slice(0, 12);
}

function summarizeWeakSubjects(marks: MarkWithScore[]): string[] {
  const perSubject = new Map<string, number[]>();
  for (const mark of marks) {
    if (mark.percent === undefined) continue;
    const list = perSubject.get(mark.subject) ?? [];
    list.push(mark.percent);
    perSubject.set(mark.subject, list);
  }
  const averages = Array.from(perSubject.entries()).map(([subject, list]) => ({
    subject,
    percent: list.reduce((sum, value) => sum + value, 0) / list.length,
  }));
  return averages
    .filter((entry) => entry.percent < 50)
    .sort((a, b) => a.percent - b.percent)
    .slice(0, 3)
    .map((entry) => entry.subject);
}

/* ---- Snapshot ------------------------------------------------------------ */

/** Collects the snapshot. Returns an empty object when nothing is available. */
export function collectCyberDTUserContext(): CyberDTUserContext {
  if (typeof window === "undefined") return {};
  const out: CyberDTUserContext = {};

  const offline = readJson<OfflineStore>(KEYS.offline);
  const cache = readJson<DashboardCache>(KEYS.dashboard);
  const today = localDateKey();

  const offlineName = typeof offline?.profile?.name === "string" ? offline!.profile!.name!.trim() : "";
  const cacheName = typeof cache?.profile?.name === "string" ? cache!.profile!.name!.trim() : "";
  const name = offlineName || cacheName;
  if (name) out.name = name.slice(0, 60);

  const offlineExamDate = typeof offline?.profile?.examDate === "string" ? offline!.profile!.examDate! : "";
  const cacheExamDate = typeof cache?.profile?.examDate === "string" ? cache!.profile!.examDate! : "";
  const examDate = readString(KEYS.examDate) || offlineExamDate || cacheExamDate;
  if (/^\d{4}-\d{2}-\d{2}$/.test(examDate)) out.examDate = examDate;

  const stream = readString(KEYS.targetStream).trim();
  if (stream) out.stream = stream.slice(0, 60);

  const study = readStudyMinutes(offline, cache, today);
  if (study.today !== undefined) out.studyMinutesToday = study.today;
  if (study.week !== undefined) out.studyMinutesWeek = study.week;

  // Active alarms (enabled ones only — the student asked about "my alarms").
  const alarmStore = readJson<AlarmStore>(KEYS.alarms);
  const alarms = (Array.isArray(alarmStore?.alarms) ? alarmStore!.alarms : [])
    .filter((alarm) => alarm && alarm.enabled !== false)
    .map((alarm) => ({
      time: clockTime(alarm.time),
      label: typeof alarm.label === "string" ? alarm.label.trim().slice(0, 80) : undefined,
      days: daysOf(alarm.repeatDays),
      enabled: true,
    }))
    .filter((alarm) => alarm.time || alarm.label)
    .slice(0, 12);
  if (alarms.length > 0) out.alarms = alarms;

  // Upcoming reminders (enabled, dated today or later).
  const reminderStore = readJson<ReminderStore>(KEYS.reminders);
  const reminders = (Array.isArray(reminderStore?.reminders) ? reminderStore!.reminders : [])
    .filter((reminder) => reminder && reminder.enabled !== false)
    .map((reminder) => {
      const date =
        typeof reminder.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(reminder.date) ? reminder.date : "";
      const time = clockTime(reminder.time);
      return {
        title: typeof reminder.title === "string" ? reminder.title.trim().slice(0, 80) : "",
        datetime: date && time ? `${date}T${time}` : undefined,
        sortKey: date && time ? `${date}T${time}` : "9999",
        subject: typeof reminder.note === "string" ? reminder.note.trim().slice(0, 40) : undefined,
      };
    })
    .filter((reminder) => reminder.title && (!reminder.datetime || reminder.datetime.slice(0, 10) >= today))
    .sort((a, b) => a.sortKey.localeCompare(b.sortKey))
    .slice(0, 12)
    .map(({ title, datetime, subject }) => ({ title, datetime, subject }));
  if (reminders.length > 0) out.reminders = reminders;

  // Today's micro-goals.
  const goals = readJson<GoalRecord[]>(`${KEYS.goalsPrefix}${today}`);
  const microGoals = (Array.isArray(goals) ? goals : [])
    .map((goal) => ({
      title: typeof goal.task === "string" ? goal.task.trim().slice(0, 120) : "",
      subject: typeof goal.subject === "string" ? goal.subject.trim().slice(0, 40) : undefined,
      done: goal.done === true,
    }))
    .filter((goal) => goal.title)
    .slice(0, 20);
  if (microGoals.length > 0) out.microGoals = microGoals;

  // Recent marks + weak-subject summary.
  const marks = readMarks(offline, cache);
  if (marks.length > 0) {
    out.recentMarks = marks.map(
      (mark): CyberDTUserMark => ({
        subject: mark.subject,
        percent: mark.percent,
        fullMarks: mark.fullMarks,
        date: mark.date,
      }),
    );
    const weak = summarizeWeakSubjects(marks);
    if (weak.length > 0) out.weakSubjects = weak;
  }

  // Subjects the student actually studies (profile list wins, else from marks).
  const profileSubjects = Array.isArray(offline?.profile?.subjects)
    ? (offline!.profile!.subjects as unknown[])
        .map((subject) => subjectLabel(subject) || (typeof subject === "string" ? subject : ""))
        .filter(Boolean)
        .slice(0, 8)
    : [];
  const subjects =
    profileSubjects.length > 0
      ? profileSubjects
      : Array.from(new Set(marks.map((mark) => mark.subject))).slice(0, 8);
  if (subjects.length > 0) out.subjects = subjects;

  // Study timer: the Pomodoro first (it is the study timer), then the stopwatch.
  const pomodoro = readJson<LiveLike>(KEYS.pomodoroLive);
  const stopwatch = readJson<LiveLike>(KEYS.stopwatchLive);
  if (pomodoro?.running === true) {
    out.timer = {
      running: true,
      mode: "pomodoro",
      phase: typeof pomodoro.phase === "string" ? pomodoro.phase : undefined,
    };
  } else if (stopwatch?.running === true) {
    out.timer = { running: true, mode: "stopwatch" };
  }

  return out;
}
