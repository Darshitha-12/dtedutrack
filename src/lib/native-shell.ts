/** The Java bridge MainActivity injects. Only these methods exist on it. */
export interface NativeBridge {
  scheduleAlarm?(epochMillis: number, label: string): void;
  ringAlarmNow?(label: string): void;
  saveForOffline?(jsonArray: string): void;
  offlineCacheStats?(): string;
  clearOfflineCache?(): void;
  setAlarmRinging?(ringing: boolean, label: string): void;
  setKeepScreenOn?(keepOn: boolean): void;
  previewSound?(): void;
  stopNativeTone?(): void;
}

/** The bridge, or `null` in a browser. */
export function nativeBridge(): NativeBridge | null {
  if (typeof window === "undefined") return null;
  return ((window as unknown as { BioPulseBridge?: NativeBridge }).BioPulseBridge) ?? null;
}

/**
 * Detects the Capacitor native shell (the Android APK).
 *
 * This app's WebView loads its UI from the deployed site over https, so `navigator.serviceWorker`
 * is *available* inside the APK — but it does not work there. A worker that intercepts the
 * top-level navigation wedges the WebView: the page sits at `readyState === "loading"` forever with
 * an empty document, and even with a working connection the app renders the offline screen. Verified
 * on a Galaxy A01 Core (Android 10, WebView 156): unregistering the worker made the very same
 * request load instantly.
 *
 * So the APK must run *without* a service worker. Offline for the installed app is handled natively
 * instead: `OfflineCache` saves pages to device storage while online and serves them back through
 * `shouldInterceptRequest` when there is no network.
 */
export function isNativeApp(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as unknown as {
    Capacitor?: { isNative?: () => boolean };
    CapacitorBridge?: unknown;
    BioPulseBridge?: unknown;
  };
  // `BioPulseBridge` is injected by MainActivity via addJavascriptInterface, so its presence is
  // proof we are inside the APK. The `Capacitor` globals are *not* reliable here: with
  // server.url pointing at the deployed site the bundle's Capacitor runtime never populates them,
  // which silently re-enabled the worker inside the app.
  if (w.BioPulseBridge) return true;
  try {
    if (typeof w.Capacitor?.isNative === "function") return w.Capacitor.isNative();
  } catch {
    /* fall through to the bridge check */
  }
  return Boolean(w.CapacitorBridge);
}
