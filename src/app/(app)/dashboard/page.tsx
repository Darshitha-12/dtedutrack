"use client";

import { useState, useEffect, useMemo } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import {
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
  Award,
  TrendingUp,
  Users,
  Plus,
  Trophy,
  Crown,
  CalendarDays,
  Sparkles,
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
  examDate: string;
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

interface LeaderboardEntry {
  id: string;
  name: string;
  todayMinutes: number;
}

const DASH_CACHE = "bp_dashboard_cache_v1";

const EMPTY_STATS: DashboardStats = {
  activeAlarms: 0,
  weeklyHours: 0,
  dayStreak: 0,
  topicsCovered: 0,
  studyMinutes: 0,
  weeklyMinutes: 0,
  communityMinutes: 0,
  communityActiveUsers: 0,
};

/* Skeleton placeholder — mirrors real value dimensions to prevent shifts. */
function SkeletonText({ className }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-md bg-muted/60 ${className ?? "h-4 w-20"}`}
    />
  );
}

function SkeletonBox({ className }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-lg bg-muted/60 ${className ?? "h-10 w-10"}`}
    />
  );
}

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const [profile, setProfile] = useState<ProfileData | null>(() => {
    try {
      const raw = localStorage.getItem(DASH_CACHE);
      if (raw) {
        const c = JSON.parse(raw);
        if (c.profile) return c.profile;
      }
    } catch {}
    return null;
  });
  const [stats, setStats] = useState<DashboardStats>(() => {
    try {
      const raw = localStorage.getItem(DASH_CACHE);
      if (raw) {
        const c = JSON.parse(raw);
        if (c.stats) {
          return { ...EMPTY_STATS, ...c.stats };
        }
      }
    } catch {}
    return { ...EMPTY_STATS };
  });
  const [marks, setMarks] = useState<Mark[]>(() => {
    try {
      const raw = localStorage.getItem(DASH_CACHE);
      if (raw) {
        const c = JSON.parse(raw);
        if (c.marks) return c.marks;
      }
    } catch {}
    return [];
  });
  const [studyWeek, setStudyWeek] = useState<{ date: string; minutes: number }[]>(() => {
    try {
      const raw = localStorage.getItem(DASH_CACHE);
      if (raw) {
        const c = JSON.parse(raw);
        if (c.studyWeek) return c.studyWeek;
      }
    } catch {}
    return [];
  });
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>(() => {
    try {
      const raw = localStorage.getItem(DASH_CACHE);
      if (raw) {
        const c = JSON.parse(raw);
        if (c.leaderboard) return c.leaderboard;
      }
    } catch {}
    return [];
  });
  const [ready, setReady] = useState(false);
  const [now, setNow] = useState(() => new Date());

  function persistCache(patch?: {
    profile?: ProfileData | null;
    stats?: Partial<DashboardStats>;
    marks?: Mark[];
    studyWeek?: { date: string; minutes: number }[];
    leaderboard?: LeaderboardEntry[];
  }) {
    try {
      localStorage.setItem(DASH_CACHE, JSON.stringify({
        profile: patch?.profile !== undefined ? patch.profile : profile,
        stats: { ...stats, ...(patch?.stats ?? {}) },
        marks: patch?.marks !== undefined ? patch.marks : marks,
        studyWeek: patch?.studyWeek !== undefined ? patch.studyWeek : studyWeek,
        leaderboard: patch?.leaderboard !== undefined ? patch.leaderboard : leaderboard,
      }));
    } catch {}
  }

  function fmtWork(mins: number) {
    return `${Math.floor(mins / 60)}h ${mins % 60}m`;
  }

  useEffect(() => {
    if (status === "authenticated") {
      fetchProfile();
      fetchStudyStats();
      fetchAlarms();
      fetchExamMarks();
      fetchAnalytics();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  useEffect(() => {
    // First paint completes → mark ready so inner values replace skeletons in
    // place. The card structure is identical in both states, so nothing shifts.
    const raf = requestAnimationFrame(() => setReady(true));
    const timer = setTimeout(() => {
      fetchProfile();
      fetchStudyStats();
      fetchAlarms();
      fetchExamMarks();
      fetchAnalytics();
    }, 8000);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function onFocus() {
      fetchProfile();
      fetchStudyStats();
      fetchAlarms();
      fetchExamMarks();
      fetchAnalytics();
    }
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") onFocus();
    });
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", () => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function fetchProfile() {
    try {
      const res = await fetch("/api/profile");
      if (res.ok) {
        const data = await res.json();
        const nextProfile: ProfileData = {
          name: data.name || "",
          email: data.email || "",
          onboarded: data.onboarded || false,
          dailyTargetHours: data.dailyTargetHours || 4,
          weeklyTargetHours: data.weeklyTargetHours || 28,
          examYear: data.examYear || "",
          examDate: data.examDate || "",
          currentLevel: data.currentLevel || "",
        };
        setProfile(nextProfile);
        persistCache({ profile: nextProfile });
      }
    } catch (error) {
      console.error("Failed to fetch profile:", error);
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
        const nextStats: Partial<DashboardStats> = {
          weeklyHours: Math.round((weekly / 60) * 10) / 10,
          dayStreak: activeDays,
          studyMinutes: totalMinutes,
          weeklyMinutes: weekly,
        };
        setStats((prev) => ({ ...prev, ...nextStats }));
        setStudyWeek(last7);
        const community = body.community;
        const nextLeaderboard = community?.leaderboard;
        if (community) {
          setStats((prev) => ({
            ...prev,
            communityMinutes: community.totalMinutes || 0,
            communityActiveUsers: community.activeUsers || 0,
          }));
          if (Array.isArray(community.leaderboard)) {
            setLeaderboard(community.leaderboard);
          }
        }
        persistCache({
          stats: community
            ? {
                ...nextStats,
                communityMinutes: community.totalMinutes || 0,
                communityActiveUsers: community.activeUsers || 0,
              }
            : nextStats,
          studyWeek: last7,
          leaderboard: Array.isArray(nextLeaderboard) ? nextLeaderboard : undefined,
        });
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

  const examCountdown = useMemo(() => {
    const target = new Date(
      profile?.examDate && profile.examDate.trim() !== ""
        ? profile.examDate
        : "2027-08-16"
    );
    const diff = target.getTime() - now.getTime();
    if (diff <= 0) {
      return { months: 0, days: 0, hours: 0, minutes: 0, seconds: 0, expired: true, target };
    }
    const totalSeconds = Math.floor(diff / 1000);
    const totalDays = Math.floor(totalSeconds / 86400);
    const months = Math.floor(totalDays / 30);
    const days = totalDays % 30;
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return { months, days, hours, minutes, seconds, expired: false, target };
  }, [profile?.examDate, now]);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

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

  /* ---- Countdown segment boxes — always visible, fixed height/width. ---- */
  const cdSegments = [
    { label: "Months", value: examCountdown.months },
    { label: "Days", value: examCountdown.days },
    { label: "Hours", value: examCountdown.hours },
    { label: "Minutes", value: examCountdown.minutes },
    { label: "Seconds", value: examCountdown.seconds },
  ];

  const topSubjectTotal = marks.length
    ? SUBJECT_LIST.reduce((best, s) => {
        const t = marks
          .filter((m) => m.subjectId === s.id)
          .reduce((sum, m) => sum + m.total, 0);
        return t > best ? t : best;
      }, -1)
    : 0;

  const statCards = [
    {
      icon: <Bell className="h-5 w-5 text-blue-500" />,
      iconBg: "bg-blue-500/10",
      label: "Active Alarms",
      value: String(stats.activeAlarms),
    },
    {
      icon: <Clock className="h-5 w-5 text-green-500" />,
      iconBg: "bg-green-500/10",
      label: "Study This Week",
      value: fmtWork(stats.weeklyMinutes),
    },
    {
      icon: <Flame className="h-5 w-5 text-orange-500" />,
      iconBg: "bg-orange-500/10",
      label: "Day Streak",
      value: String(stats.dayStreak),
    },
    {
      icon: <BookOpen className="h-5 w-5 text-purple-500" />,
      iconBg: "bg-purple-500/10",
      label: "Topics Covered",
      value: String(stats.topicsCovered),
    },
  ];

  return (
    <div className="container mx-auto px-4 py-8 space-y-6">
      {/* 1. Welcome Header Card */}
      <Card className="p-6 bg-gradient-to-r from-primary/10 to-primary/5">
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold">
              {ready ? (
                `Welcome back, ${getDisplayName()}! 👋`
              ) : (
                <SkeletonText className="h-7 w-64" />
              )}
            </h1>
            <p className="text-muted-foreground mt-1">
              {ready ? (
                profile?.examYear
                  ? `${profile.currentLevel} • Exam ${profile.examYear}`
                  : "Ready to study?"
              ) : (
                <SkeletonText className="h-4 w-40 mt-1" />
              )}
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <div className="text-right">
              <p className="text-sm font-medium">Profile Complete</p>
              {ready ? (
                <p className="text-2xl font-bold text-primary">
                  {getProfileCompleteness()}%
                </p>
              ) : (
                <SkeletonText className="h-7 w-14 ml-auto mt-1" />
              )}
            </div>
            {ready ? (
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
            ) : (
              <SkeletonBox className="h-16 w-16 rounded-full" />
            )}
          </div>
        </div>
      </Card>

      {/* 2. Live Exam Countdown Card — fixed-height segments, always visible */}
      <Card
        className={`p-5 border ${
          examCountdown.expired
            ? "border-green-500/30 bg-gradient-to-r from-green-500/10 to-green-500/5"
            : examCountdown.days <= 30
              ? "border-red-500/30 bg-gradient-to-r from-red-500/10 to-red-500/5"
              : "border-amber-500/30 bg-gradient-to-r from-amber-500/10 to-amber-500/5"
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className={`h-12 w-12 rounded-xl flex items-center justify-center shrink-0 ${
                examCountdown.expired
                  ? "bg-green-500/15"
                  : examCountdown.days <= 30
                    ? "bg-red-500/15"
                    : "bg-amber-500/15"
              }`}
            >
              <Timer
                className={`h-6 w-6 ${
                  examCountdown.expired
                    ? "text-green-500"
                    : examCountdown.days <= 30
                      ? "text-red-500"
                      : "text-amber-500"
                }`}
              />
            </div>
            <div className="min-w-0">
              <p className="text-lg font-semibold">
                {ready ? (
                  examCountdown.expired ? "Exam Complete! 🎉" : "Live Exam Countdown"
                ) : (
                  <SkeletonText className="h-6 w-44" />
                )}
              </p>
              <p className="text-sm text-muted-foreground">
                {ready ? (
                  profile?.examYear
                    ? `${profile.currentLevel || "A/L"} Exam ${profile.examYear}`
                    : `Target: ${
                        profile?.examDate && profile.examDate.trim() !== ""
                          ? profile.examDate
                          : "August 16, 2027"
                      }`
                ) : (
                  <SkeletonText className="h-4 w-36 mt-1" />
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {cdSegments.map((s) => (
              <div
                key={s.label}
                className="w-16 rounded-md bg-muted/50 px-1 py-2 text-center"
              >
                {ready ? (
                  <p className="text-xl font-bold tabular-nums">{s.value}</p>
                ) : (
                  <SkeletonText className="h-6 w-10 mx-auto" />
                )}
                <p className="text-[10px] text-muted-foreground">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </Card>

      {/* 3. Study Planner Action Card */}
      <Card className="p-6 border-primary/30 bg-gradient-to-r from-primary/10 to-primary/5">
        <div className="flex flex-col sm:flex-row h-full gap-3 items-start sm:items-center justify-between">
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center min-w-0">
            <div className="h-12 w-12 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
              <CalendarDays className="h-6 w-6 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="text-lg font-semibold">Study Planner</p>
              <p className="text-sm text-muted-foreground">
                Plan your week, generate a smart A/L timetable, and track sessions.
              </p>
            </div>
          </div>
          <Link href="/planner" className="shrink-0">
            <Button className="gap-2">
              <CalendarDays className="h-4 w-4" /> Open Planner
            </Button>
          </Link>
        </div>
      </Card>

      {/* 3b. AI Study Timetable Card */}
      <Card className="p-6 border-purple-500/30 bg-gradient-to-r from-purple-500/10 to-purple-500/5">
        <div className="flex flex-col sm:flex-row h-full gap-3 items-start sm:items-center justify-between">
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center min-w-0">
            <div className="h-12 w-12 rounded-xl bg-purple-500/15 flex items-center justify-center shrink-0">
              <Sparkles className="h-6 w-6 text-purple-500" />
            </div>
            <div className="min-w-0">
              <p className="text-lg font-semibold">AI Study Planner</p>
              <p className="text-sm text-muted-foreground">
                Generate a smart personalized timetable with AI recommendations.
              </p>
            </div>
          </div>
          <Link href="/planner" className="shrink-0">
            <Button variant="outline" className="gap-2 border-purple-500/30 text-purple-600 hover:bg-purple-500/10">
              <Sparkles className="h-4 w-4" /> AI Timetable
            </Button>
          </Link>
        </div>
      </Card>

      {/* 4–7. Stat cards — fixed grid, fixed order, always rendered */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((sc) => (
          <Card key={sc.label} className="p-4 min-h-[4.5rem]">
            <div className="flex items-center gap-3">
              <div
                className={`h-10 w-10 rounded-lg flex items-center justify-center shrink-0 ${sc.iconBg}`}
              >
                {sc.icon}
              </div>
              <div className="min-w-0">
                {ready ? (
                  <p className="text-2xl font-bold tabular-nums truncate">
                    {sc.value}
                  </p>
                ) : (
                  <SkeletonText className="h-7 w-16" />
                )}
                <p className="text-xs text-muted-foreground">{sc.label}</p>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* 8. Community Total Work Card */}
      <Card className="p-4 border-primary/30 bg-gradient-to-r from-primary/10 to-primary/5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Users className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium">Community Total Work</p>
              {ready ? (
                <p className="text-2xl font-bold tabular-nums">
                  {fmtWork(stats.communityMinutes)}{" "}
                  <span className="text-sm font-normal text-muted-foreground">
                    across {stats.communityActiveUsers} student
                    {stats.communityActiveUsers === 1 ? "" : "s"}
                  </span>
                </p>
              ) : (
                <SkeletonText className="h-7 w-44 mt-1" />
              )}
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Log your daily work below to contribute to the community total.
          </p>
        </div>
      </Card>

      {/* Community Leaderboard */}
      <Card className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Trophy className="h-4 w-4 text-amber-500" />
          <h2 className="text-base font-semibold">Daily Work Leaderboard</h2>
        </div>
        {leaderboard.length > 0 ? (
          <div className="space-y-1.5">
            {leaderboard.map((entry, i) => {
              const isMe = session?.user?.id === entry.id;
              return (
                <div
                  key={entry.id}
                  className={`flex items-center justify-between gap-2 rounded-md px-3 py-2 text-sm ${
                    i === 0 ? "bg-amber-500/10" : "bg-muted/40"
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-5 shrink-0 text-center font-semibold text-muted-foreground">
                      {i === 0 ? <Crown className="h-4 w-4 inline text-amber-500" /> : i + 1}
                    </span>
                    <span className="truncate font-medium">{entry.name}</span>
                    {isMe && (
                      <span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">
                        You
                      </span>
                    )}
                  </div>
                  <span className="shrink-0 font-medium tabular-nums">
                    {fmtWork(entry.todayMinutes)}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No community work logged yet. Be the first!
          </p>
        )}
      </Card>

      {/* 9. Exam Marks Section Card — fixed stat boxes even when empty */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Award className="h-4 w-4 text-amber-500" />
              <CardTitle className="text-base">Exam Marks</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-3 text-center min-h-[5.5rem]">
              <div className="rounded-md bg-muted/50 p-3">
                {ready ? (
                  <p className="text-xl font-bold tabular-nums">{marks.length}</p>
                ) : (
                  <SkeletonText className="h-6 w-10 mx-auto" />
                )}
                <p className="text-xs text-muted-foreground">Exams</p>
              </div>
              <div className="rounded-md bg-muted/50 p-3">
                {ready ? (
                  <p className="text-xl font-bold tabular-nums">
                    {marks.reduce((s, m) => s + m.total, 0)}
                  </p>
                ) : (
                  <SkeletonText className="h-6 w-10 mx-auto" />
                )}
                <p className="text-xs text-muted-foreground">Full Marks</p>
              </div>
              <div className="rounded-md bg-muted/50 p-3">
                {ready ? (
                  <p className="text-xl font-bold tabular-nums">
                    {topSubjectTotal}
                  </p>
                ) : (
                  <SkeletonText className="h-6 w-10 mx-auto" />
                )}
                <p className="text-xs text-muted-foreground">Top Subject</p>
              </div>
            </div>
            {ready && marks.length === 0 && (
              <p className="py-2 text-center text-sm text-muted-foreground">
                No exam marks yet.{" "}
                <Link href="/exam-marks" className="text-primary underline">
                  Add your first mark
                </Link>
                .
              </p>
            )}
            <Link href="/exam-marks">
              <Button variant="outline" size="sm" className="w-full gap-2">
                <TrendingUp className="h-4 w-4" /> View Exam Analytics
              </Button>
            </Link>
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
      <Card className="p-6">
        <h2 className="text-lg font-semibold mb-1">Log Today&apos;s Work</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Track the time you worked today (study + extra). Shows on the community total.
        </p>
        <Link href="/work-log">
          <Button className="gap-2">
            <Plus className="h-4 w-4" />
            Go to Work Log
          </Button>
        </Link>
      </Card>

      {/* Quick Actions */}
      <Card className="p-6">
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