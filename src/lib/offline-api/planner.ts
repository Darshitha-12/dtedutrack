// Planner endpoints. The heavy generation/conflict logic is the app's own pure
// scheduler (@/features/planner/lib/scheduler) — no server needed.

import {
  generateTimeTable,
  findConflicts,
  findFreeSlots,
  dayTotalAvailable,
  PRIORITIES,
  type TimeBlock,
  type Priority,
} from "@/features/planner/lib/scheduler";
import { SUBJECT_LIST } from "@/types/subject";
import { getState, mutate, type OfflineState, type StoredPlannerSession, type StoredPlannerDay, type StoredPlannerPrefs } from "./store";
import { nowIso, uid } from "./runtime";

type Result = { status: number; body: Record<string, unknown> };

const DAYS = [0, 1, 2, 3, 4, 5, 6];
const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

class ValidationErr extends Error {
  issues: string[];
  constructor(issues: string[]) {
    super("Validation error");
    this.issues = issues;
  }
}

function req(cond: boolean, message: string): asserts cond {
  if (!cond) throw new ValidationErr([message]);
}

function mapSession(s: StoredPlannerSession): Record<string, unknown> {
  return {
    id: s.id,
    subjectId: s.subjectId,
    subjectName: s.subjectName,
    topicId: s.topicId,
    topicTitle: s.topicTitle,
    date: s.date,
    dayOfWeek: s.dayOfWeek,
    startMinute: s.startMinute,
    endMinute: s.endMinute,
    type: s.type,
    priority: s.priority,
    status: s.status,
    recurrence: s.recurrence,
    recurrenceDays: s.recurrenceDays,
    reminderMin: s.reminderMin,
    notes: s.notes,
  };
}

function defaultPrefs(): StoredPlannerPrefs {
  return {
    weeklyTargetMin: 0,
    sessionLengthMin: 60,
    breakAfterMin: 60,
    breakDurationMin: 10,
    timeFormat: "24h",
    showBreaks: true,
    subjectPriorities: [],
    studyTypes: [],
    weakTopics: [],
  };
}

function days(state: OfflineState): StoredPlannerDay[] {
  return DAYS.map((d) => {
    const row = state.plannerDays.find((r) => r.dayOfWeek === d);
    return row ?? { dayOfWeek: d, enabled: false, dailyTargetMin: 0, blocks: [] };
  });
}

function subjectsMerge() {
  const seen = new Set<string>();
  const all = SUBJECT_LIST.map((s) => ({ id: s.id, slug: s.id, name: s.name, icon: s.icon, color: s.color }));
  return all.filter((s) => (seen.has(s.id) ? false : (seen.add(s.id), true)));
}

export function plannerGet(): Result {
  const state = getState();
  const p = state.profile;
  return {
    status: 200,
    body: {
      prefs: state.plannerPrefs ?? defaultPrefs(),
      days: days(state),
      sessions: [...state.plannerSessions]
        .sort((a, b) => (a.dayOfWeek ?? 9) - (b.dayOfWeek ?? 9) || a.startMinute - b.startMinute)
        .map(mapSession),
      profile: {
        examYear: p.examYear ? Number(p.examYear) || null : null,
        examDate: p.examDate || null,
        examType: p.examType,
        weakTopics: p.weakTopics,
        subjects: p.subjects,
        dailyStudyTarget: p.dailyStudyTarget,
        weeklyStudyTarget: p.weeklyStudyTarget,
      },
      subjects: subjectsMerge(),
      dayNames: DAY_NAMES,
    },
  };
}

