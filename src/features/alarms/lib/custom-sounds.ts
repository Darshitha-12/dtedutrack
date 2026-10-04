"use client";

/**
 * Custom alarm/reminder sound library.
 *
 * Sounds live in IndexedDB as raw blobs so there is no practical ceiling on how
 * many MP3s a device can hold (localStorage would cap out around 5MB total).
 * Only metadata is kept in memory for rendering; blobs are fetched on demand and
 * exposed to <audio> through cached object URLs.
 */

export interface CustomSoundMeta {
  id: string;
  name: string;
  mime: string;
  size: number;
  /** Seconds, or null when the browser cannot decode the duration. */
  duration: number | null;
  createdAt: number;
}

export const CUSTOM_SOUND_PREFIX = "custom:";
export const SOUNDS_CHANGED_EVENT = "biopulse:sounds-changed";

const DB_NAME = "biopulse_sounds";
const DB_VERSION = 1;
const STORE = "sounds";

export const ACCEPTED_SOUND_TYPES =
  "audio/*,.mp3,.m4a,.aac,.wav,.ogg,.oga,.opus,.flac,.weba";

interface SoundRecord extends CustomSoundMeta {
  blob: Blob;
}

function hasIndexedDb(): boolean {
  try {
    return typeof indexedDB !== "undefined" && indexedDB !== null;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ *
 * Memory fallback (private browsing / storage blocked)
 * ------------------------------------------------------------------ */

const memory = new Map<string, SoundRecord>();

/* ------------------------------------------------------------------ *
 * Object URL cache
 * ------------------------------------------------------------------ */

const urlCache = new Map<string, string>();

export function revokeSoundUrl(id: string): void {
  const url = urlCache.get(id);
  if (url) {
    URL.revokeObjectURL(url);
    urlCache.delete(id);
  }
}

export function invalidateSoundUrls(): void {
  for (const url of urlCache.values()) URL.revokeObjectURL(url);
  urlCache.clear();
}

function notifyChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(SOUNDS_CHANGED_EVENT));
}

/* ------------------------------------------------------------------ *
 * Database plumbing
 * ------------------------------------------------------------------ */

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (!hasIndexedDb()) return Promise.resolve(null);
  if (dbPromise) return dbPromise;

  dbPromise = new Promise<IDBDatabase | null>((resolve) => {
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      resolve(null);
      return;
    }
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("createdAt", "createdAt", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  }).catch(() => null);

  return dbPromise;
}

function tx<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T | null> {
  return openDb().then(
    (db) =>
      new Promise<T | null>((resolve) => {
        if (!db) {
          resolve(null);
          return;
        }
        let request: IDBRequest<T>;
        try {
          request = run(db.transaction(STORE, mode).objectStore(STORE));
        } catch {
          resolve(null);
          return;
        }
        request.onsuccess = () => resolve(request.result ?? null);
        request.onerror = () => resolve(null);
      }),
  );
}

/* ------------------------------------------------------------------ *
 * Public API
 * ------------------------------------------------------------------ */

function toMeta(record: SoundRecord): CustomSoundMeta {
  return {
    id: record.id,
    name: record.name,
    mime: record.mime,
    size: record.size,
    duration: record.duration,
    createdAt: record.createdAt,
  };
}

