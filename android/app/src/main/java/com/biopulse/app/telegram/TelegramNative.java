package com.biopulse.app.telegram;

import android.content.Context;
import android.os.Handler;
import android.os.Looper;
import android.os.StatFs;
import android.util.Log;

import org.drinkless.tdlib.Client;
import org.drinkless.tdlib.TdApi;

import java.io.File;
import java.util.Locale;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Native TDLib bridge shared by the auth flow, chat list, chat screen and the background
 * notification service.
 *
 * <p>Threading: TDLib hands {@link org.drinkless.tdlib.TdApi.Update}s and query results to this
 * process on its own receiver thread. Everything that touches the UI / listeners is marshalled to
 * the main thread; long TDLib round-trips (login steps, history, avatar download) run on
 * {@link #IO}.
 */
public final class TelegramNative {

    private static final String TAG = "BioPulseTd";

    public static final String STATE_UNLOADED = "unloaded";
    public static final String STATE_STARTING = "starting";
    public static final String STATE_PHONE = "phone";
    public static final String STATE_CODE = "code";
    public static final String STATE_PASSWORD = "password";
    public static final String STATE_READY = "ready";
    public static final String STATE_CLOSING = "closing";
    public static final String STATE_CLOSED = "closed";
    public static final String STATE_UNAVAILABLE = "unavailable";
    public static final String STATE_OTHER_DEVICE = "other_device";

    /** Receives every TDLib update (including a re-dispatched authorization state). */
    public interface UpdateListener {
        void onUpdate(TdApi.Object object);
    }

    /** Receives {"code", "message"} for background call failures (login, history, send). */
    public interface ErrorListener {
        void onError(String code, String message);
    }

    private static volatile Client client;
    private static volatile Context app;
    private static volatile String state = STATE_UNLOADED;
    private static volatile String stateInfo = "";
    private static volatile Boolean libAvailable;

    private static final ExecutorService IO = Executors.newSingleThreadExecutor(r -> {
        Thread t = new Thread(r, "td-io");
        t.setDaemon(true);
        return t;
    });
    private static final Handler MAIN = new Handler(Looper.getMainLooper());
    private static final CopyOnWriteArrayList<UpdateListener> listeners = new CopyOnWriteArrayList<>();
    private static final CopyOnWriteArrayList<ErrorListener> errorListeners = new CopyOnWriteArrayList<>();
    private static final AtomicBoolean started = new AtomicBoolean(false);

    private TelegramNative() {
    }

    // ------------------------------------------------------------------ lifecycle

    /** True when libtdjni.so could be loaded on this device/ABI. */
    public static synchronized boolean isAvailable() {
        if (libAvailable == null) {
            try {
                System.loadLibrary("tdjni");
                libAvailable = Boolean.TRUE;
            } catch (Throwable t) {
                Log.e(TAG, "libtdjni failed to load", t);
                libAvailable = Boolean.FALSE;
            }
        }
        return libAvailable.booleanValue();
    }

    /** Starts the TDLib client once. Safe to call repeatedly. */
    public static void init(Context context) {
        app = context.getApplicationContext();
        if (started.get() || client != null) return;
        if (!isAvailable()) {
            setState(STATE_UNAVAILABLE, "TDLib native library could not be loaded on this device");
            return;
        }
        started.set(true);
        final Client c = Client.create(TelegramNative::handle, null, null);
        client = c;
        TelegramRepo.get().ensureRegistered();
        TelegramAvatarCache.get().ensureRegistered();
        TelegramMediaLoader.get().ensureRegistered();
        setState(STATE_STARTING, "");
        Log.i(TAG, "TDLib client created");
    }

    public static boolean isReady() {
        return STATE_READY.equals(state);
    }

    public static String getState() {
        return state;
    }

    public static String getStateInfo() {
        return stateInfo;
    }

    public static Client client() {
        return client;
    }

    public static Context context() {
        return app;
    }

    public static void register(UpdateListener l) {
        listeners.addIfAbsent(l);
    }

    public static void unregister(UpdateListener l) {
        listeners.remove(l);
    }

    public static void addErrorListener(ErrorListener l) {
        errorListeners.addIfAbsent(l);
    }

    public static void removeErrorListener(ErrorListener l) {
        errorListeners.remove(l);
    }

    public static int apiId() {
        return app.getResources().getInteger(com.biopulse.app.R.integer.tdlib_api_id);
    }

    public static String apiHash() {
        return app.getString(com.biopulse.app.R.string.tdlib_api_hash);
    }

    // ------------------------------------------------------------------ updates

    private static void handle(TdApi.Object object) {
        if (object instanceof TdApi.UpdateAuthorizationState) {
            final TdApi.AuthorizationState s =
                    ((TdApi.UpdateAuthorizationState) object).authorizationState;
            handleAuth(s);
        }
        dispatch(object);
    }

    private static void handleAuth(TdApi.AuthorizationState auth) {
        final Client c = client;
        if (c == null) return;
        if (auth instanceof TdApi.AuthorizationStateWaitTdlibParameters) {
            TdApi.SetTdlibParameters p = new TdApi.SetTdlibParameters();
            p.databaseDirectory = new File(app.getFilesDir(), "tdlib").getPath();
            p.useMessageDatabase = true;
            p.useSecretChats = false;
            p.useFileDatabase = true;
            p.apiId = apiId();
            p.apiHash = apiHash();
            p.systemLanguageCode = Locale.getDefault().getLanguage();
            p.deviceModel = Build_DEVICE();
            p.applicationVersion = "1.0.0";
            p.systemVersion = "Android " + android.os.Build.VERSION.RELEASE;
            send(c, p, r -> {
                if (r instanceof TdApi.Error) {
                    reportError((TdApi.Error) r);
                }
            });
        } else if (auth instanceof TdApi.AuthorizationStateWaitPhoneNumber) {
            setState(STATE_PHONE, "");
        } else if (auth instanceof TdApi.AuthorizationStateWaitCode) {
            setState(STATE_CODE, "");
        } else if (auth instanceof TdApi.AuthorizationStateWaitPassword) {
            TdApi.AuthorizationStateWaitPassword w = (TdApi.AuthorizationStateWaitPassword) auth;
            setState(STATE_PASSWORD, w.passwordHint == null ? "" : w.passwordHint);
        } else if (auth instanceof TdApi.AuthorizationStateWaitOtherDeviceConfirmation) {
            TdApi.AuthorizationStateWaitOtherDeviceConfirmation w =
                    (TdApi.AuthorizationStateWaitOtherDeviceConfirmation) auth;
            setState(STATE_OTHER_DEVICE, w.link == null ? "" : w.link);
        } else if (auth instanceof TdApi.AuthorizationStateReady) {
            setState(STATE_READY, "");
            onReady();
        } else if (auth instanceof TdApi.AuthorizationStateClosing) {
            setState(STATE_CLOSING, "");
        } else if (auth instanceof TdApi.AuthorizationStateClosed) {
            setState(STATE_CLOSED, stateInfo);
        }
    }

    private static String Build_DEVICE() {
        return (android.os.Build.MANUFACTURER + " " + android.os.Build.MODEL).trim();
    }

    private static void onReady() {
        loadChats(100);
        TelegramRepo.get().loadScopeSettings();
        IO.execute(() -> {
            try {
                send(client, new TdApi.GetMe(), null);
            } catch (Throwable ignored) {
            }
        });
        TelegramService.ensureRunning(app);
        limitCache();
    }

    private static void dispatch(final TdApi.Object o) {
        if (listeners.isEmpty()) return;
        MAIN.post(() -> {
            for (UpdateListener l : listeners) {
                try {
                    l.onUpdate(o);
                } catch (Throwable t) {
                    Log.w(TAG, "listener crashed", t);
                }
            }
        });
    }

    private static void reportError(TdApi.Error e) {
        Log.w(TAG, "TDLib error " + e.code + " " + e.message);
        MAIN.post(() -> {
            for (ErrorListener l : errorListeners) {
                try {
                    l.onError(Integer.toString(e.code), e.message);
                } catch (Throwable ignored) {
                }
            }
        });
    }

    private static void setState(final String s, String info) {
        state = s;
        stateInfo = info == null ? "" : info;
        Log.i(TAG, "auth state -> " + s + (stateInfo.isEmpty() ? "" : " (" + stateInfo + ")"));
        final TdApi.AuthorizationState mirror;
        switch (s) {
            case STATE_PHONE: mirror = new TdApi.AuthorizationStateWaitPhoneNumber(); break;
            case STATE_CODE: mirror = new TdApi.AuthorizationStateWaitCode(); break;
            case STATE_PASSWORD:
                TdApi.AuthorizationStateWaitPassword wp = new TdApi.AuthorizationStateWaitPassword();
                wp.passwordHint = stateInfo;
                mirror = wp;
                break;
            case STATE_READY: mirror = new TdApi.AuthorizationStateReady(); break;
            case STATE_CLOSED: mirror = new TdApi.AuthorizationStateClosed(); break;
            default: mirror = new TdApi.AuthorizationStateWaitTdlibParameters(); break;
        }
        TdApi.UpdateAuthorizationState u = new TdApi.UpdateAuthorizationState();
        u.authorizationState = mirror;
        dispatch(u);
    }

    // ------------------------------------------------------------------ queries

    private static void send(Client c, TdApi.Function<?> query, Client.ResultHandler h) {
        if (c == null) return;
        c.send(query, h, null);
    }

    /** Runs an RPC off the main thread and completes with its result object. */
    public static CompletableFuture<TdApi.Object> call(TdApi.Function<?> f) {
        CompletableFuture<TdApi.Object> future = new CompletableFuture<>();
        Client c = client;
        if (c == null) {
            future.complete(new TdApi.Error(500, "TDLib not started"));
            return future;
        }
        c.send(f, future::complete, null);
        return future;
    }

    // ------------------------------------------------------------- auth actions

    public static void sendPhoneNumber(final String phone) {
        IO.execute(() -> {
            Client c = client;
            if (c == null) return;
            TdApi.SetAuthenticationPhoneNumber q = new TdApi.SetAuthenticationPhoneNumber();
            q.phoneNumber = phone.trim();
            q.settings = new TdApi.PhoneNumberAuthenticationSettings();
            send(c, q, r -> {
                if (r instanceof TdApi.Error) reportError((TdApi.Error) r);
            });
        });
    }

    public static void sendCode(final String code) {
        IO.execute(() -> {
            Client c = client;
            if (c == null) return;
            send(c, new TdApi.CheckAuthenticationCode(code.trim()), r -> {
                if (r instanceof TdApi.Error) reportError((TdApi.Error) r);
            });
        });
    }

    public static void sendPassword(final String password) {
        IO.execute(() -> {
            Client c = client;
            if (c == null) return;
            send(c, new TdApi.CheckAuthenticationPassword(password), r -> {
                if (r instanceof TdApi.Error) reportError((TdApi.Error) r);
            });
        });
    }

    public static void logout() {
        Client c = client;
        if (c == null) return;
        send(c, new TdApi.LogOut(), r -> {
            if (r instanceof TdApi.Error) reportError((TdApi.Error) r);
        });
    }

    // ------------------------------------------------------------- messaging

    public static void sendText(final long chatId, final String text) {
        IO.execute(() -> {
            Client c = client;
            if (c == null) return;
            TdApi.InputMessageText input = new TdApi.InputMessageText();
            input.text = new TdApi.FormattedText(text, null);
            TdApi.SendMessage msg = new TdApi.SendMessage();
            msg.chatId = chatId;
            msg.inputMessageContent = input;
            send(c, msg, r -> {
                if (r instanceof TdApi.Error) reportError((TdApi.Error) r);
            });
        });
    }

    public static void viewMessages(final long chatId, final long[] ids) {
        if (ids == null || ids.length == 0) return;
        IO.execute(() -> {
            Client c = client;
            if (c == null) return;
            send(c, new TdApi.ViewMessages(chatId, ids, null, true), null);
        });
    }

    public static void loadChats(final int limit) {
        IO.execute(() -> {
            try {
                TdApi.Chats chats = (TdApi.Chats) call(
                        new TdApi.GetChats(new TdApi.ChatListMain(), limit)).get();
                for (long id : chats.chatIds) {
                    try {
                        call(new TdApi.GetChat(id));
                    } catch (Throwable ignored) {
                    }
                }
            } catch (Throwable t) {
                Log.w(TAG, "loadChats failed", t);
            }
        });
    }

    /**
     * Fire-and-forget whole-file download at low priority. The ranged on-demand reads stay at the
     * highest priority, so this only fills the cache ahead of the playhead and stops video seeking
     * from stalling while TDLib fetches a fresh byte range.
     */
    public static void prefetchFile(final int fileId) {
        if (fileId == 0) return;
        IO.execute(() -> {
            Client c = client;
            if (c == null) return;
            TdApi.DownloadFile f = new TdApi.DownloadFile();
            f.fileId = fileId;
            f.priority = 1;
            f.offset = 0;
            f.limit = 0;
            f.synchronous = false;
            send(c, f, null);
        });
    }

    public static void loadHistory(final long chatId, final int limit) {
        IO.execute(() -> {
            try {
                TdApi.Messages m = (TdApi.Messages) call(
                        new TdApi.GetChatHistory(chatId, 0, 0, limit, false)).get();
                if (m.messages != null) {
                    for (TdApi.Message msg : m.messages) dispatch(msg);
                }
            } catch (Throwable t) {
                Log.w(TAG, "loadHistory failed", t);
            }
        });
    }

    /** Result of a read-date lookup: {@code readDate>0} = Unix seconds when read by the other user,
     *  {@code 0} with {@code text} explaining why it isn't available (not read, too old, privacy). */
    public interface ReadDateCallback {
        void onReadDate(long readDate, String text);
    }

    /** When the other user read this outgoing private-chat message (TDLib getMessageReadDate). */
    public static void getMessageReadDate(final long chatId, final long messageId,
                                          final ReadDateCallback cb) {
        IO.execute(() -> {
            TdApi.Object res;
            try {
                res = call(new TdApi.GetMessageReadDate(chatId, messageId)).get();
            } catch (Throwable t) {
                res = new TdApi.Error(500, "failed");
            }
            final TdApi.Object r = res;
            MAIN.post(() -> {
                if (cb == null) return;
                if (r instanceof TdApi.MessageReadDateRead) {
                    cb.onReadDate(((TdApi.MessageReadDateRead) r).readDate, null);
                } else if (r instanceof TdApi.MessageReadDateUnread) {
                    cb.onReadDate(0, "Not read yet");
                } else if (r instanceof TdApi.MessageReadDateTooOld) {
                    cb.onReadDate(0, "Read time is not available for this message");
                } else if (r instanceof TdApi.MessageReadDateUserPrivacyRestricted) {
                    cb.onReadDate(0, "The other user hides their read time");
                } else if (r instanceof TdApi.MessageReadDateMyPrivacyRestricted) {
                    cb.onReadDate(0, "Read time is hidden in your privacy settings");
                } else {
                    cb.onReadDate(0, "Read time is not available");
                }
            });
        });
    }

    // ------------------------------------------------------------- storage

    /** Free/total device space and TDLib's media-cache size, reported on the main thread. */
    public interface StorageCallback {
        void onStorage(long freeBytes, long totalBytes, long cacheBytes);
    }

    /** Reads the device free space plus TDLib's current cache usage. */
    public static void storageInfo(final StorageCallback cb) {
        final Context c = app;
        if (c == null) {
            if (cb != null) cb.onStorage(0, 0, 0);
            return;
        }
        IO.execute(() -> {
            long[] space = deviceSpace(c);
            long cache = cacheBytes();
            final long free = space[0];
            final long total = space[1];
            final long cached = cache;
            MAIN.post(() -> {
                if (cb != null) cb.onStorage(free, total, cached);
            });
        });
    }

    /** Upper bound for TDLib's local media cache, so this app stays small on the phone. */
    private static final long STORAGE_CACHE_CAP = 250L * 1024 * 1024;

    /**
     * Tells TDLib to keep its downloaded files under {@link #STORAGE_CACHE_CAP} bytes and trims any
     * existing excess right away. Messages and the login are never touched. Runs on every native
     * login so the cache can't quietly balloon again.
     */
    public static void limitCache() {
        IO.execute(() -> {
            if (client == null) return;
            try {
                TdApi.SetOption cap = new TdApi.SetOption();
                cap.name = "storage_max_files_size";
                cap.value = new TdApi.OptionValueInteger(STORAGE_CACHE_CAP);
                call(cap).get();
                call(new TdApi.OptimizeStorage(
                        STORAGE_CACHE_CAP, 0, 0, 0,
                        new TdApi.FileType[0], new long[0], new long[0], false, 0)).get();
            } catch (Throwable t) {
                Log.w(TAG, "limitCache failed", t);
            }
        });
    }

    /**
     * Deletes TDLib's downloaded files (the video/photo/audio cache) while keeping the message
     * database intact, then reports the reclaimed space. This is what makes "storage full" videos
     * usable again without re-logging in.
     */
    public static void clearCache(final StorageCallback cb) {
        IO.execute(() -> {
            if (client != null) {
                try {
                    // size/count/ttl = 0 force every deletable file out of the cache.
                    call(new TdApi.OptimizeStorage(
                            0, 0, 0, 0,
                            new TdApi.FileType[0], new long[0], new long[0], false, 0)).get();
                } catch (Throwable t) {
                    Log.w(TAG, "clearCache failed", t);
                }
            }
            Context c = app;
            long[] space = c != null ? deviceSpace(c) : new long[]{0, 0};
            long cache = cacheBytes();
            final long free = space[0];
            final long total = space[1];
            final long cached = cache;
            MAIN.post(() -> {
                if (cb != null) cb.onStorage(free, total, cached);
            });
        });
    }

    private static long[] deviceSpace(Context c) {
        try {
            File dir = new File(c.getFilesDir(), "tdlib");
            if (!dir.exists()) dir = c.getFilesDir();
            StatFs stat = new StatFs(dir.getPath());
            return new long[]{stat.getAvailableBytes(), stat.getTotalBytes()};
        } catch (Throwable t) {
            return new long[]{0, 0};
        }
    }

    private static long cacheBytes() {
        if (client == null) return 0;
        try {
            TdApi.Object r = call(new TdApi.GetStorageStatistics(0)).get();
            if (r instanceof TdApi.StorageStatistics) return ((TdApi.StorageStatistics) r).size;
        } catch (Throwable ignored) {
        }
        return 0;
    }

    // ------------------------------------------------------------- helpers

    /** Best-effort display name for a chat (private chats get the user's name from TDLib). */
    public static String chatTitle(TdApi.Chat chat) {
        if (chat == null) return "";
        if (chat.title != null && !chat.title.isEmpty()) return chat.title;
        if (chat.type instanceof TdApi.ChatTypePrivate) {
            return "Private chat";
        }
        return "Chat";
    }

    /** Human-readable preview for a message content (photos, files, voice, etc.). */
    public static String contentText(TdApi.MessageContent c) {
        if (c == null) return "";
        if (c instanceof TdApi.MessageText) {
            TdApi.MessageText m = (TdApi.MessageText) c;
            if (m.text != null && m.text.text != null && !m.text.text.trim().isEmpty()) {
                return m.text.text;
            }
            return "Message";
        }
        if (c instanceof TdApi.MessageAnimatedEmoji) {
            TdApi.MessageAnimatedEmoji e = (TdApi.MessageAnimatedEmoji) c;
            return e.emoji == null || e.emoji.isEmpty() ? "Emoji" : e.emoji;
        }
        if (c instanceof TdApi.MessagePhoto) {
            return withCaption("(Photo)", ((TdApi.MessagePhoto) c).caption);
        }
        if (c instanceof TdApi.MessageVideo) {
            return withCaption("(Video)", ((TdApi.MessageVideo) c).caption);
        }
        if (c instanceof TdApi.MessageAudio) {
            return withCaption("(Music)", ((TdApi.MessageAudio) c).caption);
        }
        if (c instanceof TdApi.MessageVoiceNote) {
            return withCaption("(Voice message)", ((TdApi.MessageVoiceNote) c).caption);
        }
        if (c instanceof TdApi.MessageVideoNote) return "(Video message)";
        if (c instanceof TdApi.MessageAnimation) {
            return withCaption("(GIF)", ((TdApi.MessageAnimation) c).caption);
        }
        if (c instanceof TdApi.MessageSticker) {
            TdApi.MessageSticker s = (TdApi.MessageSticker) c;
            if (s.sticker != null && s.sticker.emoji != null && !s.sticker.emoji.isEmpty()) {
                return s.sticker.emoji + " Sticker";
            }
            return "(Sticker)";
        }
        if (c instanceof TdApi.MessageDocument) {
            return withCaption("(File)", ((TdApi.MessageDocument) c).caption);
        }
        if (c instanceof TdApi.MessageLocation) return "(Location)";
        if (c instanceof TdApi.MessageContact) return "(Contact)";
        if (c instanceof TdApi.MessagePoll) return "(Poll)";
        if (c instanceof TdApi.MessageDice) {
            TdApi.MessageDice d = (TdApi.MessageDice) c;
            return (d.emoji == null ? "" : d.emoji + " ") + String.valueOf(d.value);
        }
        if (c instanceof TdApi.MessageGame) return "(Game)";
        return "(Message)";
    }

    /** Combines a media label with the message caption (if any) so both stay visible. */
    private static String withCaption(String label, TdApi.FormattedText caption) {
        if (caption == null || caption.text == null) return label;
        String cap = caption.text.trim();
        return cap.isEmpty() ? label : label + " " + cap;
    }
}
