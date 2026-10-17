// Shared plumbing for the offline API layer.
//
// The fetch shim (bootstrap.ts) captures the real window.fetch before patching it;
// content assets (e.g. /offline/content.json) must be loaded through that original
// fetch or they would re-enter the shim.

let native: typeof fetch | null = null;

export function captureNativeFetch(f: typeof fetch): void {
  native = f;
}

export function fetchAsset(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  if (!native) return Promise.reject(new Error("offline-api: native fetch not captured"));
  return native(input, init);
}

export function uid(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {
    /* fall through */
  }
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export function dateKeyOf(d: Date): string {
  return d.toISOString().slice(0, 10);
}
