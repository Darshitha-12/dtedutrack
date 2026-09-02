"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import {
  Target,
  Brain,
  CheckCircle2,
  XCircle,
  Clock,
  Sparkles,
  ListChecks,
  TrendingUp,
  AlertTriangle,
  Award,
  Plus,
  Users,
  ClipboardList,
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  BarChart,
  Bar,
  Cell,
} from "recharts";

interface AnalyticsData {
  stats: {
    quizzesCompleted: number;
    totalQuizzes: number;
    avgScore: number;
    totalQuestionsAnswered: number;
    overallAccuracy: number;
    totalMistakes: number;
    weakTopicsCount: number;
    totalStudyMinutes: number;
    aiSessions: number;
    conversations: number;
  };
  scoreTrend: { id: string; mode: string; score: number; correct: number; total: number; date: string }[];
  topicAccuracy: { topicTitle: string; attempted: number; correct: number; accuracy: number }[];
  studyByDay: { date: string; minutes: number }[];
  weakTopics: { topicId: string; topicTitle: string; topicSlug: string; accuracy: number; attempted: number }[];
  recentWrongCount: number;
  examMarks: {
    count: number;
    totalFullMarks: number;
    trend: { id: string; subject: string; name: string; fullMarks: number; date: string }[];
    subject: { subject: string; fullMarks: number; count: number }[];
  };
  community: {
    totalMinutes: number;
    activeUsers: number;
  };
}

const COLORS = ["#3b82f6", "#22c55e", "#f59e0b", "#8b5cf6", "#ef4444", "#06b6d4", "#ec4899", "#84cc16"];

const EXAM_COLORS: Record<string, string> = {
  bio: "#10B981",
  chem: "#06B6D4",
  phy: "#8B5CF6",
  agri: "#F59E0B",
  math: "#EF4444",
  ict: "#EC4899",
};

