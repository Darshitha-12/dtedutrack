export interface Alarm {
  id: string;
  time: string;
  label: string;
  priority: "normal" | "high";
  subject: "none" | "biology" | "chemistry" | "physics" | "agriculture";
  sound: "chime" | "digital" | "bio" | `custom:${string}`;
  tts: boolean;
  repeatDays: number[];
  enabled: boolean;
  createdAt: number;
}

export interface CreateAlarmInput {
  time: string;
  label: string;
  priority: "normal" | "high";
  subject: "none" | "biology" | "chemistry" | "physics" | "agriculture";
  sound: "chime" | "digital" | "bio" | `custom:${string}`;
  tts: boolean;
  repeatDays: number[];
}

export function getDedupKey(alarm: Alarm, date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${alarm.id}@${yyyy}-${mm}-${dd}`;
}

export function shouldFireToday(alarm: Alarm, now: Date): boolean {
  if (alarm.repeatDays.length === 0) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const created = new Date(alarm.createdAt);
    created.setHours(0, 0, 0, 0);
    return created.getTime() === today.getTime();
  }
  return alarm.repeatDays.includes(now.getDay());
}

export function nextOccurrenceFor(alarm: Alarm): Date | null {
  const now = new Date();
  const [hours, minutes] = alarm.time.split(":").map(Number);

  for (let dayOffset = 0; dayOffset <= 7; dayOffset++) {
    const candidate = new Date(now);
    candidate.setDate(candidate.getDate() + dayOffset);
    candidate.setHours(hours, minutes, 0, 0);

    if (dayOffset === 0 && candidate <= now) continue;

    if (shouldFireToday(alarm, candidate)) {
      return candidate;
    }
  }

  return null;
}

export function checkAlarms(
  alarms: Alarm[],
  fired: Record<string, number>,
): Alarm[] {
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  return alarms.filter((alarm) => {
    if (!alarm.enabled) return false;

    const [hours, minutes] = alarm.time.split(":").map(Number);
    const alarmMinutes = hours * 60 + minutes;

    if (alarmMinutes !== currentMinutes) return false;
    if (!shouldFireToday(alarm, now)) return false;

    const dedupKey = getDedupKey(alarm, now);
    const lastFired = fired[dedupKey];
    if (lastFired && Date.now() - lastFired < 50_000) return false;

    return true;
  });
}
