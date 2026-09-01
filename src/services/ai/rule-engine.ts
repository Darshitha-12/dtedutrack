import type { MarkRecord } from "@/features/marks/types/marks";
import type { SubjectId } from "@/types/subject";
import { avg, slopeOf, stdev, gradeOf, type Grade } from "@/lib/utils";
import { PAPER_WEIGHTS, type PaperType } from "@/features/marks/types/marks";

export interface CoachInsight {
  tone: "crit" | "warn" | "good" | "info";
  icon: string;
  text: string;
  action?: {
    label: string;
    subjectId: SubjectId;
    paperType: PaperType;
  };
}

export function computeAdvice(
  marks: MarkRecord[],
  weeklyStudyMinutes: number,
  subjectMinutes: Record<string, number>,
  examDate?: string,
  dailyHr?: number,
): CoachInsight[] {
  const out: CoachInsight[] = [];
  const subjects = ["bio", "chem", "phy", "agri", "dt"] as SubjectId[];
  const paperTypes: PaperType[] = ["MCQ", "Structured", "Essay"];

  for (const sub of subjects) {
    for (const tp of paperTypes) {
      const series = marks
        .filter((m) => m.subjectId === sub && m.type === tp)
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((m) => (m.total > 0 ? Math.round((m.score / m.total) * 1000) / 10 : 0));

      if (series.length < 4) continue;

      const recent = avg(series.slice(-2));
      const prev = avg(series.slice(-4, -2));

      if (prev > 0 && recent - prev <= -8) {
        out.push({
          tone: "crit",
          icon: "📉",
          text: `${sub} ${tp} scores dropped by ${Math.abs(Math.round(recent - prev))}% (${prev.toFixed(0)}% → ${recent.toFixed(0)}%). Schedule a revision session.`,
          action: { label: "⚡ Auto-schedule revision", subjectId: sub, paperType: tp },
        });
      } else if (prev > 0 && recent - prev >= 8) {
        out.push({
          tone: "good",
          icon: "📈",
          text: `${sub} ${tp} improved by ${Math.round(recent - prev)}%. Keep it up!`,
        });
      }

      const last3 = series.slice(-3);
      if (last3.length === 3 && stdev(last3) > 12) {
        out.push({
          tone: "warn",
          icon: "🎲",
          text: `${sub} ${tp} performance is inconsistent (σ=${stdev(last3).toFixed(0)}). Review error patterns.`,
        });
      }

      if (avg(series.slice(-3)) >= 85) {
        out.push({
          tone: "good",
          icon: "🏆",
          text: `${sub} ${tp} is a core strength (${avg(series.slice(-3)).toFixed(0)}% avg). Maintain with weekly drills.`,
        });
      }
    }

    const subMin = subjectMinutes[sub] ?? 0;
    const totalMin = weeklyStudyMinutes;
    if (totalMin > 60 && subMin / totalMin < 0.15 && subMin < 120) {
      out.push({
        tone: "warn",
        icon: "⏳",
        text: `Only ${(subMin / 60).toFixed(1)}h on ${sub} this week. Rebalance your schedule.`,
      });
    }
  }

  if (examDate) {
    const days = Math.ceil((new Date(examDate).getTime() - Date.now()) / 864e5);
    if (days <= 14 && days >= 0) {
      out.push({
        tone: "crit",
        icon: "🚨",
        text: `${days} days to exam. Switch to past-paper mode: one timed paper per subject every 2 days.`,
      });
    } else if (days > 0 && dailyHr) {
      out.push({
        tone: "info",
        icon: "🎯",
        text: `${days} days remain. At ${dailyHr}h/day, you'll bank ≈${Math.round(days * dailyHr)}h before the exam.`,
      });
    }
  }

  const today = new Date().toISOString().slice(0, 10);
  const studiedToday = marks.some((m) => m.date === today);
  if (!studiedToday && new Date().getHours() >= 10) {
    out.push({
      tone: "info",
      icon: "🌱",
      text: "No study logged today. Start a focus session — momentum beats motivation.",
    });
  }

  if (!out.length) {
    out.push({
      tone: "good",
      icon: "✨",
      text: "All systems nominal. Log more exam papers for deeper insights.",
    });
  }

  return out.slice(0, 8);
}
