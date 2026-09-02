"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { useToast } from "@/components/ui/toast";
import { Input } from "@/components/ui/input";import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Bell,
  Clock,
  Flame,
  BookOpen,
  Play,
  AlarmClock,
  Timer,
  AlertTriangle,
  Loader2,
  ArrowRight,
  User,
  Award,
  Target,
  TrendingUp,
  Brain,
  Users,
  Plus,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { SUBJECT_LIST } from "@/types/subject";

interface ProfileData {
  name: string;
  email: string;
  onboarded: boolean;
  dailyTargetHours: number;
  weeklyTargetHours: number;
  examYear: string;
  currentLevel: string;
}

interface DashboardStats {
  activeAlarms: number;
  weeklyHours: number;
  dayStreak: number;
  topicsCovered: number;
  studyMinutes: number;
  weeklyMinutes: number;
  communityMinutes: number;
  communityActiveUsers: number;
}

interface Mark {
  id: string;
  subjectId: string;
  total: number;
  examDate: string;
  name: string;
}

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [stats, setStats] = useState<DashboardStats>({
    activeAlarms: 0,
    weeklyHours: 0,
    dayStreak: 0,
    topicsCovered: 0,
    studyMinutes: 0,
    weeklyMinutes: 0,
    communityMinutes: 0,
    communityActiveUsers: 0,
  });
  const [marks, setMarks] = useState<Mark[]>([]);
  const [studyWeek, setStudyWeek] = useState<{ date: string; minutes: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [authTimeout, setAuthTimeout] = useState(false);
  const { showToast } = useToast();
  const [workMinutes, setWorkMinutes] = useState("");
  const [savingWork, setSavingWork] = useState(false);

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
        showToast(`${minutes} min logged 🎉`, "success");
        await fetchAnalytics();
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
      fetchProfile();
      fetchStudyStats();
      fetchAlarms();
      fetchExamMarks();
      fetchAnalytics();
    } else if (status === "unauthenticated") {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setAuthTimeout(true);
      fetchProfile();
      fetchStudyStats();
      fetchAlarms();
      fetchExamMarks();
      fetchAnalytics();
    }, 8000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function fetchProfile() {
    try {
      const res = await fetch("/api/profile");
      if (res.ok) {
        const data = await res.json();
        setProfile({
          name: data.name || "",
          email: data.email || "",
          onboarded: data.onboarded || false,
          dailyTargetHours: data.dailyTargetHours || 4,
          weeklyTargetHours: data.weeklyTargetHours || 28,
          examYear: data.examYear || "",
          currentLevel: data.currentLevel || "",
        });
      }
    } catch (error) {
      console.error("Failed to fetch profile:", error);
    } finally {
      setLoading(false);
    }
  }

  async function fetchStudyStats() {
    try {
      const res = await fetch("/api/content/progress");
      if (res.ok) {
        const data = await res.json();
        const records: Array<{ status: string; completionPercent: number }> =
          data.progress || [];
        const covered = records.filter(
          (r) => r.status !== "NOT_STARTED" || r.completionPercent > 0,
        ).length;
        setStats((prev) => ({ ...prev, topicsCovered: covered }));
      }
    } catch (error) {
      console.error("Failed to fetch study stats:", error);
    }
  }

  async function fetchAlarms() {
    try {
      const raw = localStorage.getItem("biopulse_alarms_v1");
      if (!raw) return;
      const parsed = JSON.parse(raw);
      const list: Array<{ enabled?: boolean }> = parsed.alarms || [];
      setStats((prev) => ({
        ...prev,
        activeAlarms: list.filter((a) => a.enabled !== false).length,
      }));
    } catch (error) {
      console.error("Failed to read alarms:", error);
    }
  }

  async function fetchExamMarks() {
    try {
      const res = await fetch("/api/exam-marks");
      if (res.ok) {
        const body = await res.json();
        setMarks(body.marks || []);
      }
    } catch (error) {
      console.error("Failed to fetch exam marks:", error);
    }
  }

  async function fetchAnalytics() {
    try {
      const res = await fetch("/api/analytics");
      if (res.ok) {
        const body = await res.json();
        const study = body.studyByDay || [];
        const last7 = study.slice(-7);
        const weekly = last7.reduce((s: number, d: { minutes: number }) => s + d.minutes, 0);
        const activeDays = study.filter((d: { minutes: number }) => d.minutes > 0).length;
        const totalMinutes = body.stats?.totalStudyMinutes || 0;
        setStats((prev) => ({
          ...prev,
          weeklyHours: Math.round((weekly / 60) * 10) / 10,
          dayStreak: activeDays,
          studyMinutes: totalMinutes,
          weeklyMinutes: weekly,
        }));
        setStudyWeek(last7);
        const community = body.community;
        if (community) {
          setStats((prev) => ({
            ...prev,
            communityMinutes: community.totalMinutes || 0,
            communityActiveUsers: community.activeUsers || 0,
          }));
        }
      }
    } catch (error) {
      console.error("Failed to fetch analytics:", error);
    }
  }

  function getDisplayName(): string {
    if (profile?.name) return profile.name.split(" ")[0];
    if (session?.user?.name) return session.user.name.split(" ")[0];
    if (session?.user?.email) return session.user.email.split("@")[0];
    return "Student";
  }

  async function logWork(ev: React.FormEvent) {
    ev.preventDefault();
    const bridge = (window as any).BioPulseBridge;
    if (bridge && typeof bridge.openWorkLog === "function") {
      bridge.openWorkLog();
      return;
    }
    const minutes = Math.floor(Number(workMinutes));
    if (!minutes || minutes < 1) {
      showToast("Enter minutes worked", "error");
      return;
    }
    setSavingWork(true);
    try {
      const res = await fetch("/api/work-log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: new Date().toISOString().slice(0, 10), minutes }),
      });
      if (!res.ok) throw new Error("Failed to save");
      setWorkMinutes("");
      showToast(`${minutes} min logged 🎉`, "success");
      await fetchAnalytics();
    } catch {
      showToast("Failed to save work", "error");
    } finally {
      setSavingWork(false);
    }
  }

  function getProfileCompleteness(): number {
    if (!profile) return 0;
    let completeness = 0;
    const fields = [
      profile.name,
      profile.email,
      profile.examYear,
      profile.currentLevel,
      profile.dailyTargetHours > 0,
    ];
    fields.forEach((field) => {
      if (field) completeness += 20;
    });
    return completeness;
  }

  if (status === "loading" && !authTimeout) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (status === "unauthenticated" && !authTimeout) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-center min-h-[400px]">
          <p className="text-muted-foreground">Please sign in to view your dashboard.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (profile && !profile.onboarded) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Card className="max-w-2xl mx-auto p-8 text-center">
          <div className="flex justify-center mb-4">
            <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
              <User className="h-8 w-8 text-primary" />
            </div>
          </div>
          <h2 className="text-2xl font-bold mb-2">Welcome to BioPulse!</h2>
          <p className="text-muted-foreground mb-6">
            Let&apos;s set up your profile to personalize your study experience.
          </p>
          <Link href="/onboarding">
            <Button size="lg" className="gap-2">
              Get Started
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Welcome Banner */}
      <Card className="p-6 mb-6 bg-gradient-to-r from-primary/10 to-primary/5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Welcome back, {getDisplayName()}! 👋</h1>
            <p className="text-muted-foreground mt-1">
              {profile?.examYear
                ? `${profile.currentLevel} • Exam ${profile.examYear}`
                : "Ready to study?"}
            </p>
          </div>
          <div className="hidden md:flex items-center gap-3">
            <div className="text-right">
              <p className="text-sm font-medium">Profile Complete</p>
              <p className="text-2xl font-bold text-primary">{getProfileCompleteness()}%</p>
            </div>
            <div className="relative h-16 w-16">
              <svg className="h-16 w-16 -rotate-90" viewBox="0 0 64 64">
                <circle
                  cx="32"
                  cy="32"
                  r="28"
                  stroke="currentColor"
                  strokeWidth="4"
                  fill="none"
                  className="text-muted"
                />
                <circle
                  cx="32"
                  cy="32"
                  r="28"
                  stroke="currentColor"
                  strokeWidth="4"
                  fill="none"
                  strokeDasharray={`${(getProfileCompleteness() / 100) * 176} 176`}
                  className="text-primary"
                />
              </svg>
            </div>
          </div>
        </div>
      </Card>

      {/* Profile Incomplete Banner */}
      {getProfileCompleteness() < 100 && (
        <Card className="p-4 mb-6 border-yellow-500/50 bg-yellow-500/5">
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-yellow-500" />
            <div className="flex-1">
              <p className="text-sm font-medium">Complete your profile</p>
              <p className="text-xs text-muted-foreground">
                Add more details to get personalized study recommendations.
              </p>
            </div>
            <Link href="/profile">
              <Button variant="outline" size="sm">
                Complete Profile
              </Button>
            </Link>
          </div>
        </Card>
      )}

      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
              <Bell className="h-5 w-5 text-blue-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.activeAlarms}</p>
              <p className="text-xs text-muted-foreground">Active Alarms</p>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-green-500/10 flex items-center justify-center">
              <Clock className="h-5 w-5 text-green-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">
                {stats.weeklyHours > 0
                  ? `${stats.weeklyHours}h`
                  : `${Math.round(stats.weeklyMinutes)}m`}
              </p>
              <p className="text-xs text-muted-foreground">Study This Week</p>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-orange-500/10 flex items-center justify-center">
              <Flame className="h-5 w-5 text-orange-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.dayStreak}</p>
              <p className="text-xs text-muted-foreground">Day Streak</p>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-purple-500/10 flex items-center justify-center">
              <BookOpen className="h-5 w-5 text-purple-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.topicsCovered}</p>
              <p className="text-xs text-muted-foreground">Topics Covered</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Community Work Banner */}
      <Card className="p-4 mb-6 border-primary/30 bg-gradient-to-r from-primary/10 to-primary/5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Users className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium">Community Total Work</p>
              <p className="text-2xl font-bold">
                {stats.communityMinutes >= 60
                  ? `${Math.round((stats.communityMinutes / 60) * 10) / 10}h`
                  : `${stats.communityMinutes}m`}{" "}
                <span className="text-sm font-normal text-muted-foreground">
                  across {stats.communityActiveUsers} student{stats.communityActiveUsers === 1 ? "" : "s"}
                </span>
              </p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Log your daily work below to contribute to the community total.
          </p>
        </div>
      </Card>

      {/* Exam Marks + Study Activity */}
      <div className="grid gap-6 lg:grid-cols-2 mb-6">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Award className="h-4 w-4 text-amber-500" />
              <CardTitle className="text-base">Exam Marks</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {marks.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                No exam marks yet.{" "}
                <Link href="/exam-marks" className="text-primary underline">
                  Add your first mark
                </Link>
                .
              </p>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className="rounded-md bg-muted/50 p-3">
                    <p className="text-xl font-bold">{marks.length}</p>
                    <p className="text-xs text-muted-foreground">Exams</p>
                  </div>
                  <div className="rounded-md bg-muted/50 p-3">
                    <p className="text-xl font-bold">
                      {marks.reduce((s, m) => s + m.total, 0)}
                    </p>
                    <p className="text-xs text-muted-foreground">Full Marks</p>
                  </div>
                  <div className="rounded-md bg-muted/50 p-3">
                    <p className="text-xl font-bold">
                      {(() => {
                        let best = -1;
                        for (const s of SUBJECT_LIST) {
                          const t = marks
                            .filter((m) => m.subjectId === s.id)
                            .reduce((sum, m) => sum + m.total, 0);
                          if (t > best) best = t;
                        }
                        return best > -1 ? best : 0;
                      })()}
                    </p>
                    <p className="text-xs text-muted-foreground">Top Subject</p>
                  </div>
                </div>
                <Link href="/exam-marks">
                  <Button variant="outline" size="sm" className="w-full gap-2">
                    <TrendingUp className="h-4 w-4" /> View Exam Analytics
                  </Button>
                </Link>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Study Activity (7 Days)</CardTitle>
          </CardHeader>
          <CardContent>
            {studyWeek.length === 0 || studyWeek.every((d) => d.minutes === 0) ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                No study time logged this week.{" "}
                <Link href="/focus" className="text-primary underline">
                  Start a focus session
                </Link>{" "}
                to track it.
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={studyWeek} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                  <XAxis dataKey="date" fontSize={10} tickFormatter={(d: string) => d.slice(5)} />
                  <YAxis fontSize={10} />
                  <Tooltip
                    formatter={(v: number) => [`${v}m`, "Minutes"]}
                    labelFormatter={(d) => d}
                  />
                  <Bar dataKey="minutes" fill="#10B981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Daily Work Log */}
      <Card className="p-6 mb-6">
        <h2 className="text-lg font-semibold mb-1">Log Today&apos;s Work</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Add how many minutes you worked today (study + extra). It shows on your analytics and the community total.
        </p>
        <form onSubmit={logWork} className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[160px]">
            <Input
              type="number"
              min={1}
              max={1440}
              placeholder="Minutes worked (e.g. 45)"
              value={workMinutes}
              onChange={(e) => setWorkMinutes(e.target.value)}
            />
          </div>
          <Button type="submit" disabled={savingWork} className="gap-2">
            <Plus className="h-4 w-4" />
            {savingWork ? "Saving..." : "Log Work"}
          </Button>
        </form>
      </Card>

      {/* Quick Actions */}
      <Card className="p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4">Quick Actions</h2>
        <div className="flex flex-wrap gap-3">
          <Link href="/syllabus">
            <Button className="gap-2">
              <BookOpen className="h-4 w-4" />
              Study Biology
            </Button>
          </Link>
          <Link href="/ai-tutor">
            <Button variant="outline" className="gap-2">
              <Play className="h-4 w-4" />
              AI Tutor
            </Button>
          </Link>
          <Link href="/focus">
            <Button variant="outline" className="gap-2">
              <Timer className="h-4 w-4" />
              Start Focus
            </Button>
          </Link>
          <Link href="/alarms">
            <Button variant="outline" className="gap-2">
              <AlarmClock className="h-4 w-4" />
              View Alarms
            </Button>
          </Link>
        </div>
      </Card>
    </div>
  );
}