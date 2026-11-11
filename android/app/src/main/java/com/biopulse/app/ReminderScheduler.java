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
import java.util.Calendar;
import java.util.Comparator;
import java.util.List;

/**
 * Fires the user's reminders from the OS, not from the page.
 *
 * <p>Reminders used to be a {@code setInterval} inside the WebView, so they only rang while the
 * app was open and awake. A closed app, a locked screen or Android's timer throttling meant the
 * reminder silently never happened. The page publishes the whole reminder list through
 * {@code BioPulseBridge.syncReminders}, and this class computes each reminder's next occurrence
 * and owns the wake-ups.
 *
 * <p>The queue is a JSON array in {@link android.content.SharedPreferences} and every event gets
 * its own PendingIntent (request codes {@code 8101+i}). Repeating reminders are re-armed here after
 * each ring, so a daily reminder keeps firing even if the app is never opened again.
 */
public final class ReminderScheduler {

    private static final String TAG = "BioPulseReminder";
    private static final String PREFS = "biopulse_reminder";
    private static final String KEY_EVENTS = "events";
    /** The last published list, restored after a reboot. */
    private static final String KEY_SOURCE = "source";
    private static final int REQUEST_CODE = 8101;
    private static final int MAX_EVENTS = 32;

    private ReminderScheduler() {
    }

    private static final class Ev {
        final long at;
        final String id;
        final String title;
        final String note;
        final String sound;
        final String speech;
        final String mode;
        final String time;
        final boolean[] days;

        Ev(long at, String id, String title, String note, String sound, String speech,
           String mode, String time, boolean[] days) {
            this.at = at;
            this.id = id;
            this.title = title;
            this.note = note;
            this.sound = sound;
            this.speech = speech;
            this.mode = mode;
            this.time = time;
            this.days = days;
        }
    }

