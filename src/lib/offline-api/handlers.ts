// Handlers for everything that isn't content/quiz/planner/chat: auth, profile,
// settings, onboarding, notepad, notes, flashcards, marks, past papers, work log,
// classes, progress, analytics and misc.
//
// Response shapes and status codes follow the real route handlers
// (see the API contract spec) so client code behaves identically offline.

import { getContentDb, type ContentDb } from "./content";
import { topicPerformances, weakTopicRows, wrongQuestionIds } from "./quiz";
import {
  getState,
  mutate,
  ME,
  type OfflineState,
  type NotepadEntry,
  type StoredNote,
  type StoredDeck,
  type StoredMark,
  type StoredPastRecord,
  type StoredClassAttendance,
} from "./store";
import { dateKeyOf, nowIso, uid } from "./runtime";

export type Result = { status: number; body: Record<string, unknown> };

export function jsonResult(status: number, body: Record<string, unknown>): Result {
  return { status, body };
}

// ---- Session (NextAuth-compatible) ----

export function fakeSession(): Record<string, unknown> {
  const p = getState().profile;
  return {
    user: {
      id: ME,
      name: p.name,
      email: p.email,
      image: p.image,
    },
    expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  };
}

export function csrfToken(): Result {
  let token = "";
  for (let i = 0; i < 32; i++) token += Math.floor(Math.random() * 16).toString(16);
  return { status: 200, body: { csrfToken: token } };
}

// The offline build has no real accounts: any email/password is accepted at
// login. Capture the entered email as this device's identity so the session,
// profile and settings all show the user's own address instead of the
// built-in student@biopulse.local default.
export function applyLoginEmail(emailRaw: unknown): void {
  const email = String(emailRaw ?? "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return;
  mutate((s) => {
    s.profile.email = email;
    // Give the profile a personal name only while it still holds the default.
    if (!s.profile.name || s.profile.name === "Student") {
      const local = email.split("@")[0].replace(/[._-]+/g, " ").replace(/\s+/g, " ").trim();
      const name = local ? local.charAt(0).toUpperCase() + local.slice(1) : "Student";
      s.profile.name = name;
      s.profile.displayName = name;
    }
    s.profile.updatedAt = nowIso();
  });
}

// ---- Profile ----

export function profileGet(): Result {
  const p = getState().profile;
  return {
    status: 200,
    body: {
      name: p.name,
      displayName: p.displayName,
      email: p.email,
      image: p.image,
      avatarUrl: p.avatarUrl,
      about: p.about,
      fullName: p.fullName,
      language: p.language,
      examYear: p.examYear,
      examDate: p.examDate,
      examType: p.examType,
      dailyTargetHours: p.dailyStudyTarget,
      weeklyTargetHours: p.weeklyStudyTarget,
      targetGrade: p.targetGrade,
      currentLevel: p.currentLevel,
      preferredStudyTime: p.preferredTime,
      weakTopics: p.weakTopics,
      onboarded: p.onboarded,
    },
  };
}

function fieldError(fields: Record<string, string[]>): Result {
  return { status: 400, body: { error: fields } };
}

function rawUserRow() {
  const s = getState();
  const p = s.profile;
  const t = nowIso();
  return {
    id: ME,
    name: p.name,
    email: p.email,
    image: p.image,
    displayName: p.displayName,
    avatarUrl: p.avatarUrl,
    about: p.about,
    createdAt: t,
    studentProfile: {
      id: uid(),
      userId: ME,
      fullName: p.fullName,
      language: p.language,
      examYear: p.examYear ? Number(p.examYear) || null : null,
      examDate: p.examDate ? new Date(p.examDate + "T00:00:00.000Z").toISOString() : null,
      examType: p.examType,
      dailyStudyTarget: p.dailyStudyTarget,
      weeklyStudyTarget: p.weeklyStudyTarget,
      targetGrade: p.targetGrade,
      currentLevel: p.currentLevel,
      preferredTime: p.preferredTime,
      weakTopics: p.weakTopics,
      subjects: p.subjects,
      onboarded: p.onboarded,
      createdAt: t,
      updatedAt: t,
    },
  };
}

export function profilePatch(body: Record<string, unknown>): Result {
  const p = { ...getState().profile };

  if (body.name !== undefined) {
    const name = String(body.name);
    if (name.length < 2 || name.length > 100) return fieldError({ name: ["Name must be 2-100 characters"] });
    p.name = name;
    if (body.displayName === undefined) p.displayName = name;
  }
  if (body.displayName !== undefined) {
    const v = String(body.displayName);
    if (v.length > 100) return fieldError({ displayName: ["Display name must be at most 100 characters"] });
    p.displayName = v;
  }
  if (body.about !== undefined) {
    const v = String(body.about);
    if (v.length > 500) return fieldError({ about: ["About must be at most 500 characters"] });
    p.about = v;
  }
  if (body.avatarUrl !== undefined) {
    const v = String(body.avatarUrl);
    p.avatarUrl = v;
    p.image = v;
  }
  if (body.fullName !== undefined) p.fullName = String(body.fullName);
  if (body.language !== undefined && (body.language === "en" || body.language === "si")) p.language = body.language;
  if (body.examYear !== undefined && body.examYear !== "") {
    const y = Number(body.examYear);
    if (!Number.isInteger(y) || y < 2000 || y > 2045) return fieldError({ examYear: ["Exam year must be between 2000 and 2045"] });
    p.examYear = String(y);
  } else if (body.examYear === "") {
    p.examYear = "";
  }
  if (body.examDate !== undefined && body.examDate !== "") {
    const v = String(body.examDate);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(new Date(v + "T00:00:00.000Z").getTime())) {
      return fieldError({ examDate: ["Invalid exam date"] });
    }
    p.examDate = v;
  } else if (body.examDate === "") {
    p.examDate = "";
  }
  if (body.examType !== undefined) p.examType = String(body.examType);
  if (body.dailyStudyTarget !== undefined) {
    const v = Number(body.dailyStudyTarget);
    if (Number.isFinite(v)) p.dailyStudyTarget = v;
  }
  if (body.weeklyStudyTarget !== undefined) {
    const v = Number(body.weeklyStudyTarget);
    if (Number.isFinite(v)) p.weeklyStudyTarget = v;
  }
  if (body.preferredTime !== undefined) p.preferredTime = String(body.preferredTime);
  if (body.targetGrade !== undefined) p.targetGrade = String(body.targetGrade);
  if (body.currentLevel !== undefined) p.currentLevel = String(body.currentLevel);
  if (Array.isArray(body.weakTopics)) p.weakTopics = body.weakTopics.map(String);
  if (Array.isArray(body.subjects)) p.subjects = body.subjects.map(String);
  if (body.onboarded !== undefined) p.onboarded = body.onboarded === true;

  mutate((s) => {
    Object.assign(s.profile, p);
    s.profile.updatedAt = nowIso();
  });
  return { status: 200, body: { user: rawUserRow() } };
}

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("read failed"));
    reader.readAsDataURL(file);
  });
}

