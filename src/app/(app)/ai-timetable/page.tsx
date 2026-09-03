"use client";

import { useState, useEffect, useMemo } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

interface SlotInput {
  dayOfWeek: number;
  start: string;
  end: string;
}

function toMin(t: string): number {
  const p = t.split(":").map((n) => parseInt(n, 10));
  const h = isNaN(p[0]) ? 0 : p[0];
  const m = p.length > 1 && !isNaN(p[1]) ? p[1] : 0;
  return h * 60 + m;
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

export default function AITimetablePage() {
  const { showToast } = useToast();
  const [loadTimetables, setLoadTimetables] = useState<Timetable[]>([]);
  const [active, setActive] = useState<Timetable | null>(null);
  const [loadingList, setLoadingList] = useState(true);

  // Form state
  const [weeklyHours, setWeeklyHours] = useState(30);
  const [examDate, setExamDate] = useState("");
  const [weakSubjects, setWeakSubjects] = useState("");
  const [priorities, setPriorities] = useState("");
  const [timeSlots, setTimeSlots] = useState<SlotInput[]>([
    { dayOfWeek: 0, start: "05:00", end: "07:00" },
  ]);
  const [techniques, setTechniques] = useState("");
  const [generating, setGenerating] = useState(false);

  const [view, setView] = useState<"lesson" | "graph">("lesson");
  const [weekOffset, setWeekOffset] = useState(0);

  async function load() {
    setLoadingList(true);
    try {
      const res = await fetch("/api/generate-timetable");
      if (res.ok) {
        const data = await res.json();
        const list = data.timetables || [];
        setLoadTimetables(list);
        if (!active && list.length > 0) setActive(list[0]);
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
    setGenerating(true);
    try {
      const body = {
        title: "My AI Timetable",
        weeklyHours,
        examDate: examDate || undefined,
        weakSubjects: weakSubjects.split(",").map((s) => s.trim()).filter(Boolean),
        priorities: priorities.split(",").map((s) => s.trim()).filter(Boolean),
        timeSlots,
        techniques: techniques.split(",").map((s) => s.trim()).filter(Boolean),
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
        if (active?.id === id) setActive(null);
        load();
        showToast("Timetable deleted.", "success");
      }
    } catch (e) {
      showToast("Could not delete.", "error");
    }
  }

  function addSlot() {
    setTimeSlots((s) => [...s, { dayOfWeek: 0, start: "17:00", end: "19:00" }]);
  }

  // ---- derived charts ----
  const subjectAllocation = useMemo(() => {
    const map = new Map<string, number>();
    (active?.slots || []).forEach((s) => {
      map.set(s.subjectName, (map.get(s.subjectName) || 0) + (s.endMinute - s.startMinute));
    });
    return Array.from(map.entries()).map(([name, mins]) => ({
      name,
      hours: Math.round((mins / 60) * 10) / 10,
    }));
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
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground">Weekly study hours</label>
                <Input
                  type="number"
                  min={1}
                  max={168}
                  value={weeklyHours}
                  onChange={(e) => setWeeklyHours(Number(e.target.value) || 0)}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">A/L exam date</label>
                <Input type="date" value={examDate} onChange={(e) => setExamDate(e.target.value)} />
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">
                Weak subjects / priority topics (comma separated)
              </label>
              <Input
                placeholder="Biology Theory, Organic Chemistry"
                value={weakSubjects}
                onChange={(e) => setWeakSubjects(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Preferred techniques (comma separated)</label>
              <Input
                placeholder="Pomodoro 25/5, Active Recall"
                value={techniques}
                onChange={(e) => setTechniques(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Preferred time slots</label>
              <div className="space-y-2">
                {timeSlots.map((slot, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <select
                      className="h-9 rounded-md border bg-transparent px-2 text-sm"
                      value={slot.dayOfWeek}
                      onChange={(e) =>
                        setTimeSlots((s) =>
                          s.map((x, j) => (j === i ? { ...x, dayOfWeek: Number(e.target.value) } : x)),
                        )
                      }
                    >
                      {DAY_NAMES.map((d, di) => (
                        <option key={d} value={di} className="bg-background">
                          {d.slice(0, 3)}
                        </option>
                      ))}
                    </select>
                    <Input
                      type="time"
                      value={slot.start}
                      onChange={(e) =>
                        setTimeSlots((s) => s.map((x, j) => (j === i ? { ...x, start: e.target.value } : x)))
                      }
                    />
                    <Input
                      type="time"
                      value={slot.end}
                      onChange={(e) =>
                        setTimeSlots((s) => s.map((x, j) => (j === i ? { ...x, end: e.target.value } : x)))
                      }
                    />
                    <Button variant="ghost" size="icon" onClick={() => setTimeSlots((s) => s.filter((_, j) => j !== i))}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={addSlot}>
                  + Add slot
                </Button>
              </div>
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
            <Card className="p-4 overflow-x-auto">
              <div className="grid grid-cols-7 min-w-[700px] gap-2">
                {DAY_NAMES.map((day, di) => {
                  const daySlots = (active.slots || [])
                    .filter((s) => s.dayOfWeek === di)
                    .slice()
                    .sort((a, b) => a.startMinute - b.startMinute);
                  return (
                    <div key={day} className="space-y-2">
                      <p className="text-center text-xs font-semibold text-muted-foreground">{day.slice(0, 3)}</p>
                      {daySlots.length === 0 ? (
                        <div className="rounded-md border border-dashed h-32 flex items-center justify-center text-[10px] text-muted-foreground">
                          Free
                        </div>
                      ) : (
                        daySlots.map((s, i) => (
                          <div
                            key={i}
                            className="rounded-md px-2 py-1.5 text-xs text-white shadow-sm"
                            style={{ backgroundColor: s.color || "#10B981" }}
                          >
                            <p className="font-semibold">{s.subjectName}</p>
                            <p className="opacity-90">
                              {fmtClock(s.startMinute)}–{fmtClock(s.endMinute)}
                            </p>
                            <p className="opacity-80 mt-0.5 truncate">{s.type}{s.note ? " · " + s.note : ""}</p>
                          </div>
                        ))
                      )}
                    </div>
                  );
                })}
              </div>
            </Card>
          ) : (
            <div className="grid gap-6 lg:grid-cols-2">
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
    </div>
  );
}