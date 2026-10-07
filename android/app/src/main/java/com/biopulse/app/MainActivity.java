package com.biopulse.app;

import android.Manifest;
import android.app.PictureInPictureParams;
import android.content.pm.ActivityInfo;
import android.content.res.Configuration;
import android.graphics.Color;
import android.util.Log;
import android.util.Rational;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.activity.OnBackPressedCallback;
import android.widget.FrameLayout;

import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebChromeClient;

import java.lang.ref.WeakReference;
import java.util.HashMap;
import java.util.Map;

/**
 * Hosts the Capacitor bridge and adds:
 *
 * 1. Background / lock-screen media playback — the WebView audio pipeline is routed through
 *    a {@code mediaPlayback} foreground service so YouTube keeps playing after the app is
 *    backgrounded or the screen is locked. The web layer reports state through
 *    {@code window.BioPulseBridge.ytState(state, title)}.
 * 2. Native fullscreen video — {@code onShowCustomView} puts the player in a dedicated
 *    overlay with the system bars hidden and the screen rotated to landscape.
 * 3. Auto picture-in-picture — leaving the app mid-playback drops the activity into PiP so the
 *    WebView window stays VISIBLE. That matters because the YouTube embed suspends itself (and
 *    then ignores programmatic {@code playVideo}) as soon as its document reports hidden, which
 *    is why plain background playback kept going silent.
 */
public class MainActivity extends BridgeActivity {

    private static final String STATE_FULLSCREEN = "bp_fullscreen_active";
    private static WeakReference<MainActivity> current = new WeakReference<>(null);

    private FrameLayout fullscreenOverlay;
    private View fullscreenView;
    private WebChromeClient.CustomViewCallback fullscreenCallback;
    private int preFullscreenOrientation = ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED;
    private int preFullscreenVisibility = 0;
    private boolean mediaCommandPending = false;
    private String mediaCommand = "";

