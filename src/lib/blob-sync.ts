"use client";

/**
 * Bidirectional sync of the offline blob (`biopulse-offline-v1`) with the account
 * on the server. Only the offline APK uses this: its whole dataset lives in one
 * localStorage blob, and this exchanges that blob with /api/account/blob so the
 * web (which reads Postgres) and the phone show the same data.
 *
 * Merge model: per-entity last-write-wins. Collections keyed by id (work logs by
 * date, planner days by weekday, attendance by class+date) are unioned; when an
 * id exists on both sides the entry with the newer timestamp wins. Singletons
 * (profile, settings, planner prefs) follow their own updatedAt.
 *
 * Deletions are propagated with tombstones (`state.deleted`). A local deletion is
 * detected by comparing the current ids against the ids recorded at the last
 * successful sync (`biopulse.sync.seen`); the tombstone travels in the blob so
 * the other side drops the entity too instead of resurrecting it on the union.
 */

import {
  getState,
  saveState,
  resetCache,
  type OfflineState,
} from "@/lib/offline-api/store";

const BASE = (process.env.NEXT_PUBLIC_SYNC_BASE || "").replace(/\/$/, "");
const TOKEN_KEY = "biopulse.sync.token";
const SEEN_KEY = "biopulse.sync.seen";

type AnyRecord = Record<string, unknown>;
type DelMap = Record<string, Record<string, string>>;
type Seen = Record<string, Record<string, number>>;
type KeyFn = (x: AnyRecord) => string;

// Collections whose deletions are tracked with tombstones. Each is keyed either
// by a unique id (re-adding creates a new id, so a stale tombstone can't block
// it) or, for work logs, by date.
const KEYERS: Record<string, KeyFn> = {
  notes: (x) => str(x.id),
  notepad: (x) => str(x.id),
  decks: (x) => str(x.id),
  marks: (x) => str(x.id),
  pastRecords: (x) => str(x.id),
  classes: (x) => str(x.id),
  plannerSessions: (x) => str(x.id),
  progress: (x) => str(x.id),
  studySessions: (x) => str(x.id),
  workLogs: (x) => str(x.date),
};

const STAMP_FIELDS: Record<string, string[]> = {
  notes: ["createdAt"],
  notepad: ["updatedAt", "createdAt"],
  decks: ["updatedAt", "createdAt"],
  marks: ["examDate"],
  pastRecords: ["examDate"],
  classes: [],
  plannerSessions: ["completedAt"],
  progress: ["updatedAt"],
  studySessions: ["completedAt"],
  workLogs: ["date"],
};

const TRACKED = Object.keys(KEYERS);

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
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

function ts(value: unknown): number {
  if (typeof value !== "string" || !value) return 0;
  const t = Date.parse(value);
  return Number.isFinite(t) ? t : 0;
}

function stampOf(x: AnyRecord, fields: string[]): number {
  let best = 0;
  for (const f of fields) best = Math.max(best, ts(x[f]));
  return best;
}

function collection(items: unknown): AnyRecord[] {
  return Array.isArray(items)
    ? (items.filter((x) => x && typeof x === "object") as AnyRecord[])
    : [];
}

function keymap(name: string, items: unknown): Map<string, AnyRecord> {
  const m = new Map<string, AnyRecord>();
  const kf = KEYERS[name];
  for (const it of collection(items)) {
    const k = kf(it);
    if (k) m.set(k, it);
  }
  return m;
}

function readSeen(): Seen {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    return raw ? (JSON.parse(raw) as Seen) : {};
  } catch {
    return {};
  }
}

function writeSeen(s: OfflineState): void {
  const seen: Seen = {};
  for (const name of TRACKED) {
    const o: Record<string, number> = {};
    for (const [k, it] of keymap(name, (s as unknown as AnyRecord)[name])) {
      o[k] = stampOf(it, STAMP_FIELDS[name]);
    }
    seen[name] = o;
  }
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify(seen));
  } catch {
    /* storage unavailable */
  }
}

/** Records a tombstone for every tracked id that existed at the last sync but is gone now. */
function detectLocalDeletions(s: OfflineState): void {
  const seen = readSeen();
  const del: DelMap = (s.deleted as DelMap) ?? {};
  const now = new Date().toISOString();
  for (const name of TRACKED) {
    const cur = keymap(name, (s as unknown as AnyRecord)[name]);
    const prev = seen[name] ?? {};
    for (const k of Object.keys(prev)) {
      if (!cur.has(k)) {
        if (!del[name]) del[name] = {};
        del[name][k] = now;
      }
    }
  }
  s.deleted = del;
}

