import { NextRequest, NextResponse } from "next/server";
import {
  CYBER_DT_CORS,
  CYBER_DT_ROUTE_BUDGET_MS,
  CYBER_DT_SYSTEM_PROMPT,
  buildCyberDTBody,
  callCyberDTGeminiWithRetry,
  isCyberDTPdf,
  readCyberDTImage,
  readCyberDTImages,
  readCyberDTPdfText,
} from "@/features/ai/cyber-dt-shared";

/**
 * Cyber DT document → Study Note.
 *
 * The student uploads a PDF (a chapter scan, class notes, a past paper). A
 * request body is capped at 6 MB by the host, so a large file is read in the
 * browser and arrives here in whichever form fits:
 *
 *   { pdf:    { mimeType, data } }  — the whole PDF (small files, best fidelity)
 *   { pdfText: "…" }                — the extracted text layer (large text PDFs)
 *   { images: [{ mimeType, data }]} — rendered page images (large scanned PDFs)
 *
 * One route powers the whole "learn from it" flow:
 *
 *   mode: "note"       → a complete, structured study note
 *   mode: "teach"      → a patient, step-by-step lesson on the document
 *   mode: "quiz"       → 10 MCQs (A–D) with answers + explanations
 *   mode: "flashcards" → Q/A flashcards from the document
 *   mode: "ask"        → answer one follow-up question, grounded in the document
 *
 * POST { mode?, language?, subject?, question?, history? } + one source above
 *   → { ok: true, text }
 */

const MODES = ["note", "teach", "quiz", "flashcards", "ask"] as const;
type PdfMode = (typeof MODES)[number];

function normalizeMode(value: unknown): PdfMode {
  return typeof value === "string" && (MODES as readonly string[]).includes(value)
    ? (value as PdfMode)
    : "note";
}

function normalizeLanguage(value: unknown): "Sinhala" | "English" {
  return typeof value === "string" && /^(si|sinhala|සිංහල)$/i.test(value.trim())
    ? "Sinhala"
    : "English";
}

const MAX_QUESTION_CHARS = 1000;

const PDF_RULES = `The student has uploaded a document — a chapter from a book, a scan of class notes, a past paper, or a set of revision notes. It may reach you as an attached PDF, as extracted text, or as page images rendered from a scan.

READING THE DOCUMENT (absolute rules):
- Read the WHOLE document carefully before answering, including text inside scanned/photographed pages, tables, captions, chemical equations and figure labels.
- Base every fact ONLY on what the document actually contains. Never invent content, page numbers, diagrams or equations that are not in it.
- If part of the document is unreadable or a term is unclear, say exactly which part is unclear instead of guessing.
- Keep everything inside the Sri Lankan G.C.E. A/L Biology, Physics and Chemistry syllabus (NIE Resource Books). If the document drifts outside the syllabus, still explain it but note that it is beyond the A/L scope.`;

