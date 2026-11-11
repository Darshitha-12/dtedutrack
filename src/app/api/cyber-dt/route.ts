import { NextRequest, NextResponse } from "next/server";
import {
  buildGeminiRequestBody,
  extractGeminiText,
  extractGeminiStreamDelta,
  geminiEndpoint,
  geminiStreamEndpoint,
  cyberDTModelChain,
  parseSSEBuffer,
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
 * POST { message, history, stream }:
 *   - stream: true → the answer is streamed back as server-sent events
 *     (data: {"t":"...text delta..."}), so words appear while Gemini writes.
 *     If streaming can't start, the JSON fallback shape is returned instead.
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

/**
 * Streams a Gemini SSE response to the client as simple SSE events with
 * just the text delta, so no Gemini-specific data leaks to the browser.
 */
function pipeGeminiSSE(geminiBody: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = geminiBody.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const { events, rest } = parseSSEBuffer(buffer);
          buffer = rest;
          for (const event of events) {
            const delta = extractGeminiStreamDelta(event);
            if (delta) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ t: delta })}\n\n`));
            }
          }
        }
        controller.close();
      } catch (e) {
        // Network drop mid-stream: deliver what we have and end cleanly.
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
    },
    cancel() {
      geminiBody.cancel().catch(() => {});
    },
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const message = typeof body.message === "string" ? body.message.trim() : "";
    const history: ChatTurn[] = Array.isArray(body.history) ? body.history : [];
    const wantStream = body.stream === true;

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
    // primary model is busy (503) or out of quota (429) the next one usually
    // still answers. Attempts are capped so the total stays well under
    // Netlify's 60-second function execution limit.
    const models = cyberDTModelChain();
    let lastStatus = 0;
    let lastDetail = "";

    for (let i = 0; i < models.length; i++) {
      const model = models[i];
      const endpoint = wantStream ? geminiStreamEndpoint(model) : geminiEndpoint(model);
      let res: Response;
      try {
        res = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": apiKey,
          },
          body: requestBody,
          signal: AbortSignal.timeout(wantStream ? 50_000 : 18_000),
        });
      } catch (e: unknown) {
        // Network error / abort on this model — try the next one.
        lastStatus = 0;
        lastDetail = e instanceof Error ? e.message.slice(0, 200) : String(e);
        continue;
      }

      if (res.ok) {
        if (wantStream && res.body) {
          // Stream the answer as SSE while Gemini writes it.
          return new Response(pipeGeminiSSE(res.body), {
            headers: {
              ...CORS,
              "Content-Type": "text/event-stream; charset=utf-8",
              "Cache-Control": "no-store, max-age=0",
              "X-Accel-Buffering": "no",
            },
          });
        }

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
