import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  getUserQuizzes,
  getTopicPerformances,
  getWeakTopics,
} from "@/features/questions/service";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = session.user.id;

    const last30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [quizzes, topicPerf, weakTopics, wrongSummaries, studySessions, aiUsage, conversations, examRecords, workLogs, communityWork] =
      await Promise.all([
        getUserQuizzes(userId),
        getTopicPerformances(userId),
        getWeakTopics(userId, 8),
        import("@/features/questions/service").then((m) => m.getWrongQuestionSummaries(userId, 20)),
        db.studySession.findMany({
          where: { userId },
          orderBy: { completedAt: "asc" },
        }),
        db.aIUsage.count({ where: { userId } }),
        db.conversation.count({ where: { userId } }),
        db.markRecord.findMany({ where: { userId }, orderBy: { examDate: "asc" } }),
        db.workLog.findMany({
          where: { userId, date: { gte: last30 } },
          orderBy: { date: "asc" },
        }),
        db.workLog.aggregate({ _sum: { minutes: true } }),
      ]);

    const communityMinutes = communityWork._sum.minutes ?? 0;
    const communityActiveUsers = await db.workLog
      .groupBy({ by: ["userId"], _count: { _all: true } })
      .then((rows) => rows.length);

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(todayStart);
    todayEnd.setDate(todayEnd.getDate() + 1);
    const [workRows, allUsers] = await Promise.all([
      db.workLog.groupBy({
        by: ["userId"],
        where: { date: { gte: todayStart, lt: todayEnd } },
        _sum: { minutes: true },
      }),
      db.user.findMany({
        where: { workLogs: { some: {} } },
        select: { id: true, name: true, email: true },
      }),
    ]);
    const todayMap = new Map(workRows.map((r) => [r.userId, r._sum.minutes ?? 0]));
    const leaderboard = allUsers
      .map((u) => ({
        id: u.id,
        name: u.name || u.email.split("@")[0],
        todayMinutes: todayMap.get(u.id) ?? 0,
      }))
      .sort((a, b) => b.todayMinutes - a.todayMinutes)
      .slice(0, 10);

    const completedQuizzes = quizzes.filter((q) => q.status === "COMPLETED" && q.total > 0);
    const totalQuestionsAnswered = topicPerf.reduce((s, p) => s + p.attempted, 0);
    const totalCorrect = topicPerf.reduce((s, p) => s + Math.round(p.accuracy * p.attempted), 0);
    const overallAccuracy =
      totalQuestionsAnswered > 0 ? Math.round((totalCorrect / totalQuestionsAnswered) * 100) : 0;
    const avgScore =
      completedQuizzes.length > 0
        ? Math.round(
            (completedQuizzes.reduce((s, q) => s + (q.score / q.total) * 100, 0) /
              completedQuizzes.length),
          )
        : 0;
    const totalMistakes = totalQuestionsAnswered - totalCorrect;
    const totalStudyMinutes = studySessions.reduce((s, x) => s + x.minutes, 0) + workLogs.reduce((s, x) => s + x.minutes, 0);

    const scoreTrend = completedQuizzes
      .slice(-10)
      .map((q) => ({
        id: q.id,
        mode: q.mode,
        score: Math.round((q.score / q.total) * 100),
        correct: q.score,
        total: q.total,
        date: q.completedAt || q.createdAt,
      }));

    const studyByDay: { date: string; minutes: number }[] = [];
    const dayMap = new Map<string, number>();
    for (let i = 29; i >= 0; i--) {
      const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
      dayMap.set(d.toISOString().slice(0, 10), 0);
    }
    for (const s of studySessions) {
      if (s.completedAt >= last30) {
        const key = s.completedAt.toISOString().slice(0, 10);
        if (dayMap.has(key)) dayMap.set(key, dayMap.get(key)! + s.minutes);
      }
    }
    for (const w of workLogs) {
      const key = w.date.toISOString().slice(0, 10);
      if (dayMap.has(key)) dayMap.set(key, dayMap.get(key)! + w.minutes);
    }
    for (const [date, minutes] of dayMap) {
      studyByDay.push({ date, minutes });
    }

    const topicAccuracy = topicPerf
      .filter((p) => p.attempted > 0)
      .sort((a, b) => b.attempted - a.attempted)
      .slice(0, 8)
      .map((p) => ({
        topicTitle: p.topicTitle,
        attempted: p.attempted,
        correct: p.correct,
        accuracy: Math.round(p.accuracy * 100),
      }));

    const valid = examRecords.filter((m) => m.total > 0);
    const subjectMap = new Map<string, { total: number; count: number }>();
    const subjectOrder: string[] = [];
    for (const m of valid) {
      const key = m.subjectId || "other";
      if (!subjectMap.has(key)) {
        subjectMap.set(key, { total: 0, count: 0 });
        subjectOrder.push(key);
      }
      const cur = subjectMap.get(key)!;
      cur.total += m.total;
      cur.count += 1;
    }
    const examSubject = subjectOrder.map((s) => ({
      subject: s,
      fullMarks: subjectMap.get(s)!.total,
      count: subjectMap.get(s)!.count,
    }));
    const examTrend = [...valid]
      .sort((a, b) => a.examDate.getTime() - b.examDate.getTime())
      .map((m) => ({
        id: m.id,
        subject: m.subjectId,
        name: m.name || m.subjectId,
        fullMarks: m.total,
        date: m.examDate,
      }));
    const totalFullMarks = valid.reduce((s, m) => s + m.total, 0);

    return NextResponse.json({
      stats: {
        quizzesCompleted: completedQuizzes.length,
        totalQuizzes: quizzes.length,
        avgScore,
        totalQuestionsAnswered,
        overallAccuracy,
        totalMistakes,
        weakTopicsCount: weakTopics.length,
        totalStudyMinutes,
        aiSessions: aiUsage,
        conversations,
      },
      scoreTrend,
      topicAccuracy,
      studyByDay,
      weakTopics,
      recentWrongCount: wrongSummaries.length,
      examMarks: {
        count: valid.length,
        totalFullMarks,
        trend: examTrend.slice(-15),
        subject: examSubject,
      },
      community: {
        totalMinutes: communityMinutes,
        activeUsers: communityActiveUsers,
        leaderboard,
      },
    });
  } catch (error) {
    console.error("Analytics GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
