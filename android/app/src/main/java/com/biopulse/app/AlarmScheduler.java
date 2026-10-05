package com.biopulse.app;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.util.Log;

/**
 * Fires the next alarm/reminder from the OS, not from the web layer.
 *
 * <p>Android throttles timers in a hidden WebView hard (roughly one wake-up per minute, and once
 * the page has been background for a while it stops being useful at all), so a {@code setTimeout}
 * in the app is not something an alarm can be built on: closing the app or switching to another
 * app means the alarm simply never rings. The web layer therefore only publishes <em>when</em> the
 * next alarm is due, and this class owns the wake-up.
 *
 * <p>The schedule is persisted in {@link android.content.SharedPreferences} and re-armed on boot,
 * so it survives the app being killed or the device restarting.
 */
public final class AlarmScheduler {

    private static final String TAG = "BioPulseAlarm";
    private static final String PREFS = "biopulse_alarm";
    private static final String KEY_TRIGGER_AT = "trigger_at";
    private static final String KEY_LABEL = "label";

    /** Fixed so re-scheduling replaces the previous alarm instead of stacking a second one. */
    private static final int REQUEST_CODE = 7101;

    private AlarmScheduler() {
    }

    private static PendingIntent pendingIntent(Context ctx) {
        Intent intent = new Intent(ctx, AlarmReceiver.class).setAction(AlarmReceiver.ACTION_ALARM_DUE);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            // Android 12+ requires the mutability to be spelled out; the receiver never fills the
            // intent in from outside, so an immutable intent is safe and preferred.
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }
        return PendingIntent.getBroadcast(ctx.getApplicationContext(), REQUEST_CODE, intent, flags);
    }

    /** Arms the OS alarm for {@code triggerAtMillis}, replacing any previously scheduled one. */
    public static void schedule(Context ctx, long triggerAtMillis, String label) {
        Context app = ctx.getApplicationContext();
        cancel(app);

        if (triggerAtMillis <= System.currentTimeMillis()) {
            Log.i(TAG, "ignoring alarm in the past: " + triggerAtMillis);
            return;
        }

        app.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .edit()
                .putLong(KEY_TRIGGER_AT, triggerAtMillis)
                .putString(KEY_LABEL, label == null ? "" : label)
                .apply();

        AlarmManager am = (AlarmManager) app.getSystemService(Context.ALARM_SERVICE);
        if (am == null) {
            Log.w(TAG, "no AlarmManager; alarm will not fire in the background");
            return;
        }

        PendingIntent op = pendingIntent(app);
        try {
            // Exact where the OS allows it so the alarm is not minutes late, which is the whole
            // point of an alarm.
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAtMillis, op);
            } else {
                am.setExact(AlarmManager.RTC_WAKEUP, triggerAtMillis, op);
            }
            Log.i(TAG, "armed for " + triggerAtMillis + " (" + label + ")");
        } catch (SecurityException e) {
            // Android 12+ can withhold exact alarms. An inexact alarm still rings, just possibly a
            // few minutes late, which beats the alarm never ringing at all.
            try {
                am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAtMillis, op);
                Log.w(TAG, "exact alarm denied, falling back to inexact", e);
            } catch (Throwable ignored) {
                Log.e(TAG, "alarm could not be scheduled at all", ignored);
            }
        }
    }

    /** Removes any pending alarm and forgets the persisted one. */
    public static void cancel(Context ctx) {
        Context app = ctx.getApplicationContext();
        AlarmManager am = (AlarmManager) app.getSystemService(Context.ALARM_SERVICE);
        if (am != null) {
            try {
                PendingIntent existing = pendingIntent(app);
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    am.cancel(existing);
                } else {
                    am.cancel(existing);
                }
            } catch (Throwable ignored) {
            }
        }
        app.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().clear().apply();
    }

    /** Re-arms the stored alarm, e.g. after boot or an app update. */
    public static void restore(Context ctx) {
        Context app = ctx.getApplicationContext();
        long at = app.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getLong(KEY_TRIGGER_AT, 0L);
        if (at <= 0L) return;
        if (at <= System.currentTimeMillis()) {
            // It was due while the device was off; drop it, the web layer re-publishes the next one.
            cancel(app);
            return;
        }
        String label = app.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_LABEL, "");
        schedule(app, at, label);
    }

    /** {@code BOOT_COMPLETED} and app update: put the alarm back the way the user left it. */
    public static class BootReceiver extends BroadcastReceiver {
        @Override
        public void onReceive(Context context, Intent intent) {
            restore(context);
        }
    }

    /** Receives the OS alarm and rings it. */
    public static class AlarmReceiver extends BroadcastReceiver {
        static final String ACTION_ALARM_DUE = "com.biopulse.app.alarm.DUE";
        static final String EXTRA_LABEL = "label";

        @Override
        public void onReceive(Context context, Intent intent) {
            Context app = context.getApplicationContext();
            String label = intent != null ? intent.getStringExtra(EXTRA_LABEL) : null;
            if (label == null) {
                label = app.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_LABEL, "");
            }
            // The stored schedule is now spent. The web layer republishes the following alarm when
            // it next runs, so there is nothing left to re-arm.
            app.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().clear().apply();

            Log.i(TAG, "alarm due: " + label);
            // Runs the foreground service, posts the full-screen alarm notification and asks the
            // web layer to start the sound and the ring UI.
            MediaPlaybackService.startAlarm(app, label);
        }
    }
}