export function formatDuration(seconds: number | null): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return "";
  const total = Math.round(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Every stored sound, newest first. There is no limit. */
export async function listCustomSounds(): Promise<CustomSoundMeta[]> {
  const db = await openDb();
  let records: SoundRecord[];

  if (!db) {
    records = Array.from(memory.values());
  } else {
    const rows = await tx<SoundRecord[]>("readonly", (store) => store.getAll() as IDBRequest<SoundRecord[]>);
    records = rows && Array.isArray(rows) ? rows : [];
  }

  return records
    .filter((r) => r && typeof r.id === "string" && r.blob instanceof Blob)
    .map(toMeta)
    .sort((a, b) => b.createdAt - a.createdAt);
}

function generateId(): string {
  return (
    Date.now().toString(36) + Math.random().toString(36).slice(2, 10)
  );
}

function readDuration(url: string): Promise<number | null> {
  return new Promise((resolve) => {
    try {
      const probe = new Audio();
      const done = (value: number | null) => {
        probe.onloadedmetadata = null;
        probe.onerror = null;
        probe.src = "";
        resolve(value);
      };
      probe.onloadedmetadata = () => {
        const d = probe.duration;
        done(Number.isFinite(d) && d > 0 ? d : null);
      };
      probe.onerror = () => done(null);
      probe.src = url;
      // Some engines never fire metadata for exotic codecs — do not block on it.
      setTimeout(() => done(null), 2500);
    } catch {
      resolve(null);
    }
  });
}

export class SoundTooLargeError extends Error {}

/**
 * Stores an uploaded audio file. Accepts anything the device can decode; there is
 * intentionally no count limit, only a per-file size guard so a single huge file
 * cannot wedge storage.
 */
export async function addCustomSound(file: File): Promise<CustomSoundMeta> {
  const MAX_BYTES = 25 * 1024 * 1024;
  if (file.size > MAX_BYTES) {
    throw new SoundTooLargeError(
      `"${file.name}" is ${formatBytes(file.size)}. Keep individual sounds under ${formatBytes(MAX_BYTES)}.`,
    );
  }

  const id = generateId();
  const record: SoundRecord = {
    id,
    name: (file.name || "Custom sound").slice(0, 80),
    mime: file.type || "audio/mpeg",
    size: file.size,
    duration: null,
    createdAt: Date.now(),
    blob: file,
  };

  const probeUrl = URL.createObjectURL(file);
  record.duration = await readDuration(probeUrl);
  URL.revokeObjectURL(probeUrl);

  const db = await openDb();
  if (!db) {
    memory.set(id, record);
  } else {
    await tx("readwrite", (store) => store.put(record) as IDBRequest<IDBValidKey>);
  }

  notifyChanged();
  return toMeta(record);
}

export async function getCustomSoundBlob(id: string): Promise<Blob | null> {
  const db = await openDb();
  if (!db) return memory.get(id)?.blob ?? null;
  const row = await tx<SoundRecord>("readonly", (store) => store.get(id) as IDBRequest<SoundRecord>);
  return row?.blob ?? null;
}

/** Object URL for <audio>/<source>, cached until the sound is deleted. */
export async function getCustomSoundUrl(id: string): Promise<string | null> {
  const cached = urlCache.get(id);
  if (cached) return cached;
  const blob = await getCustomSoundBlob(id);
  if (!blob) return null;
  const url = URL.createObjectURL(blob);
  urlCache.set(id, url);
  return url;
}

export async function deleteCustomSound(id: string): Promise<void> {
  revokeSoundUrl(id);
  memory.delete(id);
  const db = await openDb();
  if (db) await tx("readwrite", (store) => store.delete(id) as unknown as IDBRequest<undefined>);
  notifyChanged();
}

/** True when the sound id is still present — used to repair dangling references. */
export async function customSoundExists(id: string): Promise<boolean> {
  const db = await openDb();
  if (!db) return memory.has(id);
  const row = await tx<SoundRecord>("readonly", (store) => store.get(id) as IDBRequest<SoundRecord>);
  return !!row;
}

export function isCustomSound(sound: string): boolean {
  return typeof sound === "string" && sound.startsWith(CUSTOM_SOUND_PREFIX);
}

export function customSoundId(sound: string): string | null {
  return isCustomSound(sound) ? sound.slice(CUSTOM_SOUND_PREFIX.length) : null;
}

export function soundLabel(
  sound: string,
  sounds: CustomSoundMeta[],
): string {
  if (!isCustomSound(sound)) {
    if (sound === "digital") return "Digital Buzzer";
    if (sound === "bio") return "Bio-Alert Sweep";
    return "Crystal Chimes";
  }
  const id = sound.slice(CUSTOM_SOUND_PREFIX.length);
  const meta = sounds.find((s) => s.id === id);
  return meta ? meta.name : "Missing sound";
}
