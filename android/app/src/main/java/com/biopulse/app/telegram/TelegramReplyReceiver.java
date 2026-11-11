package com.biopulse.app.telegram;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;

import androidx.core.app.NotificationManagerCompat;
import androidx.core.app.RemoteInput;

/**
 * Handles the inline "Reply" action on a Telegram message notification: reads the typed text from
 * the {@link RemoteInput}, sends it through the native TDLib session and dismisses the notification.
 */
public class TelegramReplyReceiver extends BroadcastReceiver {

    public static final String KEY_REPLY = "tg_reply_text";
    public static final String EXTRA_CHAT_ID = "chatId";
    public static final String EXTRA_NOTIF_ID = "notifId";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null) return;

        CharSequence text = null;
        Bundle results = RemoteInput.getResultsFromIntent(intent);
        if (results != null) {
            text = results.getCharSequence(KEY_REPLY);
        }
        if (text == null || text.length() == 0) return;

        long chatId = intent.getLongExtra(EXTRA_CHAT_ID, 0L);
        if (chatId == 0L) return;

        Context app = context.getApplicationContext();
        TelegramNative.init(app);
        TelegramNative.sendText(chatId, text.toString());

        int notifId = intent.getIntExtra(EXTRA_NOTIF_ID, 0);
        if (notifId != 0) {
            try {
                NotificationManagerCompat.from(app).cancel(notifId);
            } catch (Throwable ignored) {
            }
        }
    }
}
