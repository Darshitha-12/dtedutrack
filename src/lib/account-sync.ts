"use client";

/**
 * Account-scoped cloud sync for the client-side data that has no dedicated
 * server model (reminders, alarms, per-day Study Flow).
 *
 * The phone APK runs fully offline and has no NextAuth cookie, so it exchanges
 * its email + password once for a long-lived device token (see
 * /api/account/connect) and then talks to /api/account/snapshot with a Bearer
 * header. The laptop web is already signed in and simply uses its cookie.
 *
 * Sync model: a per-key last-write-wins mirror of specific localStorage keys.
 * Each tracked key carries a timestamp; the newer side wins. The server merges
 * incoming keys by timestamp so two devices editing different sections never
 * clobber each other.
 */

import { syncBlob } from "@/lib/blob-sync";

const BASE = (process.env.NEXT_PUBLIC_SYNC_BASE || "").replace(/\/$/, "");
const OFFLINE_BUILD = process.env.NEXT_PUBLIC_OFFLINE_BUILD === "1";

const TOKEN_KEY = "biopulse.sync.token";
const META_KEY = "biopulse.sync.meta";
const INFO_KEY = "biopulse.sync.identity";

const EXACT_KEYS = [
  "biopulse_reminders_v1",
  "biopulse_alarms_v1",
  "bp_notes_v2",
  "bp_exam_marks_v1",
  "bp_past_papers_v1",
  "bp_flashcards_v1",
  "bp_diagram_lab_v1",
  "bp_question_bank_v1",
  "bp_syllabus_v1",
  "bp_practice_v1",
  "bp_notepad_v1",
  "bp_downloads_v1",
  "bp_worklog_v1",
  "bp_mistakes_v1",
  "bp_timer_v1",
  "bp_pomodoro_v1",
  "bp_focus_v1",
  "bp_analytics_v1",
  "bp_fees_v1",
  "bp_classes_v1",
  "bp_timetable_v1",
  "bp_messages_v1",
  "bp_search_history_v1",
];
const PREFIX_KEYS = [
  "biopulse.studyflow.d.",
  "bp_ai_tutor_draft_",
  "bp_ai_tutor_chat_",
];

export const SYNC_EVENT = "biopulse:sync";

export type SyncStatus = "idle" | "syncing" | "ok" | "error" | "no-account";

export interface SyncState {
  status: SyncStatus;
  lastSyncedAt: number;
  error: string;
  email: string;
  connected: boolean;
}

type KvEntry = { v: string | null; t: number };
type Meta = { seen: Record<string, string | null>; t: Record<string, number> };

let state: SyncState = {
  status: "idle",
  lastSyncedAt: 0,
  error: "",
  email: "",
  connected: false,
};

let inFlight = false;
let lastSyncAt = 0;

/**
 * Minimum spacing between the "opportunistic" syncs (tab became visible, network
 * came back). Without this, flicking between apps produced one full account
 * pull each time — and each pull re-reads every collection the account owns.
 */
const OPPORTUNISTIC_SYNC_MIN_MS = 60_000;
let started = false;

function url(path: string): string {
  return `${BASE}${path}`;
}

function getToken(): string {
  try {
    return localStorage.getItem(TOKEN_KEY) || "";
  } catch {
    return "";
  }
}

function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function readIdentity(): { email: string } {
  try {
    const raw = localStorage.getItem(INFO_KEY);
    if (raw) return JSON.parse(raw) as { email: string };
  } catch {
    /* ignore */
  }
  return { email: "" };
}

function isTracked(key: string): boolean {
  return EXACT_KEYS.includes(key) || PREFIX_KEYS.some((p) => key.startsWith(p));
}

function enumerateTrackedLocalKeys(): string[] {
  const keys: string[] = [];
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key && isTracked(key)) keys.push(key);
    }
  } catch {
    /* ignore */
  }
  return keys;
}

