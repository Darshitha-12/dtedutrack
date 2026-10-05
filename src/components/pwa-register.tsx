"use client";

import { useEffect } from "react";
import { BUILD_STAMP } from "@/lib/build-stamp";

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

    if (stored && stored !== BUILD_STAMP) {
      // A deploy we have not seen before. Record it first, otherwise every reload would reset
      // again and the app could never finish loading.
      try {
        window.localStorage.setItem(STAMP_KEY, BUILD_STAMP);
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