function parseSession(raw: unknown): StoredPlannerSession {
  const s = (raw ?? {}) as Record<string, unknown>;
  req(typeof s.subjectId === "string" && s.subjectId.length > 0, "subjectId is required");
  const startMinute = Number(s.startMinute);
  const endMinute = Number(s.endMinute);
  req(Number.isInteger(startMinute) && startMinute >= 0 && startMinute <= 1439, "Invalid startMinute");
  req(Number.isInteger(endMinute) && endMinute >= 1 && endMinute <= 1440, "Invalid endMinute");
  req(endMinute > startMinute, "End time must be after start time");
  const type = typeof s.type === "string" && s.type ? s.type : "Learn";
  const priority = typeof s.priority === "string" && s.priority ? s.priority : "Medium";
  const recurrence = typeof s.recurrence === "string" && s.recurrence ? s.recurrence : "Once";
  return {
    id: uid(),
    subjectId: s.subjectId,
    subjectName: typeof s.subjectName === "string" ? s.subjectName : "",
    topicId: typeof s.topicId === "string" && s.topicId ? s.topicId : null,
    topicTitle: typeof s.topicTitle === "string" && s.topicTitle ? s.topicTitle : null,
    date: typeof s.date === "string" && s.date ? s.date : null,
    dayOfWeek: typeof s.dayOfWeek === "number" && Number.isInteger(s.dayOfWeek) ? s.dayOfWeek : null,
    startMinute,
    endMinute,
    type,
    priority,
    status: "scheduled",
    recurrence,
    recurrenceDays: Array.isArray(s.recurrenceDays) ? (s.recurrenceDays as number[]) : [],
    reminderMin: typeof s.reminderMin === "number" ? s.reminderMin : 0,
    notes: typeof s.notes === "string" ? s.notes : "",
  };
}

function conflictsFor(state: OfflineState, s: StoredPlannerSession, ignoreId?: string) {
  const existing = state.plannerSessions
    .filter((r) => r.status === "scheduled" && r.id !== ignoreId)
    .filter((r) => (s.date ? r.date === s.date : s.dayOfWeek !== null ? r.dayOfWeek === s.dayOfWeek : false))
    .map((r) => ({
      id: r.id,
      date: r.date ?? undefined,
      dayOfWeek: r.dayOfWeek ?? undefined,
      startMinute: r.startMinute,
      endMinute: r.endMinute,
    }));
  return findConflicts(existing, {
    date: s.date ?? undefined,
    dayOfWeek: s.dayOfWeek ?? undefined,
    startMinute: s.startMinute,
    endMinute: s.endMinute,
  }).map((c) => ({ otherId: c.a.id, overlapMin: c.overlapMin, otherStart: c.a.startMinute, otherEnd: c.a.endMinute }));
}

