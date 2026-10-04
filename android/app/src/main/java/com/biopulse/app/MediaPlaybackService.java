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
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;

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

    private static final String CHANNEL_ID = "biopulse_media";
    private static final int NOTIF_ID = 0x8A11;
    private static final int REQ_PLAY = 11;
    private static final int REQ_PAUSE = 12;
    private static final int REQ_STOP = 13;

    private static final Handler MAIN = new Handler(Looper.getMainLooper());
    private static WeakReference<MediaPlaybackService> instance = new WeakReference<>(null);

    private PowerManager.WakeLock wakeLock;

    private static String currentTitle = "BioPulse Player";
    private static boolean currentPlaying = false;

    public static boolean isPlaying() {
        return currentPlaying;
    }

    public static String currentTitle() {
        return currentTitle;
    }

    /** Starts (or refreshes) the foreground service and marks playback as active. */
    public static void start(Context ctx, String title) {
        if (title != null && !title.trim().isEmpty()) currentTitle = title;
        currentPlaying = true;
        Intent intent = new Intent(ctx, MediaPlaybackService.class);
        intent.setAction(ACTION_START);
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                ctx.startForegroundService(intent);
            } else {
                ctx.startService(intent);
            }
        } catch (Exception ignored) {
            // Background start restrictions — playback still works while the app is visible.
        }
        refresh(ctx);
    }

    public static void stop(Context ctx) {
        try {
            ctx.stopService(new Intent(ctx, MediaPlaybackService.class));
        } catch (Exception ignored) {
        }
    }

    /** Called from the web layer whenever the player state changes. */
    public static void update(Context ctx, String state, String title) {
        if (title != null && !title.trim().isEmpty()) currentTitle = title;

        if ("playing".equals(state)) {
            // Start immediately (rather than waiting for onPause) so a background/lock-screen
            // transition can never race ahead of the foreground service.
            start(ctx, title);
        } else {
            currentPlaying = false;
            MediaPlaybackService svc = instance.get();
            if (svc != null) {
                MAIN.post(() -> svc.stopSelf());
            }
        }
    }

    private static void refresh(Context ctx) {
        MediaPlaybackService svc = instance.get();
        if (svc == null) return;
        MAIN.post(() -> svc.postNotification());
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

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent != null && intent.getAction() != null ? intent.getAction() : ACTION_START;

        if (ACTION_PLAY.equals(action)) {
            currentPlaying = true;
            MainActivity.dispatchMediaCommand("play");
        } else if (ACTION_PAUSE.equals(action)) {
            currentPlaying = false;
            MainActivity.dispatchMediaCommand("pause");
        } else if (ACTION_STOP.equals(action)) {
            currentPlaying = false;
            MainActivity.dispatchMediaCommand("pause");
        }

        if (!currentPlaying && ACTION_START.equals(action)) {
            // Nothing is playing — do not hold a foreground service open needlessly.
            stopSelf();
            return START_NOT_STICKY;
        }

        Notification notification = buildNotification();
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(NOTIF_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
            } else {
                startForeground(NOTIF_ID, notification);
            }
        } catch (Exception ignored) {
            stopSelf();
            return START_NOT_STICKY;
        }

        if (ACTION_PAUSE.equals(action) || ACTION_STOP.equals(action)) {
            stopSelf();
            return START_NOT_STICKY;
        }
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
        if (nm == null || nm.getNotificationChannel(CHANNEL_ID) != null) return;
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

    private PendingIntent actionIntent(String action, int requestCode) {
        Intent intent = new Intent(this, MediaPlaybackService.class);
        intent.setAction(action);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) flags |= PendingIntent.FLAG_IMMUTABLE;
        return PendingIntent.getService(this, requestCode, intent, flags);
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
            .setContentText(currentPlaying ? "Playing in the background" : "Paused")
            .setContentIntent(contentIntent)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setCategory(NotificationCompat.CATEGORY_TRANSPORT)
            .setOngoing(currentPlaying)
            .setOnlyAlertOnce(true)
            .setSilent(true)
            .setShowWhen(false);

        if (currentPlaying) {
            b.addAction(
                android.R.drawable.ic_media_pause,
                "Pause",
                actionIntent(ACTION_PAUSE, REQ_PAUSE)
            );
        } else {
            b.addAction(android.R.drawable.ic_media_play, "Play", actionIntent(ACTION_PLAY, REQ_PLAY));
        }
        b.addAction(android.R.drawable.ic_delete, "Stop", actionIntent(ACTION_STOP, REQ_STOP));

        return b.build();
    }

    @Override
    public void onDestroy() {
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