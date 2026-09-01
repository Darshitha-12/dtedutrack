export type QuestionType = "MCQ" | "MULTIPLE_SELECT" | "TRUE_FALSE";
export type QuestionDifficulty = "easy" | "medium" | "hard";
export type QuestionStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";
export type QuizMode = "PRACTICE" | "WEAK_TOPICS" | "RETRY_WRONG" | "MOCK";
export type QuizStatus = "IN_PROGRESS" | "COMPLETED" | "ABANDONED";
export type QuizQuestionStatus = "PENDING" | "ANSWERED" | "SKIPPED";

export interface QuestionOptionData {
  id: string;
  text: string;
  textSi: string;
  order: number;
}

export interface QuestionOptionWithCorrect extends QuestionOptionData {
  isCorrect: boolean;
}

export interface QuestionData {
  id: string;
  subjectId: string;
  unitId: string;
  topicId: string;
  type: QuestionType;
  difficulty: QuestionDifficulty;
  stem: string;
  stemSi: string;
  explanation: string;
  explanationSi: string;
  marks: number;
  tags: string[];
  status: QuestionStatus;
  source: string;
  topicSlug: string;
  topicTitle: string;
  unitSlug: string;
  unitTitle: string;
  options: QuestionOptionData[];
}

export interface QuestionForPractice extends Omit<QuestionData, "options"> {
  options: QuestionOptionData[];
}

export interface QuizSummaryData {
  id: string;
  mode: QuizMode;
  status: QuizStatus;
  score: number;
  total: number;
  startedAt: string;
  completedAt: string | null;
  createdAt: string;
}

export interface QuizDetailData extends QuizSummaryData {
  questions: QuizQuestionData[];
}

export interface QuizQuestionData {
  id: string;
  quizId: string;
  questionId: string;
  order: number;
  status: QuizQuestionStatus;
  selectedOptionId: string | null;
  isCorrect: boolean | null;
  timeMs: number;
  question: QuestionData;
}

export interface AnswerResult {
  correct: boolean;
  correctOptionId: string;
  explanation: string;
  explanationSi: string;
  questionType: QuestionType;
}

export interface TopicPerformance {
  topicId: string;
  topicTitle: string;
  topicSlug: string;
  attempted: number;
  correct: number;
  accuracy: number;
  averageTimeMs: number;
}

export interface WeakTopicInfo {
  topicId: string;
  topicTitle: string;
  topicSlug: string;
  accuracy: number;
  attempted: number;
}
