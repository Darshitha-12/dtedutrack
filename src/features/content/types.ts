export type ContentStatus = "DRAFT" | "VERIFIED" | "DEMO" | "ARCHIVED";
export type ContentSource = "DEMO" | "OFFICIAL" | "TEACHER_CREATED" | "AI_GENERATED" | "USER_CREATED";
export type Difficulty = "beginner" | "intermediate" | "advanced";
export type Importance = "low" | "normal" | "high" | "critical";
export type ProgressStatus = "NOT_STARTED" | "IN_PROGRESS" | "REVIEW" | "MASTERED";
export type Confidence = "low" | "medium" | "high";

export interface ContentSubjectData {
  id: string;
  slug: string;
  name: string;
  nameSi: string;
  description: string;
  descriptionSi: string;
  icon: string;
  color: string;
  order: number;
  status: ContentStatus;
  source: ContentSource;
  version: number;
}

export interface ContentUnitData {
  id: string;
  subjectId: string;
  slug: string;
  order: number;
  title: string;
  titleSi: string;
  description: string;
  descriptionSi: string;
  estimatedMinutes: number;
  status: ContentStatus;
  source: ContentSource;
  version: number;
  _count?: { topics: number };
}

export interface ContentTopicData {
  id: string;
  unitId: string;
  slug: string;
  order: number;
  title: string;
  titleSi: string;
  description: string;
  descriptionSi: string;
  difficulty: Difficulty;
  importance: Importance;
  examRelevance: number;
  estimatedMinutes: number;
  status: ContentStatus;
  source: ContentSource;
  version: number;
  _count?: { subtopics: number; learningObjectives: number };
}

export interface ContentSubtopicData {
  id: string;
  topicId: string;
  slug: string;
  order: number;
  title: string;
  titleSi: string;
  description: string;
  descriptionSi: string;
  content: string;
  contentSi: string;
  difficulty: Difficulty;
  estimatedMinutes: number;
  status: ContentStatus;
  source: ContentSource;
  version: number;
  _count?: { learningObjectives: number };
}

export interface ContentLearningObjectiveData {
  id: string;
  topicId: string | null;
  subtopicId: string | null;
  slug: string;
  order: number;
  title: string;
  titleSi: string;
  description: string;
  descriptionSi: string;
  difficulty: Difficulty;
  status: ContentStatus;
  source: ContentSource;
  version: number;
}

export interface UserTopicProgressData {
  id: string;
  userId: string;
  topicId: string;
  subtopicId: string | null;
  status: ProgressStatus;
  masteryScore: number;
  completionPercent: number;
  questionsAttempted: number;
  questionsCorrect: number;
  studyMinutes: number;
  confidence: Confidence;
  lastStudiedAt: Date | null;
  lastReviewedAt: Date | null;
}

export interface TopicWithProgress extends ContentTopicData {
  progress: UserTopicProgressData | null;
}

export interface SearchResult {
  type: "subject" | "unit" | "topic" | "subtopic" | "objective";
  id: string;
  slug: string;
  title: string;
  titleSi: string;
  description: string;
  path: string; // URL path to this item
  relevance: number; // 0-100 for ranking
}

export interface BiologyContext {
  subject: ContentSubjectData;
  unit: ContentUnitData | null;
  topic: ContentTopicData | null;
  subtopic: ContentSubtopicData | null;
  objectives: ContentLearningObjectiveData[];
  relatedTopics: ContentTopicData[];
}
