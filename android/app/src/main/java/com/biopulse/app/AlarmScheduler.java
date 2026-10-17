package com.biopulse.app;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.util.Log;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

/**
 * Fires the upcoming alarms/reminders from the OS, not from the web layer.
 *
 * <p>Android throttles timers in a hidden WebView hard (roughly one wake-up per minute, and once
 * the page has been background for a while it stops being useful at all), so a {@code setTimeout}
 * in the app is not something an alarm can be built on: closing the app or switching to another
 * app means the alarm simply never rings. The web layer therefore publishes <em>when</em> the next
 * events are due, and this class owns the wake-ups.
 *
 * <p>The schedule is a small JSON queue of {@code {at,label,soundId}} events kept in
 * {@link android.content.SharedPreferences}. Every event gets its own PendingIntent (request codes
 * {@code 7101+i}), and when one fires the receiver drops it from the queue and re-arms the rest
 * natively — so a class pre-alert at 05:00 followed by the class itself at 07:00 rings twice even
 * if the app is never opened in between. The queue is restored on boot and app update.
 */
public final class AlarmScheduler {

    private static final String TAG = "BioPulseAlarm";
    private static final String PREFS = "biopulse_alarm";
    private static final String KEY_EVENTS = "events";
    // Legacy single-slot keys (installs from before the queue still have a pending alarm that
    // references them; they are read once during migration and then cleared).
    private static final String KEY_TRIGGER_AT = "trigger_at";
    private static final String KEY_LABEL = "label";
    private static final String KEY_SOUND = "sound";

    /** Base request code; each queued event uses {@code REQUEST_CODE + index}. */
    private static final int REQUEST_CODE = 7101;
    /** Keeps a burst of events (web publishes the whole upcoming set every time) bounded. */
    private static final int MAX_EVENTS = 32;

    private AlarmScheduler() {
    }

    private static final class Ev {
        final long at;
        final String label;
        final String sound;
        final String speech;
        final String kind;
        final String text;
        final String repeat;
        final String target;
        final String examLabel;

        Ev(long at, String label, String sound, String speech, String kind, String text,
           String repeat, String target, String examLabel) {
            this.at = at;
            this.label = label;
            this.sound = sound;
            this.speech = speech;
            this.kind = kind;
            this.text = text;
            this.repeat = repeat;
            this.target = target;
            this.examLabel = examLabel;
        }
    }

