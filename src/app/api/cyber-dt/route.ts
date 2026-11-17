import { NextRequest, NextResponse } from "next/server";
import {
  buildGeminiRequestBody,
  callCyberDTGeminiWithRetry,
  readCyberDTImage,
  CYBER_DT_VOICE_PROMPT,
} from "@/features/ai/cyber-dt-shared";

/**
 * Cyber DT AI — real AI answers via the Google Gemini API (free tier).
 *
 * The API key lives ONLY on the server (GEMINI_API_KEY env var), never in
 * client code. If no key is configured — or Gemini fails for any reason —
 * the route responds with { ok: false, fallback: true } and the chat page
 * falls back to its own options (a user-pasted key, or the built-in
 * offline knowledge base), so the feature always works.
 *
 * POST { message, history } → { ok: true, text } with the COMPLETE answer.
 *
 * Why not server-sent events? Netlify's function runtime reliably cut our
 * streamed responses a few seconds in — long answers arrived truncated
 * mid-sentence on the live site even though the same request completed
 * fine when called directly. Fully buffered JSON responses finish inside the
 * platform's function timeout, so the route returns the whole answer at once
 * and the chat page reveals it progressively with a typewriter effect, which
 * looks the same as streaming to the student.
 *
 * Note: Netlify only passes env vars set in the dashboard (not netlify.toml
 * [build.environment]) to serverless functions at runtime.
 */

interface ChatTurn {
  role?: string;
  text?: string;
}

/**
 * CORS: the offline APK boots from bundled assets, so the chat page fetches
 * this route from the deployed site (cross-origin) to use its Gemini key.
 */
const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

/**
 * Hard ceiling for the whole request. Netlify cuts a synchronous function well
 * before a minute — a 50 s budget produced 504 Gateway Timeouts on the live
 * site — so we finish comfortably early and return a clean JSON reply. A killed
 * function leaves the browser with a dead socket and no answer at all.
 */
const TOTAL_BUDGET_MS = 22_000;

/**
 * Release marker, returned by GET so a deploy can be verified from outside.
 * Bump this whenever the Cyber DT routes change.
 */
const CYBER_DT_REV = "2026-11-17-live-voice";

/**
 * How many models to ask at the same time. Free-tier quota is per model, so
 * racing the WHOLE chain both hides a single busy model and gives the student
 * the FASTEST answer instead of the sum of a sequential chain. The retry wave
 * then slides the window along the chain so it reaches models the first wave
 * missed.
 */
const MAX_PARALLEL = 6;

/**
 * Ceiling for one wave of models. A long study plan can take 15–20 s to write,
 * so a shorter cap would cut every model off mid-plan. The wave returns the
 * moment the fastest model finishes, and a model that sends NO tokens at all is
 * dropped after a few seconds by the shared first-token watchdog (see
 * callCyberDTGemini), so a dead connection no longer holds the wave.
 */
const PER_ATTEMPT_MS = 18_000;

/**
 * Retry waves. The first wave already races every model in the chain, so one
 * extra wave (after a short backoff) is enough to ride out a free-tier burst
 * without making the student wait for a long chain of them.
 */
const ATTEMPTS = 2;

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function GET() {
  // Cheap status check: lets the chat page know whether the server has a
  // Gemini key configured, without making a real API call. `rev` also lets a
  // deploy be verified from outside (it changes with each release).
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "";
  return NextResponse.json(
    { ok: true, serverKey: Boolean(apiKey), rev: CYBER_DT_REV },
    { headers: CORS },
  );
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const message = typeof body.message === "string" ? body.message.trim() : "";
    const history: ChatTurn[] = Array.isArray(body.history) ? body.history : [];
    // Optional vision input: a textbook diagram, past-paper question or
    // handwritten note attached from the composer.
    const image = readCyberDTImage(body);

    if (image === null) {
      return NextResponse.json(
        { ok: false, error: "invalid_image", fallback: true },
        { status: 400, headers: CORS },
      );
    }
    if (!message && !image) {
      return NextResponse.json(
        { ok: false, error: "empty_message", fallback: true },
        { status: 400, headers: CORS },
      );
    }

    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "";
    if (!apiKey) {
      // No server key: the chat page tries its own fallbacks.
      return NextResponse.json({ ok: false, error: "no_api_key", fallback: true }, { headers: CORS });
    }

    // An image can arrive on its own (student just snaps a diagram).
    const prompt =
      message ||
      "Explain what this image shows according to the NIE Resource Book and the A/L syllabus.";
    // Live Voice Tutor: ask for a short, spoken-style answer with no markdown.
    const voiceMode = body.mode === "voice" || body.voice === true;
    const requestBody = buildGeminiRequestBody(
      history,
      prompt,
      image,
      voiceMode ? CYBER_DT_VOICE_PROMPT : undefined,
    );

    // Ask several models at once, keep the first complete answer, and — if the
    // whole wave fails with a transient 503/429 — retry the wave with
    // exponential backoff, sliding the model window along so the retry reaches
    // models the first wave never asked. Free-tier limits are per model, so one
    // busy model (or a busy moment) no longer ends in "no answer".
    const result = await callCyberDTGeminiWithRetry(apiKey, requestBody, {
      timeoutMs: TOTAL_BUDGET_MS,
      attempts: ATTEMPTS,
      perAttemptMs: PER_ATTEMPT_MS,
      raceCount: MAX_PARALLEL,
    });

    if (result.ok) {
      return NextResponse.json({ ok: true, text: result.text }, { headers: CORS });
    }

    return NextResponse.json(
      {
        ok: false,
        error: "api_error",
        status: result.status,
        detail: result.detail,
        // How many waves we tried, so the UI can say "tried N times".
        attempts: result.attempts,
        // Tells the chat page the AI itself is busy (not that the device is
        // offline), so it can offer a retry instead of a wrong offline answer.
        busy: true,
        fallback: true,
      },
      { status: 200, headers: CORS },
    );
  } catch (e: unknown) {
    const detail = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      // busy:true → the chat page offers a retry instead of an offline answer.
      { ok: false, error: "exception", detail: detail.slice(0, 200), busy: true, fallback: true },
      { headers: CORS },
    );
  }
}
