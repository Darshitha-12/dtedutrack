package com.biopulse.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.Handler;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.media.MediaPlayer;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.util.Log;

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;

import java.lang.ref.WeakReference;

/**
 * Keeps the WebView media pipeline alive while BioPulse is backgrounded or the screen is
 * locked.
 *
 * WebView audio is suspended by Android as soon as the hosting activity is no longer
 * visible, unless {@code WebView#setAudioForegroundService(true)} is set AND a foreground
 * service with the {@code mediaPlayback} type is running. This service provides that
 * foreground process plus a lock-screen notification with play/pause/stop actions, so the
 * user can control playback without reopening the app.
 */
public class MediaPlaybackService extends Service {

    public static final String ACTION_START = "com.biopulse.app.media.START";
    public static final String ACTION_STOP = "com.biopulse.app.media.STOP";
    public static final String ACTION_PLAY = "com.biopulse.app.media.PLAY";
    public static final String ACTION_PAUSE = "com.biopulse.app.media.PAUSE";
    public static final String ACTION_DISMISS_ALARM = "com.biopulse.app.media.DISMISS_ALARM";

    private static final String CHANNEL_ID = "biopulse_media";
    private static final String TAG = "BioPulseMedia";

    /**
     * Alarms get their own channel and their own notification.
     *
     * Reusing the media channel meant alarms inherited IMPORTANCE_LOW plus a silenced builder, so
     * they never vibrated and never produced a lock-screen popup — a ringing alarm that cannot be
     * seen or felt is useless. A separate IMPORTANCE_HIGH channel also keeps the user able to tune
     * alarms independently of playback.
     */
    private static final String ALARM_CHANNEL_ID = "biopulse_alarms";
    private static final int ALARM_NOTIF_ID = 0x8A22;
    private static final int REQ_DISMISS_ALARM = 14;
    private static final int REQ_ALARM_OPEN = 15;
    /** Repeat: two short pulses, a gap, then a longer one — the standard "wake up" pattern. */
    private static final long[] ALARM_VIBRATE = {0L, 400L, 250L, 400L, 250L, 900L};
    private static final int NOTIF_ID = 0x8A11;
    private static final int REQ_PLAY = 11;
    private static final int REQ_PAUSE = 12;
    private static final int REQ_STOP = 13;

    private static final Handler MAIN = new Handler(Looper.getMainLooper());
    private static WeakReference<MediaPlaybackService> instance = new WeakReference<>(null);

    /**
     * Delay before actually releasing the service.
     *
     * A stop request that lands while a {@code startForegroundService()} is still in flight
     * cancels the start intent before the service ever runs, and Android then aborts the
     * process with {@code RemoteServiceException} because startForeground() was never called.
     * Deferring the release lets the pending start be promoted instead.
     */
    private static final long RELEASE_DELAY_MS = 1500L;

    private static final Runnable RELEASE_TASK = () -> {
        releaseScheduled = false;
        if (!isPlaying()) {
            MediaPlaybackService svc = instance.get();
            Context ctx = svc != null ? svc.getApplicationContext() : null;
            if (ctx != null) release(ctx);
        }
    };

    private static boolean releaseScheduled = false;

    /** True once the service has been promoted and before it is destroyed. */
    private static volatile boolean foreground = false;

    /**
     * Playback position reported by the page, in milliseconds.
     *
     * The web layer cannot drive this on its own: background JS timers are throttled to roughly
     * one tick per minute, so the 1s keepalive in the YT page stops nudging the embed and the
     * audio drops out while the app is backgrounded. A ticker running inside this foreground
     * service (which holds a wakelock) pushes the keepalive instead, and the reported position
     * feeds the notification progress bar.
     */
    private static long positionMs = 0;
    private static long durationMs = 0;
    private static int progressReports = 0;

