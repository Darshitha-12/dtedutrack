// Pure, deterministic A/L Smart Study Timetable scheduler.
// No database, no network, no AI. Fully unit-testable.

export const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export const STUDY_TYPES = ["Learn", "Revision", "MCQ", "PastPaper", "WeakTopic", "AITutor", "Review"] as const;
export type StudyType = (typeof STUDY_TYPES)[number];

export const PRIORITIES = ["Low", "Medium", "High"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const RECURRENCES = ["Once", "Daily", "Weekly", "SelectedWeekdays"] as const;
export type Recurrence = (typeof RECURRENCES)[number];

export const SESSION_STATUSES = ["scheduled", "completed", "skipped", "missed"] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

export const DEFAULT_SESSION_LENGTHS = [25, 45, 50, 60, 75, 90, 120];
export const DEFAULT_BREAK_AFTER = [25, 45, 50, 60, 90];
export const DEFAULT_BREAK_DURATIONS = [5, 10, 15, 20];

export interface TimeBlock {
  startMinute: number;
  endMinute: number;
}

export interface DayAvailability {
  dayOfWeek: number; // 0=Mon .. 6=Sun
  enabled: boolean;
  dailyTargetMin: number; // 0 = no target
  blocks: TimeBlock[];
}

export interface SubjectPriority {
  subjectId: string;
  name: string;
  priority: Priority;
  icon?: string;
  color?: string;
}

export interface StudyTypeWeight {
  type: StudyType;
  weight: number; // relative weight
}

export interface GenerateInput {
  days: DayAvailability[];
  weeklyTargetMin: number; // 0 = none
  subjects: SubjectPriority[];
  weakTopics: string[];
  sessionLengthMin: number;
  breakAfterMin: number;
  breakDurationMin: number;
  showBreaks: boolean;
  studyTypes: StudyTypeWeight[];
}

export interface PlannedSession {
  dayOfWeek: number;
  startMinute: number;
  endMinute: number;
  subjectId: string;
  subjectName: string;
  type: StudyType;
  priority: Priority;
  isBreak: boolean;
  topicTitle?: string;
}

export interface GenerationResult {
  sessions: PlannedSession[]; // only real (non-break) sessions
  weeklyAvailableMin: number;
  weeklyPlannedMin: number;
  weeklyTargetMin: number;
  remainingMin: number;
  byDay: {
    dayOfWeek: number;
    availableMin: number;
    plannedMin: number;
  }[];
}

// ---------- clock helpers ----------

export function minutesToHm(minutes: number): { h: number; m: number } {
  const total = Math.max(0, Math.round(minutes));
  return { h: Math.floor(total / 60) % 24, m: total % 60 };
}

export function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function formatClock(minutes: number, timeFormat: "12h" | "24h" = "24h"): string {
  const { h, m } = minutesToHm(minutes);
  if (timeFormat === "12h") {
    const ampm = h >= 12 ? "PM" : "AM";
    const hh = ((h % 12) || 12).toString().padStart(2, "0");
    return `${hh}:${pad2(m)} ${ampm}`;
  }
  return `${pad2(h)}:${pad2(m)}`;
}

export function parseTimeToMinutes(time: string): number {
  const [h, m] = time.split(":").map((x) => parseInt(x, 10) || 0);
  return h * 60 + m;
}

export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

// ---------- availability helpers ----------

export function blockMinutes(block: TimeBlock): number {
  return Math.max(0, block.endMinute - block.startMinute);
}

/** Sorts blocks and merges any overlapping/adjacent ones. */
export function normalizeBlocks(blocks: TimeBlock[]): TimeBlock[] {
  const sorted = blocks
    .filter((b) => b.endMinute > b.startMinute)
    .slice()
    .sort((a, b) => a.startMinute - b.startMinute);
  const merged: TimeBlock[] = [];
  for (const b of sorted) {
    const last = merged[merged.length - 1];
    if (last && b.startMinute <= last.endMinute) {
      last.endMinute = Math.max(last.endMinute, b.endMinute);
    } else {
      merged.push({ startMinute: b.startMinute, endMinute: b.endMinute });
    }
  }
  return merged;
}

export function dayTotalAvailable(blocks: TimeBlock[]): number {
  return normalizeBlocks(blocks).reduce((sum, b) => sum + blockMinutes(b), 0);
}

export function dayOfWeekIndex(date: Date): number {
  // JS getDay(): 0=Sun..6=Sat -> convert to 0=Mon..6=Sun
  return (date.getDay() + 6) % 7;
}

// ---------- conflict detection ----------

export interface SessionInterval {
  id?: string;
  date?: string; // yyyy-mm-dd for specific-date sessions
  dayOfWeek?: number; // for recurring sessions
  startMinute: number;
  endMinute: number;
}

export interface Conflict {
  a: SessionInterval;
  b: SessionInterval;
  overlapMin: number;
}

/** Returns the list of existing sessions that conflict with the candidate. */
export function findConflicts(
  existing: SessionInterval[],
  candidate: SessionInterval,
): Conflict[] {
  const result: Conflict[] = [];
  for (const e of existing) {
    const overlap = Math.min(e.endMinute, candidate.endMinute) - Math.max(e.startMinute, candidate.startMinute);
    const sameSlot =
      e.date !== undefined && candidate.date !== undefined
        ? e.date === candidate.date
        : e.dayOfWeek !== undefined && candidate.dayOfWeek !== undefined
          ? e.dayOfWeek === candidate.dayOfWeek
          : e.date === candidate.date && candidate.date !== undefined;
    if (sameSlot && overlap > 0) {
      result.push({ a: { ...e }, b: { ...candidate }, overlapMin: overlap });
    }
  }
  return result;
}

/** For a given day-of-week, return free slots given availability blocks plus booked sessions. */
export function findFreeSlots(
  blocks: TimeBlock[],
  booked: SessionInterval[],
): TimeBlock[] {
  const normalized = normalizeBlocks(blocks);
  const occupied: TimeBlock[] = booked
    .filter((s) => s.dayOfWeek !== undefined)
    .map((s) => ({ startMinute: s.startMinute, endMinute: s.endMinute }));
  const mergedOccupied = normalizeBlocks(occupied);
  const free: TimeBlock[] = [];
  for (const block of normalized) {
    let cursor = block.startMinute;
    for (const occ of mergedOccupied) {
      if (occ.endMinute <= cursor) continue;
      if (occ.startMinute >= block.endMinute) break;
      const start = Math.max(cursor, occ.startMinute);
      if (start > cursor) free.push({ startMinute: cursor, endMinute: start });
      cursor = Math.max(cursor, occ.endMinute);
    }
    if (cursor < block.endMinute) free.push({ startMinute: cursor, endMinute: block.endMinute });
  }
  return free.filter((f) => f.endMinute - f.startMinute > 0);
}

// ---------- generation ----------

export interface WeightedSubject {
  subjectId: string;
  name: string;
  priority: Priority;
  weight: number;
}

function priorityWeight(p: Priority): number {
  switch (p) {
    case "High": return 1.6;
    case "Medium": return 1.0;
    default: return 0.6;
  }
}

/** Build a weighted round-robin list of subjects (expanded by weight). */
function buildSubjectPool(subjects: SubjectPriority[]): WeightedSubject[] {
  const pool: WeightedSubject[] = [];
  for (const s of subjects) {
    const w = priorityWeight(s.priority);
    const reps = Math.max(1, Math.round(w * 2));
    for (let i = 0; i < reps; i++) {
      pool.push({
        subjectId: s.subjectId,
        name: s.name,
        priority: s.priority,
        weight: w,
      });
    }
  }
  if (pool.length === 0) {
    pool.push({ subjectId: "generic", name: "Study", priority: "Medium", weight: 1 });
  }
  return pool;
}

function buildTypePool(studyTypes: StudyTypeWeight[]): StudyType[] {
  const weights = studyTypes.length > 0 ? studyTypes : [{ type: "Learn" as StudyType, weight: 1 }];
  const pool: StudyType[] = [];
  for (const t of weights) {
    const reps = Math.max(1, Math.round(t.weight * 2));
    for (let i = 0; i < reps; i++) pool.push(t.type);
  }
  if (pool.length === 0) pool.push("Learn");
  return pool;
}

export function generateTimeTable(input: GenerateInput): GenerationResult {
  const days = input.days
    .filter((d) => d.enabled && d.blocks.length > 0)
    .map((d) => ({ ...d, blocks: normalizeBlocks(d.blocks) }));

  const weeklyAvailableMin = days.reduce((s, d) => s + dayTotalAvailable(d.blocks), 0);

  // Per-day planned minutes = daily target cap (if any) else full availability.
  const dayPlan: { dayOfWeek: number; availableMin: number; plannedMin: number; blocks: TimeBlock[]; dailyTargetMin: number }[] =
    days.map((d) => {
      const avail = dayTotalAvailable(d.blocks);
      const cap = d.dailyTargetMin > 0 ? Math.min(d.dailyTargetMin, avail) : avail;
      return {
        dayOfWeek: d.dayOfWeek,
        availableMin: avail,
        plannedMin: cap,
        blocks: d.blocks,
        dailyTargetMin: d.dailyTargetMin,
      };
    });

  const rawDayTotal = dayPlan.reduce((s, d) => s + d.plannedMin, 0);

  // Effective weekly planned cap. Never exceed total availability.
  let weeklyPlannedMin = 0;
  if (input.weeklyTargetMin > 0) {
    weeklyPlannedMin = Math.min(input.weeklyTargetMin, weeklyAvailableMin, rawDayTotal || weeklyAvailableMin);
    // Distribute weekly cap across days proportionally, never over a day's available time.
    if (rawDayTotal > 0 && weeklyPlannedMin < rawDayTotal) {
      const scale = weeklyPlannedMin / rawDayTotal;
      for (const d of dayPlan) {
        d.plannedMin = Math.min(d.availableMin, Math.max(5, Math.round(d.plannedMin * scale)));
      }
    }
  } else {
    weeklyPlannedMin = rawDayTotal;
  }

  const subjectPool = buildSubjectPool(input.subjects);
  const typePool = buildTypePool(input.studyTypes);
  const weakTopics = input.weakTopics || [];

  let si = 0;
  let ti = 0;

  const sessions: PlannedSession[] = [];
  const byDay = dayPlan.map((d) => ({ dayOfWeek: d.dayOfWeek, availableMin: d.availableMin, plannedMin: d.plannedMin }));

  const sessionLen = Math.max(10, input.sessionLengthMin);

  for (const day of dayPlan) {
    let remaining = day.plannedMin;
    // Track the current block cursor.
    let blockIndex = 0;
    let cursor = day.blocks[0]?.startMinute ?? 0;

    // Leave a little flexibility: reserve up to 5 min at end.
    while (remaining >= sessionLen && blockIndex < day.blocks.length) {
      const block = day.blocks[blockIndex];
      if (cursor < block.startMinute) cursor = block.startMinute;
      if (cursor + sessionLen > block.endMinute) {
        blockIndex++;
        cursor = block.startMinute;
        continue;
      }
      const subj = subjectPool[si % subjectPool.length];
      si++;
      const type = typePool[ti % typePool.length];
      ti++;
      const topicTitle = type === "WeakTopic" && weakTopics.length > 0
        ? weakTopics[(si + ti) % weakTopics.length]
        : undefined;
      sessions.push({
        dayOfWeek: day.dayOfWeek,
        startMinute: cursor,
        endMinute: cursor + sessionLen,
        subjectId: subj.subjectId,
        subjectName: subj.name,
        type,
        priority: subj.priority,
        isBreak: false,
        topicTitle,
      });
      cursor += sessionLen;
      remaining -= sessionLen;

      // Insert a break after breakAfterMin of contiguous study within this block.
      if (input.showBreaks && remaining > 0) {
        const nextBreakEnd = cursor + input.breakDurationMin;
        if (nextBreakEnd <= block.endMinute && cursor - block.startMinute >= input.breakAfterMin) {
          cursor += input.breakDurationMin;
        }
      }
    }
  }

  const remainingMin = Math.max(0, weeklyAvailableMin - weeklyPlannedMin);

  return { sessions, weeklyAvailableMin, weeklyPlannedMin, weeklyTargetMin: input.weeklyTargetMin, remainingMin, byDay };
}

// ---------- weekly / today computation ----------

export interface SessionBoardRow {
  id: string;
  date?: string;
  dayOfWeek?: number;
  subjectName: string;
  topicTitle?: string;
  type: StudyType;
  priority: Priority;
  status: SessionStatus;
  startMinute: number;
  endMinute: number;
  recurrence: Recurrence;
  reminderMin: number;
}

export function todaySummary(
  sessions: SessionBoardRow[],
  date = new Date(),
): {
  dayOfWeek: number;
  scheduledMin: number;
  completedMin: number;
  remainingMin: number;
  current?: SessionBoardRow;
  upNext?: SessionBoardRow;
} {
  const dow = dayOfWeekIndex(date);
  const todaySessions = sessions
    .filter((s) => {
      if (s.date) {
        return s.date === dateKeyOf(date);
      }
      return s.dayOfWeek === dow;
    })
    .sort((a, b) => a.startMinute - b.startMinute)
    // count each non-recurring occurrence once; recurring shown per their weekday
    .map((s) => (s.date && s.date !== dateKeyOf(date) ? null : s))
    .filter((s): s is SessionBoardRow => s !== null);

  const now = date.getHours() * 60 + date.getMinutes();
  const completedMin = todaySessions
    .filter((s) => s.status === "completed" || (s.endMinute <= now && s.status === "scheduled"))
    .reduce((sum, s) => sum + (s.endMinute - s.startMinute), 0);

  const scheduledMin = todaySessions.reduce((sum, s) => sum + (s.endMinute - s.startMinute), 0);

  const current = todaySessions.find((s) => s.status !== "completed" && s.status !== "skipped" && now >= s.startMinute && now < s.endMinute);
  const upNext = todaySessions.find((s) => s.status !== "completed" && s.status !== "skipped" && s.startMinute > now);

  return {
    dayOfWeek: dow,
    scheduledMin,
    completedMin,
    remainingMin: Math.max(0, scheduledMin - completedMin),
    current,
    upNext,
  };
}

export function dateKeyOf(date: Date): string {
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${m}-${d}`;
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}
