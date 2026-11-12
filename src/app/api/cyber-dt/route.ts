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
    const images = Array.isArray(body.images)
      ? body.images
          .filter((i: unknown) => i && typeof i === "object" && typeof (i as { mimeType?: unknown }).mimeType === "string" && typeof (i as { data?: unknown }).data === "string")
          .map((i: { mimeType: string; data: string }) => ({ mimeType: i.mimeType, data: i.data }))
          .slice(0, 4) // cap at 4 images per message
      : [];

    if (!message && images.length === 0) {
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

    const requestBody = JSON.stringify(buildGeminiRequestBody(history, message, images));

    // Walk the model chain: free-tier rate limits are per model, so when the
    // primary model is busy (503), out of quota (429) or retired (404) the
    // next one usually still answers. Attempts are capped so the total stays
    // well under Netlify's 60-second function execution limit.
    const models = cyberDTModelChain();
    let lastStatus = 0;
    let lastDetail = "";

    for (let i = 0; i < models.length; i++) {
      const model = models[i];
      let res: Response;
      try {
        res = await fetch(geminiEndpoint(model), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": apiKey,
          },
          body: requestBody,
          // A complete study-plan answer can take ~30 s to generate; the cap
          // keeps one hung attempt from eating the whole function budget.
          signal: AbortSignal.timeout(40_000),
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

      // Rate limit (429), overload (503) or retired model (404) → try the
      // next model in the chain. 404 means the model was turned down by
      // Google (several are retired now), so the fallbacks must take over.
      if (res.status === 429 || res.status === 503 || res.status === 404) {
        await new Promise((resolve) => setTimeout(resolve, 600));
        continue;
      }

      // Any other error (bad request, invalid key…) — no point retrying
      // with other models; report it and let the chat page fall back.
      break;
    }

    return NextResponse.json(
      { ok: false, error: "api_error", status: lastStatus, detail: lastDetail, fallback: true },
      { status: 200, headers: CORS },
    );
  } catch (e: unknown) {
    const detail = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { ok: false, error: "exception", detail: detail.slice(0, 200), fallback: true },
      { headers: CORS },
    );
  }
}
