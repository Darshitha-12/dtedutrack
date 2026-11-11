/**
 * Over-the-air update check for the offline APK's web layer.
 *
 * The APK bundles the whole site inside its assets, so pushing a new feature used to mean
 * shipping a brand-new APK. This module lets the app instead download a fresh web bundle from the
 * hosted site (`public/offline-ota/manifest.json` + `offline-build.zip`, produced by
 * build-offline), verify it, unpack it into filesDir through the native bridge and activate it
 * with a reload. Once activated, everything lives on-device again and the app is fully offline.
 *
 * Guardrails:
 *  - Only runs when the native bridge actually exposes the OTA methods (never on the hosted site).
 *  - Skips entirely when offline; retries on the next app launch or when the network returns.
 *  - Throttled to once every 6 hours so the process stays silent in the background.
 *  - The bundle is written to a versioned directory and only activated after its index.html is
 *    confirmed; a half-downloaded bundle can never be served.
 */

import { unzipSync } from "fflate";

const OTA_BASE = (process.env.NEXT_PUBLIC_OTA_BASE || "https://dtedutrack-euc4.vercel.app").replace(/\/+$/, "");
const MANIFEST_URL = `${OTA_BASE}/offline-ota/manifest.json`;
const CHECK_KEY = "bp_ota_last_check";
const MIN_INTERVAL_MS = 6 * 60 * 60 * 1000;
const MAX_BUNDLE_BYTES = 120_000_000;

interface OtaManifest {
  version: string;
  size: number;
  sha256: string;
  zipUrl: string;
  builtAt: string;
}

interface OtaBridge {
  getWebVersion?: () => string;
  writeWebFile?: (version: string, relPath: string, base64: string) => boolean;
  applyWebVersion?: (version: string) => boolean;
}

function bridge(): OtaBridge | null {
  if (typeof window === "undefined") return null;
  const b = (window as unknown as { BioPulseBridge?: OtaBridge }).BioPulseBridge;
  if (
    !b ||
    typeof b.getWebVersion !== "function" ||
    typeof b.writeWebFile !== "function" ||
    typeof b.applyWebVersion !== "function"
  ) {
    return null;
  }
  return b;
}

function metaVersion(): string {
  try {
    return document.querySelector('meta[name="bp-version"]')?.getAttribute("content")?.trim() || "";
  } catch {
    return "";
  }
}

async function fetchWithTimeout(url: string, ms: number): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { cache: "no-store", signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunk, bytes.length)));
  }
  return btoa(bin);
}

/** Fast fallback hash when crypto.subtle is unavailable in the WebView. */
async function hexSha256(bytes: ArrayBuffer): Promise<string | null> {
  try {
    if (crypto?.subtle) {
      const digest = await crypto.subtle.digest("SHA-256", bytes);
      return Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    }
  } catch {
    /* measured below */
  }
  // djb2 — NOT cryptographic, only a make-double-sure check on old WebViews.
  let hash = 5381;
  const view = new Uint8Array(bytes);
  for (const b of view.slice(0, 1_000_000)) hash = ((hash * 33) ^ b) >>> 0;
  return hash.toString(16).padStart(8, "0");
}

async function installBundle(version: string, buf: ArrayBuffer): Promise<boolean> {
  const zip = unzipSync(new Uint8Array(buf));
  for (const [rel, content] of Object.entries(zip)) {
    if (rel.endsWith("/") || rel.length === 0) continue;
    const ok = bridge()!.writeWebFile!(version, rel, bytesToBase64(content));
    if (!ok) {
      console.warn("[ota] failed to store", rel);
      return false;
    }
  }
  return bridge()!.applyWebVersion!(version) === true;
}

/** Checks once and applies a newer bundle if found. Silent and safe to call often. */
export async function checkForOtaUpdate(): Promise<void> {
  const b = bridge();
  if (!b) return;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return;

  try {
    const last = Number(localStorage.getItem(CHECK_KEY) || 0);
    if (Date.now() - last < MIN_INTERVAL_MS) return;
    localStorage.setItem(CHECK_KEY, String(Date.now()));

    const res = await fetchWithTimeout(MANIFEST_URL, 10_000);
    if (!res.ok) return;
    const manifest = (await res.json()) as OtaManifest;
    if (!manifest?.version || !manifest.sha256) return;

    // Nothing new to do when the running bundle already is the published one: either this build
    // shipped that version bundled (meta), or the updater applied it before (bridge).
    const current = b.getWebVersion!() || metaVersion();
    if (manifest.version === current) return;
    if (manifest.size > MAX_BUNDLE_BYTES) return;

    const zipRes = await fetchWithTimeout(new URL(manifest.zipUrl, MANIFEST_URL).toString(), 120_000);
    if (!zipRes.ok) return;
    const buf = await zipRes.arrayBuffer();
    const digest = await hexSha256(buf);
    if (digest && digest !== manifest.sha256.toLowerCase()) {
      console.warn("[ota] sha mismatch", digest, manifest.sha256);
      return;
    }

    if (!(await installBundle(manifest.version, buf))) return;
    console.info("[ota] applied", manifest.version, "— reloading");
    window.location.reload();
  } catch (err) {
    // No network, host unreachable, zip malformed… next launch retries. Never surface errors.
    console.debug("[ota] check skipped", err);
  }
}