export async function profileAvatar(form: FormData | undefined): Promise<Result> {
  const file = form?.get("file");
  if (!(file instanceof File)) return { status: 400, body: { error: "No file provided" } };
  if (!file.type.startsWith("image/")) return { status: 400, body: { error: "Only image files are allowed" } };
  if (file.size > 5 * 1024 * 1024) return { status: 400, body: { error: "Image too large (max 5MB)" } };
  // Storage is never configured in the offline build, so the stricter inline limit applies.
  if (file.size > 2 * 1024 * 1024) {
    return { status: 400, body: { error: "Image too large (max 2MB when storage isn't configured)" } };
  }
  const dataUrl = await fileToDataUrl(file);
  mutate((s) => {
    s.profile.avatarUrl = dataUrl;
    s.profile.image = dataUrl;
    s.profile.updatedAt = nowIso();
  });
  return { status: 200, body: { avatarUrl: dataUrl } };
}

// ---- Settings & onboarding ----

export function settingsGet(): Result {
  const s = getState();
  return {
    status: 200,
    body: {
      settings: s.settings,
      // Extra keys (beyond the server's {settings} response) make the settings page's
      // dead-code reads actually resolve offline, so preferences can persist locally.
      theme: s.clientSettings.theme ?? "dark",
      language: s.profile.language,
      notifications: (s.clientSettings.notifications as Record<string, unknown>) ?? {
        browser: false,
        telegram: false,
        telegramToken: "",
        telegramChatId: "",
        ntfy: false,
        ntfyTopic: "",
        studyReminders: true,
      },
      pomodoro: (s.clientSettings.pomodoro as Record<string, unknown>) ?? {
        studyMinutes: 25,
        breakMinutes: 5,
        longBreakMinutes: 15,
        cyclesBeforeLongBreak: 4,
      },
      userEmail: s.profile.email,
    },
  };
}

