"use client";

import { useEffect, useState, useCallback } from "react";
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
} from "@/features/alarms/lib/scheduler";
import type { Alarm, CreateAlarmInput } from "@/features/alarms/lib/scheduler";
import { BellOff } from "lucide-react";

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
      due.forEach((alarm) => {
        markFired(getDedupKey(alarm, new Date()));
        triggerAlarm(alarm);
      });
    }, 1000);
    return () => clearInterval(id);
  }, [alarms, fired, markFired, triggerAlarm]);

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
