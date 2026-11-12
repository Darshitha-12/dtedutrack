"use client";

import { getStoredToken, getSyncBaseUrl } from "@/lib/account-sync";

export interface LinkedDevice {
  tokenPrefix: string;
  label: string;
  createdAt: string;
  lastSeen: string;
  current: boolean;
}

function authHeaders(): Record<string, string> {
  const token = getStoredToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function endpoint(): string {
  return `${getSyncBaseUrl()}/api/account/devices`;
}

/** Every device token linked to the account (APK devices). */
export async function listLinkedDevices(): Promise<
  { ok: true; devices: LinkedDevice[]; currentMethod: "token" | "session" } | { ok: false; error: string }
> {
  try {
    const res = await fetch(endpoint(), {
      headers: authHeaders(),
      credentials: "same-origin",
      cache: "no-store",
    });
    if (res.status === 401) return { ok: false, error: "Sign in to see linked devices." };
    if (!res.ok) return { ok: false, error: `Could not load devices (HTTP ${res.status}).` };
    const data = (await res.json()) as {
      devices?: LinkedDevice[];
      currentMethod?: "token" | "session";
    };
    return { ok: true, devices: data.devices ?? [], currentMethod: data.currentMethod ?? "session" };
  } catch {
    return { ok: false, error: "Network error while loading devices." };
  }
}

/** Revokes a device by the prefix returned from listLinkedDevices(). */
export async function removeLinkedDevice(tokenPrefix: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(endpoint(), {
      method: "DELETE",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      credentials: "same-origin",
      body: JSON.stringify({ tokenPrefix }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) return { ok: false, error: data.error || `Unlink failed (HTTP ${res.status}).` };
    return { ok: true };
  } catch {
    return { ok: false, error: "Network error while unlinking." };
  }
}

function browserName(): string {
  const ua = typeof navigator === "undefined" ? "" : navigator.userAgent;
  if (/Edg\//.test(ua)) return "Edge";
  if (/OPR\//.test(ua)) return "Opera";
  if (/Firefox\//.test(ua)) return "Firefox";
  if (/Chrome\//.test(ua)) return "Chrome";
  if (/Safari\//.test(ua)) return "Safari";
  return "Browser";
}

function platformName(): string {
  const ua = typeof navigator === "undefined" ? "" : navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua)) return "iOS";
  if (/Android/.test(ua)) return "Android";
  if (/Windows/.test(ua)) return "Windows";
  if (/Mac OS X|Macintosh/.test(ua)) return "macOS";
  if (/Linux/.test(ua)) return "Linux";
  return "Device";
}

/**
 * Human-readable label stored with a device token so the account page can tell
 * the devices apart (e.g. "Android app", "Chrome on Windows").
 */
export function thisDeviceLabel(): string {
  const ua = typeof navigator === "undefined" ? "" : navigator.userAgent;
  const isApp = /wv\)|Capacitor|BioPulse/i.test(ua);
  const platform = platformName();
  return (isApp ? `${platform} app` : `${browserName()} on ${platform}`).slice(0, 80);
}
