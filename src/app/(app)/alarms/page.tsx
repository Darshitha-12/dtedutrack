"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { AlarmForm } from "@/features/alarms/components/AlarmForm";
import { AlarmList } from "@/features/alarms/components/AlarmList";
import { AlarmPopup } from "@/features/alarms/components/AlarmPopup";
import { useAlarms } from "@/features/alarms/hooks/use-alarms";
import { useAlarmRinger } from "@/features/alarms/hooks/use-alarm-ringer";
import {
  checkAlarms,
  getDedupKey,
  nextOccurrenceFor,
} from "@/features/alarms/lib/scheduler";
import type { Alarm, CreateAlarmInput } from "@/features/alarms/lib/scheduler";
import { notificationService } from "@/services/notification";
import { BellOff } from "lucide-react";

const ALARM_STATUS_TAG = "biopulse-alarm-status";

export default function AlarmsPage() {
  const {
    alarms,
    fired,
    addAlarm,
    updateAlarm,
    deleteAlarm,
    toggleAlarm,
    markFired,
  } = useAlarms();

  const {
    currentAlarm,
    isRinging,
    triggerAlarm,
    dismiss,
    snooze,
  } = useAlarmRinger();

  const [editingAlarm, setEditingAlarm] = useState<Alarm | null>(null);
  const [notifPerm, setNotifPerm] = useState<NotificationPermission>("default");

  useEffect(() => {
    if ("Notification" in window) {
      setNotifPerm(Notification.permission);
    }
  }, []);

  const requestNotif = useCallback(async () => {
    if ("Notification" in window) {
      const result = await Notification.requestPermission();
      setNotifPerm(result);
    }
  }, []);

  // alarm tick — check every second
  useEffect(() => {
    const id = setInterval(() => {
      const due = checkAlarms(alarms, fired);
      // Pre-arm the native "web already rang" flag just before the alarm's
      // exact second. The native scheduled alarm (exact-time) would otherwise
      // sometimes beat the 1s web tick and play its own tone too — the two
      // similar-but-not-identical tones overlap and sound like the wrong sound.
      try {
        const bridge = (window as any).BioPulseBridge;
        if (bridge && typeof bridge.suppressAlarmSound === "function") {
          const now = Date.now();
          for (const a of alarms) {
            if (!a.enabled) continue;
            const next = nextOccurrenceFor(a);
            if (!next) continue;
            const ms = next.getTime() - now;
            if (ms > 0 && ms < 2500) {
              bridge.suppressAlarmSound(a.id);
            }
          }
        }
      } catch {
        // ignore
      }
      due.forEach((alarm) => {
        markFired(getDedupKey(alarm, new Date()));
        triggerAlarm(alarm);
      });
    }, 1000);
    return () => clearInterval(id);
  }, [alarms, fired, markFired, triggerAlarm]);

  // persistent status notification — shows next upcoming alarm
  const lastAlarmStatusRef = useRef("");

  useEffect(() => {
    const update = () => {
      const upcoming = alarms
        .filter((alarm) => alarm.enabled)
        .map((alarm) => ({ alarm, next: nextOccurrenceFor(alarm) }))
        .filter(
          (item): item is { alarm: Alarm; next: Date } => item.next !== null,
        )
        .sort((a, b) => a.next.getTime() - b.next.getTime());

      if (upcoming.length === 0) {
        lastAlarmStatusRef.current = "";
        notificationService.clearStatus(ALARM_STATUS_TAG);
        return;
      }

      const { alarm, next } = upcoming[0];
      const mins = Math.max(0, Math.round((next.getTime() - Date.now()) / 60000));
      const hrs = Math.floor(mins / 60);
      const rm = mins % 60;
      const countdown = hrs > 0 ? `${hrs}h ${rm}m` : `${rm}m`;
      const label =
        alarm.label || (alarm.subject !== "none" ? alarm.subject : "Alarm");
      const title =
        alarm.priority === "high"
          ? `🚨 Alarm · ${alarm.time}`
          : `⏰ Alarm · ${alarm.time}`;
      const body = `${label} · in ${countdown}`;
      const key = `${title}|${body}`;
      if (key === lastAlarmStatusRef.current) return;
      lastAlarmStatusRef.current = key;
      notificationService.updateStatus(ALARM_STATUS_TAG, title, body);
    };

    const id = setInterval(update, 5000);
    update();
    return () => {
      clearInterval(id);
      notificationService.clearStatus(ALARM_STATUS_TAG);
    };
  }, [alarms]);

  const handleFormSubmit = useCallback(
    (input: CreateAlarmInput) => {
      if (editingAlarm) {
        updateAlarm(editingAlarm.id, input);
        setEditingAlarm(null);
      } else {
        addAlarm(input);
      }
    },
    [editingAlarm, addAlarm, updateAlarm],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Smart Alarms"
        description="Set study reminders with custom sounds, priorities, and repeat schedules"
      />

      {notifPerm !== "granted" && (
        <div className="flex items-center gap-3 rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-3 text-sm">
          <BellOff className="h-4 w-4 shrink-0 text-yellow-600" />
          <p className="flex-1 text-yellow-700 dark:text-yellow-300">
            Enable notifications to receive alarm alerts even when the app is in
            the background.
          </p>
          <Button variant="outline" size="sm" onClick={requestNotif}>
            Enable
          </Button>
        </div>
      )}

      <AlarmForm
        editing={editingAlarm}
        onSubmit={handleFormSubmit}
        onCancel={editingAlarm ? () => setEditingAlarm(null) : undefined}
      />

      <AlarmList
        alarms={alarms}
        onToggle={toggleAlarm}
        onEdit={setEditingAlarm}
        onDelete={deleteAlarm}
      />

      {isRinging && currentAlarm && (
        <AlarmPopup
          alarm={currentAlarm}
          onDismiss={dismiss}
          onSnooze={snooze}
        />
      )}
    </div>
  );
}
