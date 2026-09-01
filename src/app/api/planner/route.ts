import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUserId } from "@/lib/auth-helpers";
import {
  generateTimeTable,
  findConflicts,
  findFreeSlots,
  dayTotalAvailable,
  STUDY_TYPES,
  PRIORITIES,
  RECURRENCES,
  type StudyType,
  type Priority,
  type TimeBlock,
} from "@/features/planner/lib/scheduler";
import { getSubjects } from "@/features/content/service";
import { SUBJECT_LIST } from "@/types/subject";
import { getAIProvider } from "@/features/ai/provider";

const DAYS = [0, 1, 2, 3, 4, 5, 6];
const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const blockSchema = z.object({
  startMinute: z.number().int().min(0).max(1439),
  endMinute: z.number().int().min(0).max(1440),
});

const daySchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  enabled: z.boolean(),
  dailyTargetMin: z.number().int().min(0).max(1440),
  blocks: z.array(blockSchema).max(10),
});

const prefsSchema = z.object({
  weeklyTargetMin: z.number().int().min(0).max(10080),
  sessionLengthMin: z.number().int().min(5).max(240),
  breakAfterMin: z.number().int().min(5).max(180),
  breakDurationMin: z.number().int().min(0).max(60),
  timeFormat: z.enum(["12h", "24h"]),
  showBreaks: z.boolean(),
  subjectPriorities: z.array(z.object({
    subjectId: z.string(),
    name: z.string(),
    priority: z.enum(PRIORITIES),
    icon: z.string().optional(),
    color: z.string().optional(),
  })),
  studyTypes: z.array(z.object({
    type: z.enum(STUDY_TYPES),
    weight: z.number().min(0).max(10),
  })),
  weakTopics: z.array(z.string()),
});

const sessionSchema = z.object({
  subjectId: z.string().min(1),
  subjectName: z.string().default(""),
  topicId: z.string().optional().nullable(),
  topicTitle: z.string().optional().nullable(),
  date: z.string().optional().nullable(), // yyyy-mm-dd
  dayOfWeek: z.number().int().min(0).max(6).optional().nullable(),
  startMinute: z.number().int().min(0).max(1439),
  endMinute: z.number().int().min(1).max(1440),
  type: z.enum(STUDY_TYPES).default("Learn"),
  priority: z.enum(PRIORITIES).default("Medium"),
  recurrence: z.enum(RECURRENCES).default("Once"),
  recurrenceDays: z.array(z.number().int().min(0).max(6)).default([]),
  reminderMin: z.number().int().min(0).max(480).default(0),
  notes: z.string().default(""),
});

const baseBody = z.object({ action: z.string() }).passthrough();

