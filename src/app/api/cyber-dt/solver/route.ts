import { NextRequest, NextResponse } from "next/server";
import {
  CYBER_DT_CORS,
  CYBER_DT_SYSTEM_PROMPT,
  buildCyberDTBody,
  callCyberDTGemini,
} from "@/features/ai/cyber-dt-shared";

/**
 * Cyber DT step-by-step solver — numerical problems for A/L Physics,
 * Chemistry and Biology, answered in the NIE Resource Book format.
 *
 * Mirrors /api/cyber-dt: the Gemini key stays on the server, answers come
 * back as one complete JSON reply (Netlify cut long streams), and failures
 * are reported as { ok: false } so the client can show a retry/fallback.
 *
 * POST { problem, subject } → { ok: true, solution } with the full answer.
 */

const SUBJECTS = ["Physics", "Chemistry", "Biology"] as const;
type SolverSubject = (typeof SUBJECTS)[number];

/** Maximum problem text accepted, in characters. */
const MAX_PROBLEM_CHARS = 2_000;

function isSubject(value: string): value is SolverSubject {
  return (SUBJECTS as readonly string[]).includes(value);
}

const SOLVER_INSTRUCTIONS = `You are solving ONE numerical problem for a Sri Lankan G.C.E. A/L student. The subject is stated below the instructions.

FORMAT (follow every section, in this order):
- **Given Data (දත්ත)**: List every given value with its symbol and correct SI unit. Convert non-SI values first and show the conversion.
- **Relevant Formula (අදාළ සූත්‍රය)**: State the standard NIE Resource Book formula, and rearrange it for the unknown if needed.
- **Substitution & Calculation (ආදේශය සහ ගණනය කිරීම)**: Substitute values with units and show each calculation step. Carry units through the working.
- **Final Answer with Units (අවසාන පිළිතුර සහ ඒකකය)**: Give the final result with the correct unit, significant figures and direction where relevant.
- **Common Student Pitfalls (සිසුන් නිතර කරන වැරදි)**: 1–3 short warnings about mistakes students make on this type of problem.

RULES:
- Use ONLY the data given in the problem. Never invent a value; if a required value is missing, say so plainly and explain what is needed.
- Use correct symbols, standard constants (state their values), and SI units throughout.
- Follow the exact method and terminology of the local resource books; do not introduce non-syllabus formulas.
- Answer in the language of the problem: Sinhala script / Singlish → Sinhala script, English → English (keep technical terms in English where the resource book does).
- If the problem is not a numerical calculation, say briefly that it needs a conceptual answer and refer the student to the Cyber DT chat.`;

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CYBER_DT_CORS });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const problem =
      typeof body.problem === "string" ? body.problem.trim().slice(0, MAX_PROBLEM_CHARS) : "";
    const subject = typeof body.subject === "string" ? body.subject.trim() : "";

    if (!problem) {
      return NextResponse.json(
        { ok: false, error: "empty_problem" },
        { status: 400, headers: CYBER_DT_CORS },
      );
    }
    if (!isSubject(subject)) {
      return NextResponse.json(
        { ok: false, error: "invalid_subject" },
        { status: 400, headers: CYBER_DT_CORS },
      );
    }

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
        `${CYBER_DT_SYSTEM_PROMPT}\n\n${SOLVER_INSTRUCTIONS}`,
        `Subject: ${subject}\n\nProblem: ${problem}`,
        // Calculations should be reproducible, not creative.
        { temperature: 0.2 },
      ),
    );

    if (!result.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: "api_error",
          status: result.status,
          detail: result.detail,
          // The AI itself is busy/unavailable — worth a retry.
          busy: true,
        },
        { headers: CYBER_DT_CORS },
      );
    }

    return NextResponse.json(
      { ok: true, solution: result.text },
      { headers: CYBER_DT_CORS },
    );
  } catch (e: unknown) {
    const detail = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { ok: false, error: "exception", detail: detail.slice(0, 200), busy: true },
      { headers: CYBER_DT_CORS },
    );
  }
}