    private static int flags() {
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            // Android 12+ requires the mutability to be spelled out; the receiver never fills the
            // intent in from outside, so an immutable intent is safe and preferred.
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }
        return flags;
    }

    private static PendingIntent pendingIntent(Context app, int index) {
        Intent intent = new Intent(app, AlarmReceiver.class).setAction(AlarmReceiver.ACTION_ALARM_DUE);
        return PendingIntent.getBroadcast(app.getApplicationContext(), REQUEST_CODE + index, intent, flags());
    }

    /**
     * Parses the events JSON, dropping anything already due (the web layer re-publishes on every
     * change, so stale entries must not re-enter the queue), sorting oldest-first and capping the
     * list.
     */
    private static List<Ev> parseEvents(String json) {
        List<Ev> out = new ArrayList<>();
        try {
            JSONArray arr = new JSONArray(json == null || json.isEmpty() ? "[]" : json);
            long now = System.currentTimeMillis();
            for (int i = 0; i < arr.length(); i++) {
                JSONObject o = arr.optJSONObject(i);
                if (o == null) continue;
                long at = o.optLong("at", 0L);
                if (at <= now + 1000L) continue;
                out.add(new Ev(at, o.optString("label", ""), o.optString("soundId", ""),
                        o.optString("speech", ""), o.optString("kind", "ring"), o.optString("text", ""),
                        o.optString("repeat", ""), o.optString("target", ""),
                        o.optString("examLabel", "")));
            }
        } catch (Throwable t) {
            Log.e(TAG, "bad events json", t);
        }
        out.sort(Comparator.comparingLong(e -> e.at));
        if (out.size() > MAX_EVENTS) out = new ArrayList<>(out.subList(0, MAX_EVENTS));
        return out;
    }

    private static void cancelArmed(Context app) {
        AlarmManager am = (AlarmManager) app.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        for (int i = 0; i < MAX_EVENTS; i++) {
            try {
                am.cancel(pendingIntent(app, i));
            } catch (Throwable ignored) {
            }
        }
    }

    private static void store(Context app, List<Ev> events) {
        try {
            JSONArray stored = new JSONArray();
            for (Ev e : events) {
                JSONObject o = new JSONObject();
                o.put("at", e.at);
                o.put("label", e.label == null ? "" : e.label);
                o.put("soundId", e.sound == null ? "" : e.sound);
                o.put("speech", e.speech == null ? "" : e.speech);
                o.put("kind", e.kind == null ? "ring" : e.kind);
                o.put("text", e.text == null ? "" : e.text);
                o.put("repeat", e.repeat == null ? "" : e.repeat);
                o.put("target", e.target == null ? "" : e.target);
                o.put("examLabel", e.examLabel == null ? "" : e.examLabel);
                stored.put(o);
            }
            app.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                    .edit()
                    .putString(KEY_EVENTS, stored.toString())
                    .apply();
        } catch (Throwable ignored) {
        }
    }

    private static void arm(Context app, AlarmManager am, int index, Ev e) {
        Intent intent = new Intent(app, AlarmReceiver.class).setAction(AlarmReceiver.ACTION_ALARM_DUE);
        intent.putExtra(AlarmReceiver.EXTRA_AT, e.at);
        intent.putExtra(AlarmReceiver.EXTRA_LABEL, e.label == null ? "" : e.label);
        intent.putExtra("soundId", e.sound == null || e.sound.isEmpty() ? null : e.sound);
        intent.putExtra(AlarmReceiver.EXTRA_SPEECH,
                e.speech == null || e.speech.isEmpty() ? null : e.speech);
        intent.putExtra(AlarmReceiver.EXTRA_KIND,
                e.kind == null || e.kind.isEmpty() ? "ring" : e.kind);
        intent.putExtra(AlarmReceiver.EXTRA_TEXT,
                e.text == null || e.text.isEmpty() ? null : e.text);
        intent.putExtra(AlarmReceiver.EXTRA_REPEAT,
                e.repeat == null || e.repeat.isEmpty() ? null : e.repeat);
        intent.putExtra(AlarmReceiver.EXTRA_TARGET,
                e.target == null || e.target.isEmpty() ? null : e.target);
        intent.putExtra(AlarmReceiver.EXTRA_EXAM_LABEL,
                e.examLabel == null || e.examLabel.isEmpty() ? null : e.examLabel);
        PendingIntent op = PendingIntent.getBroadcast(app, REQUEST_CODE + index, intent, flags());
        try {
            // Exact where the OS allows it so an event is not minutes late, which is the whole
            // point of an alarm.
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, e.at, op);
            } else {
                am.setExact(AlarmManager.RTC_WAKEUP, e.at, op);
            }
        } catch (SecurityException e1) {
            // Android 12+ can withhold exact alarms. An inexact alarm still rings, just possibly a
            // few minutes late, which beats the alarm never ringing at all.
            try {
                am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, e.at, op);
                Log.w(TAG, "exact alarm denied, falling back to inexact", e1);
            } catch (Throwable ignored) {
                Log.e(TAG, "alarm could not be scheduled at all", ignored);
            }
        }
    }

    private static void armAll(Context app, List<Ev> events) {
        AlarmManager am = (AlarmManager) app.getSystemService(Context.ALARM_SERVICE);
        if (am == null) {
            Log.w(TAG, "no AlarmManager; events will not fire in the background");
            return;
        }
        for (int i = 0; i < events.size(); i++) {
            arm(app, am, i, events.get(i));
        }
    }

    /**
     * Replaces the whole schedule with {@code eventsJson} — an array of {@code {at,label,soundId}}.
     * Passing an empty array clears every pending alarm.
     */
    public static void scheduleEvents(Context ctx, String eventsJson) {
        Context app = ctx.getApplicationContext();
        List<Ev> events = parseEvents(eventsJson);
        // Cancel first so re-using a request code replaces the old intent instead of stacking.
        cancelArmed(app);
        if (events.isEmpty()) {
            app.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().clear().apply();
            Log.i(TAG, "schedule cleared (no upcoming events)");
            return;
        }
        store(app, events);
        armAll(app, events);
        Log.i(TAG, "armed " + events.size() + " events; first at " + events.get(0).at
                + " (" + events.get(0).label + ")");
    }

    /** Legacy single-event API; kept as a fallback when the web layer has no queue bridge. */
    public static void schedule(Context ctx, long triggerAtMillis, String label) {
        schedule(ctx, triggerAtMillis, label, null);
    }

    /** Legacy single-event API with sound selection. */
    public static void schedule(Context ctx, long triggerAtMillis, String label, String soundId) {
        if (triggerAtMillis <= System.currentTimeMillis()) {
            Log.i(TAG, "ignoring alarm in the past: " + triggerAtMillis);
            cancel(ctx);
            return;
        }
        try {
            JSONObject o = new JSONObject();
            o.put("at", triggerAtMillis);
            o.put("label", label == null ? "" : label);
            o.put("soundId", soundId == null ? "" : soundId);
            o.put("speech", "");
            o.put("kind", "ring");
            o.put("text", "");
            JSONArray a = new JSONArray();
            a.put(o);
            scheduleEvents(ctx, a.toString());
        } catch (Throwable t) {
            Log.e(TAG, "schedule failed", t);
        }
    }

    /** Removes every pending alarm and forgets the persisted schedule. */
    public static void cancel(Context ctx) {
        Context app = ctx.getApplicationContext();
        cancelArmed(app);
        app.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().clear().apply();
    }

    /** Re-arms the stored schedule, e.g. after boot or an app update. */
    public static void restore(Context ctx) {
        Context app = ctx.getApplicationContext();
        SharedPreferences prefs = app.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String json = prefs.getString(KEY_EVENTS, null);
        if (json != null) {
            // Drops events that were due while the device was off and re-arms the rest.
            scheduleEvents(app, json);
            return;
        }
        long at = prefs.getLong(KEY_TRIGGER_AT, 0L);
        if (at <= 0L) return;
        if (at <= System.currentTimeMillis()) {
            // It was due while the device was off; drop it, the web layer re-publishes the next one.
            cancel(app);
            return;
        }
        String label = prefs.getString(KEY_LABEL, "");
        String soundId = prefs.getString(KEY_SOUND, "");
        if (soundId != null && soundId.isEmpty()) soundId = null;
        schedule(app, at, label, soundId);
    }

    /**
     * Rebuilds the Sinhala exam countdown from the dashboard exam date, run at ring time so the
     * daily 12 AM alert stays accurate on its native repeat even though the app is closed.
     */
    private static String examCountdownText(String target, String examLabel) {
        try {
            if (target == null || !target.matches("\\d{4}-\\d{2}-\\d{2}")) return null;
            String[] parts = target.split("-");
            java.util.Calendar exam = java.util.Calendar.getInstance();
            exam.clear();
            exam.set(Integer.parseInt(parts[0]), Integer.parseInt(parts[1]) - 1,
                    Integer.parseInt(parts[2]), 0, 0, 0);
            // Match the dashboard countdown exactly: whole days of *remaining* time (floor), not the
            // calendar-day difference — otherwise the notification reads one day higher during the day.
            long days = (long) Math.floor(
                    (exam.getTimeInMillis() - System.currentTimeMillis()) / 86400000.0);
            String prefix =
                    (examLabel == null || examLabel.trim().isEmpty()) ? "" : examLabel.trim() + " ";
            if (days <= 0) return prefix + "විභාගය අද තියෙනවා. වාසනාවන් වේවා!";
            if (days == 1) return prefix + "විභාගය හෙට (දවස් 1).";
            if (days <= 365) return prefix + "විභාගය දවස් " + days + " කින්.";
            return prefix + "විභාගය: " + target + ".";
        } catch (Throwable t) {
            return null;
        }
    }

    /**
     * Posts the daily 12 AM exam check-in right now (with its soft tone), used by the in-app test
     * button so the alert can be verified without waiting for midnight.
     */
    public static void testExamAlert(Context ctx, String target, String examLabel) {
        Context app = ctx.getApplicationContext();
        String text = examCountdownText(target, examLabel);
        try {
            MediaPlaybackService.playAlertTone(app, "tink");
        } catch (Throwable ignored) {
        }
        MediaPlaybackService.postAlert(app, "පාන්දර 12", text);
    }

    /** {@code BOOT_COMPLETED} and app update: put the schedule back the way the user left it. */
    public static class BootReceiver extends BroadcastReceiver {
        @Override
        public void onReceive(Context context, Intent intent) {
            restore(context);
        }
    }

    /** Receives a due event, rings it, then re-arms what is left in the queue. */
    public static class AlarmReceiver extends BroadcastReceiver {
        static final String ACTION_ALARM_DUE = "com.biopulse.app.alarm.DUE";
        static final String EXTRA_LABEL = "label";
        static final String EXTRA_AT = "biopulse.alarm_at";
        static final String EXTRA_SPEECH = "speech";
        static final String EXTRA_KIND = "biopulse.alarm_kind";
        static final String EXTRA_TEXT = "biopulse.alarm_text";
        static final String EXTRA_REPEAT = "biopulse.alarm_repeat";
        static final String EXTRA_TARGET = "biopulse.alarm_target";
        static final String EXTRA_EXAM_LABEL = "biopulse.alarm_exam_label";

        @Override
        public void onReceive(Context context, Intent intent) {
            Context app = context.getApplicationContext();
            long firedAt = intent != null ? intent.getLongExtra(EXTRA_AT, -1L) : -1L;
            String label = intent != null ? intent.getStringExtra(EXTRA_LABEL) : null;
            String soundId = intent != null ? intent.getStringExtra("soundId") : null;
            String speech = intent != null ? intent.getStringExtra(EXTRA_SPEECH) : null;
            String kind = intent != null ? intent.getStringExtra(EXTRA_KIND) : "ring";
            String repeat = intent != null ? intent.getStringExtra(EXTRA_REPEAT) : null;
            String target = intent != null ? intent.getStringExtra(EXTRA_TARGET) : null;
            String examLabel = intent != null ? intent.getStringExtra(EXTRA_EXAM_LABEL) : null;
            SharedPreferences prefs = app.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            String eventsJson = prefs.getString(KEY_EVENTS, null);

            if (eventsJson == null) {
                // Legacy single-slot alarm still pending from before the queue existed. Read the
                // persisted sound BEFORE clearing — `clear().apply()` takes effect immediately for
                // reads in this process, so fetching it afterwards always returned null and every
                // alarm fell back to the generic system tone.
                if (label == null) label = prefs.getString(KEY_LABEL, "");
                if (soundId == null || soundId.isEmpty()) soundId = prefs.getString(KEY_SOUND, null);
                prefs.edit().clear().apply();
            } else {
                if (label == null) label = "";
                // Drop the spent event and re-arm the rest without waiting for the web layer, so a
                // second event (the class itself after its pre-alert) still rings with the app
                // closed. Indexes shift after removal, so every slot is cancelled first.
                try {
                    JSONArray arr = new JSONArray(eventsJson);
                    JSONArray next = new JSONArray();
                    for (int i = 0; i < arr.length(); i++) {
                        JSONObject o = arr.optJSONObject(i);
                        if (o == null) continue;
                        if (firedAt > 0L && o.optLong("at", -1L) == firedAt) {
                            // Daily repeat: put this same event back for the next day so the 12 AM
                            // exam check-in (and the 3 AM wake-up) keep firing every night with no
                            // app open and no republish from the web layer.
                            if ("daily".equals(o.optString("repeat", ""))) {
                                try {
                                    long evAt = o.optLong("at", firedAt);
                                    long nextAt = evAt + 24L * 60L * 60L * 1000L;
                                    long nowMs = System.currentTimeMillis();
                                    while (nextAt <= nowMs + 1000L) nextAt += 24L * 60L * 60L * 1000L;
                                    JSONObject copy = new JSONObject(o.toString());
                                    copy.put("at", nextAt);
                                    next.put(copy);
                                } catch (Throwable ignored) {
                                }
                            }
                            continue;
                        }
                        next.put(o);
                    }
                    prefs.edit().putString(KEY_EVENTS, next.toString()).apply();
                    List<Ev> remaining = parseEvents(next.toString());
                    cancelArmed(app);
                    armAll(app, remaining);
                    Log.i(TAG, "re-armed " + remaining.size() + " remaining events");
                } catch (Throwable t) {
                    Log.e(TAG, "queue update after ring failed", t);
                }
            }

            if (soundId != null && soundId.isEmpty()) soundId = null;

            if ("alert".equals(kind)) {
                // Quiet event (class finished, daily check-in): a normal notification, optionally a
                // small soft tone — never a full-screen ring, never speech.
                String text = intent != null ? intent.getStringExtra(EXTRA_TEXT) : null;
                // The daily exam check-in repeats for weeks without the app opening, so rebuild the
                // countdown from the dashboard date now rather than showing a stale number.
                if ("daily".equals(repeat) && target != null && !target.isEmpty()) {
                    String fresh = examCountdownText(target, examLabel);
                    if (fresh != null) text = fresh;
                }
                if (soundId != null && !soundId.isEmpty()) {
                    MediaPlaybackService.playAlertTone(app, soundId);
                }
                Log.i(TAG, "alert due: " + label + " sound=" + soundId);
                MediaPlaybackService.postAlert(app,
                        label == null || label.trim().isEmpty() ? "BioPulse" : label.trim(), text);
                return;
            }

            Log.i(TAG, "alarm due: " + label + " sound=" + soundId);
            // Runs the foreground service, posts the full-screen alarm notification and asks the
            // web layer to start the sound and the ring UI.
            MediaPlaybackService.startAlarm(app, label, soundId, speech);
        }
    }
}
