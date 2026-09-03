import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUserId } from "@/lib/auth-helpers";
import { getAIProvider } from "@/features/ai/provider";
import { SUBJECT_LIST } from "@/types/subject";

export const maxDuration = 60;

// ---- Input schema ----
const inputSchema = z.object({
  title: z.string().default("My AI Timetable"),
  weeklyHours: z.number().int().min(1).max(168).default(30),
  dailyHours: z.number().int().min(1).max(24).optional(),
  examDate: z.string().optional(), // yyyy-mm-dd (A/L exam countdown)
  weakSubjects: z.array(z.string()).default([]),
  priorities: z.array(z.string()).default([]),
  timeSlots: z.array(
    z.object({
      dayOfWeek: z.number().int().min(0).max(6),
      start: z.string(), // "05:00"
      end: z.string(), // "07:00"
    }),
  ).default([]),
  techniques: z.array(z.string()).default([]),
});

type ValidatedInput = z.infer<typeof inputSchema>;

const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function buildPrompt(input: ValidatedInput, todayISO: string): string {
  const subjects = SUBJECT_LIST.map((s) => s.name).join(", ");
  const slots = input.timeSlots.length
    ? input.timeSlots
        .map(
          (t) =>
            `${DAY_NAMES[t.dayOfWeek] ?? "?"}: ${t.start}-${t.end}`,
        )
        .join("; ")
    : "My preference (create a realistic routine)";
  const weak = input.weakSubjects.length ? input.weakSubjects.join(", ") : "None";
  const techs = input.techniques.length ? input.techniques.join(", ") : "Pomodoro (25/5)";

  return `You are an expert A/L study timetable planner.
Today's date is ${todayISO}. The user's target A/L exam date is ${input.examDate || "not set"}.
Available subjects: ${subjects}.
Available weekly study time: ~${input.weeklyHours} hours per week (${
    input.dailyHours ? input.dailyHours + " per day" : "flexible"
  }).
Preferred time slots: ${slots}.
Weak subjects / priority topics: ${weak}.
Preferred study techniques: ${techs}.

Create a realistic, balanced weekly study plan. Balance all 3 main A/L science subjects, giving extra time to weak subjects. Mix Theory, Paper Practice (MCQ/Past Paper), and Revision.

Return ONLY valid JSON in exactly this shape (no markdown, no code fences):
{
  "weeklyHours": number,
  "planText": "short human summary of the plan in simple language",
  "slots": [
    {
      "dayOfWeek": 0,
      "startMinute": 300,
      "endMinute": 420,
      "subjectName": "Biology",
      "type": "Theory",
      "note": "short topic or goal"
    }
  ]
}
Where dayOfWeek: 0=Monday ... 6=Sunday, startMinute/endMinute are minutes from midnight (e.g. 5:00 AM=300, 8:00 PM=1200).
Ensure sessions fit within the preferred time slots where given.`;
}

function parseJson(content: string): any {
  let text = content.trim();
  text = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    text = text.slice(start, end + 1);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("AI returned invalid JSON");
  }
}

const COLOR_BY_SUBJECT: Record<string, string> = {};
SUBJECT_LIST.forEach((s) => {
  COLOR_BY_SUBJECT[s.name.toLowerCase()] = s.color;
  COLOR_BY_SUBJECT[s.id] = s.color;
});

function colorFor(subject: string): string {
  const match = Object.entries(COLOR_BY_SUBJECT).find(
    ([k]) => subject.toLowerCase().includes(k),
  );
  return match ? match[1] : "#10B981";
}

