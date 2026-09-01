import { config } from "@/config";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";

// Models are tried in order. The env-configured model (default "gemini-flash-latest")
// comes first, then we fall back through the other stable models when the primary
// one is overloaded (HTTP 503 / "high demand") or unavailable to the account.
const FALLBACK_MODELS = [
  "gemini-3.6-flash",
  "gemini-2.5-flash",
  "gemini-2.0-flash",
];

function candidateModels(): string[] {
  const base = config.gemini.model || "gemini-flash-latest";
  const list: string[] = [];
  const seen = new Set<string>();
  for (const m of [base, ...FALLBACK_MODELS]) {
    if (!seen.has(m)) {
      seen.add(m);
      list.push(m);
    }
  }
  return list;
}

interface GeminiOptions {
  systemInstruction?: string;
  temperature?: number;
  maxOutputTokens?: number;
  retriesPerModel?: number;
  retryDelayMs?: number;
}

function isRetryable(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return /503|UNAVAILABLE|high demand|overloaded|resource_exhausted|429|temporar/i.test(msg);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Generates AI content via Google Gemini with automatic retry (on transient
 * 503/429 overload errors) and multi-model fallback. This keeps AI features
 * working even when a specific model is temporarily saturated.
 */
export async function generateGeminiContent(
  prompt: string,
  options: GeminiOptions = {},
): Promise<string> {
  if (!GEMINI_API_KEY) {
    throw new Error("AI generation is not configured. Add GEMINI_API_KEY to enable AI features.");
  }

  const { GoogleGenAI } = await import("@google/genai");
  const client = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

  const models = candidateModels();
  const retries = options.retriesPerModel ?? 2;
  const backoff = options.retryDelayMs ?? 2500;

  let lastError: unknown = null;

  for (const model of models) {
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const result = await client.models.generateContent({
          model,
          contents: prompt,
          config: {
            systemInstruction: options.systemInstruction,
            temperature: options.temperature ?? config.gemini.temperature,
            maxOutputTokens: options.maxOutputTokens || config.gemini.maxTokens,
          },
        });
        return result.text || "No content was generated. Please try again.";
      } catch (error) {
        lastError = error;
        if (!isRetryable(error)) break;
        if (attempt < retries - 1) await sleep(backoff * (attempt + 1));
      }
    }
  }

  console.error("[GEMINI] All models failed:", lastError);
  throw new Error("AI generation failed. Please try again later.");
}
