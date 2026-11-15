import { NextRequest, NextResponse } from "next/server";
import {
  CYBER_DT_CORS,
  buildCyberDTBody,
  callCyberDTGemini,
} from "@/features/ai/cyber-dt-shared";

/**
 * Cyber DT micro-goals — three small daily revision tasks (one each for
 * Biology, Physics and Chemistry) for the exam-countdown tracker.
 *
 * POST { date? } → { ok: true, tasks: [{ subject, task }] }
 */

const SUBJECTS = ["Biology", "Physics", "Chemistry"] as const;

interface MicroGoal {
  subject: string;
  task: string;
}

const MICRO_GOAL_INSTRUCTIONS = `Create today's three micro revision goals for a Sri Lankan G.C.E. A/L science student: exactly one Biology, one Physics and one Chemistry task.

RULES:
- Each task is a single checkable activity that takes 20–40 minutes.
- Tie every task to a specific chapter/topic in the official NIE Resource Book (name the chapter or unit).
- Prefer active work: drawing a labelled diagram, writing a definition from memory, doing 5 past-paper MCQs, reciting a formula and applying it.
- Never give vague goals like "read Biology". No whole-chapter summaries.

Write the tasks in simple English.

OUTPUT: return ONLY a JSON object, no prose and no code fences:
{"tasks":[{"subject":"Biology","task":"..."},{"subject":"Physics","task":"..."},{"subject":"Chemistry","task":"..."}]}`;

/** Parses and sanitizes the model's JSON, tolerating stray code fences. */
function parseTasks(raw: string): MicroGoal[] {
  const cleaned = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  const jsonText = start >= 0 && end > start ? cleaned.slice(start, end + 1) : cleaned;

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return [];
  }

  const list = (parsed as { tasks?: unknown })?.tasks;
  if (!Array.isArray(list)) return [];

  return list
    .map((task) => task as { subject?: unknown; task?: unknown })
    .filter((task) => typeof task?.subject === "string" && typeof task?.task === "string")
    .map((task) => ({
      subject: (task.subject as string).trim(),
      task: (task.task as string).trim(),
    }))
    .filter(
      (task) =>
        (SUBJECTS as readonly string[]).includes(task.subject) && task.task.length > 0,
    )
    .slice(0, 3);
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CYBER_DT_CORS });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    // The client sends its local date so the plan matches the student's day.
    const date =
      typeof body.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.date.trim())
        ? body.date.trim()
        : "";

    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "";
    if (!apiKey) {
      return NextResponse.json(
        { ok: false, error: "no_api_key" },
        { status: 200, headers: CYBER_DT_CORS },
      );
    }

    const result = await callCyberDTGemini(
      apiKey,
      buildCyberDTBody(
        MICRO_GOAL_INSTRUCTIONS,
        date ? `Today's date: ${date}` : "Today.",
        { temperature: 0.6, maxOutputTokens: 1024, responseMimeType: "application/json" },
      ),
    );

    if (!result.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: "api_error",
          status: result.status,
          detail: result.detail,
          busy: true,
        },
        { headers: CYBER_DT_CORS },
      );
    }

    const tasks = parseTasks(result.text);
    if (tasks.length === 0) {
      return NextResponse.json(
        { ok: false, error: "no_tasks", busy: true },
        { headers: CYBER_DT_CORS },
      );
    }

    return NextResponse.json({ ok: true, tasks }, { headers: CYBER_DT_CORS });
  } catch (e: unknown) {
    const detail = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { ok: false, error: "exception", detail: detail.slice(0, 200), busy: true },
      { headers: CYBER_DT_CORS },
    );
  }
}
