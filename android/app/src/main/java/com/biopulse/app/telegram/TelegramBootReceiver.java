package com.biopulse.app.telegram;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/**
 * Brings the Telegram notification service back after a reboot or an app update so messages keep
 * arriving even with the app closed. The service itself is a no-op until TDLib is signed in.
 */
public class TelegramBootReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context context, Intent intent) {
        if (context == null || intent == null) return;
        String action = intent.getAction();
        if (Intent.ACTION_BOOT_COMPLETED.equals(action)
                || Intent.ACTION_MY_PACKAGE_REPLACED.equals(action)
                || "android.intent.action.QUICKBOOT_POWERON".equals(action)) {
            TelegramService.ensureRunning(context.getApplicationContext());
            // Older builds held a second "Telegram connected" media foreground service here; its
            // card lingered in the shade forever. TelegramService above is the one that delivers
            // background messages now, so drop the stale flag instead of restoring it.
            context.getSharedPreferences("bp_prefs", Context.MODE_PRIVATE)
                    .edit()
                    .remove("tg_keepalive")
                    .apply();
        }
    }
}
