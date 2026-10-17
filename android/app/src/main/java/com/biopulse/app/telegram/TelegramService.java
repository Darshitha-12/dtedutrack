package com.biopulse.app.telegram;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;

import androidx.core.app.NotificationCompat;
import androidx.core.app.Person;
import androidx.core.app.RemoteInput;
import androidx.core.graphics.drawable.IconCompat;
import androidx.core.graphics.drawable.RoundedBitmapDrawable;
import androidx.core.graphics.drawable.RoundedBitmapDrawableFactory;

import org.drinkless.tdlib.TdApi;

import com.biopulse.app.MainActivity;
import com.biopulse.app.R;

/**
 * Foreground service that keeps TDLib initialised and turns incoming Telegram messages into
 * heads-up notifications. Tapping a notification opens the chat inside the native client.
 */
public class TelegramService extends Service implements TelegramRepo.Listener {

    private static final String TAG = "BioPulseTgService";
    private static final String CHANNEL_ID = "tg_messages_v3";
    private static final String CHANNEL_SERVICE = "tg_service";
    private static final int FOREGROUND_ID = 4711;
    private static final int ACCENT = 0xFF2AABEE;

    // Per-chat history so a burst of messages from one chat shows all of them in the notification
    // (like the official app) instead of the newest overwriting the rest. Capped so the shade
    // never grows unbounded.
    private static final int MAX_HISTORY = 10;
    private static final java.util.Map<Long, java.util.List<Msg>> HISTORY =
            new java.util.concurrent.ConcurrentHashMap<>();

    private static final class Msg {
        final CharSequence text;
        final long when;
        final String who;

        Msg(CharSequence text, long when, String who) {
            this.text = text == null ? "" : text;
            this.when = when;
            this.who = who;
        }
    }

    private PowerManager.WakeLock wakeLock;

