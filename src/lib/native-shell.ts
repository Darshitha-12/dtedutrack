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
 * So the APK must run *without* a service worker. Offline for the installed app has to be solved by
 * bundling pages into the APK instead, which is not possible while the site is server-rendered.
 */
export function isNativeApp(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as unknown as {
    Capacitor?: { isNative?: () => boolean };
    CapacitorBridge?: unknown;
  };
  try {
    if (typeof w.Capacitor?.isNative === "function") return w.Capacitor.isNative();
  } catch {
    /* fall through to the bridge check */
  }
  return Boolean(w.CapacitorBridge);
}