    private static final long KEEPALIVE_INTERVAL_MS = 2000L;
    private static int keepaliveTicks = 0;
    private static final Runnable KEEPALIVE_TASK = new Runnable() {
        @Override
        public void run() {
            if (!mediaPlaying && !playbackRequested) return;
            MediaPlaybackService svc = instance.get();
            if (svc == null) return;
            MainActivity.dispatchMediaCommand("keepalive");
            svc.tickProgress();
            // Heartbeat: proves the service loop is alive, so a missing "progress" line means the
            // WebView renderer froze rather than the service dying.
            if (++keepaliveTicks % 15 == 0) {
                Log.i(TAG, "keepalive heartbeat pos=" + positionMs + "/" + durationMs);
            }
            MAIN.postDelayed(this, KEEPALIVE_INTERVAL_MS);
        }
    };

    /** Called from the page whenever the player reports its position. */
    public static void reportProgress(long position, long duration) {
        positionMs = Math.max(0, position);
        durationMs = Math.max(0, duration);
        progressReports++;
        if (progressReports % 10 == 1) {
            Log.i(TAG, "progress " + positionMs + "/" + durationMs);
        }
    }

    private PowerManager.WakeLock wakeLock;

    /** WebView media (YouTube) state, reported through {@code ytState}. */
    private static boolean mediaPlaying = false;
    /**
     * Sticky "the user wants audio" flag, set from user gestures and cleared only by them. The
     * embed pauses itself whenever the app is backgrounded, so {@link #mediaPlaying} flips to
     * false exactly when background audio matters most; without this the service would tear itself
     * down and picture-in-picture would never engage.
     */
    private static boolean playbackRequested = false;
    /** Alarm / reminder ring state, reported through {@code setAlarmRinging}. */
    private static boolean alarmActive = false;
    private static String currentTitle = "BioPulse Player";

    private static final long WAKE_LOCK_TIMEOUT_MS = 60L * 60L * 1000L;

    /** True while the foreground service must stay alive for any reason. */
    public static boolean isPlaying() {
        return mediaPlaying || alarmActive;
    }

    /** True while the user wants to hear audio, even if the embed has paused itself. */
    public static boolean hasPlaybackIntent() {
        return playbackRequested || mediaPlaying || alarmActive;
    }

    /** Reported from the player page on real user gestures only. */
    public static void setPlaybackIntent(Context ctx, boolean active) {
        playbackRequested = active;
        Log.i(TAG, "playbackIntent=" + active);
        if (!active) {
            if (!alarmActive) scheduleRelease(ctx);
        } else {
            ensureRunning(ctx);
        }
    }

    public static String currentTitle() {
        return currentTitle;
    }

