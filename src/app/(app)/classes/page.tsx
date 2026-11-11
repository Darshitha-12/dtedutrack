"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { useAlarms } from "@/features/alarms/hooks/use-alarms";
import { publishNextAlarm } from "@/features/alarms/lib/native-alarm-scheduler";
import {
  AlarmClock,
  CalendarDays,
  CheckCircle2,
  Loader2,
  Plus,
  Trash2,
  XCircle,
} from "lucide-react";

const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const SUBJECT_SUGGESTIONS = ["Biology", "Chemistry", "Physics", "Agriculture", "Mathematics", "ICT", "DT"];
/** Minutes after a class ends before it is auto-marked as missed. */
const AUTO_MISS_GRACE_MIN = 5;

interface ClassRow {
  id: string;
  subjectName: string;
  dayOfWeek: number;
  startMinute: number;
  endMinute: number;
  color: string;
}

interface AttendanceRow {
  classId: string;
  date: string;
  status: "ATTENDED" | "MISSED";
}

function fmtClock(min: number): string {
  const h = Math.floor(min / 60) % 24;
  const m = min % 60;
  const suffix = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, "0")} ${suffix}`;
}

function toMinute(value: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (h > 23 || mi > 59) return null;
  return h * 60 + mi;
}

function localDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** 0=Monday … 6=Sunday, the convention the classes API uses. */
function mondayIndex(d: Date): number {
  return (d.getDay() + 6) % 7;
}

export default function ClassesPage() {
  const { status } = useSession();
  const { showToast } = useToast();
  const { alarms } = useAlarms();

  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => Date.now());

  const [name, setName] = useState("");
  const [day, setDay] = useState(() => mondayIndex(new Date()));
  const [start, setStart] = useState("08:00");
  const [end, setEnd] = useState("10:00");
  const [saving, setSaving] = useState(false);
  const autoMissBusy = useRef(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/classes");
      if (res.ok) {
        const data = await res.json();
        setClasses(Array.isArray(data.classes) ? data.classes : []);
        // `attendance` only exists in the offline API; when absent (online) the
        // attendance chips/stats stay hidden instead of erroring on every POST.
        setAttendance(Array.isArray(data.attendance) ? data.attendance : null);
      }
    } catch {
      /* the offline shim answers this; ignore transient failures */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === "authenticated") void load();
    else if (status === "unauthenticated") setLoading(false);
  }, [status, load]);

  // Clock tick for countdowns and the in-class highlight.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(id);
  }, []);

  // Re-arm the OS alarm whenever the class list or alarms change: the native side
  // holds a single slot, so every edit has to be republished.
  useEffect(() => {
    publishNextAlarm(alarms);
    // classes are merged inside publishNextAlarm; re-run when they change too.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classes, alarms]);

  const today = new Date(now);
  const todayIdx = mondayIndex(today);
  const todayKey = localDateKey(today);
  const nowMinute = today.getHours() * 60 + today.getMinutes();
  const todayStartMs = new Date(today);
  todayStartMs.setHours(0, 0, 0, 0);
  const todayBaseMs = todayStartMs.getTime();

  const todayClasses = useMemo(
    () =>
      classes
        .filter((c) => c.dayOfWeek === todayIdx)
        .sort((a, b) => a.startMinute - b.startMinute),
    [classes, todayIdx],
  );

  const recordFor = useCallback(
    (classId: string) => attendance?.find((r) => r.classId === classId && r.date === todayKey) ?? null,
    [attendance, todayKey],
  );

  // Auto-miss: once a class is over (plus a small grace), record MISSED unless the
  // user already tapped a chip. Only runs while this page is open — the reminder
  // itself comes from the native alarm and does not depend on this effect.
  useEffect(() => {
    if (attendance === null || autoMissBusy.current) return;
    const pending = todayClasses.filter((c) => {
      if (now < todayBaseMs + (c.endMinute + AUTO_MISS_GRACE_MIN) * 60_000) return false;
      return !attendance.some((r) => r.classId === c.id && r.date === todayKey);
    });
    if (pending.length === 0) return;
    let cancelled = false;
    autoMissBusy.current = true;
    (async () => {
      try {
        const rows: AttendanceRow[] = [];
        for (const c of pending) {
          try {
            const res = await fetch("/api/classes/attendance", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ classId: c.id, date: todayKey, status: "MISSED" }),
            });
            if (res.ok) {
              const d = await res.json().catch(() => ({}));
              rows.push(d.record ?? { classId: c.id, date: todayKey, status: "MISSED" as const });
            }
          } catch {
            /* keep going; the next tick retries */
          }
        }
        if (!cancelled && rows.length > 0) {
          setAttendance((prev) => {
            const merged = prev ? [...prev] : [];
            for (const row of rows) {
              const idx = merged.findIndex((r) => r.classId === row.classId && r.date === row.date);
              if (idx >= 0) merged[idx] = row;
              else merged.push(row);
            }
            return merged;
          });
        }
      } finally {
        autoMissBusy.current = false;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [now, todayClasses, attendance, todayKey, todayBaseMs]);

  const mark = async (classId: string, value: "ATTENDED" | "MISSED") => {
    if (attendance === null) return;
    try {
      const res = await fetch("/api/classes/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ classId, date: todayKey, status: value }),
      });
      if (!res.ok) throw new Error("bad status");
      const d = await res.json().catch(() => ({}));
      const row: AttendanceRow = d.record ?? { classId, date: todayKey, status: value };
      setAttendance((prev) => {
        const others = (prev ?? []).filter((r) => !(r.classId === row.classId && r.date === row.date));
        return [...others, row];
      });
      showToast(value === "ATTENDED" ? "Marked as attended." : "Marked as missed.", "success");
    } catch {
      showToast("Could not save attendance.", "error");
    }
  };

  const addClass = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      showToast("Enter a subject name.", "error");
      return;
    }
    const startMin = toMinute(start);
    const endMin = toMinute(end);
    if (startMin === null || endMin === null) {
      showToast("Pick a valid time.", "error");
      return;
    }
    if (endMin <= startMin) {
      showToast("End time must be after start time.", "error");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/classes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subjectName: trimmed,
          dayOfWeek: day,
          startMinute: startMin,
          endMinute: endMin,
        }),
      });
      if (res.ok) {
        showToast("Class added — it will ring at start time.", "success");
        setName("");
        await load();
      } else {
        const d = await res.json().catch(() => ({}));
        showToast(typeof d.error === "string" ? d.error : "Could not add class.", "error");
      }
    } catch {
      showToast("Could not add class.", "error");
    } finally {
      setSaving(false);
    }
  };

  const removeClass = async (id: string) => {
    try {
      const res = await fetch("/api/classes?id=" + id, { method: "DELETE" });
      if (res.ok) {
        showToast("Class removed.", "success");
        await load();
      } else {
        showToast("Could not remove class.", "error");
      }
    } catch {
      showToast("Could not remove class.", "error");
    }
  };

  const stats = useMemo(() => {
    if (attendance === null || classes.length === 0) return null;
    const byId = new Map(classes.map((c) => [c.id, c]));
    let present = 0;
    let missed = 0;
    const per = new Map<string, { present: number; missed: number }>();
    for (const r of attendance) {
      const c = byId.get(r.classId);
      if (!c) continue;
      const slot = per.get(c.subjectName) ?? { present: 0, missed: 0 };
      if (r.status === "ATTENDED") {
        present += 1;
        slot.present += 1;
      } else {
        missed += 1;
        slot.missed += 1;
      }
      per.set(c.subjectName, slot);
    }
    const total = present + missed;
    return {
      present,
      missed,
      total,
      pct: total > 0 ? Math.round((present / total) * 100) : null,
      per: [...per.entries()]
        .map(([subject, v]) => {
          const t = v.present + v.missed;
          return { subject, ...v, pct: t > 0 ? Math.round((v.present / t) * 100) : null };
        })
        .sort((a, b) => b.present + b.missed - (a.present + a.missed)),
    };
  }, [attendance, classes]);

  const statusOf = (c: ClassRow): { kind: "upcoming" | "live" | "ended"; text: string } => {
    if (nowMinute < c.startMinute) {
      const diff = c.startMinute - nowMinute;
      const text = diff >= 60 ? `in ${Math.floor(diff / 60)}h ${diff % 60}m` : `in ${diff}m`;
      return { kind: "upcoming", text };
    }
    if (nowMinute < c.endMinute) return { kind: "live", text: "In class now" };
    return { kind: "ended", text: "Ended" };
  };

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="My Classes"
        description="Weekly class schedule with a start-time alarm (rings even with the app closed) and attended/missed tracking."
        action={
          stats && stats.total > 0 && stats.pct !== null ? (
            <div className="flex items-center gap-2 rounded-2xl border border-white/[0.08] bg-white/[0.04] px-4 py-2">
              <CheckCircle2 className="h-4 w-4 text-success" />
              <span className="text-sm font-extrabold">{stats.pct}%</span>
              <span className="text-xs text-muted-foreground">attendance</span>
            </div>
          ) : undefined
        }
      />

      {todayClasses.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarDays className="h-4 w-4 text-primary" />
              Today — {DAY_NAMES[todayIdx]}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {todayClasses.map((c) => {
              const st = statusOf(c);
              const rec = recordFor(c.id);
              return (
                <div
                  key={c.id}
                  className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.03] px-3 py-2.5"
                >
                  <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: c.color }} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-bold">{c.subjectName}</div>
                    <div className="text-xs text-muted-foreground">
                      {fmtClock(c.startMinute)} – {fmtClock(c.endMinute)}
                    </div>
                  </div>
                  <span
                    className={
                      "shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold " +
                      (st.kind === "live"
                        ? "bg-success/15 text-success"
                        : st.kind === "upcoming"
                          ? "bg-cyan/15 text-cyan"
                          : "bg-white/[0.06] text-muted-foreground")
                    }
                  >
                    {st.text}
                  </span>
                  {st.kind === "ended" && rec && (
                    <span
                      className={
                        "shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold " +
                        (rec.status === "ATTENDED" ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive")
                      }
                    >
                      {rec.status === "ATTENDED" ? "Attended" : "Missed"}
                    </span>
                  )}
                  {st.kind === "ended" && attendance !== null && (
                    <div className="flex shrink-0 gap-1.5">
                      <Button
                        size="xs"
                        variant={rec?.status === "ATTENDED" ? "success" : "outline"}
                        onClick={() => void mark(c.id, "ATTENDED")}
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Attended
                      </Button>
                      <Button
                        size="xs"
                        variant={rec?.status === "MISSED" ? "destructive" : "outline"}
                        onClick={() => void mark(c.id, "MISSED")}
                      >
                        <XCircle className="h-3.5 w-3.5" />
                        Missed
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Plus className="h-4 w-4 text-primary" />
            Add a class
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto_auto_auto]">
            <div>
              <Input
                list="class-subjects"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Subject (e.g. Biology)"
                aria-label="Subject name"
              />
              <datalist id="class-subjects">
                {SUBJECT_SUGGESTIONS.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </div>
            <select
              value={day}
              onChange={(e) => setDay(Number(e.target.value))}
              aria-label="Day"
              className="h-11 rounded-2xl border border-white/[0.1] bg-white/[0.04] px-3 text-sm font-semibold"
            >
              {DAY_NAMES.map((d, i) => (
                <option key={d} value={i}>
                  {d}
                </option>
              ))}
            </select>
            <input
              type="time"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              aria-label="Start time"
              className="h-11 rounded-2xl border border-white/[0.1] bg-white/[0.04] px-3 text-sm font-semibold"
            />
            <input
              type="time"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              aria-label="End time"
              className="h-11 rounded-2xl border border-white/[0.1] bg-white/[0.04] px-3 text-sm font-semibold"
            />
            <Button onClick={() => void addClass()} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Add
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <AlarmClock className="h-4 w-4 text-primary" />
            This week
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {classes.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No classes yet. Add your first class above — it will ring on your phone when it starts, even with the
              app closed.
            </p>
          ) : (
            DAY_NAMES.map((dayName, idx) => {
              const dayClasses = classes
                .filter((c) => c.dayOfWeek === idx)
                .sort((a, b) => a.startMinute - b.startMinute);
              if (dayClasses.length === 0) return null;
              return (
                <div key={dayName}>
                  <div className="mb-1.5 text-xs font-extrabold uppercase tracking-wider text-muted-foreground">
                    {dayName}
                    {idx === todayIdx && <span className="ml-2 text-primary">today</span>}
                  </div>
                  <div className="space-y-1.5">
                    {dayClasses.map((c) => (
                      <div
                        key={c.id}
                        className="flex items-center gap-2 rounded-xl bg-white/[0.03] px-3 py-2"
                      >
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: c.color }} />
                        <span className="min-w-0 flex-1 truncate text-sm font-semibold">{c.subjectName}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {fmtClock(c.startMinute)}–{fmtClock(c.endMinute)}
                        </span>
                        <button
                          type="button"
                          onClick={() => void removeClass(c.id)}
                          className="shrink-0 text-muted-foreground transition-colors hover:text-red-400"
                          aria-label={`Remove ${c.subjectName} class`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      {stats && stats.total > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CheckCircle2 className="h-4 w-4 text-primary" />
              Attendance
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-4">
              <div className="text-3xl font-extrabold">{stats.pct}%</div>
              <div className="text-sm text-muted-foreground">
                {stats.present} attended · {stats.missed} missed
              </div>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-white/[0.06]">
              <div
                className="h-full rounded-full bg-gradient-aurora transition-all"
                style={{ width: `${stats.pct ?? 0}%` }}
              />
            </div>
            <div className="space-y-2">
              {stats.per.map((row) => (
                <div key={row.subject} className="flex items-center gap-3 text-sm">
                  <span className="w-32 shrink-0 truncate font-semibold">{row.subject}</span>
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
                    <div
                      className="h-full rounded-full bg-gradient-aurora"
                      style={{ width: `${row.pct ?? 0}%` }}
                    />
                  </div>
                  <span className="w-24 shrink-0 text-right text-xs text-muted-foreground">
                    {row.pct}% ({row.present}/{row.present + row.missed})
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
