package com.biopulse.app.telegram;

import android.content.Context;
import android.media.MediaPlayer;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;

import com.biopulse.app.MediaPlaybackService;

/**
 * Minimal one-track player for voice notes and audio messages. While a track is playing it drives
 * the shared media notification (title + timeline bar + transport actions) so audio keeps playing
 * and stays controllable with the screen off.
 */
public final class TelegramAudioPlayer {

    private static final String TAG = "BioPulseTgAudio";
    private static final Handler MAIN = new Handler(Looper.getMainLooper());

    private static MediaPlayer player;
    private static int currentFileId;
    private static String currentTitle = "Telegram audio";
    private static Runnable listener;

    private static final Runnable TICK = new Runnable() {
        @Override
        public void run() {
            MediaPlayer mp = player;
            if (mp == null) return;
            try {
                long pos = mp.getCurrentPosition();
                long dur = mp.getDuration();
                Context ctx = TelegramNative.context();
                if (ctx != null) MediaPlaybackService.updateTgAudio(ctx, pos, dur > 0 ? dur : 0);
            } catch (Throwable ignored) {
            }
            MAIN.postDelayed(this, 1000L);
        }
    };

    private TelegramAudioPlayer() {
    }

    public static boolean isPlaying(int fileId) {
        if (player == null || currentFileId != fileId) return false;
        try {
            return player.isPlaying();
        } catch (Throwable t) {
            return false;
        }
    }

    /** Registers a single callback invoked whenever playback starts/stops (for UI refresh). */
    public static void setListener(Runnable l) {
        listener = l;
    }

    public static void toggle(final int fileId, String title) {
        if (fileId == 0) return;
        if (player != null && currentFileId == fileId) {
            stop();
            return;
        }
        if (title != null && !title.trim().isEmpty()) currentTitle = title;
        stop();
        TelegramMediaLoader.get().loadPath(fileId, (path, error) -> {
            if (path == null) {
                Log.w(TAG, "audio path unavailable: " + error);
                return;
            }
            try {
                MediaPlayer mp = new MediaPlayer();
                mp.setDataSource(path);
                mp.prepare();
                mp.start();
                mp.setOnCompletionListener(m -> stop());
                player = mp;
                currentFileId = fileId;
            } catch (Throwable t) {
                Log.w(TAG, "play failed", t);
                stop();
                return;
            }
            Context ctx = TelegramNative.context();
            if (ctx != null) {
                MediaPlaybackService.startTgAudio(ctx, currentTitle);
                MAIN.removeCallbacks(TICK);
                MAIN.postDelayed(TICK, 500L);
            }
            notifyChanged();
        });
    }

    public static void pause() {
        try {
            if (player != null && player.isPlaying()) player.pause();
        } catch (Throwable ignored) {
        }
        Context ctx = TelegramNative.context();
        if (ctx != null) MediaPlaybackService.setTgAudioPaused(ctx, true);
        notifyChanged();
    }

    public static void resume() {
        try {
            if (player != null) player.start();
        } catch (Throwable ignored) {
        }
        Context ctx = TelegramNative.context();
        if (ctx != null) MediaPlaybackService.setTgAudioPaused(ctx, false);
        notifyChanged();
    }

    /** Transport actions from the media notification. */
    public static void onMediaCommand(String command) {
        if ("pause".equals(command)) pause();
        else if ("play".equals(command)) resume();
        else if ("stop".equals(command)) stop();
    }

    public static void stop() {
        MAIN.removeCallbacks(TICK);
        if (player != null) {
            try {
                player.stop();
            } catch (Throwable ignored) {
            }
            try {
                player.release();
            } catch (Throwable ignored) {
            }
            player = null;
        }
        currentFileId = 0;
        Context ctx = TelegramNative.context();
        if (ctx != null) MediaPlaybackService.stopTgAudio(ctx);
        notifyChanged();
    }

    private static void notifyChanged() {
        Runnable l = listener;
        if (l != null) l.run();
    }
}