function readLocal(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function readMeta(): Meta {
  try {
    const raw = localStorage.getItem(META_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Meta>;
      return { seen: parsed.seen ?? {}, t: parsed.t ?? {} };
    }
  } catch {
    /* ignore */
  }
  return { seen: {}, t: {} };
}

function writeMeta(meta: Meta): void {
  try {
    localStorage.setItem(META_KEY, JSON.stringify(meta));
  } catch {
    /* ignore */
  }
}

function setState(patch: Partial<SyncState>): void {
  state = { ...state, ...patch };
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(SYNC_EVENT, { detail: { ...state } }));
  }
}

export function getSyncState(): SyncState {
  return { ...state };
}

export function subscribeSync(listener: (s: SyncState) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = (e: Event) => listener((e as CustomEvent<SyncState>).detail);
  window.addEventListener(SYNC_EVENT, handler);
  return () => window.removeEventListener(SYNC_EVENT, handler);
}

export function hasToken(): boolean {
  return !!getToken();
}

export function isOfflineBuild(): boolean {
  return OFFLINE_BUILD;
}

/**
 * Diagnostics helpers — read-only snapshots of what the sync engine is currently
 * working with, surfaced by the on-screen diagnostics panel.
 */
export function getSyncBaseUrl(): string {
  return BASE || (typeof window !== "undefined" ? window.location.origin : "");
}

export function getStoredToken(): string {
  return getToken();
}

export function getIdentityEmail(): string {
  return readIdentity().email;
}

export function getTrackedLocalKeys(): string[] {
  return enumerateTrackedLocalKeys();
}

/**
 * The parts of the Android shell's JS bridge this module talks to.
 */
type ChatBridge = {
  setChatAuth?: (token: string, base: string) => void;
  setChatWatch?: (active: boolean) => void;
};

function chatBridge(): ChatBridge | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    return (window as unknown as { BioPulseBridge?: ChatBridge }).BioPulseBridge;
  } catch {
    return undefined;
  }
}

/**
 * Hands the account device token + server origin to the native Android shell, and starts/stops
 * its background DM poller.
 *
 * <p>The APK serves the offline bundle from Capacitor's local origin, so the WebView holds no
 * NextAuth cookie for the deployed site. The notification quick-reply runs in a
 * BroadcastReceiver with no page context, so it can only authenticate if the token is stored
 * natively. This is a no-op in the browser (no bridge).
 *
 * <p>Android freezes a hidden WebView, which stops the page's own unread poller exactly when a
 * notification matters most, so while an account is linked the native side polls instead (see
 * {@code MediaPlaybackService.startDmWatch}). Unlinking turns it back off.
 */
export function pushChatAuthToNative(): void {
  const bridge = chatBridge();
  if (!bridge) return;

  let token = "";
  try {
    token = getToken();
  } catch {
    token = "";
  }

  if (!token) {
    // Not linked yet (or just unlinked): never leave the native poller running.
    try {
      bridge.setChatWatch?.(false);
    } catch {
      /* bridge unavailable */
    }
    return;
  }

  try {
    bridge.setChatAuth?.(token, BASE || window.location.origin || "");
  } catch {
    /* bridge unavailable */
  }
  try {
    bridge.setChatWatch?.(true);
  } catch {
    /* bridge unavailable */
  }
}

/**
 * Exchanges email + password for a device token. Used by the offline APK to link
 * the device to an account. Safe to call on the web too (mints an unused token).
 */
