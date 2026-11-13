import { NextRequest, NextResponse } from "next/server";
import {
  buildGeminiRequestBody,
  extractGeminiText,
  geminiEndpoint,
  cyberDTModelChain,
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
 * fine when called directly. Fully buffered JSON responses run for the
 * 20–30 s a long study plan needs, so the route returns the whole answer
 * at once and the chat page reveals it progressively with a typewriter
 * effect, which looks the same as streaming to the student.
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
 * Netlify kills a synchronous function at 60 s. We stop well before that and
 * return a clean JSON reply, because a killed function leaves the browser with
 * a dead socket and no answer at all.
 */
const TOTAL_BUDGET_MS = 50_000;

/** One model attempt may need to generate a long study plan; cap it so a hung
 *  request cannot eat the whole budget. */
const ATTEMPT_TIMEOUT_MS = 20_000;

/** Waits for `ms` without blocking the event loop. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function GET() {
  // Cheap status check: lets the chat page know whether the server has a
  // Gemini key configured, without making a real API call.
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "";
  return NextResponse.json({ ok: true, serverKey: Boolean(apiKey) }, { headers: CORS });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const message = typeof body.message === "string" ? body.message.trim() : "";
    const history: ChatTurn[] = Array.isArray(body.history) ? body.history : [];

    if (!message) {
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

    const requestBody = JSON.stringify(buildGeminiRequestBody(history, message));

    // Walk the model chain: free-tier rate limits are per model, so when the
    // primary model is busy (503), out of quota (429) or retired (404) the
    // next one usually still answers. Attempts are capped so the total stays
    // well under Netlify's 60-second function execution limit.
    const models = cyberDTModelChain();
    const deadline = Date.now() + TOTAL_BUDGET_MS;
    let lastStatus = 0;
    let lastDetail = "";
    let fatal = false;

    // Two passes over the chain. A 503 ("spikes in demand are usually
    // temporary") or a per-model 429 is often gone a moment later, so the
    // second pass — after a short wait — recovers answers a single pass would
    // drop. The deadline keeps the whole request under Netlify's 60 s limit so
    // the chat page always receives a clean JSON reply instead of a dead
    // socket (which looked to the student like "no answer").
    for (let round = 0; round < 2 && !fatal; round++) {
      for (const model of models) {
        const remaining = deadline - Date.now();
        if (remaining <= 2_000) break;

        let res: Response;
        try {
          res = await fetch(geminiEndpoint(model), {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-goog-api-key": apiKey,
            },
            body: requestBody,
            signal: AbortSignal.timeout(Math.min(ATTEMPT_TIMEOUT_MS, remaining)),
          });
        } catch (e: unknown) {
          // Network error / abort on this model — try the next one.
          lastStatus = 0;
          lastDetail = e instanceof Error ? e.message.slice(0, 200) : String(e);
          continue;
        }

        if (res.ok) {
          const data = await res.json().catch(() => null);
          const text = extractGeminiText(data);
          if (text) {
            return NextResponse.json({ ok: true, text }, { headers: CORS });
          }
          // Empty answer from this model — try the next one.
          lastStatus = 0;
          lastDetail = "empty_response";
          continue;
        }

        lastStatus = res.status;
        lastDetail = (await res.text().catch(() => "")).slice(0, 300);

        // Rate limit (429), overload (503) or retired model (404) → another
        // model may still answer. 404 means Google turned the model down.
        if (res.status === 429 || res.status === 503 || res.status === 404) {
          await sleep(400);
          continue;
        }

        // Any other error (bad request, invalid key…) — retrying other models
        // will not help, so stop and let the chat page fall back.
        fatal = true;
        break;
      }

      if (!fatal && Date.now() < deadline - 1_000) {
        await sleep(900);
      }
    }

    return NextResponse.json(
      {
        ok: false,
        error: "api_error",
        status: lastStatus,
        detail: lastDetail,
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
