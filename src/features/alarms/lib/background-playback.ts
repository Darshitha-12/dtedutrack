"use client";

/**
 * Keeps the Android foreground media service alive while an alarm or reminder
 * is ringing, so custom MP3 playback survives a backgrounded or locked WebView
 * and shows lock-screen controls. No-op on web.
 */

interface RingBridge {
  setAlarmRinging?: (ringing: boolean, label: string) => void;
}

function getBridge(): RingBridge | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { BioPulseBridge?: RingBridge };
  return w.BioPulseBridge ?? null;
}

export function holdBackgroundPlayback(ringing: boolean, label = "Alarm"): void {
  try {
    getBridge()?.setAlarmRinging?.(ringing, label);
  } catch {
    /* bridge unavailable (web build, or native side rejected the call) */
  }
}
