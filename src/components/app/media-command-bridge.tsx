"use client";

import { useEffect } from "react";
import { AudioEngine } from "@/features/alarms/lib/audio-engine";
import { holdBackgroundPlayback } from "@/features/alarms/lib/background-playback";

/**
 * Routes lock-screen notification actions ("play" / "pause" / "stop") to whatever
 * is currently making noise. Mounted once in the app shell so alarms and reminders
 * respond to the same notification controls as the YouTube player.
 */
export function MediaCommandBridge() {
  useEffect(() => {
    const handler = (command: string) => {
      const yt = (window as unknown as { __bp_yt?: (c: string) => void }).__bp_yt;
      if (typeof yt === "function") {
        yt(command);
        return;
      }
      if (command === "play" || command === "keepalive") return;
      AudioEngine.stop();
      holdBackgroundPlayback(false);
      window.dispatchEvent(new CustomEvent("biopulse:media-stop"));
    };

    (window as unknown as { __bp_media?: (c: string) => void }).__bp_media = handler;
    return () => {
      const w = window as unknown as { __bp_media?: (c: string) => void };
      if (w.__bp_media === handler) delete w.__bp_media;
    };
  }, []);

  return null;
}