export function settingsPatch(body: Record<string, unknown>): Result {
  mutate((s) => {
    s.clientSettings = {
      theme: typeof body.theme === "string" ? body.theme : s.clientSettings.theme,
      language: typeof body.language === "string" ? body.language : s.clientSettings.language,
      notifications: (body.notifications as Record<string, unknown>) ?? s.clientSettings.notifications,
      pomodoro: (body.pomodoro as Record<string, unknown>) ?? s.clientSettings.pomodoro,
    };
    // The server's zod schema strips unknown keys, so the stored row keeps its defaults.
    s.settings.updatedAt = nowIso();
  });
  return { status: 200, body: { settings: getState().settings } };
}

export function onboardingPatch(body: Record<string, unknown>): Result {
  mutate((s) => {
    if (typeof body.fullName === "string" && body.fullName.length >= 2) {
      s.profile.fullName = body.fullName;
      s.profile.name = body.fullName;
      s.profile.displayName = body.fullName;
    }
    if (body.language === "en" || body.language === "si") s.profile.language = body.language;
    if (body.examYear !== undefined && body.examYear !== "") {
      const y = Number(body.examYear);
      if (Number.isInteger(y)) s.profile.examYear = String(y);
    }
    if (typeof body.examDate === "string") s.profile.examDate = body.examDate;
    if (body.dailyStudyTarget !== undefined) {
      const v = Number(body.dailyStudyTarget);
      if (Number.isFinite(v)) s.profile.dailyStudyTarget = v;
    }
    if (typeof body.currentLevel === "string") s.profile.currentLevel = body.currentLevel;
    if (Array.isArray(body.weakTopics)) s.profile.weakTopics = body.weakTopics.map(String);
    s.profile.onboarded = true;
    s.profile.updatedAt = nowIso();
  });
  const p = getState().profile;
  const t = nowIso();
  return {
    status: 200,
    body: {
      profile: {
        id: uid(),
        userId: ME,
        fullName: p.fullName,
        language: p.language,
        examYear: p.examYear ? Number(p.examYear) || null : null,
        examDate: p.examDate ? new Date(p.examDate + "T00:00:00.000Z").toISOString() : null,
        examType: p.examType,
        dailyStudyTarget: p.dailyStudyTarget,
        weeklyStudyTarget: p.weeklyStudyTarget,
        targetGrade: p.targetGrade,
        currentLevel: p.currentLevel,
        preferredTime: p.preferredTime,
        weakTopics: p.weakTopics,
        subjects: p.subjects,
        onboarded: true,
        createdAt: t,
        updatedAt: t,
      },
    },
  };
}

// ---- Notepad ----

function serializeEntry(e: NotepadEntry): Record<string, unknown> {
  return {
    id: e.id,
    title: e.title,
    content: e.content,
    color: e.color,
    pinned: e.pinned,
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
  };
}

