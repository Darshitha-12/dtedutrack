import { NextRequest, NextResponse } from "next/server";
import {
  CYBER_DT_CORS,
  buildCyberDTBody,
  callCyberDTGeminiJson,
  parseJsonLoose,
} from "@/features/ai/cyber-dt-shared";

/**
 * Cyber DT micro-goals — three small daily revision tasks (one each for
 * Biology, Physics and Chemistry) for the exam-countdown tracker.
 *
 * POST { date? } → { ok: true, tasks: [{ subject, task }] }
 */

const SUBJECTS = ["Biology", "Physics", "Chemistry"] as const;
type MicroGoalSubject = (typeof SUBJECTS)[number];

interface MicroGoal {
  subject: MicroGoalSubject;
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

/** Maps any casing/variant of a subject name onto the canonical A/L subject. */
function canonicalSubject(value: string): MicroGoalSubject | "" {
  const v = value.trim().toLowerCase();
  if (v.startsWith("bio")) return "Biology";
  if (v.startsWith("phy")) return "Physics";
  if (v.startsWith("chem")) return "Chemistry";
  return "";
}

/** Parses and sanitizes the model's JSON, tolerating stray code fences. */
function parseTasks(raw: string): MicroGoal[] {
  const parsed = parseJsonLoose(raw);
  if (parsed === undefined) return [];

  const list = Array.isArray(parsed) ? parsed : (parsed as { tasks?: unknown })?.tasks;
  if (!Array.isArray(list)) return [];

  const seen = new Set<string>();
  const out: MicroGoal[] = [];
  for (const item of list) {
    const task = item as { subject?: unknown; task?: unknown };
    if (typeof task?.subject !== "string" || typeof task?.task !== "string") continue;
    const subject = canonicalSubject(task.subject);
    const text = task.task.trim();
    if (!subject || !text || seen.has(subject)) continue;
    seen.add(subject);
    out.push({ subject, task: text });
  }
  return out.slice(0, 3);
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

    const outcome = await callCyberDTGeminiJson(
      apiKey,
      buildCyberDTBody(
        MICRO_GOAL_INSTRUCTIONS,
        date ? `Today's date: ${date}` : "Today.",
        { temperature: 0.6, maxOutputTokens: 4096, responseMimeType: "application/json" },
      ),
      parseTasks,
    );

    if (!outcome.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: outcome.reason === "no_items" ? "no_tasks" : "api_error",
          status: outcome.status,
          detail: outcome.detail,
          busy: true,
        },
        { headers: CYBER_DT_CORS },
      );
    }

    return NextResponse.json({ ok: true, tasks: outcome.items }, { headers: CYBER_DT_CORS });
  } catch (e: unknown) {
    const detail = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { ok: false, error: "exception", detail: detail.slice(0, 200), busy: true },
      { headers: CYBER_DT_CORS },
    );
  }
}
