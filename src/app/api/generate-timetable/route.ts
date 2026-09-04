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
  description: z.string().default(""), // free-form English/Sinhala description of the routine
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
  // Time boundaries & break inputs
  mode: z.enum(["full_day", "weekly"]).default("weekly"),
  startTime: z.string().default("05:00"), // e.g. "05:00"
  bedtime: z.string().default("22:30"), // e.g. "22:30"
  napTime: z.string().default("14:00"), // afternoon nap start, e.g. "14:00"
  napEnd: z.string().default("15:00"), // afternoon nap end, e.g. "15:00"
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
  const description = input.description?.trim();
  const mode = input.mode === "full_day" ? "Full Day" : "Weekly Planner";

  const userWords = description
    ? `The student describes their situation in their OWN WORDS (this is the MOST important information — follow it closely): "${description}"`
    : "";

  return `You are an expert A/L study timetable planner.
Today's date is ${todayISO}. The user's target A/L exam date is ${input.examDate || "not set"}.
Mode: ${mode}.
Day boundaries: study is ONLY allowed between ${input.startTime} (start) and ${input.bedtime} (bedtime/sleep). NO study sessions before start or after bedtime.
Fixed non-study blocks that ARE ALREADY reserved (do NOT overlap any study session with these): Breakfast 07:30-08:00, Lunch 13:00-13:30, Afternoon Nap ${input.napTime}-${input.napEnd}, Evening Tea & Snack 16:30-17:00, Dinner 20:00-20:30.
Available subjects: ${subjects}.
Available weekly study time: ~${input.weeklyHours} hours per week (${
    input.dailyHours ? input.dailyHours + " per day" : "flexible"
  }).
Preferred time slots: ${slots}.
Weak subjects / priority topics: ${weak}.
Preferred study techniques: ${techs}.
${userWords}

Create a realistic, balanced ${mode} study plan. Balance all 3 main A/L science subjects, giving extra time to weak subjects. Mix Theory, Paper Practice (MCQ/Past Paper), and Revision.

IMPORTANT:
- If the student's own description mentions specific subjects, hours, days, times, weak topics, or study techniques, honour those exactly over the generic defaults above.
- If the description is in Sinhala (Singlish), understand it and plan accordingly; you may answer in plain English.
- A study session MUST fall entirely between the start time and bedtime. Only schedule study blocks in the free windows between the fixed break blocks listed above (e.g. 08:00-13:00 morning, 15:00-16:30 mid-afternoon, 17:00-20:00 evening, 18:30-20:00 evening).
- For ${mode === "Full Day" ? "the day" : "each day"} output a sensible spread, and use type values only from: Theory, MCQ, Revision, Past Paper, AITutor, WeakTopic, or Break/Nap/Tea for the reserved blocks.

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
Ensure sessions fit within start (${toMin(input.startTime)}) and bedtime (${toMin(input.bedtime)}). Do NOT include the fixed meal/nap/tea blocks here — the system adds them automatically.`;
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
  const s = (subject || "").toLowerCase();
  if (s.includes("breakfast") || s.includes("lunch") || s.includes("dinner") || s.includes("break") || s.includes("nap") || s.includes("tea")) {
    return "#94A3B8";
  }
  const match = Object.entries(COLOR_BY_SUBJECT).find(
    ([k]) => s.includes(k),
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

    // Auto-inject Breakfast / Lunch / Afternoon Nap / Tea / Dinner breaks, and
    // clip every study session strictly between the user's start time and bedtime.
    slots = injectBreaks(slots, input);
    // Ensure breaks appear for every day in the plan scope.
    const dayCount = input.mode === "full_day" ? 1 : 7;
    const present = new Set(slots.map((s) => s.dayOfWeek));
    if (present.size === 0) {
      // no study produced — still give a skeleton with meals for the scope
      for (let d = 0; d < dayCount; d++) {
        buildDayBreaks(input).forEach((m) => {
          slots.push({
            dayOfWeek: d,
            startMinute: m.start,
            endMinute: m.end,
            subjectName: m.type === "Nap" ? "Afternoon Nap" : m.type === "Tea" ? "Tea & Snack" : m.name,
            type: m.type,
            note: m.type === "Nap" ? "Rest & recharge" : "Rest & eat properly",
          });
        });
      }
      slots.sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.startMinute - b.startMinute);
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

// ---- Automatic Break & Meal Injection Engine ----
// Fixed break blocks. Each has: name, type, start ("HH:MM"), end ("HH:MM").
const NONSTUDY_BLOCKS = [
  { name: "Breakfast", type: "Break", start: "07:30", end: "08:00" },
  { name: "Lunch", type: "Break", start: "13:00", end: "13:30" },
  { name: "Tea & Snack", type: "Tea", start: "16:30", end: "17:00" },
  { name: "Dinner", type: "Break", start: "20:00", end: "20:30" },
];

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

// Build the fixed break blocks for a given day, clipped to [dayStart, dayEnd].
function buildDayBreaks(input: ValidatedInput): Array<{ name: string; type: string; start: number; end: number }> {
  const dayStart = toMin(input.startTime);
  const dayEnd = toMin(input.bedtime);
  const blocks: Array<{ name: string; type: string; start: number; end: number }> = NONSTUDY_BLOCKS.map((b) => ({
    name: b.name,
    type: b.type,
    start: toMin(b.start),
    end: toMin(b.end),
  }));
  // Afternoon nap uses the user-specified slot (only include if inside day bounds)
  const napStart = toMin(input.napTime);
  const napEnd = toMin(input.napEnd);
  if (napEnd > napStart) {
    blocks.push({ name: "Afternoon Nap", type: "Nap", start: napStart, end: napEnd });
  }
  // Clip to day boundary and drop anything that falls fully outside.
  return blocks
    .map((b) => ({ ...b, start: Math.max(b.start, dayStart), end: Math.min(b.end, dayEnd) }))
    .filter((b) => b.end > b.start);
}

function injectBreaks(slots: any[], input: ValidatedInput): any[] {
  if (!Array.isArray(slots)) return [];
  const dayStart = toMin(input.startTime);
  const dayEnd = toMin(input.bedtime);

  // Clip every study slot into [dayStart, dayEnd]; drop empty ones.
  const clipped: any[] = [];
  for (const s of slots) {
    if (s.type === "Break" || s.type === "Nap" || s.type === "Tea") continue;
    const a = Math.max(s.startMinute ?? 0, dayStart);
    const b = Math.min(s.endMinute ?? 0, dayEnd);
    if (b > a) {
      clipped.push({ ...s, startMinute: a, endMinute: b });
    }
  }

  const days = Array.from(new Set(clipped.map((s) => s.dayOfWeek)));
  const out: any[] = [...clipped];

  days.forEach((d) => {
    const dayBreaks = buildDayBreaks(input).map((b) => ({ ...b, dayOfWeek: d }));
    dayBreaks.forEach((m) => {
      const clash = out.some(
        (s) => s.dayOfWeek === d && overlaps(s.startMinute, s.endMinute, m.start, m.end),
      );
      if (!clash) {
        out.push({
          dayOfWeek: d,
          startMinute: m.start,
          endMinute: m.end,
          subjectName: m.type === "Nap" ? "Afternoon Nap" : m.type === "Tea" ? "Tea & Snack" : m.name,
          type: m.type,
          note: m.type === "Nap" ? "Rest & recharge" : "Rest & eat properly",
        });
      }
    });
  });

  out.sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.startMinute - b.startMinute);
  return out;
}