export function notepadGet(): Result {
  const entries = [...getState().notepad].sort(
    (a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt.localeCompare(a.updatedAt),
  );
  return { status: 200, body: { entries: entries.map(serializeEntry) } };
}

export function notepadPost(body: Record<string, unknown>): Result {
  const title = typeof body.title === "string" ? body.title : "";
  const content = typeof body.content === "string" ? body.content : "";
  const color = typeof body.color === "string" ? body.color : "";
  if (title.length > 200) return { status: 400, body: { error: "String must contain at most 200 character(s)" } };
  if (content.length > 50000) return { status: 400, body: { error: "String must contain at most 50000 character(s)" } };
  const t = nowIso();
  const entry: NotepadEntry = { id: uid(), title, content, color, pinned: false, createdAt: t, updatedAt: t };
  mutate((s) => s.notepad.push(entry));
  return { status: 201, body: { entry: serializeEntry(entry) } };
}

export function notepadPatch(body: Record<string, unknown>): Result {
  const id = String(body.id ?? "");
  const entry = getState().notepad.find((e) => e.id === id);
  if (!entry) return { status: 401, body: { error: "Unauthorized" } };
  if (body.title !== undefined) entry.title = String(body.title);
  if (body.content !== undefined) entry.content = String(body.content);
  if (body.color !== undefined) entry.color = String(body.color);
  if (body.pinned !== undefined) entry.pinned = body.pinned === true;
  entry.updatedAt = nowIso();
  mutate(() => undefined);
  return { status: 200, body: { entry: serializeEntry(entry) } };
}

export function notepadDelete(body: Record<string, unknown>): Result {
  const id = String(body.id ?? "");
  const entry = getState().notepad.find((e) => e.id === id);
  if (!entry) return { status: 401, body: { error: "Unauthorized" } };
  mutate((s) => {
    s.notepad = s.notepad.filter((e) => e.id !== id);
  });
  return { status: 200, body: { ok: true } };
}

// ---- AI notes (manual create offline) ----

function serializeNote(n: StoredNote): Record<string, unknown> {
  return { id: n.id, title: n.title, content: n.content, createdAt: n.createdAt };
}

export function notesGet(): Result {
  const notes = [...getState().notes].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return { status: 200, body: { notes: notes.map(serializeNote) } };
}

export function notesPost(body: Record<string, unknown>): Result {
  const topic = typeof body.topic === "string" ? body.topic : "";
  if (topic.length < 2) return { status: 400, body: { error: "Topic must be at least 2 characters" } };
  if (topic.length > 200) return { status: 400, body: { error: "Topic must be at most 200 characters" } };
  const manual = typeof body.content === "string" && body.content.trim() ? body.content : "";
  const prompt = typeof body.prompt === "string" ? body.prompt : "";
  const content = manual || `# ${topic}${prompt ? `\n\n${prompt}` : ""}`;
  const note: StoredNote = { id: uid(), title: topic, content, createdAt: nowIso() };
  mutate((s) => s.notes.push(note));
  return { status: 201, body: serializeNote(note) };
}

export function notesDelete(query: URLSearchParams): Result {
  const id = query.get("id");
  if (!id) return { status: 400, body: { error: "Note id is required" } };
  const note = getState().notes.find((n) => n.id === id);
  if (!note) return { status: 404, body: { error: "Note not found" } };
  mutate((s) => {
    s.notes = s.notes.filter((n) => n.id !== id);
  });
  return { status: 200, body: { success: true } };
}

// ---- Flashcards ----

function serializeDeckList(d: StoredDeck): Record<string, unknown> {
  return {
    id: d.id,
    title: d.title,
    language: d.language,
    source: d.source,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
    cardCount: d.cards.length,
  };
}

export function flashcardsGet(query: URLSearchParams): Result {
  const id = query.get("id");
  const state = getState();
  if (id) {
    const deck = state.decks.find((d) => d.id === id);
    if (!deck) return { status: 401, body: { error: "Unauthorized" } };
    return {
      status: 200,
      body: {
        deck: {
          id: deck.id,
          title: deck.title,
          language: deck.language,
          source: deck.source,
          createdAt: deck.createdAt,
          updatedAt: deck.updatedAt,
          cards: deck.cards.map((c) => ({ id: c.id, front: c.front, back: c.back })),
        },
      },
    };
  }
  const decks = [...state.decks].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map(serializeDeckList);
  return { status: 200, body: { decks } };
}

export function flashcardsPost(body: Record<string, unknown>): Result {
  if (body.mode === "generate") {
    // AI generation is not part of the offline build.
    return { status: 503, body: { error: "AI flashcards are not configured. Add GEMINI_API_KEY." } };
  }
  const title = typeof body.title === "string" ? body.title : "";
  if (title.length < 1 || title.length > 200) return { status: 400, body: { error: "String must contain at least 1 character(s)" } };
  const language = body.language === "Sinhala" ? "Sinhala" : "English";
  const rawCards = Array.isArray(body.cards ? body.cards : []) ? (body.cards as Record<string, unknown>[]) : [];
  if (rawCards.length < 1 || rawCards.length > 100) {
    return { status: 400, body: { error: "Array must contain at least 1 item(s)" } };
  }
  const t = nowIso();
  const deck: StoredDeck = {
    id: uid(),
    title,
    language,
    source: "manual",
    createdAt: t,
    updatedAt: t,
    cards: rawCards.map((c) => ({ id: uid(), front: String(c.front ?? ""), back: String(c.back ?? "") })),
  };
  mutate((s) => s.decks.push(deck));
  return { status: 201, body: { deck: { id: deck.id, title: deck.title, language: deck.language } } };
}

export function flashcardsPatch(body: Record<string, unknown>): Result {
  const id = String(body.id ?? "");
  const deck = getState().decks.find((d) => d.id === id);
  if (!deck) return { status: 401, body: { error: "Unauthorized" } };
  if (typeof body.title === "string") deck.title = body.title;
  deck.updatedAt = nowIso();
  mutate(() => undefined);
  return { status: 200, body: { deck: { id: deck.id, title: deck.title } } };
}

export function flashcardsDelete(body: Record<string, unknown>): Result {
  const id = String(body.id ?? "");
  const deck = getState().decks.find((d) => d.id === id);
  if (!deck) return { status: 401, body: { error: "Unauthorized" } };
  mutate((s) => {
    s.decks = s.decks.filter((d) => d.id !== id);
  });
  return { status: 200, body: { ok: true } };
}

// ---- Exam marks ----

const SUBJECT_IDS = ["bio", "chem", "phy", "agri", "math", "ict", "dt"];

function serializeMark(m: StoredMark): Record<string, unknown> {
  return { id: m.id, subjectId: m.subjectId, score: m.score, total: m.total, examDate: m.examDate, name: m.name };
}

export function marksGet(): Result {
  const marks = [...getState().marks].sort((a, b) => a.examDate.localeCompare(b.examDate));
  return { status: 200, body: { marks: marks.map(serializeMark) } };
}

export function marksPost(body: Record<string, unknown>): Result {
  const subjectId = String(body.subjectId ?? "");
  if (!SUBJECT_IDS.includes(subjectId)) return { status: 400, body: { error: `Invalid subject: expected one of ${SUBJECT_IDS.join(", ")}` } };
  const total = Number(body.total);
  if (!Number.isInteger(total) || total <= 0) return { status: 400, body: { error: "Total must be a positive integer" } };
  const examDate = String(body.examDate ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(examDate)) return { status: 400, body: { error: "Date must be YYYY-MM-DD" } };
  const name = typeof body.name === "string" ? body.name.slice(0, 200) : "";
  const mark: StoredMark = { id: uid(), subjectId, score: null, total, examDate, name };
  mutate((s) => s.marks.push(mark));
  return { status: 201, body: { mark: serializeMark(mark) } };
}

export function marksPatch(body: Record<string, unknown>): Result {
  const id = String(body.id ?? "");
  const mark = getState().marks.find((m) => m.id === id);
  if (!mark) return { status: 401, body: { error: "Unauthorized" } };
  if (body.subjectId !== undefined) mark.subjectId = String(body.subjectId);
  if (body.total !== undefined) mark.total = Number(body.total);
  if (body.examDate !== undefined) mark.examDate = String(body.examDate);
  if (body.name !== undefined) mark.name = String(body.name).slice(0, 200);
  mutate(() => undefined);
  return { status: 200, body: { mark: serializeMark(mark) } };
}

export function marksDelete(body: Record<string, unknown>): Result {
  const id = String(body.id ?? "");
  const mark = getState().marks.find((m) => m.id === id);
  if (!mark) return { status: 401, body: { error: "Unauthorized" } };
  mutate((s) => {
    s.marks = s.marks.filter((m) => m.id !== id);
  });
  return { status: 200, body: { ok: true } };
}

// ---- Past papers ----

const PAPERS = [
  { year: 2024, paper: "A/L Biology Paper I (MCQ)", total: 50, timeMinutes: 60 },
  { year: 2023, paper: "A/L Biology Paper I (MCQ)", total: 50, timeMinutes: 60 },
  { year: 2022, paper: "A/L Biology Paper I (MCQ)", total: 50, timeMinutes: 60 },
  { year: 2021, paper: "A/L Biology Paper I (MCQ)", total: 50, timeMinutes: 60 },
  { year: 2020, paper: "A/L Biology Paper I (MCQ)", total: 50, timeMinutes: 60 },
  { year: 2024, paper: "A/L Biology Paper II (Structured & Essay)", total: 150, timeMinutes: 180 },
  { year: 2023, paper: "A/L Biology Paper II (Structured & Essay)", total: 150, timeMinutes: 180 },
];

function serializeRecord(r: StoredPastRecord): Record<string, unknown> {
  return { id: r.id, paperType: r.paperType, score: r.score, total: r.total, examDate: r.examDate };
}

export function pastPapersGet(): Result {
  const records = [...getState().pastRecords].sort((a, b) => b.examDate.localeCompare(a.examDate));
  return { status: 200, body: { papers: PAPERS, records: records.map(serializeRecord) } };
}

export function pastPapersPost(body: Record<string, unknown>): Result {
  const year = Number(body.year);
  const paperType = String(body.paperType ?? "");
  const score = Number(body.score ?? 0);
  const total = Number(body.total ?? 50);
  if (!Number.isInteger(year) || year < 1990 || year > 2100) return { status: 400, body: { error: "Year must be between 1990 and 2100" } };
  if (paperType.length < 2 || paperType.length > 100) return { status: 400, body: { error: "Paper type must be 2-100 characters" } };
  if (!Number.isFinite(score) || score < 0 || score > 200) return { status: 400, body: { error: "Score must be between 0 and 200" } };
  if (!Number.isFinite(total) || total < 1 || total > 200) return { status: 400, body: { error: "Total must be between 1 and 200" } };
  const matched = PAPERS.find((p) => p.year === year && p.paper === paperType);
  const record: StoredPastRecord = {
    id: uid(),
    paperType: matched ? `${matched.paper} (${matched.year})` : paperType,
    score,
    total,
    examDate: typeof body.examDate === "string" && body.examDate ? body.examDate : nowIso(),
  };
  mutate((s) => s.pastRecords.push(record));
  return { status: 201, body: { record: serializeRecord(record) } };
}

// ---- Work log ----

export function workLogGet(): Result {
  const state = getState();
  const works = [...state.workLogs].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 60);
  const dayMap = new Map<string, { id: string; minutes: number; note?: string }>();
  for (const w of works) {
    const cur = dayMap.get(w.date);
    if (cur) cur.minutes += w.minutes;
    else dayMap.set(w.date, { id: w.id, minutes: w.minutes, ...(w.note ? { note: w.note } : {}) });
  }
  const logs = [...dayMap.entries()].map(([date, v]) => ({
    id: v.id,
    date,
    minutes: v.minutes,
    note: v.note ?? undefined,
  }));
  const today = dateKeyOf(new Date());
  const todayMinutes = dayMap.get(today) ?? 0;
  const totalMinutes = works.reduce((s, w) => s + w.minutes, 0);
  const communityMinutes = state.workLogs.reduce((s, w) => s + w.minutes, 0);
  return { status: 200, body: { logs, todayMinutes, totalMinutes, communityMinutes } };
}

