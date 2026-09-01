"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Toggle } from "@/components/ui/toggle";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import {
  Loader2,
  Calendar,
  Target,
  Clock,
  CheckCircle2,
  XCircle,
  Plus,
  Wand2,
  Trash2,
  Pencil,
  Play,
  AlertTriangle,
  Bell,
  Save,
  ArrowRight,
  Sparkles,
  CalendarDays,
  Clock3,
  ListChecks,
  RotateCcw,
  SkipForward,
  Copy,
} from "lucide-react";
import {
  DAY_NAMES,
  formatClock,
  formatDuration,
  dayOfWeekIndex,
  dateKeyOf,
  dayTotalAvailable,
  STUDY_TYPES,
  type StudyType,
  type Priority,
  type TimeBlock,
  type PlannedSession,
} from "@/features/planner/lib/scheduler";

interface DayConfig {
  dayOfWeek: number;
  enabled: boolean;
  dailyTargetMin: number;
  blocks: TimeBlock[];
}

interface Prefs {
  weeklyTargetMin: number;
  sessionLengthMin: number;
  breakAfterMin: number;
  breakDurationMin: number;
  timeFormat: "12h" | "24h";
  showBreaks: boolean;
  subjectPriorities: { subjectId: string; name: string; priority: Priority; icon?: string; color?: string }[];
  studyTypes: { type: StudyType; weight: number }[];
  weakTopics: string[];
}

interface PlannerSession {
  id: string;
  subjectId: string;
  subjectName: string;
  topicId?: string | null;
  topicTitle?: string | null;
  date?: string | null;
  dayOfWeek?: number | null;
  startMinute: number;
  endMinute: number;
  type: StudyType;
  priority: Priority;
  status: string;
  recurrence: string;
  recurrenceDays: number[];
  reminderMin: number;
  notes: string;
}

interface SubjectOption {
  id: string;
  slug: string;
  name: string;
  icon: string;
  color: string;
}

interface ProfileData {
  examYear: number | null;
  examDate: string | null;
  examType: string;
  weakTopics: string[];
  subjects: string[];
  dailyStudyTarget: number;
  weeklyStudyTarget: number;
}

type Tab = "overview" | "availability" | "generator" | "sessions";

