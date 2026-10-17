package com.biopulse.app.telegram;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;
import android.util.Log;

import androidx.core.app.NotificationCompat;

import com.biopulse.app.R;

/**
 * Per-message notifications for the Telegram Web client. Telegram Web calls the browser
 * {@code Notification} API for incoming messages while the page is hidden; the WebView has no such
 * API, so {@link TelegramWebActivity} injects a shim that forwards those calls here, and this turns
 * them into real Android notifications that survive the app being backgrounded.
 */
public final class TelegramNotifications {

    private static final String TAG = "BioPulseTgNotif";
    private static final String CHANNEL_ID = "tg_messages_v3";

    private TelegramNotifications() {
    }

    private static Uri messageSound(Context ctx) {
        return Uri.parse("android.resource://" + ctx.getPackageName() + "/" + R.raw.bp_tone_ios);
    }

    public static void ensureChannel(Context ctx) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm =
                (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null || nm.getNotificationChannel(CHANNEL_ID) != null) return;
        NotificationChannel c = new NotificationChannel(
                CHANNEL_ID, "Telegram messages", NotificationManager.IMPORTANCE_HIGH);
        c.setDescription("Live notifications for new Telegram messages");
        c.enableVibration(true);
        c.setShowBadge(true);
        c.setSound(messageSound(ctx), new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build());
        nm.createNotificationChannel(c);
    }

    public static void post(Context ctx, int id, String title, String body) {
        ensureChannel(ctx);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
                && ctx.checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS)
                != PackageManager.PERMISSION_GRANTED) {
            return;
        }
        NotificationManager nm =
                (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;

        Intent open = new Intent(ctx, TelegramWebActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP
                | Intent.FLAG_ACTIVITY_NEW_TASK);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) flags |= PendingIntent.FLAG_IMMUTABLE;
        PendingIntent pi = PendingIntent.getActivity(ctx, 0x7A0000 + (id & 0xFFFF), open, flags);

        String t = title == null || title.trim().isEmpty() ? "Telegram" : title.trim();
        NotificationCompat.Builder b = new NotificationCompat.Builder(ctx, CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_stat_telegram)
                .setContentTitle(t)
                .setContentText(body == null ? "" : body)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(body == null ? "" : body))
                .setContentIntent(pi)
                .setCategory(NotificationCompat.CATEGORY_MESSAGE)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setAutoCancel(true)
                .setShowWhen(true)
                .setWhen(System.currentTimeMillis());
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            b.setSound(messageSound(ctx));
        }
        try {
            nm.notify(id, b.build());
        } catch (Exception e) {
            Log.e(TAG, "notify failed", e);
        }
    }

    public static Notification buildForeground(Context ctx) {
        ensureChannel(ctx);
        NotificationCompat.Builder b = new NotificationCompat.Builder(ctx, CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_stat_telegram)
                .setContentTitle("Telegram")
                .setContentText("Connected")
                .setPriority(NotificationCompat.PRIORITY_MIN)
                .setOngoing(true);
        return b.build();
    }
}
