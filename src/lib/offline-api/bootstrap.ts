// Client-side bootstrap for the offline API layer. When NEXT_PUBLIC_OFFLINE_BUILD=1
// (set by scripts/build-offline.mjs) this module patches window.fetch so that same-origin
// /api/* requests are answered locally from the bundled content + localStorage store.
// Non-API requests and the pass-through routes (AI, Telegram, account creation) still go
// to the native fetch and fail offline, which the pages already handle gracefully.
//
// The install runs at module evaluation (before any component effect can fetch) and is
// idempotent, so mounting <OfflineApiBootstrap/> twice is safe.

"use client";

import { useEffect } from "react";
import { captureNativeFetch } from "./runtime";
import { routeApi, isPassThrough } from "./router";
import { installBackup } from "./backup";

const GATED = process.env.NEXT_PUBLIC_OFFLINE_BUILD === "1";

let installed = false;
let nativeFetch: typeof fetch | null = null;

async function readBody(body: BodyInit | null | undefined): Promise<{ text?: string; form?: FormData }> {
  if (body === null || body === undefined) return {};
  if (typeof FormData !== "undefined" && body instanceof FormData) return { form: body };
  if (typeof body === "string") return { text: body };
  if (typeof URLSearchParams !== "undefined" && body instanceof URLSearchParams) {
    return { text: body.toString() };
  }
  if (typeof ArrayBuffer !== "undefined" && body instanceof ArrayBuffer) {
    return { text: new TextDecoder().decode(body) };
  }
  if (typeof ArrayBuffer !== "undefined" && ArrayBuffer.isView(body)) {
    return { text: new TextDecoder().decode(body as ArrayBufferView) };
  }
  if (typeof Blob !== "undefined" && body instanceof Blob) {
    return { text: await body.text() };
  }
  if (typeof ReadableStream !== "undefined" && body instanceof ReadableStream) {
    // Not used anywhere in the app; fall back to native so nothing is silently dropped.
    throw new Error("ReadableStream request bodies are not supported offline");
  }
  return {};
}

async function handle(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const native = nativeFetch!;

  let url = "";
  let method = (init?.method ?? "GET").toUpperCase();
  let text: string | undefined;
  let form: FormData | undefined;

  if (typeof input === "string" || input instanceof URL) {
    url = String(input);
  } else if (typeof Request !== "undefined" && input instanceof Request) {
    url = input.url;
    if (!init?.method) method = (input.method || "GET").toUpperCase();
    if (!init?.body) {
      const r = await readBody(await input.clone().text().catch(() => null));
      text = r.text;
    }
  }

  if (init?.body) {
    const r = await readBody(init.body);
    text = r.text;
    form = r.form;
  }

  let parsed: URL;
  try {
    parsed = new URL(url, window.location.href);
  } catch {
    return native(input, init);
  }

  if (!parsed.pathname.startsWith("/api/")) return native(input, init);
  // Cross-origin API calls (the linked APK proxying chat to the deployed site) must go straight
  // to the network — the offline store only ever knows about this device's own account.
  if (parsed.origin !== window.location.origin) return native(input, init);
  if (isPassThrough(parsed.pathname)) return native(input, init);

  let jsonBody: Record<string, unknown> | null = null;
  const req = {
    method,
    pathname: parsed.pathname,
    query: parsed.searchParams,
    text,
    form,
    json(): Record<string, unknown> {
      if (jsonBody) return jsonBody;
      const raw = text ?? "";
      const parsedBody = JSON.parse(raw) as unknown;
      if (parsedBody === null || typeof parsedBody !== "object" || Array.isArray(parsedBody)) {
        throw new SyntaxError("Unexpected token in JSON");
      }
      jsonBody = parsedBody as Record<string, unknown>;
      return jsonBody;
    },
    urlencoded(): URLSearchParams {
      return new URLSearchParams(text ?? "");
    },
  };

  const { status, body } = await routeApi(req);
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export function install(): void {
  if (!GATED || installed || typeof window === "undefined") return;
  installed = true;
  // Restore a device backup before anything can read the (empty) local store, and start the
  // periodic refresh. No-op in the browser build and when no native bridge is present.
  try {
    installBackup();
  } catch {
    /* backup is best-effort; never block the app */
  }
  nativeFetch = window.fetch.bind(window);
  captureNativeFetch(nativeFetch);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    return handle(input, init);
  };
}

if (GATED && typeof window !== "undefined") {
  install();
}

export function OfflineApiBootstrap(): null {
  useEffect(() => {
    install();
  }, []);
  return null;
}
