import type { RevisionState, RevisionTopic, ReviewSessionItem } from "./types";
import { getNextInterval, calculateRetention, getStatusForTopic } from "./scheduler";

const STORAGE_KEY = "biopulse_revision_v1";

const DEFAULT_STATE: RevisionState = {
  topics: [],
  history: [],
  updatedAt: Date.now(),
};

export function loadRevisionState(): RevisionState {
  try {
    if (typeof window === "undefined") return DEFAULT_STATE;
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_STATE;
    const data = JSON.parse(raw) as RevisionState;
    return {
      topics: data.topics || [],
      history: data.history || [],
      updatedAt: data.updatedAt || Date.now(),
    };
  } catch {
    return DEFAULT_STATE;
  }
}

export function saveRevisionState(state: RevisionState): void {
  try {
    if (typeof window === "undefined") return;
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...state, updatedAt: Date.now() })
    );
  } catch {
    // ignore
  }
}

export function createTopic(input: { title: string; subject?: string; chapter?: string; notes?: string }): RevisionTopic {
  const now = Date.now();
  return {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
    title: input.title.trim().slice(0, 200),
    subject: input.subject?.trim().slice(0, 100) || undefined,
    chapter: input.chapter?.trim().slice(0, 100) || undefined,
    notes: input.notes?.trim().slice(0, 1000) || undefined,
    createdAt: now,
    lastReviewedAt: null,
    nextReviewAt: now, // due immediately
    intervalDays: 0,
    streak: 0,
    retention: 100,
    status: "new",
    easeFactor: 2.5,
  };
}

export function reviewTopic(
  state: RevisionState,
  topicId: string,
  grade: 1 | 2 | 3 | 4 | 5
): RevisionState {
  const now = Date.now();
  const topics = state.topics.map((topic) => {
    if (topic.id !== topicId) return topic;
    const intervalBefore = topic.intervalDays;
    const intervalAfter = getNextInterval(intervalBefore, grade);
    const nextReviewAt = now + intervalAfter * 24 * 60 * 60 * 1000;
    
    const updated: RevisionTopic = {
      ...topic,
      lastReviewedAt: now,
      nextReviewAt,
      intervalDays: intervalAfter,
      streak: grade >= 3 ? topic.streak + 1 : Math.max(0, topic.streak - 1),
      retention: grade >= 4 ? 100 : grade === 3 ? 95 : 70,
      easeFactor: topic.easeFactor + (grade - 3) * 0.1,
      status: getStatusForTopic({ ...topic, streak: grade >= 3 ? topic.streak + 1 : topic.streak, intervalDays: intervalAfter }),
    };
    return updated;
  });

  const historyItem: ReviewSessionItem = {
    topicId,
    reviewedAt: now,
    grade,
    intervalBefore: state.topics.find((t) => t.id === topicId)?.intervalDays || 0,
    intervalAfter: getNextInterval(state.topics.find((t) => t.id === topicId)?.intervalDays || 0, grade),
  };

  return {
    topics,
    history: [historyItem, ...state.history].slice(0, 1000),
    updatedAt: now,
  };
}

export function deleteTopic(state: RevisionState, topicId: string): RevisionState {
  return {
    topics: state.topics.filter((t) => t.id !== topicId),
    history: state.history,
    updatedAt: Date.now(),
  };
}

export function updateTopicRetention(topics: RevisionTopic[]): RevisionTopic[] {
  const now = Date.now();
  return topics.map((topic) => {
    if (!topic.lastReviewedAt) return { ...topic, retention: 100 };
    const daysSince = (now - topic.lastReviewedAt) / (24 * 60 * 60 * 1000);
    return {
      ...topic,
      retention: calculateRetention(daysSince),
    };
  });
}