    private static int flags() {
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }
        return flags;
    }

    private static PendingIntent pendingIntent(Context app, int index) {
        Intent intent = new Intent(app, ReminderReceiver.class)
                .setAction(ReminderReceiver.ACTION_REMINDER_DUE);
        return PendingIntent.getBroadcast(app.getApplicationContext(), REQUEST_CODE + index,
                intent, flags());
    }

    private static String jsonString(JSONObject o, String key) {
        String v = o == null ? null : o.optString(key, "");
        return v == null ? "" : v;
    }

    private static boolean[] parseDays(JSONObject r) {
        boolean[] days = new boolean[7];
        JSONArray arr = r.optJSONArray("days");
        if (arr == null) return days;
        for (int i = 0; i < arr.length(); i++) {
            int d = arr.optInt(i, -1);
            if (d >= 0 && d < 7) days[d] = true;
        }
        return days;
    }

    private static boolean anyDay(boolean[] days) {
        for (boolean d : days) {
            if (d) return true;
        }
        return false;
    }

    /** "HH:mm" → {hour, minute}, or null when the value is unusable. */
    private static int[] parseTime(String time) {
        if (time == null) return null;
        String[] hm = time.trim().split(":");
        if (hm.length < 2) return null;
        try {
            int h = Integer.parseInt(hm[0].trim());
            int m = Integer.parseInt(hm[1].trim());
            if (h < 0 || h > 23 || m < 0 || m > 59) return null;
            return new int[] {h, m};
        } catch (Throwable t) {
            return null;
        }
    }

    /**
     * Next wall-clock time this reminder is due, or -1 when it can never fire again (a one-time
     * reminder in the past, a weekly reminder with no days selected, a broken time).
     */
    private static long nextAt(String mode, String date, String time, boolean[] days, long now) {
        int[] hm = parseTime(time);
        if (hm == null) return -1L;

        if ("once".equals(mode)) {
            if (date == null || !date.matches("\\d{4}-\\d{2}-\\d{2}")) return -1L;
            String[] d = date.split("-");
            Calendar c = Calendar.getInstance();
            c.clear();
            c.set(Integer.parseInt(d[0]), Integer.parseInt(d[1]) - 1,
                    Integer.parseInt(d[2]), hm[0], hm[1], 0);
            return c.getTimeInMillis();
        }

        boolean weekly = "weekly".equals(mode);
        if (weekly && (days == null || !anyDay(days))) return -1L;

        // Walk forward at most a week: today at the set time, or the next selected weekday.
        for (int offset = 0; offset <= 7; offset++) {
            Calendar c = Calendar.getInstance();
            c.add(Calendar.DAY_OF_YEAR, offset);
            c.set(Calendar.HOUR_OF_DAY, hm[0]);
            c.set(Calendar.MINUTE, hm[1]);
            c.set(Calendar.SECOND, 0);
            c.set(Calendar.MILLISECOND, 0);
            int day = c.get(Calendar.DAY_OF_WEEK) - 1; // Calendar: Sunday=1 → JS: Sunday=0
            if (weekly && (days == null || !days[day])) continue;
            long at = c.getTimeInMillis();
            if (at > now + 1000L) return at;
        }
        return -1L;
    }

    private static List<Ev> parse(String json) {
        List<Ev> out = new ArrayList<>();
        try {
            if (json == null || json.isEmpty()) return out;
            JSONObject root = new JSONObject(json);
            JSONArray arr = root.optJSONArray("reminders");
            if (arr == null) arr = new JSONArray(json);
            long now = System.currentTimeMillis();
            for (int i = 0; i < arr.length(); i++) {
                JSONObject r = arr.optJSONObject(i);
                if (r == null || !r.optBoolean("enabled", true)) continue;
                String mode = jsonString(r, "mode");
                if (mode.isEmpty()) mode = "daily";
                String time = jsonString(r, "time");
                boolean[] days = parseDays(r);
                long at = nextAt(mode, jsonString(r, "date"), time, days, now);
                if (at <= now) continue;
                String title = jsonString(r, "title").trim();
                if (title.isEmpty()) title = "Reminder";
                String note = jsonString(r, "note").trim();
                String sound = jsonString(r, "sound");
                if (sound.isEmpty()) sound = "chime";
                boolean tts = r.optBoolean("tts", true);
                String speech = !tts ? "" : (note.isEmpty() ? title : title + ". " + note);
                out.add(new Ev(at, jsonString(r, "id"), title, note, sound, speech, mode,
                        time, days));
            }
        } catch (Throwable t) {
            Log.e(TAG, "bad reminders json", t);
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

    private static void store(Context app, List<Ev> events, String source) {
        try {
            JSONArray stored = new JSONArray();
            for (Ev e : events) {
                JSONObject o = new JSONObject();
                o.put("at", e.at);
                o.put("id", e.id == null ? "" : e.id);
                o.put("title", e.title == null ? "" : e.title);
                o.put("note", e.note == null ? "" : e.note);
                o.put("sound", e.sound == null ? "" : e.sound);
                o.put("speech", e.speech == null ? "" : e.speech);
                o.put("mode", e.mode == null ? "daily" : e.mode);
                o.put("time", e.time == null ? "" : e.time);
                JSONArray days = new JSONArray();
                if (e.days != null) {
                    for (int i = 0; i < e.days.length; i++) {
                        if (e.days[i]) days.put(i);
                    }
                }
                o.put("days", days);
                stored.put(o);
            }
            SharedPreferences.Editor edit = app.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                    .edit()
                    .putString(KEY_EVENTS, stored.toString());
            if (source != null) edit.putString(KEY_SOURCE, source);
            edit.apply();
        } catch (Throwable ignored) {
        }
    }

    private static void arm(Context app, AlarmManager am, int index, Ev e) {
        Intent intent = new Intent(app, ReminderReceiver.class)
                .setAction(ReminderReceiver.ACTION_REMINDER_DUE);
        intent.putExtra(ReminderReceiver.EXTRA_AT, e.at);
        intent.putExtra(ReminderReceiver.EXTRA_TITLE, e.title == null ? "" : e.title);
        intent.putExtra(ReminderReceiver.EXTRA_NOTE, e.note == null ? "" : e.note);
        intent.putExtra(ReminderReceiver.EXTRA_SOUND, e.sound == null ? "" : e.sound);
        intent.putExtra(ReminderReceiver.EXTRA_SPEECH, e.speech == null ? "" : e.speech);
        intent.putExtra(ReminderReceiver.EXTRA_MODE, e.mode == null ? "daily" : e.mode);
        intent.putExtra(ReminderReceiver.EXTRA_TIME, e.time == null ? "" : e.time);
        PendingIntent op = PendingIntent.getBroadcast(app, REQUEST_CODE + index, intent, flags());
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, e.at, op);
            } else {
                am.setExact(AlarmManager.RTC_WAKEUP, e.at, op);
            }
        } catch (SecurityException e1) {
            try {
                am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, e.at, op);
                Log.w(TAG, "exact alarm denied, falling back to inexact", e1);
            } catch (Throwable ignored) {
                Log.e(TAG, "reminder could not be scheduled", ignored);
            }
        }
    }

    private static void armAll(Context app, List<Ev> events) {
        AlarmManager am = (AlarmManager) app.getSystemService(Context.ALARM_SERVICE);
        if (am == null) {
            Log.w(TAG, "no AlarmManager; reminders will not fire in the background");
            return;
        }
        for (int i = 0; i < events.size(); i++) {
            arm(app, am, i, events.get(i));
        }
    }

    /**
     * Replaces the whole reminder queue with the page's list
     * ({@code {"reminders":[{id,title,note,mode,date,days,time,sound,tts,enabled}]}}).
     */
    public static void scheduleReminders(Context ctx, String remindersJson) {
        Context app = ctx.getApplicationContext();
        List<Ev> events = parse(remindersJson);
        cancelArmed(app);
        if (events.isEmpty()) {
            app.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
                    .remove(KEY_EVENTS)
                    .remove(KEY_SOURCE)
                    .apply();
            Log.i(TAG, "reminder queue cleared");
            return;
        }
        store(app, events, remindersJson);
        armAll(app, events);
        Log.i(TAG, "armed " + events.size() + " reminders; next at " + events.get(0).at
                + " (" + events.get(0).title + ")");
    }

    /** Re-arms the last published list after boot or an app update. */
    public static void restore(Context ctx) {
        Context app = ctx.getApplicationContext();
        String source = app.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .getString(KEY_SOURCE, null);
        if (source != null) {
            scheduleReminders(app, source);
        }
    }

    /** Next occurrence for a reminder that just fired, or -1 for a one-time reminder. */
    private static long nextRepeat(String mode, String time, boolean[] days, long now) {
        if (!"daily".equals(mode) && !"weekly".equals(mode)) return -1L;
        int[] hm = parseTime(time);
        if (hm == null) return -1L;
        if ("weekly".equals(mode) && (days == null || !anyDay(days))) return -1L;
        // Start tomorrow: the occurrence that just fired is today's.
        for (int offset = 1; offset <= 8; offset++) {
            Calendar c = Calendar.getInstance();
            c.add(Calendar.DAY_OF_YEAR, offset);
            c.set(Calendar.HOUR_OF_DAY, hm[0]);
            c.set(Calendar.MINUTE, hm[1]);
            c.set(Calendar.SECOND, 0);
            c.set(Calendar.MILLISECOND, 0);
            int day = c.get(Calendar.DAY_OF_WEEK) - 1;
            if ("weekly".equals(mode) && (days == null || !days[day])) continue;
            long at = c.getTimeInMillis();
            if (at > now + 1000L) return at;
        }
        return -1L;
    }

    /** {@code BOOT_COMPLETED} and app update: put the reminder queue back. */
    public static class BootReceiver extends BroadcastReceiver {
        @Override
        public void onReceive(Context context, Intent intent) {
            restore(context);
        }
    }

    /** Receives a due reminder, rings it, then re-arms a repeating one for its next day. */
    public static class ReminderReceiver extends BroadcastReceiver {
        static final String ACTION_REMINDER_DUE = "com.biopulse.app.reminder.DUE";
        static final String EXTRA_AT = "biopulse.reminder_at";
        static final String EXTRA_TITLE = "biopulse.reminder_title";
        static final String EXTRA_NOTE = "biopulse.reminder_note";
        static final String EXTRA_SOUND = "biopulse.reminder_sound";
        static final String EXTRA_SPEECH = "biopulse.reminder_speech";
        static final String EXTRA_MODE = "biopulse.reminder_mode";
        static final String EXTRA_TIME = "biopulse.reminder_time";

        @Override
        public void onReceive(Context context, Intent intent) {
            Context app = context.getApplicationContext();
            long firedAt = intent != null ? intent.getLongExtra(EXTRA_AT, -1L) : -1L;
            String title = intent != null ? intent.getStringExtra(EXTRA_TITLE) : null;
            String note = intent != null ? intent.getStringExtra(EXTRA_NOTE) : null;
            String sound = intent != null ? intent.getStringExtra(EXTRA_SOUND) : null;
            String speech = intent != null ? intent.getStringExtra(EXTRA_SPEECH) : null;
            String mode = intent != null ? intent.getStringExtra(EXTRA_MODE) : "daily";
            String time = intent != null ? intent.getStringExtra(EXTRA_TIME) : null;

            SharedPreferences prefs = app.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            String eventsJson = prefs.getString(KEY_EVENTS, null);
            if (eventsJson != null) {
                try {
                    JSONArray arr = new JSONArray(eventsJson);
                    JSONArray next = new JSONArray();
                    long nextAt = -1L;
                    for (int i = 0; i < arr.length(); i++) {
                        JSONObject o = arr.optJSONObject(i);
                        if (o == null) continue;
                        if (firedAt > 0L && o.optLong("at", -1L) == firedAt) {
                            nextAt = nextRepeat(mode, time,
                                    parseDays(o), System.currentTimeMillis());
                            if (nextAt > 0L) {
                                JSONObject copy = new JSONObject(o.toString());
                                copy.put("at", nextAt);
                                next.put(copy);
                            }
                            continue;
                        }
                        next.put(o);
                    }
                    prefs.edit().putString(KEY_EVENTS, next.toString()).apply();
                    List<Ev> remaining = parseQueue(next.toString());
                    cancelArmed(app);
                    armAll(app, remaining);
                    Log.i(TAG, "re-armed " + remaining.size() + " reminders");
                } catch (Throwable t) {
                    Log.e(TAG, "queue update after ring failed", t);
                }
            }

            String label = title == null || title.trim().isEmpty() ? "Reminder" : title.trim();
            if (speech == null || speech.isEmpty()) {
                // The voice toggle is off: still ring, but say nothing.
                speech = "";
            }
            Log.i(TAG, "reminder due: " + label + " sound=" + sound);
            MediaPlaybackService.startReminder(app, label, note == null ? "" : note, sound, speech);
        }
    }

    /** Parses already-stored events (no next-occurrence recomputation). */
    private static List<Ev> parseQueue(String json) {
        List<Ev> out = new ArrayList<>();
        try {
            JSONArray arr = new JSONArray(json == null || json.isEmpty() ? "[]" : json);
            for (int i = 0; i < arr.length(); i++) {
                JSONObject o = arr.optJSONObject(i);
                if (o == null || o.optLong("at", 0L) <= System.currentTimeMillis()) continue;
                out.add(new Ev(o.optLong("at", 0L), jsonString(o, "id"),
                        jsonString(o, "title"), jsonString(o, "note"), jsonString(o, "sound"),
                        jsonString(o, "speech"), jsonString(o, "mode"), jsonString(o, "time"),
                        parseDays(o)));
            }
        } catch (Throwable t) {
            Log.e(TAG, "bad stored reminders json", t);
        }
        out.sort(Comparator.comparingLong(e -> e.at));
        if (out.size() > MAX_EVENTS) out = new ArrayList<>(out.subList(0, MAX_EVENTS));
        return out;
    }
}
