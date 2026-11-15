import { NextRequest, NextResponse } from "next/server";
import {
  CYBER_DT_CORS,
  buildCyberDTBody,
  callCyberDTGeminiJson,
  parseJsonLoose,
} from "@/features/ai/cyber-dt-shared";

/**
 * Cyber DT smart flashcards — 8–10 high-yield A/L cards per request,
 * generated strictly from the NIE Resource Books.
 *
 * POST { subject, topic, language } → { ok: true, cards: [{ id, front, back }] }
 */

const SUBJECTS = ["Physics", "Chemistry", "Biology"] as const;
type CardSubject = (typeof SUBJECTS)[number];

const MAX_TOPIC_CHARS = 120;

function isSubject(value: string): value is CardSubject {
  return (SUBJECTS as readonly string[]).includes(value);
}

function normalizeLanguage(value: unknown): "si" | "en" {
  return typeof value === "string" && /^(si|sinhala)$/i.test(value.trim()) ? "si" : "en";
}

interface Flashcard {
  id: number;
  front: string;
  back: string;
}

/** Parses and sanitizes the model's JSON, tolerating stray code fences. */
function parseCards(raw: string): Flashcard[] {
  const parsed = parseJsonLoose(raw);
  if (parsed === undefined) return [];

  const list = Array.isArray(parsed) ? parsed : (parsed as { cards?: unknown })?.cards;
  if (!Array.isArray(list)) return [];

  return list
    .map((card) => card as { front?: unknown; back?: unknown })
    .filter(
      (card) => typeof card?.front === "string" && typeof card?.back === "string",
    )
    .map((card) => ({
      front: (card.front as string).trim(),
      back: (card.back as string).trim(),
    }))
    .filter((card) => card.front && card.back)
    .slice(0, 10)
    .map((card, index) => ({ id: index + 1, ...card }));
}

function flashcardInstructions(subject: CardSubject, language: "si" | "en"): string {
  const languageRule =
    language === "si"
      ? `Write every front and back in proper Sinhala script (සිංහල අකුරු). Keep scientific names, IUPAC names, symbols and formulas in English inside brackets, e.g. "ප්‍රභාසංස්ලේෂණය (photosynthesis)".`
      : `Write every front and back in clear, simple English, using the exact terminology of the local resource book.`;

  return `Create high-yield revision flashcards for Sri Lankan G.C.E. A/L ${subject} (subject is given below the rules).

SOURCE: use ONLY content from the official NIE / Ministry of Education A/L Resource Book for ${subject}. Never use outside or university-level material.

CARDS:
- Generate between 8 and 10 cards — never fewer, never more.
- "front" is a precise question or term; "back" is the exact NIE definition/answer, short and exam-ready (one to three lines).
- Target the highest-yield exam material: exact definitions, scientific names, colour changes and observations, standard formulas with symbol meanings, and numbered process stages.
- No duplicates, no trivia, no vague cards.

${languageRule}

OUTPUT: return ONLY a JSON object in exactly this shape, with no prose and no code fences:
{"cards":[{"id":1,"front":"...","back":"..."}]}`;
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CYBER_DT_CORS });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const subject = typeof body.subject === "string" ? body.subject.trim() : "";
    const topic = typeof body.topic === "string" ? body.topic.trim().slice(0, MAX_TOPIC_CHARS) : "";
    const language = normalizeLanguage(body.language);

    if (!isSubject(subject)) {
      return NextResponse.json(
        { ok: false, error: "invalid_subject" },
        { status: 400, headers: CYBER_DT_CORS },
      );
    }
    if (!topic) {
      return NextResponse.json(
        { ok: false, error: "empty_topic" },
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

    const outcome = await callCyberDTGeminiJson(
      apiKey,
      buildCyberDTBody(
        flashcardInstructions(subject, language),
        `Subject: ${subject}\nTopic: ${topic}`,
        { temperature: 0.7, maxOutputTokens: 8192, responseMimeType: "application/json" },
      ),
      parseCards,
    );

    if (!outcome.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: outcome.reason === "no_items" ? "no_cards" : "api_error",
          status: outcome.status,
          detail: outcome.detail,
          busy: true,
        },
        { headers: CYBER_DT_CORS },
      );
    }

    return NextResponse.json({ ok: true, cards: outcome.items }, { headers: CYBER_DT_CORS });
  } catch (e: unknown) {
    const detail = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { ok: false, error: "exception", detail: detail.slice(0, 200), busy: true },
      { headers: CYBER_DT_CORS },
    );
  }
}
