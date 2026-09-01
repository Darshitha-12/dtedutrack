import type { CoachInsight } from "./rule-engine";
import { computeAdvice } from "./rule-engine";
import type { MarkRecord } from "@/features/marks/types/marks";

export interface AICoachService {
  getInsights(
    marks: MarkRecord[],
    weeklyStudyMinutes: number,
    subjectMinutes: Record<string, number>,
    examDate?: string,
    dailyHr?: number,
  ): Promise<CoachInsight[]>;
}

class RuleBasedCoach implements AICoachService {
  async getInsights(
    marks: MarkRecord[],
    weeklyStudyMinutes: number,
    subjectMinutes: Record<string, number>,
    examDate?: string,
    dailyHr?: number,
  ): Promise<CoachInsight[]> {
    return computeAdvice(marks, weeklyStudyMinutes, subjectMinutes, examDate, dailyHr);
  }
}

// Future: LLM-powered coach would implement this interface
// class LLMCoach implements AICoachService { ... }

export const aiCoach: AICoachService = new RuleBasedCoach();
