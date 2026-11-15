import { config } from "@/config";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";

// Models are tried in order. The env-configured model comes first, then we fall
// back through the other stable models when the primary one is overloaded
// (HTTP 503 / "high demand"), unavailable to the account, or not found.
// Retired as of Nov 2026 (404): gemini-2.0-flash, gemini-2.5-flash(+lite).
const FALLBACK_MODELS = [
  "gemini-3.8-flash",
  "gemini-3.6-flash",
  "gemini-3.5-flash-lite",
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
  /** 0 disables thinking; thinking tokens otherwise eat into maxOutputTokens. */
  thinkingBudget?: number;
  retriesPerModel?: number;
  retryDelayMs?: number;
}

function isRetryable(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return /503|UNAVAILABLE|high demand|overloaded|resource_exhausted|429|temporar/i.test(msg);
}

function keySetupHint(): string | null {
  if (!GEMINI_API_KEY) {
    return "AI generation is not configured. Add GEMINI_API_KEY to enable AI features.";
  }
  return null;
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
  const hint = keySetupHint();
  if (hint) {
    throw new Error(hint);
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
            ...(options.thinkingBudget !== undefined
              ? { thinkingConfig: { thinkingBudget: options.thinkingBudget } }
              : {}),
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

  const detail = lastError instanceof Error ? lastError.message : String(lastError);
  console.error("[GEMINI] All models failed:", lastError);
  throw new Error(`AI generation failed. ${detail.slice(0, 500)}`);
}

/** An image model's answer: a ready-to-use data URL plus any explanation text. */
export interface GeminiImageResult {
  dataUrl: string;
  mimeType: string;
  caption: string;
}

/**
 * Image models, best-effort order: the flash image model is fastest and works
 * on the free tier; the pro model renders Sinhala label text most reliably but
 * costs the most, so it is only a last resort.
 */
const IMAGE_MODELS = [
  "gemini-3.1-flash-image",
  "gemini-2.5-flash-image",
  "gemini-3-pro-image",
];

/**
 * Generates an image (plus optional text) with a Gemini image model. Unlike
 * generateGeminiContent this does not fall back to text models — a text model
 * cannot draw — so callers must keep their own text fallback.
 */
export async function generateGeminiImage(
  prompt: string,
  options: { systemInstruction?: string; temperature?: number } = {},
): Promise<GeminiImageResult> {
  const hint = keySetupHint();
  if (hint) {
    throw new Error(hint);
  }

  const { GoogleGenAI, Modality } = await import("@google/genai");
  const client = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

  let lastError: unknown = null;
  // A "limit: 0" quota error means image generation is not enabled for this
  // key at all — trying the other image models only wastes half a minute
  // before the route's SVG fallback runs.
  let quotaBlocked = false;

  for (const model of IMAGE_MODELS) {
    if (quotaBlocked) break;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const result = await client.models.generateContent({
          model,
          contents: prompt,
          config: {
            systemInstruction: options.systemInstruction,
            temperature: options.temperature ?? 0.4,
            responseModalities: [Modality.TEXT, Modality.IMAGE],
          },
        });

        const parts = result.candidates?.[0]?.content?.parts ?? [];
        const image = parts.find((part) => part.inlineData?.data)?.inlineData;
        if (image?.data) {
          const mimeType = image.mimeType || "image/png";
          return {
            dataUrl: `data:${mimeType};base64,${image.data}`,
            mimeType,
            caption: (result.text || "").trim(),
          };
        }

        // The model answered but drew nothing — the next model may still work.
        lastError = new Error(`${model} returned no image.`);
        break;
      } catch (error) {
        lastError = error;
        const detail = error instanceof Error ? error.message : String(error);
        if (/limit:\s*0\b/.test(detail)) {
          quotaBlocked = true;
          break;
        }
        if (!isRetryable(error)) break;
        if (attempt < 1) await sleep(2500);
      }
    }
  }

  const detail = lastError instanceof Error ? lastError.message : String(lastError);
  console.error("[GEMINI] Image generation failed:", lastError);
  throw new Error(`Image generation failed. ${detail.slice(0, 500)}`);
}
