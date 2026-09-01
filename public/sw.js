/* BioPulse service worker — offline app-shell + asset caching */
const CACHE_NAME = "biopulse-v2";
const OFFLINE_FALLBACK = "/offline.html";

// Core static assets to precache on install.
const PRECACHE = [
  "/",
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

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Navigations (HTML pages): cache-first, network update, offline fallback.
  if (request.mode === "navigate") {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request)
            .then((response) => {
              const copy = response.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
              return response;
            })
            .catch(fallbackResponse),
      ),
    );
    return;
  }

  // Static assets: stale-while-revalidate.
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response && response.status === 200 && response.type === "basic") {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});
