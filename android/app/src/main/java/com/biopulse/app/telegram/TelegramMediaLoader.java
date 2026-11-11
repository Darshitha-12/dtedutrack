package com.biopulse.app.telegram;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;

import org.drinkless.tdlib.TdApi;

import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.function.Consumer;

/**
 * Downloads Telegram media (photos, video thumbnails, sticker previews, files) through TDLib and
 * caches decoded bitmaps by file id. Also exposes the on-disk path of a downloaded file so video /
 * audio / documents can be played or opened.
 */
public final class TelegramMediaLoader implements TelegramNative.UpdateListener {

    private static final String TAG = "BioPulseTgMedia";
    private static final Object MUTEX = new Object();
    private static final Handler MAIN = new Handler(Looper.getMainLooper());
    private static final ExecutorService IO = Executors.newFixedThreadPool(2, r -> {
        Thread t = new Thread(r, "td-media");
        t.setDaemon(true);
        return t;
    });

    public interface BitmapCb {
        void onBitmap(Bitmap bitmap);
    }

    public interface PathCb {
        void onPath(String path, String error);
    }

    /** How a message should be rendered. A zero file id means "not present". */
    public static final class Spec {
        public int imageFileId;
        public int playFileId;
        public String kind = "";
        public String label = "";
        public String fileName = "";

        public boolean hasImage() {
            return imageFileId != 0;
        }

        public boolean isPhoto() {
            return "photo".equals(kind);
        }

        public boolean isVideoLike() {
            return "video".equals(kind) || "animation".equals(kind)
                    || "video_note".equals(kind) || "gif".equals(kind);
        }

        public boolean isVoiceLike() {
            return "voice".equals(kind) || "audio".equals(kind);
        }

        public boolean isDocument() {
            return "document".equals(kind);
        }

        public boolean isSticker() {
            return "sticker".equals(kind);
        }
    }

    private final Map<Integer, Bitmap> bitmaps = new ConcurrentHashMap<>();
    private final Map<Integer, List<BitmapCb>> waitBitmap = new ConcurrentHashMap<>();
    private final Map<Integer, List<PathCb>> waitPath = new ConcurrentHashMap<>();
    private final Set<Integer> requested = ConcurrentHashMap.newKeySet();

    private TelegramMediaLoader() {
    }

    private static final class Holder {
        static final TelegramMediaLoader INSTANCE = new TelegramMediaLoader();
    }

    public static TelegramMediaLoader get() {
        return Holder.INSTANCE;
    }

    public void ensureRegistered() {
        synchronized (MUTEX) {
            TelegramNative.register(this);
        }
    }

    public Bitmap cached(int fileId) {
        return bitmaps.get(fileId);
    }

    /** Loads a file into a bitmap (downloading first if needed). Callback on the main thread. */
    public void loadBitmap(int fileId, BitmapCb cb) {
        if (fileId == 0) {
            if (cb != null) MAIN.post(() -> cb.onBitmap(null));
            return;
        }
        Bitmap b = bitmaps.get(fileId);
        if (b != null) {
            if (cb != null) MAIN.post(() -> cb.onBitmap(b));
            return;
        }
        if (cb != null) {
            waitBitmap.computeIfAbsent(fileId, k -> new CopyOnWriteArrayList<>()).add(cb);
        }
        request(fileId, 0);
    }

    /** Downloads a file and delivers its local path (for video playback / audio / documents). */
    public void loadPath(int fileId, PathCb cb) {
        if (fileId == 0) {
            if (cb != null) MAIN.post(() -> cb.onPath(null, "no file"));
            return;
        }
        if (cb != null) {
            waitPath.computeIfAbsent(fileId, k -> new CopyOnWriteArrayList<>()).add(cb);
        }
        request(fileId, 32);
    }

    private void request(int fileId, int priority) {
        if (!requested.add(fileId)) return;
        TelegramNative.call(new TdApi.DownloadFile(fileId, priority, 0, 0, false))
                .whenComplete((res, err) -> {
                    if (res instanceof TdApi.File) maybeComplete((TdApi.File) res);
                });
    }

    @Override
    public void onUpdate(TdApi.Object object) {
        if (object instanceof TdApi.UpdateFile) {
            maybeComplete(((TdApi.UpdateFile) object).file);
        }
    }

    private void maybeComplete(TdApi.File file) {
        if (file == null || file.local == null) return;
        if (!file.local.isDownloadingCompleted || file.local.path == null) return;
        final String path = file.local.path;
        final int id = file.id;

        List<PathCb> pcs = waitPath.remove(id);
        if (pcs != null) {
            for (PathCb cb : pcs) MAIN.post(() -> cb.onPath(path, null));
        }

        List<BitmapCb> bcs = waitBitmap.remove(id);
        if (bcs != null && !bcs.isEmpty()) {
            decode(path, bmp -> {
                if (bmp != null) bitmaps.put(id, bmp);
                for (BitmapCb cb : bcs) MAIN.post(() -> cb.onBitmap(bmp));
            });
        }
    }

    private void decode(String path, Consumer<Bitmap> cb) {
        IO.execute(() -> {
            Bitmap bmp = null;
            try {
                BitmapFactory.Options bounds = new BitmapFactory.Options();
                bounds.inJustDecodeBounds = true;
                BitmapFactory.decodeFile(path, bounds);
                int sample = 1;
                int largest = Math.max(bounds.outWidth, bounds.outHeight);
                while (largest / sample > 1280) sample *= 2;
                BitmapFactory.Options o = new BitmapFactory.Options();
                o.inSampleSize = sample;
                bmp = BitmapFactory.decodeFile(path, o);
            } catch (Throwable t) {
                Log.w(TAG, "decode failed " + path, t);
            }
            cb.accept(bmp);
        });
    }