export async function GET() {
  try {
    const userId = await getCurrentUserId();
    const [prefs, prefsRows, prefsDays, sessions, profile, subjects] = await Promise.all([
      db.timetablePref.findUnique({ where: { userId } }),
      db.timetableDay.findMany({ where: { userId } }),
      Promise.resolve([] as unknown[]),
      db.plannerSession.findMany({
        where: { userId },
        orderBy: [{ dayOfWeek: "asc" }, { startMinute: "asc" }],
      }),
      db.studentProfile.findUnique({ where: { userId } }),
      getSubjects(),
    ]);

    void prefsRows;
    void prefsDays;

    const days = DAYS.map((d) => {
      const row = prefsRows.find((r) => r.dayOfWeek === d);
      if (!row) {
        return { dayOfWeek: d, enabled: false, dailyTargetMin: 0, blocks: [] };
      }
      return {
        dayOfWeek: d,
        enabled: row.enabled,
        dailyTargetMin: row.dailyTargetMin,
        blocks: (row.blocks as unknown as TimeBlock[]) ?? [],
      };
    });

    return NextResponse.json({
      prefs: prefs
        ? {
            weeklyTargetMin: prefs.weeklyTargetMin,
            sessionLengthMin: prefs.sessionLengthMin,
            breakAfterMin: prefs.breakAfterMin,
            breakDurationMin: prefs.breakDurationMin,
            timeFormat: prefs.timeFormat,
            showBreaks: prefs.showBreaks,
            subjectPriorities: (prefs.subjectPriorities as unknown as unknown[]) ?? [],
            studyTypes: (prefs.studyTypeWeight as unknown as { type: StudyType; weight: number }[]) ?? [],
            weakTopics: prefs.weakTopics ?? [],
          }
        : {
            weeklyTargetMin: 0,
            sessionLengthMin: 60,
            breakAfterMin: 60,
            breakDurationMin: 10,
            timeFormat: "24h" as const,
            showBreaks: true,
            subjectPriorities: [],
            studyTypes: [],
            weakTopics: [],
          },
      days,
      sessions: sessions.map((s) => ({
        id: s.id,
        subjectId: s.subjectId,
        subjectName: s.subjectName,
        topicId: s.topicId,
        topicTitle: s.topicTitle,
        date: s.date ? s.date.toISOString().split("T")[0] : null,
        dayOfWeek: s.dayOfWeek,
        startMinute: s.startMinute,
        endMinute: s.endMinute,
        type: s.type as StudyType,
        priority: s.priority as Priority,
        status: s.status,
        recurrence: s.recurrence,
        recurrenceDays: s.recurrenceDays,
        reminderMin: s.reminderMin,
        notes: s.notes,
      })),
      profile: profile
        ? {
            examYear: profile.examYear,
            examDate: profile.examDate ? profile.examDate.toISOString().split("T")[0] : null,
            examType: profile.examType,
            weakTopics: profile.weakTopics,
            subjects: profile.subjects,
            dailyStudyTarget: profile.dailyStudyTarget,
            weeklyStudyTarget: profile.weeklyStudyTarget,
          }
        : null,
      subjects: mergeSubjects(subjects),
      dayNames: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Planner GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

function mergeSubjects(dbSubjects: { id: string; slug: string; name: string; icon: string; color: string }[]) {
  const seen = new Set<string>();
  const all = [
    ...SUBJECT_LIST.map((s) => ({ id: s.id, slug: s.id, name: s.name, icon: s.icon, color: s.color })),
    ...dbSubjects.map((s) => ({ id: s.id, slug: s.slug, name: s.name, icon: s.icon, color: s.color })),
  ];
  return all.filter((s) => (seen.has(s.id) ? false : (seen.add(s.id), true)));
}

export async function POST(req: Request) {
  let userId: string;
  try {
    userId = await getCurrentUserId();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const action = (body.action as string) || "";

  try {
    switch (action) {
      case "saveDays": {
        const parsed = z.array(daySchema).parse(body.days);
        for (const d of parsed) {
          const present = d.enabled && d.blocks.length > 0;
          const blocksJson = present
            ? (d.blocks.map((b) => ({ startMinute: b.startMinute, endMinute: b.endMinute })) as unknown as object[])
            : [];
          await db.timetableDay.upsert({
            where: { userId_dayOfWeek: { userId, dayOfWeek: d.dayOfWeek } },
            create: {
              userId,
              dayOfWeek: d.dayOfWeek,
              enabled: d.enabled,
              dailyTargetMin: d.dailyTargetMin,
              blocks: blocksJson as never,
            },
            update: {
              enabled: d.enabled,
              dailyTargetMin: d.dailyTargetMin,
              blocks: blocksJson as never,
            },
          });
        }
        return NextResponse.json({ ok: true });
      }

      case "savePrefs": {
        const parsed = prefsSchema.parse(body);
        const data = {
          weeklyTargetMin: parsed.weeklyTargetMin,
          sessionLengthMin: parsed.sessionLengthMin,
          breakAfterMin: parsed.breakAfterMin,
          breakDurationMin: parsed.breakDurationMin,
          timeFormat: parsed.timeFormat,
          showBreaks: parsed.showBreaks,
          subjectPriorities: parsed.subjectPriorities as unknown as object[],
          studyTypeWeight: parsed.studyTypes as unknown as object[],
          weakTopics: parsed.weakTopics,
        };
        const saved = await db.timetablePref.upsert({
          where: { userId },
          create: { userId, ...data },
          update: data,
        });
        return NextResponse.json({ ok: true, id: saved.id });
      }

      case "generate": {
        // Build input from stored days + prefs (or provided).
        const prefs = await db.timetablePref.findUnique({ where: { userId } });
        const prefDefaults = {
          weeklyTargetMin: 0,
          sessionLengthMin: 60,
          breakAfterMin: 60,
          breakDurationMin: 10,
          timeFormat: "24h",
          showBreaks: true,
          subjectPriorities: [] as unknown[],
          studyTypeWeight: [] as unknown[],
          weakTopics: [] as string[],
        };
        const effPrefs = prefs
          ? {
              weeklyTargetMin: prefs.weeklyTargetMin,
              sessionLengthMin: prefs.sessionLengthMin,
              breakAfterMin: prefs.breakAfterMin,
              breakDurationMin: prefs.breakDurationMin,
              timeFormat: prefs.timeFormat,
              showBreaks: prefs.showBreaks,
              subjectPriorities: prefs.subjectPriorities as unknown[],
              studyTypeWeight: prefs.studyTypeWeight as unknown[],
              weakTopics: prefs.weakTopics ?? [],
            }
          : prefDefaults;

        const dayRows = await db.timetableDay.findMany({ where: { userId } });
        const days = DAYS.map((d) => {
          const row = dayRows.find((r) => r.dayOfWeek === d);
          return {
            dayOfWeek: d,
            enabled: row ? row.enabled : false,
            dailyTargetMin: row ? row.dailyTargetMin : 0,
            blocks: row ? ((row.blocks as unknown as TimeBlock[]) ?? []) : [],
          };
        });

        const subjects = (effPrefs.subjectPriorities as { subjectId: string; name: string; priority: Priority; icon?: string; color?: string }[])
          .map((s) => {
            const p: Priority = PRIORITIES.includes(s.priority) ? s.priority : "Medium";
            return { subjectId: s.subjectId, name: s.name || "Study", priority: p, icon: s.icon, color: s.color };
          });
        const studyTypes = (effPrefs.studyTypeWeight as { type: StudyType; weight: number }[]).filter((t) => STUDY_TYPES.includes(t.type));

        const result = generateTimeTable({
          days,
          weeklyTargetMin: effPrefs.weeklyTargetMin,
          subjects,
          weakTopics: effPrefs.weakTopics,
          sessionLengthMin: effPrefs.sessionLengthMin,
          breakAfterMin: effPrefs.breakAfterMin,
          breakDurationMin: effPrefs.breakDurationMin,
          showBreaks: effPrefs.showBreaks,
          studyTypes,
        });

        return NextResponse.json({
          ok: true,
          sessions: result.sessions,
          weeklyAvailableMin: result.weeklyAvailableMin,
          weeklyPlannedMin: result.weeklyPlannedMin,
          weeklyTargetMin: result.weeklyTargetMin,
          remainingMin: result.remainingMin,
          byDay: result.byDay,
        });
      }

      case "aiPlan": {
        const goals = z.string().min(1).max(4000).parse(body.goals);
        const provider = getAIProvider();
        if (!provider.isAvailable()) {
          return NextResponse.json(
            { error: "AI is not configured. Set GEMINI_API_KEY in the deployment environment." },
            { status: 503 },
          );
        }

        const [prefs, profile] = await Promise.all([
          db.timetablePref.findUnique({ where: { userId } }),
          db.studentProfile.findUnique({ where: { userId } }),
        ]);
        const prefDefaults = {
          weeklyTargetMin: 0,
          subjectPriorities: [] as { subjectId: string; name: string; priority: string }[],
          weakTopics: [] as string[],
        };
        const effPrefs = prefs
          ? {
              weeklyTargetMin: prefs.weeklyTargetMin,
              subjectPriorities: (prefs.subjectPriorities as unknown as { subjectId: string; name: string; priority: string }[]) ?? [],
              weakTopics: prefs.weakTopics ?? [],
            }
          : prefDefaults;

        const dayRows = await db.timetableDay.findMany({ where: { userId } });
        const dayLines = DAYS.map((d) => {
          const row = dayRows.find((r) => r.dayOfWeek === d);
          const blocks: TimeBlock[] = row ? ((row.blocks as unknown as TimeBlock[]) ?? []) : [];
          const avail = dayTotalAvailable(blocks);
          return `${DAY_NAMES[d]}: ${row?.enabled ? `${Math.round((avail / 60) * 10) / 10}h available${blocks.length > 0 ? ` (${blocks.map((b) => `${b.startMinute}–${b.endMinute}`).join(", ")})` : ""}` : "not available"}`;
        }).join("\n");

        const subjectsLine = effPrefs.subjectPriorities.length > 0
          ? effPrefs.subjectPriorities.map((s) => `${s.name} (${s.priority})`).join(", ")
          : "not set yet";
        const examLine = profile
          ? `Exam type: ${profile.examType || "A/L"}${profile.examYear ? `, Year: ${profile.examYear}` : ""}${profile.examDate ? `, Date: ${profile.examDate.toISOString().split("T")[0]}` : ""}`
          : "not set";

        const system = [
          "You are the AI study-plan assistant inside BioPulse, a Sri Lankan A/L study planner.",
          "The student explains their situation and goals in their own words. Using their available time, subjects, and exam info, create ONE personalized weekly study plan.",
          "Rules:",
          "- Stay strictly inside the student's stated weekly available time. Never invent extra hours.",
          "- Prioritize weak topics and high-priority subjects.",
          "- Mix study types smartly: Learn, Revision, MCQ/PastPaper practice, WeakTopic drills.",
          "- Include realistic breaks between sessions and at least one full rest slot across the week.",
          "- Reply in proper Sinhala letters if the student writes in Sinhala/Singlish; otherwise reply in English.",
          "Format the answer with clear sections:",
          "### මගේ සති කාලසටහන (My Weekly Plan) — day-by-day: suggested time ranges, subject, topic/focus, and type",
          "### අවධානය / Focus Points",
          "### විභාගයට කලින් / Before Exam — a short revision strategy",
        ].join("\n");

        const userMsg = [
          "Given my situation and goals, build my study plan.",
          `My goals/thoughts: ${goals}`,
          `My subjects and priorities: ${subjectsLine}`,
          `Weak topics: ${effPrefs.weakTopics.length > 0 ? effPrefs.weakTopics.join(", ") : "none set"}`,
          `Weekly target (minutes): ${effPrefs.weeklyTargetMin || "no target"}`,
          `Exam info: ${examLine}`,
          `My weekly availability:\n${dayLines}`,
        ].join("\n");

        try {
          const result = await provider.chat([
            { role: "system", content: system },
            { role: "user", content: userMsg },
          ]);
          return NextResponse.json({ ok: true, plan: result.content });
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          console.error("[AI-PLAN]", msg);
          return NextResponse.json({ error: "AI generation failed. Please try again later." }, { status: 502 });
        }
      }

      case "saveGenerated": {
        const parsed = z.array(sessionSchema).parse(body.sessions);
        // Clear existing scheduled sessions that fall on a weekday (recurring placeholder) before saving a regenerated week.
        const saved = [];
        for (const s of parsed) {
          const created = await db.plannerSession.create({
            data: {
              userId,
              subjectId: s.subjectId,
              subjectName: s.subjectName,
              topicId: s.topicId ?? null,
              topicTitle: s.topicTitle ?? null,
              dayOfWeek: s.dayOfWeek ?? null,
              startMinute: s.startMinute,
              endMinute: s.endMinute,
              type: s.type,
              priority: s.priority,
              status: "scheduled",
              recurrence: s.recurrence,
              recurrenceDays: s.recurrenceDays,
              reminderMin: s.reminderMin,
              notes: s.notes,
            },
          });
          saved.push(created.id);
        }
        return NextResponse.json({ ok: true, count: saved.length, ids: saved });
      }

      case "clearSchedule": {
        await db.plannerSession.deleteMany({
          where: { userId, status: "scheduled" },
        });
        return NextResponse.json({ ok: true });
      }

      case "createSession": {
        const s = sessionSchema.parse(body.session);
        const force = body.force === true;
        if (!force) {
          const conflicts = await findConflictsForSave(userId, s);
          if (conflicts.length > 0) {
            return NextResponse.json({ error: "conflict", conflicts }, { status: 409 });
          }
        }
        const created = await db.plannerSession.create({
          data: {
            userId,
            subjectId: s.subjectId,
            subjectName: s.subjectName,
            topicId: s.topicId ?? null,
            topicTitle: s.topicTitle ?? null,
            date: s.date ? new Date(s.date + "T00:00:00.000Z") : null,
            dayOfWeek: s.dayOfWeek ?? null,
            startMinute: s.startMinute,
            endMinute: s.endMinute,
            type: s.type,
            priority: s.priority,
            recurrence: s.recurrence,
            recurrenceDays: s.recurrenceDays,
            reminderMin: s.reminderMin,
            notes: s.notes,
          },
        });
        return NextResponse.json({ ok: true, session: mapSession(created) });
      }

      case "updateSession": {
        const id = z.string().parse(body.id);
        const existing = await db.plannerSession.findFirst({ where: { id, userId } });
        if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

        const patch = sessionSchema.partial().parse(body.session ?? {});
        const merged = {
          subjectId: patch.subjectId ?? existing.subjectId,
          subjectName: patch.subjectName ?? existing.subjectName,
          topicId: patch.topicId !== undefined ? patch.topicId : existing.topicId,
          topicTitle: patch.topicTitle !== undefined ? patch.topicTitle : existing.topicTitle,
          date: patch.date !== undefined ? (patch.date ? new Date(patch.date + "T00:00:00.000Z") : null) : existing.date,
          dayOfWeek: patch.dayOfWeek !== undefined ? patch.dayOfWeek : existing.dayOfWeek,
          startMinute: patch.startMinute ?? existing.startMinute,
          endMinute: patch.endMinute ?? existing.endMinute,
          type: patch.type ?? (existing.type as StudyType),
          priority: patch.priority ?? (existing.priority as Priority),
          recurrence: patch.recurrence ?? existing.recurrence,
          recurrenceDays: patch.recurrenceDays ?? existing.recurrenceDays,
          reminderMin: patch.reminderMin ?? existing.reminderMin,
          notes: patch.notes ?? existing.notes,
        };
        const updated = await db.plannerSession.update({
          where: { id },
          data: merged,
        });
        return NextResponse.json({ ok: true, session: mapSession(updated) });
      }

      case "deleteSession": {
        const id = z.string().parse(body.id);
        const existing = await db.plannerSession.findFirst({ where: { id, userId } });
        if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
        await db.plannerSession.delete({ where: { id } });
        return NextResponse.json({ ok: true });
      }

      case "completeSession": {
        const id = z.string().parse(body.id);
        const existing = await db.plannerSession.findFirst({ where: { id, userId } });
        if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
        const updated = await db.plannerSession.update({
          where: { id },
          data: { status: "completed", completedAt: new Date() },
        });
        await logStudyMinutes(userId, existing, existing.endMinute - existing.startMinute);
        return NextResponse.json({ ok: true, session: mapSession(updated) });
      }

      case "skipSession": {
        const id = z.string().parse(body.id);
        const existing = await db.plannerSession.findFirst({ where: { id, userId } });
        if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
        const updated = await db.plannerSession.update({
          where: { id },
          data: { status: "skipped" },
        });
        return NextResponse.json({ ok: true, session: mapSession(updated) });
      }

      case "reschedule": {
        const id = z.string().parse(body.id);
        const existing = await db.plannerSession.findFirst({ where: { id, userId } });
        if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
        const parsed = z.object({
          date: z.string(),
          startMinute: z.number().int().min(0).max(1439),
          endMinute: z.number().int().min(1).max(1440),
        }).parse(body.target);
        const updated = await db.plannerSession.update({
          where: { id },
          data: {
            date: new Date(parsed.date + "T00:00:00.000Z"),
            startMinute: parsed.startMinute,
            endMinute: parsed.endMinute,
            status: "scheduled",
          },
        });
        return NextResponse.json({ ok: true, session: mapSession(updated) });
      }

      case "checkConflicts": {
        const s = sessionSchema.parse(body.session);
        const conflicts = await findConflictsForSave(userId, s, body.ignoreId as string | undefined);
        return NextResponse.json({ conflicts });
      }

      case "suggestSlots": {
        const parsed = z.object({ dayOfWeek: z.number().int().min(0).max(6) }).parse(body);
        const day = await db.timetableDay.findUnique({
          where: { userId_dayOfWeek: { userId, dayOfWeek: parsed.dayOfWeek } },
        });
        const blocks: TimeBlock[] = day ? ((day.blocks as unknown as TimeBlock[]) ?? []) : [];
        const booked = await db.plannerSession.findMany({
          where: { userId, dayOfWeek: parsed.dayOfWeek, status: "scheduled" },
        });
        const slots = findFreeSlots(blocks, booked.map((b) => ({ dayOfWeek: b.dayOfWeek!, startMinute: b.startMinute, endMinute: b.endMinute })));
        return NextResponse.json({ slots, totalAvailableMin: dayTotalAvailable(blocks) });
      }

      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation error", issues: error.issues.map((i) => i.message) },
        { status: 400 },
      );
    }
    console.error("Planner POST error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

function mapSession(s: {
  id: string; subjectId: string; subjectName: string; topicId: string | null; topicTitle: string | null;
  date: Date | null; dayOfWeek: number | null; startMinute: number; endMinute: number;
  type: string; priority: string; status: string; recurrence: string; recurrenceDays: number[]; reminderMin: number; notes: string;
}) {
  return {
    id: s.id,
    subjectId: s.subjectId,
    subjectName: s.subjectName,
    topicId: s.topicId,
    topicTitle: s.topicTitle,
    date: s.date ? s.date.toISOString().split("T")[0] : null,
    dayOfWeek: s.dayOfWeek,
    startMinute: s.startMinute,
    endMinute: s.endMinute,
    type: s.type as StudyType,
    priority: s.priority as Priority,
    status: s.status,
    recurrence: s.recurrence,
    recurrenceDays: s.recurrenceDays,
    reminderMin: s.reminderMin,
    notes: s.notes,
  };
}

async function findConflictsForSave(
  userId: string,
  s: {
    date?: string | null;
    dayOfWeek?: number | null;
    startMinute: number;
    endMinute: number;
  },
  ignoreId?: string,
) {
  const existingRows = await db.plannerSession.findMany({
    where: {
      userId,
      status: "scheduled",
      ...(s.date ? { date: new Date(s.date + "T00:00:00.000Z") } : {}),
      ...(s.dayOfWeek !== undefined && s.dayOfWeek !== null ? { dayOfWeek: s.dayOfWeek } : {}),
    },
  });
  const candidate = {
    date: s.date ?? undefined,
    dayOfWeek: s.dayOfWeek ?? undefined,
    startMinute: s.startMinute,
    endMinute: s.endMinute,
  };
  const conflicts = findConflicts(
    existingRows
      .filter((r) => r.id !== ignoreId)
      .map((r) => ({
        id: r.id,
        date: r.date ? r.date.toISOString().split("T")[0] : undefined,
        dayOfWeek: r.dayOfWeek ?? undefined,
        startMinute: r.startMinute,
        endMinute: r.endMinute,
      })),
    candidate,
  );
  return conflicts.map((c) => ({
    otherId: c.a.id,
    overlapMin: c.overlapMin,
    otherStart: c.a.startMinute,
    otherEnd: c.a.endMinute,
  }));
}

async function logStudyMinutes(
  userId: string,
  existing: { subjectId: string; startMinute: number; endMinute: number },
  minutes: number,
) {
  try {
    await db.studySession.create({
      data: {
        userId,
        subjectId: existing.subjectId,
        minutes,
        completedAt: new Date(),
      },
    });
  } catch (err) {
    console.error("Failed to log study session:", err);
  }
}

// Daily study target (backward-compatible) PATCH handler
const dailyTargetSchema = z.object({
  dailyStudyTarget: z.number().int().min(1).max(24),
});

export async function PATCH(req: Request) {
  try {
    const userId = await getCurrentUserId();
    const body = await req.json();
    const parsed = dailyTargetSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Validation error" }, { status: 400 });
    }
    const profile = await db.studentProfile.upsert({
      where: { userId },
      update: { dailyStudyTarget: parsed.data.dailyStudyTarget },
      create: { userId, dailyStudyTarget: parsed.data.dailyStudyTarget },
    });
    return NextResponse.json({ dailyStudyTarget: profile.dailyStudyTarget });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Planner PATCH error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