export async function connectAccount(
  email: string,
  password: string,
  label = "device",
): Promise<{ ok: boolean; error?: string }> {
  try {
    setState({ status: "syncing", error: "" });
    const res = await fetch(url("/api/account/connect"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, label }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      token?: string;
      user?: { id?: string; email?: string; name?: string };
      error?: string;
    };
    if (!res.ok || !data.token) {
      const message = data.error || `Connect failed (HTTP ${res.status}).`;
      setState({ status: "error", error: message, connected: false });
      return { ok: false, error: message };
    }
    try {
      localStorage.setItem(TOKEN_KEY, data.token);
      localStorage.setItem(
        INFO_KEY,
        JSON.stringify({
          id: data.user?.id,
          email: data.user?.email || email,
          name: data.user?.name,
        }),
      );
    } catch {
      /* ignore */
    }
    setState({
      status: "ok",
      error: "",
      email: data.user?.email || email,
      connected: true,
      lastSyncedAt: Date.now(),
    });
    pushChatAuthToNative();
    void runSync();
    return { ok: true };
  } catch {
    setState({ status: "error", error: "Network error while connecting.", connected: false });
    return { ok: false, error: "Network error while connecting." };
  }
}

export function disconnectAccount(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(INFO_KEY);
    localStorage.removeItem(META_KEY);
  } catch {
    /* ignore */
  }
  try {
    const bridge = chatBridge();
    bridge?.setChatAuth?.("", "");
    bridge?.setChatWatch?.(false);
  } catch {
    /* bridge unavailable */
  }
  setState({ status: "no-account", connected: false, email: "", error: "" });
}

async function pullSnapshot(): Promise<Record<string, KvEntry> | null> {
  const res = await fetch(url("/api/account/snapshot"), {
    headers: authHeaders(),
    credentials: "same-origin",
    cache: "no-store",
  });
  if (res.status === 401) {
    setState({ status: "no-account", connected: false });
    return null;
  }
  if (!res.ok) throw new Error(`pull HTTP ${res.status}`);
  const json = (await res.json()) as { data?: { kv?: Record<string, KvEntry> } };
  return json.data?.kv ?? {};
}

async function pushSnapshot(kv: Record<string, KvEntry>): Promise<void> {
  const res = await fetch(url("/api/account/snapshot"), {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    credentials: "same-origin",
    body: JSON.stringify({ data: { updatedAt: Date.now(), kv } }),
  });
  if (res.status === 401) {
    setState({ status: "no-account", connected: false });
    return;
  }
  if (!res.ok) throw new Error(`push HTTP ${res.status}`);
}

