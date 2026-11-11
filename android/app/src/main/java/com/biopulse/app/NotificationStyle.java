package com.biopulse.app;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;

import androidx.core.app.NotificationCompat;

/**
 * One visual identity for every BioPulse notification, so alarms, reminders, class alerts and
 * messages read the same on the lock screen and in the notification panel: the pulse glyph, the
 * app's purple accent, the app icon, and content marked public so the card is not reduced to
 * "contents hidden" on a locked device.
 */
public final class NotificationStyle {

    /** Tailwind {@code --primary} (258 90% 66%) — the accent used across the app. */
    public static final int COLOR = 0xFF8B5CF6;

    private NotificationStyle() {
    }

    public static NotificationCompat.Builder builder(Context ctx, String channelId) {
        return new NotificationCompat.Builder(ctx, channelId)
                .setSmallIcon(R.drawable.ic_stat_biopulse)
                .setColor(COLOR)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setShowWhen(true);
    }

    /** The app logo as the large icon — the image shown beside the card on the lock screen. */
    public static void setAppIcon(NotificationCompat.Builder b, Context ctx) {
        try {
            // The adaptive launcher icon is an XML drawable on API 26+, which BitmapFactory
            // cannot decode; the foreground bitmap exists in every density and works everywhere.
            Bitmap icon = BitmapFactory.decodeResource(ctx.getResources(),
                    R.mipmap.ic_launcher_foreground);
            if (icon == null) {
                icon = BitmapFactory.decodeResource(ctx.getResources(), R.mipmap.ic_launcher);
            }
            if (icon != null) b.setLargeIcon(icon);
        } catch (Throwable ignored) {
        }
    }
}