const TYPE_STYLES: Record<string, { icon: string; cls: string }> = {
  Learn: { icon: "📖", cls: "bg-blue-500/15 text-blue-600 dark:text-blue-300" },
  Revision: { icon: "🔁", cls: "bg-purple-500/15 text-purple-600 dark:text-purple-300" },
  MCQ: { icon: "✅", cls: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300" },
  PastPaper: { icon: "📝", cls: "bg-amber-500/15 text-amber-600 dark:text-amber-300" },
  WeakTopic: { icon: "🎯", cls: "bg-rose-500/15 text-rose-600 dark:text-rose-300" },
  AITutor: { icon: "🤖", cls: "bg-cyan-500/15 text-cyan-600 dark:text-cyan-300" },
  Review: { icon: "👀", cls: "bg-slate-500/15 text-slate-600 dark:text-slate-300" },
};

const DEFAULT_DAYS = (): DayConfig[] =>
  DAY_NAMES.map((_, i) => ({ dayOfWeek: i, enabled: false, dailyTargetMin: 0, blocks: [] }));

const DEFAULT_PREFS: Prefs = {
  weeklyTargetMin: 0,
  sessionLengthMin: 60,
  breakAfterMin: 60,
  breakDurationMin: 10,
  timeFormat: "24h",
  showBreaks: true,
  subjectPriorities: [],
  studyTypes: [],
  weakTopics: [],
};

export default function PlannerPage() {
  const { showToast } = useToast();
  const [tab, setTab] = useState<Tab>("overview");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [days, setDays] = useState<DayConfig[]>(DEFAULT_DAYS());
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [sessions, setSessions] = useState<PlannerSession[]>([]);
  const [subjects, setSubjects] = useState<SubjectOption[]>([]);
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [syncMode, setSyncMode] = useState(false);
  const [today, setToday] = useState(new Date());

  // generator state
  const [preview, setPreview] = useState<{ sessions: PlannedSession[]; weeklyAvailableMin: number; weeklyPlannedMin: number; weeklyTargetMin: number; remainingMin: number; byDay: { dayOfWeek: number; availableMin: number; plannedMin: number }[] } | null>(null);
  const [aiGoals, setAiGoals] = useState("");
  const [aiPlan, setAiPlan] = useState<string | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  // manual add / edit state
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<PlannerSession | null>(null);
  const [subjectSel, setSubjectSel] = useState("");
  const [topicTitle, setTopicTitle] = useState("");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");
  const [formDay, setFormDay] = useState(dayOfWeekIndex(today));
  const [formDate, setFormDate] = useState("");
  const [typeSel, setTypeSel] = useState<StudyType>("Learn");
  const [prioritySel, setPrioritySel] = useState<Priority>("Medium");
  const [recurrence, setRecurrence] = useState("Once");
  const [recurrenceDays, setRecurrenceDays] = useState<number[]>([]);
  const [reminderMin, setReminderMin] = useState(15);
  const [notifPerm, setNotifPerm] = useState<NotificationPermission>("default");

  const api = useCallback(
    async (action: string, payload: Record<string, unknown> = {}) => {
      const res = await fetch("/api/planner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...payload }),
      });
      const data = await res.json();
      if (!res.ok) throw { status: res.status, data };
      return data;
    },
    [],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/planner");
      const data = await res.json();
      setDays(data.days ?? DEFAULT_DAYS());
      setPrefs((p) => ({
        ...DEFAULT_PREFS,
        ...(data.prefs ?? {}),
      }));
      setSessions(data.sessions ?? []);
      setSubjects(data.subjects ?? []);
      setProfile(data.profile ?? null);
    } catch {
      showToast("Failed to load planner", "error");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [showToast]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if ("Notification" in window) setNotifPerm(Notification.permission);
  }, []);

  // Only auto-advance `today` at midnight transition.
  useEffect(() => {
    const id = setInterval(() => setToday(new Date()), 60000);
    return () => clearInterval(id);
  }, []);

  const activeDays = useMemo(() => days.filter((d) => d.enabled && d.blocks.length > 0), [days]);
  const totalAvailableMin = useMemo(
    () => activeDays.reduce((s, d) => s + dayTotalAvailable(d.blocks), 0),
    [activeDays],
  );
  const sessionsCount = sessions.length;

  const dow = dayOfWeekIndex(today);
  const todayKey = dateKeyOf(today);

  const todaySessions = useMemo(
    () =>
      sessions
        .filter((s) => {
          if (s.date) return s.date === todayKey;
          return s.dayOfWeek === dow;
        })
        .sort((a, b) => a.startMinute - b.startMinute),
    [sessions, todayKey, dow],
  );

  const todayCompletedMin = useMemo(
    () =>
      todaySessions
        .filter((s) => s.status === "completed" || (s.status === "scheduled" && s.endMinute <= today.getHours() * 60 + today.getMinutes()))
        .reduce((sum, s) => sum + (s.endMinute - s.startMinute), 0),
    [todaySessions, today],
  );
  const todayScheduledMin = useMemo(
    () => todaySessions.reduce((sum, s) => sum + (s.endMinute - s.startMinute), 0),
    [todaySessions],
  );
  const nowMin = today.getHours() * 60 + today.getMinutes();
  const current = todaySessions.find((s) => s.status !== "completed" && s.status !== "skipped" && nowMin >= s.startMinute && nowMin < s.endMinute);
  const upNext = todaySessions.find((s) => s.status !== "completed" && s.status !== "skipped" && s.startMinute > nowMin);
  const completedList = todaySessions.filter((s) => s.status === "completed" || (s.status === "scheduled" && s.endMinute <= nowMin)).slice(-4);

  const recommendations = useMemo(() => {
    const recs: string[] = [];
    const highCount = prefs.subjectPriorities.filter((s) => s.priority === "High").length;
    if (highCount > 0) recs.push(`${prefs.subjectPriorities.filter((s) => s.priority === "High").map((s) => s.name).join(", ")} highlighted as high priority this week.`);
    const freeDay = activeDays.find((d) => dayTotalAvailable(d.blocks) >= 180);
    if (freeDay) recs.push(`You have ${formatDuration(dayTotalAvailable(freeDay.blocks))} free on ${DAY_NAMES[freeDay.dayOfWeek]}.`);
    const plannedBySubject = new Map<string, number>();
    sessions.filter((s) => s.status !== "skipped").forEach((s) => plannedBySubject.set(s.subjectName, (plannedBySubject.get(s.subjectName) || 0) + 1));
    let best: string | null = null;
    let bestCount = 0;
    plannedBySubject.forEach((c, n) => {
      if (c > bestCount) { best = n; bestCount = c; }
    });
    if (best) {
      const completed = sessions.filter((s) => s.subjectName === best && s.status === "completed").length;
      recs.push(`You planned ${bestCount} ${best} session${bestCount > 1 ? "s" : ""} but completed ${completed}.`);
    }
    return recs;
  }, [prefs.subjectPriorities, activeDays, sessions]);

  function refresh() {
    setRefreshing(true);
    load();
  }

  // ---------- availability handlers ----------
  function patchDay(dow: number, patch: Partial<DayConfig>) {
    setDays((prev) => prev.map((d) => (d.dayOfWeek === dow ? { ...d, ...patch } : d)));
  }

  function mutateDayBlocks(dow: number, updater: (blocks: TimeBlock[]) => TimeBlock[], enable = false) {
    setDays((prev) => {
      let next = prev.map((d) =>
        d.dayOfWeek === dow ? { ...d, enabled: enable ? true : d.enabled, blocks: updater(d.blocks) } : d,
      );
      if (syncMode) {
        const src = next.find((d) => d.dayOfWeek === dow);
        if (src) {
          next = next.map((d) =>
            d.dayOfWeek === dow ? d : { ...d, enabled: enable ? true : d.enabled, blocks: [...src.blocks] },
          );
        }
      }
      return next;
    });
  }

  function addBlock(dow: number) {
    mutateDayBlocks(dow, (blocks) => [...blocks, { startMinute: 480, endMinute: 540 }], true);
  }

  function updateBlock(dow: number, idx: number, patch: Partial<TimeBlock>) {
    mutateDayBlocks(dow, (blocks) => blocks.map((b, i) => (i === idx ? { ...b, ...patch } : b)), true);
  }

  function removeBlock(dow: number, idx: number) {
    mutateDayBlocks(dow, (blocks) => blocks.filter((_, i) => i !== idx));
  }

  function setDayHours(dow: number, hours: number) {
    setDays((prev) => {
      const minutes = Math.max(0, Math.min(24, (Number.isFinite(hours) ? hours : 0) || 0)) * 60;
      const day = prev.find((d) => d.dayOfWeek === dow);
      const start = day?.blocks[0]?.startMinute ?? 480;
      const nextBlocks = minutes <= 0 ? [] : [{ startMinute: start, endMinute: Math.min(1440, start + minutes) }];
      let next = prev.map((d) =>
        d.dayOfWeek === dow ? { ...d, blocks: nextBlocks } : d,
      );
      if (syncMode) {
        const src = next.find((d) => d.dayOfWeek === dow);
        if (src) {
          next = next.map((d) => (d.dayOfWeek === dow ? d : { ...d, blocks: [...src.blocks] }));
        }
      }
      return next;
    });
  }

  async function saveAvailability() {
    setBusy(true);
    try {
      await api("saveDays", { days });
      showToast("Availability saved", "success");
      await load();
    } catch (e: any) {
      showToast("Failed to save availability: " + (e?.data?.error || "error"), "error");
    } finally {
      setBusy(false);
    }
  }

  // ---------- prefs handlers ----------
  function addSubject() {
    if (!subjectSel) return;
    const s = subjects.find((x) => x.id === subjectSel);
    if (!s) return;
    if (prefs.subjectPriorities.some((p) => p.subjectId === s.id)) return;
    setPrefs((p) => ({
      ...p,
      subjectPriorities: [...p.subjectPriorities, { subjectId: s.id, name: s.name, priority: "Medium", icon: s.icon, color: s.color }],
    }));
  }

  function setSubjectPriority(id: string, priority: Priority) {
    setPrefs((p) => ({
      ...p,
      subjectPriorities: p.subjectPriorities.map((s) => (s.subjectId === id ? { ...s, priority } : s)),
    }));
  }

  function removeSubject(id: string) {
    setPrefs((p) => ({ ...p, subjectPriorities: p.subjectPriorities.filter((s) => s.subjectId !== id) }));
  }

  function cycleTypeWeight(type: StudyType, delta: number) {
    setPrefs((p) => {
      const existing = [...p.studyTypes];
      const idx = existing.findIndex((t) => t.type === type);
      if (idx === -1) {
        const initial = Math.max(0, delta);
        if (initial <= 0) return { ...p, studyTypes: existing };
        return { ...p, studyTypes: [...existing, { type, weight: initial }] };
      }
      const next = Math.max(0, existing[idx].weight + delta);
      if (next === 0) return { ...p, studyTypes: existing.filter((t) => t.type !== type) };
      existing[idx] = { ...existing[idx], weight: next };
      return { ...p, studyTypes: existing };
    });
  }

  async function savePrefs() {
    setBusy(true);
    try {
      await api("savePrefs", {
        weeklyTargetMin: prefs.weeklyTargetMin,
        sessionLengthMin: prefs.sessionLengthMin,
        breakAfterMin: prefs.breakAfterMin,
        breakDurationMin: prefs.breakDurationMin,
        timeFormat: prefs.timeFormat,
        showBreaks: prefs.showBreaks,
        subjectPriorities: prefs.subjectPriorities,
        studyTypes: prefs.studyTypes,
        weakTopics: prefs.weakTopics,
      });
      showToast("Preferences saved", "success");
    } catch (e: any) {
      showToast("Failed to save preferences", "error");
    } finally {
      setBusy(false);
    }
  }

  // ---------- generator handlers ----------
  async function runGenerate() {
    setBusy(true);
    setPreview(null);
    try {
      await api("saveDays", { days });
      const res = await api("generate");
      setPreview(res);
      setTab("generator");
      showToast("Timetable generated — review before saving", "success");
    } catch (e: any) {
      showToast("Generation failed: " + (e?.data?.error || "error"), "error");
    } finally {
      setBusy(false);
    }
  }

  async function runAIPlan() {
    if (!aiGoals.trim()) {
      showToast("Tell me what you need help with first", "error");
      return;
    }
    setAiBusy(true);
    setAiError(null);
    try {
      await api("saveDays", { days });
      const res = await api("aiPlan", { goals: aiGoals });
      setAiPlan(res.plan);
      showToast("AI study plan ready", "success");
    } catch (e: any) {
      setAiError(e?.data?.error || "Failed to generate AI plan");
    } finally {
      setAiBusy(false);
    }
  }

  function copyAIPlan() {
    if (!aiPlan) return;
    navigator.clipboard?.writeText(aiPlan).then(
      () => showToast("Plan copied to clipboard", "success"),
      () => showToast("Could not copy plan", "error"),
    );
  }

  async function savePreview() {
    setBusy(true);
    try {
      await api("saveGenerated", {
        sessions: preview!.sessions.map((s) => ({
          subjectId: s.subjectId,
          subjectName: s.subjectName,
          topicId: null,
          topicTitle: s.topicTitle ?? null,
          dayOfWeek: s.dayOfWeek,
          startMinute: s.startMinute,
          endMinute: s.endMinute,
          type: s.type,
          priority: s.priority,
          recurrence: "Weekly",
          recurrenceDays: [s.dayOfWeek],
          reminderMin: 15,
          notes: "",
        })),
      });
      setPreview(null);
      showToast("Timetable saved (" + preview!.sessions.length + " sessions)", "success");
      await load();
    } catch (e: any) {
      showToast("Failed to save timetable", "error");
    } finally {
      setBusy(false);
    }
  }

  async function clearSchedule() {
    if (!window.confirm("Remove all scheduled sessions?")) return;
    setBusy(true);
    try {
      await api("clearSchedule");
      showToast("Schedule cleared", "success");
      await load();
    } catch {
      showToast("Failed to clear schedule", "error");
    } finally {
      setBusy(false);
    }
  }

  // ---------- session actions ----------
  function openAddForm(session?: PlannerSession) {
    if (session) {
      setEditing(session);
      setSubjectSel(session.subjectId);
      setTopicTitle(session.topicTitle || "");
      setStartTime(formatClock(session.startMinute, "24h").slice(0, 5));
      setEndTime(formatClock(session.endMinute, "24h").slice(0, 5));
      setFormDay(session.dayOfWeek ?? dayOfWeekIndex(today));
      setFormDate(session.date || "");
      setTypeSel(session.type);
      setPrioritySel(session.priority);
      setRecurrence(session.recurrence);
      setRecurrenceDays(session.recurrenceDays.length ? session.recurrenceDays : [session.dayOfWeek ?? dayOfWeekIndex(today)]);
      setReminderMin(session.reminderMin);
    } else {
      setEditing(null);
      setSubjectSel(subjects[0]?.id || "");
      setTopicTitle("");
      setStartTime("18:00");
      setEndTime("19:00");
      setFormDay(dayOfWeekIndex(today));
      setFormDate("");
      setTypeSel("Learn");
      setPrioritySel("Medium");
      setRecurrence("Once");
      setRecurrenceDays([]);
      setReminderMin(15);
    }
    setFormOpen(true);
    setTab("sessions");
  }

  function toMinutes(t: string): number {
    const [h, m] = t.split(":").map((x) => parseInt(x, 10) || 0);
    return h * 60 + Math.min(m, 59);
  }

  async function submitSession() {
    const subject = subjects.find((s) => s.id === subjectSel);
    const startM = toMinutes(startTime);
    const endM = toMinutes(endTime);
    if (endM <= startM) {
      showToast("End time must be after start time", "error");
      return;
    }
    if (!subject && !subjectSel) {
      showToast("Select a subject", "error");
      return;
    }
    const payload: Record<string, unknown> = {
      subjectId: subject ? subject.id : subjectSel,
      subjectName: subject ? subject.name : "Study",
      topicTitle: topicTitle || null,
      dayOfWeek: formDay,
      startMinute: startM,
      endMinute: endM,
      type: typeSel,
      priority: prioritySel,
      recurrence,
      recurrenceDays,
      reminderMin,
      notes: "",
    };
    if (formDate) payload.date = formDate;
    setBusy(true);
    try {
      if (editing) {
        await api("updateSession", { id: editing.id, session: payload });
        showToast("Session updated", "success");
      } else {
        await api("createSession", { session: payload });
        showToast("Session added", "success");
      }
      setFormOpen(false);
      await load();
    } catch (e: any) {
      if (e?.status === 409 && e?.data?.conflicts) {
        const conf = e.data.conflicts[0];
        const confirm = window.confirm(
          `⚠️ Schedule Conflict — this session overlaps an existing one. Overlap: ${conf.overlapMin} min. Save anyway?`,
        );
        if (confirm) {
          try {
            if (editing) await api("updateSession", { id: editing.id, session: payload });
            else await api("createSession", { session: payload, force: true });
            setFormOpen(false);
            await load();
            showToast("Saved (overlap kept)", "success");
          } catch {
            showToast("Failed to save session", "error");
          }
        }
      } else {
        showToast("Failed to save session", "error");
      }
    } finally {
      setBusy(false);
    }
  }

  async function deleteSession(s: PlannerSession) {
    if (!window.confirm("Delete this session?")) return;
    setBusy(true);
    try {
      await api("deleteSession", { id: s.id });
      await load();
      showToast("Session deleted", "success");
    } catch {
      showToast("Failed to delete session", "error");
    } finally {
      setBusy(false);
    }
  }

  async function completeSession(s: PlannerSession) {
    setBusy(true);
    try {
      await api("completeSession", { id: s.id });
      await load();
      showToast("Session completed 🎉", "success");
    } catch {
      showToast("Failed to update session", "error");
    } finally {
      setBusy(false);
    }
  }

  async function skipSession(s: PlannerSession) {
    setBusy(true);
    try {
      await api("skipSession", { id: s.id });
      await load();
      showToast("Session skipped", "success");
    } catch {
      showToast("Failed to update session", "error");
    } finally {
      setBusy(false);
    }
  }

  async function toggleRecurrenceDay(d: number) {
    setRecurrenceDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));
  }

  async function requestNotification() {
    if ("Notification" in window) {
      const result = await Notification.requestPermission();
      setNotifPerm(result);
      if (result === "granted") showToast("Notifications enabled", "success");
      else if (result === "denied") showToast("Notifications blocked — reminders won't alert when app is closed", "error");
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const hasTimetable = activeDays.length > 0 && sessionsCount > 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="A/L Smart Study Planner"
        description="Plan around YOUR available time each day — not a fixed schedule."
      />

      {/* Notification permission prompt (only when reminders may be used) */}
      {notifPerm !== "granted" && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-3 text-sm">
          <Bell className="h-4 w-4 shrink-0 text-yellow-600" />
          <p className="flex-1 text-yellow-700 dark:text-yellow-300">
            Allow notifications so BioPulse can remind you before study sessions. Reminders work best
            while the app is open; if you deny permission, you won&apos;t receive browser alerts.
          </p>
          <Button variant="outline" size="sm" onClick={requestNotification}>
            Enable Notifications
          </Button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex flex-wrap gap-2">
        {(
          [
            ["overview", "Today & Week", CalendarDays],
            ["availability", "My Available Time", Clock3],
            ["generator", "Smart Generator", Wand2],
            ["sessions", "My Sessions", ListChecks],
          ] as [Tab, string, React.ElementType][]
        ).map(([key, label, Icon]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              tab === key ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground border border-border hover:bg-accent"
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
        <Button variant="outline" size="sm" onClick={refresh} className="ml-auto gap-2" disabled={refreshing}>
          <RotateCcw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {!hasTimetable && tab === "overview" && (
        <Card>
          <CardContent className="p-0">
            <EmptyState
              icon="🗓️"
              title={activeDays.length === 0 ? "No study timetable yet" : "No sessions scheduled yet"}
              description={
                activeDays.length === 0
                  ? "Set your available study times for each day, then generate a smart A/L timetable."
                  : "Your availability is set. Generate a smart timetable or add sessions manually."
              }
              action={
                <div className="flex flex-wrap gap-2 justify-center">
                  <Button onClick={() => setTab("availability")} className="gap-2">
                    <Clock3 className="h-4 w-4" /> Set My Available Time
                  </Button>
                  <Button variant="outline" onClick={() => openAddForm()} className="gap-2">
                    <Plus className="h-4 w-4" /> Add Session
                  </Button>
                  <Button variant="secondary" onClick={() => setTab("generator")} className="gap-2">
                    <Wand2 className="h-4 w-4" /> Generate Smart Timetable
                  </Button>
                </div>
              }
            />
          </CardContent>
        </Card>
      )}

      {/* ---------------- OVERVIEW ---------------- */}
      {tab === "overview" && (
        <div className="space-y-6">
          {/* Today */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Calendar className="h-4 w-4 text-primary" /> Today — {DAY_NAMES[dow]} {today.toLocaleDateString()}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {todaySessions.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4">
                  No sessions scheduled today. {activeDays.length > 0 ? "" : "Set your available time to get a plan."}
                </p>
              ) : (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                    <Stat label="Available" value={formatDuration(dayTotalAvailable(activeDays.find((d) => d.dayOfWeek === dow)?.blocks ?? []))} />
                    <Stat label="Planned" value={formatDuration(todayScheduledMin)} />
                    <Stat label="Completed" value={formatDuration(todayCompletedMin)} />
                    <Stat label="Remaining" value={formatDuration(Math.max(0, todayScheduledMin - todayCompletedMin))} />
                  </div>

                  {current && (
                    <div className="mb-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
                      <div className="text-xs font-semibold uppercase tracking-wide text-primary">● Current</div>
                      <div className="mt-1 flex items-center gap-2">
                        <span className="text-lg">{TYPE_STYLES[current.type]?.icon}</span>
                        <div>
                          <div className="font-medium">{current.subjectName}{current.topicTitle ? ` — ${current.topicTitle}` : ""}</div>
                          <div className="text-sm text-muted-foreground">{formatClock(current.startMinute, prefs.timeFormat)} – {formatClock(current.endMinute, prefs.timeFormat)}</div>
                        </div>
                      </div>
                    </div>
                  )}

                  {upNext && !current && (
                    <div className="mb-3 rounded-lg border border-border bg-card p-3">
                      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Up Next</div>
                      <div className="mt-1 flex items-center gap-2">
                        <span className="text-lg">{TYPE_STYLES[upNext.type]?.icon}</span>
                        <div>
                          <div className="font-medium">{upNext.subjectName}{upNext.topicTitle ? ` — ${upNext.topicTitle}` : ""}</div>
                          <div className="text-sm text-muted-foreground">{formatClock(upNext.startMinute, prefs.timeFormat)} – {formatClock(upNext.endMinute, prefs.timeFormat)}</div>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="space-y-2">
                    {todaySessions.map((s) => {
                      const done = s.status === "completed" || (s.status === "scheduled" && s.endMinute <= nowMin);
                      const skipped = s.status === "skipped";
                      const style = TYPE_STYLES[s.type] || {};
                      return (
                        <div key={s.id} className={`flex items-center gap-3 rounded-md border px-3 py-2 ${done ? "border-emerald-500/30 bg-emerald-500/5 opacity-80" : skipped ? "border-border opacity-50" : "border-border"}`}>
                          <span className="text-lg">{style.icon}</span>
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-medium">
                              {done && <CheckCircle2 className="mr-1 inline h-4 w-4 text-emerald-500" />}
                              {skipped && <XCircle className="mr-1 inline h-4 w-4 text-muted-foreground" />}
                              {s.subjectName}{s.topicTitle ? ` — ${s.topicTitle}` : ""}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {formatClock(s.startMinute, prefs.timeFormat)} – {formatClock(s.endMinute, prefs.timeFormat)}
                              {s.reminderMin > 0 && ` · Reminder ${s.reminderMin} min before`}
                            </div>
                          </div>
                          {!done && !skipped && (
                            <div className="flex gap-1">
                              <Button size="sm" variant="outline" onClick={() => completeSession(s)} className="gap-1">
                                <Play className="h-3 w-3" /> Start
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => skipSession(s)} className="gap-1">
                                <SkipForward className="h-3 w-3" /> Skip
                              </Button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Week overview */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <CalendarDays className="h-4 w-4 text-primary" /> Weekly Overview
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
                <Stat label="Week Available" value={formatDuration(totalAvailableMin)} />
                <Stat label="Week Planned" value={formatDuration(sessions.filter((s) => s.status !== "skipped").reduce((sum, s) => sum + (s.endMinute - s.startMinute), 0))} />
                <Stat label="Week Completed" value={formatDuration(sessions.filter((s) => s.status === "completed").reduce((sum, s) => sum + (s.endMinute - s.startMinute), 0))} />
                <Stat label="Sessions" value={String(sessionsCount)} />
              </div>

              <div className="grid grid-cols-2 md:grid-cols-7 gap-2">
                {DAY_NAMES.map((name, i) => {
                  const avail = dayTotalAvailable(days[i]?.blocks ?? []);
                  const planned = sessions.filter((s) => s.dayOfWeek === i && s.status !== "skipped").reduce((sum, s) => sum + (s.endMinute - s.startMinute), 0);
                  const completed = sessions.filter((s) => s.dayOfWeek === i && s.status === "completed").reduce((sum, s) => sum + (s.endMinute - s.startMinute), 0);
                  const isToday = i === dow;
                  return (
                    <div key={name} className={`rounded-md border p-2 text-center ${isToday ? "border-primary bg-primary/5" : "border-border"}`}>
                      <div className="text-xs font-semibold">{name.slice(0, 3)}{isToday && " · Today"}</div>
                      <div className="mt-1 text-[11px] text-muted-foreground">Avail {formatDuration(avail)}</div>
                      <div className="text-[11px] text-muted-foreground">Plan {formatDuration(planned)}</div>
                      <div className="text-[11px] text-emerald-600 dark:text-emerald-300">Done {formatDuration(completed)}</div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Recommendations */}
          {recommendations.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Sparkles className="h-4 w-4 text-primary" /> Smart Recommendations
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {recommendations.map((r, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      <span>{r}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {!hasTimetable && (
            <div className="flex flex-wrap justify-center gap-2">
              <Button onClick={() => setTab("availability")} className="gap-2">
                <Clock3 className="h-4 w-4" /> Set My Available Time
              </Button>
              <Button variant="secondary" onClick={() => setTab("generator")} className="gap-2">
                <Wand2 className="h-4 w-4" /> Generate Smart Timetable
              </Button>
            </div>
          )}
        </div>
      )}

      {/* ---------------- AVAILABILITY ---------------- */}
      {tab === "availability" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Clock3 className="h-4 w-4 text-primary" /> My Available Study Time
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Configure how much time you can study on each day. Add multiple blocks for realistic day plans.
            </p>
          </CardHeader>
          <CardContent>
            <div className="mb-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Toggle
                  checked={syncMode}
                  onCheckedChange={setSyncMode}
                  label="Same time for all days"
                />
                <span className="text-xs text-muted-foreground">
                  {syncMode ? "Edits apply to every day automatically" : "Add one time, then every day stays independent"}
                </span>
              </div>
            </div>
            <div className="space-y-4">
              {days.map((d) => (
                <div key={d.dayOfWeek} className={`rounded-lg border p-3 ${d.enabled ? "border-primary/40 bg-primary/5" : "border-border"}`}>
                  <div className="flex flex-wrap items-center gap-3">
                    <Toggle
                      checked={d.enabled}
                      onCheckedChange={(v) => patchDay(d.dayOfWeek, { enabled: v })}
                      label={DAY_NAMES[d.dayOfWeek]}
                    />
                    <div className="ml-auto flex flex-wrap items-center gap-2 text-sm">
                      <span className="text-muted-foreground">Hours:</span>
                      <Input
                        type="number"
                        min={0}
                        max={24}
                        step={0.5}
                        className="h-8 w-16"
                        value={Math.round((dayTotalAvailable(d.blocks) / 60) * 2) / 2 || ""}
                        placeholder="0"
                        onChange={(e) => setDayHours(d.dayOfWeek, Number(e.target.value))}
                        title="Set total available hours for this day (auto-converts to a time block)"
                      />
                      <span className="text-muted-foreground">Daily target (min):</span>
                      <Input
                        type="number"
                        min={0}
                        max={1440}
                        className="h-8 w-24"
                        value={d.dailyTargetMin || ""}
                        placeholder="0 = all"
                        onChange={(e) => patchDay(d.dayOfWeek, { dailyTargetMin: Math.max(0, Number(e.target.value) || 0) })}
                      />
                      {d.enabled && (
                        <Button size="sm" variant="outline" onClick={() => addBlock(d.dayOfWeek)} className="gap-1">
                          <Plus className="h-3 w-3" /> Add time block
                        </Button>
                      )}
                    </div>
                  </div>
                  {d.enabled && (
                    <div className="mt-3">
                      {d.blocks.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No time blocks set. Add one to define your available period.</p>
                      ) : (
                        <div className="space-y-2">
                          {d.blocks.map((b, i) => (
                            <div key={i} className="flex flex-wrap items-center gap-2">
                              <span className="text-xs font-medium text-muted-foreground w-16">Block {i + 1}</span>
                              <input
                                type="time"
                                className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                                value={formatClock(b.startMinute, "24h").slice(0, 5)}
                                onChange={(e) => updateBlock(d.dayOfWeek, i, { startMinute: toMinutes(e.target.value) })}
                              />
                              <span className="text-xs text-muted-foreground">to</span>
                              <input
                                type="time"
                                className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                                value={formatClock(b.endMinute, "24h").slice(0, 5)}
                                onChange={(e) => updateBlock(d.dayOfWeek, i, { endMinute: toMinutes(e.target.value) })}
                              />
                              <span className="text-xs text-muted-foreground">({formatDuration(Math.max(0, b.endMinute - b.startMinute))})</span>
                              <button
                                onClick={() => removeBlock(d.dayOfWeek, i)}
                                className="rounded p-1 text-muted-foreground hover:text-destructive"
                                aria-label="Remove block"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div className="mt-4 flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Week available: <span className="font-semibold">{formatDuration(totalAvailableMin)}</span>
              </p>
              <Button onClick={saveAvailability} className="gap-2" disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save Availability
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ---------------- GENERATOR ---------------- */}
      {tab === "generator" && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Wand2 className="h-4 w-4 text-primary" /> Smart A/L Timetable Generator
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Choose your subjects, priorities, targets, session length and study types — then generate.
                The planner only uses your available time and never fills every minute.
              </p>
            </CardHeader>
            <CardContent>
              {/* Step: subjects & priorities */}
              <div className="mb-6">
                <h3 className="mb-2 text-sm font-semibold">1 · Select Subjects & Priorities</h3>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    className="h-10 flex-1 min-w-[200px] rounded-md border border-input bg-background px-3 text-sm"
                    value={subjectSel}
                    onChange={(e) => setSubjectSel(e.target.value)}
                  >
                    <option value="">Select subject…</option>
                    {subjects.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                  <Button variant="outline" size="sm" onClick={addSubject} disabled={!subjectSel} className="gap-1">
                    <Plus className="h-4 w-4" /> Add
                  </Button>
                </div>
                {prefs.subjectPriorities.length > 0 && (
                  <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {prefs.subjectPriorities.map((s) => (
                      <div key={s.subjectId} className="flex items-center gap-2 rounded-md border border-border px-3 py-2">
                        <span>{s.icon || "📘"}</span>
                        <span className="flex-1 truncate text-sm font-medium">{s.name}</span>
                        <select
                          className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                          value={s.priority}
                          onChange={(e) => setSubjectPriority(s.subjectId, e.target.value as Priority)}
                        >
                          <option>Low</option>
                          <option>Medium</option>
                          <option>High</option>
                        </select>
                        <button onClick={() => removeSubject(s.subjectId)} className="text-muted-foreground hover:text-destructive" aria-label="Remove subject">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Step: targets */}
              <div className="mb-6 grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Weekly target (minutes)</label>
                  <Input
                    type="number"
                    min={0}
                    value={prefs.weeklyTargetMin || ""}
                    placeholder="0 = no target"
                    onChange={(e) => setPrefs((p) => ({ ...p, weeklyTargetMin: Math.max(0, Number(e.target.value) || 0) }))}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Preferred session length (min)</label>
                  <select
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={prefs.sessionLengthMin}
                    onChange={(e) => setPrefs((p) => ({ ...p, sessionLengthMin: Number(e.target.value) }))}
                  >
                    {[25, 45, 50, 60, 75, 90, 120].map((n) => (
                      <option key={n} value={n}>{n} min</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Break preferences</label>
                  <div className="flex items-center gap-2">
                    <select
                      className="h-10 flex-1 rounded-md border border-input bg-background px-3 text-sm"
                      value={prefs.breakAfterMin}
                      onChange={(e) => setPrefs((p) => ({ ...p, breakAfterMin: Number(e.target.value) }))}
                    >
                      {[25, 45, 50, 60, 90].map((n) => <option key={n} value={n}>Every {n} min</option>)}
                    </select>
                    <span className="text-sm text-muted-foreground">/</span>
                    <select
                      className="h-10 flex-1 rounded-md border border-input bg-background px-3 text-sm"
                      value={prefs.breakDurationMin}
                      onChange={(e) => setPrefs((p) => ({ ...p, breakDurationMin: Number(e.target.value) }))}
                    >
                      {[5, 10, 15, 20].map((n) => <option key={n} value={n}>{n} min</option>)}
                    </select>
                  </div>
                </div>
              </div>

              {/* Step: study type distribution */}
              <div className="mb-6">
                <h3 className="mb-2 text-sm font-semibold">2 · Study Type Distribution</h3>
                <p className="mb-2 text-xs text-muted-foreground">Increase the weight of types you want more of. Weight 0 removes it.</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                  {STUDY_TYPES.map((t) => {
                    const w = prefs.studyTypes.find((x) => x.type === t)?.weight ?? 0;
                    return (
                      <div key={t} className="flex items-center gap-2 rounded-md border border-border px-3 py-2">
                        <span>{TYPE_STYLES[t]?.icon}</span>
                        <span className="flex-1 text-sm font-medium">{t}</span>
                        <div className="flex items-center gap-1">
                          <button onClick={() => cycleTypeWeight(t, -1)} className="h-6 w-6 rounded border border-input text-muted-foreground hover:bg-accent">−</button>
                          <span className="w-5 text-center text-sm">{w || ""}</span>
                          <button onClick={() => cycleTypeWeight(t, 1)} className="h-6 w-6 rounded border border-input text-muted-foreground hover:bg-accent">+</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Step: weak topics */}
              <div className="mb-6">
                <h3 className="mb-2 text-sm font-semibold">3 · Weak Topics (optional)</h3>
                <p className="mb-2 text-xs text-muted-foreground">Used to label WeakTopic practice sessions. From your profile if set.</p>
                <div className="flex flex-wrap gap-2 items-center">
                  <Input
                    className="flex-1"
                    placeholder="Type a weak topic (e.g. Genetics) and press +"
                    value={topicTitle}
                    onChange={(e) => setTopicTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && topicTitle.trim()) {
                        e.preventDefault();
                        setPrefs((p) => ({ ...p, weakTopics: [...p.weakTopics, topicTitle.trim()] }));
                        setTopicTitle("");
                      }
                    }}
                  />
                  <Button
                    variant="outline"
                    onClick={() => {
                      if (topicTitle.trim()) {
                        setPrefs((p) => ({ ...p, weakTopics: [...p.weakTopics, topicTitle.trim()] }));
                        setTopicTitle("");
                      }
                    }}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                {prefs.weakTopics.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {prefs.weakTopics.map((w, i) => (
                      <Badge key={i} variant="outline" className="gap-1">
                        {w}
                        <button onClick={() => setPrefs((p) => ({ ...p, weakTopics: p.weakTopics.filter((_, x) => x !== i) }))} className="text-muted-foreground hover:text-destructive">×</button>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button onClick={savePrefs} variant="outline" className="gap-2" disabled={busy}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Save Preferences
                </Button>
                <Button onClick={runGenerate} className="gap-2" disabled={busy || activeDays.length === 0}>
                  <Wand2 className="h-4 w-4" /> Generate My A/L Timetable
                </Button>
                {activeDays.length === 0 && (
                  <span className="text-xs text-muted-foreground">Set available time in the Availability tab first.</span>
                )}
              </div>
            </CardContent>
          </Card>

          {/* AI Study Plan */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Sparkles className="h-4 w-4 text-primary" /> AI Study Plan
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Tell me what&apos;s on your mind — upcoming exams, weak subjects, goals, or anything else. I&apos;ll build a
                personalized weekly plan inside your available time.
              </p>
            </CardHeader>
            <CardContent>
              <textarea
                className="min-h-[110px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                placeholder={`e.g. මගේ ජීව විද්‍යාව හරියටම හරි නෑ, ලබන සතියේ ගණිතය ටෙස්ට් එකක් තියෙනවා...`}
                value={aiGoals}
                onChange={(e) => setAiGoals(e.target.value)}
              />
              <Button onClick={runAIPlan} disabled={aiBusy} className="mt-2 gap-2">
                {aiBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                Generate AI Study Plan
              </Button>
              {aiError && <p className="mt-2 text-sm text-destructive">{aiError}</p>}
            </CardContent>
          </Card>

          {aiPlan && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Sparkles className="h-4 w-4 text-primary" /> My AI Study Plan
                </CardTitle>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={copyAIPlan} className="gap-1">
                    <Copy className="h-3.5 w-3.5" /> Copy
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setAiPlan(null);
                      setAiGoals("");
                    }}
                  >
                    Discard
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <pre className="whitespace-pre-wrap rounded-md bg-muted/50 p-4 text-sm leading-relaxed">{aiPlan}</pre>
              </CardContent>
            </Card>
          )}

          {/* Preview */}
          {preview && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Sparkles className="h-4 w-4 text-primary" /> Your Suggested A/L Study Timetable
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="mb-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <Stat label="Available" value={formatDuration(preview.weeklyAvailableMin)} />
                  <Stat label="Planned" value={formatDuration(preview.weeklyPlannedMin)} />
                  <Stat label="Weekly target" value={preview.weeklyTargetMin > 0 ? formatDuration(preview.weeklyTargetMin) : "—"} />
                  <Stat label="Remaining" value={formatDuration(preview.remainingMin)} />
                </div>

                {DAY_NAMES.map((name, i) => {
                  const daySessions = preview.sessions.filter((s) => s.dayOfWeek === i);
                  if (daySessions.length === 0) return null;
                  return (
                    <div key={name} className="mb-3">
                      <div className="mb-1 text-sm font-semibold">{name}</div>
                      <div className="space-y-1">
                        {daySessions.map((s, idx) => (
                          <div key={idx} className="flex flex-wrap items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm">
                            <span className="text-xs font-medium text-muted-foreground w-24">{formatClock(s.startMinute, prefs.timeFormat)} – {formatClock(s.endMinute, prefs.timeFormat)}</span>
                            <span>{TYPE_STYLES[s.type]?.icon}</span>
                            <span className="font-medium">{s.subjectName}{s.topicTitle ? ` — ${s.topicTitle}` : ""}</span>
                            <Badge variant={s.priority === "High" ? "default" : s.priority === "Medium" ? "secondary" : "outline"} className="ml-auto">{s.type}</Badge>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}

                <div className="mt-4 flex flex-wrap gap-2">
                  <Button onClick={savePreview} disabled={busy} className="gap-2">
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Save All
                  </Button>
                  <Button variant="outline" onClick={runGenerate} disabled={busy} className="gap-2">
                    <RotateCcw className="h-4 w-4" /> Regenerate
                  </Button>
                  <Button variant="ghost" onClick={() => setPreview(null)}>Discard · Start Over</Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ---------------- SESSIONS ---------------- */}
      {tab === "sessions" && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => openAddForm()} className="gap-2">
              <Plus className="h-4 w-4" /> Add Study Session
            </Button>
            {sessionsCount > 0 && (
              <Button variant="outline" onClick={clearSchedule} className="gap-2">
                <Trash2 className="h-4 w-4" /> Clear Schedule
              </Button>
            )}
            <Button variant="secondary" onClick={() => setTab("generator")} className="gap-2 ml-auto">
              <Wand2 className="h-4 w-4" /> Smart Generate
            </Button>
          </div>

          {/* Manual add / edit form */}
          {formOpen && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{editing ? "Edit Study Session" : "Add Study Session"}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Subject</label>
                    <select
                      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                      value={subjectSel}
                      onChange={(e) => setSubjectSel(e.target.value)}
                    >
                      <option value="">Select…</option>
                      {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Topic (optional)</label>
                    <Input value={topicTitle} onChange={(e) => setTopicTitle(e.target.value)} placeholder="e.g. Genetics" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Type</label>
                    <select
                      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                      value={typeSel}
                      onChange={(e) => setTypeSel(e.target.value as StudyType)}
                    >
                      {STUDY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Priority</label>
                    <select
                      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                      value={prioritySel}
                      onChange={(e) => setPrioritySel(e.target.value as Priority)}
                    >
                      <option>Low</option>
                      <option>Medium</option>
                      <option>High</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Specific date (optional)</label>
                    <Input type="date" value={formDate} onChange={(e) => setFormDate(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Recurrence</label>
                    <select
                      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                      value={recurrence}
                      onChange={(e) => setRecurrence(e.target.value)}
                    >
                      <option>Once</option>
                      <option>Weekly</option>
                      <option>SelectedWeekdays</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Start time</label>
                    <input type="time" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">End time</label>
                    <input type="time" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Reminder</label>
                    <select
                      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                      value={reminderMin}
                      onChange={(e) => setReminderMin(Number(e.target.value))}
                    >
                      <option value={0}>No reminder</option>
                      <option value={5}>5 min before</option>
                      <option value={10}>10 min before</option>
                      <option value={15}>15 min before</option>
                      <option value={30}>30 min before</option>
                      <option value={60}>1 hour before</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Day of week</label>
                    <select
                      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                      value={formDay}
                      onChange={(e) => setFormDay(Number(e.target.value))}
                    >
                      {DAY_NAMES.map((n, i) => <option key={i} value={i}>{n}</option>)}
                    </select>
                  </div>
                </div>

                {recurrence === "SelectedWeekdays" && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className="text-xs font-medium text-muted-foreground self-center">Repeat on:</span>
                    {DAY_NAMES.map((n, i) => (
                      <button
                        key={i}
                        onClick={() => toggleRecurrenceDay(i)}
                        className={`rounded-md border px-2 py-1 text-xs ${recurrenceDays.includes(i) ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}
                      >
                        {n.slice(0, 3)}
                      </button>
                    ))}
                  </div>
                )}

                <div className="mt-4 flex flex-wrap gap-2 justify-end">
                  <Button variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
                  <Button onClick={submitSession} disabled={busy} className="gap-2">
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    {editing ? "Save Changes" : "Add Session"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Week grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
            {DAY_NAMES.map((name, i) => {
              const daySessions = sessions
                .filter((s) => s.dayOfWeek === i)
                .sort((a, b) => a.startMinute - b.startMinute);
              return (
                <Card key={name} className={i === dow ? "border-primary" : ""}>
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between text-sm">
                      <span>{name}{i === dow && <Badge className="ml-2">Today</Badge>}</span>
                      <button onClick={() => { setFormDay(i); openAddForm(); }} className="text-muted-foreground hover:text-primary" aria-label={`Add session ${name}`}>
                        <Plus className="h-4 w-4" />
                      </button>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {daySessions.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No sessions</p>
                    ) : (
                      daySessions.map((s) => {
                        const style = TYPE_STYLES[s.type] || {};
                        return (
                          <div key={s.id} className="rounded-md border border-border p-2">
                            <div className="flex items-center justify-between">
                              <Badge className={style.cls}>{style.icon} {s.type}</Badge>
                              <div className="flex gap-0.5">
                                <button onClick={() => openAddForm(s)} className="rounded p-1 text-muted-foreground hover:text-primary" aria-label="Edit"><Pencil className="h-3 w-3" /></button>
                                <button onClick={() => deleteSession(s)} className="rounded p-1 text-muted-foreground hover:text-destructive" aria-label="Delete"><Trash2 className="h-3 w-3" /></button>
                              </div>
                            </div>
                            <div className="mt-1 text-sm font-medium">{s.subjectName}{s.topicTitle ? ` — ${s.topicTitle}` : ""}</div>
                            <div className="text-xs text-muted-foreground">{formatClock(s.startMinute, prefs.timeFormat)} – {formatClock(s.endMinute, prefs.timeFormat)}</div>
                            <div className="mt-1 flex items-center gap-2">
                              <Badge variant="outline">{s.status}</Badge>
                              {s.date && <Badge variant="outline">{s.date}</Badge>}
                              {s.reminderMin > 0 && <span className="text-[10px] text-muted-foreground"><Bell className="inline h-3 w-3" /> {s.reminderMin}m</span>}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Conflict banner on overview if any overlaps */}
      {tab === "overview" && sessionsCount > 0 && <ConflictsBanner sessions={sessions} timeFormat={prefs.timeFormat} />}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-card p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-bold">{value}</div>
    </div>
  );
}

function ConflictsBanner({ sessions, timeFormat }: { sessions: PlannerSession[]; timeFormat: "12h" | "24h" }) {
  const conflicts = useMemo(() => {
    const list: { a: PlannerSession; b: PlannerSession; overlap: number }[] = [];
    const sessionsArr = sessions.filter((s) => s.status === "scheduled");
    for (let i = 0; i < sessionsArr.length; i++) {
      for (let j = i + 1; j < sessionsArr.length; j++) {
        const x = sessionsArr[i];
        const y = sessionsArr[j];
        const sameSlot = x.dayOfWeek !== null && y.dayOfWeek !== null && x.dayOfWeek === y.dayOfWeek;
        if (sameSlot) {
          const overlap = Math.min(x.endMinute, y.endMinute) - Math.max(x.startMinute, y.startMinute);
          if (overlap > 0) list.push({ a: x, b: y, overlap });
        }
      }
    }
    return list.slice(0, 5);
  }, [sessions]);

  if (conflicts.length === 0) return null;

  return (
    <Card className="border-amber-500/50">
      <CardContent className="pt-6">
        <div className="flex items-start gap-2 text-sm text-amber-700 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <div className="font-semibold">{conflicts.length} overlapping session{conflicts.length > 1 ? "s" : ""} detected</div>
            <ul className="mt-1 space-y-1">
              {conflicts.map((c, i) => (
                <li key={i} className="text-xs">
                  {c.a.subjectName} {formatClock(c.a.startMinute, timeFormat)}–{formatClock(c.a.endMinute, timeFormat)} overlaps {c.b.subjectName} {formatClock(c.b.startMinute, timeFormat)}–{formatClock(c.b.endMinute, timeFormat)} ({c.overlap} min)
                </li>
              ))}
            </ul>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
