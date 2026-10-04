package com.biopulse.app;

import android.Manifest;
import android.content.pm.ActivityInfo;
import android.content.res.Configuration;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.widget.FrameLayout;

import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebChromeClient;

import java.lang.ref.WeakReference;

/**
 * Hosts the Capacitor bridge and adds:
 *
 * 1. Background / lock-screen media playback — the WebView audio pipeline is routed through
 *    a {@code mediaPlayback} foreground service so YouTube keeps playing after the app is
 *    backgrounded or the screen is locked. The web layer reports state through
 *    {@code window.BioPulseBridge.ytState(state, title)}.
 * 2. Native fullscreen video — {@code onShowCustomView} puts the player in a dedicated
 *    overlay with the system bars hidden and the screen rotated to landscape.
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

        webView.addJavascriptInterface(new JsBridge(), "BioPulseBridge");
        webView.setWebChromeClient(new FullscreenChromeClient(getBridge()));

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
        WebView webView = getBridge().getWebView();
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
    }

    private class JsBridge {

        @JavascriptInterface
        public void ytState(String state, String title) {
            MediaPlaybackService.update(MainActivity.this, state, title);
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

    @Override
    public void onBackPressed() {
        if (fullscreenView != null) {
            exitFullscreen(true);
            return;
        }
        super.onBackPressed();
    }
}