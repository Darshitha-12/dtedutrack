/**
 * AI provider error diagnostics.
 *
 * This module ONLY inspects errors thrown by the AI provider to produce
 * clearer server-side diagnostics and safer user-facing messages. It does
 * not alter the provider architecture, model, or request flow.
 */

/**
 * Detects whether an unknown thrown value is an OpenAI API error with a
 * specific HTTP status code.
 *
 * The OpenAI SDK exposes `status` (HTTP status number) on its APIError
 * instances, so we can reliably distinguish quota/billing errors (429)
 * from other failures without string-matching brittle messages.
 */
function isOpenAIStatusError(error: unknown, status: number): boolean {
  if (error && typeof error === "object") {
    const err = error as { status?: unknown };
    return err.status === status;
  }
  return false;
}

/**
 * Detects an OpenAI 429 error specifically caused by insufficient billing
 * quota. A 429 can also be a generic rate-limit, so we additionally check
 * the provider error code/message for the "insufficient_quota" signal while
 * keeping the detection defensive (never throws).
 */
function isInsufficientQuota(error: unknown): boolean {
  if (!isOpenAIStatusError(error, 429)) return false;

  let code: string | null | undefined;
  let message = "";
  if (error && typeof error === "object") {
    const err = error as {
      code?: string | null;
      error?: { code?: string | null; message?: string };
      message?: string;
    };
    code = err.code ?? err.error?.code ?? null;
    message = err.error?.message ?? err.message ?? "";
  }

  if (code === "insufficient_quota") return true;
  return /insufficient_quota|insufficient quota/i.test(message);
}

function isTransientOverload(error: unknown): boolean {
  if (error && typeof error === "object") {
    const err = error as { status?: unknown; message?: string };
    if (err.status === 503) return true;
    if (err.message && /resource_exhausted|503|UNAVAILABLE|high demand|overloaded/i.test(err.message)) return true;
  }
  if (error instanceof Error && /resource_exhausted|503|UNAVAILABLE|high demand|overloaded/i.test(error.message)) return true;
  return false;
}

/**
 * Produces a safe user-facing SSE error message for a thrown provider error.
 *
 * Never includes the API key, raw provider response, or internal details.
 * Unknown errors fall back to a generic message.
 */
export function toUserFacingError(error: unknown): string {
  if (isInsufficientQuota(error)) {
    return "The AI tutor is temporarily unavailable due to an account quota issue. Please try again later.";
  }
  if (isTransientOverload(error)) {
    return "The AI tutor is temporarily overloaded. Please wait a moment and try again.";
  }
  return "Failed to get AI response. Please try again.";
}

/**
 * Produces a clear server-side diagnostic string for logging. This is only
 * for the server console — it is NEVER sent to the browser.
 */
export function toDiagnostic(error: unknown): string {
  if (isInsufficientQuota(error)) {
    return "OpenAI quota/billing error (HTTP 429 insufficient_quota): the account has exceeded its available quota. Ask the user to check billing at platform.openai.com.";
  }
  if (error instanceof Error) {
    return `AI provider error: ${error.message}`;
  }
  return "AI provider error: unknown failure";
}
