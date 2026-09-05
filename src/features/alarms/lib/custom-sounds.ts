// IndexedDB-backed custom alarm sounds.
// Stored in IndexedDB (not localStorage) so there is effectively no file-size
// limit — large mp3/wav clips are persisted offline on the device.

export interface CustomSound {
  id: string;
  name: string;
  mime: string;
  blob: Blob;
  sizeBytes: number;
  createdAt: number;
}

const DB_NAME = "biopulse-custom-sounds";
const STORE = "sounds";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export interface CustomSoundListItem {
  id: string;
  name: string;
  mime: string;
  sizeBytes: number;
  createdAt: number;
  url: string;
}

function readAll(db: IDBDatabase, onlyMeta = false): Promise<CustomSoundListItem[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => {
      const items = (req.result as CustomSound[]) || [];
      resolve(
        items.map((s) => ({
          id: s.id,
          name: s.name,
          mime: s.mime,
          sizeBytes: s.sizeBytes,
          createdAt: s.createdAt,
          url: onlyMeta ? "" : URL.createObjectURL(s.blob),
        })),
      );
    };
    req.onerror = () => reject(req.error);
  });
}

export async function listCustomSounds(onlyMeta = false): Promise<CustomSoundListItem[]> {
  try {
    const db = await openDb();
    return await readAll(db, onlyMeta);
  } catch {
    return [];
  }
}

export async function getCustomSound(id: string): Promise<CustomSound | null> {
  try {
    const db = await openDb();
    return await new Promise((resolve) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(id);
      req.onsuccess = () => resolve((req.result as CustomSound) || null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function saveCustomSound(
  id: string,
  name: string,
  blob: Blob,
): Promise<boolean> {
  try {
    const db = await openDb();
    const record: CustomSound = {
      id,
      name,
      mime: blob.type || "audio/mpeg",
      blob,
      sizeBytes: blob.size,
      createdAt: Date.now(),
    };
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    // Also sync to Android native storage so FullScreenAlarmActivity can play it.
    syncToNative(id, blob);
    return true;
  } catch {
    return false;
  }
}

/**
 * Send the audio blob to the Android Bridge for native alarm playback.
 * The file is transferred in small chunks (256 KB) so a multi-MB MP3 never
 * crosses the JS→native bridge as one huge string (which caused a crash on
 * Android). This is a fire-and-forget — the web alarm ringer always works
 * regardless of native sync.
 */
function syncToNative(id: string, blob: Blob): void {
  try {
    const bridge = (window as any).BioPulseBridge;
    if (
      !bridge ||
      typeof bridge.saveCustomAudioStart !== "function" ||
      typeof bridge.saveCustomAudioChunk !== "function" ||
      typeof bridge.saveCustomAudioEnd !== "function"
    ) {
      return;
    }
    blob
      .arrayBuffer()
      .then((buf) => {
        const bytes = new Uint8Array(buf);
        const CHUNK = 256 * 1024;
        bridge.saveCustomAudioStart(id);
        let binary = "";
        const flush = () => {
          if (!binary) return;
          try {
            bridge.saveCustomAudioChunk(id, binary);
          } catch {
            /* one chunk failing shouldn't break the rest */
          }
          binary = "";
        };
        for (let i = 0; i < bytes.length; i++) {
          binary += String.fromCharCode(bytes[i]);
          if (binary.length >= CHUNK) flush();
        }
        flush();
        try {
          bridge.saveCustomAudioEnd(id);
        } catch {
          /* ignore */
        }
      })
      .catch(() => {
        /* binary read failed — native alarm falls back to default tone */
      });
  } catch {
    // non-Android environment — ignore
  }
}

export async function deleteCustomSound(id: string): Promise<boolean> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    return true;
  } catch {
    return false;
  }
}

export function formatSize(bytes: number): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}