function applyRemote(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

/**
 * One full sync pass: pull the server snapshot, reconcile each tracked key with
 * the local mirror, apply remote wins, then push local wins. Returns the set of
 * keys whose local value changed because of a remote value.
 */
export async function runSync(): Promise<{ appliedKeys: string[] }> {
  if (typeof window === "undefined" || inFlight) return { appliedKeys: [] };
  if (!hasToken() && OFFLINE_BUILD) {
    setState({ status: "no-account", connected: false });
    return { appliedKeys: [] };
  }
  inFlight = true;
  setState({ status: "syncing" });

  try {
    const remoteKv = await pullSnapshot();
    if (remoteKv === null) {
      inFlight = false;
      return { appliedKeys: [] };
    }

    const meta = readMeta();
    const localKeys = enumerateTrackedLocalKeys();
    const allKeys = new Set<string>([
      ...localKeys,
      ...Object.keys(remoteKv),
      ...Object.keys(meta.seen),
    ]);

    const toPush: Record<string, KvEntry> = {};
    const appliedKeys: string[] = [];
    const now = Date.now();

    for (const key of allKeys) {
      const localVal = readLocal(key);
      const remote = remoteKv[key];
      const seenVal = meta.seen[key] ?? null;
      const seenT = meta.t[key] ?? 0;

      const locallyChanged = localVal !== seenVal;
      const remoteNewer = !!remote && remote.t > seenT && (remote.v ?? null) !== seenVal;

      if (locallyChanged) {
        // Local wins (including deletions, encoded as a null tombstone).
        toPush[key] = { v: localVal, t: now };
        meta.seen[key] = localVal;
        meta.t[key] = now;
      } else if (remoteNewer) {
        applyRemote(key, remote.v ?? null);
        appliedKeys.push(key);
        meta.seen[key] = remote.v ?? null;
        meta.t[key] = remote.t;
      } else if (remote) {
        meta.seen[key] = localVal;
        meta.t[key] = remote.t;
      }
    }

    writeMeta(meta);

    if (Object.keys(toPush).length > 0) {
      await pushSnapshot(toPush);
    }

    if (appliedKeys.length > 0) {
      if (appliedKeys.includes("biopulse_reminders_v1")) {
        window.dispatchEvent(new Event("biopulse:reminders-changed"));
      }
      if (appliedKeys.includes("biopulse_alarms_v1")) {
        window.dispatchEvent(new Event("biopulse:alarms-changed"));
      }
      const studyflow = appliedKeys.some((k) => k.startsWith("biopulse.studyflow.d."));
      window.dispatchEvent(
        new CustomEvent("biopulse:kvsynced", { detail: { keys: appliedKeys, studyflow } }),
      );
    }

    // The offline APK keeps all "server" data in one localStorage blob. Mirror
    // it with the account's Postgres records so both the phone and the web show
    // the same content (see src/lib/blob-sync.ts and /api/account/blob).
    if (OFFLINE_BUILD) {
      try {
        await syncBlob();
      } catch (blobError) {
        console.error("[account-sync] blob sync failed", blobError);
      }
    }

    const identity = readIdentity();
    const finishedAt = Date.now();
    lastSyncAt = finishedAt;
    setState({
      status: "ok",
      error: "",
      connected: true,
      email: identity.email || state.email,
      lastSyncedAt: finishedAt,
    });
    return { appliedKeys };
  } catch (error) {
    setState({
      status: "error",
      error: error instanceof Error ? error.message : "Sync failed.",
    });
    return { appliedKeys: [] };
  } finally {
    inFlight = false;
  }
}

/**
 * Starts the background sync loop (idempotent). Pulls on start, when the tab
 * becomes visible, when connectivity returns, and on a slow interval.
 */
export function startAccountSync(): () => void {
  if (typeof window === "undefined" || started) return () => {};
  started = true;

  const identity = readIdentity();
  setState({ connected: hasToken(), email: identity.email });

  pushChatAuthToNative();
  void runSync();

  const onVisible = () => {
    if (document.visibilityState !== "visible") return;
    if (Date.now() - lastSyncAt < OPPORTUNISTIC_SYNC_MIN_MS) return;
    void runSync();
  };
  const onOnline = () => {
    if (Date.now() - lastSyncAt < OPPORTUNISTIC_SYNC_MIN_MS) return;
    void runSync();
  };
  const onStorage = (e: StorageEvent) => {
    if (e.key && isTracked(e.key)) {
      void runSync();
    }
    if (!e.key || e.key === TOKEN_KEY || e.key === INFO_KEY || e.key === META_KEY) {
      // Account/token/meta changed in another tab — pull to reflect state
      void runSync();
    }
  };

  // A full account pull reads every collection the account owns (notes, decks,
  // marks, planner, chat history) and the blob push rewrites those rows, so the
  // background interval has to stay slow: at 60s the two of them together were
  // what exhausted the database plan's monthly transfer allowance.
  const interval = window.setInterval(() => {
    if (document.visibilityState === "visible") void runSync();
  }, 300_000);

  window.addEventListener("focus", onOnline);
  window.addEventListener("online", onOnline);
  window.addEventListener("storage", onStorage);
  document.addEventListener("visibilitychange", onVisible);
  // An explicit "sync now" (dispatched by the native shell) always goes through:
  // it is a deliberate user action, not an opportunistic wake-up.
  const onSyncNow = () => void runSync();
  window.addEventListener("biopulse:sync-now", onSyncNow);

  return () => {
    started = false;
    window.clearInterval(interval);
    window.removeEventListener("focus", onOnline);
    window.removeEventListener("online", onOnline);
    window.removeEventListener("storage", onStorage);
    document.removeEventListener("visibilitychange", onVisible);
    window.removeEventListener("biopulse:sync-now", onSyncNow);
  };
}