    // ------------------------------------------------------------------ spec

    public static Spec spec(TdApi.MessageContent c) {
        Spec s = new Spec();
        if (c instanceof TdApi.MessagePhoto) {
            TdApi.MessagePhoto m = (TdApi.MessagePhoto) c;
            s.kind = "photo";
            s.imageFileId = largestPhoto(m.photo);
        } else if (c instanceof TdApi.MessageVideo) {
            TdApi.Video v = ((TdApi.MessageVideo) c).video;
            s.kind = "video";
            if (v != null) {
                s.playFileId = v.video != null ? v.video.id : 0;
                s.imageFileId = v.thumbnail != null && v.thumbnail.file != null
                        ? v.thumbnail.file.id : 0;
                s.label = fmtDuration(v.duration);
                s.fileName = (v.fileName != null && !v.fileName.isEmpty())
                        ? v.fileName : "video.mp4";
            }
        } else if (c instanceof TdApi.MessageAnimation) {
            TdApi.Animation a = ((TdApi.MessageAnimation) c).animation;
            s.kind = "animation";
            if (a != null) {
                s.playFileId = a.animation != null ? a.animation.id : 0;
                s.imageFileId = a.thumbnail != null && a.thumbnail.file != null
                        ? a.thumbnail.file.id : 0;
                s.fileName = (a.fileName != null && !a.fileName.isEmpty())
                        ? a.fileName : "animation.mp4";
            }
        } else if (c instanceof TdApi.MessageVideoNote) {
            TdApi.VideoNote v = ((TdApi.MessageVideoNote) c).videoNote;
            s.kind = "video_note";
            if (v != null) {
                s.playFileId = v.video != null ? v.video.id : 0;
                s.imageFileId = v.thumbnail != null && v.thumbnail.file != null
                        ? v.thumbnail.file.id : 0;
                s.label = fmtDuration(v.duration);
                s.fileName = "video_note.mp4";
            }
        } else if (c instanceof TdApi.MessageVoiceNote) {
            TdApi.VoiceNote v = ((TdApi.MessageVoiceNote) c).voiceNote;
            s.kind = "voice";
            if (v != null) {
                s.playFileId = v.voice != null ? v.voice.id : 0;
                s.label = fmtDuration(v.duration);
            }
        } else if (c instanceof TdApi.MessageAudio) {
            TdApi.Audio a = ((TdApi.MessageAudio) c).audio;
            s.kind = "audio";
            if (a != null) {
                s.playFileId = a.audio != null ? a.audio.id : 0;
                s.imageFileId = a.albumCoverThumbnail != null && a.albumCoverThumbnail.file != null
                        ? a.albumCoverThumbnail.file.id : 0;
                String title = a.title != null && !a.title.isEmpty() ? a.title
                        : (a.fileName != null ? a.fileName : "Audio");
                String performer = a.performer != null && !a.performer.isEmpty() ? a.performer : "";
                s.label = (performer.isEmpty() ? "" : performer + " — ") + title;
            }
        } else if (c instanceof TdApi.MessageSticker) {
            TdApi.Sticker st = ((TdApi.MessageSticker) c).sticker;
            s.kind = "sticker";
            if (st != null) {
                s.imageFileId = st.thumbnail != null && st.thumbnail.file != null
                        ? st.thumbnail.file.id
                        : (st.sticker != null ? st.sticker.id : 0);
                s.label = st.emoji != null ? st.emoji : "";
            }
        } else if (c instanceof TdApi.MessageDocument) {
            TdApi.Document d = ((TdApi.MessageDocument) c).document;
            s.kind = "document";
            if (d != null) {
                s.imageFileId = d.thumbnail != null && d.thumbnail.file != null
                        ? d.thumbnail.file.id : 0;
                s.playFileId = d.document != null ? d.document.id : 0;
                s.fileName = d.fileName != null && !d.fileName.isEmpty() ? d.fileName : "File";
                s.label = s.fileName;
            }
        }
        return s;
    }

    public static String captionOf(TdApi.MessageContent c) {
        if (c instanceof TdApi.MessageText) return tbl(((TdApi.MessageText) c).text);
        if (c instanceof TdApi.MessagePhoto) return tbl(((TdApi.MessagePhoto) c).caption);
        if (c instanceof TdApi.MessageVideo) return tbl(((TdApi.MessageVideo) c).caption);
        if (c instanceof TdApi.MessageAnimation) return tbl(((TdApi.MessageAnimation) c).caption);
        if (c instanceof TdApi.MessageVoiceNote) return tbl(((TdApi.MessageVoiceNote) c).caption);
        if (c instanceof TdApi.MessageAudio) return tbl(((TdApi.MessageAudio) c).caption);
        if (c instanceof TdApi.MessageDocument) return tbl(((TdApi.MessageDocument) c).caption);
        return "";
    }

    private static String tbl(TdApi.FormattedText f) {
        return f == null || f.text == null ? "" : f.text;
    }

    private static int largestPhoto(TdApi.Photo p) {
        if (p == null || p.sizes == null || p.sizes.length == 0) return 0;
        TdApi.PhotoSize best = null;
        for (TdApi.PhotoSize ps : p.sizes) {
            if (ps == null || ps.photo == null) continue;
            if (best == null || (long) ps.width * ps.height > (long) best.width * best.height) {
                best = ps;
            }
        }
        return best != null ? best.photo.id : 0;
    }

    public static String fmtDuration(int sec) {
        if (sec <= 0) return "";
        int m = sec / 60;
        int s = sec % 60;
        return m + ":" + (s < 10 ? "0" : "") + s;
    }
}
