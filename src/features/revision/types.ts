export type TopicStatus = "new" | "learning" | "review" | "mastered";

export interface RevisionTopic {
  id: string;
  title: string;
  subject?: string;
  chapter?: string;
  notes?: string;
  createdAt: number;
  lastReviewedAt?: number | null;
  nextReviewAt?: number | null;
  intervalDays: number; // current interval in days
  streak: number; // number of successful reviews
  retention: number; // 0-100 approximate retention
  status: TopicStatus;
  easeFactor: number; // 2.5 default
}

export interface ReviewSessionItem {
  topicId: string;
  reviewedAt: number;
  grade: 1 | 2 | 3 | 4 | 5; // 1 = forgot, 5 = easy
  intervalBefore: number;
  intervalAfter: number;
}

export interface RevisionState {
  topics: RevisionTopic[];
  history: ReviewSessionItem[];
  updatedAt: number;
}
