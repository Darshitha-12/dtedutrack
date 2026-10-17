"use client";

/**
 * Keeps the Android foreground media service alive while an alarm or reminder
 * is ringing, so custom MP3 playback survives a backgrounded or locked WebView
 * and shows lock-screen controls. No-op on web.
 */

interface RingBridge {
  setAlarmRinging?: (ringing: boolean, label: string, soundId?: string | null) => void;
}

function getBridge(): RingBridge | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { BioPulseBridge?: RingBridge };
  return w.BioPulseBridge ?? null;
}

/**
 * `soundId` must reach the native side with every "start ringing" call: it is how the native
 * fallback tone knows which sound the user picked (a custom file from its native cache, or a
 * built-in tone), instead of ringing a generic system sound.
 */
export function holdBackgroundPlayback(
  ringing: boolean,
  label = "Alarm",
  soundId?: string | null,
): void {
  try {
    getBridge()?.setAlarmRinging?.(ringing, label, soundId ?? null);
  } catch {
    /* bridge unavailable (web build, or native side rejected the call) */
  }
}
