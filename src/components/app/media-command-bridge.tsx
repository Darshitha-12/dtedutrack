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
      // Handled before the YouTube routing: while a video is open every command used to be sent
      // to the player, so a Dismiss button on the alarm notification would have been swallowed by
      // it and the alarm would keep ringing.
            if (command === "dismissAlarm") {
        AudioEngine.stop();
        holdBackgroundPlayback(false);
        window.dispatchEvent(new CustomEvent("biopulse:alarm-dismiss"));
        return;
      }

      // The OS woke the app to ring an alarm. Stop whatever else was making noise first so the
      // alarm tone is not buried under a video, then hand over to the alarm portal. Same ordering
      // rule as the in-app trigger.
      if (command === "ringAlarm") {
        AudioEngine.stop();
        window.dispatchEvent(new CustomEvent("biopulse:alarm-ring"));
        return;
      }


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