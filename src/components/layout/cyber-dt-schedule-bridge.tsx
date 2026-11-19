"use client";

import { useEffect } from "react";

/**
 * Keeps the schedule side of the app awake while the student studies.
 *
 * Alarms and reminders are fired by {@link AlarmPortal} / {@link ReminderPortal},
 * which already poll localStorage. This lightweight bridge:
 *   1. nudges those portals once a minute so a tab that was throttled in the
 *      background catches up as soon as it is focused again, and
 *   2. asks for notification permission on the first tap, so an alarm or
 *      reminder set from Cyber DT can also raise a system notification.
 *
 * It renders nothing and never owns any alarm state — the portals stay the
 * single source of truth.
 */
export function CyberDTScheduleBridge() {
  useEffect(() => {
    let asked = false;
    const askForNotifications = () => {
      if (asked) return;
      asked = true;
      try {
        if ("Notification" in window && Notification.permission === "default") {
          void Notification.requestPermission();
        }
      } catch {
        /* notifications unavailable in this shell */
      }
    };
    window.addEventListener("pointerdown", askForNotifications, { once: true });

    const nudge = () => {
      try {
        window.dispatchEvent(new Event("biopulse:reminders-changed"));
        window.dispatchEvent(new Event("biopulse:alarms-changed"));
      } catch {
        /* no window */
      }
    };
    const interval = setInterval(nudge, 60_000);

    return () => {
      clearInterval(interval);
      window.removeEventListener("pointerdown", askForNotifications);
    };
  }, []);

  return null;
}
