"use client";
import { nativeBridge, nativeBridgeExt } from '@/lib/native-shell';



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

/**
 * Identifies an audio file from its magic bytes.
 *
 * <p>Returns an empty string for anything unrecognised, including raw DASH/MP4 segments: those look
 * like audio files and load in some players, but they cannot be decoded as one, so it is better to
 * store them honestly than to mislabel them.
 */
function sniffAudioMime(bytes: ArrayBuffer): string {
  if (bytes.byteLength < 4) return "";
  const head = new Uint8Array(bytes, 0, Math.min(16, bytes.byteLength));
  const ascii = (start: number, len: number) =>
    String.fromCharCode(...head.slice(start, start + len));

  if (ascii(0, 3) === "ID3") return "audio/mpeg";
  // MPEG audio frame sync: 11 set bits.
  if (head[0] === 0xff && (head[1] & 0xe0) === 0xe0) return "audio/mpeg";
  if (ascii(0, 4) === "OggS") return "audio/ogg";
  if (ascii(0, 4) === "fLaC") return "audio/flac";
  if (ascii(0, 4) === "RIFF" && ascii(8, 4) === "WAVE") return "audio/wav";
  if (ascii(4, 4) === "ftyp") {
    const brand = ascii(8, 4);
    // `dash` marks a fragmented DASH segment, not a playable audio file.
    if (brand === "dash") return "";
    return "audio/mp4";
  }
  if (ascii(4, 4) === "moov" || ascii(4, 4) === "mdat") return "audio/mp4";
  return "";
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
  })
    .catch(() => null)
    .then((db) => {
      // A failure must not be remembered. Caching a null here made every later save fall back to
      // the in-memory map, which is empty again after a reload — so a sound could be added,
      // shown in the picker, and then vanish while alarms kept pointing at its id.
      if (!db) dbPromise = null;
      return db;
    });

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
        let transaction: IDBTransaction;
        let request: IDBRequest<T>;
        try {
          transaction = db.transaction(STORE, mode);
          request = run(transaction.objectStore(STORE));
        } catch {
          resolve(null);
          return;
        }
        request.onsuccess = () => resolve(request.result ?? null);
        request.onerror = () => resolve(null);
        // For writes, the request succeeding only means the store accepted the value; the data is
        // on disk once the transaction commits. Awaiting that is what stops a save from being
        // lost when the page is reloaded straight afterwards.
        if (mode === "readwrite") {
          transaction.oncomplete = () => resolve(request.result ?? null);
          transaction.onabort = () => resolve(null);
          transaction.onerror = () => resolve(null);
        }
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

/**
 * Writes the sound into the app's private storage so the native alarm player can ring from it.
 *
 * <p>Returns whether the bytes actually landed. The old version swallowed every failure and the
 * caller marked the id as "checked" regardless, so one failed write (bridge hiccup, missing blob)
 * left the sound permanently uncopied until an app restart — with the alarm then falling back to
 * the system ringtone every time. Callers now retry on false.
 */