export function workLogPost(body: Record<string, unknown>): Result {
  const date = String(body.date ?? "");
  const minutes = Number(body.minutes);
  const note = typeof body.note === "string" ? body.note : undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { status: 400, body: { error: { date: ["Invalid date"] } } };
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440) {
    return { status: 400, body: { error: { minutes: ["Number must be between 1 and 1440"] } } };
  }
  if (note !== undefined && note.length > 200) return { status: 400, body: { error: { note: ["Note must be at most 200 characters"] } } };
  mutate((s) => {
    const existing = s.workLogs.find((w) => w.date === date);
    if (existing) {
      existing.minutes += minutes;
      if (note) existing.note = note;
    } else {
      s.workLogs.push({ id: uid(), date, minutes, ...(note ? { note } : {}) });
    }
  });
  return { status: 200, body: { ok: true } };
}

export function workLogDelete(query: URLSearchParams): Result {
  const id = query.get("id");
  if (!id) return { status: 400, body: { error: "Missing id" } };
  const entry = getState().workLogs.find((w) => w.id === id);
  if (!entry) return { status: 404, body: { error: "Work log entry not found" } };
  mutate((s) => {
    s.workLogs = s.workLogs.filter((w) => w.id !== id);
  });
  return { status: 200, body: { ok: true } };
}