function modeInstructions(
  mode: PdfMode,
  language: string,
  part: { index: number; total: number } | null,
): string {
  const lang = `Write your entire reply in ${language}. Technical terms should be given in both Sinhala and English where helpful (e.g. "මයිටෝසිස් (mitosis)").`;

  // A large scanned book is split into several batches. Each batch is a
  // separate request, so the continuation parts must NOT restart the note
  // (no new Title/Overview) — they carry straight on from the previous part.
  const isPart = part != null && part.total > 1;
  const isFirstPart = isPart && part!.index <= 1;
  const isLastPart = isPart && part!.index >= part!.total;
  const partHeader = isPart
    ? `\n\nIMPORTANT — this is PART ${part!.index} of ${part!.total} of the same document, split only because it is long. ${
        isFirstPart
          ? "Start the note normally."
          : "Do NOT repeat the Title or Overview. Continue directly with the next sections, as a continuation of the previous part."
      } ${
        isLastPart
          ? "This is the final part — finish with the Quick Revision Summary."
          : "Do NOT write a Quick Revision Summary yet; the document continues in the next part."
      } Begin each part with a small heading like "Part ${part!.index}/${part!.total}".`
    : "";

  switch (mode) {
    case "teach":
      return `${PDF_RULES}

TASK — TEACH THE STUDENT:
- Act as a patient tutor teaching the document's content from the beginning, as if the student has never seen it.
- Go step by step, building from the basics up to full A/L exam level. Use simple analogies, short paragraphs and numbered steps.
- For every key process, give: what it is, why it happens, how it happens (in order), and one worked example or labelled-diagram description.
- Add a "check yourself" question after each main section (do NOT answer it immediately — tell the student to think, then move on).
- Finish with a short 5-point recap of the whole document.
${lang}`;

    case "quiz":
      return `${PDF_RULES}

TASK — CREATE A QUIZ:
- Write 10 multiple-choice questions taken ONLY from this document, increasing in difficulty.
- Each question must have exactly 4 options (A–D). Mark the correct option clearly and give a 1–2 line explanation that points to the part of the document it came from.
- Target the subtle points, definitions, tables, diagrams and equations that the document highlights.
- Number the questions and keep them clearly separated.
${lang}`;

    case "flashcards":
      return `${PDF_RULES}

TASK — CREATE FLASHCARDS:
- Produce 12 flashcards from this document. Each card has a short question (Front) and a precise answer (Back).
- Cover definitions, key facts, formulas/equations, diagrams to remember and exam-favourite points.
- Number the cards and format each as:
  Card N
  Front: ...
  Back: ...
${lang}`;

    case "ask":
      return `${PDF_RULES}

TASK — ANSWER THE STUDENT'S QUESTION:
- Answer the student's question using ONLY this document (plus the A/L syllabus).
- If the answer is not in the document, say so plainly and then give the closest syllabus-accurate explanation.
- Quote or point to the relevant part of the document where possible.
- Keep the answer focused and exam-style.
${lang}`;

    case "note":
    default:
      return `${PDF_RULES}

TASK — WRITE A COMPLETE STUDY NOTE from this document, with these sections:
1. **Title** — the topic of the document.
2. **Overview** — 3–5 lines on what this document is about and why it matters for the A/L exam.
3. **Key Definitions** — every important term, defined exactly as the resource book does.
4. **Core Concepts** — the main content explained in order, using numbered steps/bullet points. Include any processes, mechanisms or classifications.
5. **Diagrams & Tables to Remember** — describe each diagram/figure/table in the document (labelled parts, direction of flow) so the student can redraw it.
6. **Formulas / Equations** — every equation with its symbols and units (omit if none).
7. **Exam Tips** — the marking points and common mistakes examiners look for.
8. **Quick Revision Summary** — 6–10 one-line facts to memorise.
${lang}${partHeader}`;
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CYBER_DT_CORS });
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

    const mode = normalizeMode(body.mode);
    const language = normalizeLanguage(body.language);
    const subject = typeof body.subject === "string" ? body.subject.trim().slice(0, 40) : "";
    const question =
      typeof body.question === "string" ? body.question.trim().slice(0, MAX_QUESTION_CHARS) : "";

    if (mode === "ask" && !question) {
      return NextResponse.json(
        { ok: false, error: "empty_question" },
        { status: 400, headers: CYBER_DT_CORS },
      );
    }

    // The document may arrive as rendered page images, extracted text, or the
    // whole PDF. Prefer the most faithful form the client could produce.
    const images = readCyberDTImages(body);
    const pdfText = readCyberDTPdfText(body);
    const normalized =
      body.pdf !== undefined && body.image === undefined ? { ...body, image: body.pdf } : body;
    const attachment = readCyberDTImage(normalized);

    const hasImages = Array.isArray(images) && images.length > 0;
    const hasText = typeof pdfText === "string";
    const hasPdf = attachment != null;

    if (!hasImages && !hasText && !hasPdf) {
      const unreadable = images === null || pdfText === null || attachment === null;
      return NextResponse.json(
        { ok: false, error: unreadable ? "unreadable_pdf" : "missing_pdf" },
        { status: 400, headers: CYBER_DT_CORS },
      );
    }
    if (hasPdf && !isCyberDTPdf(attachment)) {
      return NextResponse.json(
        { ok: false, error: "not_a_pdf" },
        { status: 400, headers: CYBER_DT_CORS },
      );
    }

    const source: "images" | "text" | "pdf" = hasImages ? "images" : hasText ? "text" : "pdf";

    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "";
    if (!apiKey) {
      return NextResponse.json({ ok: false, error: "no_api_key" }, { headers: CYBER_DT_CORS });
    }

    const history = Array.isArray(body.history)
      ? (body.history as Array<{ role?: unknown; text?: unknown }>)
          .filter((t) => typeof t?.text === "string" && (t.text as string).trim())
          .slice(-6)
          .map((t) => `${t.role === "ai" ? "Tutor" : "Student"}: ${(t.text as string).trim()}`)
          .join("\n\n")
      : "";

    const pageFrom = Number.isFinite(Number(body.pageFrom)) ? Number(body.pageFrom) : 0;
    const pageTo = Number.isFinite(Number(body.pageTo)) ? Number(body.pageTo) : 0;
    const truncated = body.pdfTruncated === true;

    // A very long document is generated in batches ("parts"). Each part covers
    // only the pages the client sent, so the request stays small and the shared
    // free-tier quota is not hammered by one giant prompt.
    const partTotal = Math.max(1, Math.min(12, Math.floor(Number(body.partTotal)) || 1));
    const partIndex = Math.max(1, Math.min(partTotal, Math.floor(Number(body.partIndex)) || 1));
    const part = partTotal > 1 ? { index: partIndex, total: partTotal } : null;

    const userText = [
      subject ? `Subject: ${subject}` : "",
      history ? `Earlier in this lesson:\n${history}` : "",
      mode === "ask" ? `Student's question: ${question}` : "",
      part
        ? `This request is part ${part.index} of ${part.total} of the document — it contains ONLY the pages for this part.`
        : "",
      source === "text"
        ? `The full text extracted from the student's PDF is below${truncated ? " (the document was very long, so the final pages may be missing)" : ""}:\n\n${pdfText}`
        : "",
      source === "images"
        ? `Attached are ${(images as unknown[]).length} page images rendered from the student's scanned PDF${pageFrom && pageTo ? ` (pages ${pageFrom}–${pageTo})` : ""}. Read them in order.`
        : "",
      "Now produce the requested output from this document.",
    ]
      .filter(Boolean)
      .join("\n\n");

    const requestBody = buildCyberDTBody(
      `${CYBER_DT_SYSTEM_PROMPT}\n\n${modeInstructions(mode, language, part)}`,
      userText,
      {
        // A faithful reading of the document, not a creative rewrite.
        temperature: mode === "quiz" || mode === "note" ? 0.3 : 0.5,
        // A big document plus a long note needs room; thinking tokens count too.
        maxOutputTokens: 16_384,
        ...(source === "images" ? { images: images as NonNullable<typeof images> } : {}),
        ...(source === "pdf" && attachment ? { image: attachment } : {}),
      },
    );

    // A full study note is a LONG answer, so each attempt gets a generous slice
    // of the budget (the default 8s cap was tuned for short feature replies and
    // would cut a note off mid-sentence). The retry wrapper races a few models
    // per attempt, and retries the whole wave with backoff when the free tier
    // answers 503/429 — so a briefly busy model no longer reaches the student.
    const result = await callCyberDTGeminiWithRetry(apiKey, requestBody, {
      timeoutMs: CYBER_DT_ROUTE_BUDGET_MS,
      attempts: 3,
      perAttemptMs: 16_000,
      raceCount: 3,
    });

    if (!result.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: "api_error",
          status: result.status,
          detail: result.detail,
          attempts: result.attempts,
          busy: true,
        },
        { headers: CYBER_DT_CORS },
      );
    }

    return NextResponse.json({ ok: true, text: result.text }, { headers: CYBER_DT_CORS });
  } catch (e: unknown) {
    const detail = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { ok: false, error: "exception", detail: detail.slice(0, 200), busy: true },
      { headers: CYBER_DT_CORS },
    );
  }
}