    /** Starts (or refreshes) the foreground service without touching state flags. */
    public static void ensureRunning(Context ctx) {
        // A start is on its way, so cancel any pending release.
        releaseScheduled = false;
        MAIN.removeCallbacks(RELEASE_TASK);

        // Both the web keepalive and the native ticker report state every second or two. Once the
        // service is promoted, re-issuing startForegroundService() only churns ActivityManager
        // and widens the race window, so just refresh the notification.
        if (foreground) {
            refresh(ctx);
            return;
        }

        Intent intent = new Intent(ctx, MediaPlaybackService.class);
        intent.setAction(ACTION_START);
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                ctx.startForegroundService(intent);
            } else {
                ctx.startService(intent);
            }
        } catch (Exception e) {
            // Background start restrictions — playback still works while the app is visible.
            Log.w(TAG, "startForegroundService rejected", e);
        }
        refresh(ctx);
    }

    private static void release(Context ctx) {
        foreground = false;
        try {
            ctx.stopService(new Intent(ctx, MediaPlaybackService.class));
        } catch (Exception ignored) {
        }
    }

    /** Defers the release so an in-flight startForegroundService() can still be promoted. */
    private static void scheduleRelease(Context ctx) {
        releaseScheduled = true;
        MAIN.removeCallbacks(RELEASE_TASK);
        MAIN.postDelayed(RELEASE_TASK, RELEASE_DELAY_MS);
    }

    /** Called from the web layer when the media player starts playing. */
    public static void start(Context ctx, String title) {
        if (title != null && !title.trim().isEmpty()) currentTitle = title;
        mediaPlaying = true;
        ensureRunning(ctx);
    }

    public static void stop(Context ctx) {
        mediaPlaying = false;
        alarmActive = false;
        playbackRequested = false;
        cancelAlarmNotification(ctx);
        scheduleRelease(ctx);
    }

    /** Holds the service (and wakelock) open while an alarm/reminder is ringing. */
    public static void startAlarm(Context ctx, String label) {
        currentTitle = "Alarm - " + (label == null || label.trim().isEmpty() ? "Alert" : label.trim());
        alarmActive = true;
        // Web Audio creates its audio track, but on this WebView the track comes up muted unless
        // the app holds audio focus: `dumpsys audio` showed an empty focus stack while an
        // AudioTrack was already active, and the alarm played nothing. Grabbing focus here — before
        // asking the page to make any noise — is what makes it audible.
        requestAudioFocusForAlarm(ctx);
        // Start the native tone as well. This is the only thing guaranteed to be audible when the
        // app has been closed: the WebView renderer is gone in that state, so the web layer's
        // AudioEngine cannot make a sound at all. The page still takes over with the user's custom
        // sound when it is alive, and the native tone is what covers the case where it is not.
        startNativeAlarmTone(ctx);
        ensureRunning(ctx);
        postAlarmNotification(ctx);
        // The web layer owns the sound (custom MP3s live in its IndexedDB) and the ring UI, so ask
        // it to start. This is the path an OS-fired alarm takes, where no timer in the page ever
        // got the chance to run.
        MainActivity.dispatchMediaCommand("ringAlarm");
    }

    /**
     * Holds alarm-stream audio focus for a few seconds so a short UI preview is audible.
     *
 * <p>Previews are rendered by the page with Web Audio, which this WebView mutes unless the app owns
 * audio focus. A ringing alarm grabs focus on its own; this is the equivalent for a tap on a sound
 * in the picker, and it gives the focus back on its own so a preview can never hold onto it.
 */
    public static void previewTone(Context ctx) {
        sPreviewCtx = ctx.getApplicationContext();
        requestAudioFocusForAlarm(ctx);
        MAIN.removeCallbacks(RELEASE_PREVIEW_FOCUS);
        MAIN.postDelayed(RELEASE_PREVIEW_FOCUS, PREVIEW_FOCUS_MS);
    }

    private static Context sPreviewCtx;

    private static final Runnable RELEASE_PREVIEW_FOCUS = () -> {
        if (!alarmActive && sPreviewCtx != null) {
            abandonAudioFocusForAlarm(sPreviewCtx);
        }
    };

    private static final long PREVIEW_FOCUS_MS = 4000L;

    // ---- native alarm tone ----

    private static MediaPlayer sNativeTone;
    private static boolean sNativeToneFailed;

    /**
     * Plays a built-in alarm tone with {@link MediaPlayer}, looping until the alarm is dismissed.
     *
     * <p>This is deliberately independent of the WebView. Measured on a Galaxy A01 Core: with the
     * app closed, the notification posted and audio focus was granted, but nothing was audible
     * because the renderer that runs {@code AudioContext} no longer exists. A ringtone here is the
     * only sound the OS can make on the app's behalf.
     */
    private static void startNativeAlarmTone(Context ctx) {
        if (sNativeTone != null) return;
        if (sNativeToneFailed) return;

        try {
            Uri alarm = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);
            if (alarm == null) alarm = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
            if (alarm == null) {
                sNativeToneFailed = true;
                return;
            }

            MediaPlayer mp = new MediaPlayer();
            mp.setDataSource(ctx.getApplicationContext(), alarm);
            mp.setAudioAttributes(new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_ALARM)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build());
            mp.setLooping(true);
            mp.setOnErrorListener((p, what, extra) -> {
                // Keep looping by hand; setLooping does not survive a decode hiccup on some builds.
                try {
                    if (what == MediaPlayer.MEDIA_ERROR_UNKNOWN && extra == MediaPlayer.MEDIA_ERROR_UNKNOWN) {
                        p.seekTo(0);
                        p.start();
                        return true;
                    }
                } catch (Throwable ignored) {
                }
                return false;
            });
            mp.setOnCompletionListener(p -> {
                try {
                    p.seekTo(0);
                    p.start();
                } catch (Throwable ignored) {
                }
            });
            mp.prepare();
            mp.start();
            sNativeTone = mp;
            Log.i(TAG, "native alarm tone started");
        } catch (Throwable t) {
            sNativeToneFailed = true;
            Log.w(TAG, "native alarm tone unavailable: " + t.getMessage());
        }
    }

    public static void stopNativeAlarmTone() {
        MediaPlayer mp = sNativeTone;
        sNativeTone = null;
        if (mp == null) return;
        try {
            if (mp.isPlaying()) mp.stop();
        } catch (Throwable ignored) {
        }
        try {
            mp.release();
        } catch (Throwable ignored) {
        }
        Log.i(TAG, "native alarm tone stopped");
    }

    private static AudioFocusRequest sFocusRequest;

    private static void requestAudioFocusForAlarm(Context ctx) {
        AudioManager am = (AudioManager) ctx.getSystemService(Context.AUDIO_SERVICE);
        if (am == null) return;
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                if (sFocusRequest == null) {
                    sFocusRequest = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
                            .setAudioAttributes(new AudioAttributes.Builder()
                                    .setUsage(AudioAttributes.USAGE_ALARM)
                                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                                    .build())
                            .setOnAudioFocusChangeListener(focusChange -> {
                                if (focusChange == AudioManager.AUDIOFOCUS_LOSS) {
                                    cancelAlarmNotification(ctx);
                                }
                            })
                            .build();
                }
                am.requestAudioFocus(sFocusRequest);
            } else {
                am.requestAudioFocus(null, AudioManager.STREAM_ALARM, AudioManager.AUDIOFOCUS_GAIN_TRANSIENT);
            }
        } catch (Throwable t) {
            Log.w(TAG, "audio focus request failed", t);
        }
    }

    private static void abandonAudioFocusForAlarm(Context ctx) {
        AudioManager am = (AudioManager) ctx.getSystemService(Context.AUDIO_SERVICE);
        if (am == null) return;
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                if (sFocusRequest != null) am.abandonAudioFocusRequest(sFocusRequest);
            } else {
                am.abandonAudioFocus(null);
            }
        } catch (Throwable ignored) {
        }
    }

    /** Releases only the alarm hold — media playback, if active, keeps the service alive. */
    public static void stopAlarm(Context ctx) {
        alarmActive = false;
        stopNativeAlarmTone();
        abandonAudioFocusForAlarm(ctx);
        cancelAlarmNotification(ctx);
        if (!mediaPlaying) {
            scheduleRelease(ctx);
        } else {
            releaseScheduled = false;
            MAIN.removeCallbacks(RELEASE_TASK);
            refresh(ctx);
        }
    }

    /** Called from the web layer whenever the player state changes. */
    public static void update(Context ctx, String state, String title) {
        if (title != null && !title.trim().isEmpty()) currentTitle = title;

        if ("playing".equals(state)) {
            // Start immediately (rather than waiting for onPause) so a background/lock-screen
            // transition can never race ahead of the foreground service.
            mediaPlaying = true;
            playbackRequested = true;
        } else {
            mediaPlaying = false;
        }

        if (mediaPlaying) {
            ensureRunning(ctx);
        } else {
            MAIN.removeCallbacks(KEEPALIVE_TASK);
            // Keep the playhead so the notification can resume where it left off, but hold the
            // service open while the user still wants audio: the embed pausing itself in the
            // background must not look like the user hitting stop.
            if (playbackRequested) {
                ensureRunning(ctx);
            } else {
                positionMs = 0;
                durationMs = 0;
                scheduleRelease(ctx);
            }
        }

        if (isPlaying()) {
            ensureRunning(ctx);
        } else {
            scheduleRelease(ctx);
        }
    }

    private static void refresh(Context ctx) {
        MediaPlaybackService svc = instance.get();
        if (svc == null) return;
        MAIN.post(() -> svc.postNotification());
    }

    /** Nudges the embed and advances the notification progress bar. */
    private void tickProgress() {
        if (!mediaPlaying) return;
        if (durationMs > 0) positionMs = Math.min(durationMs, positionMs + KEEPALIVE_INTERVAL_MS);
        postNotification();
    }

    @Override
    public void onCreate() {
        super.onCreate();
        instance = new WeakReference<>(this);
        createChannel();
        acquireWakeLock();
    }

    /** Keeps the CPU running so audio continues after the screen turns off. */
    private void acquireWakeLock() {
        if (wakeLock != null) return;
        try {
            PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
            if (pm == null) return;
            wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "BioPulse:MediaPlayback");
            wakeLock.setReferenceCounted(false);
            // Bounded so a leaked service can never drain the battery indefinitely.
            wakeLock.acquire(WAKE_LOCK_TIMEOUT_MS);
        } catch (Exception ignored) {
        }
    }

    private void releaseWakeLock() {
        try {
            if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        } catch (Exception ignored) {
        }
        wakeLock = null;
    }

    /**
     * Promotes to foreground immediately. Android 12+ aborts the process with
     * {@code RemoteServiceException} if {@code startForegroundService()} is not followed by
     * {@code startForeground()} promptly, so this must run before any state check — including
     * on the paths that end in {@code stopSelf()}.
     */
    private boolean promoteToForeground() {
        Notification notification;
        try {
            notification = buildNotification();
        } catch (Exception ignored) {
            return false;
        }
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(NOTIF_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
            } else {
                startForeground(NOTIF_ID, notification);
            }
            return true;
        } catch (Exception ignored) {
            // Type-specific promotion can be rejected (missing permission on some OEM builds) —
            // retry untyped so the startForegroundService() contract is still satisfied.
            try {
                startForeground(NOTIF_ID, notification);
                return true;
            } catch (Exception ignoredAgain) {
                Log.e(TAG, "startForeground failed", ignoredAgain);
                return false;
            }
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent != null && intent.getAction() != null ? intent.getAction() : ACTION_START;

        if (ACTION_PLAY.equals(action)) {
            mediaPlaying = true;
            MainActivity.dispatchMediaCommand("play");
        } else if (ACTION_PAUSE.equals(action)) {
            mediaPlaying = false;
            playbackRequested = false;
            MainActivity.dispatchMediaCommand("pause");
        } else if (ACTION_STOP.equals(action)) {
            mediaPlaying = false;
            alarmActive = false;
            playbackRequested = false;
            stopNativeAlarmTone();
            abandonAudioFocusForAlarm(this);
            cancelAlarmNotification(this);
            MainActivity.dispatchMediaCommand("stop");
        } else if (ACTION_DISMISS_ALARM.equals(action)) {
            // Dismiss from the notification: stop the ringing UI, drop the alarm hold and take the
            // lock-screen popup away. Media playback, if it is running, is left alone.
            alarmActive = false;
            stopNativeAlarmTone();
            abandonAudioFocusForAlarm(this);
            cancelAlarmNotification(this);
            MainActivity.dispatchMediaCommand("dismissAlarm");
            if (mediaPlaying) {
                refresh(this);
            } else {
                scheduleRelease(this);
            }
            return START_NOT_STICKY;
        }

        // Promote first, reconcile afterwards. Playback state can flip between the
        // startForegroundService() call and this delivery, and skipping the promotion on that
        // path is what used to crash the app.
        boolean promoted = promoteToForeground();
        Log.i(TAG, "onStartCommand action=" + action + " promoted=" + promoted + " playing=" + isPlaying());

        if (!promoted || !isPlaying()) {
            // Nothing worth keeping. Release asynchronously so a concurrent start request is
            // never cancelled mid-flight.
            stopSelf();
            if (!isPlaying()) releaseScheduled = true;
            return START_NOT_STICKY;
        }

        // Refresh the notification so the title/actions match the reconciled state.
        postNotification();
        // Drive the embed from here: background JS timers are throttled far too heavily to keep
        // YouTube's audio alive on their own.
        MAIN.removeCallbacks(KEEPALIVE_TASK);
        if (mediaPlaying) MAIN.postDelayed(KEEPALIVE_TASK, KEEPALIVE_INTERVAL_MS);
        return START_NOT_STICKY;
    }

    private void postNotification() {
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (nm != null) {
            try {
                nm.notify(NOTIF_ID, buildNotification());
            } catch (Exception ignored) {
            }
        }
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (nm == null) return;
        if (nm.getNotificationChannel(CHANNEL_ID) == null) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "Media playback",
                NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("Keeps videos playing while BioPulse is in the background");
            channel.setShowBadge(false);
            channel.setSound(null, null);
            nm.createNotificationChannel(channel);
        }
        createAlarmChannel(nm);
    }

    /**
     * Alarm channel: high importance so it produces a heads-up popup and vibrates, with no
     * notification sound because the alarm tone itself is synthesised by Web Audio — a channel
     * sound would play on top of it.
     */
    private static void createAlarmChannel(NotificationManager nm) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationChannel existing = nm.getNotificationChannel(ALARM_CHANNEL_ID);
        if (existing != null) {
            // An older install may have created this channel at a lower importance; the importance
            // of a channel cannot be raised after creation, so replace it.
            if (existing.getImportance() >= NotificationManager.IMPORTANCE_HIGH) return;
            nm.deleteNotificationChannel(ALARM_CHANNEL_ID);
        }
        NotificationChannel channel = new NotificationChannel(
            ALARM_CHANNEL_ID,
            "Alarms & reminders",
            NotificationManager.IMPORTANCE_HIGH
        );
        channel.setDescription("Wakes you when an alarm or reminder fires");
        channel.enableVibration(true);
        channel.setVibrationPattern(ALARM_VIBRATE);
        channel.setSound(null, null);
        channel.setBypassDnd(false);
        channel.setShowBadge(true);
        nm.createNotificationChannel(channel);
    }

    private static void postAlarmNotification(Context ctx) {
        NotificationManager nm = (NotificationManager) ctx.getSystemService(NOTIFICATION_SERVICE);
        if (nm == null || Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        createAlarmChannel(nm);

        Intent open = new Intent(ctx, MainActivity.class);
        open.setAction(Intent.ACTION_MAIN);
        open.addCategory(Intent.CATEGORY_LAUNCHER);
        open.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT
            | Intent.FLAG_ACTIVITY_NEW_TASK);
        int openFlags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) openFlags |= PendingIntent.FLAG_IMMUTABLE;
        PendingIntent contentIntent = PendingIntent.getActivity(ctx, REQ_ALARM_OPEN, open, openFlags);

        NotificationCompat.Builder b = new NotificationCompat.Builder(ctx, ALARM_CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
            .setContentTitle(currentTitle)
            .setContentText("Tap to open BioPulse")
            .setContentIntent(contentIntent)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            // The lock-screen takeover. Without this the alarm is just another row in the shade.
            .setFullScreenIntent(contentIntent, true)
            .setVibrate(ALARM_VIBRATE)
            .setDefaults(0)
            .setSilent(false)
            .setAutoCancel(false)
            .setOngoing(true)
            .setShowWhen(true)
            .setUsesChronometer(true)
            .setWhen(System.currentTimeMillis());

        b.addAction(
            android.R.drawable.ic_menu_close_clear_cancel,
            "Dismiss",
            actionIntent(ctx, ACTION_DISMISS_ALARM, REQ_DISMISS_ALARM)
        );

        try {
            nm.notify(ALARM_NOTIF_ID, b.build());
        } catch (Exception e) {
            Log.e(TAG, "alarm notification failed", e);
        }
    }

    private static void cancelAlarmNotification(Context ctx) {
        try {
            NotificationManager nm = (NotificationManager) ctx.getSystemService(NOTIFICATION_SERVICE);
            if (nm != null) nm.cancel(ALARM_NOTIF_ID);
        } catch (Exception ignored) {
        }
    }

    private static String formatTime(long ms) {
        long total = Math.max(0, ms) / 1000L;
        long h = total / 3600L;
        long m = (total % 3600L) / 60L;
        long s = total % 60L;
        if (h > 0) return String.format("%d:%02d:%02d", h, m, s);
        return String.format("%d:%02d", m, s);
    }

    private PendingIntent actionIntent(String action, int requestCode) {
        return actionIntent(this, action, requestCode);
    }

    private static PendingIntent actionIntent(Context ctx, String action, int requestCode) {
        Intent intent = new Intent(ctx, MediaPlaybackService.class);
        intent.setAction(action);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) flags |= PendingIntent.FLAG_IMMUTABLE;
        return PendingIntent.getService(ctx, requestCode, intent, flags);
    }

    private Notification buildNotification() {
        Intent open = new Intent(this, MainActivity.class);
        open.setAction(Intent.ACTION_MAIN);
        open.addCategory(Intent.CATEGORY_LAUNCHER);
        open.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);
        int openFlags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) openFlags |= PendingIntent.FLAG_IMMUTABLE;
        PendingIntent contentIntent = PendingIntent.getActivity(this, 10, open, openFlags);

        NotificationCompat.Builder b = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_media_play)
            .setContentTitle(currentTitle)
            .setContentText(isPlaying() ? "Playing in the background" : "Paused")
            .setContentIntent(contentIntent)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setCategory(NotificationCompat.CATEGORY_TRANSPORT)
            .setOngoing(isPlaying())
            .setOnlyAlertOnce(true)
            .setSilent(true)
            .setShowWhen(false);

        if (mediaPlaying && durationMs > 0) {
            int pos = (int) Math.min(positionMs, durationMs);
            b.setProgress((int) durationMs, pos, false);
        } else {
            b.setProgress(0, 0, false);
        }

        if (mediaPlaying) {
            if (durationMs > 0) {
                b.setSubText(formatTime(positionMs) + " / " + formatTime(durationMs));
            }
            b.addAction(
                android.R.drawable.ic_media_pause,
                "Pause",
                actionIntent(ACTION_PAUSE, REQ_PAUSE)
            );
        } else {
            b.setSubText(null);
            b.addAction(android.R.drawable.ic_media_play, "Play", actionIntent(ACTION_PLAY, REQ_PLAY));
        }
        b.addAction(android.R.drawable.ic_delete, "Stop", actionIntent(ACTION_STOP, REQ_STOP));

        return b.build();
    }

    @Override
    public void onDestroy() {
        Log.i(TAG, "onDestroy playing=" + mediaPlaying + " pos=" + positionMs);
        // The alarm hold keeps the service alive, so reaching here means the ringing is over by
        // some other route (process teardown, a stop action). Never leave a tone playing with no
        // service behind it.
        if (!mediaPlaying) {
            stopNativeAlarmTone();
        }
        foreground = false;
        MAIN.removeCallbacks(KEEPALIVE_TASK);
        MAIN.removeCallbacks(RELEASE_TASK);
        releaseWakeLock();
        instance = new WeakReference<>(null);
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                stopForeground(STOP_FOREGROUND_REMOVE);
            } else {
                stopForeground(true);
            }
        } catch (Exception ignored) {
        }
        super.onDestroy();
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}