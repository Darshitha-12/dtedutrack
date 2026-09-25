"use client";

export type ClientAuthResult =
  | { ok: true; url?: string }
  | { ok: false; error?: string };

export async function credentialsSignIn(
  email: string,
  otpToken: string,
  callbackUrl: string,
): Promise<ClientAuthResult> {
  try {
    const csrfRes = await fetch("/api/auth/csrf", {
      headers: { "Content-Type": "application/json" },
    });
    const csrfData = await csrfRes.json().catch(() => ({}));
    const csrfToken = (csrfData as { csrfToken?: string }).csrfToken ?? "";
    if (!csrfToken) {
      return { ok: false, error: "Security token missing. Please refresh and try again." };
    }

    const res = await fetch("/api/auth/callback/credentials", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "X-Auth-Return-Redirect": "1",
      },
      body: new URLSearchParams({ email, otpToken, csrfToken, callbackUrl }),
      credentials: "same-origin",
    });

    const raw = await res.text();
    let data: { url?: string; error?: string } = {};
    try {
      data = JSON.parse(raw);
    } catch {
      return { ok: false, error: "Unexpected sign-in response. Please try again." };
    }

    if (!res.ok) {
      return { ok: false, error: data.error || `Sign-in failed (HTTP ${res.status}). Please try again.` };
    }
    if (data.url) {
      const errorParam = new URL(data.url, window.location.origin).searchParams.get("error");
      if (errorParam) {
        return { ok: false, error: `Sign-in failed: ${errorParam}. Please try again.` };
      }
      return { ok: true, url: data.url };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "Network error during sign-in. Please try again." };
  }
}