// ---- Classes ----

const CLASS_COLORS: Record<string, string> = {
  bio: "#10B981",
  chem: "#06B6D4",
  phy: "#8B5CF6",
  agri: "#F59E0B",
  math: "#EF4444",
  ict: "#EC4899",
  dt: "#0EA5E9",
};

export function classesGet(): Result {
  const classes = [...getState().classes].sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.startMinute - b.startMinute);
  // `attendance` rides along so the classes page can render stats without a
  // second request; older consumers ignore the extra key.
  return { status: 200, body: { classes, attendance: getState().classAttendance } };
}

export function classesPost(body: Record<string, unknown>): Result {
  const subjectName = String(body.subjectName ?? "");
  const dayOfWeek = Number(body.dayOfWeek);
  const startMinute = Number(body.startMinute);
  const endMinute = Number(body.endMinute);
  if (subjectName.length < 1 || subjectName.length > 100) return { status: 400, body: { error: "Subject name must be 1-100 characters" } };
  if (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) return { status: 400, body: { error: "Invalid day" } };
  if (!Number.isInteger(startMinute) || startMinute < 0 || startMinute > 1439) return { status: 400, body: { error: "Invalid start time" } };
  if (!Number.isInteger(endMinute) || endMinute < 1 || endMinute > 1440) return { status: 400, body: { error: "Invalid end time" } };
  if (endMinute <= startMinute) return { status: 400, body: { error: "End time must be after start time" } };
  const cls = {
    id: uid(),
    subjectName,
    dayOfWeek,
    startMinute,
    endMinute,
    color: CLASS_COLORS[subjectName.toLowerCase()] ?? "#10B981",
  };
  mutate((s) => s.classes.push(cls));
  return { status: 201, body: { cls } };
}

