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
 * Note: Netlify only passes env vars set in the dashboard (not netlify.toml
 * [build.environment]) to serverless functions at runtime.
 */

interface ChatTurn {
  role?: string;
  text?: string;
}

export async function GET() {
  // Cheap status check: lets the chat page know whether the server has a
  // Gemini key configured, without making a real API call.
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "";
  return NextResponse.json({ ok: true, serverKey: Boolean(apiKey) });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const message = typeof body.message === "string" ? body.message.trim() : "";
    const history: ChatTurn[] = Array.isArray(body.history) ? body.history : [];

    if (!message) {
      return NextResponse.json({ ok: false, error: "empty_message", fallback: true }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "";
    if (!apiKey) {
      // No server key: the chat page tries its own fallbacks.
      return NextResponse.json({ ok: false, error: "no_api_key", fallback: true });
    }

    const requestBody = JSON.stringify(buildGeminiRequestBody(history, message));

    // Walk the model chain: free-tier rate limits are per model, so when the
    // primary model is busy (503) or out of quota (429) the next one usually
    // still answers. Attempts are capped so the total stays well under
    // Netlify's 60-second function execution limit.
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
          signal: AbortSignal.timeout(18_000),
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
          return NextResponse.json({ ok: true, text });
        }
        // Empty answer from this model — try the next one.
        lastStatus = 0;
        lastDetail = "empty_response";
        continue;
      }

      lastStatus = res.status;
      lastDetail = (await res.text().catch(() => "")).slice(0, 300);

      // Rate limit (429) or overload (503) → try the next model in the chain.
      if (res.status === 429 || res.status === 503) {
        await new Promise((resolve) => setTimeout(resolve, 600));
        continue;
      }

      // Any other error (bad request, invalid key…) — no point retrying
      // with other models; report it and let the chat page fall back.
      break;
    }

    return NextResponse.json(
      { ok: false, error: "api_error", status: lastStatus, detail: lastDetail, fallback: true },
      { status: 200 },
    );
  } catch (e: unknown) {
    const detail = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: "exception", detail: detail.slice(0, 200), fallback: true });
  }
}
