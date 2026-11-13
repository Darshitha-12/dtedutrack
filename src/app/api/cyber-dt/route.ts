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
 * How many models to ask at the same time. Free-tier quota is per model, so
 * racing a few both hides a single busy model and gives the student the
 * FASTEST answer instead of the sum of a sequential chain.
 */
const MAX_PARALLEL = 3;

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

    // Ask several models at once and keep the first complete answer. Free-tier
    // limits are per model, so one model being overloaded (503) or out of quota
    // (429) no longer ends in "no answer", and racing them means the student
    // waits for the FASTEST model rather than the sum of a sequential chain.
    const models = cyberDTModelChain();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TOTAL_BUDGET_MS);
    let winner = "";
    let lastStatus = 0;
    let lastDetail = "";

    const attempt = async (model: string): Promise<void> => {
      if (winner) return;
      try {
        const res = await fetch(geminiEndpoint(model), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": apiKey,
          },
          body: requestBody,
          signal: controller.signal,
        });

        if (res.ok) {
          const data = await res.json().catch(() => null);
          const text = extractGeminiText(data);
          if (text && !winner) {
            winner = text;
            // We already have an answer — stop the other in-flight requests.
            controller.abort();
          }
          return;
        }

        lastStatus = res.status;
        lastDetail = (await res.text().catch(() => "")).slice(0, 300);
      } catch (e: unknown) {
        // Aborted (a winner exists, or we ran out of time) or a network error
        // on this model. Keep the first useful detail for diagnostics.
        if (!winner && lastStatus === 0) {
          lastDetail = e instanceof Error ? e.message.slice(0, 200) : String(e);
        }
      }
    };

    // Race the fastest / most reliable models together.
    await Promise.all(models.slice(0, MAX_PARALLEL).map(attempt));

    // Still nothing? Try any remaining models one at a time while time allows.
    if (!winner) {
      for (const model of models.slice(MAX_PARALLEL)) {
        if (controller.signal.aborted) break;
        await attempt(model);
        if (winner) break;
      }
    }

    clearTimeout(timer);

    if (winner) {
      return NextResponse.json({ ok: true, text: winner }, { headers: CORS });
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