async function saveToNative(id: string, bytes: ArrayBuffer, mime: string): Promise<boolean> {
  try {
    const b = nativeBridgeExt();
    if (!b) return false;
    const u8 = new Uint8Array(bytes);
    // Preferred path: transfer in 256KB chunks. One giant base64 string through the Java bridge
    // is where this used to die silently on low-memory devices — the argument conversion holds
    // the whole thing in memory several times over. Chunks stay small, each one is acknowledged,
    // and the native side only registers the file after verifying the total length.
    if (b.beginCustomSound && b.appendCustomSound && b.endCustomSound) {
      if (!b.beginCustomSound(id, mime || "audio/mpeg")) {
        console.warn("[native-sound] beginCustomSound failed for", id);
        return false;
      }
      const CHUNK = 256 * 1024;
      for (let off = 0; off < u8.length; off += CHUNK) {
        const slice = u8.subarray(off, Math.min(off + CHUNK, u8.length));
        let binary = "";
        for (let i = 0; i < slice.length; i++) binary += String.fromCharCode(slice[i]);
        if (!b.appendCustomSound(btoa(binary))) {
          console.warn("[native-sound] appendCustomSound failed at byte", off, "of", u8.length);
          return false;
        }
      }
      if (!b.endCustomSound(id, u8.length)) {
        console.warn("[native-sound] endCustomSound rejected for", id);
        return false;
      }
      console.info("[native-sound] chunked copy complete for", id, u8.length, "bytes");
      return true;
    }
    // Fallback for older bridges: single-shot write.
    if (!b.saveCustomSound) return false;
    let binary = "";
    for (let i = 0; i < u8.length; i++) binary += String.fromCharCode(u8[i]);
    const saved = b.saveCustomSound(id, btoa(binary), mime || "audio/mpeg");
    if (saved !== true) {
      console.warn("[native-sound] saveCustomSound reported failure for", id);
      return false;
    }
    return true;
  } catch (e) {
    console.warn("[native-sound] native save failed for", id, e);
    return false;
  }
}
export async function addCustomSound(file: File): Promise<CustomSoundMeta> {
  const MAX_BYTES = 25 * 1024 * 1024;
  if (file.size > MAX_BYTES) {
    throw new SoundTooLargeError(
      `"${file.name}" is ${formatBytes(file.size)}. Keep individual sounds under ${formatBytes(MAX_BYTES)}.`,
    );
  }

  const id = generateId();

  // Work out the real type from the bytes rather than believing the picker. Android WebView hands
  // over plenty of files with an empty type, and forcing `audio/mpeg` onto whatever arrived
  // mislabelled things badly: a `ftypdash` container is not an MP3, and calling it one left the
  // sound unplayable. Guessing wrong is worse than admitting nothing is known.
  let bytes: ArrayBuffer;
  try {
    bytes = await file.arrayBuffer();
  } catch {
    bytes = new ArrayBuffer(0);
  }
  const sniffed = sniffAudioMime(bytes);
  const type = sniffed || (file.type.startsWith("audio/") ? file.type : "");
  let blob: Blob = type ? new Blob([bytes], { type }) : new Blob([bytes]);

  const record: SoundRecord = {
    id,
    name: (file.name || "Custom sound").slice(0, 80),
    mime: type || "application/octet-stream",
    size: blob.size,
    duration: null,
    createdAt: Date.now(),
    blob,
  };

  const probeUrl = URL.createObjectURL(blob);
  record.duration = await readDuration(probeUrl);
  URL.revokeObjectURL(probeUrl);

  const db = await openDb();
  if (!db) {
    memory.set(id, record);
  } else {
    await tx("readwrite", (store) => store.put(record) as IDBRequest<IDBValidKey>);
    // Read it back before reporting success. A sound that only ever existed in memory looked
    // perfectly fine in the picker and then played nothing, so an unverifiable save has to be
    // treated as a failure the user can see.
    const stored = await getCustomSoundBlob(id);
    if (!stored) {
      memory.delete(id);
      throw new Error("The sound could not be saved on this device.");
    }
    record.size = stored.size;
  }

  // Push a native copy straight away instead of waiting for the next scheduler publish: with the
  // app closed, the native player can only ring from its own copy of the file. Best effort — the
  // scheduler re-pushes (and retries) on every publish until native confirms the file exists.
  if (bytes.byteLength > 0) {
    nativeCopyAttemptedAt.set(id, Date.now());
    nativeCopySaving.add(id);
    void saveToNative(id, bytes, record.mime).then((ok) => {
      if (ok) nativeCopyChecked.add(id);
    }).finally(() => nativeCopySaving.delete(id));
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

/**
 * Raw bytes of a stored sound.
 *
 * <p>Preferred by the audio engine over an object URL: decoding straight from the bytes means the
 * engine never has to hold — or revoke — a URL that the shared cache also hands to `<audio>`
 * elements. Revoking a URL the cache still owns left it pointing at dead bytes, so every playback
 * after the first was silent.
 */
export async function getCustomSoundBytes(id: string): Promise<ArrayBuffer | null> {
  const blob = await getCustomSoundBlob(id);
  if (!blob) return null;
  try {
    return await blob.arrayBuffer();
  } catch {
    return null;
  }
}

const nativeCopyChecked = new Set<string>();
/** Last transfer attempt per id — retries run at most every 10s, not on every scheduler tick. */
const nativeCopyAttemptedAt = new Map<string, number>();
/** Ids mid-transfer, so the add-time push and the scheduler retry can never interleave writes. */
const nativeCopySaving = new Set<string>();

/**
 * Makes sure the sound also exists in the app's native storage.
 *
 * <p>With the app closed the WebView is gone, so the native side rings the alarm instead — but it
 * can only play a custom file it has a copy of. Sounds saved before the native cache existed (or
 * while it failed) would otherwise fall back to a generic tone, so the copy is (re)pushed here the
 * first time a sound is handed to the OS scheduler. Idempotent and best-effort.
 */
export async function ensureNativeSoundCopy(id: string): Promise<void> {
  if (!id || nativeCopyChecked.has(id)) return;
  if (nativeCopySaving.has(id)) return;
  const last = nativeCopyAttemptedAt.get(id) ?? 0;
  if (Date.now() - last < 10_000) return;
  nativeCopyAttemptedAt.set(id, Date.now());
  nativeCopySaving.add(id);
  try {
    const b = nativeBridgeExt();
    // Not present: leave the id unmarked so the next scheduler publish tries again.
    if (!b?.saveCustomSound || !b?.hasCustomSound) return;
    if (b.hasCustomSound(id)) {
      nativeCopyChecked.add(id);
      return;
    }
    const blob = await getCustomSoundBlob(id);
    if (!blob) return;
    const bytes = await blob.arrayBuffer();
    const saved = await saveToNative(id, bytes, blob.type || "");
    // Mark as done only once the file is verifiably on disk; anything else stays retryable,
    // because with the app closed a missing copy is exactly what turns the selected sound into
    // the generic system ringtone.
    if (saved && b.hasCustomSound(id)) {
      nativeCopyChecked.add(id);
      console.info("[native-sound] native copy ready for", id, bytes.byteLength, "bytes");
    } else {
      console.warn("[native-sound] native copy NOT ready for", id, "- will retry on next publish");
    }
  } catch (e) {
    console.warn("[native-sound] ensure failed for", id, e);
  } finally {
    nativeCopySaving.delete(id);
  }
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