export async function POST(req: Request) {
  try {
    const userId = await getCurrentUserId();
    const body = await req.json();
    const parsed = inputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }
    const input = parsed.data;
    const todayISO = new Date().toISOString().slice(0, 10);

    const provider = getAIProvider();
    const today = new Date();
    const todayDow = (today.getDay() + 6) % 7; // 0=Monday
    let slots: any[] = [];
    let planText = "";

    try {
      const res = await provider.chat(
        [{ role: "system", content: "Return JSON only." }, { role: "user", content: buildPrompt(input, todayISO) }],
        { maxTokens: 3000, temperature: 0.4 },
      );
      const json = parseJson(res.content);
      slots = Array.isArray(json.slots) ? json.slots : [];
      planText = typeof json.planText === "string" ? json.planText : "";
      // ensure weeklyHours fits? accept as-is
    } catch (error) {
      // Fallback to a deterministic balanced schedule if AI fails
      const e = error instanceof Error ? error.message : String(error);
      slots = buildFallbackSchedule(input, todayDow);
      planText = "AI generation unavailable (" + e + "). Showing a balanced default timetable.";
    }

    // Persist — if DB persistence fails, still return the generated plan so the
    // user never sees a blank/broken result.
    let persistedId: string | null = null;
    let createdAt = new Date();
    let savedSlots: any[] = slots;
    try {
      const timetable = await db.timetable.create({
        data: {
          userId,
          title: input.title,
          weeklyTargetMin: (input.weeklyHours || 0) * 60,
          examDate: input.examDate ? new Date(input.examDate + "T00:00:00Z") : null,
          rawInput: input as object,
          planText,
          slots: {
            create: slots.map((s: any) => ({
              subjectName: String(s.subjectName || "Study").slice(0, 100),
              subjectId: "",
              color: colorFor(String(s.subjectName || "")),
              startMinute: clamp(s.startMinute ?? 0, 0, 1439),
              endMinute: clamp(s.endMinute ?? 0, 1, 1440),
              dayOfWeek: clamp(s.dayOfWeek ?? todayDow, 0, 6),
              type: String(s.type || "Theory").slice(0, 40),
              note: String(s.note || "").slice(0, 300),
            })),
          },
        },
        include: { slots: true },
      });
      persistedId = timetable.id;
      createdAt = timetable.createdAt;
      savedSlots = timetable.slots;
    } catch (e) {
      // persistence failed — fall back to returning the in-memory plan
      createdAt = new Date();
      savedSlots = slots.map((s: any) => ({
        id: "",
        subjectName: String(s.subjectName || "Study").slice(0, 100),
        color: colorFor(String(s.subjectName || "")),
        startMinute: clamp(s.startMinute ?? 0, 0, 1439),
        endMinute: clamp(s.endMinute ?? 0, 1, 1440),
        dayOfWeek: clamp(s.dayOfWeek ?? todayDow, 0, 6),
        type: String(s.type || "Theory").slice(0, 40),
        note: String(s.note || "").slice(0, 300),
      }));
      planText = (planText ? planText + " " : "") + "(Not saved to your account.)";
    }

    // Auto-sync generated slots into the existing PlannerSession table so the
    // traditional "My Sessions" view also shows them (weekly recurrence).
    if (persistedId) {
      try {
        const existing = await db.plannerSession.count({ where: { userId } });
        if (existing < 200) {
          await db.plannerSession.createMany({
            data: savedSlots.map((s: any) => ({
              userId,
              subjectId: s.subjectId || "bio",
              subjectName: s.subjectName,
              type: mapType(s.type),
              priority: "Medium",
              status: "scheduled",
              dayOfWeek: s.dayOfWeek,
              date: s.date || null,
              startMinute: s.startMinute,
              endMinute: s.endMinute,
              recurrence: "Weekly",
              notes: s.note,
            })),
            skipDuplicates: true,
          });
        }
      } catch (_) {
        // sync is best-effort; never block returning the generated timetable
      }
    }

    return NextResponse.json({
      ok: true,
      persisted: persistedId !== null,
      timetable: {
        id: persistedId || "tmp-" + Date.now(),
        title: input.title,
        planText,
        examDate: input.examDate,
        weeklyHours: (input.weeklyHours || 0),
        createdAt,
        slots: savedSlots,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Generation failed" },
      { status: 500 },
    );
  }
}

function clamp(v: number, min: number, max: number): number {
  if (Number.isNaN(v)) return min;
  return Math.max(min, Math.min(max, v));
}

function mapType(t: string): string {
  const tl = (t || "").toLowerCase();
  if (tl.includes("past")) return "PastPaper";
  if (tl.includes("mcq")) return "MCQ";
  if (tl.includes("revision") || tl.includes("revise")) return "Revision";
  if (tl.includes("weak")) return "WeakTopic";
  if (tl.includes("ai") || tl.includes("tutor")) return "AITutor";
  if (tl.includes("review")) return "Review";
  return "Learn";
}

// ---- Fallback deterministic balanced schedule (Monday..Sunday) ----
function buildFallbackSchedule(input: ValidatedInput, todayDow: number) {
  const slots: any[] = [];
  const preferred = input.timeSlots.length
    ? input.timeSlots
    : [];
  // daily durations approx from weeklyHours
  const weekly = Math.max(1, input.weeklyHours || 24);
  const perDay = Math.max(1, Math.round(weekly / 7));
  const subjects = ["Biology", "Chemistry", "Physics", "Revision"];
  for (let d = 0; d < 7; d++) {
    const daySlots = preferred.filter((t) => t.dayOfWeek === d);
    let startMin = daySlots.length
      ? toMin(daySlots[0].start)
      : 300 + (d % 3) * 60; // 5:00-7:00 stagger
    let used = 0;
    let i = 0;
    while (used < perDay && i < 8) {
      const dur = Math.min(90, perDay - used);
      const subject = subjects[(d + i) % subjects.length];
      slots.push({
        dayOfWeek: d,
        startMinute: startMin,
        endMinute: startMin + dur,
        subjectName: subject === "Revision" ? input.weakSubjects?.[i % Math.max(1, input.weakSubjects.length)] || "Revision" : subject,
        type: subject === "Revision" ? "Revision" : i % 4 === 0 ? "Theory" : i % 4 === 1 ? "MCQ" : "Theory",
        note: "",
      });
      startMin += dur + 10;
      used += dur;
      i++;
    }
  }
  return slots;
}

export async function DELETE(req: Request) {
  try {
    const userId = await getCurrentUserId();
    const id = new URL(req.url).searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
    await db.timetable.deleteMany({ where: { id, userId } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete" },
      { status: 500 },
    );
  }
}

function toMin(t: string): number {
  const parts = t.split(":").map((n) => parseInt(n, 10));
  const h = isNaN(parts[0]) ? 0 : parts[0];
  const m = parts.length > 1 && !isNaN(parts[1]) ? parts[1] : 0;
  return h * 60 + m;
}

export async function GET() {
  try {
    const userId = await getCurrentUserId();
    const timetables = await db.timetable.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      include: { slots: { orderBy: [{ dayOfWeek: "asc" }, { startMinute: "asc" }] } },
      take: 20,
    });
    return NextResponse.json({
      ok: true,
      timetables: timetables.map((t) => ({
        id: t.id,
        title: t.title,
        planText: t.planText,
        examDate: t.examDate,
        weeklyHours: (t.weeklyTargetMin || 0) / 60,
        createdAt: t.createdAt,
        slots: t.slots,
      })),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load timetables" },
      { status: 500 },
    );
  }
}