"use client";

import { useState, useEffect, useMemo } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import {
  Loader2,
  Wand2,
  Calendar,
  BarChart3,
  Clock,
  Trash2,
  Sparkles,
  ChevronRight,
  ChevronLeft,
  Play,
  X,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
} from "recharts";

const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const SUBJECTS = ["Biology", "Chemistry", "Physics", "Agriculture", "Mathematics", "ICT", "DT"];

interface Slot {
  id: string;
  dayOfWeek: number;
  startMinute: number;
  endMinute: number;
  subjectName: string;
  color: string;
  type: string;
  note: string;
}

interface Timetable {
  id: string;
  title: string;
  planText: string;
  examDate?: string | null;
  weeklyHours: number;
  createdAt: string;
  slots: Slot[];
}

function fmtClock(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  const hh = h % 24;
  const sm = String(m).padStart(2, "0");
  const ampm = hh < 12 ? "AM" : "PM";
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${h12}:${sm} ${ampm}`;
}

function fmtDur(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  return `${m}m`;
}

function slotSummary(s: Slot): string {
  if (s.type === "Nap") {
    return "Rest & recharge. Use this time to close your eyes, relax, or a light walk. Avoid screens — a short power nap boosts afternoon focus.";
  }
  if (s.type === "Tea") {
    return "Tea & snack break. Step away from study, have a light snack and hydrate. Come back fresh for the evening session.";
  }
  if (s.type === "Break") {
    return "Meal break — eat properly and rest. Good meals keep your energy steady through study blocks.";
  }
  if (s.type === "MCQ") {
    return "Session: " + (s.subjectName || "Study") + ". Goal — practice MCQs & past paper questions. Aim for accuracy then speed. Review mistakes after.";
  }
  if (s.type === "Revision" || s.type === "Past Paper") {
    return "Session: " + (s.subjectName || "Study") + ". Consolidate key points and test yourself with previous papers. Focus on weak topics covered here.";
  }
  return (
    "Session: " +
    (s.subjectName || "Study") +
    " (" +
    (s.type || "Theory") +
    ")." +
    (s.note ? " Topic: " + s.note + "." : " Focus on understanding and note the key points.") +
    " Use Pomodoro (25/5) to stay sharp."
  );
}

function DayBreakdown({
  slots,
  formatClock,
}: {
  slots: Slot[];
  formatClock: (min: number) => string;
}) {
  const isStudy = (s: Slot) => s.type !== "Break" && s.type !== "Nap" && s.type !== "Tea";
  const study = slots.filter(isStudy);
  const breaks = slots.filter((s) => !isStudy(s));
  const studyMin = study.reduce((sum, s) => sum + (s.endMinute - s.startMinute), 0);
  const breakMin = breaks.reduce((sum, s) => sum + (s.endMinute - s.startMinute), 0);

  if (slots.length === 0) {
    return <p className="text-sm text-muted-foreground">Rest day — no sessions planned.</p>;
  }

  const subjects = Array.from(new Set(study.map((s) => s.subjectName)));
  const totalH = (studyMin / 60).toFixed(1);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3 text-center">
        <div className="rounded-md bg-muted/50 p-3">
          <p className="text-lg font-bold">{totalH}h</p>
          <p className="text-xs text-muted-foreground">Study</p>
        </div>
        <div className="rounded-md bg-muted/50 p-3">
          <p className="text-lg font-bold">{subjects.length}</p>
          <p className="text-xs text-muted-foreground">Subjects</p>
        </div>
        <div className="rounded-md bg-muted/50 p-3">
          <p className="text-lg font-bold">{fmtDur(breakMin)}</p>
          <p className="text-xs text-muted-foreground">Rest &amp; Meals</p>
        </div>
      </div>

      <div className="space-y-1.5">
        {[...study, ...breaks]
          .sort((a, b) => a.startMinute - b.startMinute)
          .map((s, i) => (
            <div key={i} className="flex items-center gap-3 rounded-md border px-3 py-2 text-sm">
              <span
                className="h-3 w-3 shrink-0 rounded-full"
                style={{ backgroundColor: s.color || "#10B981" }}
              />
              <span className="w-24 shrink-0 tabular-nums text-muted-foreground text-xs">
                {formatClock(s.startMinute)}–{formatClock(s.endMinute)}
              </span>
              <span className="min-w-0 flex-1 truncate font-medium">
                {s.subjectName}
                {s.note ? <span className="text-xs text-muted-foreground"> — {s.note}</span> : null}
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">{s.type}</span>
            </div>
          ))}
      </div>
    </div>
  );
}

export default function AITimetablePage() {
  const { showToast } = useToast();
  const [loadTimetables, setLoadTimetables] = useState<Timetable[]>([]);
  const [active, setActive] = useState<Timetable | null>(null);
  const [loadingList, setLoadingList] = useState(true);

  const SAVE_KEY = "bp_ai_timetable_active";

  // Persist the currently-viewed plan so it survives tab switches / page reloads.
  // This matters most for "tmp-" plans that exist only in-memory (not server-saved).
  useEffect(() => {
    if (active) {
      try {
        localStorage.setItem(SAVE_KEY, JSON.stringify(active));
      } catch (e) {
        console.error(e);
      }
    }
  }, [active]);

  useEffect(() => {
    // Restore the last-viewed plan immediately so the timetable never flashes blank.
    try {
      const saved = localStorage.getItem(SAVE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as Timetable;
        if (parsed && parsed.slots) setActive(parsed);
      }
    } catch (e) {
      console.error(e);
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [description, setDescription] = useState("");
  const [mode, setMode] = useState<"weekly" | "full_day">("weekly");
  const [startTime, setStartTime] = useState("05:00");
  const [bedtime, setBedtime] = useState("22:30");
  const [napTime, setNapTime] = useState("14:00");
  const [napEnd, setNapEnd] = useState("15:00");
  const [generating, setGenerating] = useState(false);

  const [view, setView] = useState<"lesson" | "graph">("lesson");
  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);

  async function load() {
    setLoadingList(true);
    try {
      const res = await fetch("/api/generate-timetable");
      if (res.ok) {
        const data = await res.json();
        const list = data.timetables || [];
        setLoadTimetables(list);
        if (!active) {
          // Prefer the plan the user was last viewing (kept in localStorage).
          let saved: Timetable | null = null;
          try {
            const raw = localStorage.getItem(SAVE_KEY);
            if (raw) saved = JSON.parse(raw);
          } catch (_) {}
          const restored =
            (saved && saved.slots && list.find((t: Timetable) => t.id === saved.id)) ||
            saved;
          setActive(restored || list[0] || null);
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingList(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function generate() {
    if (!description.trim()) {
      showToast("Write a little about your routine first.", "error");
      return;
    }
    setGenerating(true);
    try {
      const body = {
        title: mode === "full_day" ? "My Full Day Plan" : "My AI Timetable",
        description,
        weeklyHours: 28,
        examDate: undefined,
        weakSubjects: [],
        priorities: [],
        timeSlots: [],
        techniques: [],
        mode,
        startTime,
        bedtime,
        napTime,
        napEnd,
      };
      const res = await fetch("/api/generate-timetable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.ok && data.timetable) {
        setActive(data.timetable);
        showToast("Timetable generated! Your AI study plan is ready.", "success");
        load();
      } else {
        showToast(String(data.error || "Please try again."), "error");
      }
    } catch (e) {
      showToast("Could not generate timetable.", "error");
    } finally {
      setGenerating(false);
    }
  }

  async function removeTimetable(id: string) {
    try {
      const res = await fetch("/api/generate-timetable?id=" + id, { method: "DELETE" });
      if (res.ok) {
        if (active?.id === id) {
          setActive(null);
          try {
            localStorage.removeItem(SAVE_KEY);
          } catch (_) {}
        }
        load();
        showToast("Timetable deleted.", "success");
      }
    } catch (e) {
      showToast("Could not delete.", "error");
    }
  }

  // ---- derived charts ----
  const subjectAllocation = useMemo(() => {
    const map = new Map<string, number>();
    (active?.slots || [])
      .filter((s) => s.type !== "Break" && s.type !== "Nap" && s.type !== "Tea")
      .forEach((s) => {
        map.set(s.subjectName, (map.get(s.subjectName) || 0) + (s.endMinute - s.startMinute));
      });
    return Array.from(map.entries()).map(([name, mins]) => ({
      name,
      hours: Math.round((mins / 60) * 10) / 10,
    }));
  }, [active]);

  // Balance between Study, Rest/Nap, and Meal/Tea breaks (whole plan)
  const balanceBreakdown = useMemo(() => {
    let study = 0,
      rest = 0,
      meals = 0;
    (active?.slots || []).forEach((s) => {
      const mins = s.endMinute - s.startMinute;
      if (s.type === "Nap") rest += mins;
      else if (s.type === "Break" || s.type === "Tea") meals += mins;
      else study += mins;
    });
    const h = (mins: number) => Math.round((mins / 60) * 10) / 10;
    return [
      { name: "Study", value: h(study), color: "#10B981" },
      { name: "Rest/Nap", value: h(rest), color: "#8B5CF6" },
      { name: "Meals/Tea", value: h(meals), color: "#F59E0B" },
    ].filter((d) => d.value > 0);
  }, [active]);

  const dailyIntensity = useMemo(() => {
    const map = new Map<number, number>();
    (active?.slots || []).forEach((s) => {
      map.set(s.dayOfWeek, (map.get(s.dayOfWeek) || 0) + (s.endMinute - s.startMinute));
    });
    return DAY_NAMES.map((name, i) => ({
      day: name.slice(0, 3),
      hours: Math.round(((map.get(i) || 0) / 60) * 10) / 10,
    }));
  }, [active]);

  const typeBreakdown = useMemo(() => {
    const map = new Map<string, number>();
    (active?.slots || []).forEach((s) => {
      map.set(s.type, (map.get(s.type) || 0) + (s.endMinute - s.startMinute));
    });
    return Array.from(map.entries()).map(([name, mins]) => ({
      name,
      hours: Math.round((mins / 60) * 10) / 10,
    }));
  }, [active]);

  function daysFor(offset: number): number[] {
    const today = new Date();
    const startDow = (today.getDay() + 6) % 7; // 0=Monday
    return Array.from({ length: 7 }, (_, i) => {
      const diff = (i - startDow) + offset * 7;
      const d = new Date(today);
      d.setDate(today.getDate() + diff);
      return d.getDate();
    });
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <PageHeader
        title="AI Study Timetable"
        description="Describe your routine and let AI build a balanced, visual weekly planner."
      />

      <div className="grid gap-6 lg:grid-cols-2 mb-6">
        {/* Input form */}
        <Card className="p-5">
          <CardHeader className="px-0 pt-0">
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" /> Generate My Timetable
            </CardTitle>
          </CardHeader>
          <CardContent className="px-0 space-y-4">
            {/* Mode selector */}
            <div>
              <label className="text-xs text-muted-foreground">Plan Type</label>
              <div className="mt-1 grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant={mode === "weekly" ? "default" : "outline"}
                  onClick={() => setMode("weekly")}
                  className="gap-1"
                >
                  <Calendar className="h-4 w-4" /> Weekly Plan
                </Button>
                <Button
                  type="button"
                  variant={mode === "full_day" ? "default" : "outline"}
                  onClick={() => setMode("full_day")}
                  className="gap-1"
                >
                  <Clock className="h-4 w-4" /> Full Day
                </Button>
              </div>
            </div>

            {/* Time boundaries */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground">Study Start Time</label>
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="mt-1 w-full rounded-md border bg-transparent px-2 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Bedtime / Sleep Time</label>
                <input
                  type="time"
                  value={bedtime}
                  onChange={(e) => setBedtime(e.target.value)}
                  className="mt-1 w-full rounded-md border bg-transparent px-2 py-1.5 text-sm"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground">Afternoon Nap Start</label>
                <input
                  type="time"
                  value={napTime}
                  onChange={(e) => setNapTime(e.target.value)}
                  className="mt-1 w-full rounded-md border bg-transparent px-2 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Nap / Rest End</label>
                <input
                  type="time"
                  value={napEnd}
                  onChange={(e) => setNapEnd(e.target.value)}
                  className="mt-1 w-full rounded-md border bg-transparent px-2 py-1.5 text-sm"
                />
              </div>
            </div>

            <div>
              <label className="text-xs text-muted-foreground">
                Describe subjects, priorities &amp; custom needs (Sinhala ok)
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={5}
                placeholder={'e.g. "I take Biology, Chemistry and Physics. Very weak in Organic Chemistry. Want more paper practice on weekends."'}
                className="mt-1 w-full rounded-md border bg-transparent p-3 text-sm outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>

            <div className="rounded-md bg-muted/40 p-3 text-[11px] text-muted-foreground">
              The AI builds study blocks only between your start time and bedtime, and
              automatically adds Breakfast, Lunch, Afternoon Nap, Tea &amp; Snack, and Dinner.
            </div>

            <Button className="w-full gap-2" onClick={generate} disabled={generating}>
              {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
              {generating ? "Generating…" : "Generate AI Timetable"}
            </Button>
          </CardContent>
        </Card>

        {/* Generated plan text + saved list */}
        <Card className="p-5">
          <CardHeader className="px-0 pt-0">
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-primary" /> My Plans
            </CardTitle>
          </CardHeader>
          <CardContent className="px-0 space-y-3">
            {loadingList ? (
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            ) : loadTimetables.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No timetable yet. Fill the form and generate your first AI plan.
              </p>
            ) : (
              loadTimetables.map((t) => (
                <div
                  key={t.id}
                  className={`rounded-md border p-3 cursor-pointer transition-colors ${
                    active?.id === t.id ? "border-primary bg-primary/5" : "hover:bg-accent"
                  }`}
                  onClick={() => setActive(t)}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate">{t.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {t.weeklyHours}h/week • {t.slots.length} sessions •{" "}
                        {new Date(t.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); removeTimetable(t.id); }}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))
            )}

            {active?.planText && (
              <div className="rounded-md bg-muted/40 p-3">
                <p className="text-xs font-medium text-muted-foreground mb-1">AI Plan Summary</p>
                <p className="text-sm">{active.planText}</p>
              </div>
            )}

            {active?.examDate && (
              <p className="text-xs text-muted-foreground">
                Target exam: <span className="font-medium text-foreground">{active.examDate}</span>
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Visualizer */}
      {active && (
        <>
          <div className="flex items-center justify-between mb-3">
            <div className="flex gap-1">
              <Button
                variant={view === "lesson" ? "default" : "ghost"}
                size="sm"
                onClick={() => setView("lesson")}
                className="gap-1"
              >
                <Calendar className="h-4 w-4" /> Week View
              </Button>
              <Button
                variant={view === "graph" ? "default" : "ghost"}
                size="sm"
                onClick={() => setView("graph")}
                className="gap-1"
              >
                <BarChart3 className="h-4 w-4" /> Analytics
              </Button>
            </div>
            {view === "lesson" && (
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" onClick={() => setWeekOffset((w) => w - 1)}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm text-muted-foreground">Week of {daysFor(weekOffset)[0]}</span>
                <Button variant="ghost" size="icon" onClick={() => setWeekOffset((w) => w + 1)}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>

          {view === "lesson" ? (
            <>
              <Card className="p-4 overflow-x-auto">
                <div className="grid grid-cols-7 min-w-[700px] gap-2">
                  {DAY_NAMES.map((day, di) => {
                    const daySlots = (active.slots || [])
                      .filter((s) => s.dayOfWeek === di)
                      .slice()
                      .sort((a, b) => a.startMinute - b.startMinute);
                    const totalMin = daySlots
                      .filter((s) => s.type !== "Break" && s.type !== "Nap" && s.type !== "Tea")
                      .reduce((sum, s) => sum + (s.endMinute - s.startMinute), 0);
                    const isSelected = selectedDay === di;
                    return (
                      <div
                        key={day}
                        onClick={() => setSelectedDay(isSelected ? null : di)}
                        className={`group space-y-2 rounded-lg p-1 transition-colors ${
                          isSelected ? "ring-2 ring-primary bg-primary/5" : "cursor-pointer hover:bg-accent"
                        }`}
                      >
                        <p className="text-center text-xs font-semibold text-muted-foreground">
                          {day.slice(0, 3)}
                          {totalMin > 0 && (
                            <span className="ml-1 text-[10px] font-normal">
                              • {Math.round((totalMin / 60) * 10) / 10}h
                            </span>
                          )}
                        </p>
                        <p className="text-center text-[10px] text-primary/70">tap for summary</p>
                        {daySlots.length === 0 ? (
                          <div className="rounded-md border border-dashed h-32 flex items-center justify-center text-[10px] text-muted-foreground">
                            Free
                          </div>
                        ) : (
                          daySlots.map((s, i) => (
                            <button
                              type="button"
                              key={i}
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedSlot(s);
                              }}
                              className="w-full rounded-md px-2 py-1.5 text-left text-xs text-white shadow-sm transition-transform hover:scale-[1.02]"
                              style={{ backgroundColor: s.color || "#10B981" }}
                            >
                              <p className="font-semibold">{s.subjectName}</p>
                              <p className="opacity-90">
                                {fmtClock(s.startMinute)}–{fmtClock(s.endMinute)}
                              </p>
                              <p className="opacity-80 mt-0.5 truncate">{s.type}{s.note ? " · " + s.note : ""}</p>
                            </button>
                          ))
                        )}
                      </div>
                    );
                  })}
                </div>
              </Card>

              {selectedDay !== null && (
                <Card className="mt-4 p-5">
                  <div className="flex items-center justify-between mb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-primary" /> {DAY_NAMES[selectedDay]} — Day Summary
                    </CardTitle>
                    <Button variant="ghost" size="sm" onClick={() => setSelectedDay(null)}>
                      Close
                    </Button>
                  </div>
                  <DayBreakdown slots={(active.slots || []).filter((s) => s.dayOfWeek === selectedDay)} formatClock={fmtClock} />
                </Card>
              )}
            </>
          ) : (
            <div className="grid gap-6 lg:grid-cols-2">
              <Card className="p-4">
                <CardTitle className="text-sm mb-3">Time Balance (Study vs Rest vs Meals)</CardTitle>
                {balanceBreakdown.length ? (
                  <>
                    <ResponsiveContainer width="100%" height={200}>
                      <PieChart>
                        <Pie
                          data={balanceBreakdown}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          outerRadius={70}
                          innerRadius={42}
                          paddingAngle={2}
                          label={(e) => `${e.name} ${e.value}h`}
                        >
                          {balanceBreakdown.map((d, i) => (
                            <Cell key={i} fill={d.color} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="flex justify-center gap-4 text-xs">
                      {balanceBreakdown.map((d) => (
                        <span key={d.name} className="inline-flex items-center gap-1">
                          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: d.color }} />
                          {d.name}
                        </span>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="py-8 text-center text-sm text-muted-foreground">Generate a plan to see the balance.</p>
                )}
              </Card>
              <Card className="p-4">
                <CardTitle className="text-sm mb-3">Subject Allocation (planned hours)</CardTitle>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={subjectAllocation}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                    <XAxis dataKey="name" fontSize={10} />
                    <YAxis fontSize={10} />
                    <Tooltip />
                    <Bar dataKey="hours" fill="#10B981" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </Card>
              <Card className="p-4">
                <CardTitle className="text-sm mb-3">Daily Study Intensity (hours)</CardTitle>
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={dailyIntensity}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                    <XAxis dataKey="day" fontSize={10} />
                    <YAxis fontSize={10} />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="hours" stroke="#8B5CF6" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </Card>
              <Card className="p-4 lg:col-span-2">
                <CardTitle className="text-sm mb-3">Study Type Breakdown (hours)</CardTitle>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={typeBreakdown}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                    <XAxis dataKey="name" fontSize={10} />
                    <YAxis fontSize={10} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="hours" fill="#06B6D4" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </Card>
            </div>
          )}
        </>
      )}

      {/* Click-to-summarize modal */}
      {selectedSlot && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setSelectedSlot(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-card p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <span
                  className="inline-block h-3 w-3 rounded-full align-middle"
                  style={{ backgroundColor: selectedSlot.color || "#10B981" }}
                />
                <h3 className="mt-1 text-lg font-bold">{selectedSlot.subjectName}</h3>
                <p className="text-xs text-muted-foreground">
                  {DAY_NAMES[selectedSlot.dayOfWeek]} • {fmtClock(selectedSlot.startMinute)}–{fmtClock(selectedSlot.endMinute)} • {fmtDur(selectedSlot.endMinute - selectedSlot.startMinute)}
                </p>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setSelectedSlot(null)}>
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="mt-4 rounded-md bg-muted/40 p-3 text-sm">
              <p className="font-medium">{slotSummary(selectedSlot)}</p>
            </div>

            {selectedSlot.type !== "Break" && selectedSlot.type !== "Nap" && selectedSlot.type !== "Tea" && (
              <a
                href={`/focus?task=${encodeURIComponent(selectedSlot.subjectName + (selectedSlot.note ? " - " + selectedSlot.note : ""))}`}
              >
                <Button className="mt-4 w-full gap-2">
                  <Play className="h-4 w-4" /> Start Session Timer
                </Button>
              </a>
            )}

            {selectedSlot.dayOfWeek !== undefined && (
              <Button variant="ghost" className="mt-2 w-full" onClick={() => { setSelectedSlot(null); setSelectedDay(selectedSlot.dayOfWeek); }}>
                View day summary
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}