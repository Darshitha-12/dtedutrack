// Device backup for the offline build.
//
// Everything the offline app stores — the client profile/settings in `biopulse_v2` and the whole
// "server" dataset in `biopulse-offline-v1` — lives in the WebView localStorage, which is wiped by
// Android's "Clear data" (or an uninstall). There is no cloud copy, so that wipe used to mean
// permanent data loss. This module keeps a JSON snapshot of every BioPulse localStorage key in the
// public Downloads folder through the native bridge, restores it automatically when the app starts
// with no local data, and refreshes it as the user studies.

"use client";

import { nativeBridge } from "@/lib/native-shell";

const PREFIX = "biopulse";
const EXTRA_KEYS = ["theme"];

export interface BackupFile {
  app: "biopulse";
  version: 1;
  exportedAt: string;
  data: Record<string, string>;
}

function isBackupKey(key: string): boolean {
  return key.startsWith(PREFIX) || EXTRA_KEYS.includes(key);
}

/** Everything worth keeping, as a plain object. */
export function collectBackup(): BackupFile {
  const data: Record<string, string> = {};
  if (typeof window !== "undefined") {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !isBackupKey(key)) continue;
      const value = localStorage.getItem(key);
      if (value != null) data[key] = value;
    }
  }
  return {
    app: "biopulse",
    version: 1,
    exportedAt: new Date().toISOString(),
    data,
  };
}

export function serializeBackup(): string {
  return JSON.stringify(collectBackup());
}

/** Writes a backup snapshot back into localStorage. Returns the number of keys restored. */
export function applyBackup(raw: string): number {
  if (typeof window === "undefined" || !raw) return 0;
  let parsed: BackupFile;
  try {
    parsed = JSON.parse(raw) as BackupFile;
  } catch {
    return 0;
  }
  if (!parsed || parsed.app !== "biopulse" || typeof parsed.data !== "object") return 0;
  let restored = 0;
  for (const [key, value] of Object.entries(parsed.data)) {
    if (!isBackupKey(key) || typeof value !== "string") continue;
    try {
      localStorage.setItem(key, value);
      restored++;
    } catch {
      /* quota — keep restoring the rest */
    }
  }
  return restored;
}

/** True when this device already has study data, so a restore must never run over it. */
export function hasLocalData(): boolean {
  if (typeof window === "undefined") return false;
  return (
    localStorage.getItem("biopulse_v2") != null ||
    localStorage.getItem("biopulse-offline-v1") != null
  );
}

/** Writes the current state to the device backup (public Downloads). Returns true on success. */
export function backupNow(): boolean {
  const native = nativeBridge();
  if (!native?.writeBackup) return false;
  try {
    return native.writeBackup(serializeBackup());
  } catch {
    return false;
  }
}

/** Epoch millis of the newest device backup, or 0 when there is none. */
export function backupTimestamp(): number {
  const native = nativeBridge();
  if (!native?.backupTimestamp) return 0;
  try {
    return native.backupTimestamp();
  } catch {
    return 0;
  }
}

/**
 * Restores the device backup when the app has no local data (e.g. right after "Clear data").
 * Returns the number of keys restored (0 when there was nothing to do).
 */
export function restoreIfEmpty(): number {
  const native = nativeBridge();
  if (!native?.readBackup) return 0;
  if (hasLocalData()) return 0;
  let raw = "";
  try {
    raw = native.readBackup();
  } catch {
    return 0;
  }
  return applyBackup(raw);
}

/**
 * Force-restores the device backup over whatever is on the device now (used by the manual
 * "Restore" button). Returns the number of keys restored.
 */
export function restoreFromDevice(): number {
  const native = nativeBridge();
  if (!native?.readBackup) return 0;
  let raw = "";
  try {
    raw = native.readBackup();
  } catch {
    return 0;
  }
  return applyBackup(raw);
}

let installed = false;
let lastSaved = "";

/** Restore-on-empty + a periodic refresh of the device backup. Idempotent. */
export function installBackup(): void {
  if (typeof window === "undefined" || installed) return;
  const native = nativeBridge();
  if (!native?.readBackup) return;
  installed = true;

  const restored = restoreIfEmpty();
  if (restored > 0) {
    try {
      window.dispatchEvent(new CustomEvent("biopulse:restored", { detail: { restored } }));
    } catch {
      /* no-op */
    }
  }

  lastSaved = serializeBackup();
  const tick = () => {
    try {
      const current = serializeBackup();
      if (current === lastSaved) return;
      if (native.writeBackup?.(current)) lastSaved = current;
    } catch {
      /* never let a backup failure break the app */
    }
  };
  window.setInterval(tick, 20000);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") tick();
  });
  window.addEventListener("pagehide", tick);
}
