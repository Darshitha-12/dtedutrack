/* BioPulse service worker — offline app-shell + asset caching.
 *
 * Navigations are NETWORK-first: the app is a server-rendered Next.js site, so a cached HTML
 * shell pins the browser to an old build (old hashed chunks included) and users keep running
 * yesterday's code after a deploy. The cache is now only an offline fallback. In the background
 * the fresh copy is stored so a later offline visit still works.
 */
const CACHE_NAME = "biopulse-v11";
const OFFLINE_FALLBACK = "/offline.html";

/** How long a navigation waits on the network before the cached page is used instead. */
const NETWORK_TIMEOUT_MS = 6000;

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
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      // The shell is what every offline navigation falls back to, so always fetch it fresh
      // rather than trusting whatever a previous worker left behind.
      try {
        const fresh = await fetch("/", { cache: "reload" });
        if (fresh && fresh.ok) await cache.put("/", fresh);
      } catch {
        /* offline during install: the precache below will fill in what it can */
      }
      await Promise.allSettled(
        PRECACHE.map((url) =>
          cache.add(url).catch(() => {
            /* individual failures must not abort install */
          }),
        ),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      // Make sure the new cache is usable BEFORE retiring the old one. If we are offline the
      // shell cannot be fetched, and deleting the previous cache anyway would leave the user with
      // nothing cached at all — the offline screen with no way back into the app.
      if (!(await cache.match("/"))) {
        try {
          const fresh = await fetch("/", { cache: "reload" });
          if (fresh && fresh.ok) await cache.put("/", fresh);
        } catch {
          /* offline: keep the previous caches */
        }
      }
      if (!(await cache.match("/"))) return; // nothing usable yet, keep every old cache
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

/** Looks in every cache, not just the current one, so a version bump can never strand the user. */
async function matchAnyCache(request) {
  const direct = await caches.match(request);
  if (direct) return direct;
  try {
    const keys = await caches.keys();
    for (const key of keys) {
      const cache = await caches.open(key);
      const hit = await cache.match(request, { ignoreSearch: false });
      if (hit) return hit;
    }
  } catch {
    /* ignore */
  }
  return undefined;
}

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

/**
 * Warms the cache after sign-in. The APK ships no bundled pages (the site is server-rendered, so
 * a static export is not possible), which means offline support depends entirely on what has been
 * visited while online. The page asks for this as soon as the user is actually inside the app, so
 * the study material works on a train or a campus dead spot.
 */
self.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || data.type !== "WARM_CACHE") return;
  const urls = Array.isArray(data.urls) ? data.urls : [];
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await Promise.allSettled(
        urls.map(async (url) => {
          try {
            // Auth-gated pages redirect to /login when the session is missing; caching that
            // redirect would replace a real page with the sign-in screen, so skip those.
            const res = await fetch(url, { credentials: "include" });
            if (!res || !res.ok || res.redirected) return;
            if (res.headers.get("content-type")?.includes("text/html")) {
              await cache.put(url, res);
            }
          } catch {
            /* offline: skip */
          }
        }),
      );
      const clients = await self.clients.matchAll({ type: "window" });
      clients.forEach((c) => c.postMessage({ type: "CACHE_WARMED" }));
    })(),
  );
});

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
      (async () => {
        // Do NOT hand the navigation request straight to fetch(). In an Android WebView a
        // `mode: "navigate"` fetch never settles: the page stays at readyState "loading" forever
        // with an empty document and never renders, even with a working connection. Rebuilding the
        // same GET as a normal request keeps the cookies and headers but sidesteps that path.
        const netRequest = new Request(request.url, {
          method: "GET",
          headers: request.headers,
          credentials: request.credentials,
          redirect: "follow",
        });
        const network = fetch(netRequest, { cache: "no-store" }).then(async (response) => {
          if (!response || !response.ok) throw new Error("bad response");
          try {
            const cache = await caches.open(CACHE_NAME);
            await cache.put(request, response.clone());
          } catch {
            /* cache write must never break the page load */
          }
          return response;
        });
        // A slow connection must not strand the user on a blank screen: fall back to the cache.
        const timeout = new Promise((_, reject) =>
          setTimeout(() => reject(new Error("network timeout")), NETWORK_TIMEOUT_MS),
        );

        try {
          return await Promise.race([network, timeout]);
        } catch {
          const cached = await matchAnyCache(request);
          if (cached) return cached;
          // Next.js client-side routing asks for RSC payloads, not documents. Serve the app
          // shell for those so an offline deep link still boots instead of showing the
          // offline page.
          const shell = await matchAnyCache("/");
          if (shell) return shell;
          return fallbackResponse();
        }
      })(),
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