    public static void ensureRunning(Context ctx) {
        if (ctx == null) return;
        try {
            Intent i = new Intent(ctx, TelegramService.class);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                ctx.startForegroundService(i);
            } else {
                ctx.startService(i);
            }
        } catch (Throwable ignored) {
        }
    }

    @Override
    public void onCreate() {
        super.onCreate();
        createChannel();
        startForegroundInternal();
        acquireWakeLock();
        TelegramNative.init(getApplicationContext());
        TelegramRepo.get().addListener(this);
    }

    @Override
    public int onStartCommand(Intent intent, int startCmdFlags, int startId) {
        startForegroundInternal();
        acquireWakeLock();
        TelegramNative.init(getApplicationContext());
        return START_STICKY;
    }

    /**
     * Keeps the CPU awake so TDLib's socket and its keep-alive pings keep running (and messages are
     * delivered in real time) even when the screen is off or the OEM power manager would otherwise
     * freeze the process in Doze.
     */
    private void acquireWakeLock() {
        try {
            PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
            if (pm == null) return;
            if (wakeLock == null) {
                wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "BioPulse:TgService");
                wakeLock.setReferenceCounted(false);
            }
            if (!wakeLock.isHeld()) wakeLock.acquire();
        } catch (Throwable ignored) {
        }
    }

    private void releaseWakeLock() {
        try {
            if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        } catch (Throwable ignored) {
        }
    }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        try {
            Intent restart = new Intent(getApplicationContext(), TelegramService.class);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                getApplicationContext().startForegroundService(restart);
            } else {
                getApplicationContext().startService(restart);
            }
        } catch (Throwable ignored) {
        }
        super.onTaskRemoved(rootIntent);
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        TelegramRepo.get().removeListener(this);
        releaseWakeLock();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onChatsChanged() {
        // not used
    }

    @Override
    public void onMessageForChat(long chatId, TdApi.Message message) {
        if (message == null || message.isOutgoing) return;
        notifyMessage(chatId, message);
    }

    private void notifyMessage(long chatId, TdApi.Message message) {
        // While the full Telegram Web UI is on screen the user is already looking at Telegram.
        if (TelegramWebActivity.isForeground()) return;

        // Respect the chat's own mute setting (and its default scope) exactly like official clients.
        if (TelegramRepo.get().isMuted(chatId)) return;

        final String title = TelegramRepo.get().chatTitle(chatId);
        final String who = (title == null || title.isEmpty()) ? "Telegram" : title;
        final String body = TelegramNative.contentText(message.content);
        final long when = message.date * 1000L;

        rememberMessage(chatId, who, body, when);
        postMessage(chatId, who, when, null);
        TelegramAvatarCache.get().get(chatId, (cid, bmp) -> {
            if (bmp != null && !TelegramWebActivity.isForeground()) {
                postMessage(cid, who, when, bmp);
            }
        });
    }

    /** Appends a message to this chat's notification history, keeping only the most recent ones. */
    private void rememberMessage(long chatId, String who, CharSequence body, long when) {
        java.util.List<Msg> list = HISTORY.get(chatId);
        if (list == null) {
            list = java.util.Collections.synchronizedList(new java.util.ArrayList<Msg>());
            java.util.List<Msg> existing = HISTORY.putIfAbsent(chatId, list);
            if (existing != null) list = existing;
        }
        synchronized (list) {
            list.add(new Msg(body, when, who));
            while (list.size() > MAX_HISTORY) list.remove(0);
        }
    }

    /** Rebuilds the whole conversation from history so every recent message stays visible. */
    private void postMessage(long chatId, String who, long when, Bitmap avatar) {
        try {
            // Open the same Telegram Web window the in-app button uses, deep-linked to this chat.
            Intent open = new Intent(this, TelegramWebActivity.class);
            open.putExtra("chatId", chatId);
            open.putExtra("title", who);
            open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK
                    | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);

            int flags = PendingIntent.FLAG_UPDATE_CURRENT;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                flags |= PendingIntent.FLAG_IMMUTABLE;
            }
            final int id = (int) (chatId & 0x7fffffff) + 1000;
            PendingIntent pi = PendingIntent.getActivity(this, id, open, flags);

            RemoteInput remoteInput = new RemoteInput.Builder(TelegramReplyReceiver.KEY_REPLY)
                    .setLabel("Reply")
                    .build();
            Intent replyIntent = new Intent(this, TelegramReplyReceiver.class);
            replyIntent.putExtra(TelegramReplyReceiver.EXTRA_CHAT_ID, chatId);
            replyIntent.putExtra(TelegramReplyReceiver.EXTRA_NOTIF_ID, id);
            int replyFlags = PendingIntent.FLAG_UPDATE_CURRENT;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                replyFlags |= PendingIntent.FLAG_MUTABLE;
            }
            PendingIntent replyPi = PendingIntent.getBroadcast(this, id, replyIntent, replyFlags);
            NotificationCompat.Action replyAction = new NotificationCompat.Action.Builder(
                    R.drawable.ic_tg_reply, "Reply", replyPi)
                    .addRemoteInput(remoteInput)
                    .setAllowGeneratedReplies(true)
                    .build();

            Bitmap circle = circular(avatar);
            Person me = new Person.Builder().setName("You").build();
            Person them = buildPerson(who, circle);

            NotificationCompat.MessagingStyle style = new NotificationCompat.MessagingStyle(me);
            java.util.List<Msg> history = HISTORY.get(chatId);
            if (history != null) {
                synchronized (history) {
                    for (Msg m : history) {
                        style.addMessage(m.text, m.when, buildPerson(m.who, circle));
                    }
                }
            }
            if (style.getMessages().isEmpty()) {
                style.addMessage("", when, them);
            }

            NotificationCompat.Builder b = new NotificationCompat.Builder(this, CHANNEL_ID)
                    .setSmallIcon(R.drawable.ic_stat_telegram)
                    .setStyle(style)
                    .setColor(ACCENT)
                    .setColorized(true)
                    .setWhen(when)
                    .setShowWhen(true)
                    .setAutoCancel(true)
                    .setGroup("tg_chat_" + chatId)
                    .setPriority(NotificationCompat.PRIORITY_HIGH)
                    .setCategory(NotificationCompat.CATEGORY_MESSAGE)
                    .setContentIntent(pi)
                    .addAction(replyAction);
            if (circle != null) b.setLargeIcon(circle);
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
                b.setSound(Uri.parse("android.resource://" + getPackageName()
                        + "/" + R.raw.bp_tone_ios));
            }

            NotificationManager nm =
                    (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) nm.notify(id, b.build());
        } catch (Throwable t) {
            android.util.Log.w("BioPulseTgService", "notify failed", t);
        }
    }

    private static Person buildPerson(String name, Bitmap icon) {
        Person.Builder pb = new Person.Builder()
                .setName(name == null || name.isEmpty() ? "Telegram" : name);
        if (icon != null) pb.setIcon(IconCompat.createWithBitmap(icon));
        return pb.build();
    }

    private Bitmap circular(Bitmap src) {
        if (src == null) return null;
        try {
            int size = Math.min(src.getWidth(), src.getHeight());
            if (size <= 0) return src;
            Bitmap out = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888);
            RoundedBitmapDrawable d = RoundedBitmapDrawableFactory.create(getResources(), src);
            d.setAntiAlias(true);
            d.setCircular(true);
            d.setBounds(0, 0, size, size);
            d.draw(new Canvas(out));
            return out;
        } catch (Throwable t) {
            return src;
        }
    }

    private void startForegroundInternal() {
        NotificationCompat.Builder b = new NotificationCompat.Builder(this, CHANNEL_SERVICE)
                .setSmallIcon(R.drawable.ic_stat_telegram)
                .setContentTitle("Telegram")
                .setContentText("Notifications active")
                .setPriority(NotificationCompat.PRIORITY_MIN)
                .setOngoing(true);

        Intent open = new Intent(this, MainActivity.class);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }
        b.setContentIntent(PendingIntent.getActivity(this, 0, open, flags));

        Notification n = b.build();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(FOREGROUND_ID, n,
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
        } else {
            startForeground(FOREGROUND_ID, n);
        }
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm =
                (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        NotificationChannel c = new NotificationChannel(
                CHANNEL_ID, "Telegram messages", NotificationManager.IMPORTANCE_HIGH);
        c.setDescription("Live notifications for new Telegram messages");
        c.enableVibration(true);
        c.setShowBadge(true);
        c.setSound(Uri.parse("android.resource://" + getPackageName() + "/" + R.raw.bp_tone_ios),
                new AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .build());
        nm.createNotificationChannel(c);

        NotificationChannel sc = new NotificationChannel(
                CHANNEL_SERVICE, "Telegram background", NotificationManager.IMPORTANCE_MIN);
        sc.setDescription("Keeps Telegram message notifications working while the app is closed");
        sc.setShowBadge(false);
        nm.createNotificationChannel(sc);
    }
}
