import type { SubjectId } from "@/types/subject";
import type { Grade } from "@/lib/utils";

export type PaperType = "MCQ" | "Structured" | "Essay";

export const PAPER_WEIGHTS: Record<PaperType, number> = {
  MCQ: 0.5,
  Structured: 0.25,
  Essay: 0.25,
};

export interface MarkRecord {
  id: string;
  subjectId: SubjectId;
  type: PaperType;
  score: number;
  total: number;
  date: string; // YYYY-MM-DD
  userId?: string;
}
