package com.biopulse.app.telegram;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;

import org.drinkless.tdlib.TdApi;

import java.io.File;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Downloads chat profile photos through TDLib and caches the decoded bitmaps per chatId.
 * Falls back to {@code null} (the UI draws a coloured initial) when there is no photo yet.
 * All registered callbacks are invoked once the bitmap is decoded (or with {@code null}
 * when the chat has no photo), on the main thread.
 */
public final class TelegramAvatarCache implements TelegramNative.UpdateListener {

    private static final String TAG = "BioPulseTgAvatar";
    private static final Object MUTEX = new Object();

    public interface Callback {
        void onReady(long chatId, Bitmap bitmap);
    }

    private final Map<Long, Bitmap> bitmaps = new ConcurrentHashMap<>();
    private final Map<Integer, Long> pending = new ConcurrentHashMap<>();
    private final Map<Integer, List<Callback>> waiters = new ConcurrentHashMap<>();
    private final Handler main = new Handler(Looper.getMainLooper());
    private final ExecutorService decode = Executors.newSingleThreadExecutor(r -> {
        Thread t = new Thread(r, "td-avatar-decode");
        t.setDaemon(true);
        return t;
    });

    private TelegramAvatarCache() {
    }

    private static final class Holder {
        static final TelegramAvatarCache INSTANCE = new TelegramAvatarCache();
    }

    public static TelegramAvatarCache get() {
        return Holder.INSTANCE;
    }

    public void ensureRegistered() {
        synchronized (MUTEX) {
            TelegramNative.register(this);
        }
    }

    /** Returns a cached bitmap immediately, or kicks off a download and calls back later. */
    public Bitmap get(long chatId, Callback cb) {
        Bitmap b = bitmaps.get(chatId);
        if (b != null) {
            if (cb != null) cb.onReady(chatId, b);
            return b;
        }
        requestDownload(chatId, cb);
        return null;
    }

    private void requestDownload(final long chatId, final Callback cb) {
        TelegramNative.call(new TdApi.GetChat(chatId)).whenComplete((res, err) -> {
            if (err != null || !(res instanceof TdApi.Chat)) {
                ready(chatId, null, cb);
                return;
            }
            TdApi.Chat chat = (TdApi.Chat) res;
            if (chat.photo == null || chat.photo.small == null) {
                ready(chatId, null, cb);
                return;
            }
            final int fileId = chat.photo.small.id;
            List<Callback> existing = waiters.get(fileId);
            if (existing != null) {
                if (cb != null) existing.add(cb);
                return;
            }
            List<Callback> list = new CopyOnWriteArrayList<>();
            if (cb != null) list.add(cb);
            waiters.put(fileId, list);
            pending.put(fileId, chatId);
            try {
                TelegramNative.call(new TdApi.DownloadFile(fileId, 1, 0, 0, false))
                        .whenComplete((r2, e2) -> {
                    if (r2 instanceof TdApi.File) {
                        maybeDecode((TdApi.File) r2);
                    } else {
                        complete(fileId, null);
                    }
                });
            } catch (Throwable t) {
                Log.w(TAG, "downloadFile failed", t);
                complete(fileId, null);
            }
        });
    }

    @Override
    public void onUpdate(TdApi.Object object) {
        if (object instanceof TdApi.UpdateFile) {
            maybeDecode(((TdApi.UpdateFile) object).file);
        }
    }

    private void maybeDecode(TdApi.File file) {
        if (file == null || file.local == null) return;
        Long chatId = pending.get(file.id);
        if (chatId == null) return;
        if (!file.local.isDownloadingCompleted || file.local.path == null) return;
        final long cid = chatId;
        decode.execute(() -> {
            Bitmap b = null;
            try {
                File f = new File(file.local.path);
                if (f.exists() && f.length() > 0) {
                    BitmapFactory.Options o = new BitmapFactory.Options();
                    o.inSampleSize = 1;
                    b = BitmapFactory.decodeFile(f.getAbsolutePath(), o);
                }
            } catch (Throwable t) {
                Log.w(TAG, "decode failed for chat " + cid, t);
            }
            if (b != null) bitmaps.put(cid, b);
            complete(file.id, b);
        });
    }

    private void complete(int fileId, Bitmap bmp) {
        Long cid = pending.remove(fileId);
        final long chatId = cid == null ? 0L : cid;
        List<Callback> list = waiters.remove(fileId);
        if (list == null || list.isEmpty()) return;
        final Bitmap bitmap = bmp;
        main.post(() -> {
            for (Callback cb : list) {
                try {
                    cb.onReady(chatId, bitmap);
                } catch (Throwable ignored) {
                }
            }
        });
    }

    private void ready(long chatId, Bitmap bitmap, Callback cb) {
        if (cb != null) main.post(() -> cb.onReady(chatId, bitmap));
    }
}
