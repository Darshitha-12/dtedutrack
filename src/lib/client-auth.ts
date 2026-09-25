"use client";

export type ClientAuthResult =
  | { ok: true; url?: string }
  | { ok: false; error?: string };

export type CredentialsInput =
  | { otpToken: string }
  | { password: string };

export async function credentialsSignIn(
  email: string,
  secret: string,
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

    const body = new URLSearchParams({ email, csrfToken, callbackUrl });
    // A 96-char hex token is the OTP sign-in token; anything else is a password.
    if (/^[a-f0-9]{96}$/.test(secret)) {
      body.set("otpToken", secret);
    } else {
      body.set("password", secret);
    }

    const res = await fetch("/api/auth/callback/credentials", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "X-Auth-Return-Redirect": "1",
      },
      body,
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