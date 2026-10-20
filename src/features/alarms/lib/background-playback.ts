"use client";

/**
 * Keeps the Android foreground media service alive while an alarm or reminder
 * is ringing, so custom MP3 playback survives a backgrounded or locked WebView
 * and shows lock-screen controls. No-op on web.
 */

interface RingBridge {
  setAlarmRinging?: (ringing: boolean, label: string, soundId?: string | null) => void;
  /**
   * Newer APK: same as `setAlarmRinging` plus the spoken announcement. An empty
   * string means "ring silently" — it is how the per-alarm TTS toggle is honoured
   * natively (the legacy method always speaks the label).
   */
  setAlarmRingingSpeech?: (
    ringing: boolean,
    label: string,
    soundId?: string | null,
    speech?: string | null,
  ) => void;
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
 *
 * `speech` is the announcement spoken over the tone (""): pass `null`/omit to let the legacy
 * side speak its default (the label itself), pass `""` to mute the voice, pass the text to speak.
 */
export function holdBackgroundPlayback(
  ringing: boolean,
  label = "Alarm",
  soundId?: string | null,
  speech?: string | null,
): void {
  try {
    const bridge = getBridge();
    if (!bridge) return;
    if (typeof bridge.setAlarmRingingSpeech === "function") {
      bridge.setAlarmRingingSpeech(ringing, label, soundId ?? null, speech ?? null);
      return;
    }
    bridge.setAlarmRinging?.(ringing, label, soundId ?? null);
  } catch {
    /* bridge unavailable (web build, or native side rejected the call) */
  }
}

/** True when the Android layer exists and will ring/speak on its own behalf. */
export function hasNativeRingBridge(): boolean {
  try {
    const bridge = getBridge();
    return !!bridge && typeof bridge.setAlarmRinging === "function";
  } catch {
    return false;
  }
}
