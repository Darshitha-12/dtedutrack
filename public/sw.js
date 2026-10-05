/* BioPulse service worker — offline app-shell + asset caching.
 *
 * Navigations are NETWORK-first: the app is a server-rendered Next.js site, so a cached HTML
 * shell pins the browser to an old build (old hashed chunks included) and users keep running
 * yesterday's code after a deploy. The cache is now only an offline fallback. In the background
 * the fresh copy is stored so a later offline visit still works.
 */
const CACHE_NAME = "biopulse-v10";
const OFFLINE_FALLBACK = "/offline.html";

// Core static assets to precache on install.
const PRECACHE = [
  "/",
  "/dashboard",
  "/alarms",
  "/reminders",
  "/focus",
  "/planner",
  "/notes",
  "/note-pad",
  "/flashcards",
  "/past-papers",
  "/exam-marks",
  "/fees",
  "/mistakes",
  "/questions",
  "/practice",
  "/topics",
  "/search",
  "/diagrams",
  "/analytics",
  "/work-log",
  "/ai-timetable",
  "/ai-tutor",
  "/downloads",
  "/telegram",
  "/onboarding",
  "/profile",
  "/settings",
  "/chat",
  "/manifest.json",
  "/icon-192.png",
  "/icon-512.png",
  "/apple-touch-icon.png",
  "/offline.html",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) =>
        Promise.allSettled(
          PRECACHE.map((url) =>
            cache.add(url).catch(() => {
              /* individual failures must not abort install */
            }),
          ),
        ),
      )
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

function fallbackResponse() {
  return caches.match(OFFLINE_FALLBACK).then(
    (r) =>
      r ||
      new Response(
        `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>BioPulse — Offline</title><style>body{background:#030F0C;color:#e5f5ee;font-family:system-ui;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;text-align:center;padding:24px}h1{margin:0 0 10px}p{color:#9fb9ae;margin:0}</style></head><body><div><h1>🧬 BioPulse</h1><p>You're offline. Connect to the internet, or open the app once online to cache it.</p></div></body></html>`,
        { headers: { "Content-Type": "text/html; charset=utf-8" } },
      ),
  );
}

function refreshNavigation(req) {
  fetch(req)
    .then(async (response) => {
      if (!response || !response.ok) return;
      const cache = await caches.open(CACHE_NAME);
      await cache.put(req, response);
    })
    .catch(() => {});
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Never intercept API calls — they must always hit the network so cookies,
  // CSRF tokens and fresh data reach the page. Serving a cached copy of
  // /api/auth/csrf would hand the login flow a stale token without its
  // Set-Cookie, causing "MissingCSRF" on sign-in.
  if (url.pathname.startsWith("/api/")) return;

  // Navigations (HTML pages): always prefer the network so deploys are picked up immediately,
  // and fall back to the cached copy (then the bundled offline page) when unreachable.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then(async (response) => {
          if (!response || !response.ok) throw new Error("bad response");
          try {
            const cache = await caches.open(CACHE_NAME);
            await cache.put(request, response.clone());
          } catch {
            /* cache write must never break the page load */
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          if (cached) return cached;
          const shell = await caches.match("/");
          if (shell) return shell;
          return fallbackResponse();
        }),
    );
    return;
  }

  // Static assets: stale-while-revalidate. Hashed chunk URLs change on every
  // build, so a stale match only ever serves content for the current version.
  event.respondWith(
    caches.match(request).then(async (cached) => {
      const network = fetch(request)
        .then(async (response) => {
          if (response && response.status === 200 && response.type === "basic") {
            try {
              const copy = response.clone();
              const cache = await caches.open(CACHE_NAME);
              await cache.put(request, copy);
            } catch {
              /* cache write must never break the asset load */
            }
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});
