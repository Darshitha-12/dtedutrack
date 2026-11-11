import type { RevisionTopic } from "./types";

// Ebbinghaus forgetting curve inspired intervals - Amila Dissanayake style
// Start: Day 0 -> review next day (Day 1), etc.
const INTERVALS = [0, 1, 3, 7, 14, 30];

export function getNextInterval(currentIntervalDays: number, grade: 1 | 2 | 3 | 4 | 5): number {
  // grade 1-2: forgot/struggled - reset to earlier interval
  if (grade <= 2) {
    return 1; // review again tomorrow
  }
  // grade 3: ok - stay or small increase
  if (grade === 3) {
    const idx = INTERVALS.findIndex((i) => i >= currentIntervalDays);
    if (idx >= 0 && idx < INTERVALS.length - 1) {
      return INTERVALS[idx + 1];
    }
    return Math.min(currentIntervalDays * 1.2, 30);
  }
  // grade 4-5: easy/good - increase more aggressively
  const idx = INTERVALS.findIndex((i) => i >= currentIntervalDays);
  if (idx >= 0 && idx < INTERVALS.length - 1) {
    return INTERVALS[idx + 2] || INTERVALS[INTERVALS.length - 1];
  }
  return Math.min(Math.max(currentIntervalDays * 1.5, 30), 60);
}

export function calculateRetention(daysSinceReview: number): number {
  // Ebbinghaus approximation: R = e^(-t/S), simplified
  // Assuming stability S grows with reviews
  const S = Math.max(1, 7 * Math.log10(daysSinceReview + 1) + 5);
  const R = Math.exp(-daysSinceReview / S) * 100;
  return Math.max(0, Math.min(100, Math.round(R)));
}

export function getStatusForTopic(topic: RevisionTopic): RevisionTopic["status"] {
  if (topic.streak === 0) return "new";
  if (topic.intervalDays >= 30 && topic.streak >= 3) return "mastered";
  if (topic.streak >= 1) return "learning";
  return "review";
}

export function isDue(topic: RevisionTopic, now: number = Date.now()): boolean {
  if (!topic.nextReviewAt) return true; // never reviewed
  return topic.nextReviewAt <= now;
}

export function getDueTopics(topics: RevisionTopic[], now: number = Date.now()): RevisionTopic[] {
  return topics.filter((t) => isDue(t, now)).sort((a, b) => {
    // Overdue first
    const aOverdue = (a.nextReviewAt || 0) < now;
    const bOverdue = (b.nextReviewAt || 0) < now;
    if (aOverdue && !bOverdue) return -1;
    if (!aOverdue && bOverdue) return 1;
    return (a.nextReviewAt || 0) - (b.nextReviewAt || 0);
  });
}
