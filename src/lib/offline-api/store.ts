// localStorage-backed state for the offline API layer.
//
// Everything the real server keeps in Postgres lives here instead. The state is loaded
// once per page load and written back after every mutation.

import { nowIso, uid } from "./runtime";

export const ME = "offline-user";
const LS_KEY = "biopulse-offline-v1";
const SYNC_IDENTITY_KEY = "biopulse.sync.identity";

/**
 * The real account id once this device is linked to an account (account-sync saves it as
 * `biopulse.sync.identity = { id, email, name }`), falling back to the synthetic offline id.
 *
 * The chat shim needs this: `chatConversations()` reports `me`, and the chat page trusts it.
 * If it always said "offline-user" while the synced messages carried real sender ids, every
 * bubble was painted as received (both sides on one side) and the seen ticks vanished.
 */
export function meId(): string {
  try {
    const raw = typeof window !== "undefined" ? window.localStorage.getItem(SYNC_IDENTITY_KEY) : null;
    if (raw) {
      const id = (JSON.parse(raw) as { id?: string }).id;
      if (typeof id === "string" && id) return id;
    }
  } catch {
    /* corrupted identity — fall back below */
  }
  return ME;
}


export interface StoredProfile {
  name: string;
  displayName: string;
  email: string;
  image: string | null;
  avatarUrl: string | null;
  about: string;
  fullName: string;
  language: "en" | "si";
  examYear: string;
  examDate: string;
  examType: string;
  dailyStudyTarget: number;
  weeklyStudyTarget: number;
  targetGrade: string;
  currentLevel: string;
  preferredTime: string;
  weakTopics: string[];
  subjects: string[];
  onboarded: boolean;
  updatedAt?: string;
}

export interface StoredSettingsRow {
  id: string;
  userId: string;
  browserEnabled: boolean;
  telegramEnabled: boolean;
  telegramToken: string;
  telegramChatId: string;
  telegramAll: boolean;
  ntfyEnabled: boolean;
  ntfyTopic: string;
  fcmToken: string;
  createdAt: string;
  updatedAt: string;
}

export interface StoredClientSettings {
  theme?: string;
  language?: string;
  notifications?: Record<string, unknown>;
  pomodoro?: Record<string, unknown>;
}

