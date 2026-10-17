package com.biopulse.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.Handler;
import android.os.HandlerThread;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.media.MediaPlayer;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.util.Log;

import android.support.v4.media.MediaMetadataCompat;
import android.support.v4.media.session.MediaSessionCompat;
import android.support.v4.media.session.PlaybackStateCompat;

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;
import androidx.core.app.RemoteInput;
import androidx.media.app.NotificationCompat.MediaStyle;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.lang.ref.WeakReference;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Keeps the WebView media pipeline alive while BioPulse is backgrounded or the screen is
 * locked.
 *
 * WebView audio is suspended by Android as soon as the hosting activity is no longer
 * visible, unless {@code WebView#setAudioForegroundService(true)} is set AND a foreground
 * service with the {@code mediaPlayback} type is running. This service provides that
 * foreground process plus a lock-screen notification with play/pause/stop actions, so the
 * user can control playback without reopening the app.
 */
public class MediaPlaybackService extends Service {

    public static final String ACTION_START = "com.biopulse.app.media.START";
    public static final String ACTION_STOP = "com.biopulse.app.media.STOP";
    public static final String ACTION_PLAY = "com.biopulse.app.media.PLAY";
    public static final String ACTION_PAUSE = "com.biopulse.app.media.PAUSE";
    public static final String ACTION_DISMISS_ALARM = "com.biopulse.app.media.DISMISS_ALARM";

    private static final String CHANNEL_ID = "biopulse_media";
    private static final String TAG = "BioPulseMedia";

    /**
     * Alarms get their own channel and their own notification.
     *
     * Reusing the media channel meant alarms inherited IMPORTANCE_LOW plus a silenced builder, so
     * they never vibrated and never produced a lock-screen popup — a ringing alarm that cannot be
     * seen or felt is useless. A separate IMPORTANCE_HIGH channel also keeps the user able to tune
     * alarms independently of playback.
     */
    private static final String ALARM_CHANNEL_ID = "biopulse_alarms";
    private static final int ALARM_NOTIF_ID = 0x8A22;
    private static final int REQ_DISMISS_ALARM = 14;
    private static final int REQ_ALARM_OPEN = 15;
    /** When the last alarm was posted; makes cancel leave a lasting "rang" entry behind. */
    private static long sLastAlarmAt = 0L;
    /** The alarm title captured at ring time, so a later media title cannot rewrite it. */
    private static String sLastAlarmTitle = "";
    /** Quiet history channel: an ended alarm must not heads-up a second time. */
    private static final String ALARM_ENDED_CHANNEL_ID = "biopulse_alarm_ended";
    /** Quiet-ish, tap-to-open channel for things that should not ring (class finished, 12 AM). */
    private static final String ALERT_CHANNEL_ID = "biopulse_alerts";
    private static final String CHAT_CHANNEL_ID = "biopulse_chat_v3";
    private static final String DM_CHANNEL_ID = "biopulse_dm_v1";
    private static final int ALERT_NOTIF_ID = 0x8A33;
    private static final int REQ_ALERT_OPEN = 16;
    private static final int REQ_CHAT_OPEN = 17;
    /** Repeat: two short pulses, a gap, then a longer one — the standard "wake up" pattern. */
    private static final long[] ALARM_VIBRATE = {0L, 400L, 250L, 400L, 250L, 900L};
    private static final int NOTIF_ID = 0x8A11;
    private static final int REQ_PLAY = 11;
    private static final int REQ_PAUSE = 12;
    private static final int REQ_STOP = 13;

    private static final Handler MAIN = new Handler(Looper.getMainLooper());
    private static WeakReference<MediaPlaybackService> instance = new WeakReference<>(null);

    /**
     * The system media session this service publishes while audio is active.
     *
     * <p>This is the piece Android actually checks before it lets a backgrounded app keep an HTML5
     * audio track alive: a foreground service alone is not enough, the platform wants an *active*
     * {@link MediaSessionCompat}. Chromium's WebView media stack also observes it. Publishing one
     * (plus the {@code MediaStyle} notification it powers) is what stops the YouTube embed's audio
     * from being suspended the instant the user presses Home or switches apps, while the lock
     * screen / notification keeps giving real transport controls.
     */
    private static MediaSessionCompat mediaSession;

    private static final int MEDIA_SESSION_FLAGS =
            MediaSessionCompat.FLAG_HANDLES_MEDIA_BUTTONS
                    | MediaSessionCompat.FLAG_HANDLES_TRANSPORT_CONTROLS;

    /**
     * Delay before actually releasing the service.
     *
     * A stop request that lands while a {@code startForegroundService()} is still in flight
     * cancels the start intent before the service ever runs, and Android then aborts the
     * process with {@code RemoteServiceException} because startForeground() was never called.
     * Deferring the release lets the pending start be promoted instead.
     */
    private static final long RELEASE_DELAY_MS = 1500L;

    private static final Runnable RELEASE_TASK = () -> {
        releaseScheduled = false;
        // Keep the service while the user still wants audio, even if the embed has paused itself
        // in the background. Releasing on mediaPlaying alone tore the service down mid-playback and
        // cancelled an in-flight start, which is what crashed the process.
        if (!isPlaying() && !hasPlaybackIntent() && !MediaPlaybackService.keepAliveActive) {
            MediaPlaybackService svc = instance.get();
            Context ctx = svc != null ? svc.getApplicationContext() : null;
            if (ctx != null) release(ctx);
        }
    };

    private static boolean releaseScheduled = false;

    /** True once the service has been promoted and before it is destroyed. */
    private static volatile boolean foreground = false;

    /**
     * Playback position reported by the page, in milliseconds.
     *
     * The web layer cannot drive this on its own: background JS timers are throttled to roughly
     * one tick per minute, so the 1s keepalive in the YT page stops nudging the embed and the
     * audio drops out while the app is backgrounded. A ticker running inside this foreground
     * service (which holds a wakelock) pushes the keepalive instead, and the reported position
     * feeds the notification progress bar.
     */
    private static long positionMs = 0;
    private static long durationMs = 0;
    private static int progressReports = 0;

    private static final long KEEPALIVE_INTERVAL_MS = 2000L;
    private static int keepaliveTicks = 0;
    private static final Runnable KEEPALIVE_TASK = new Runnable() {
        @Override
        public void run() {
            if (!mediaPlaying && !playbackRequested) return;
            MediaPlaybackService svc = instance.get();
            if (svc == null) return;
            dispatchMediaCommand("keepalive");
            // Telegram audio pushes its own real position; only the YouTube embed needs the ticker.
            if (!"tgaudio".equals(mediaOwner)) svc.tickProgress();
            // Heartbeat: proves the service loop is alive, so a missing "progress" line means the
            // WebView renderer froze rather than the service dying.
            if (++keepaliveTicks % 15 == 0) {
                Log.i(TAG, "keepalive heartbeat pos=" + positionMs + "/" + durationMs);
            }
            MAIN.postDelayed(this, KEEPALIVE_INTERVAL_MS);
        }
    };

    /** Called from the page whenever the player reports its position. */
    public static void reportProgress(long position, long duration) {
        positionMs = Math.max(0, position);
        durationMs = Math.max(0, duration);
        progressReports++;
        if (progressReports % 10 == 1) {
            Log.i(TAG, "progress " + positionMs + "/" + durationMs);
        }
    }

    private PowerManager.WakeLock wakeLock;

    /** WebView media (YouTube) state, reported through {@code ytState}. */
    private static boolean mediaPlaying = false;
    /**
     * Sticky "the user wants audio" flag, set from user gestures and cleared only by them. The
     * embed pauses itself whenever the app is backgrounded, so {@link #mediaPlaying} flips to
     * false exactly when background audio matters most; without this the service would tear itself
     * down and picture-in-picture would never engage.
     */
    private static boolean playbackRequested = false;
    /** Alarm / reminder ring state, reported through {@code setAlarmRinging}. */
    private static boolean alarmActive = false;
    private static String currentTitle = "BioPulse Player";

    /**
     * Which surface owns the media notification: the in-app player ("app") or the Telegram WebView
     * ("telegram"). The notification is shared, so its transport actions and its tap target must be
     * routed to whichever surface is actually playing.
     */
    private static volatile String mediaOwner = "app";

    /**
     * Whether the shared notification should show a seek/timeline bar. Audio wants it (so the user
     * can scrub/see progress); Telegram Web video does not, so it is switched off for video only.
     */
    private static volatile boolean mediaHasTimeline = true;

    public static void setMediaOwner(String owner) {
        mediaOwner = owner == null ? "app" : owner;
        // Only the Telegram Web owner opts out of the bar (explicitly, per media element); every
        // other surface shows it.
        if (!"telegram".equals(mediaOwner)) mediaHasTimeline = true;
    }

    /** Turns the notification seek bar on/off for the current media (video => off). */
    public static void setMediaTimeline(boolean show) {
        if (mediaHasTimeline == show) return;
        mediaHasTimeline = show;
        MediaPlaybackService svc = instance.get();
        if (svc != null) MAIN.post(svc::postNotification);
    }

    private static void dispatchMediaCommand(String command) {
        if ("tgaudio".equals(mediaOwner)) {
            com.biopulse.app.telegram.TelegramAudioPlayer.onMediaCommand(command);
        } else if ("telegram".equals(mediaOwner)) {
            com.biopulse.app.telegram.TelegramWebActivity.dispatchMediaCommand(command);
        } else {
            MainActivity.dispatchMediaCommand(command);
        }
    }

    /** True while the native Telegram audio (music / voice) playback owns the notification. */
    private static volatile boolean tgAudioPaused = false;

    public static boolean isTgAudio() {
        return "tgaudio".equals(mediaOwner);
    }

    /** Shows the media notification (with a seek/time bar) for native Telegram audio playback. */
    public static void startTgAudio(Context ctx, String title) {
        mediaOwner = "tgaudio";
        if (title != null && !title.trim().isEmpty()) currentTitle = title;
        mediaPlaying = true;
        tgAudioPaused = false;
        alarmActive = false;
        playbackRequested = false;
        ensureRunning(ctx);
        refresh(ctx);
    }

    /** Pushes the real audio position into the notification's timeline bar. */
    public static void updateTgAudio(Context ctx, long position, long duration) {
        positionMs = Math.max(0, position);
        durationMs = Math.max(0, duration);
        if (foreground) refresh(ctx);
    }

    /** Called when native Telegram audio pauses / resumes so the notification actions match. */
    public static void setTgAudioPaused(Context ctx, boolean paused) {
        tgAudioPaused = paused;
        if (paused) {
            mediaPlaying = false;
            playbackRequested = false;
        } else {
            mediaPlaying = true;
        }
        ensureRunning(ctx);
        refresh(ctx);
    }

    public static void stopTgAudio(Context ctx) {
        mediaPlaying = false;
        tgAudioPaused = false;
        positionMs = 0;
        durationMs = 0;
        scheduleRelease(ctx);
        refresh(ctx);
    }

    private static final long WAKE_LOCK_TIMEOUT_MS = 60L * 60L * 1000L;

    /** True while the foreground service must stay alive for any reason. */
    public static boolean isPlaying() {
        return mediaPlaying || alarmActive;
    }

    /** True while the user wants to hear audio, even if the embed has paused itself. */
    public static boolean hasPlaybackIntent() {
        return playbackRequested || mediaPlaying || alarmActive;
    }

    /** Reported from the player page on real user gestures only. */
    public static void setPlaybackIntent(Context ctx, boolean active) {
        playbackRequested = active;
        Log.i(TAG, "playbackIntent=" + active);
        if (!active) {
            if (!alarmActive) scheduleRelease(ctx);
        } else {
            requestAudioFocusForMedia(ctx);
            ensureRunning(ctx);
        }
    }

    public static String currentTitle() {
        return currentTitle;
    }

    /** Starts (or refreshes) the foreground service without touching state flags. */
    public static void ensureRunning(Context ctx) {
        // A start is on its way, so cancel any pending release.
        releaseScheduled = false;
        MAIN.removeCallbacks(RELEASE_TASK);

        // Both the web keepalive and the native ticker report state every second or two. Once the
        // service is promoted, re-issuing startForegroundService() only churns ActivityManager
        // and widens the race window, so just refresh the notification.
        if (foreground) {
            refresh(ctx);
            return;
        }

        // Starting a foreground service with nothing to keep alive only churns ActivityManager and
        // widens the window that produces "startForegroundService() did not then call
        // startForeground()". If no surface needs the service, do not start it.
        if (!isPlaying() && !keepAliveActive && !dmWatchActive && !hasPlaybackIntent()) {
            return;
        }

        Intent intent = new Intent(ctx, MediaPlaybackService.class);
        intent.setAction(ACTION_START);
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                ctx.startForegroundService(intent);
            } else {
                ctx.startService(intent);
            }
        } catch (Exception e) {
            // Background start restrictions — playback still works while the app is visible.
            Log.w(TAG, "startForegroundService rejected", e);
        }
        refresh(ctx);
    }

    private static void release(Context ctx) {
        if (keepAliveActive || dmWatchActive) return;
        foreground = false;
        abandonAudioFocusForMedia(ctx);
        try {
            ctx.stopService(new Intent(ctx, MediaPlaybackService.class));
        } catch (Exception ignored) {
        }
    }

    /** Defers the release so an in-flight startForegroundService() can still be promoted. */
    private static void scheduleRelease(Context ctx) {
        if (keepAliveActive || dmWatchActive) return;
        releaseScheduled = true;
        MAIN.removeCallbacks(RELEASE_TASK);
        MAIN.postDelayed(RELEASE_TASK, RELEASE_DELAY_MS);
    }

    /** Called from the web layer when the media player starts playing. */
    public static void start(Context ctx, String title) {
        if (title != null && !title.trim().isEmpty()) currentTitle = title;
        mediaPlaying = true;
        ensureRunning(ctx);
    }

    public static void stop(Context ctx) {
        mediaPlaying = false;
        alarmActive = false;
        playbackRequested = false;
        MAIN.removeCallbacks(ALARM_AUTO_STOP_TASK);
        sAlarmCtx = null;
        cancelAlarmNotification(ctx);
        scheduleRelease(ctx);
    }

    /**
     * Hard limit on how long an alarm/reminder rings before it silences itself.
     *
     * <p>An alarm that is never dismissed would otherwise ring, vibrate and hold audio focus
     * indefinitely — draining the battery and taking the phone over. After this window the ring is
     * torn down exactly as if the user had dismissed it: the tone, vibration, audio focus, the
     * notification and the page's ring UI all stop.
     */
    private static final long ALARM_AUTO_STOP_MS = 3 * 60 * 1000L;
    private static Context sAlarmCtx;

    private static final Runnable ALARM_AUTO_STOP_TASK = () -> {
        Context ctx = sAlarmCtx;
        if (ctx == null || !alarmActive) return;
        Log.i(TAG, "alarm auto-stopped after " + (ALARM_AUTO_STOP_MS / 1000) + "s");
        alarmActive = false;
        sAlarmCtx = null;
        stopNativeAlarmTone();
        stopAlarmVibration(ctx);
        abandonAudioFocusForAlarm(ctx);
        cancelAlarmNotification(ctx);
        stopSpeech();
        // Tear the page's ring UI / Web Audio down too, otherwise it keeps sounding on its own.
        MainActivity.dispatchMediaCommand("dismissAlarm");
        if (mediaPlaying) {
            releaseScheduled = false;
            MAIN.removeCallbacks(RELEASE_TASK);
            refresh(ctx);
        } else {
            scheduleRelease(ctx);
        }
    };

    /** Holds the service (and wakelock) open while an alarm/reminder is ringing. */
    public static void startAlarm(Context ctx, String label) {
        startAlarm(ctx, label, null, null);
    }

    public static void startAlarm(Context ctx, String label, String soundId) {
        startAlarm(ctx, label, soundId, null);
    }

    /**
     * Rings {@code label} with an optional {@code speech} announcement that is spoken (in Sinhala,
     * with the user's name when present) over the tone. The web layer writes the text because it
     * knows the logged-in name; the receiver just hands it through.
     */
    public static void startAlarm(Context ctx, String label, String soundId, String speech) {
        currentTitle = "Alarm - " + (label == null || label.trim().isEmpty() ? "Alert" : label.trim());
        alarmActive = true;
        // Web Audio creates its audio track, but on this WebView the track comes up muted unless
        // the app holds audio focus: `dumpsys audio` showed an empty focus stack while an
        // AudioTrack was already active, and the alarm played nothing. Grabbing focus here — before
        // asking the page to make any noise — is what makes it audible.
        requestAudioFocusForAlarm(ctx);
        // Start the native tone as well. This is the only thing guaranteed to be audible when the
        // app has been closed: the WebView renderer is gone in that state, so the web layer's
        // AudioEngine cannot make a sound at all. The page still takes over with the user's custom
        // sound when it is alive, and the native tone is what covers the case where it is not.
        String sound = soundId == null || soundId.trim().isEmpty() ? null : soundId.trim();
        startNativeAlarmTone(ctx, sound);
        // Vibration straight from the vibrator service. The notification channel's pattern alone
        // was not enough (channel state and the VIBRATE permission both had to line up), and an
        // alarm that only shows up silently does not wake anyone.
        startAlarmVibration(ctx);
        ensureRunning(ctx);
        postAlarmNotification(ctx);
        // The web layer owns the sound (custom MP3s live in its IndexedDB) and the ring UI, so ask
        // it to start. This is the path an OS-fired alarm takes, where no timer in the page ever
        // got the chance to run.
        MainActivity.dispatchMediaCommand("ringAlarm");
        // Announce over the tone what the ring is for (e.g. "<name>, පන්තිය පටන් ගන්නවා").
        // Events scheduled by an older build carry no speech field; make one up from the label so
        // the voice always speaks instead of silently doing nothing.
        String speak = speech;
        if (speak == null || speak.trim().isEmpty()) speak = defaultSpeechFor(label);
        speakSpeech(ctx, speak);
        // Arm (or re-arm) the auto-silence timer for this ring.
        sAlarmCtx = ctx.getApplicationContext();
        MAIN.removeCallbacks(ALARM_AUTO_STOP_TASK);
        MAIN.postDelayed(ALARM_AUTO_STOP_TASK, ALARM_AUTO_STOP_MS);
    }

    /** Words to speak when the schedule predates the speech field. */
    private static String defaultSpeechFor(String label) {
        if (label == null) return "";
        String t = label.trim();
        if (t.startsWith("Class soon:")) return "තව පැය 2 යි. සූදානම් වෙන්න.";
        if (t.startsWith("Class:")) return "පන්තිය පටන් ගන්නවා. ඉක්මනට එන්න.";
        // A personal alarm: read its own text, whatever language that is.
        return t;
    }

    /**
     * Holds alarm-stream audio focus for a few seconds so a short UI preview is audible.
     *
 * <p>Previews are rendered by the page with Web Audio, which this WebView mutes unless the app owns
 * audio focus. A ringing alarm grabs focus on its own; this is the equivalent for a tap on a sound
 * in the picker, and it gives the focus back on its own so a preview can never hold onto it.
 */
    public static void previewTone(Context ctx) {
        sPreviewCtx = ctx.getApplicationContext();
        requestAudioFocusForAlarm(ctx);
        MAIN.removeCallbacks(RELEASE_PREVIEW_FOCUS);
        MAIN.postDelayed(RELEASE_PREVIEW_FOCUS, PREVIEW_FOCUS_MS);
    }

    private static Context sPreviewCtx;

    private static final Runnable RELEASE_PREVIEW_FOCUS = () -> {
        if (!alarmActive && sPreviewCtx != null) {
            abandonAudioFocusForAlarm(sPreviewCtx);
        }
    };

    private static final long PREVIEW_FOCUS_MS = 4000L;

    // ---- media audio focus (YouTube / background playback) ----
    // Chromium's WebView audio stack requests and then abandons audio focus on its own whenever the
    // page goes hidden, which is exactly when the audio track is torn down (dumpsys shows the
    // WebView's AudioFocusDelegate abandoning focus as the app leaves the foreground). Holding a
    // media focus from the app itself keeps the uid's audio session routed so the track survives the
    // background transition — the same trick that made the alarm/preview audible.
    private static AudioFocusRequest sMediaFocusRequest;
    private static boolean sMediaFocusHeld = false;

    private static void requestAudioFocusForMedia(Context ctx) {
        if (sMediaFocusHeld) return;
        AudioManager am = (AudioManager) ctx.getSystemService(Context.AUDIO_SERVICE);
        if (am == null) return;
        try {
            int result;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                if (sMediaFocusRequest == null) {
                    sMediaFocusRequest = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
                            .setAudioAttributes(new AudioAttributes.Builder()
                                    .setUsage(AudioAttributes.USAGE_MEDIA)
                                    .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                                    .build())
                            .setOnAudioFocusChangeListener(focusChange -> {
                                if (focusChange == AudioManager.AUDIOFOCUS_LOSS
                                        && !alarmActive) {
                                    dispatchMediaCommand("pause");
                                }
                            })
                            .build();
                }
                result = am.requestAudioFocus(sMediaFocusRequest);
            } else {
                result = am.requestAudioFocus(null, AudioManager.STREAM_MUSIC,
                        AudioManager.AUDIOFOCUS_GAIN);
            }
            sMediaFocusHeld = result == AudioManager.AUDIOFOCUS_REQUEST_GRANTED;
            Log.i(TAG, "media audio focus requested granted=" + sMediaFocusHeld);
        } catch (Throwable t) {
            Log.w(TAG, "media audio focus request failed", t);
        }
    }

    private static void abandonAudioFocusForMedia(Context ctx) {
        if (!sMediaFocusHeld) return;
        AudioManager am = (AudioManager) ctx.getSystemService(Context.AUDIO_SERVICE);
        if (am == null) return;
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                if (sMediaFocusRequest != null) am.abandonAudioFocusRequest(sMediaFocusRequest);
            } else {
                am.abandonAudioFocus(null);
            }
            Log.i(TAG, "media audio focus abandoned");
        } catch (Throwable ignored) {
        } finally {
            sMediaFocusHeld = false;
        }
    }

    // ---- spoken announcement (Sinhala TTS) ----
    // The web layer writes the text (it knows the logged-in name); this speaks it over the alarm
    // tone so the first words the user hears say what the ring is for. Devices usually ship with a
    // Google TTS that reads Sinhala; when no Sinhala voice exists it falls back to the default
    // voice rather than fail the ring.

    private static android.speech.tts.TextToSpeech sTts;
    private static boolean sTtsReady = false;
    private static String sPendingSpeech = null;
    private static boolean sSpeechBeginScheduled = false;
    private static boolean sSpeechRetried = false;
    private static final String SPEECH_TAG = "biopulse-speech";

    private static void speakSpeech(Context ctx, String text) {
        if (text == null || text.trim().isEmpty()) return;
        final Context app = ctx.getApplicationContext();
        sPendingSpeech = text;
        if (sTts == null) {
            sTts = new android.speech.tts.TextToSpeech(app, status -> {
                if (status != android.speech.tts.TextToSpeech.SUCCESS) {
                    Log.w(TAG, "TTS init failed (status " + status + ") — no spoken announcement");
                    endSpeechDucking();
                    sPendingSpeech = null;
                    return;
                }
                sTtsReady = true;
                configureVoice(sTts);
                // Engine just came up: the announcement can start immediately.
                scheduleSpeechBegin(0L);
            });
            return;
        }
        scheduleSpeechBegin(350L);
    }

    /** Loads the engine without speaking — used at service start so rings begin instantly. */
    private static void warmTts(Context ctx) {
        if (sTts != null || sTtsReady) return;
        final Context app = ctx.getApplicationContext();
        sTts = new android.speech.tts.TextToSpeech(app, status -> {
            if (status != android.speech.tts.TextToSpeech.SUCCESS) {
                Log.w(TAG, "TTS warm-up failed (status " + status + ")");
                sTts = null;
                return;
            }
            sTtsReady = true;
            configureVoice(sTts);
            // A ring started while the warm-up was still loading — say it right away.
            if (sPendingSpeech != null) scheduleSpeechBegin(0L);
        });
    }

    /**
     * Prefers a clear Sinhala voice (Google's "si-lk-x-sil-local" is a neural female on most
     * devices; any explicitly named female/local voice wins), falling back to whatever the engine
     * picked. When only a default-language voice exists the per-utterance language setting below
     * still takes over for Sinhala text.
     */
    private static void configureVoice(android.speech.tts.TextToSpeech tts) {
        try {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.LOLLIPOP) return;
            java.util.Set<android.speech.tts.Voice> voices = tts.getVoices();
            if (voices == null || voices.isEmpty()) return;
            android.speech.tts.Voice resolved = null;
            boolean haveSinhala = false;
            for (android.speech.tts.Voice v : voices) {
                boolean sinhalaVoice = v.getLocale().getLanguage().equalsIgnoreCase("si");
                if (!sinhalaVoice) continue;
                haveSinhala = true;
                if (resolved == null) resolved = v;
                String n = (v.getName() == null ? "" : v.getName()).toLowerCase();
                if (n.contains("female") || n.contains("local") || n.contains("neural")) {
                    resolved = v;
                    break;
                }
            }
            if (resolved != null) {
                tts.setVoice(resolved);
                if (haveSinhala) tts.setLanguage(new java.util.Locale("si", "LK"));
            }
        } catch (Throwable t) {
            Log.w(TAG, "voice selection failed", t);
        }
    }

    /**
     * Starts the announcement after a short beat so the tone and web audio have settled and the
     * first musical notes sink in; jumping straight in is what used to cut the voice off.
     */
    private static void scheduleSpeechBegin(long delayMs) {
        if (sSpeechBeginScheduled) return;
        sSpeechBeginScheduled = true;
        beginSpeechDucking();
        MAIN.postDelayed(SPEECH_START_JOB, delayMs);
    }

    private static final Runnable SPEECH_START_JOB = () -> runSpeechStartJob();

    private static void runSpeechStartJob() {
        sSpeechBeginScheduled = false;
        if (sPendingSpeech == null) return;
        if (!sTtsReady || sTts == null) {
            // Engine still warming up: retry until it answers.
            sSpeechBeginScheduled = true;
            MAIN.postDelayed(SPEECH_START_JOB, 250L);
            return;
        }
        String text = sPendingSpeech;
        sPendingSpeech = null;
        sSpeechRetried = false;
        speakUtterance(text);
    }

    private static void speakUtterance(String text) {
        if (sTts == null || !sTtsReady) return;
        try {
            // Route TTS to the alarm stream (USAGE_ALARM) so it lands at the same volume as the
            // tone. Left on its default, TTS follows the media/system volume, which can be near
            // zero while an alarm is still loud — reading as "the voice didn't work".
            sTts.setAudioAttributes(new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_ALARM)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                    .build());
            boolean sinhala = false;
            for (int i = 0; i < text.length(); i++) {
                char c = text.charAt(i);
                if (c >= '\u0D80' && c <= '\u0DFF') {
                    sinhala = true;
                    break;
                }
            }
            if (sinhala) {
                java.util.Locale si = new java.util.Locale("si", "LK");
                if (sTts.isLanguageAvailable(si) >= android.speech.tts.TextToSpeech.LANG_AVAILABLE) {
                    sTts.setLanguage(si);
                } else {
                    Log.w(TAG, "Sinhala TTS voice not installed — speaking with the default voice");
                }
            }
            // Slightly slower and brighter than default so Sinhala words land clearly.
            sTts.setSpeechRate(0.95f);
            sTts.setPitch(1.05f);
            sTts.setOnUtteranceProgressListener(new android.speech.tts.UtteranceProgressListener() {
                @Override
                public void onStart(String id) {
                }

                @Override
                public void onDone(String id) {
                    if (SPEECH_TAG.equals(id)) endSpeechDucking();
                }

                @Override
                public void onStop(String id, boolean interrupted) {
                    if (SPEECH_TAG.equals(id)) endSpeechDucking();
                }

                @Override
                public void onError(String id, int errorCode) {
                    if (SPEECH_TAG.equals(id)) retryOrEnd();
                }

                @Override
                @Deprecated
                public void onError(String id) {
                    if (SPEECH_TAG.equals(id)) retryOrEnd();
                }

                private void retryOrEnd() {
                    if (!sSpeechRetried) {
                        sSpeechRetried = true;
                        MAIN.postDelayed(() -> {
                            if (sTts != null && sTtsReady) speakUtterance(sPendingUtterance(text));
                        }, 400L);
                        return;
                    }
                    endSpeechDucking();
                    Log.w(TAG, "TTS utterance failed twice — gave up");
                }
            });
            sPendingUtteranceRef = text;
            int r = sTts.speak(text, android.speech.tts.TextToSpeech.QUEUE_FLUSH, null, SPEECH_TAG);
            if (r != android.speech.tts.TextToSpeech.SUCCESS) {
                Log.w(TAG, "TTS speak returned " + r + " / " + text);
                endSpeechDucking();
            }
        } catch (Throwable t) {
            Log.w(TAG, "TTS speak failed", t);
            endSpeechDucking();
        }
    }

    private static String sPendingUtteranceRef = null;

    private static String sPendingUtterance(String fallback) {
        return sPendingUtteranceRef != null ? sPendingUtteranceRef : fallback;
    }

    /** Lowers music under the voice, then restores it once the voice is done. */
    private static void beginSpeechDucking() {
        MainActivity.dispatchMediaCommand("speechStart");
    }

    private static void endSpeechDucking() {
        MainActivity.dispatchMediaCommand("speechEnd");
    }

    /** A short goodbye spoken when the alarm is dismissed from the full-screen notification. */
    private static void speakDismiss(Context ctx) {
        sPendingSpeech = "හරි, බායි. හොඳ දවසක්.";
        // Cancel a still-pending ring announcement so it cannot talk after the dismiss.
        if (sSpeechBeginScheduled) {
            MAIN.removeCallbacks(SPEECH_START_JOB);
            sSpeechBeginScheduled = false;
        }
        scheduleSpeechBegin(0L);
        MAIN.postDelayed(() -> {
            if (sTts != null && sTtsReady) {
                endSpeechDucking();
                shutdownSpeech();
            }
        }, 4500L);
    }

    private static void stopSpeech() {
        sPendingSpeech = null;
        endSpeechDucking();
        try {
            if (sTts != null) sTts.stop();
        } catch (Throwable ignored) {
        }
    }

    private static void shutdownSpeech() {
        stopSpeech();
        try {
            if (sTts != null) {
                sTts.shutdown();
                sTtsReady = false;
                sTts = null;
            }
        } catch (Throwable ignored) {
        }
    }

    // ---- native alarm tone ----

    private static MediaPlayer sNativeTone;

    /**
     * What actually rang, e.g. {@code sound: custom} or {@code sound: default (no sound id
     * passed)}. Shown as the alarm notification's text so a fallback is visible on the lock
     * screen without anyone having to fetch logcat.
     */
    private static String sToneNote;

    /**
     * Plays the selected alarm tone with {@link MediaPlayer}, looping until the alarm is dismissed.
     *
     * <p>This is deliberately independent of the WebView. Measured on a Galaxy A01 Core: with the
     * app closed, the notification posted and audio focus was granted, but nothing was audible
     * because the renderer that runs {@code AudioContext} no longer exists. A ringtone here is the
     * only sound the OS can make on the app's behalf.
     *
     * <p>The candidates follow the user's choice first: the custom file's native copy (its id
     * arrives as {@code custom:<id>}), or the bundled recording of the selected built-in tone.
     * Only when the selection is unavailable does it fall back to the system alarm tone, the
     * system ringtone, and finally the generic bundled tone — never silence.
     */
    private static void startNativeAlarmTone(Context ctx, String soundId) {
        if (sNativeTone != null) return;

        sToneNote = null;
        Context app = ctx.getApplicationContext();
        String sound = soundId == null || soundId.trim().isEmpty() ? null : soundId.trim();

        // Ordered candidates: the user's selection first, then progressively weaker fallbacks —
        // never silence. Bundled tones are opened straight from raw resources with
        // openRawResourceFd; an "android.resource://pkg/<id>" URI (the bare numeric form this
        // used to build) is rejected by MediaPlayer's resolver, which silently pushed every alarm
        // onto the system ringtone — on the user's ROM, a jingle called "Homecoming" — instead of
        // the tone they picked. A file descriptor cannot hit that path.
        java.util.ArrayList<Object> candidates = new java.util.ArrayList<>();
        if (sound != null && sound.startsWith("custom:")) {
            String id = sound.substring("custom:".length());
            android.content.SharedPreferences p =
                    app.getSharedPreferences("biopulse_sounds", Context.MODE_PRIVATE);
            String path = p.getString("custom_path_" + id, null);
            if (path != null) {
                java.io.File f = new java.io.File(path);
                if (f.exists() && f.length() > 0) {
                    Log.i(TAG, "custom sound file ok: " + f.length() + " bytes -> " + path);
                    candidates.add(Uri.fromFile(f));
                } else {
                    Log.w(TAG, "custom sound file missing: " + path);
                }
            } else {
                Log.w(TAG, "no native copy of custom sound " + id
                        + "; falling back to system tone");
            }
        } else if ("chime".equals(sound)) {
            candidates.add(R.raw.bp_tone_chime);
        } else if ("digital".equals(sound)) {
            candidates.add(R.raw.bp_tone_digital);
        } else if ("bio".equals(sound)) {
            candidates.add(R.raw.bp_tone_bio);
        } else if ("study".equals(sound)) {
            // Calm background music for classes. Played under the voice, so it comes up quieter.
            candidates.add(R.raw.bp_study_loop);
        } else if ("romantic".equals(sound)) {
            // Slow, warm music for the 3 AM wake-up, also played under the voice.
            candidates.add(R.raw.bp_romantic_loop);
        }
        boolean customSelected = sound != null && sound.startsWith("custom:");
        boolean customPresent = customSelected && !candidates.isEmpty();
        Uri alarmUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);
        if (alarmUri != null) candidates.add(alarmUri);
        Uri ringtoneUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
        if (ringtoneUri != null) candidates.add(ringtoneUri);
        candidates.add(R.raw.bp_alarm_tone);

        // An alarm cannot be heard on a muted alarm stream (some devices ship with it at zero).
        // Falling back to the media stream beats ringing into nothing; the choice is logged so
        // logcat shows exactly which stream and source produced the sound.
        AudioManager am = (AudioManager) app.getSystemService(Context.AUDIO_SERVICE);
        boolean alarmStreamAudible = am != null && am.getStreamVolume(AudioManager.STREAM_ALARM) > 0;
        int usage = alarmStreamAudible
                ? AudioAttributes.USAGE_ALARM
                : AudioAttributes.USAGE_MEDIA;
        String streamNote = alarmStreamAudible
                ? "alarm stream audible"
                : "alarm stream muted, using media stream";

        for (Object candidate : candidates) {
            MediaPlayer attempt = null;
            String source = null;
            try {
                attempt = new MediaPlayer();
                if (candidate instanceof Integer) {
                    int resId = (Integer) candidate;
                    android.content.res.AssetFileDescriptor afd =
                            app.getResources().openRawResourceFd(resId);
                    if (afd == null) throw new IllegalStateException("raw resource missing");
                    try {
                        attempt.setDataSource(afd.getFileDescriptor(), afd.getStartOffset(),
                                afd.getLength());
                    } finally {
                        afd.close();
                    }
                    source = "raw:" + app.getResources().getResourceEntryName(resId);
                } else {
                    Uri uri = (Uri) candidate;
                    attempt.setDataSource(app, uri);
                    source = uri.toString();
                }
                attempt.setAudioAttributes(new AudioAttributes.Builder()
                        .setUsage(usage)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .build());
                attempt.setLooping(true);
                // The study/romantic loops are deliberately background: the spoken announcement is the focus,
                // so the music sits lower. Everything else stays at full volume.
                if ("study".equals(sound) || "romantic".equals(sound)) {
                    attempt.setVolume(0.55f, 0.55f);
                }
                attempt.setOnErrorListener((p, what, extra) -> {
                    // Keep looping by hand; setLooping does not survive a decode hiccup on some
                    // builds.
                    try {
                        if (what == MediaPlayer.MEDIA_ERROR_UNKNOWN
                                && extra == MediaPlayer.MEDIA_ERROR_UNKNOWN) {
                            p.seekTo(0);
                            p.start();
                            return true;
                        }
                    } catch (Throwable ignored) {
                    }
                    return false;
                });
                attempt.setOnCompletionListener(p -> {
                    try {
                        p.seekTo(0);
                        p.start();
                    } catch (Throwable ignored) {
                    }
                });
                attempt.prepare();
                attempt.start();
                sNativeTone = attempt;
                sToneNote = toneNoteFor(source, customSelected, customPresent, sound);
                Log.i(TAG, streamNote + ", tone source=" + source + ", " + sToneNote);
                return;
            } catch (Throwable t) {
                Log.w(TAG, "tone source unavailable: " + candidate + " (" + t.getMessage() + ")");
                if (attempt != null) {
                    try {
                        attempt.release();
                    } catch (Throwable ignored) {
                    }
                }
            }
        }
        Log.w(TAG, "no playable tone source");
        sToneNote = "sound: none";
    }

    /** One line describing what rang — deliberately plain enough to read on a lock screen. */
    private static String toneNoteFor(String source, boolean customSelected,
                                      boolean customPresent, String sound) {
        if (source == null) return "sound: none";
        if (source.startsWith("file://")) return "sound: custom";
        if (source.startsWith("raw:")) return "sound: " + source.substring(4);
        if (customSelected) {
            return customPresent
                    ? "sound: custom file unreadable, using system tone"
                    : "sound: custom copy missing, using system tone";
        }
        if (sound == null) return "sound: default (no sound id passed)";
        return "sound: system tone (" + sound + " unavailable)";
    }

    // ---- alarm vibration ----

    private static android.os.Vibrator alarmVibrator(Context ctx) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                android.os.VibratorManager vm =
                        (android.os.VibratorManager) ctx.getSystemService(Context.VIBRATOR_MANAGER_SERVICE);
                return vm != null ? vm.getDefaultVibrator() : null;
            }
            return (android.os.Vibrator) ctx.getSystemService(Context.VIBRATOR_SERVICE);
        } catch (Throwable t) {
            return null;
        }
    }

    /**
     * Vibrates in the alarm pattern until it is stopped.
     *
     * <p>Runs from the vibrator service rather than relying on the notification channel's
     * vibration: the channel has to exist with the right settings AND the app needs the VIBRATE
     * permission for that path to do anything, and a missed dependency there previously left the
     * alarm completely silent in every sense. The direct call only needs the permission.
     */
    private static void startAlarmVibration(Context ctx) {
        try {
            android.os.Vibrator v = alarmVibrator(ctx);
            if (v == null) {
                Log.w(TAG, "no vibrator service");
                return;
            }
            if (!v.hasVibrator()) {
                Log.w(TAG, "device reports no vibrator");
                return;
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                // Two short pulses, a gap, then a longer one — the same shape the notification
                // channel uses, looping until the alarm is dismissed.
                v.vibrate(android.os.VibrationEffect.createWaveform(
                        new long[]{400, 250, 400, 250, 900, 700}, 0));
            } else {
                v.vibrate(new long[]{0, 400, 250, 400, 250, 900, 700}, 0);
            }
            Log.i(TAG, "alarm vibration started");
        } catch (Throwable t) {
            Log.w(TAG, "vibration failed: " + t.getMessage());
        }
    }

    private static void stopAlarmVibration(Context ctx) {
        try {
            android.os.Vibrator v = alarmVibrator(ctx);
            if (v != null) v.cancel();
        } catch (Throwable ignored) {
        }
    }

    public static void stopNativeAlarmTone() {
        MediaPlayer mp = sNativeTone;
        sNativeTone = null;
        if (mp == null) return;
        try {
            if (mp.isPlaying()) mp.stop();
        } catch (Throwable ignored) {
        }
        try {
            mp.release();
        } catch (Throwable ignored) {
        }
        Log.i(TAG, "native alarm tone stopped");
    }

    private static MediaPlayer sAlertTone;

    /**
     * The small, quiet sound for notification-only alerts (the 12 AM daily check-in). Plays once,
     * softly, over the alarm stream — nothing like a full ring, and never a full-screen alarm.
     */
    public static void playAlertTone(Context ctx, String soundId) {
        final int res = R.raw.bp_tone_tink;
        MediaPlayer mp = MediaPlayer.create(ctx, res);
        if (mp == null) return;
        try {
            stopAlertTone();
            mp.setAudioAttributes(new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_ALARM)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build());
            mp.setVolume(0.6f, 0.6f);
            mp.setOnCompletionListener(p -> {
                if (sAlertTone == p) sAlertTone = null;
                try {
                    p.release();
                } catch (Throwable ignored) {
                }
            });
            sAlertTone = mp;
            if (!mp.isPlaying()) mp.start();
            Log.i(TAG, "alert tone played (" + soundId + ")");
        } catch (Throwable t) {
            Log.w(TAG, "alert tone failed", t);
            try {
                mp.release();
            } catch (Throwable ignored) {
            }
            sAlertTone = null;
        }
    }

    private static void stopAlertTone() {
        MediaPlayer mp = sAlertTone;
        sAlertTone = null;
        if (mp == null) return;
        try {
            if (mp.isPlaying()) mp.stop();
        } catch (Throwable ignored) {
        }
        try {
            mp.release();
        } catch (Throwable ignored) {
        }
    }

    private static AudioFocusRequest sFocusRequest;

    private static void requestAudioFocusForAlarm(Context ctx) {
        AudioManager am = (AudioManager) ctx.getSystemService(Context.AUDIO_SERVICE);
        if (am == null) return;
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                if (sFocusRequest == null) {
                    sFocusRequest = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
                            .setAudioAttributes(new AudioAttributes.Builder()
                                    .setUsage(AudioAttributes.USAGE_ALARM)
                                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                                    .build())
                            .setOnAudioFocusChangeListener(focusChange -> {
                                if (focusChange == AudioManager.AUDIOFOCUS_LOSS) {
                                    cancelAlarmNotification(ctx);
                                    stopAlarmVibration(ctx);
                                }
                            })
                            .build();
                }
                am.requestAudioFocus(sFocusRequest);
            } else {
                am.requestAudioFocus(null, AudioManager.STREAM_ALARM, AudioManager.AUDIOFOCUS_GAIN_TRANSIENT);
            }
        } catch (Throwable t) {
            Log.w(TAG, "audio focus request failed", t);
        }
    }

    private static void abandonAudioFocusForAlarm(Context ctx) {
        AudioManager am = (AudioManager) ctx.getSystemService(Context.AUDIO_SERVICE);
        if (am == null) return;
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                if (sFocusRequest != null) am.abandonAudioFocusRequest(sFocusRequest);
            } else {
                am.abandonAudioFocus(null);
            }
        } catch (Throwable ignored) {
        }
    }

    /** Releases only the alarm hold — media playback, if active, keeps the service alive. */
    public static void stopAlarm(Context ctx) {
        alarmActive = false;
        MAIN.removeCallbacks(ALARM_AUTO_STOP_TASK);
        sAlarmCtx = null;
        stopNativeAlarmTone();
        stopAlarmVibration(ctx);
        abandonAudioFocusForAlarm(ctx);
        cancelAlarmNotification(ctx);
        stopSpeech();
        if (!mediaPlaying) {
            scheduleRelease(ctx);
        } else {
            releaseScheduled = false;
            MAIN.removeCallbacks(RELEASE_TASK);
            refresh(ctx);
        }
    }

    /** Called from the web layer whenever the player state changes. */
    public static void update(Context ctx, String state, String title) {
        if (title != null && !title.trim().isEmpty()) currentTitle = title;

        if ("playing".equals(state)) {
            // Start immediately (rather than waiting for onPause) so a background/lock-screen
            // transition can never race ahead of the foreground service.
            mediaPlaying = true;
            playbackRequested = true;
            requestAudioFocusForMedia(ctx);
        } else {
            mediaPlaying = false;
        }

        if (mediaPlaying) {
            ensureRunning(ctx);
        } else {
            MAIN.removeCallbacks(KEEPALIVE_TASK);
            // Keep the playhead so the notification can resume where it left off, but hold the
            // service open while the user still wants audio: the embed pausing itself in the
            // background must not look like the user hitting stop.
            if (playbackRequested) {
                ensureRunning(ctx);
            } else {
                positionMs = 0;
                durationMs = 0;
                scheduleRelease(ctx);
            }
        }

        if (isPlaying() || keepAliveActive || playbackRequested) {
            ensureRunning(ctx);
        } else {
            abandonAudioFocusForMedia(ctx);
            scheduleRelease(ctx);
        }
    }

    private static void refresh(Context ctx) {
        MediaPlaybackService svc = instance.get();
        if (svc == null) return;
        MAIN.post(() -> svc.postNotification());
    }

    /** Nudges the embed and advances the notification progress bar. */
    private void tickProgress() {
        if (!mediaPlaying) return;
        if (durationMs > 0) positionMs = Math.min(durationMs, positionMs + KEEPALIVE_INTERVAL_MS);
        postNotification();
    }

    @Override
    public void onCreate() {
        super.onCreate();
        instance = new WeakReference<>(this);
        createChannel();
        createMediaSession();
        acquireWakeLock();
        // Bring the TTS engine up now so the first announcement is instant instead of waiting for
        // engine initialisation to finish at ring time.
        warmTts(this);
        // Re-arm the DM background poller if it was left on. The service can be recreated after a
        // process kill (STICKY restart) or a task removal, and the poller must come back with it.
        dmAppCtx = getApplicationContext();
        if (dmWatchEnabled(this)) {
            dmWatchActive = true;
            dmBaselineSet = false;
            dmUnreadSeen.clear();
            armDmLoop();
            Log.i(TAG, "DM background poller re-armed");
        }
    }

    /**
     * Publishes the system media session and wires its transport buttons back into the same
     * start/stop actions the notification uses.
     */
    private void createMediaSession() {
        try {
            mediaSession = new MediaSessionCompat(this, "BioPulseMedia");
            mediaSession.setFlags(MEDIA_SESSION_FLAGS);
            mediaSession.setCallback(new MediaSessionCompat.Callback() {
                @Override
                public void onPlay() {
                    startServiceAction(ACTION_PLAY);
                }

                @Override
                public void onPause() {
                    startServiceAction(ACTION_PAUSE);
                }

                @Override
                public void onStop() {
                    startServiceAction(ACTION_STOP);
                }
            });
            updateSessionState();
        } catch (Throwable t) {
            Log.w(TAG, "media session unavailable", t);
            mediaSession = null;
        }
    }

    /**
     * Drives the session's active flag, transport state and title so Android keeps the media
     * pipeline scheduled even while the embed has momentarily paused itself in the background.
     */
    private void updateSessionState() {
        MediaSessionCompat session = mediaSession;
        if (session == null) return;
        try {
            boolean wantPlay = mediaPlaying || playbackRequested || alarmActive;
            session.setActive(wantPlay);
            long pos = durationMs > 0 ? Math.min(positionMs, durationMs) : Math.max(0, positionMs);
            PlaybackStateCompat.Builder state = new PlaybackStateCompat.Builder()
                    .setActions(PlaybackStateCompat.ACTION_PLAY
                            | PlaybackStateCompat.ACTION_PAUSE
                            | PlaybackStateCompat.ACTION_PLAY_PAUSE
                            | PlaybackStateCompat.ACTION_STOP
                            | PlaybackStateCompat.ACTION_SEEK_TO)
                    .setState(
                            wantPlay ? PlaybackStateCompat.STATE_PLAYING
                                    : PlaybackStateCompat.STATE_PAUSED,
                            pos,
                            mediaPlaying ? 1f : 0f);
            session.setPlaybackState(state.build());
            session.setMetadata(new MediaMetadataCompat.Builder()
                    .putString(MediaMetadataCompat.METADATA_KEY_TITLE, currentTitle)
                    .putLong(MediaMetadataCompat.METADATA_KEY_DURATION, durationMs)
                    .build());
        } catch (Throwable ignored) {
        }
    }

    /** Re-issues one of the service's own actions (used by the media-session buttons). */
    private void startServiceAction(String action) {
        try {
            Context ctx = getApplicationContext();
            Intent intent = new Intent(ctx, MediaPlaybackService.class);
            intent.setAction(action);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                ctx.startForegroundService(intent);
            } else {
                ctx.startService(intent);
            }
        } catch (Throwable t) {
            Log.w(TAG, "media-session action " + action + " rejected", t);
        }
    }

    /** Keeps the CPU running so audio continues after the screen turns off. */
    private void acquireWakeLock() {
        if (wakeLock != null) return;
        try {
            PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
            if (pm == null) return;
            wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "BioPulse:MediaPlayback");
            wakeLock.setReferenceCounted(false);
            // Bounded so a leaked service can never drain the battery indefinitely.
            wakeLock.acquire(WAKE_LOCK_TIMEOUT_MS);
        } catch (Exception ignored) {
        }
    }

    private void releaseWakeLock() {
        try {
            if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        } catch (Exception ignored) {
        }
        wakeLock = null;
    }

    /**
     * Promotes to foreground immediately. Android 12+ aborts the process with
     * {@code RemoteServiceException} if {@code startForegroundService()} is not followed by
     * {@code startForeground()} promptly, so this must run before any state check — including
     * on the paths that end in {@code stopSelf()}.
     */
    private boolean promoteToForeground() {
        Notification notification;
        try {
            notification = buildNotification();
        } catch (Exception e) {
            // A failed build must still satisfy the startForegroundService() contract, or Android
            // kills the process with RemoteServiceException for never calling startForeground().
            Log.w(TAG, "buildNotification failed; using minimal notification", e);
            notification = minimalNotification();
        }
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(NOTIF_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
            } else {
                startForeground(NOTIF_ID, notification);
            }
            // Track that the service really is foreground. Without this the flag stayed false
            // forever, so ensureRunning() re-issued startForegroundService() on every call and the
            // resulting start/stop churn crashed the process with
            // "startForegroundService() did not then call startForeground()".
            foreground = true;
            return true;
        } catch (Exception ignored) {
            // Type-specific promotion can be rejected (missing permission on some OEM builds) —
            // retry untyped so the startForegroundService() contract is still satisfied.
            try {
                startForeground(NOTIF_ID, notification);
                foreground = true;
                return true;
            } catch (Exception ignoredAgain) {
                Log.e(TAG, "startForeground failed", ignoredAgain);
                foreground = false;
                return false;
            }
        }
    }

    /** Bare-bones notification used only when the full one cannot be built. */
    private Notification minimalNotification() {
        return new NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(android.R.drawable.ic_media_play)
                .setContentTitle(currentTitle)
                .setContentText("Playing in the background")
                .setOngoing(true)
                .setSilent(true)
                .build();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent != null && intent.getAction() != null ? intent.getAction() : ACTION_START;

        if (ACTION_PLAY.equals(action)) {
            if ("tgaudio".equals(mediaOwner)) {
                dispatchMediaCommand("play");
            } else {
                mediaPlaying = true;
                playbackRequested = true;
                requestAudioFocusForMedia(this);
                dispatchMediaCommand("play");
            }
        } else if (ACTION_PAUSE.equals(action)) {
            if ("tgaudio".equals(mediaOwner)) {
                dispatchMediaCommand("pause");
            } else {
                mediaPlaying = false;
                playbackRequested = false;
                abandonAudioFocusForMedia(this);
                dispatchMediaCommand("pause");
            }
        } else if (ACTION_STOP.equals(action)) {
            mediaPlaying = false;
            alarmActive = false;
            playbackRequested = false;
            MAIN.removeCallbacks(ALARM_AUTO_STOP_TASK);
            sAlarmCtx = null;
            stopNativeAlarmTone();
            stopAlarmVibration(this);
            abandonAudioFocusForAlarm(this);
            abandonAudioFocusForMedia(this);
            cancelAlarmNotification(this);
            stopSpeech();
            dispatchMediaCommand("stop");
        } else if (ACTION_DISMISS_ALARM.equals(action)) {
            // Dismiss from the notification: stop the ringing UI, drop the alarm hold and take the
            // lock-screen popup away. Media playback, if it is running, is left alone.
            alarmActive = false;
            MAIN.removeCallbacks(ALARM_AUTO_STOP_TASK);
            sAlarmCtx = null;
            stopNativeAlarmTone();
            stopAlarmVibration(this);
            abandonAudioFocusForAlarm(this);
            cancelAlarmNotification(this);
            speakDismiss(this);
            MainActivity.dispatchMediaCommand("dismissAlarm");
            if (mediaPlaying) {
                refresh(this);
            } else {
                scheduleRelease(this);
            }
            return START_NOT_STICKY;
        }

        // Promote first, reconcile afterwards. Playback state can flip between the
        // startForegroundService() call and this delivery, and skipping the promotion on that
        // path is what used to crash the app.
        boolean promoted = promoteToForeground();
        Log.i(TAG, "onStartCommand action=" + action + " promoted=" + promoted + " playing=" + isPlaying() + " keepAlive=" + keepAliveActive);

        // Telegram keep-alive holds the service (and thus the WebView renderer) open on its own;
        // nothing is "playing" but the silent loop keeps the process alive until the user
        // disconnects.
        if (keepAliveActive) {
            postNotification();
            MAIN.removeCallbacks(KEEPALIVE_TASK);
            return START_NOT_STICKY;
        }

        // The DM background poller also holds the service open on its own: nothing is "playing",
        // but new-message notifications must keep arriving while the app is closed. STICKY so a
        // process kill brings the service (and onCreate's re-arm) straight back.
        if (dmWatchActive) {
            releaseScheduled = false;
            MAIN.removeCallbacks(RELEASE_TASK);
            postNotification();
            return START_STICKY;
        }

        if (!promoted || (!isPlaying() && !hasPlaybackIntent())) {
            // Nothing worth keeping. Release asynchronously so a concurrent start request is
            // never cancelled mid-flight. While the user still wants audio (playbackRequested),
            // stay up: the embed may only report "playing" a moment later.
            stopSelf();
            if (!isPlaying()) releaseScheduled = true;
            return START_NOT_STICKY;
        }

        // Refresh the notification so the title/actions match the reconciled state.
        postNotification();
        // Drive the embed from here: background JS timers are throttled far too heavily to keep
        // YouTube's audio alive on their own.
        MAIN.removeCallbacks(KEEPALIVE_TASK);
        if (mediaPlaying) MAIN.postDelayed(KEEPALIVE_TASK, KEEPALIVE_INTERVAL_MS);
        return START_NOT_STICKY;
    }

    private void postNotification() {
        // Keep the system media session in lock-step with the notification's title/state.
        updateSessionState();
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (nm != null) {
            try {
                nm.notify(NOTIF_ID, buildNotification());
            } catch (Exception ignored) {
            }
        }
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (nm == null) return;
        if (nm.getNotificationChannel(CHANNEL_ID) == null) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "Media playback",
                NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("Keeps videos playing while BioPulse is in the background");
            channel.setShowBadge(false);
            channel.setSound(null, null);
            nm.createNotificationChannel(channel);
        }
        createAlarmChannel(nm);
    }

    /**
     * Alarm channel: high importance so it produces a heads-up popup and vibrates, with no
     * notification sound because the alarm tone itself is synthesised by Web Audio — a channel
     * sound would play on top of it.
     */
    private static void createAlarmChannel(NotificationManager nm) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationChannel existing = nm.getNotificationChannel(ALARM_CHANNEL_ID);
        if (existing != null) {
            // An older install may have created this channel at a lower importance, or with
            // vibration switched off; neither can be changed after creation, so replace it.
            if (existing.getImportance() >= NotificationManager.IMPORTANCE_HIGH
                    && existing.shouldVibrate()) {
                return;
            }
            nm.deleteNotificationChannel(ALARM_CHANNEL_ID);
        }
        NotificationChannel channel = new NotificationChannel(
            ALARM_CHANNEL_ID,
            "Alarms & reminders",
            NotificationManager.IMPORTANCE_HIGH
        );
        channel.setDescription("Wakes you when an alarm or reminder fires");
        channel.enableVibration(true);
        channel.setVibrationPattern(ALARM_VIBRATE);
        channel.setSound(null, null);
        channel.setBypassDnd(false);
        channel.setShowBadge(true);
        nm.createNotificationChannel(channel);
    }

    private static void postAlarmNotification(Context ctx) {
        NotificationManager nm = (NotificationManager) ctx.getSystemService(NOTIFICATION_SERVICE);
        if (nm == null || Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        createAlarmChannel(nm);

        Intent open = new Intent(ctx, MainActivity.class);
        open.setAction(Intent.ACTION_MAIN);
        open.addCategory(Intent.CATEGORY_LAUNCHER);
        open.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT
            | Intent.FLAG_ACTIVITY_NEW_TASK);
        int openFlags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) openFlags |= PendingIntent.FLAG_IMMUTABLE;
        PendingIntent contentIntent = PendingIntent.getActivity(ctx, REQ_ALARM_OPEN, open, openFlags);

        NotificationCompat.Builder b = new NotificationCompat.Builder(ctx, ALARM_CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
            .setContentTitle(currentTitle
                    + (sToneNote != null ? " • " + sToneNote : ""))
            .setContentText(sToneNote != null ? sToneNote : "Tap to open BioPulse")
            .setContentIntent(contentIntent)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            // The lock-screen takeover. Without this the alarm is just another row in the shade.
            .setFullScreenIntent(contentIntent, true)
            .setVibrate(ALARM_VIBRATE)
            .setDefaults(0)
            .setSilent(false)
            .setAutoCancel(false)
            .setOngoing(true)
            .setShowWhen(true)
            .setUsesChronometer(true)
            .setWhen(System.currentTimeMillis());

        b.addAction(
            android.R.drawable.ic_menu_close_clear_cancel,
            "Dismiss",
            actionIntent(ctx, ACTION_DISMISS_ALARM, REQ_DISMISS_ALARM)
        );

        try {
            sLastAlarmAt = System.currentTimeMillis();
            sLastAlarmTitle = currentTitle;
            nm.notify(ALARM_NOTIF_ID, b.build());
        } catch (Exception e) {
            Log.e(TAG, "alarm notification failed", e);
        }
    }

    private static void cancelAlarmNotification(Context ctx) {
        try {
            if (sLastAlarmAt > 0L) {
                // A ring lasts seconds, so a notification that vanishes the moment it stops can
                // never be seen afterwards — the whole point of a row in the shade. Leave a quiet,
                // dismissible "rang" entry behind instead.
                long rangAt = sLastAlarmAt;
                sLastAlarmAt = 0L;
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    postEndedAlarmNotification(ctx, rangAt);
                    return;
                }
            }
            NotificationManager nm = (NotificationManager) ctx.getSystemService(NOTIFICATION_SERVICE);
            if (nm != null) nm.cancel(ALARM_NOTIF_ID);
        } catch (Exception ignored) {
        }
    }

    /** The lasting, non-ongoing entry that replaces the ringing notification when the ring ends. */
    private static void postEndedAlarmNotification(Context ctx, long rangAt) {
        NotificationManager nm = (NotificationManager) ctx.getSystemService(NOTIFICATION_SERVICE);
        if (nm == null) return;
        createEndedAlarmChannel(nm);

        Intent open = new Intent(ctx, MainActivity.class);
        open.setAction(Intent.ACTION_MAIN);
        open.addCategory(Intent.CATEGORY_LAUNCHER);
        open.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT
            | Intent.FLAG_ACTIVITY_NEW_TASK);
        int openFlags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) openFlags |= PendingIntent.FLAG_IMMUTABLE;
        PendingIntent contentIntent = PendingIntent.getActivity(ctx, REQ_ALARM_OPEN, open, openFlags);

        String time = java.text.DateFormat.getTimeInstance(java.text.DateFormat.SHORT)
                .format(new java.util.Date(rangAt));
        NotificationCompat.Builder b = new NotificationCompat.Builder(ctx, ALARM_ENDED_CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
            .setContentTitle(sLastAlarmTitle.length() > 0 ? sLastAlarmTitle : currentTitle)
            .setContentText((sToneNote != null ? "Rang at " + time + " • " + sToneNote : "Rang at " + time))
            .setContentIntent(contentIntent)
            .setCategory(NotificationCompat.CATEGORY_REMINDER)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setAutoCancel(true)
            .setOngoing(false)
            .setShowWhen(true)
            .setWhen(rangAt);
        try {
            nm.notify(ALARM_NOTIF_ID, b.build());
        } catch (Exception e) {
            Log.e(TAG, "ended alarm notification failed", e);
        }
    }

    private static void createEndedAlarmChannel(NotificationManager nm) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        if (nm.getNotificationChannel(ALARM_ENDED_CHANNEL_ID) == null) {
            NotificationChannel c = new NotificationChannel(
                ALARM_ENDED_CHANNEL_ID,
                "Alarm history",
                NotificationManager.IMPORTANCE_DEFAULT
            );
            c.setDescription("Shows which alarm rang after the ring stops");
            c.setSound(null, null);
            c.setShowBadge(false);
            nm.createNotificationChannel(c);
        }
    }

    /** A normal, tap-to-open notification for events that must not ring (class finished, 12 AM). */
    public static void postAlert(Context ctx, String title, String text) {
        NotificationManager nm = (NotificationManager) ctx.getSystemService(NOTIFICATION_SERVICE);
        if (nm == null) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            if (nm.getNotificationChannel(ALERT_CHANNEL_ID) == null) {
                NotificationChannel c = new NotificationChannel(
                        ALERT_CHANNEL_ID,
                        "Class alerts",
                        NotificationManager.IMPORTANCE_DEFAULT
                );
                c.setDescription("Class-finished and daily check-in notifications");
                c.setShowBadge(true);
                nm.createNotificationChannel(c);
            }
        }

        Intent open = new Intent(ctx, MainActivity.class);
        open.setAction(Intent.ACTION_MAIN);
        open.addCategory(Intent.CATEGORY_LAUNCHER);
        open.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT
            | Intent.FLAG_ACTIVITY_NEW_TASK);
        int openFlags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) openFlags |= PendingIntent.FLAG_IMMUTABLE;
        PendingIntent contentIntent = PendingIntent.getActivity(ctx, REQ_ALERT_OPEN, open, openFlags);

        NotificationCompat.Builder b = new NotificationCompat.Builder(ctx, ALERT_CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle(title == null || title.trim().isEmpty() ? "BioPulse" : title.trim())
            .setContentText(text)
            .setContentIntent(contentIntent)
            .setCategory(NotificationCompat.CATEGORY_REMINDER)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setAutoCancel(true)
            .setOngoing(false)
            .setShowWhen(true)
            .setWhen(System.currentTimeMillis());
        try {
            nm.notify(ALERT_NOTIF_ID, b.build());
        } catch (Exception e) {
            Log.e(TAG, "alert notification failed", e);
        }
    }

    /**
     * A heads-up, per-message notification for an incoming Telegram message. Each message posts
     * with its own id, so the shade fills up like the real Telegram app instead of one entry
     * overwriting the last.
     */
    public static void postChatMessage(Context ctx, int id, String title, String text) {
        NotificationManager nm = (NotificationManager) ctx.getSystemService(NOTIFICATION_SERVICE);
        if (nm == null) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            if (nm.getNotificationChannel(CHAT_CHANNEL_ID) == null) {
                NotificationChannel c = new NotificationChannel(
                        CHAT_CHANNEL_ID,
                        "Telegram messages",
                        NotificationManager.IMPORTANCE_HIGH
                );
                c.setDescription("Live Telegram messages while BioPulse is connected");
                c.enableVibration(true);
                c.setShowBadge(true);
                c.setSound(Uri.parse("android.resource://" + ctx.getPackageName()
                                + "/" + R.raw.bp_tone_ios),
                        new AudioAttributes.Builder()
                                .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                                .build());
                nm.createNotificationChannel(c);
            }
        }

        Intent open = new Intent(ctx, MainActivity.class);
        open.setAction(Intent.ACTION_MAIN);
        open.addCategory(Intent.CATEGORY_LAUNCHER);
        open.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT
            | Intent.FLAG_ACTIVITY_NEW_TASK);
        int openFlags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) openFlags |= PendingIntent.FLAG_IMMUTABLE;
        PendingIntent contentIntent = PendingIntent.getActivity(ctx, REQ_CHAT_OPEN, open, openFlags);

        NotificationCompat.Builder b = new NotificationCompat.Builder(ctx, CHAT_CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_dialog_email)
            .setContentTitle(title == null || title.trim().isEmpty() ? "Telegram" : title.trim())
            .setContentText(text)
            .setContentIntent(contentIntent)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setAutoCancel(true)
            .setOngoing(false)
            .setShowWhen(true)
            .setWhen(System.currentTimeMillis());
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            b.setSound(Uri.parse("android.resource://" + ctx.getPackageName()
                + "/" + R.raw.bp_tone_ios));
        }
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
                    && ctx.checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS)
                        != android.content.pm.PackageManager.PERMISSION_GRANTED) {
                return;
            }
            nm.notify(id, b.build());
        } catch (Exception e) {
            Log.e(TAG, "chat notification failed", e);
        }
    }

    /**
     * Native notification for a new BioPulse direct message (the "Messages" chat), with an inline
     * quick-reply box.
     *
     * <p>The web unread poller knows the partner id and a short preview; it hands both to the
     * bridge, which turns them into a real Android message notification. One entry per partner
     * (keyed by the partner id) so a busy thread replaces itself instead of flooding the shade, and
     * it survives the app being backgrounded — the WebView's own {@code Notification} API does not
     * exist on Android at all, which is why these never appeared before.
     */
    public static void postDirectMessage(Context ctx, String name, String text, String partnerId) {
        NotificationManager nm = (NotificationManager) ctx.getSystemService(NOTIFICATION_SERVICE);
        if (nm == null) return;

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            if (nm.getNotificationChannel(DM_CHANNEL_ID) == null) {
                NotificationChannel c = new NotificationChannel(
                        DM_CHANNEL_ID,
                        "Messages",
                        NotificationManager.IMPORTANCE_HIGH
                );
                c.setDescription("New BioPulse messages from your study buddies");
                c.enableVibration(true);
                c.setShowBadge(true);
                c.setSound(Uri.parse("android.resource://" + ctx.getPackageName()
                                + "/" + R.raw.bp_tone_ios),
                        new AudioAttributes.Builder()
                                .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                                .build());
                nm.createNotificationChannel(c);
            }
        }

        final String pid = partnerId == null ? "" : partnerId;
        final String who = name == null || name.trim().isEmpty() ? "New message" : name.trim();
        final String body = text == null ? "" : text;
        final int id = pid.isEmpty() ? 0x444D0000 : (0x444D0000 ^ pid.hashCode());

        Intent open = new Intent(ctx, MainActivity.class);
        open.setAction(Intent.ACTION_MAIN);
        open.addCategory(Intent.CATEGORY_LAUNCHER);
        open.putExtra("bp_chat_partner", pid);
        open.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT
                | Intent.FLAG_ACTIVITY_NEW_TASK);
        int openFlags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) openFlags |= PendingIntent.FLAG_IMMUTABLE;
        PendingIntent contentIntent = PendingIntent.getActivity(ctx, id, open, openFlags);

        NotificationCompat.Builder b = new NotificationCompat.Builder(ctx, DM_CHANNEL_ID)
                .setSmallIcon(android.R.drawable.ic_dialog_email)
                .setContentTitle(who)
                .setContentText(body)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
                .setContentIntent(contentIntent)
                .setCategory(NotificationCompat.CATEGORY_MESSAGE)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setAutoCancel(true)
                .setShowWhen(true)
                .setWhen(System.currentTimeMillis());

        // Inline "Reply" — the user types straight from the notification and the message is sent
        // without opening the app (see ChatReplyReceiver).
        try {
            RemoteInput remoteInput = new RemoteInput.Builder(ChatReplyReceiver.KEY_REPLY)
                    .setLabel("Reply")
                    .build();
            Intent replyIntent = new Intent(ctx, ChatReplyReceiver.class);
            replyIntent.putExtra(ChatReplyReceiver.EXTRA_PARTNER_ID, pid);
            replyIntent.putExtra(ChatReplyReceiver.EXTRA_NOTIF_ID, id);
            int replyFlags = PendingIntent.FLAG_UPDATE_CURRENT;
            // Android 12+ requires an explicitly mutable PendingIntent to carry the RemoteInput.
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) replyFlags |= PendingIntent.FLAG_MUTABLE;
            PendingIntent replyPi = PendingIntent.getBroadcast(ctx, id, replyIntent, replyFlags);
            b.addAction(new NotificationCompat.Action.Builder(
                    R.drawable.ic_tg_reply, "Reply", replyPi)
                    .addRemoteInput(remoteInput)
                    .setAllowGeneratedReplies(true)
                    .build());
        } catch (Throwable t) {
            Log.w(TAG, "dm reply action unavailable", t);
        }

        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            b.setSound(Uri.parse("android.resource://" + ctx.getPackageName() + "/" + R.raw.bp_tone_ios));
        }
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
                    && ctx.checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS)
                        != android.content.pm.PackageManager.PERMISSION_GRANTED) {
                return;
            }
            nm.notify(id, b.build());
        } catch (Exception e) {
            Log.e(TAG, "dm notification failed", e);
        }
    }

    /** Deterministic notification id for a partner's DM thread (mirrors {@link #postDirectMessage}). */
    private static int dmNotificationId(String partnerId) {
        final String pid = partnerId == null ? "" : partnerId;
        return pid.isEmpty() ? 0x444D0000 : (0x444D0000 ^ pid.hashCode());
    }

    /** Takes a partner's DM notification away once its messages have been read in the app. */
    public static void dismissDirectMessage(Context ctx, String partnerId) {
        try {
            NotificationManager nm = (NotificationManager) ctx.getSystemService(NOTIFICATION_SERVICE);
            if (nm != null) nm.cancel(dmNotificationId(partnerId));
        } catch (Throwable ignored) {
        }
    }

    /** Last unread count the user was told about for this partner, or -1 when unknown. */
    public static int getChatUnreadSeen(Context ctx, String partnerId) {
        try {
            return ctx.getSharedPreferences(ChatReplyReceiver.PREFS, Context.MODE_PRIVATE)
                    .getInt(dmSeenKey(partnerId == null ? "" : partnerId), -1);
        } catch (Throwable t) {
            return -1;
        }
    }

    /**
     * Records how far the page has announced a partner's thread. The native poller consults the
     * same value so a message is never announced twice (once by the page, once by the poller).
     */
    public static void setChatUnreadSeen(Context ctx, String partnerId, int unread) {
        try {
            ctx.getSharedPreferences(ChatReplyReceiver.PREFS, Context.MODE_PRIVATE)
                    .edit()
                    .putInt(dmSeenKey(partnerId == null ? "" : partnerId), Math.max(0, unread))
                    .apply();
        } catch (Throwable ignored) {
        }
    }

    // ---- Telegram keep-alive ---------------------------------------------------------------
    // Holds the WebView renderer + process while Telegram is connected so live messages still
    // arrive (and post notifications) with the screen off or the app in the background. It is a
    // silent looping stream, held by the same foreground service Youtube audio uses — the
    // renderer cannot be frozen while an important-priority, audio-playing WebView is alive.

    private static volatile boolean keepAliveActive = false;
    private static MediaPlayer sKeepAlive;

    public static void startKeepAlive(Context ctx) {
        if (keepAliveActive) return;
        // NOTE: this used to also spin up a silent looping MediaPlayer (bp_silence_loop) on
        // USAGE_MEDIA. That extra audio stream ran forever and competed with every other sound on
        // the device: gallery videos and even Telegram's own voice/video messages were pushed onto
        // a high-latency mixer path, so their audio lagged behind the video. Android froze them
        // only when the app was force-stopped. The foreground service plus the IMPORTANT renderer
        // priority policy (set in the WebView) already keep the process warm, so we no longer open
        // any audio stream here.
        sKeepAlive = null;
        keepAliveActive = true;
        ensureRunning(ctx);
        Log.i(TAG, "Telegram keep-alive active (no audio stream)");
    }

    public static void stopKeepAlive(Context ctx) {
        MediaPlayer hold = sKeepAlive;
        sKeepAlive = null;
        if (hold != null) {
            try {
                if (hold.isPlaying()) hold.stop();
            } catch (Throwable ignored) {
            }
            try {
                hold.release();
            } catch (Throwable ignored) {
            }
        }
        keepAliveActive = false;
        if (!mediaPlaying) {
            scheduleRelease(ctx);
        } else {
            releaseScheduled = false;
            MAIN.removeCallbacks(RELEASE_TASK);
            refresh(ctx);
        }
        Log.i(TAG, "Telegram keep-alive stopped");
    }

    // ---- Direct-message background poller --------------------------------------------------
    // Android freezes a hidden WebView, so the page's own unread poller (an 8s setInterval) stops
    // the moment the user leaves the app — which is exactly when a DM notification matters. This
    // native loop runs inside the foreground service instead: it reads the account device token
    // the page handed over (see ChatReplyReceiver) and posts the same rich notification + inline
    // quick reply the web path uses, with no WebView involved.
    //
    // Notifications are de-duplicated against the page through a shared "last unread seen" value
    // per partner (ChatReplyReceiver.PREFS), so a message is announced exactly once no matter
    // which side spots it first.

    /** Gap between background polls. Slow enough to spare the battery, quick enough to be useful. */
    private static final long DM_POLL_MS = 30_000L;
    private static final int DM_HTTP_TIMEOUT_MS = 15_000;

    private static volatile boolean dmWatchActive = false;
    private static Context dmAppCtx;
    private static HandlerThread dmThread;
    private static Handler dmHandler;
    private static final Map<String, Integer> dmUnreadSeen = new HashMap<>();
    private static boolean dmBaselineSet = false;

    /** Persisted switch: the service re-arms the poller by itself after a restart. */
    private static final String DM_WATCH_PREF = "dm_watch";

    private static final Runnable DM_POLL_TASK = new Runnable() {
        @Override
        public void run() {
            if (!dmWatchActive) return;
            try {
                pollDirectMessagesOnce();
            } catch (Throwable t) {
                Log.w(TAG, "DM poll failed", t);
            }
            if (dmWatchActive && dmHandler != null) dmHandler.postDelayed(this, DM_POLL_MS);
        }
    };

    /** (Re)schedules the poll loop on its worker thread. */
    private static void armDmLoop() {
        if (dmThread == null) {
            dmThread = new HandlerThread("bp-dm-poll");
            dmThread.start();
            dmHandler = new Handler(dmThread.getLooper());
        }
        dmHandler.removeCallbacks(DM_POLL_TASK);
        dmHandler.postDelayed(DM_POLL_TASK, 2_000L);
    }

    private static boolean dmWatchEnabled(Context ctx) {
        try {
            return ctx.getSharedPreferences(ChatReplyReceiver.PREFS, Context.MODE_PRIVATE)
                    .getBoolean(DM_WATCH_PREF, false);
        } catch (Throwable t) {
            return false;
        }
    }

    /**
     * Starts the native DM poller (idempotent). The page calls this once the device is linked to
     * an account; the foreground service is brought up so the loop survives the app being closed.
     */
    public static void startDmWatch(Context ctx) {
        if (ctx == null) return;
        final Context app = ctx.getApplicationContext();
        dmAppCtx = app;
        try {
            app.getSharedPreferences(ChatReplyReceiver.PREFS, Context.MODE_PRIVATE)
                    .edit().putBoolean(DM_WATCH_PREF, true).apply();
        } catch (Throwable ignored) {
        }
        if (!dmWatchActive) {
            dmWatchActive = true;
            dmBaselineSet = false;
            dmUnreadSeen.clear();
            Log.i(TAG, "DM background poller started");
        }
        armDmLoop();
        ensureRunning(app);
    }

    /** Stops the native DM poller; the service winds down if nothing else still needs it. */
    public static void stopDmWatch(Context ctx) {
        if (ctx != null) {
            try {
                ctx.getApplicationContext()
                        .getSharedPreferences(ChatReplyReceiver.PREFS, Context.MODE_PRIVATE)
                        .edit().putBoolean(DM_WATCH_PREF, false).apply();
            } catch (Throwable ignored) {
            }
        }
        if (!dmWatchActive) return;
        dmWatchActive = false;
        if (dmHandler != null) dmHandler.removeCallbacks(DM_POLL_TASK);
        dmUnreadSeen.clear();
        dmBaselineSet = false;
        Log.i(TAG, "DM background poller stopped");
        if (ctx != null && !mediaPlaying && !keepAliveActive) scheduleRelease(ctx);
    }

    /** Shared-preferences key holding the last unread count the user was told about. */
    private static String dmSeenKey(String partnerId) {
        return "seen_unread_" + partnerId;
    }

    /**
     * One poll: fetch the account's conversations with the device token and raise a notification
     * for any partner whose unread count grew since the last look.
     */
    private static void pollDirectMessagesOnce() {
        final Context app = dmAppCtx;
        if (app == null) return;

        android.content.SharedPreferences p =
                app.getSharedPreferences(ChatReplyReceiver.PREFS, Context.MODE_PRIVATE);
        String base = p.getString(ChatReplyReceiver.KEY_BASE, "");
        String token = p.getString(ChatReplyReceiver.KEY_TOKEN, "");
        if (base == null || base.trim().isEmpty()) base = "https://dtedutrack-euc4.vercel.app";
        base = base.trim().replaceAll("/+$", "");
        if (token == null || token.trim().isEmpty()) return; // device not linked yet

        JSONArray conversations = fetchConversations(base, token.trim());
        if (conversations == null) return;

        Map<String, Integer> current = new HashMap<>();
        Map<String, String> names = new HashMap<>();
        Map<String, String> previews = new HashMap<>();
        for (int i = 0; i < conversations.length(); i++) {
            JSONObject c = conversations.optJSONObject(i);
            if (c == null) continue;
            String id = c.optString("id", "");
            if (id.isEmpty()) continue;
            int unread = Math.max(0, c.optInt("unread", 0));
            current.put(id, unread);
            names.put(id, c.optString("name", ""));
            String preview = c.optString("lastMessage", "");
            if (preview.startsWith("You: ")) preview = preview.substring(5);
            previews.put(id, preview);
        }

        if (dmBaselineSet) {
            // Which side owns announcements depends on whether the user can see the app: the page's
            // poller is authoritative while it is visible (its timers are frozen otherwise), and
            // this loop takes over the moment the app is hidden. Neither side touches the shared
            // mark while the other owns it, so a message can never be announced twice — or lost.
            final boolean foreground = appInForeground(app);
            for (Map.Entry<String, Integer> e : current.entrySet()) {
                final String id = e.getKey();
                final int unread = e.getValue();
                final int previous = dmUnreadSeen.containsKey(id) ? dmUnreadSeen.get(id) : 0;
                if (unread > previous) {
                    if (foreground) continue; // the visible page will announce it
                    final int announced = p.getInt(dmSeenKey(id), -1);
                    if (announced >= 0 && unread <= announced) continue; // the page got there first
                    // Claim before posting, so the page cannot announce the same message as well.
                    try {
                        p.edit().putInt(dmSeenKey(id), unread).commit();
                    } catch (Throwable ignored) {
                    }
                    postDirectMessage(app, names.get(id), previews.get(id), id);
                } else if (unread < previous) {
                    // The thread was read (here or on another device). Lower the bar so the next
                    // message announces again instead of being swallowed by the old higher mark.
                    try {
                        p.edit().putInt(dmSeenKey(id), unread).apply();
                    } catch (Throwable ignored) {
                    }
                }
            }
        } else {
            // First successful poll only establishes the baseline: messages that were already
            // unread when the poller started must not all fire at once.
            dmBaselineSet = true;
        }

        dmUnreadSeen.clear();
        dmUnreadSeen.putAll(current);
    }

    /** True while one of our activities is actually on screen. */
    private static boolean appInForeground(Context ctx) {
        try {
            android.app.ActivityManager am =
                    (android.app.ActivityManager) ctx.getSystemService(Context.ACTIVITY_SERVICE);
            if (am == null) return false;
            java.util.List<android.app.ActivityManager.RunningAppProcessInfo> procs =
                    am.getRunningAppProcesses();
            if (procs == null) return false;
            final String pkg = ctx.getPackageName();
            for (android.app.ActivityManager.RunningAppProcessInfo pi : procs) {
                if (pkg.equals(pi.processName)) {
                    // A process hosting our foreground service reports FOREGROUND_SERVICE (125),
                    // which is deliberately "not visible" — only a resumed activity counts.
                    return pi.importance <= android.app.ActivityManager.RunningAppProcessInfo.IMPORTANCE_FOREGROUND;
                }
            }
        } catch (Throwable ignored) {
        }
        return false;
    }

    /** GETs /api/chat/conversations and returns the `conversations` array, or null on any failure. */
    private static JSONArray fetchConversations(String base, String token) {
        HttpURLConnection conn = null;
        try {
            URL url = new URL(base + "/api/chat/conversations");
            conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("GET");
            conn.setConnectTimeout(DM_HTTP_TIMEOUT_MS);
            conn.setReadTimeout(DM_HTTP_TIMEOUT_MS);
            conn.setRequestProperty("Accept", "application/json");
            conn.setRequestProperty("Origin", base);
            conn.setRequestProperty("Authorization", "Bearer " + token);

            int code = conn.getResponseCode();
            if (code < 200 || code >= 300) return null;

            StringBuilder sb = new StringBuilder();
            try (InputStream in = conn.getInputStream();
                 BufferedReader reader = new BufferedReader(
                         new InputStreamReader(in, StandardCharsets.UTF_8))) {
                String line;
                while ((line = reader.readLine()) != null) sb.append(line);
            }
            JSONObject json = new JSONObject(sb.toString());
            return json.optJSONArray("conversations");
        } catch (Throwable t) {
            return null; // offline / server hiccup — the next tick retries
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    private static String formatTime(long ms) {
        long total = Math.max(0, ms) / 1000L;
        long h = total / 3600L;
        long m = (total % 3600L) / 60L;
        long s = total % 60L;
        if (h > 0) return String.format("%d:%02d:%02d", h, m, s);
        return String.format("%d:%02d", m, s);
    }

    private PendingIntent actionIntent(String action, int requestCode) {
        return actionIntent(this, action, requestCode);
    }

    private static PendingIntent actionIntent(Context ctx, String action, int requestCode) {
        Intent intent = new Intent(ctx, MediaPlaybackService.class);
        intent.setAction(action);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) flags |= PendingIntent.FLAG_IMMUTABLE;
        return PendingIntent.getService(ctx, requestCode, intent, flags);
    }

    private Notification buildNotification() {
        Intent open;
        if ("telegram".equals(mediaOwner)) {
            open = new Intent(this, com.biopulse.app.telegram.TelegramWebActivity.class);
            open.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);
        } else {
            open = new Intent(this, MainActivity.class);
            open.setAction(Intent.ACTION_MAIN);
            open.addCategory(Intent.CATEGORY_LAUNCHER);
            open.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);
        }
        int openFlags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) openFlags |= PendingIntent.FLAG_IMMUTABLE;
        PendingIntent contentIntent = PendingIntent.getActivity(this, 10, open, openFlags);

        // When a keep-alive (a Telegram session or the DM background poller) is holding the process
        // with nothing playing, show a calm, always-present "connected" card instead of a stale
        // "Paused" transport.
        boolean tgIdle = keepAliveActive && !mediaPlaying && "telegram".equals(mediaOwner);
        boolean dmIdle = dmWatchActive && !mediaPlaying;
        boolean idleKeepAlive = tgIdle || dmIdle;
        boolean tgAudio = "tgaudio".equals(mediaOwner);
        String title = tgIdle ? "Telegram connected" : (dmIdle ? "BioPulse" : currentTitle);
        String text;
        if (tgAudio) {
            text = tgAudioPaused ? "Paused" : "Playing in the background";
        } else {
            text = isPlaying() ? "Playing in the background"
                    : (idleKeepAlive ? "Messages keep arriving while the app is closed" : "Paused");
        }

        NotificationCompat.Builder b = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_media_play)
            .setContentTitle(title)
            .setContentText(text)
            .setContentIntent(contentIntent)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setCategory(NotificationCompat.CATEGORY_TRANSPORT)
            .setOngoing(isPlaying() || idleKeepAlive || tgAudio)
            .setOnlyAlertOnce(true)
            .setSilent(true)
            .setShowWhen(false);

        if (mediaHasTimeline && (mediaPlaying || tgAudio) && durationMs > 0) {
            int pos = (int) Math.min(positionMs, durationMs);
            b.setProgress((int) durationMs, pos, false);
        } else {
            b.setProgress(0, 0, false);
        }

        boolean hasActions = false;
        if (tgAudio) {
            if (durationMs > 0) {
                b.setSubText(formatTime(positionMs) + " / " + formatTime(durationMs));
            }
            if (tgAudioPaused) {
                b.addAction(android.R.drawable.ic_media_play, "Play", actionIntent(ACTION_PLAY, REQ_PLAY));
            } else {
                b.addAction(android.R.drawable.ic_media_pause, "Pause", actionIntent(ACTION_PAUSE, REQ_PAUSE));
            }
            b.addAction(android.R.drawable.ic_delete, "Stop", actionIntent(ACTION_STOP, REQ_STOP));
            hasActions = true;
        } else if (mediaPlaying) {
            if (mediaHasTimeline && durationMs > 0) {
                b.setSubText(formatTime(positionMs) + " / " + formatTime(durationMs));
            }
            b.addAction(
                android.R.drawable.ic_media_pause,
                "Pause",
                actionIntent(ACTION_PAUSE, REQ_PAUSE)
            );
            b.addAction(android.R.drawable.ic_delete, "Stop", actionIntent(ACTION_STOP, REQ_STOP));
            hasActions = true;
        } else if (!idleKeepAlive) {
            b.setSubText(null);
            b.addAction(android.R.drawable.ic_media_play, "Play", actionIntent(ACTION_PLAY, REQ_PLAY));
            b.addAction(android.R.drawable.ic_delete, "Stop", actionIntent(ACTION_STOP, REQ_STOP));
            hasActions = true;
        }

        // MediaStyle ties the notification to the MediaSession so the OS shows proper lock-screen /
        // shade transport controls and, crucially, keeps treating this as an active media player
        // once the app is backgrounded. The compact view shows the first action (pause-or-play) —
        // but only when there is one: the idle "Telegram connected" card has no actions, and asking
        // MediaStyle to show action 0 then crashes the app with "action 0 out of bounds".
        try {
            MediaStyle style = new MediaStyle();
            if (mediaSession != null) style.setMediaSession(mediaSession.getSessionToken());
            if (hasActions) {
                style.setShowActionsInCompactView(0);
            }
            b.setStyle(style);
        } catch (Throwable ignored) {
        }

        // Start/refresh the media session BEFORE the notification so the token it advertises is
        // already active when the shade binds to it.
        updateSessionState();

        return b.build();
    }

    @Override
    public void onDestroy() {
        Log.i(TAG, "onDestroy playing=" + mediaPlaying + " pos=" + positionMs);
        // The alarm hold keeps the service alive, so reaching here means the ringing is over by
        // some other route (process teardown, a stop action). Never leave a tone playing with no
        // service behind it.
        if (!mediaPlaying) {
            stopNativeAlarmTone();
        }
        // Nothing drives the looping waveform once the service is gone; the page keeps its own
        // vibration running if the app is still alive, so cancelling here can never double up.
        stopAlarmVibration(this);
        shutdownSpeech();
        abandonAudioFocusForMedia(this);
        foreground = false;
        sAlarmCtx = null;
        MAIN.removeCallbacks(ALARM_AUTO_STOP_TASK);
        MAIN.removeCallbacks(KEEPALIVE_TASK);
        MAIN.removeCallbacks(RELEASE_TASK);
        // Park the DM loop; the persisted dm_watch flag re-arms it if the service comes back.
        if (dmHandler != null) dmHandler.removeCallbacks(DM_POLL_TASK);
        dmWatchActive = false;
        dmUnreadSeen.clear();
        dmBaselineSet = false;
        releaseWakeLock();
        if (mediaSession != null) {
            try {
                mediaSession.setActive(false);
            } catch (Throwable ignored) {
            }
            try {
                mediaSession.release();
            } catch (Throwable ignored) {
            }
            mediaSession = null;
        }
        instance = new WeakReference<>(null);
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                stopForeground(STOP_FOREGROUND_REMOVE);
            } else {
                stopForeground(true);
            }
        } catch (Exception ignored) {
        }
        super.onDestroy();
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        // The user swiped the app off the recents list. Both holds (Telegram keep-alive, DM
        // poller) deliberately outlive the task: silently dropping them here is what made
        // notifications stop until the app was opened again.
        if (dmWatchActive || keepAliveActive) {
            Intent restart = new Intent(getApplicationContext(), MediaPlaybackService.class);
            restart.setAction(ACTION_START);
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    getApplicationContext().startForegroundService(restart);
                } else {
                    getApplicationContext().startService(restart);
                }
            } catch (Throwable t) {
                Log.w(TAG, "post-task-removal restart rejected", t);
            }
        }
        super.onTaskRemoved(rootIntent);
    }
}