// ---- Fallback deterministic balanced schedule (Monday..Sunday) ----
function buildFallbackSchedule(input: ValidatedInput, todayDow: number) {
  const slots: any[] = [];
  const dayStart = toMin(input.startTime);
  const dayEnd = toMin(input.bedtime);
  const available = Math.max(60, dayEnd - dayStart - 210); // leave room for ~3.5h of breaks
  // daily durations approx from weeklyHours
  const weekly = Math.max(1, input.weeklyHours || 24);
  const perDay = Math.max(1, Math.round(weekly / 7));
  const target = Math.min(perDay, Math.floor(available / 90) * 90 || available);
  // pick subjects mentioned in the free description, else standard A/L set
  const desc = (input.description || "").toLowerCase();
  const mentioned = SUBJECT_LIST.filter((s) =>
    desc.includes(s.name.toLowerCase().split(" ")[0]),
  ).map((s) => s.name);
  const pool = mentioned.length >= 2 ? mentioned : ["Biology", "Chemistry", "Physics", "Revision"];
  const subjects = pool;
  // 3 study windows within the day (morning / afternoon / evening)
  const sections = [
    { from: dayStart, to: dayStart + (dayEnd - dayStart) * 0.4 },
    { from: dayStart + (dayEnd - dayStart) * 0.4, to: dayStart + (dayEnd - dayStart) * 0.72 },
    { from: dayStart + (dayEnd - dayStart) * 0.72, to: dayEnd },
  ];
  const dayCount = input.mode === "full_day" ? 1 : 7;
  for (let d = 0; d < dayCount; d++) {
    let used = 0;
    let i = 0;
    for (const sec of sections) {
      if (used >= target) break;
      let cursor = Math.round(sec.from);
      while (cursor < sec.to - 20 && used < target && i < 12) {
        const dur = Math.min(60, Math.round(sec.to - cursor), target - used);
        if (dur < 20) break;
        const subject = subjects[(d + i) % subjects.length];
        slots.push({
          dayOfWeek: d,
          startMinute: cursor,
          endMinute: cursor + dur,
          subjectName: subject === "Revision" ? input.weakSubjects?.[i % Math.max(1, input.weakSubjects.length)] || "Revision" : subject,
          type: subject === "Revision" ? "Revision" : i % 4 === 0 ? "Theory" : i % 4 === 1 ? "MCQ" : "Theory",
          note: "",
        });
        cursor += dur + 15;
        used += dur;
        i++;
      }
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