function unionDeleted(a: unknown, b: unknown): DelMap {
  const out: DelMap = {};
  for (const src of [a, b]) {
    if (!src || typeof src !== "object") continue;
    for (const [name, m] of Object.entries(src as DelMap)) {
      if (!m || typeof m !== "object") continue;
      if (!out[name]) out[name] = {};
      for (const [k, v] of Object.entries(m)) {
        const cur = out[name][k];
        if (!cur || ts(v) > ts(cur)) out[name][k] = v;
      }
    }
  }
  return out;
}

/** Union of tracked collections, honouring tombstones (newer timestamp wins; deletions win ties). */
function mergeColl(
  del: DelMap,
  name: string,
  local: unknown,
  remote: unknown,
): AnyRecord[] {
  const kf = KEYERS[name];
  const fields = STAMP_FIELDS[name];
  const map = new Map<string, AnyRecord>();
  for (const l of collection(local)) {
    const k = kf(l);
    if (k) map.set(k, l);
  }
  for (const r of collection(remote)) {
    const k = kf(r);
    if (!k) continue;
    const l = map.get(k);
    if (!l || stampOf(r, fields) > stampOf(l, fields)) map.set(k, r);
  }
  const d = del[name] ?? {};
  const out: AnyRecord[] = [];
  for (const [k, item] of map) {
    const dts = ts(d[k]);
    // A tombstone at or after the item's timestamp removes it; an item newer
    // than its tombstone revives (clears) the tombstone.
    if (dts && dts >= stampOf(item, fields)) continue;
    if (dts) delete d[k];
    out.push(item);
  }
  del[name] = d;
  return out;
}

/** Union of untracked collections (no tombstones — web never deletes these). */
function mergeSimple(
  local: unknown,
  remote: unknown,
  keyOf: KeyFn,
  fields: string[],
): AnyRecord[] {
  const map = new Map<string, AnyRecord>();
  for (const l of collection(local)) {
    const k = keyOf(l);
    if (k) map.set(k, l);
  }
  for (const r of collection(remote)) {
    const k = keyOf(r);
    if (!k) continue;
    const l = map.get(k);
    if (!l || stampOf(r, fields) > stampOf(l, fields)) map.set(k, r);
  }
  return [...map.values()];
}