export function classesDelete(query: URLSearchParams): Result {
  const id = query.get("id");
  if (!id) return { status: 400, body: { error: "Missing id" } };
  const cls = getState().classes.find((c) => c.id === id);
  if (!cls) return { status: 404, body: { error: "Class not found" } };
  mutate((s) => {
    s.classes = s.classes.filter((c) => c.id !== id);
  });
  return { status: 200, body: { ok: true } };
}

// Marks one class occurrence (classId + date) as attended or missed. Upserts so
// tapping a chip again, or the page's auto-miss pass, never creates duplicates.
export function attendancePost(body: Record<string, unknown>): Result {
  const classId = String(body.classId ?? "");
  const date = String(body.date ?? "");
  const status = body.status;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { status: 400, body: { error: "Date must be YYYY-MM-DD" } };
  if (status !== "ATTENDED" && status !== "MISSED") {
    return { status: 400, body: { error: "Status must be ATTENDED or MISSED" } };
  }
  if (!getState().classes.some((c) => c.id === classId)) {
    return { status: 404, body: { error: "Class not found" } };
  }
  let row: StoredClassAttendance | undefined;
  mutate((s) => {
    const existing = s.classAttendance.find((r) => r.classId === classId && r.date === date);
    if (existing) {
      existing.status = status;
      row = existing;
    } else {
      row = { classId, date, status };
      s.classAttendance.push(row);
    }
  });
  return { status: 200, body: { record: row! } };
}

// ---- Content progress ----

export function progressGet(): Result {
  const progress = [...getState().progress].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return { status: 200, body: { progress } };
}

export function progressPatch(body: Record<string, unknown>): Result {
  const topicId = String(body.topicId ?? "");
  if (!topicId) return { status: 400, body: { error: { topicId: ["topicId is required"] } } };
  const subtopicId = typeof body.subtopicId === "string" ? body.subtopicId : "";
  const now = nowIso();
  let result: unknown = null;
  mutate((s) => {
    const existing = s.progress.find((p) => p.topicId === topicId && p.subtopicId === subtopicId);
    if (existing) {
      if (typeof body.status === "string") existing.status = body.status as typeof existing.status;
      if (body.masteryScore !== undefined) existing.masteryScore = Number(body.masteryScore);
      if (body.completionPercent !== undefined) existing.completionPercent = Number(body.completionPercent);
      if (body.studyMinutes !== undefined) existing.studyMinutes = Number(body.studyMinutes);
      if (typeof body.confidence === "string") existing.confidence = body.confidence;
      existing.lastStudiedAt = now;
      existing.updatedAt = now;
      result = existing;
    } else {
      const row = {
        id: uid(),
        userId: ME,
        topicId,
        subtopicId,
        status: (typeof body.status === "string" ? body.status : "IN_PROGRESS") as "NOT_STARTED" | "IN_PROGRESS" | "REVIEW" | "MASTERED",
        masteryScore: body.masteryScore !== undefined ? Number(body.masteryScore) : 0,
        completionPercent: body.completionPercent !== undefined ? Number(body.completionPercent) : 0,
        questionsAttempted: 0,
        questionsCorrect: 0,
        studyMinutes: body.studyMinutes !== undefined ? Number(body.studyMinutes) : 0,
        confidence: typeof body.confidence === "string" ? body.confidence : null,
        lastStudiedAt: now,
        lastReviewedAt: null,
        createdAt: now,
        updatedAt: now,
      };
      s.progress.push(row);
      result = row;
    }
  });
  return { status: 200, body: { progress: result ?? {} } };
}