    /** Invoked from {@link MediaPlaybackService} on the main thread. */
    static void dispatchMediaCommand(String command) {
        MainActivity activity = current.get();
        if (activity == null) return;
        activity.runOnUiThread(() -> activity.sendMediaCommand(command));
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        if (current.get() == null) current = new WeakReference<>(this);

        // Back gestures do not reach onBackPressed() any more, so the dispatcher callback is what
        // actually runs on Android 13+ and on the predictive-back gesture.
        try {
            getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
                @Override
                public void handleOnBackPressed() {
                    if (fullscreenView != null) {
                        exitFullscreen(true);
                        return;
                    }
                    // Nothing of ours is open, so let the app close as it normally would.
                    finish();
                }
            });
        } catch (Throwable ignored) {
        }

        WebView webView = getBridge().getWebView();
        WebSettings settings = webView.getSettings();
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setJavaScriptCanOpenWindowsAutomatically(true);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);

        // Capacitor never calls WebView#onPause, so the media pipeline keeps running while
        // backgrounded. MediaPlaybackService supplies the mediaPlayback foreground process
        // (process priority + lock-screen controls) and a partial wakelock (CPU stays awake
        // after the screen turns off).
        webView.setBackgroundColor(Color.parseColor("#07061A"));

        // Android freezes/throttles the WebView's renderer process once the app is no longer
        // visible, which kills the YouTube iframe's audio track the moment the user leaves the
        // app. Marking the renderer important keeps it scheduled so background playback survives.
        // API 26+ only — on older releases the method does not exist.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            try {
                webView.setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, false);
            } catch (Throwable ignored) {
            }
        }

        webView.addJavascriptInterface(new JsBridge(), "BioPulseBridge");
        webView.setWebChromeClient(new FullscreenChromeClient(getBridge()));
        webView.setWebViewClient(new OfflineFallbackClient(this, webView));

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            try {
                webView.setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, false);
            } catch (Throwable ignored) {
            }
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            try {
                requestPermissions(new String[] { Manifest.permission.POST_NOTIFICATIONS }, 9001);
            } catch (Exception ignored) {
            }
        }
    }

    @Override
    public void onResume() {
        super.onResume();
        // Returning from the home screen can leave the WebView audio sink dead even though video
        // keeps rendering (the player looks stuck in silence until the app is killed).
        // onResume() re-arms the WebView media pipeline. Deliberately NOT calling
        // WebView#onPause() in onPause(): it risks throttling the JS timers that drive the
        // alarm/reminder polls, and background playback already works without it.
        try {
            WebView webView = getBridge().getWebView();
            if (webView != null) webView.onResume();
        } catch (Exception ignored) {
        }
        if (mediaCommandPending) {
            mediaCommandPending = false;
            sendMediaCommand(mediaCommand);
        }
    }

    @Override
    public void onPause() {
        // Keep WebView media alive: re-assert the foreground service while anything plays.
        if (MediaPlaybackService.isPlaying()) {
            MediaPlaybackService.ensureRunning(this);
        }
        super.onPause();
    }

    /**
     * Fired when the user leaves via Home/Recents (not for programmatic finishes). Dropping into
     * PiP here is the only sanctioned way to keep a WebView-hosted video audible in the
     * background: the activity window remains visible, so the embed never sees itself as hidden.
     */
    @Override
    public void onUserLeaveHint() {
        boolean wants = MediaPlaybackService.hasPlaybackIntent();
        Log.i("BioPulseMedia", "onUserLeaveHint intent=" + wants + " playing=" + MediaPlaybackService.isPlaying());
        if (wants) {
            enterPip();
        }
        super.onUserLeaveHint();
    }

    private void enterPip() {
        try {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
            if (isInPictureInPictureMode()) return;
            if (!getPackageManager().hasSystemFeature(
                    android.content.pm.PackageManager.FEATURE_PICTURE_IN_PICTURE)) {
                return;
            }
            // 16:9 matches the player; anything else gets letterboxed by the system.
            PictureInPictureParams.Builder b =
                    new PictureInPictureParams.Builder()
                            .setAspectRatio(new Rational(16, 9));
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                b.setAutoEnterEnabled(true);
                b.setSeamlessResizeEnabled(true);
            }
            enterPictureInPictureMode(b.build());
            Log.i("BioPulseMedia", "entered PiP for background audio");
        } catch (Throwable t) {
            Log.w("BioPulseMedia", "PiP refused", t);
        }
    }

    @Override
    public void onPictureInPictureModeChanged(boolean inPipMode, Configuration newConfig) {
        super.onPictureInPictureModeChanged(inPipMode, newConfig);
        Log.i("BioPulseMedia", "onPictureInPictureModeChanged " + inPipMode);
        // Leaving PiP (user closed the window or tapped restore) must not strand the service.
        if (!inPipMode && !MediaPlaybackService.isPlaying()) {
            MediaPlaybackService.stop(this);
        }
    }

    @Override
    public void onTrimMemory(int level) {
        // Distinguishes "Activity destroyed under memory pressure" from "renderer frozen" when
        // background playback drops — both look identical from the user's side.
        Log.i("BioPulse", "onTrimMemory level=" + level + " playing=" + MediaPlaybackService.isPlaying());
        super.onTrimMemory(level);
    }

    @Override
    public void onLowMemory() {
        Log.i("BioPulse", "onLowMemory playing=" + MediaPlaybackService.isPlaying());
        super.onLowMemory();
    }

    @Override
    public void onDestroy() {
        MediaPlaybackService.stop(this);
        exitFullscreen(false);
        if (current.get() == this) current = new WeakReference<>(null);
        super.onDestroy();
    }

    @Override
    public void onConfigurationChanged(Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        if (fullscreenView != null) {
            ViewGroup parent = (ViewGroup) fullscreenView.getParent();
            if (parent != null) {
                parent.removeView(fullscreenView);
                if (fullscreenOverlay != null) fullscreenOverlay.addView(fullscreenView);
            }
        }
    }

    private void sendMediaCommand(String command) {
        try {
            WebView webView = getBridge() != null ? getBridge().getWebView() : null;
            if (webView == null) return;
            String js =
                "(function(){try{" +
                "if(typeof window.__bp_media==='function'){window.__bp_media('" +
                command +
                "');return 'js';}" +
                "if(typeof window.__bp_yt==='function'){window.__bp_yt('" +
                command +
                "');return 'js';}" +
                "if(typeof window.BioPulseBridge!=='undefined'){window.BioPulseBridge.__ready&&window.BioPulseBridge.__ready();" +
                "return 'native';}" +
                "return 'none';}catch(e){return 'err';}})()";
            webView.evaluateJavascript(js, value -> {
                if (value != null && value.contains("js")) return;
                // No handler was mounted yet (e.g. app resumed from cold start) — retry later.
                mediaCommand = command;
                mediaCommandPending = true;
            });
        } catch (Exception ignored) {
            // WebView torn down mid-dispatch — nothing to control.
        }
    }

    private class JsBridge {

        @JavascriptInterface
        public void ytState(String state, String title) {
            MediaPlaybackService.update(MainActivity.this, state, title);
        }

        @JavascriptInterface
        public void ytProgress(final double positionSeconds, final double durationSeconds) {
            if (!Double.isFinite(positionSeconds) || !Double.isFinite(durationSeconds)) return;
            MediaPlaybackService.reportProgress(
                (long) (positionSeconds * 1000.0),
                (long) (durationSeconds * 1000.0)
            );
        }

        /** Diagnostics from the player page — surfaced under the BioPulseMedia tag. */
        @JavascriptInterface
        public void log(final String message) {
            Log.i("BioPulseMedia", "web: " + message);
        }

        /**
         * Lets a sound selected in the picker be heard straight away.
         *
         * <p>The page renders the preview with Web Audio, and on this WebView an AudioTrack built
         * that way stays muted while the app holds no audio focus — selecting a sound produced no
         * sound at all. Grabbing focus for the length of the preview is what makes it audible, and
         * it is released again afterwards so a preview never keeps the alarm focus.
         */
        @JavascriptInterface
        public void previewSound() {
            MediaPlaybackService.previewTone(MainActivity.this);
        }

        /**
         * Stands the native fallback tone down once the page has started playing the chosen sound.
         */
        @JavascriptInterface
        public void stopNativeTone() {
            MediaPlaybackService.stopNativeAlarmTone();
        }

        /** User-driven "keep the audio coming" signal; survives the embed pausing itself. */
        @JavascriptInterface
        public void playbackIntent(final boolean active) {
            MediaPlaybackService.setPlaybackIntent(MainActivity.this, active);
        }

        @JavascriptInterface
        public void setAlarmRinging(final boolean ringing, final String label) {
            runOnUiThread(() -> {
                if (ringing) {
                    MediaPlaybackService.startAlarm(MainActivity.this, label);
                } else {
                    MediaPlaybackService.stopAlarm(MainActivity.this);
                }
            });
        }

        @JavascriptInterface
        public void setKeepScreenOn(final boolean keepOn) {
            runOnUiThread(() -> {
                if (keepOn) {
                    getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                } else {
                    getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                }
            });
        }

        /**
         * Hands the next alarm time to the OS so it rings even when the app is not running. The
         * page only ever schedules one alarm ahead, which is all that is needed: it republishes the
         * following alarm the moment this one is acknowledged.
         *
         * @param epochMillis absolute wall-clock time the alarm is due, 0 to cancel.
         */
        @JavascriptInterface
        public void scheduleAlarm(final double epochMillis, final String label) {
            final long at = (long) epochMillis;
            runOnUiThread(() -> {
                if (at <= 0L) {
                    AlarmScheduler.cancel(MainActivity.this);
                } else {
                    AlarmScheduler.schedule(MainActivity.this, at, label);
                }
            });
        }

        /** Lets the page force an immediate ring, e.g. while testing or after a manual "ring now". */
        @JavascriptInterface
        public void ringAlarmNow(final String label) {
            runOnUiThread(() -> MediaPlaybackService.startAlarm(MainActivity.this, label));
        }

        /**
         * Saves the given URLs to native storage so the app still opens without a network. Runs on
         * a background thread and reports back through {@code window.__bp_offline_saved} so the
         * Settings card can show progress instead of pretending to work.
         *
         * @param jsonArray a JSON array of absolute URLs.
         */
        @JavascriptInterface
        public void saveForOffline(final String jsonArray) {
            final String[] urls;
            try {
                org.json.JSONArray arr = new org.json.JSONArray(jsonArray);
                urls = new String[arr.length()];
                for (int i = 0; i < arr.length(); i++) urls[i] = arr.getString(i);
            } catch (Throwable t) {
                Log.w("BioPulseCache", "bad save request: " + t.getMessage());
                return;
            }

            new Thread(() -> {
                int saved = 0;
                long bytes = 0;
                for (String url : urls) {
                    bytes += OfflineCache.save(MainActivity.this, url);
                    if (bytes > 0) saved++;
                    notifyOfflineSaved(saved, urls.length, bytes);
                }
                notifyOfflineSaved(saved, urls.length, bytes);
                Log.i("BioPulseCache", "save finished: " + saved + "/" + urls.length + " (" + bytes + " bytes)");
            }, "offline-save").start();
        }

        /** {@code {"count":n,"bytes":n}} for the settings card. */
        @JavascriptInterface
        public String offlineCacheStats() {
            return OfflineCache.stats(MainActivity.this);
        }

        /** Removes every saved page, e.g. after signing out. */
        @JavascriptInterface
        public void clearOfflineCache() {
            new Thread(() -> OfflineCache.clear(MainActivity.this), "offline-clear").start();
        }

        private void notifyOfflineSaved(int saved, int total, long bytes) {
            final String json = "{\"saved\":" + saved + ",\"total\":" + total
                    + ",\"bytes\":" + bytes + "}";
            runOnUiThread(() -> {
                try {
                    WebView webView = getBridge() != null ? getBridge().getWebView() : null;
                    if (webView == null) return;
                    webView.evaluateJavascript(
                            "window.dispatchEvent(new CustomEvent('biopulse:offline-saved',{detail:"
                                    + json + "}));", null);
                } catch (Throwable ignored) {
                }
            });
        }
    }

    /**
     * Serves saved pages when the device is offline, and stays completely out of the way when it is
     * not.
     *
     * <p>While online this returns {@code null} for every request, which is the WebView's default
     * behaviour, so the normal load path is untouched. Returning {@code null} rather than
     * performing the request here is deliberate: doing the fetch natively would mean re-sending
     * cookies and headers by hand and would add a layer that can break the app for no benefit
     * while there is still a network to use.
     */
    private static final class OfflineFallbackClient extends WebViewClient {

        private final MainActivity activity;
        private final WebView webView;
        private final String appOrigin;

        OfflineFallbackClient(MainActivity activity, WebView webView) {
            this.activity = activity;
            this.webView = webView;
            this.appOrigin = capacitorServerUrl(webView);
        }

        private static String capacitorServerUrl(WebView webView) {
            try {
                java.util.regex.Matcher m =
                        java.util.regex.Pattern.compile("^https?://[^/]+").matcher(webView.getUrl());
                if (m.find()) return m.group(0);
            } catch (Throwable ignored) {
            }
            return "";
        }

        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            try {
                if (OfflineCache.isOnline(activity)) return null;

                String url = request.getUrl() != null ? request.getUrl().toString() : null;
                if (url == null || appOrigin.isEmpty() || !url.startsWith(appOrigin)) return null;
                if (request.getMethod() != null && !"GET".equalsIgnoreCase(request.getMethod())) {
                    return null;
                }

                // Never serve a saved HTML page for an API call or an XHR. Doing so hands the caller a document
                // where it asked for JSON, which is worse than letting it fail so the app can show
                // its own offline handling.
                if (!request.isForMainFrame()) {
                    return null;
                }

                // Only the top-level navigation needs handling. The pages the WebView loads for
                // rendering are always main-frame document requests, and by returning null for
                // everything else the online path stays completely untouched.
                OfflineCache.Entry entry = OfflineCache.read(activity, OfflineCache.lookupUrl(url));

                if (entry == null) {
                    // The WebView asks for the origin root on (re)start, but "/dashboard" and
                    // friends are what actually get saved. Falling back to a saved page keeps the
                    // app usable offline instead of the browser's own error page.
                    entry = OfflineCache.read(activity, appOrigin + "/dashboard");
                }
                if (entry == null) {
                    entry = OfflineCache.read(activity, appOrigin + "/");
                }

                if (entry == null) {
                    Log.i("BioPulseCache", "offline: no saved page for " + url);
                    return null;
                }

                Log.i("BioPulseCache", "offline: serving saved page for " + url);
                WebResourceResponse res = new WebResourceResponse(
                        entry.mime, "utf-8", new java.io.ByteArrayInputStream(entry.body));
                Map<String, String> headers = new HashMap<>();
                headers.put("Cache-Control", "no-store");
                res.setResponseHeaders(headers);
                return res;
            } catch (Throwable t) {
                Log.w("BioPulseCache", "intercept failed: " + t.getMessage());
                return null;
            }
        }
    }

    /** Extends the Capacitor client so camera/mic permissions and dialogs keep working. */
    private class FullscreenChromeClient extends BridgeWebChromeClient {

        FullscreenChromeClient(Bridge bridge) {
            super(bridge);
        }

        @Override
        public void onShowCustomView(View view, CustomViewCallback callback) {
            if (fullscreenView != null) {
                callback.onCustomViewHidden();
                return;
            }
            fullscreenView = view;
            fullscreenCallback = callback;

            ViewGroup root = findViewById(android.R.id.content);
            if (root == null) return;

            preFullscreenOrientation = getRequestedOrientation();
            preFullscreenVisibility = getWindow().getDecorView().getSystemUiVisibility();
            setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE);
            enterImmersive();

            fullscreenOverlay = new FrameLayout(MainActivity.this);
            fullscreenOverlay.setBackgroundColor(Color.BLACK);
            fullscreenOverlay.setLayoutParams(
                new ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
            );

            root.addView(
                fullscreenOverlay,
                new ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
            );
            fullscreenOverlay.addView(
                view,
                new FrameLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.MATCH_PARENT
                )
            );
            fullscreenView.setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                    | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                    | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                    | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                    | View.SYSTEM_UI_FLAG_FULLSCREEN
                    | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
            );
            view.setFocusable(true);
            view.setFocusableInTouchMode(true);
            view.requestFocus();
        }

        @Override
        public void onHideCustomView() {
            exitFullscreen(true);
        }
    }

    private void enterImmersive() {
        View decor = getWindow().getDecorView();
        decor.setSystemUiVisibility(
            View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_FULLSCREEN
                | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
        );
    }

    private void exitFullscreen(boolean notifyCallback) {
        if (fullscreenView != null && fullscreenOverlay != null) {
            ViewGroup parent = (ViewGroup) fullscreenView.getParent();
            if (parent != null) parent.removeView(fullscreenView);
            ViewGroup root = findViewById(android.R.id.content);
            if (root != null) root.removeView(fullscreenOverlay);
        }
        if (notifyCallback && fullscreenCallback != null) {
            try {
                fullscreenCallback.onCustomViewHidden();
            } catch (Exception ignored) {
            }
        }
        fullscreenView = null;
        fullscreenOverlay = null;
        fullscreenCallback = null;

        getWindow().getDecorView().setSystemUiVisibility(preFullscreenVisibility);
        setRequestedOrientation(preFullscreenOrientation);
    }

        @JavascriptInterface
        public boolean saveCustomSound(String id, String base64, String mime) {
            try {
                java.io.File dir = new java.io.File(getFilesDir(), "custom_sounds");
                if (!dir.exists()) dir.mkdirs();
                java.io.File out = new java.io.File(dir, id + ".mp3");
                byte[] bytes = android.util.Base64.decode(base64, android.util.Base64.NO_WRAP);
                java.io.FileOutputStream fos = new java.io.FileOutputStream(out);
                fos.write(bytes);
                fos.flush();
                fos.close();
                android.content.SharedPreferences p = getSharedPreferences("biopulse_sounds", MODE_PRIVATE);
                p.edit().putString("custom_path_" + id, out.getAbsolutePath()).apply();
                p.edit().putString("custom_mime_" + id, mime == null ? "audio/mpeg" : mime).apply();
                return true;
            } catch (Throwable e) {
                Log.e("BioPulseMedia", "saveCustomSound failed", e);
                return false;
            }
        }

        @JavascriptInterface
        public boolean hasCustomSound(String id) {
            try {
                android.content.SharedPreferences p = getSharedPreferences("biopulse_sounds", MODE_PRIVATE);
                String path = p.getString("custom_path_" + id, null);
                if (path == null) return false;
                java.io.File f = new java.io.File(path);
                return f.exists() && f.length() > 0;
            } catch (Throwable t) {
                return false;
            }
        }
    }