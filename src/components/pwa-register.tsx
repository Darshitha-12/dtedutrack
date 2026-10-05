"use client";

import { useEffect } from "react";
import { BUILD_STAMP } from "@/lib/build-stamp";
import { OFFLINE_ROUTES } from "@/lib/offline-routes";
import { isNativeApp } from "@/lib/native-shell";

const STAMP_KEY = "bp_build_stamp";

/**
 * Keeps the cached app in sync with the deploy the browser is actually running.
 *
 * A service worker cache is the one thing in this app that can silently pin a phone to an old
 * build (or leave it with an empty cache after a version bump, which showed the offline screen
 * instead of the app). So on every load we compare a build stamp with the one we stored; if they
 * differ we drop every cache and reload once. That makes stale-cache states self-healing instead
 * of something the user has to clear by hand.
 */
export function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") return;

    // No service worker inside the Android app. Measured twice on a Galaxy A01 Core (Android 10,
    // WebView 156): a worker that answers navigations leaves the WebView stuck at
    // readyState "loading" with an empty document, and a worker that only passes them through
    // fails the navigation outright ("Web page not available"). Both leave the user with an
    // unusable app, which is far worse than having no offline mode, so the APK runs without one
    // and any worker left over from an earlier install is removed.
    if (isNativeApp()) {
      void (async () => {
        try {
          const regs = await navigator.serviceWorker.getRegistrations();
          await Promise.all(regs.map((r) => r.unregister()));
          if ("caches" in window) {
            const keys = await caches.keys();
            await Promise.all(keys.map((k) => caches.delete(k)));
          }
          window.localStorage.setItem(STAMP_KEY, BUILD_STAMP);
        } catch {
          /* ignore */
        }
      })();
      return;
    }

    let active = true;
    const onMessage = (e: MessageEvent) => {
      if (e.data && e.data.type === "NEW_VERSION") {
        if (!active) return;
        // Never reload while an editable element has focus — a mid-keystroke
        // reload closes the on-screen keyboard on mobile.
        const el = document.activeElement as HTMLElement | null;
        if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) {
          return;
        }
        window.location.reload();
      }
    };
    navigator.serviceWorker.addEventListener("message", onMessage);

    // Once the user is actually inside the app (i.e. signed in), ask the worker to cache the
    // study pages so they keep working without a connection.
    const warm = () => {
      if (window.location.pathname === "/login") return;
      navigator.serviceWorker.ready
        .then((reg) => {
          const worker = reg.active || navigator.serviceWorker.controller;
          worker?.postMessage({ type: "WARM_CACHE", urls: OFFLINE_ROUTES });
        })
        .catch(() => {});
    };
    if (document.readyState === "complete") {
      window.setTimeout(warm, 2500);
    } else {
      window.addEventListener("load", () => window.setTimeout(warm, 2500), { once: true });
    }

    const hardReset = async () => {
      try {
        if ("caches" in window) {
          const keys = await caches.keys();
          await Promise.all(keys.map((k) => caches.delete(k)));
        }
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
      } catch {
        /* ignore */
      }
      window.location.reload();
    };

    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(STAMP_KEY);
    } catch {
      /* ignore */
    }

    // At most one reset per session. Without this guard a browser that refuses to persist
    // localStorage would reset on every single load and the app could never finish starting.
    const sessionKey = STAMP_KEY + "_reset";
    let alreadyReset = false;
    try {
      alreadyReset = window.sessionStorage.getItem(sessionKey) === BUILD_STAMP;
    } catch {
      /* ignore */
    }

    if (stored && stored !== BUILD_STAMP && !alreadyReset) {
      try {
        window.localStorage.setItem(STAMP_KEY, BUILD_STAMP);
        window.sessionStorage.setItem(sessionKey, BUILD_STAMP);
      } catch {
        /* ignore */
      }
      void hardReset();
      return () => {
        active = false;
        navigator.serviceWorker.removeEventListener("message", onMessage);
      };
    }

    try {
      window.localStorage.setItem(STAMP_KEY, BUILD_STAMP);
    } catch {
      /* ignore */
    }

    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => {
        reg.addEventListener("updatefound", () => {
          const worker = reg.installing;
          if (!worker) return;
          worker.addEventListener("statechange", () => {
            if (worker.state === "installed" && navigator.serviceWorker.controller) {
              // new version available
            }
          });
        });
      })
      .catch(() => {});

    return () => {
      active = false;
      navigator.serviceWorker.removeEventListener("message", onMessage);
    };
  }, []);

  return null;
}