// ---- Analytics ----

export async function analytics(): Promise<Result> {
  const db = await getContentDb();
  const state = getState();
  const last30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const last30Key = dateKeyOf(last30);

  const quizzes = [...state.quizzes].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const topicPerf = topicPerformances(state, db);
  const weakTopics = weakTopicRows(state, db, 8);
  const wrongIds = wrongQuestionIds(state);
  const wrongSummaries = wrongIds
    .slice(0, 20)
    .map((id) => db.questions.find((q) => q.id === id))
    .filter((q): q is NonNullable<typeof q> => Boolean(q && q.status === "PUBLISHED"));

  const completedQuizzes = quizzes.filter((q) => q.status === "COMPLETED" && q.total > 0);
  const totalQuestionsAnswered = topicPerf.reduce((s, p) => s + p.attempted, 0);
  const totalCorrect = topicPerf.reduce((s, p) => s + Math.round(p.accuracy * p.attempted), 0);
  const overallAccuracy = totalQuestionsAnswered > 0 ? Math.round((totalCorrect / totalQuestionsAnswered) * 100) : 0;
  const avgScore =
    completedQuizzes.length > 0
      ? Math.round(completedQuizzes.reduce((s, q) => s + (q.score / q.total) * 100, 0) / completedQuizzes.length)
      : 0;
  const totalMistakes = totalQuestionsAnswered - totalCorrect;

  const studySessions = [...state.studySessions].sort((a, b) => a.completedAt.localeCompare(b.completedAt));
  const workLogs30 = state.workLogs.filter((w) => w.date >= last30Key).sort((a, b) => a.date.localeCompare(b.date));
  const totalStudyMinutes =
    studySessions.reduce((s, x) => s + x.minutes, 0) + workLogs30.reduce((s, x) => s + x.minutes, 0);

  const scoreTrend = completedQuizzes.slice(-10).map((q) => ({
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
    dayMap.set(dateKeyOf(new Date(Date.now() - i * 24 * 60 * 60 * 1000)), 0);
  }
  for (const s of studySessions) {
    if (s.completedAt >= last30.toISOString()) {
      const key = s.completedAt.slice(0, 10);
      if (dayMap.has(key)) dayMap.set(key, (dayMap.get(key) ?? 0) + s.minutes);
    }
  }
  for (const w of workLogs30) {
    if (dayMap.has(w.date)) dayMap.set(w.date, (dayMap.get(w.date) ?? 0) + w.minutes);
  }
  for (const [date, minutes] of dayMap) studyByDay.push({ date, minutes });

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

  const valid = getState().marks.filter((m) => m.total > 0);
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
  const examSubject = subjectOrder.map((s) => ({ subject: s, fullMarks: subjectMap.get(s)!.total, count: subjectMap.get(s)!.count }));
  const examTrend = [...valid]
    .sort((a, b) => a.examDate.localeCompare(b.examDate))
    .map((m) => ({
      id: m.id,
      subject: m.subjectId,
      name: m.name || m.subjectId,
      fullMarks: m.total,
      date: m.examDate,
    }));
  const totalFullMarks = valid.reduce((s, m) => s + m.total, 0);

  const communityMinutes = state.workLogs.reduce((s, w) => s + w.minutes, 0);
  const communityActiveUsers = state.workLogs.length > 0 ? 1 : 0;
  const today = dateKeyOf(new Date());
  const todayMinutes = state.workLogs.filter((w) => w.date === today).reduce((s, w) => s + w.minutes, 0);
  const p = state.profile;
  const leaderboard =
    communityActiveUsers > 0
      ? [{ id: ME, name: p.name || p.email.split("@")[0], todayMinutes }]
      : [];

  return {
    status: 200,
    body: {
      stats: {
        quizzesCompleted: completedQuizzes.length,
        totalQuizzes: quizzes.length,
        avgScore,
        totalQuestionsAnswered,
        overallAccuracy,
        totalMistakes,
        weakTopicsCount: weakTopics.length,
        totalStudyMinutes,
        aiSessions: 0,
        conversations: 0,
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
      community: { totalMinutes: communityMinutes, activeUsers: communityActiveUsers, leaderboard },
    },
  };
}

export type { OfflineState, ContentDb };