/** Applies a server blob onto the local state (LWW per entity, tombstones honoured). Mutates `s`. */
export function mergeServerBlob(s: OfflineState, remoteRaw: unknown): void {
  if (!remoteRaw || typeof remoteRaw !== "object") return;
  const remote = remoteRaw as AnyRecord;

  const mergedDel = unionDeleted(s.deleted, remote.deleted);
  s.deleted = mergedDel;

  // ---- singletons ----
  // Adopt the server copy only when it is both newer AND actually configured;
  // this prevents a freshly-linked account (whose server rows are defaults)
  // from wiping a phone that already holds real, un-pushed data.
  const rp = remote.profile as AnyRecord | undefined;
  if (rp && typeof rp === "object") {
    const configured =
      rp.onboarded === true ||
      (typeof rp.fullName === "string" && rp.fullName.trim() !== "") ||
      (typeof rp.examYear === "string" && rp.examYear !== "") ||
      (typeof rp.name === "string" && rp.name !== "" && rp.name !== "Student");
    if (configured && ts(rp.updatedAt) > ts(s.profile.updatedAt)) {
      s.profile = { ...s.profile, ...(rp as unknown as OfflineState["profile"]) };
    }
  }

  const rs = remote.settings as AnyRecord | undefined;
  if (rs && typeof rs === "object") {
    const configured =
      rs.browserEnabled === true ||
      rs.telegramEnabled === true ||
      rs.ntfyEnabled === true ||
      [rs.telegramToken, rs.telegramChatId, rs.ntfyTopic, rs.fcmToken].some(
        (v) => typeof v === "string" && v !== "",
      );
    if (configured && ts(rs.updatedAt) > ts(s.settings.updatedAt)) {
      s.settings = { ...s.settings, ...(rs as unknown as OfflineState["settings"]) };
    }
  }

  const rpp = remote.plannerPrefs as AnyRecord | null | undefined;
  if (rpp && typeof rpp === "object") {
    if (!s.plannerPrefs || ts(rpp.updatedAt) > ts((s.plannerPrefs as { updatedAt?: string }).updatedAt)) {
      s.plannerPrefs = { ...(s.plannerPrefs ?? {}), ...(rpp as unknown as OfflineState["plannerPrefs"]) } as OfflineState["plannerPrefs"];
    }
  }

  // ---- tracked arrays (tombstones) ----
  s.notepad = mergeColl(mergedDel, "notepad", s.notepad, remote.notepad) as unknown as OfflineState["notepad"];
  s.notes = mergeColl(mergedDel, "notes", s.notes, remote.notes) as unknown as OfflineState["notes"];
  s.decks = mergeColl(mergedDel, "decks", s.decks, remote.decks) as unknown as OfflineState["decks"];
  s.marks = mergeColl(mergedDel, "marks", s.marks, remote.marks) as unknown as OfflineState["marks"];
  s.pastRecords = mergeColl(mergedDel, "pastRecords", s.pastRecords, remote.pastRecords) as unknown as OfflineState["pastRecords"];
  s.workLogs = mergeColl(mergedDel, "workLogs", s.workLogs, remote.workLogs) as unknown as OfflineState["workLogs"];
  s.classes = mergeColl(mergedDel, "classes", s.classes, remote.classes) as unknown as OfflineState["classes"];
  s.progress = mergeColl(mergedDel, "progress", s.progress, remote.progress) as unknown as OfflineState["progress"];
  s.plannerSessions = mergeColl(mergedDel, "plannerSessions", s.plannerSessions, remote.plannerSessions) as unknown as OfflineState["plannerSessions"];
  s.studySessions = mergeColl(mergedDel, "studySessions", s.studySessions, remote.studySessions) as unknown as OfflineState["studySessions"];

  // ---- untracked arrays (union only) ----
  s.plannerDays = mergeSimple(s.plannerDays, remote.plannerDays, (x) => String(x.dayOfWeek ?? ""), []) as unknown as OfflineState["plannerDays"];
  s.classAttendance = mergeSimple(s.classAttendance, remote.classAttendance, (x) => `${x.classId ?? ""}|${x.date ?? ""}`, []) as unknown as OfflineState["classAttendance"];
  s.quizzes = mergeSimple(s.quizzes, remote.quizzes, (x) => str(x.id), ["completedAt", "createdAt"]) as unknown as OfflineState["quizzes"];
  s.attempts = mergeSimple(s.attempts, remote.attempts, (x) => str(x.id), ["answeredAt"]) as unknown as OfflineState["attempts"];
  s.chatMessages = mergeSimple(s.chatMessages, remote.chatMessages, (x) => str(x.id), ["createdAt"]) as unknown as OfflineState["chatMessages"];
  s.statuses = mergeSimple(s.statuses, remote.statuses, (x) => str(x.id), ["createdAt"]) as unknown as OfflineState["statuses"];
}

/**
 * One blob sync pass for the offline build: detect local deletions, pull the
 * server blob, merge it in, save, then push the merged blob back.
 */
export async function syncBlob(): Promise<{ ok: boolean; merged: boolean }> {
  const s = getState();
  detectLocalDeletions(s);

  let res: Response;
  try {
    res = await fetch(`${BASE}/api/account/blob`, {
      headers: authHeaders(),
      credentials: "same-origin",
      cache: "no-store",
    });
  } catch {
    saveState();
    return { ok: false, merged: false };
  }

  const before = JSON.stringify(s);
  if (res.ok) {
    try {
      const remote = await res.json();
      mergeServerBlob(s, remote?.blob ?? remote);
    } catch {
      /* keep local tombstones; retry next pass */
    }
  }

  const merged = JSON.stringify(s) !== before;
  saveState();
  if (merged) resetCache();

  if (!res.ok) return { ok: false, merged };

  const push = await fetch(`${BASE}/api/account/blob`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    credentials: "same-origin",
    body: JSON.stringify({ blob: getState() }),
  });

  if (push.ok) writeSeen(getState());

  if (merged) {
    try {
      window.dispatchEvent(
        new CustomEvent("biopulse:kvsynced", { detail: { keys: ["biopulse-offline-v1"], studyflow: false } }),
      );
    } catch {
      /* no-op */
    }
  }
  return { ok: push.ok, merged };
}