export default function AnalyticsPage() {
  const { data: session, status } = useSession();
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const { showToast } = useToast();
  const [workHours, setWorkHours] = useState("");
  const [workMins, setWorkMins] = useState("");
  const [workNote, setWorkNote] = useState("");
  const [savingWork, setSavingWork] = useState(false);
  const [workHistory, setWorkHistory] = useState<{ date: string; minutes: number }[]>([]);

  function fmtWork(mins: number) {
    if (mins < 60) return `${mins} min`;
    return `${Math.floor(mins / 60)}h ${mins % 60}m`;
  }

  useEffect(() => {
    (window as any).__bpWorkLog = async (r: { date?: string; minutes?: number; note?: string }) => {
      const minutes = Math.floor(Number(r?.minutes));
      if (!minutes || minutes < 1) {
        showToast("Enter minutes worked", "error");
        return;
      }
      setSavingWork(true);
      try {
        const res = await fetch("/api/work-log", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            date: r?.date || new Date().toISOString().slice(0, 10),
            minutes,
            note: r?.note || undefined,
          }),
        });
        if (!res.ok) throw new Error("Failed to save");
        setWorkHours("");
        setWorkMins("");
        setWorkNote("");
        showToast(`${fmtWork(minutes)} logged`, "success");
        await Promise.all([fetchAnalytics(), fetchWorkHistory()]);
      } catch {
        showToast("Failed to save work", "error");
      } finally {
        setSavingWork(false);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (status === "authenticated") {
      fetchAnalytics();
      fetchWorkHistory();
    } else if (status === "unauthenticated") {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  async function fetchAnalytics() {
    try {
      const res = await fetch("/api/analytics");
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to load analytics");
      }
      setData(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load analytics");
    } finally {
      setLoading(false);
    }
  }

  async function fetchWorkHistory() {
    try {
      const res = await fetch("/api/work-log");
      if (res.ok) {
        const body = await res.json();
        setWorkHistory(body.logs || []);
      }
    } catch {
      // ignore
    }
  }

  async function logWork(ev: React.FormEvent) {
    ev.preventDefault();
    const bridge = (window as any).BioPulseBridge;
    if (bridge && typeof bridge.openWorkLog === "function") {
      bridge.openWorkLog();
      return;
    }
    const hrs = Math.floor(Number(workHours)) || 0;
    const mins = Math.floor(Number(workMins)) || 0;
    const minutes = hrs * 60 + mins;
    if (minutes < 1) {
      showToast("Enter hours or minutes", "error");
      return;
    }
    setSavingWork(true);
    try {
      const res = await fetch("/api/work-log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: new Date().toISOString().slice(0, 10),
          minutes,
          note: workNote.trim() || undefined,
        }),
      });
      if (!res.ok) throw new Error("Failed to save");
      setWorkHours("");
      setWorkMins("");
      setWorkNote("");
      showToast(`${fmtWork(minutes)} logged`, "success");
      await Promise.all([fetchAnalytics(), fetchWorkHistory()]);
    } catch {
      showToast("Failed to save work", "error");
    } finally {
      setSavingWork(false);
    }
  }

  if (status === "loading" || (status === "authenticated" && loading)) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (status === "unauthenticated") {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Marks & Analytics"
          description="Track your performance with charts and insights"
        />
        <Card className="p-8 text-center">
          <p className="text-muted-foreground">Please sign in to view your analytics.</p>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Marks & Analytics"
          description="Track your performance with charts and insights"
        />
        <EmptyState
          icon="📊"
          title="Could not load analytics"
          description={error}
        />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Marks & Analytics"
          description="Track your performance with charts and insights"
        />
        <EmptyState
          icon="📊"
          title="No analytics yet"
          description="Complete a quiz to start tracking your performance."
        />
      </div>
    );
  }

  const { stats, scoreTrend, topicAccuracy, studyByDay, weakTopics, examMarks, community } = data;
  const noQuizData = stats.totalQuestionsAnswered === 0;
  const trendData = scoreTrend.map((s, i) => ({ ...s, label: `#${i + 1}` }));
  const examTrendData = examMarks.trend.map((m) => ({
    ...m,
    date: m.date.slice(5),
    label: m.name || m.subject,
    color: EXAM_COLORS[m.subject] || "#3b82f6",
  }));

  const statCards = [
    {
      label: "Quizzes Completed",
      value: noQuizData ? "0" : String(stats.quizzesCompleted),
      icon: ListChecks,
      color: "bg-blue-500/10 text-blue-500",
    },
    {
      label: "Average Score",
      value: noQuizData ? "—" : `${stats.avgScore}%`,
      icon: TrendingUp,
      color: "bg-green-500/10 text-green-500",
    },
    {
      label: "Exams Taken",
      value: String(examMarks.count),
      icon: Award,
      color: "bg-amber-500/10 text-amber-500",
    },
    {
      label: "Total Full Marks",
      value: examMarks.count > 0 ? String(examMarks.totalFullMarks) : "—",
      icon: Target,
      color: "bg-emerald-500/10 text-emerald-500",
    },
    {
      label: "Overall Accuracy",
      value: noQuizData ? "—" : `${stats.overallAccuracy}%`,
      icon: Target,
      color: "bg-violet-500/10 text-violet-500",
    },
    {
      label: "Questions Answered",
      value: String(stats.totalQuestionsAnswered),
      icon: Brain,
      color: "bg-cyan-500/10 text-cyan-500",
    },
    {
      label: "Mistakes to Review",
      value: String(stats.totalMistakes),
      icon: XCircle,
      color: "bg-red-500/10 text-red-500",
    },
    {
      label: "Study Time",
      value: `${Math.round(stats.totalStudyMinutes / 60)}h ${stats.totalStudyMinutes % 60}m`,
      icon: Clock,
      color: "bg-orange-500/10 text-orange-500",
    },
    {
      label: "AI Tutor Sessions",
      value: String(stats.aiSessions),
      icon: Sparkles,
      color: "bg-fuchsia-500/10 text-fuchsia-500",
    },
    {
      label: "Conversations",
      value: String(stats.conversations),
      icon: CheckCircle2,
      color: "bg-emerald-500/10 text-emerald-500",
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
          title="Marks & Analytics"
          description="Track your performance with charts and insights"
        />

      {/* Daily Work Log + Community */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-primary" />
            <CardTitle className="text-base">Daily Work Log</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={logWork} className="flex flex-wrap items-end gap-3 mb-4">
            <div className="flex items-center gap-1 flex-1 min-w-[120px]">
              <Input
                type="number"
                min={0}
                max={24}
                placeholder="0"
                value={workHours}
                onChange={(e) => setWorkHours(e.target.value)}
                className="flex-1"
              />
              <span className="text-sm text-muted-foreground mb-2">hrs</span>
              <Input
                type="number"
                min={0}
                max={59}
                placeholder="45"
                value={workMins}
                onChange={(e) => setWorkMins(e.target.value)}
                className="flex-1"
              />
              <span className="text-sm text-muted-foreground mb-2">min</span>
            </div>
            <div className="flex-1 min-w-[180px]">
              <Input
                placeholder="Note (optional)"
                value={workNote}
                onChange={(e) => setWorkNote(e.target.value)}
              />
            </div>
            <Button type="submit" disabled={savingWork} className="gap-2">
              <Plus className="h-4 w-4" />
              {savingWork ? "Saving..." : "Log Work"}
            </Button>
          </form>

          {community && community.totalMinutes > 0 && (
            <div className="flex items-center gap-3 rounded-md bg-primary/10 p-3 mb-4 text-primary">
              <Users className="h-5 w-5" />
              <p className="text-sm">
                <span className="font-semibold">
                  {fmtWork(community.totalMinutes)}
                </span>{" "}
                logged by the community • {community.activeUsers} students
              </p>
            </div>
          )}

          {workHistory.length > 0 ? (
            <div className="space-y-1.5">
              {workHistory.slice(0, 10).map((w) => (
                <div
                  key={w.date}
                  className="flex items-center justify-between rounded-md bg-muted/40 px-3 py-2 text-sm"
                >
                  <span>{w.date}</span>
                  <span className="font-medium">{fmtWork(w.minutes)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No work logged yet. Add your daily minutes above.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Daily Work Time Chart */}
      {workHistory.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary" />
              <CardTitle className="text-base">Daily Work Time</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-3 mb-5">
              <div className="rounded-lg bg-primary/10 p-3 text-center">
                <p className="text-2xl font-bold">{fmtWork(workHistory[0]?.minutes ?? 0)}</p>
                <p className="text-xs text-muted-foreground">Today</p>
              </div>
              <div className="rounded-lg bg-green-500/10 p-3 text-center">
                <p className="text-2xl font-bold">
                  {fmtWork(workHistory.slice(0, 7).reduce((s, w) => s + w.minutes, 0))}
                </p>
                <p className="text-xs text-muted-foreground">This Week</p>
              </div>
              <div className="rounded-lg bg-blue-500/10 p-3 text-center">
                <p className="text-2xl font-bold">{fmtWork(data?.community?.totalMinutes ?? 0)}</p>
                <p className="text-xs text-muted-foreground">Community</p>
              </div>
            </div>
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={workHistory
                    .slice(0, 7)
                    .reverse()
                    .map((w) => ({
                      day: new Date(w.date + "T00:00:00").toLocaleDateString("en", { weekday: "short" }),
                      min: w.minutes,
                      hrs: +(w.minutes / 60).toFixed(1),
                    }))}
                  margin={{ top: 5, right: 10, left: -10, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="day" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
                  <YAxis
                    tick={{ fontSize: 12 }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => `${v}h`}
                  />
                  <Tooltip
                    formatter={(v: number) => [`${Math.floor(v / 60)}h ${v % 60}m`, "Worked"]}
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                      fontSize: "13px",
                    }}
                  />
                  <Bar dataKey="min" radius={[6, 6, 0, 0]} maxBarSize={48}>
                    {workHistory
                      .slice(0, 7)
                      .reverse()
                      .map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} fillOpacity={0.85} />
                      ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {statCards.map((s) => (
          <Card key={s.label}>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${s.color}`}>
                  <s.icon className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-xl font-bold truncate">{s.value}</p>
                  <p className="text-xs text-muted-foreground truncate">{s.label}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Weak topics alert */}
      {weakTopics.length > 0 && (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              <h3 className="font-semibold">Weak topics to review</h3>
            </div>
            <div className="flex flex-wrap gap-2">
              {weakTopics.map((w) => (
                <Link key={w.topicId} href={`/practice`}>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-700">
                    {w.topicTitle}
                    <span className="text-amber-500">{Math.round(w.accuracy * 100)}%</span>
                  </span>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Score trend */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Score Trend</CardTitle>
        </CardHeader>
        <CardContent>
          {trendData.length === 0 ? (
            <EmptyState
              icon="📈"
              title="No completed quizzes yet"
              description="Complete a quiz to see your score trend over time."
            />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={trendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="scoreGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="label" fontSize={12} />
                <YAxis domain={[0, 100]} fontSize={12} />
                <Tooltip
                  formatter={(v: number) => [`${v}%`, "Score"]}
                  labelFormatter={(l) => `Quiz ${l}`}
                />
                <Area type="monotone" dataKey="score" stroke="#3b82f6" strokeWidth={2} fill="url(#scoreGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Exam marks */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Full Marks by Exam</CardTitle>
        </CardHeader>
        <CardContent>
          {examTrendData.length === 0 ? (
            <EmptyState
              icon="📝"
              title="No exam marks yet"
              description="Add exam marks to see them here."
            />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={examTrendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="date" fontSize={12} />
                <YAxis fontSize={12} />
                <Tooltip
                  formatter={(v: number) => [`${v}`, "Full Marks"]}
                  labelFormatter={(l) => {
                    const row = examTrendData.find((r) => r.date === l);
                    return row ? `${row.label} (${row.subject})` : l;
                  }}
                />
                <Bar dataKey="fullMarks" radius={[4, 4, 0, 0]}>
                  {examTrendData.map((m) => (
                    <Cell key={m.id} fill={m.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Full marks by subject */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Full Marks by Subject</CardTitle>
        </CardHeader>
        <CardContent>
          {examMarks.subject.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              Add exam marks to see per-subject totals.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={examMarks.subject} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="subject" fontSize={12} />
                <YAxis fontSize={12} />
                <Tooltip
                  formatter={(v: number) => [`${v}`, "Full Marks"]}
                  labelFormatter={(l) => {
                    const row = examMarks.subject.find((r) => r.subject === l);
                    return row ? `${l} (${row.count} exam${row.count > 1 ? "s" : ""})` : l;
                  }}
                />
                <Bar dataKey="fullMarks" radius={[4, 4, 0, 0]}>
                  {examMarks.subject.map((s) => (
                    <Cell key={s.subject} fill={EXAM_COLORS[s.subject] || "#3b82f6"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Topic accuracy */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Accuracy by Topic</CardTitle>
          </CardHeader>
          <CardContent>
            {topicAccuracy.length === 0 ? (
              <EmptyState
                icon="🎯"
                title="No attempts yet"
                description="Answer practice questions to see per-topic accuracy."
              />
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={topicAccuracy} margin={{ top: 10, right: 10, left: -20, bottom: 60 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                  <XAxis dataKey="topicTitle" fontSize={11} interval={0} angle={-35} textAnchor="end" height={70} />
                  <YAxis domain={[0, 100]} fontSize={12} />
                  <Tooltip formatter={(v: number) => [`${v}%`, "Accuracy"]} />
                  <Bar dataKey="accuracy" radius={[4, 4, 0, 0]}>
                    {topicAccuracy.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Recent study activity */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Study Activity (30 Days)</CardTitle>
          </CardHeader>
          <CardContent>
            {studyByDay.every((d) => d.minutes === 0) ? (
              <EmptyState
                icon="⏱️"
                title="No study time logged"
                description="Track focused study sessions to see your activity here."
              />
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={studyByDay} margin={{ top: 10, right: 10, left: -30, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                  <XAxis dataKey="date" fontSize={9} tickFormatter={(d: string) => d.slice(5)} />
                  <YAxis fontSize={12} />
                  <Tooltip formatter={(v: number) => [`${v}m`, "Minutes"]} labelFormatter={(d) => d} />
                  <Bar dataKey="minutes" fill="#06b6d4" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* CTA */}
      {noQuizData && (
        <Card className="p-6 text-center">
          <h3 className="text-lg font-semibold mb-2">Start tracking your progress</h3>
          <p className="text-muted-foreground mb-4">
            Take a practice quiz to unlock your analytics dashboard.
          </p>
          <Link href="/practice">
            <Button>Take a Practice Quiz</Button>
          </Link>
        </Card>
      )}
    </div>
  );
}
