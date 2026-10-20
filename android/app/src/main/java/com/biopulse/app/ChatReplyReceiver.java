package com.biopulse.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.util.Log;
import android.webkit.CookieManager;

import androidx.core.app.NotificationManagerCompat;
import androidx.core.app.RemoteInput;

import org.json.JSONObject;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/**
 * Handles the inline "Reply" action on a BioPulse direct-message notification.
 *
 * <p>It reads the typed text from the {@link RemoteInput} and posts it back to the chat API so the
 * user does not have to reopen the app. The WebView serves the offline bundle from Capacitor's
 * local origin and holds no NextAuth cookie for the deployed site, so the request authenticates
 * with the account device token that the page handed to the native layer
 * ({@code BioPulseBridge.setChatAuth}); a WebView cookie is still sent when one exists. The
 * notification is cleared once the message is accepted, which is what makes quick reply send.
 */
public class ChatReplyReceiver extends BroadcastReceiver {

    public static final String KEY_REPLY = "bp_dm_reply_text";
    public static final String EXTRA_PARTNER_ID = "bp_partner_id";
    public static final String EXTRA_NOTIF_ID = "bp_notif_id";

    /** SharedPreferences holding the device token handed over by the WebView. */
    public static final String PREFS = "biopulse_chat";
    public static final String KEY_TOKEN = "device_token";
    public static final String KEY_BASE = "server_base";

    private static final String TAG = "BioPulseDmReply";
    /** Fallback origin when the page has not handed one over yet. */
    private static final String DEFAULT_BASE_URL = "https://biopulse-study.netlify.app";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null) return;

        CharSequence typed = null;
        Bundle results = RemoteInput.getResultsFromIntent(intent);
        if (results != null) typed = results.getCharSequence(KEY_REPLY);
        if (typed == null) return;
        final String text = typed.toString().trim();
        if (text.isEmpty()) return;

        final String partnerId = intent.getStringExtra(EXTRA_PARTNER_ID);
        if (partnerId == null || partnerId.isEmpty()) return;
        final int notifId = intent.getIntExtra(EXTRA_NOTIF_ID, 0);

        final Context app = context.getApplicationContext();

        // A BroadcastReceiver must not block, so the send runs on a short-lived worker thread.
        new Thread(() -> {
            boolean ok = send(app, partnerId, text);
            Log.i(TAG, ok ? "quick reply sent" : "quick reply failed");
            if (ok && notifId != 0) {
                try {
                    NotificationManagerCompat.from(app).cancel(notifId);
                } catch (Throwable ignored) {
                }
            }
            // On failure the notification stays up so the user can open the app and retry.
        }, "bp-dm-reply").start();
    }

    private static boolean send(Context app, String partnerId, String text) {
        HttpURLConnection conn = null;
        try {
            String base = DEFAULT_BASE_URL;
            String token = "";
            try {
                SharedPreferences p = app.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
                String storedBase = p.getString(KEY_BASE, "");
                if (storedBase != null && !storedBase.isEmpty()) {
                    base = storedBase.replaceAll("/+$", "");
                }
                String storedToken = p.getString(KEY_TOKEN, "");
                if (storedToken != null) token = storedToken;
            } catch (Throwable ignored) {
                // Fall back to the default origin; the reply may still work via the cookie.
            }

            String cookie = CookieManager.getInstance().getCookie(base);
            URL url = new URL(base + "/api/chat/messages");
            conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("POST");
            conn.setConnectTimeout(15000);
            conn.setReadTimeout(20000);
            conn.setDoOutput(true);
            conn.setRequestProperty("Content-Type", "application/json; charset=utf-8");
            conn.setRequestProperty("Accept", "application/json");
            conn.setRequestProperty("Origin", base);
            conn.setRequestProperty("Referer", base + "/chat");
            if (!token.isEmpty()) conn.setRequestProperty("Authorization", "Bearer " + token);
            if (cookie != null && !cookie.isEmpty()) conn.setRequestProperty("Cookie", cookie);

            JSONObject body = new JSONObject();
            body.put("partnerId", partnerId);
            body.put("text", text);

            byte[] bytes = body.toString().getBytes(StandardCharsets.UTF_8);
            conn.setFixedLengthStreamingMode(bytes.length);
            try (OutputStream os = conn.getOutputStream()) {
                os.write(bytes);
            }
            int code = conn.getResponseCode();
            return code >= 200 && code < 300;
        } catch (Throwable t) {
            Log.w(TAG, "quick reply request failed", t);
            return false;
        } finally {
            if (conn != null) conn.disconnect();
        }
    }
}
