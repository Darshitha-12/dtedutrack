package com.biopulse.app;

import android.Manifest;
import android.app.PictureInPictureParams;
import android.content.ContentResolver;
import android.content.ContentUris;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ActivityInfo;
import android.content.res.Configuration;
import android.database.Cursor;
import android.graphics.Color;
import android.net.Uri;
import android.os.Environment;
import android.provider.MediaStore;
import android.provider.Settings;
import android.util.Log;
import android.util.Rational;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
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

import androidx.activity.OnBackPressedCallback;
import android.widget.FrameLayout;

import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;
import com.getcapacitor.BridgeWebChromeClient;
import com.getcapacitor.WebViewLocalServer;

import com.biopulse.app.telegram.TelegramAuthActivity;
import com.biopulse.app.telegram.TelegramChatsActivity;
import com.biopulse.app.telegram.TelegramNative;
import com.biopulse.app.telegram.TelegramWebActivity;

import java.io.File;
import java.io.FileInputStream;
import java.io.InputStream;
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

        // A tap on a message notification cold-starts the app with the partner id attached. Give
        // the page a moment to boot before navigating it to the conversation.
        if (getIntent() != null && getIntent().hasExtra("bp_chat_partner")) {
            final String partner = getIntent().getStringExtra("bp_chat_partner");
            webView.postDelayed(() -> openChatFromNotification(partner), 1400);
        }
        // Must go through the bridge (not webView.setWebViewClient) so Capacitor keeps using our
        // client for its own hooks, and our client keeps Capacitor's local-server handling.
        getBridge().setWebViewClient(new OfflineFallbackClient(this, getBridge()));

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

        // Keep the Telegram notification engine alive from the first launch so messages arrive
        // even with the app closed. Delayed so it never slows the initial web-app paint, and only
        // started when the native TDLib library actually loads on this device/ABI.
        try {
            new Handler(Looper.getMainLooper()).postDelayed(() -> {
                try {
                    if (TelegramNative.isAvailable()) {
                        com.biopulse.app.telegram.TelegramService.ensureRunning(getApplicationContext());
                    }
                } catch (Throwable ignored) {
                }
            }, 1500);
        } catch (Throwable ignored) {
        }

        // Ask (once) to be exempt from battery optimisation so the OEM power manager does not
        // freeze/kill the foreground service, which otherwise silences message notifications.
        try {
            new Handler(Looper.getMainLooper()).postDelayed(this::ensureBatteryExemption, 3000);
        } catch (Throwable ignored) {
        }
    }

    private void ensureBatteryExemption() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return;
        try {
            android.content.SharedPreferences sp = getSharedPreferences("bp_prefs", MODE_PRIVATE);
            if (sp.getBoolean("bp_batt_asked", false)) return;
            sp.edit().putBoolean("bp_batt_asked", true).apply();
            android.os.PowerManager pm =
                    (android.os.PowerManager) getSystemService(Context.POWER_SERVICE);
            if (pm != null && pm.isIgnoringBatteryOptimizations(getPackageName())) return;
            Intent i = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
            i.setData(Uri.parse("package:" + getPackageName()));
            startActivity(i);
        } catch (Throwable ignored) {
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

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        if (intent != null && intent.hasExtra("bp_chat_partner")) {
            openChatFromNotification(intent.getStringExtra("bp_chat_partner"));
        }
    }

    /**
     * Deep-links the WebView to the conversation a message notification refers to. The chat page
     * reads {@code ?partner=} on load, opens that thread and then clears the query so a later
     * reload does not re-open it.
     */
    private void openChatFromNotification(final String partnerId) {
        try {
            final WebView webView = getBridge() == null ? null : getBridge().getWebView();
            if (webView == null) return;
            final String pid = partnerId == null ? "" : partnerId.replaceAll("[^A-Za-z0-9_-]", "");
            webView.postDelayed(() -> {
                try {
                    webView.evaluateJavascript(
                            "(function(){try{location.href='/chat" +
                                    (pid.isEmpty() ? "" : "?partner=" + pid) +
                                    "';}catch(e){}})();", null);
                } catch (Throwable ignored) {
                }
            }, 900);
        } catch (Throwable ignored) {
        }
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
            MediaPlaybackService.setMediaOwner("app");
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

        /** Lets a sound selected in the picker be heard straight away.
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

        /**
         * Posts a live Telegram message notification from the connected WebView session. Each
         * message uses a unique {@code id} so messages stack like the real Telegram app.
         */
        @JavascriptInterface
        public void notifyChat(final int id, final String title, final String text) {
            MediaPlaybackService.postChatMessage(MainActivity.this, id,
                    title == null ? "Telegram" : title, text == null ? "" : text);
        }

        /**
         * Fires a real Android notification for a new BioPulse direct message (the "Messages"
         * chat) with an inline quick-reply box. The page sends the contact name, a short preview
         * and the partner id; tapping the notification opens the chat while the Reply action sends
         * the typed message straight back to the server (see {@link ChatReplyReceiver}).
         */
        @JavascriptInterface
        public void showChatNotification(final String name, final String text, final String partnerId) {
            MediaPlaybackService.postDirectMessage(MainActivity.this,
                    name == null ? "New message" : name,
                    text == null ? "" : text,
                    partnerId == null ? "" : partnerId);
        }

        /**
         * Hands the signed-in account's device token and server origin to the native layer.
         *
         * <p>The WebView serves the offline bundle from Capacitor's local origin and has no
         * NextAuth cookie for the deployed site, so the notification quick-reply (which runs in a
         * BroadcastReceiver with no page context) cannot authenticate with a cookie. The page
         * calls this whenever it has a token, and {@link ChatReplyReceiver} replays it as an
         * {@code Authorization: Bearer …} header so a reply actually reaches the server.
         */
        @JavascriptInterface
        public void setChatAuth(final String token, final String base) {
            try {
                getSharedPreferences(ChatReplyReceiver.PREFS, android.content.Context.MODE_PRIVATE)
                        .edit()
                        .putString(ChatReplyReceiver.KEY_TOKEN, token == null ? "" : token)
                        .putString(ChatReplyReceiver.KEY_BASE, base == null ? "" : base)
                        .apply();
            } catch (Throwable t) {
                Log.w("BioPulseMedia", "setChatAuth failed", t);
            }
        }

        /**
         * Turns the native DM background poller on/off.
         *
         * <p>Android freezes a hidden WebView, so the page's own unread poller stops the instant
         * the app leaves the foreground — the exact moment a message notification matters. This
         * hands the job to {@link MediaPlaybackService}, which keeps polling with the device token
         * from {@link #setChatAuth} and posts notifications without any page being alive.
         */
        @JavascriptInterface
        public void setChatWatch(final boolean active) {
            runOnUiThread(() -> {
                if (active) {
                    MediaPlaybackService.startDmWatch(MainActivity.this);
                } else {
                    MediaPlaybackService.stopDmWatch(MainActivity.this);
                }
            });
        }

        /** Unread count the page last announced for a partner (-1 when it has never announced). */
        @JavascriptInterface
        public int getChatUnreadSeen(final String partnerId) {
            return MediaPlaybackService.getChatUnreadSeen(MainActivity.this, partnerId);
        }

        /** Records the unread count the page just announced, so the native poller will not repeat it. */
        @JavascriptInterface
        public void setChatUnreadSeen(final String partnerId, final int unread) {
            MediaPlaybackService.setChatUnreadSeen(MainActivity.this, partnerId, unread);
        }

        /** Removes a partner's DM notification (called once the thread has been read in the app). */
        @JavascriptInterface
        public void dismissChatNotification(final String partnerId) {
            MediaPlaybackService.dismissDirectMessage(MainActivity.this, partnerId);
        }

        /**
         * While a Telegram session is connected the renderer must not be frozen, or live messages
         * would stop the moment the app leaves the foreground. A silent loop held by the media
         * foreground service keeps the WebView alive — even with the screen off — so messages keep
         * arriving and posting notifications on their own.
         */
        @JavascriptInterface
        public void setKeepAlive(final boolean active) {
            runOnUiThread(() -> {
                if (active) {
                    MediaPlaybackService.startKeepAlive(MainActivity.this);
                } else {
                    MediaPlaybackService.stopKeepAlive(MainActivity.this);
                }
            });
        }

        /** True when the TDLib native library is usable on this device/ABI. */
        @JavascriptInterface
        public boolean telegramNativeAvailable() {
            TelegramNative.init(getApplicationContext());
            return TelegramNative.isAvailable();
        }

        /** Opens the native Telegram client (chat list, or sign-in when not authorised yet). */
        @JavascriptInterface
        public void openTelegram() {
            runOnUiThread(() -> {
                TelegramNative.init(getApplicationContext());
                Intent intent;
                if (TelegramNative.isReady()) {
                    intent = new Intent(MainActivity.this, TelegramChatsActivity.class);
                } else {
                    intent = new Intent(MainActivity.this, TelegramAuthActivity.class);
                }
                startActivity(intent);
            });
        }

        /** Current TDLib authorization state (see TelegramNative.STATE_*). */
        @JavascriptInterface
        public String telegramStatus() {
            return TelegramNative.getState();
        }

        /**
         * Opens Telegram Web (full interface: media, files, PDFs with download + open) inside the
         * app, presented full-screen like the native Telegram app.
         */
        @JavascriptInterface
        public void openTelegramWeb() {
            runOnUiThread(() -> startActivity(
                    new Intent(MainActivity.this, TelegramWebActivity.class)));
        }

        /**
         * Opens the native Telegram sign-in (phone + code) purely so the always-on notification
         * service can run. After a successful login the screen closes and returns to the web app
         * instead of opening the native chat list.
         */
        @JavascriptInterface
        public void enableTelegramNotifications() {
            runOnUiThread(() -> {
                TelegramNative.init(getApplicationContext());
                if (TelegramNative.isReady()) {
                    com.biopulse.app.telegram.TelegramService.ensureRunning(getApplicationContext());
                    return;
                }
                Intent intent = new Intent(MainActivity.this, TelegramAuthActivity.class);
                intent.putExtra("returnOnly", true);
                startActivity(intent);
            });
        }

        /** Signs the native Telegram session out. */
        @JavascriptInterface
        public void telegramLogout() {
            TelegramNative.logout();
        }

        /** Reports device free space + Telegram cache size to the page via {@code window.__bp_storage}. */
        @JavascriptInterface
        public void telegramStorage() {
            TelegramNative.init(getApplicationContext());
            TelegramNative.storageInfo(this::postTelegramStorage);
        }

        /** Clears Telegram's downloaded-media cache, then reports the freed space. */
        @JavascriptInterface
        public void clearTelegramCache() {
            TelegramNative.init(getApplicationContext());
            TelegramNative.limitCache();
            runOnUiThread(() -> {
                try {
                    WebView webView = getBridge() != null ? getBridge().getWebView() : null;
                    if (webView != null) webView.clearCache(true);
                } catch (Throwable ignored) {
                }
            });
            TelegramNative.clearCache(this::postTelegramStorage);
        }

        private void postTelegramStorage(long free, long total, long cache) {
            final String json = "{\"free\":" + free + ",\"total\":" + total
                    + ",\"cache\":" + cache + "}";
            runOnUiThread(() -> {
                try {
                    WebView webView = getBridge() != null ? getBridge().getWebView() : null;
                    if (webView == null) return;
                    webView.evaluateJavascript(
                            "window.__bp_storage && window.__bp_storage(" + json + ");", null);
                } catch (Throwable ignored) {
                }
            });
        }


        @JavascriptInterface
        public void setAlarmRinging(final boolean ringing, final String label, final String soundId) {
            runOnUiThread(() -> {
                if (ringing) {
                    MediaPlaybackService.startAlarm(MainActivity.this, label, soundId);
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
         * Hands the next alarm time to the OS so it rings even when the app is not running.
         * Legacy single-event fallback; the queue API {@link #scheduleAlarms} below is preferred.
         *
         * @param epochMillis absolute wall-clock time the alarm is due, 0 to cancel.
         */
        @JavascriptInterface
        public void scheduleAlarm(final double epochMillis, final String label, final String soundId) {
            final long at = (long) epochMillis;
            runOnUiThread(() -> {
                if (at <= 0L) {
                    AlarmScheduler.cancel(MainActivity.this);
                } else {
                    AlarmScheduler.schedule(MainActivity.this, at, label, soundId);
                }
            });
        }

        /**
         * Replaces the whole native alarm queue with an array of {@code {at,label,soundId}}
         * events (an empty array clears everything). Each event is armed as its own PendingIntent
         * and the receiver re-arms the remainder when one fires, which is what lets a 07:00 class
         * ring once at 05:00 for the pre-alert and again at 07:00 with the app never opened in
         * between.
         */
        @JavascriptInterface
        public void scheduleAlarms(final String eventsJson) {
            runOnUiThread(() -> AlarmScheduler.scheduleEvents(MainActivity.this, eventsJson));
        }

        /** Lets the page force an immediate ring, e.g. while testing or after a manual "ring now". */
        @JavascriptInterface
        public void ringAlarmNow(final String label) {
            runOnUiThread(() -> MediaPlaybackService.startAlarm(MainActivity.this, label));
        }

        /** Fires the daily 12 AM exam check-in right now so the user can test it without waiting. */
        @JavascriptInterface
        public void testExamReminder(final String target, final String examLabel) {
            runOnUiThread(() -> AlarmScheduler.testExamAlert(MainActivity.this, target, examLabel));
        }

        /**
         * True when the OS will actually show notifications. Android 13+ gates every notification
         * channel behind the runtime POST_NOTIFICATIONS grant, and a denied grant means the alarm
         * still rings (sound + vibration) while the shade stays empty — the page shows a warning
         * banner so the user knows why.
         */
        @JavascriptInterface
        public boolean notificationsEnabled() {
            try {
                return androidx.core.app.NotificationManagerCompat.from(MainActivity.this)
                        .areNotificationsEnabled();
            } catch (Throwable t) {
                return true; // unknown state — don't nag
            }
        }

        /** Requests the POST_NOTIFICATIONS grant at the moment it is actually needed (Telegram). */
        @JavascriptInterface
        public void requestNotificationPermission() {
            runOnUiThread(() -> {
                try {
                    if (Build.VERSION.SDK_INT >= 33) {
                        requestPermissions(new String[] { Manifest.permission.POST_NOTIFICATIONS }, 9001);
                    }
                } catch (Throwable ignored) {
                }
            });
        }

        /** Opens the app's notification settings so the user can re-enable the alarm channel. */
        @JavascriptInterface
        public void openNotificationSettings() {
            runOnUiThread(() -> {
                try {
                    Intent i = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS);
                    i.putExtra(Settings.EXTRA_APP_PACKAGE, getPackageName());
                    startActivity(i);
                } catch (Throwable t) {
                    try {
                        startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                                Uri.parse("package:" + getPackageName())));
                    } catch (Throwable ignored) {
                    }
                }
            });
        }

        // ---- over-the-air web updates ----
        // The APK ships its web bundle inside the assets, so feature changes always needed a new
        // APK. These methods let the page download a newer bundle (hosted on the site), unpack it
        // into filesDir/webb/<version> and activate it; the WebView client below then serves every
        // local URL from that directory instead of the bundled assets. Native (Java) changes still
        // need a real APK install — this only swaps the web layer, and it all stays offline after.

        private static final String WEB_PREFS = "biopulse_webb";
        private static final String WEB_KEY = "version";

        @JavascriptInterface
        public String getWebVersion() {
            try {
                return getSharedPreferences(WEB_PREFS, MODE_PRIVATE).getString(WEB_KEY, "");
            } catch (Throwable t) {
                return "";
            }
        }

        /** Stores one file of a pending web bundle (base64 body). Idempotent per path. */
        @JavascriptInterface
        public boolean writeWebFile(String version, String relPath, String base64) {
            try {
                String ver = sanitizeVersion(version);
                String rel = sanitizePath(relPath);
                if (ver == null || rel == null || base64 == null) return false;
                File dir = new File(getFilesDir(), "webb" + File.separator + ver);
                if (!dir.exists() && !dir.mkdirs()) return false;
                File out = new File(dir, rel);
                if (!out.getCanonicalPath().startsWith(dir.getCanonicalPath())) return false;
                File parent = out.getParentFile();
                if (parent != null && !parent.exists() && !parent.mkdirs()) return false;
                byte[] bytes = android.util.Base64.decode(
                        base64.replaceAll("\\s", ""), android.util.Base64.DEFAULT);
                java.io.FileOutputStream fos = new java.io.FileOutputStream(out);
                try {
                    fos.write(bytes);
                } finally {
                    fos.flush();
                    fos.close();
                }
                return out.length() == bytes.length;
            } catch (Throwable t) {
                Log.e("BioPulseOTA", "writeWebFile failed (" + relPath + "/" + version + ")", t);
                return false;
            }
        }

        /**
         * Verifies a fully downloaded bundle (index.html must exist at its root) and makes it the
         * active version. The page reloads itself once this returns true; nothing is served from a
         * half-written bundle because the client below only consults the version pref.
         */
        @JavascriptInterface
        public boolean applyWebVersion(String version) {
            try {
                String ver = sanitizeVersion(version);
                if (ver == null) return false;
                File dir = new File(getFilesDir(), "webb" + File.separator + ver);
                if (!new File(dir, "index.html").isFile()) return false;
                return getSharedPreferences(WEB_PREFS, MODE_PRIVATE)
                        .edit().putString(WEB_KEY, ver)
                        .putLong("installed_at", System.currentTimeMillis())
                        .commit();
            } catch (Throwable t) {
                Log.e("BioPulseOTA", "applyWebVersion failed", t);
                return false;
            }
        }

        private static String sanitizeVersion(String v) {
            if (v == null) return null;
            String s = v.trim();
            if (s.length() < 1 || s.length() > 64) return null;
            if (!s.matches("[A-Za-z0-9._-]+")) return null;
            return s;
        }

        private static String sanitizePath(String p) {
            if (p == null) return null;
            String s = p.replace('\\', '/');
            if (s.startsWith("/")) return null;
            if (s.contains("..") || s.contains("\u0000") || s.contains(":")) return null;
            if (s.length() == 0 || s.length() > 512) return null;
            // Next.js emits route-group folders such as `_next/static/chunks/app/(app)/chat/…`,
            // so "(" and ")" (and "[" / "]") have to be writable. Rejecting them made every
            // chunk under a route group fail, which aborted the whole OTA install — the app
            // silently stayed on the bundle it shipped with. Path traversal is still blocked by
            // the "..", leading-slash, ":" and NUL checks above plus the canonical-path check in
            // writeWebFile.
            if (!s.matches("[A-Za-z0-9._/()\\[\\]-]+")) return null;
            return s;
        }

        /**
         * Searches YouTube on a background thread and hands the raw {@code ytInitialData} JSON
         * back to the page through {@code window.__bp_yt_search(requestId, json)} (json is empty
         * when there is no network). The stripped API routes of the offline APK leave the web
         * layer's /api/yt-search unable to run, and a plain fetch from the page would be blocked
         * by CORS, so the request has to happen natively.
         */
        @JavascriptInterface
        public void ytSearch(final String requestId, final String query) {
            new Thread(() -> {
                String payload = "";
                try {
                    String url = "https://www.youtube.com/results?search_query="
                            + java.net.URLEncoder.encode(query == null ? "" : query, "UTF-8")
                            + "&hl=en&gl=US";
                    java.net.HttpURLConnection conn =
                            (java.net.HttpURLConnection) new java.net.URL(url).openConnection();
                    conn.setConnectTimeout(6000);
                    conn.setReadTimeout(8000);
                    conn.setRequestProperty("User-Agent",
                            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                                    + "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36");
                    conn.setRequestProperty("Accept-Language", "en-US,en;q=0.9");
                    conn.setRequestProperty("Cookie", "CONSENT=YES+cb.20210328-17-p0.en+FX+417");
                    if (conn.getResponseCode() == 200) {
                        java.io.InputStream in = conn.getInputStream();
                        java.io.ByteArrayOutputStream buf = new java.io.ByteArrayOutputStream();
                        byte[] chunk = new byte[16384];
                        long total = 0;
                        int n;
                        while (total < 6_000_000L && (n = in.read(chunk)) != -1) {
                            buf.write(chunk, 0, n);
                            total += n;
                        }
                        in.close();
                        payload = extractYtJson(buf.toString("UTF-8"));
                    }
                    conn.disconnect();
                } catch (Throwable t) {
                    payload = "";
                }
                final String json = payload;
                runOnUiThread(() -> {
                    try {
                        WebView webView = getBridge() != null ? getBridge().getWebView() : null;
                        if (webView == null) return;
                        webView.evaluateJavascript(
                                "window.__bp_yt_search && window.__bp_yt_search("
                                        + org.json.JSONObject.quote(requestId == null ? "" : requestId)
                                        + "," + org.json.JSONObject.quote(json) + ");", null);
                    } catch (Throwable ignored) {
                    }
                });
            }, "yt-search").start();
        }

        /** Same extraction as the server route: the JSON between the marker and {@code </script>}. */
        private static String extractYtJson(String html) {
            String marker = "var ytInitialData = ";
            int idx = html.indexOf(marker);
            if (idx < 0) return "";
            int start = idx + marker.length();
            int end = html.indexOf(";</script>", start);
            if (end < 0) end = Math.min(html.length(), start + 4_000_000);
            return html.substring(start, end);
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

        // ---- custom sound library ----
        // These MUST live in JsBridge: only methods on the object passed to
        // addJavascriptInterface(new JsBridge(), "BioPulseBridge") are visible to the page. They
        // were previously direct MainActivity members, so the JS side always saw them as
        // undefined, the native copy was never written, and every custom alarm silently fell
        // back to the system ringtone while the in-app playback worked fine.

        /** Single-shot save; the chunked API below is preferred for files of any size. */
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
                if (out.length() != bytes.length) {
                    throw new java.io.IOException("short write: " + out.length() + "/" + bytes.length);
                }
                android.content.SharedPreferences p = getSharedPreferences("biopulse_sounds", MODE_PRIVATE);
                p.edit().putString("custom_path_" + id, out.getAbsolutePath()).apply();
                p.edit().putString("custom_mime_" + id, mime == null ? "audio/mpeg" : mime).apply();
                Log.i("BioPulseMedia", "custom sound saved: " + id + " (" + bytes.length + " bytes)");
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

        // ---- chunked custom-sound transfer ----
        // Pushing a whole MP3 through one bridge call as one base64 string is the one step that
        // can die silently on low-memory devices (the argument conversion allocates the string
        // several times). 256KB chunks keep every call small and make a failure observable per
        // chunk; the file only gets registered in the preferences after endCustomSound verifies
        // the total length, so a partial transfer can never be mistaken for a usable sound.

        private java.io.FileOutputStream mSoundFos;
        private String mSoundId;
        private String mSoundMime;

        @JavascriptInterface
        public boolean beginCustomSound(String id, String mime) {
            try {
                if (mSoundFos != null) {
                    try {
                        mSoundFos.close();
                    } catch (Throwable ignored) {
                    }
                    mSoundFos = null;
                }
                java.io.File dir = new java.io.File(getFilesDir(), "custom_sounds");
                if (!dir.exists() && !dir.mkdirs()) return false;
                java.io.File out = new java.io.File(dir, id + ".mp3");
                mSoundFos = new java.io.FileOutputStream(out); // truncates any previous attempt
                mSoundId = id;
                mSoundMime = mime == null || mime.isEmpty() ? "audio/mpeg" : mime;
                return true;
            } catch (Throwable e) {
                Log.e("BioPulseMedia", "beginCustomSound failed", e);
                return false;
            }
        }

        @JavascriptInterface
        public boolean appendCustomSound(String base64Chunk) {
            try {
                if (mSoundFos == null) return false;
                mSoundFos.write(android.util.Base64.decode(base64Chunk, android.util.Base64.NO_WRAP));
                return true;
            } catch (Throwable e) {
                Log.e("BioPulseMedia", "appendCustomSound failed", e);
                return false;
            }
        }

        @JavascriptInterface
        public boolean endCustomSound(String id, long expectedBytes) {
            try {
                if (mSoundFos == null || mSoundId == null || !mSoundId.equals(id)) return false;
                mSoundFos.flush();
                mSoundFos.close();
                mSoundFos = null;
                java.io.File out = new java.io.File(
                        new java.io.File(getFilesDir(), "custom_sounds"), id + ".mp3");
                if (!out.exists() || (expectedBytes >= 0 && out.length() != expectedBytes)) {
                    Log.e("BioPulseMedia", "custom sound size mismatch: " + out.length()
                            + " expected " + expectedBytes);
                    return false;
                }
                android.content.SharedPreferences p = getSharedPreferences("biopulse_sounds", MODE_PRIVATE);
                p.edit()
                        .putString("custom_path_" + id, out.getAbsolutePath())
                        .putString("custom_mime_" + id, mSoundMime)
                        .apply();
                Log.i("BioPulseMedia", "custom sound saved: " + id + " (" + out.length() + " bytes)");
                return true;
            } catch (Throwable e) {
                Log.e("BioPulseMedia", "endCustomSound failed", e);
                return false;
            }
        }

        // ---- device backup ----
        // The offline build keeps every note, mark, planner block and chat message in WebView
        // localStorage, which Android's "Clear data" wipes for good (there is no server copy).
        // These methods mirror that data to a plain file under the phone's Downloads folder —
        // /Download/BioPulse/biopulse-backup.json — which survives Clear data and a reinstall, so
        // the page can put everything back the next time it starts up empty.

        private static final String BACKUP_DIR = "BioPulse";
        private static final String BACKUP_NAME = "biopulse-backup.json";

        @JavascriptInterface
        public boolean writeBackup(String json) {
            try {
                if (json == null) return false;
                byte[] bytes = json.getBytes("UTF-8");
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    ContentResolver cr = getContentResolver();
                    Uri existing = findBackupUri();
                    if (existing != null) {
                        try {
                            getContentResolver().delete(existing, null, null);
                        } catch (Throwable ignored) {
                        }
                    }
                    ContentValues values = new ContentValues();
                    values.put(MediaStore.Downloads.DISPLAY_NAME, BACKUP_NAME);
                    values.put(MediaStore.Downloads.MIME_TYPE, "application/json");
                    values.put(MediaStore.Downloads.RELATIVE_PATH,
                            Environment.DIRECTORY_DOWNLOADS + "/" + BACKUP_DIR);
                    Uri item = cr.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
                    if (item == null) return false;
                    java.io.OutputStream os = cr.openOutputStream(item, "w");
                    if (os == null) return false;
                    try {
                        os.write(bytes);
                    } finally {
                        os.flush();
                        os.close();
                    }
                    return true;
                }
                File dir = new File(
                        Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS),
                        BACKUP_DIR);
                if (!dir.exists() && !dir.mkdirs()) return false;
                File out = new File(dir, BACKUP_NAME);
                java.io.FileOutputStream fos = new java.io.FileOutputStream(out);
                try {
                    fos.write(bytes);
                } finally {
                    fos.flush();
                    fos.close();
                }
                return out.length() == bytes.length;
            } catch (Throwable t) {
                Log.e("BioPulseBackup", "writeBackup failed", t);
                return false;
            }
        }

        /** The last auto-backup as JSON, or "" when the device has none. */
        @JavascriptInterface
        public String readBackup() {
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    Uri uri = findBackupUri();
                    if (uri == null) return "";
                    java.io.InputStream in = getContentResolver().openInputStream(uri);
                    if (in == null) return "";
                    java.io.ByteArrayOutputStream bos = new java.io.ByteArrayOutputStream();
                    byte[] buf = new byte[8192];
                    int n;
                    while ((n = in.read(buf)) > 0) bos.write(buf, 0, n);
                    in.close();
                    return new String(bos.toByteArray(), "UTF-8");
                }
                File f = new File(new File(
                        Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS),
                        BACKUP_DIR), BACKUP_NAME);
                if (!f.isFile()) return "";
                byte[] bytes = new byte[(int) f.length()];
                java.io.FileInputStream fis = new java.io.FileInputStream(f);
                try {
                    int off = 0;
                    int r;
                    while (off < bytes.length && (r = fis.read(bytes, off, bytes.length - off)) > 0) {
                        off += r;
                    }
                } finally {
                    fis.close();
                }
                return new String(bytes, "UTF-8");
            } catch (Throwable t) {
                Log.e("BioPulseBackup", "readBackup failed", t);
                return "";
            }
        }

        /** When the device backup was last written, in epoch millis (0 when none). */
        @JavascriptInterface
        public long backupTimestamp() {
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    Uri uri = findBackupUri();
                    if (uri == null) return 0;
                    Cursor c = getContentResolver().query(uri,
                            new String[]{MediaStore.Downloads.DATE_ADDED}, null, null, null);
                    if (c == null) return 0;
                    try {
                        if (c.moveToFirst()) {
                            // MediaStore stores DATE_ADDED in seconds.
                            return c.getLong(0) * 1000L;
                        }
                        return 0;
                    } finally {
                        c.close();
                    }
                }
                File f = new File(new File(
                        Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS),
                        BACKUP_DIR), BACKUP_NAME);
                return f.isFile() ? f.lastModified() : 0L;
            } catch (Throwable t) {
                return 0L;
            }
        }

        private Uri findBackupUri() {
            try {
                Cursor c = getContentResolver().query(
                        MediaStore.Downloads.EXTERNAL_CONTENT_URI,
                        new String[]{MediaStore.Downloads._ID},
                        MediaStore.Downloads.DISPLAY_NAME + "=?",
                        new String[]{BACKUP_NAME},
                        MediaStore.Downloads.DATE_ADDED + " DESC");
                if (c == null) return null;
                try {
                    if (c.moveToFirst()) {
                        return ContentUris.withAppendedId(
                                MediaStore.Downloads.EXTERNAL_CONTENT_URI, c.getLong(0));
                    }
                    return null;
                } finally {
                    c.close();
                }
            } catch (Throwable t) {
                return null;
            }
        }
    }

    /**
     * Extends Capacitor's own client so the local server keeps working (bundled assets,
     * index.html fallback, bridge JS injection, intent handling, WebViewListener callbacks) while
     * adding the offline behaviours the static export needs:
     *
     * <p>1. Next.js writes {@code /dashboard.html} etc. Capacitor's html5mode answers every
     * extension-less path with {@code index.html}, which would hydrate the wrong page on a hard
     * load of a deep route — so the exported {@code <path>.html} is served first when it exists.
     *
     * <p>2. While offline, pages saved by {@code saveForOffline} are still offered as a last
     * resort, exactly as before. When there is a network, requests fall straight through to
     * Capacitor so the normal load path stays untouched.
     */
    private static final class OfflineFallbackClient extends BridgeWebViewClient {

        private final MainActivity activity;
        private final Bridge bridge;
        private final String appOrigin;

        OfflineFallbackClient(MainActivity activity, Bridge bridge) {
            super(bridge);
            this.activity = activity;
            this.bridge = bridge;
            this.appOrigin = localOrigin(bridge);
        }

        private static String localOrigin(Bridge bridge) {
            try {
                return bridge.getScheme() + "://" + bridge.getHost();
            } catch (Throwable t) {
                return "";
            }
        }

        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            try {
                String url = request.getUrl() != null ? request.getUrl().toString() : null;
                if (url == null) return null;

                String path = request.getUrl().getPath();
                boolean get = request.getMethod() == null || "GET".equalsIgnoreCase(request.getMethod());
                boolean local = !appOrigin.isEmpty() && url.startsWith(appOrigin);

                // Over-the-air bundle first: an installed/activated web override is served from
                // filesDir for every local GET, resolving deep routes to their exported .html the
                // same way the asset path is resolved below. Falls through when no override is
                // active or the file is missing, so bundled assets stay the floor.
                if (local && get && path != null) {
                    WebResourceResponse fromOta = serveOta(request, path);
                    if (fromOta != null) return fromOta;
                }

                // Deep-route hard load ("/dashboard"): serve the exported page, not index.html.
                if (local && get && request.isForMainFrame() && path != null && path.length() > 1) {
                    String lastSegment = path.substring(path.lastIndexOf('/') + 1);
                    if (!lastSegment.contains(".")) {
                        String asset = path.endsWith("/")
                                ? path + "index.html"
                                : path + ".html";
                        WebResourceResponse page = serveExportedPage(asset);
                        if (page != null) return page;
                    }
                }

                // Everything else (assets, RSC .txt, index.html, CapacitorHttp, remote URLs)
                // goes through Capacitor's local server unchanged.
                WebResourceResponse response = super.shouldInterceptRequest(view, request);
                if (response != null) return response;

                // Nothing bundled for this URL — offer a page saved by saveForOffline.
                if (local && get && request.isForMainFrame() && !OfflineCache.isOnline(activity)) {
                    OfflineCache.Entry entry = OfflineCache.read(activity, OfflineCache.lookupUrl(url));
                    if (entry == null) {
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
                    WebResourceResponse saved = new WebResourceResponse(
                            entry.mime, "utf-8", new java.io.ByteArrayInputStream(entry.body));
                    Map<String, String> headers = new HashMap<>();
                    headers.put("Cache-Control", "no-store");
                    saved.setResponseHeaders(headers);
                    return saved;
                }
                return null;
            } catch (Throwable t) {
                Log.w("BioPulseCache", "intercept failed: " + t.getMessage());
                return null;
            }
        }

        /** The active over-the-air web override, or null when none is installed/harmless. */
        private WebResourceResponse serveOta(WebResourceRequest request, String path) {
            String version = webVersion();
            if (version == null || version.isEmpty()) return null;
            File base;
            try {
                base = new File(activity.getFilesDir(), "webb" + File.separator + version);
            } catch (Throwable t) {
                return null;
            }
            String asset = path;
            if (asset.isEmpty() || asset.equals("/")) {
                asset = "/index.html";
            } else if (request.isForMainFrame()) {
                String last = asset.substring(asset.lastIndexOf('/') + 1);
                if (!last.contains(".")) {
                    asset = asset.endsWith("/") ? asset + "index.html" : asset + ".html";
                }
            }
            InputStream in = null;
            try {
                File f = new File(base, asset.replaceFirst("^/+", "").replace('\\', '/'));
                if (!f.getCanonicalPath().startsWith(base.getCanonicalPath())) return null;
                if (!f.isFile()) return null;
                String mime = guessMime(asset);
                in = new FileInputStream(f);
                WebViewLocalServer localServer = bridge.getLocalServer();
                if (localServer != null && mime.startsWith("text/html")) {
                    in = localServer.getJavaScriptInjectedStream(in);
                }
                WebResourceResponse response = new WebResourceResponse(mime, "utf-8", in);
                Map<String, String> headers = new HashMap<>();
                headers.put("Cache-Control", "no-store");
                response.setResponseHeaders(headers);
                Log.i("BioPulseOTA", "served " + asset + " from web override " + version);
                return response;
            } catch (Throwable t) {
                if (in != null) {
                    try {
                        in.close();
                    } catch (Throwable ignored) {
                    }
                }
                return null;
            }
        }

        /** Version string the page applied through {@code applyWebVersion}, empty = bundled only. */
        private String webVersion() {
            try {
                return activity.getSharedPreferences("biopulse_webb", Context.MODE_PRIVATE)
                        .getString("version", "");
            } catch (Throwable t) {
                return "";
            }
        }

        private static String guessMime(String p) {
            if (p.endsWith(".html")) return "text/html";
            if (p.endsWith(".js") || p.endsWith(".mjs")) return "application/javascript";
            if (p.endsWith(".css")) return "text/css";
            if (p.endsWith(".json") || p.endsWith(".map")) return "application/json";
            if (p.endsWith(".jpg") || p.endsWith(".jpeg")) return "image/jpeg";
            if (p.endsWith(".png")) return "image/png";
            if (p.endsWith(".gif")) return "image/gif";
            if (p.endsWith(".webp")) return "image/webp";
            if (p.endsWith(".svg")) return "image/svg+xml";
            if (p.endsWith(".ico")) return "image/x-icon";
            if (p.endsWith(".txt") || p.endsWith(".rsc")) return "text/plain";
            if (p.endsWith(".woff2")) return "font/woff2";
            if (p.endsWith(".woff")) return "font/woff";
            if (p.endsWith(".ttf")) return "font/ttf";
            if (p.endsWith(".wav")) return "audio/wav";
            if (p.endsWith(".mp3")) return "audio/mpeg";
            return "application/octet-stream";
        }

        /** Reads {@code public/<assetPath>} from the APK with Capacitor's bridge JS injected. */
        private WebResourceResponse serveExportedPage(String assetPath) {
            InputStream stream = null;
            try {
                stream = activity.getAssets().open(Bridge.DEFAULT_WEB_ASSET_DIR + assetPath);
                WebViewLocalServer localServer = bridge.getLocalServer();
                if (localServer != null) {
                    stream = localServer.getJavaScriptInjectedStream(stream);
                }
                WebResourceResponse response = new WebResourceResponse("text/html", "utf-8", stream);
                Map<String, String> headers = new HashMap<>();
                headers.put("Cache-Control", "no-cache");
                response.setResponseHeaders(headers);
                return response;
            } catch (Throwable notExported) {
                if (stream != null) {
                    try {
                        stream.close();
                    } catch (Throwable ignored) {
                    }
                }
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
    }