export interface NotepadEntry {
  id: string;
  title: string;
  content: string;
  color: string;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface StoredNote {
  id: string;
  title: string;
  content: string;
  createdAt: string;
}

export interface StoredCard {
  id: string;
  front: string;
  back: string;
}

export interface StoredDeck {
  id: string;
  title: string;
  language: string;
  source: string;
  createdAt: string;
  updatedAt: string;
  cards: StoredCard[];
}

export interface StoredMark {
  id: string;
  subjectId: string;
  score: number | null;
  total: number;
  examDate: string; // YYYY-MM-DD
  name: string;
}

export interface StoredPastRecord {
  id: string;
  paperType: string;
  score: number;
  total: number;
  examDate: string; // full ISO
}

export interface StoredWorkLog {
  id: string;
  date: string; // YYYY-MM-DD
  minutes: number;
  note?: string;
}

export interface StoredClass {
  id: string;
  subjectName: string;
  dayOfWeek: number;
  startMinute: number;
  endMinute: number;
  color: string;
}

export interface StoredClassAttendance {
  classId: string;
  date: string; // YYYY-MM-DD (local)
  status: "ATTENDED" | "MISSED";
}

export interface StoredProgress {
  id: string;
  userId: string;
  topicId: string;
  subtopicId: string;
  status: "NOT_STARTED" | "IN_PROGRESS" | "REVIEW" | "MASTERED";
  masteryScore: number;
  completionPercent: number;
  questionsAttempted: number;
  questionsCorrect: number;
  studyMinutes: number;
  confidence: string | null;
  lastStudiedAt: string | null;
  lastReviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StoredQuizQuestion {
  id: string;
  quizId: string;
  questionId: string;
  order: number;
  status: "PENDING" | "ANSWERED" | "SKIPPED";
  selectedOptionId: string | null;
  isCorrect: boolean | null;
  timeMs: number;
}

export interface StoredQuiz {
  id: string;
  mode: "PRACTICE" | "WEAK_TOPICS" | "RETRY_WRONG" | "MOCK";
  status: "IN_PROGRESS" | "COMPLETED" | "ABANDONED";
  score: number;
  total: number;
  topicId: string | null;
  difficulty: string | null;
  startedAt: string;
  completedAt: string | null;
  createdAt: string;
  questions: StoredQuizQuestion[];
}

export interface StoredAttempt {
  id: string;
  questionId: string;
  topicId: string;
  selectedOptionId: string;
  isCorrect: boolean;
  answeredAt: string;
}

export interface StoredPlannerPrefs {
  weeklyTargetMin: number;
  sessionLengthMin: number;
  breakAfterMin: number;
  breakDurationMin: number;
  timeFormat: "12h" | "24h";
  showBreaks: boolean;
  subjectPriorities: { subjectId: string; name: string; priority: string; icon?: string; color?: string }[];
  studyTypes: { type: string; weight: number }[];
  weakTopics: string[];
}

export interface StoredPlannerDay {
  dayOfWeek: number;
  enabled: boolean;
  dailyTargetMin: number;
  blocks: { startMinute: number; endMinute: number }[];
}

export interface StoredPlannerSession {
  id: string;
  subjectId: string;
  subjectName: string;
  topicId: string | null;
  topicTitle: string | null;
  date: string | null;
  dayOfWeek: number | null;
  startMinute: number;
  endMinute: number;
  type: string;
  priority: string;
  status: string;
  recurrence: string;
  recurrenceDays: number[];
  reminderMin: number;
  notes: string;
  completedAt?: string;
}

export interface StoredStudySession {
  id: string;
  subjectId: string;
  minutes: number;
  completedAt: string;
}

export interface StoredChatMessage {
  id: string;
  senderId: string;
  receiverId: string;
  text: string;
  mediaUrl: string | null;
  mediaType: string | null;
  mediaName: string | null;
  readAt: string | null;
  createdAt: string;
  replyToId?: string | null;
  editedAt?: string | null;
  forwarded?: boolean;
}

export interface StoredStatus {
  id: string;
  userId: string;
  text: string | null;
  imageUrl: string | null;
  imageType: string | null;
  caption?: string | null;
  bgColor?: string | null;
  font?: string | null;
  pinned?: boolean;
  editedAt?: string | null;
  createdAt: string;
}

/**
 * Deletion tombstones, synced alongside the data. `deleted[collection][key]` is
 * the ISO time the entity was deleted; it lets a deletion on one device remove
 * the entity on the other instead of being resurrected by the pull-first merge.
 */
export type DeletedMap = Record<string, Record<string, string>>;

export interface OfflineState {
  v: 1;
  deleted?: Record<string, Record<string, string>>;
  profile: StoredProfile;
  settings: StoredSettingsRow;
  clientSettings: StoredClientSettings;
  notepad: NotepadEntry[];
  notes: StoredNote[];
  decks: StoredDeck[];
  marks: StoredMark[];
  pastRecords: StoredPastRecord[];
  workLogs: StoredWorkLog[];
  classes: StoredClass[];
  classAttendance: StoredClassAttendance[];
  progress: StoredProgress[];
  plannerPrefs: StoredPlannerPrefs | null;
  plannerDays: StoredPlannerDay[];
  plannerSessions: StoredPlannerSession[];
  quizzes: StoredQuiz[];
  attempts: StoredAttempt[];
  studySessions: StoredStudySession[];
  chatMessages: StoredChatMessage[];
  /** Reactions and "delete for me" for the single-user offline store. */
  chatReactions?: { messageId: string; emoji: string }[];
  hiddenChatMessages?: string[];
  statuses: StoredStatus[];
}

function defaultProfile(): StoredProfile {
  return {
    name: "Student",
    displayName: "Student",
    email: "student@biopulse.local",
    image: null,
    avatarUrl: null,
    about: "",
    fullName: "Student",
    language: "en",
    examYear: "",
    examDate: "",
    examType: "A/L",
    dailyStudyTarget: 4,
    weeklyStudyTarget: 28,
    targetGrade: "A",
    currentLevel: "O/L",
    preferredTime: "morning",
    weakTopics: [],
    subjects: [],
    onboarded: true,
    updatedAt: "",
  };
}

function defaultSettings(): StoredSettingsRow {
  const t = nowIso();
  return {
    id: uid(),
    userId: ME,
    browserEnabled: false,
    telegramEnabled: false,
    telegramToken: "",
    telegramChatId: "",
    telegramAll: false,
    ntfyEnabled: false,
    ntfyTopic: "",
    fcmToken: "",
    createdAt: t,
    updatedAt: t,
  };
}

function defaultState(): OfflineState {
  return {
    v: 1,
    profile: defaultProfile(),
    settings: defaultSettings(),
    clientSettings: {},
    notepad: [],
    notes: [],
    decks: [],
    marks: [],
    pastRecords: [],
    workLogs: [],
    classes: [],
    classAttendance: [],
    progress: [],
    plannerPrefs: null,
    plannerDays: [],
    plannerSessions: [],
    quizzes: [],
    attempts: [],
    studySessions: [],
    chatMessages: [],
    chatReactions: [],
    hiddenChatMessages: [],
    statuses: [],
  };
}

let cached: OfflineState | null = null;

/**
 * Drops the in-memory cache so the next getState() re-reads localStorage. Used
 * after a remote blob is applied so open pages observe the merged data.
 */
export function resetCache(): void {
  cached = null;
}

export function getState(): OfflineState {
  if (cached) return cached;
  let base = defaultState();
  try {
    const raw = typeof window !== "undefined" ? window.localStorage.getItem(LS_KEY) : null;
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<OfflineState>;
      base = {
        ...base,
        ...parsed,
        v: 1,
        profile: { ...base.profile, ...(parsed.profile ?? {}) },
        settings: { ...base.settings, ...(parsed.settings ?? {}) },
      };
    }
  } catch {
    /* corrupted storage — start fresh */
  }
  cached = base;
  return cached;
}

export function saveState(): void {
  if (!cached) return;
  try {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(LS_KEY, JSON.stringify(cached));
    }
  } catch {
    /* storage full/unavailable — in-memory state still works for this session */
  }
}

export function mutate(fn: (s: OfflineState) => void): OfflineState {
  const s = getState();
  fn(s);
  saveState();
  return s;
}
