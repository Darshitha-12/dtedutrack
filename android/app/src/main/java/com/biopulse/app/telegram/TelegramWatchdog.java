package com.biopulse.app.telegram;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.util.Log;

/**
 * Re-arms the Telegram notification service when the OEM power manager kills it.
 *
 * <p>Without server-side push the only way a message is delivered is TDLib's socket, which needs
 * the process alive. Samsung (and Android Go) can still stop a foreground service after a while;
 * START_STICKY alone is not reliable there, and the restart would otherwise wait until the user
 * opens the app — which is exactly why messages "arrive late". A lightweight exact alarm every
 * fifteen minutes makes sure the service is back promptly even if the app is never opened.
 */
public final class TelegramWatchdog extends BroadcastReceiver {

    private static final String TAG = "BioPulseTgWatchdog";
    private static final int REQUEST_CODE = 4720;
    private static final long INTERVAL_MS = 15L * 60L * 1000L;

    public TelegramWatchdog() {
    }

    public static void schedule(Context ctx) {
        Context app = ctx.getApplicationContext();
        AlarmManager am = (AlarmManager) app.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) flags |= PendingIntent.FLAG_IMMUTABLE;
        PendingIntent pi = PendingIntent.getBroadcast(app, REQUEST_CODE,
                new Intent(app, TelegramWatchdog.class), flags);
        long at = System.currentTimeMillis() + INTERVAL_MS;
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                // Exact when permitted: an exact alarm is also one of the few cases where Android
                // 12+ lets the broadcast start a foreground service from the background.
                am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
            } else {
                am.setExact(AlarmManager.RTC_WAKEUP, at, pi);
            }
        } catch (Throwable t) {
            try {
                am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
            } catch (Throwable ignored) {
                Log.w(TAG, "watchdog could not be armed", t);
            }
        }
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        if (context == null) return;
        TelegramService.ensureRunning(context.getApplicationContext());
        schedule(context);
    }
}