export async function plannerPost(body: Record<string, unknown>): Promise<Result> {
  const action = typeof body.action === "string" ? body.action : "";
  const state = getState();

  switch (action) {
    case "saveDays": {
      req(Array.isArray(body.days), "days must be an array");
      for (const raw of body.days as Record<string, unknown>[]) {
        const d = Number(raw.dayOfWeek);
        req(Number.isInteger(d) && d >= 0 && d <= 6, "Invalid dayOfWeek");
        const enabled = raw.enabled === true;
        const dailyTargetMin = Number(raw.dailyTargetMin) || 0;
        const blocks = (Array.isArray(raw.blocks) ? raw.blocks : []).map((b) => ({
          startMinute: Number((b as Record<string, unknown>).startMinute),
          endMinute: Number((b as Record<string, unknown>).endMinute),
        }));
        mutate((s) => {
          const existing = s.plannerDays.find((x) => x.dayOfWeek === d);
          const value = { dayOfWeek: d, enabled, dailyTargetMin, blocks: enabled && blocks.length > 0 ? blocks : [] };
          if (existing) Object.assign(existing, value);
          else s.plannerDays.push(value);
        });
      }
      return { status: 200, body: { ok: true } };
    }

    case "savePrefs": {
      const prefs = defaultPrefs();
      if (body.weeklyTargetMin !== undefined) prefs.weeklyTargetMin = Number(body.weeklyTargetMin) || 0;
      if (body.sessionLengthMin !== undefined) prefs.sessionLengthMin = Number(body.sessionLengthMin) || 60;
      if (body.breakAfterMin !== undefined) prefs.breakAfterMin = Number(body.breakAfterMin) || 60;
      if (body.breakDurationMin !== undefined) prefs.breakDurationMin = Number(body.breakDurationMin) || 0;
      prefs.timeFormat = body.timeFormat === "12h" ? "12h" : "24h";
      prefs.showBreaks = body.showBreaks !== false;
      if (Array.isArray(body.subjectPriorities)) {
        prefs.subjectPriorities = (body.subjectPriorities as StoredPlannerPrefs["subjectPriorities"]).map((x) => ({
          subjectId: String(x.subjectId),
          name: String(x.name ?? ""),
          priority: (PRIORITIES as readonly string[]).includes(x.priority) ? x.priority : "Medium",
          icon: x.icon,
          color: x.color,
        }));
      }
      if (Array.isArray(body.studyTypes)) {
        prefs.studyTypes = (body.studyTypes as { type: string; weight: number }[])
          .filter((t) => typeof t.type === "string")
          .map((t) => ({ type: t.type, weight: Number(t.weight) || 0 }));
      }
      if (Array.isArray(body.weakTopics)) prefs.weakTopics = (body.weakTopics as unknown[]).map(String);
      let savedId = "";
      mutate((s) => {
        if (!s.plannerPrefs) s.plannerPrefs = { ...prefs, id: uid() } as StoredPlannerPrefs & { id: string };
        else Object.assign(s.plannerPrefs, prefs);
        savedId = (s.plannerPrefs as unknown as { id?: string }).id ?? "";
        if (!savedId) {
          savedId = uid();
          (s.plannerPrefs as unknown as { id: string }).id = savedId;
        }
      });
      return { status: 200, body: { ok: true, id: savedId } };
    }

    case "generate": {
      const s = getState();
      const prefs = s.plannerPrefs ?? defaultPrefs();
      const result = generateTimeTable({
        days: days(s),
        weeklyTargetMin: prefs.weeklyTargetMin,
        subjects: prefs.subjectPriorities.map((x) => ({
          subjectId: x.subjectId,
          name: x.name,
          priority: (PRIORITIES as readonly string[]).includes(x.priority) ? (x.priority as Priority) : "Medium",
          icon: x.icon,
          color: x.color,
        })),
        weakTopics: prefs.weakTopics,
        sessionLengthMin: prefs.sessionLengthMin,
        breakAfterMin: prefs.breakAfterMin,
        breakDurationMin: prefs.breakDurationMin,
        showBreaks: prefs.showBreaks,
        studyTypes: prefs.studyTypes.filter((t) => t.type.length > 0) as never,
      });
      return {
        status: 200,
        body: {
          ok: true,
          sessions: result.sessions,
          weeklyAvailableMin: result.weeklyAvailableMin,
          weeklyPlannedMin: result.weeklyPlannedMin,
          weeklyTargetMin: result.weeklyTargetMin,
          remainingMin: result.remainingMin,
          byDay: result.byDay,
        },
      };
    }

    case "aiPlan":
      // AI is not part of the offline build.
      return {
        status: 503,
        body: { error: "AI is not configured. Set GEMINI_API_KEY in the deployment environment." },
      };

    case "saveGenerated": {
      req(Array.isArray(body.sessions), "sessions must be an array");
      const ids: string[] = [];
      for (const raw of body.sessions as unknown[]) {
        const parsed = parseSession(raw);
        parsed.date = null;
        parsed.status = "scheduled";
        ids.push(parsed.id);
        mutate((s) => s.plannerSessions.push(parsed));
      }
      return { status: 200, body: { ok: true, count: ids.length, ids } };
    }

    case "clearSchedule": {
      mutate((s) => {
        s.plannerSessions = s.plannerSessions.filter((x) => x.status !== "scheduled");
      });
      return { status: 200, body: { ok: true } };
    }

    case "createSession": {
      const parsed = parseSession(body.session);
      const force = body.force === true;
      if (!force) {
        const conflicts = conflictsFor(getState(), parsed);
        if (conflicts.length > 0) return { status: 409, body: { error: "conflict", conflicts } };
      }
      mutate((s) => s.plannerSessions.push(parsed));
      return { status: 200, body: { ok: true, session: mapSession(parsed) } };
    }

    case "updateSession": {
      const id = String(body.id ?? "");
      const existing = state.plannerSessions.find((x) => x.id === id);
      if (!existing) return { status: 404, body: { error: "Not found" } };
      const patch = (body.session ?? {}) as Record<string, unknown>;
      if (patch.subjectId !== undefined) existing.subjectId = String(patch.subjectId);
      if (patch.subjectName !== undefined) existing.subjectName = String(patch.subjectName);
      if (patch.topicId !== undefined) existing.topicId = patch.topicId ? String(patch.topicId) : null;
      if (patch.topicTitle !== undefined) existing.topicTitle = patch.topicTitle ? String(patch.topicTitle) : null;
      if (patch.date !== undefined) existing.date = patch.date ? String(patch.date) : null;
      if (patch.dayOfWeek !== undefined) existing.dayOfWeek = typeof patch.dayOfWeek === "number" ? patch.dayOfWeek : null;
      if (patch.startMinute !== undefined) existing.startMinute = Number(patch.startMinute);
      if (patch.endMinute !== undefined) existing.endMinute = Number(patch.endMinute);
      if (patch.type !== undefined) existing.type = String(patch.type);
      if (patch.priority !== undefined) existing.priority = String(patch.priority);
      if (patch.recurrence !== undefined) existing.recurrence = String(patch.recurrence);
      if (patch.recurrenceDays !== undefined) existing.recurrenceDays = patch.recurrenceDays as number[];
      if (patch.reminderMin !== undefined) existing.reminderMin = Number(patch.reminderMin);
      if (patch.notes !== undefined) existing.notes = String(patch.notes);
      mutate(() => undefined);
      return { status: 200, body: { ok: true, session: mapSession(existing) } };
    }

    case "deleteSession": {
      const id = String(body.id ?? "");
      const existing = state.plannerSessions.find((x) => x.id === id);
      if (!existing) return { status: 404, body: { error: "Not found" } };
      mutate((s) => {
        s.plannerSessions = s.plannerSessions.filter((x) => x.id !== id);
      });
      return { status: 200, body: { ok: true } };
    }

    case "completeSession": {
      const id = String(body.id ?? "");
      const existing = state.plannerSessions.find((x) => x.id === id);
      if (!existing) return { status: 404, body: { error: "Not found" } };
      existing.status = "completed";
      existing.completedAt = nowIso();
      const minutes = existing.endMinute - existing.startMinute;
      mutate((s) => {
        const sess = s.plannerSessions.find((x) => x.id === id);
        if (sess) {
          sess.status = "completed";
          sess.completedAt = existing.completedAt;
        }
        s.studySessions.push({ id: uid(), subjectId: existing.subjectId, minutes, completedAt: nowIso() });
      });
      return { status: 200, body: { ok: true, session: mapSession(existing) } };
    }

    case "skipSession": {
      const id = String(body.id ?? "");
      const existing = state.plannerSessions.find((x) => x.id === id);
      if (!existing) return { status: 404, body: { error: "Not found" } };
      mutate((s) => {
        const sess = s.plannerSessions.find((x) => x.id === id);
        if (sess) sess.status = "skipped";
      });
      existing.status = "skipped";
      return { status: 200, body: { ok: true, session: mapSession(existing) } };
    }

    case "reschedule": {
      const id = String(body.id ?? "");
      const existing = state.plannerSessions.find((x) => x.id === id);
      if (!existing) return { status: 404, body: { error: "Not found" } };
      const target = (body.target ?? {}) as Record<string, unknown>;
      mutate((s) => {
        const sess = s.plannerSessions.find((x) => x.id === id);
        if (!sess) return;
        sess.date = String(target.date ?? "");
        sess.startMinute = Number(target.startMinute) || sess.startMinute;
        sess.endMinute = Number(target.endMinute) || sess.endMinute;
        sess.status = "scheduled";
      });
      return { status: 200, body: { ok: true, session: mapSession(existing) } };
    }

    case "checkConflicts": {
      const parsed = parseSession(body.session);
      const ignoreId = typeof body.ignoreId === "string" ? body.ignoreId : undefined;
      return { status: 200, body: { conflicts: conflictsFor(getState(), parsed, ignoreId) } };
    }

    case "suggestSlots": {
      const dayOfWeek = Number(body.dayOfWeek);
      const s = getState();
      const day = days(s).find((d) => d.dayOfWeek === dayOfWeek);
      const blocks: TimeBlock[] = day?.blocks ?? [];
      const booked = s.plannerSessions
        .filter((x) => x.status === "scheduled" && x.dayOfWeek === dayOfWeek)
        .map((x) => ({ dayOfWeek: x.dayOfWeek!, startMinute: x.startMinute, endMinute: x.endMinute }));
      const slots = findFreeSlots(blocks, booked);
      return { status: 200, body: { slots, totalAvailableMin: dayTotalAvailable(blocks) } };
    }

    default:
      return { status: 400, body: { error: "Unknown action" } };
  }
}

export function plannerPatch(body: Record<string, unknown>): Result {
  const target = Number(body.dailyStudyTarget);
  if (!Number.isInteger(target) || target < 1 || target > 24) {
    return { status: 400, body: { error: "Validation error" } };
  }
  mutate((s) => {
    s.profile.dailyStudyTarget = target;
  });
  return { status: 200, body: { dailyStudyTarget: target } };
}

export function toValidationResponse(err: ValidationErr): Result {
  return { status: 400, body: { error: "Validation error", issues: err.issues } };
}

export { ValidationErr };
