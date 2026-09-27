"use client";

import { useEffect } from "react";

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
