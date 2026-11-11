// Bidirectional bridge between the offline APK's single localStorage blob
// (`biopulse-offline-v1`, see src/lib/offline-api/store.ts) and the web's
// Postgres tables.
//
// The phone runs fully offline and keeps every "server" record in one JSON blob.
// The web reads/writes dedicated Prisma tables. This module translates the blob
// into those tables (so the phone's data shows up on the web) and rebuilds the
// blob from the tables (so the web's data shows up on the phone).
//
// Mapping notes:
//  - exam marks and past-paper records share the `MarkRecord` table. Exam marks
//    always carry a subjectId; past-paper records never do (name holds the paper
//    title). That is how the two are told apart on the way back.
//  - a few client-only collections (quizzes, attempts, class attendance, chat,
//    statuses) have no server table; they are round-tripped through the
//    AccountSnapshot key/value store under reserved `bp.x.*` keys.

import { db } from "@/lib/db";

type AnyRecord = Record<string, unknown>;

const X_QUIZZES = "bp.x.quizzes";
const X_ATTEMPTS = "bp.x.attempts";
const X_ATTENDANCE = "bp.x.classAttendance";
const X_CHAT = "bp.x.chatMessages";
const X_STATUSES = "bp.x.statuses";

// ---- coercion helpers ----

function str(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}
function num(v: unknown, fallback = 0): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}
function bool(v: unknown): boolean {
  return v === true;
}
function list(v: unknown): AnyRecord[] {
  return Array.isArray(v) ? v.filter((x): x is AnyRecord => !!x && typeof x === "object") : [];
}
function strList(v: unknown): string[] {
  return Array.isArray(v) ? v.map((x) => String(x)) : [];
}
function intOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const x = Number(v);
  return Number.isInteger(x) ? x : null;
}
function dateOrNull(v: unknown): Date | null {
  if (typeof v !== "string" || !v) return null;
  const d = new Date(v.length <= 10 ? `${v}T00:00:00.000Z` : v);
  return Number.isNaN(d.getTime()) ? null : d;
}
function isoOrNull(v: unknown): string | null {
  const d = dateOrNull(v);
  return d ? d.toISOString() : null;
}

// ---- apply: blob -> Postgres ----

async function applyUnmapped(userId: string, blob: AnyRecord): Promise<void> {
  const reserved = [
    X_QUIZZES,
    X_ATTEMPTS,
    X_ATTENDANCE,
    X_CHAT,
    X_STATUSES,
  ];
  const existing = await db.accountSnapshot.findUnique({ where: { userId } });
  const data = (existing?.data as { updatedAt?: number; kv?: Record<string, unknown> }) ?? {};
  const kv: Record<string, unknown> = { ...(data.kv ?? {}) };
  const now = Date.now();

  const pairs: [string, unknown][] = [
    [X_QUIZZES, blob.quizzes],
    [X_ATTEMPTS, blob.attempts],
    [X_ATTENDANCE, blob.classAttendance],
    [X_CHAT, blob.chatMessages],
    [X_STATUSES, blob.statuses],
  ];
  for (const [key, value] of pairs) {
    if (value === undefined) continue;
    kv[key] = { v: JSON.stringify(list(value)), t: now };
  }
  for (const key of reserved) {
    if (!(key in kv)) kv[key] = { v: "[]", t: now };
  }

  const next = { updatedAt: now, kv };
  await db.accountSnapshot.upsert({
    where: { userId },
    create: { userId, data: next as never },
    update: { data: next as never },
  });
}

// ---- deletion tombstones (mirrors the client keyers in src/lib/blob-sync.ts) ----

type DelMap = Record<string, Record<string, string>>;
type Seen = Record<string, Record<string, number>>;

const TRACKED_KEYERS: Record<string, (x: AnyRecord) => string> = {
  notes: (x) => str(x.id),
  notepad: (x) => str(x.id),
  decks: (x) => str(x.id),
  marks: (x) => str(x.id),
  pastRecords: (x) => str(x.id),
  classes: (x) => str(x.id),
  plannerSessions: (x) => str(x.id),
  progress: (x) => str(x.id),
  studySessions: (x) => str(x.id),
  workLogs: (x) => str(x.date),
};
const TRACKED_STAMP: Record<string, string[]> = {
  notes: ["createdAt"],
  notepad: ["updatedAt", "createdAt"],
  decks: ["updatedAt", "createdAt"],
  marks: ["examDate"],
  pastRecords: ["examDate"],
  classes: [],
  plannerSessions: ["completedAt"],
  progress: ["updatedAt"],
  studySessions: ["completedAt"],
  workLogs: ["date"],
};
const TRACKED = Object.keys(TRACKED_KEYERS);

function stampOf(x: AnyRecord, fields: string[]): number {
  let best = 0;
  for (const f of fields) {
    const v = x[f];
    if (typeof v === "string" && v) {
      const t = Date.parse(v);
      if (Number.isFinite(t)) best = Math.max(best, t);
    }
  }
  return best;
}

function seenOf(blob: AnyRecord): Seen {
  const seen: Seen = {};
  for (const name of TRACKED) {
    const o: Record<string, number> = {};
    for (const it of list(blob[name])) {
      const k = TRACKED_KEYERS[name](it);
      if (k) o[k] = stampOf(it, TRACKED_STAMP[name]);
    }
    seen[name] = o;
  }
  return seen;
}

function unionDeleted(a: DelMap | undefined, b: unknown): DelMap {
  const out: DelMap = {};
  for (const src of [a, b]) {
    if (!src || typeof src !== "object") continue;
    for (const [name, m] of Object.entries(src as DelMap)) {
      if (!m || typeof m !== "object") continue;
      if (!out[name]) out[name] = {};
      for (const [k, v] of Object.entries(m)) {
        if (typeof v !== "string") continue;
        const cur = out[name][k];
        if (!cur || Date.parse(v) > Date.parse(cur)) out[name][k] = v;
      }
    }
  }
  return out;
}

function dropTombstoned(out: AnyRecord, deleted: DelMap): void {
  for (const name of TRACKED) {
    const d = deleted[name];
    if (!d) continue;
    const fields = TRACKED_STAMP[name];
    out[name] = list(out[name]).filter((it) => {
      const k = TRACKED_KEYERS[name](it);
      if (!k || !(k in d)) return true;
      const dts = Date.parse(d[k]);
      if (Number.isFinite(dts) && dts >= stampOf(it, fields)) return false;
      if (Number.isFinite(dts)) delete d[k];
      return true;
    });
  }
}

async function readMeta(userId: string): Promise<{ deleted: DelMap; seen: Seen }> {
  const row = await db.accountSnapshot.findUnique({ where: { userId } });
  const data = (row?.data as { kv?: Record<string, unknown> }) ?? {};
  const kv = data.kv ?? {};
  return {
    deleted: (kv["bp.deleted"] as DelMap) ?? {},
    seen: (kv["bp.seen"] as Seen) ?? {},
  };
}

async function writeMeta(userId: string, deleted: DelMap, seen: Seen): Promise<void> {
  const row = await db.accountSnapshot.findUnique({ where: { userId } });
  const data = (row?.data as { updatedAt?: number; kv?: Record<string, unknown> }) ?? {};
  const kv: Record<string, unknown> = { ...(data.kv ?? {}) };
  kv["bp.deleted"] = deleted;
  kv["bp.seen"] = seen;
  const next = { updatedAt: Date.now(), kv };
  await db.accountSnapshot.upsert({
    where: { userId },
    create: { userId, data: next as never },
    update: { data: next as never },
  });
}

export async function applyBlob(userId: string, raw: unknown): Promise<void> {
  const blob = (raw && typeof raw === "object" ? raw : {}) as AnyRecord;

  // ---- profile (singleton) ----
  const p = (blob.profile ?? {}) as AnyRecord;
  if (Object.keys(p).length > 0) {
    const studentData = {
      fullName: str(p.fullName),
      language: str(p.language, "en") === "si" ? "si" : "en",
      examYear: intOrNull(p.examYear),
      examDate: dateOrNull(p.examDate),
      examType: str(p.examType, "A/L Biology"),
      dailyStudyTarget: num(p.dailyStudyTarget, 4),
      weeklyStudyTarget: num(p.weeklyStudyTarget, 28),
      targetGrade: str(p.targetGrade, "A"),
      currentLevel: str(p.currentLevel, "intermediate"),
      preferredTime: str(p.preferredTime, "morning"),
      weakTopics: strList(p.weakTopics),
      subjects: strList(p.subjects),
      onboarded: bool(p.onboarded),
    };
    await db.studentProfile.upsert({
      where: { userId },
      create: { userId, ...studentData },
      update: studentData,
    });

    const userData: AnyRecord = {};
    if (typeof p.name === "string" && p.name) userData.name = p.name;
    if (typeof p.displayName === "string") userData.displayName = p.displayName;
    if (typeof p.about === "string") userData.about = p.about;
    const avatar =
      typeof p.avatarUrl === "string" && p.avatarUrl
        ? p.avatarUrl
        : typeof p.image === "string" && p.image
          ? p.image
          : "";
    if (avatar) {
      userData.avatarUrl = avatar;
      userData.image = avatar;
    }
    if (Object.keys(userData).length > 0) {
      await db.user.update({ where: { id: userId }, data: userData }).catch(() => {});
    }
  }

  // ---- settings (singleton) ----
  const st = (blob.settings ?? {}) as AnyRecord;
  if (Object.keys(st).length > 0) {
    const data = {
      browserEnabled: bool(st.browserEnabled),
      telegramEnabled: bool(st.telegramEnabled),
      telegramToken: str(st.telegramToken),
      telegramChatId: str(st.telegramChatId),
      telegramAll: bool(st.telegramAll),
      ntfyEnabled: bool(st.ntfyEnabled),
      ntfyTopic: str(st.ntfyTopic),
      fcmToken: str(st.fcmToken),
    };
    await db.notificationPreference.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
    });
  }

  // ---- notepad ----
  const notepad = list(blob.notepad);
  if (notepad.length > 0) {
    await db.notepadEntry.deleteMany({ where: { userId } });
    await db.notepadEntry.createMany({
      data: notepad.map((e) => ({
        id: str(e.id) || undefined,
        userId,
        title: str(e.title),
        content: str(e.content),
        color: str(e.color),
        pinned: bool(e.pinned),
        createdAt: dateOrNull(e.createdAt) ?? new Date(),
        updatedAt: dateOrNull(e.updatedAt) ?? new Date(),
      })),
      skipDuplicates: true,
    });
  }

  // ---- notes ----
  const notes = list(blob.notes);
  if (notes.length > 0) {
    await db.note.deleteMany({ where: { userId } });
    await db.note.createMany({
      data: notes.map((e) => ({
        id: str(e.id) || undefined,
        userId,
        title: str(e.title),
        content: str(e.content),
        createdAt: dateOrNull(e.createdAt) ?? new Date(),
      })),
      skipDuplicates: true,
    });
  }

  // ---- flashcard decks + cards ----
  const decks = list(blob.decks);
  if (decks.length > 0) {
    await db.flashcardDeck.deleteMany({ where: { userId } });
    for (const d of decks) {
      const created = await db.flashcardDeck.create({
        data: {
          id: str(d.id) || undefined,
          userId,
          title: str(d.title, "Untitled"),
          language: str(d.language, "English"),
          source: str(d.source, "manual"),
          createdAt: dateOrNull(d.createdAt) ?? new Date(),
          updatedAt: dateOrNull(d.updatedAt) ?? new Date(),
        },
      });
      const cards = list(d.cards);
      if (cards.length > 0) {
        await db.flashcard.createMany({
          data: cards.map((c, i) => ({
            id: str(c.id) || undefined,
            deckId: created.id,
            front: str(c.front),
            back: str(c.back),
            order: i,
          })),
          skipDuplicates: true,
        });
      }
    }
  }

  // ---- exam marks + past-paper records (shared MarkRecord table) ----
  const marks = list(blob.marks);
  const pastRecords = list(blob.pastRecords);
  if (marks.length > 0 || pastRecords.length > 0) {
    await db.markRecord.deleteMany({ where: { userId } });
    if (marks.length > 0) {
      await db.markRecord.createMany({
        data: marks.map((m) => ({
          id: str(m.id) || undefined,
          userId,
          subjectId: str(m.subjectId) || null,
          score: intOrNull(m.score),
          total: num(m.total, 100),
          name: str(m.name),
          examDate: dateOrNull(m.examDate) ?? new Date(),
        })),
        skipDuplicates: true,
      });
    }
    if (pastRecords.length > 0) {
      await db.markRecord.createMany({
        data: pastRecords.map((r) => ({
          id: str(r.id) || undefined,
          userId,
          subjectId: null,
          score: intOrNull(r.score),
          total: num(r.total, 50),
          name: str(r.paperType),
          examDate: dateOrNull(r.examDate) ?? new Date(),
        })),
        skipDuplicates: true,
      });
    }
  }

  // ---- work logs ----
  const workLogs = list(blob.workLogs);
  if (workLogs.length > 0) {
    await db.workLog.deleteMany({ where: { userId } });
    await db.workLog.createMany({
      data: workLogs
        .map((w) => {
          const date = dateOrNull(w.date);
          if (!date) return null;
          return {
            id: str(w.id) || undefined,
            userId,
            date,
            minutes: Math.max(1, Math.min(1440, num(w.minutes, 1))),
            note: typeof w.note === "string" ? w.note : null,
          };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null),
      skipDuplicates: true,
    });
  }

  // ---- classes ----
  const classes = list(blob.classes);
  if (classes.length > 0) {
    await db.classSession.deleteMany({ where: { userId } });
    await db.classSession.createMany({
      data: classes.map((c) => ({
        id: str(c.id) || undefined,
        userId,
        subjectName: str(c.subjectName, "Class"),
        dayOfWeek: Math.max(0, Math.min(6, num(c.dayOfWeek, 0))),
        startMinute: Math.max(0, Math.min(1439, num(c.startMinute, 0))),
        endMinute: Math.max(1, Math.min(1440, num(c.endMinute, 60))),
        color: typeof c.color === "string" ? c.color : null,
      })),
      skipDuplicates: true,
    });
  }

  // ---- planner prefs / days / sessions ----
  const prefs = blob.plannerPrefs as AnyRecord | null | undefined;
  if (prefs && typeof prefs === "object") {
    const data = {
      weeklyTargetMin: num(prefs.weeklyTargetMin, 0),
      sessionLengthMin: num(prefs.sessionLengthMin, 60),
      breakAfterMin: num(prefs.breakAfterMin, 60),
      breakDurationMin: num(prefs.breakDurationMin, 10),
      timeFormat: str(prefs.timeFormat, "24h") === "12h" ? "12h" : "24h",
      subjectPriorities: (prefs.subjectPriorities ?? []) as never,
      studyTypeWeight: (prefs.studyTypes ?? []) as never,
      weakTopics: strList(prefs.weakTopics),
    };
    await db.timetablePref.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
    });
  }

  const days = list(blob.plannerDays);
  if (days.length > 0) {
    await db.timetableDay.deleteMany({ where: { userId } });
    await db.timetableDay.createMany({
      data: days.map((d) => ({
        userId,
        dayOfWeek: Math.max(0, Math.min(6, num(d.dayOfWeek, 0))),
        enabled: bool(d.enabled),
        dailyTargetMin: num(d.dailyTargetMin, 0),
        blocks: ((d.blocks as unknown) ?? []) as never,
      })),
      skipDuplicates: true,
    });
  }

  const sessions = list(blob.plannerSessions);
  if (sessions.length > 0) {
    await db.plannerSession.deleteMany({ where: { userId } });
    await db.plannerSession.createMany({
      data: sessions.map((s) => ({
        id: str(s.id) || undefined,
        userId,
        subjectId: str(s.subjectId, "study"),
        subjectName: str(s.subjectName),
        topicId: typeof s.topicId === "string" ? s.topicId : null,
        topicTitle: typeof s.topicTitle === "string" ? s.topicTitle : null,
        date: dateOrNull(s.date),
        dayOfWeek: intOrNull(s.dayOfWeek),
        startMinute: Math.max(0, Math.min(1439, num(s.startMinute, 0))),
        endMinute: Math.max(1, Math.min(1440, num(s.endMinute, 60))),
        type: str(s.type, "Learn"),
        priority: str(s.priority, "Medium"),
        status: str(s.status, "scheduled"),
        recurrence: str(s.recurrence, "Once"),
        recurrenceDays: strList(s.recurrenceDays).map(Number) as never,
        reminderMin: num(s.reminderMin, 0),
        notes: str(s.notes),
      })),
      skipDuplicates: true,
    });
  }

  // ---- study sessions (best effort: skip rows whose subject FK is unknown) ----
  const studySessions = list(blob.studySessions);
  if (studySessions.length > 0) {
    await db.studySession.deleteMany({ where: { userId } });
    for (const s of studySessions) {
      try {
        await db.studySession.create({
          data: {
            id: str(s.id) || undefined,
            userId,
            subjectId: null,
            minutes: Math.max(1, num(s.minutes, 1)),
            completedAt: dateOrNull(s.completedAt) ?? new Date(),
          },
        });
      } catch {
        /* FK / duplicate — skip this row */
      }
    }
  }

  // ---- topic progress (best effort: topic FK may not exist server-side) ----
  const progressRows = list(blob.progress);
  if (progressRows.length > 0) {
    await db.userTopicProgress.deleteMany({ where: { userId } });
    for (const r of progressRows) {
      const topicId = str(r.topicId);
      if (!topicId) continue;
      try {
        await db.userTopicProgress.create({
          data: {
            id: str(r.id) || undefined,
            userId,
            topicId,
            subtopicId: typeof r.subtopicId === "string" && r.subtopicId ? r.subtopicId : null,
            status: str(r.status, "NOT_STARTED"),
            masteryScore: num(r.masteryScore, 0),
            completionPercent: num(r.completionPercent, 0),
            questionsAttempted: num(r.questionsAttempted, 0),
            questionsCorrect: num(r.questionsCorrect, 0),
            studyMinutes: num(r.studyMinutes, 0),
            confidence: typeof r.confidence === "string" ? r.confidence : "low",
            lastStudiedAt: dateOrNull(r.lastStudiedAt),
            lastReviewedAt: dateOrNull(r.lastReviewedAt),
          },
        });
      } catch {
        /* unknown topic — skip */
      }
    }
  }

  await applyUnmapped(userId, blob);

  // Persist merged deletion tombstones and the id snapshot used to detect
  // deletions that happen on the web between phone syncs.
  const meta = await readMeta(userId);
  await writeMeta(userId, unionDeleted(meta.deleted, blob.deleted), seenOf(blob));
}

// ---- build: Postgres -> blob ----

async function readUnmapped(userId: string): Promise<Record<string, AnyRecord[]>> {
  const row = await db.accountSnapshot.findUnique({ where: { userId } });
  const data = (row?.data as { kv?: Record<string, { v?: string | null }> }) ?? {};
  const kv = data.kv ?? {};
  const read = (key: string): AnyRecord[] => {
    const entry = kv[key];
    if (!entry || typeof entry.v !== "string") return [];
    try {
      const parsed = JSON.parse(entry.v);
      return list(parsed);
    } catch {
      return [];
    }
  };
  return {
    quizzes: read(X_QUIZZES),
    attempts: read(X_ATTEMPTS),
    classAttendance: read(X_ATTENDANCE),
    chatMessages: read(X_CHAT),
    statuses: read(X_STATUSES),
  };
}

export async function buildBlob(userId: string): Promise<AnyRecord> {
  const [user, sp, prefs, notepad, notes, decks, markRows, workLogs, classes, tPref, tDays, pSessions, progressRows, studySessions, unmapped] =
    await Promise.all([
      db.user.findUnique({ where: { id: userId } }),
      db.studentProfile.findUnique({ where: { userId } }),
      db.notificationPreference.findUnique({ where: { userId } }),
      db.notepadEntry.findMany({ where: { userId }, orderBy: { updatedAt: "desc" } }),
      db.note.findMany({ where: { userId }, orderBy: { createdAt: "desc" } }),
      db.flashcardDeck.findMany({ where: { userId }, include: { cards: { orderBy: { order: "asc" } } }, orderBy: { updatedAt: "desc" } }),
      db.markRecord.findMany({ where: { userId }, orderBy: { examDate: "desc" } }),
      db.workLog.findMany({ where: { userId }, orderBy: { date: "desc" } }),
      db.classSession.findMany({ where: { userId }, orderBy: [{ dayOfWeek: "asc" }, { startMinute: "asc" }] }),
      db.timetablePref.findUnique({ where: { userId } }),
      db.timetableDay.findMany({ where: { userId } }),
      db.plannerSession.findMany({ where: { userId } }),
      db.userTopicProgress.findMany({ where: { userId }, orderBy: { updatedAt: "desc" } }),
      db.studySession.findMany({ where: { userId }, orderBy: { completedAt: "desc" } }),
      readUnmapped(userId),
    ]);

  const profileUpdatedAt = maxIso([user?.updatedAt, sp?.updatedAt]);

  const profile = {
    name: user?.name ?? "Student",
    displayName: user?.displayName ?? user?.name ?? "Student",
    email: user?.email ?? "",
    image: user?.image ?? null,
    avatarUrl: user?.avatarUrl ?? user?.image ?? null,
    about: user?.about ?? "",
    fullName: sp?.fullName ?? "",
    language: sp?.language === "si" ? "si" : "en",
    examYear: sp?.examYear != null ? String(sp.examYear) : "",
    examDate: sp?.examDate ? sp.examDate.toISOString().split("T")[0] : "",
    examType: sp?.examType ?? "A/L",
    dailyStudyTarget: sp?.dailyStudyTarget ?? 4,
    weeklyStudyTarget: sp?.weeklyStudyTarget ?? 28,
    targetGrade: sp?.targetGrade ?? "A",
    currentLevel: sp?.currentLevel ?? "O/L",
    preferredTime: sp?.preferredTime ?? "morning",
    weakTopics: sp?.weakTopics ?? [],
    subjects: sp?.subjects ?? [],
    onboarded: sp?.onboarded ?? false,
    updatedAt: profileUpdatedAt,
  };

  const settings = {
    id: prefs?.id ?? userId,
    userId,
    browserEnabled: prefs?.browserEnabled ?? false,
    telegramEnabled: prefs?.telegramEnabled ?? false,
    telegramToken: prefs?.telegramToken ?? "",
    telegramChatId: prefs?.telegramChatId ?? "",
    telegramAll: prefs?.telegramAll ?? false,
    ntfyEnabled: prefs?.ntfyEnabled ?? false,
    ntfyTopic: prefs?.ntfyTopic ?? "",
    fcmToken: prefs?.fcmToken ?? "",
    createdAt: (prefs?.createdAt ?? new Date()).toISOString(),
    updatedAt: prefs?.updatedAt ? prefs.updatedAt.toISOString() : "",
  };

  const plannerPrefs = tPref
    ? {
        weeklyTargetMin: tPref.weeklyTargetMin,
        sessionLengthMin: tPref.sessionLengthMin,
        breakAfterMin: tPref.breakAfterMin,
        breakDurationMin: tPref.breakDurationMin,
        timeFormat: tPref.timeFormat === "12h" ? "12h" : "24h",
        showBreaks: tPref.showBreaks,
        subjectPriorities: (tPref.subjectPriorities as unknown as unknown[]) ?? [],
        studyTypes: (tPref.studyTypeWeight as unknown as unknown[]) ?? [],
        weakTopics: tPref.weakTopics ?? [],
        updatedAt: tPref.updatedAt.toISOString(),
      }
    : null;

  const out: AnyRecord = {
    v: 1,
    profile,
    settings,
    notepad: notepad.map((e) => ({
      id: e.id,
      title: e.title,
      content: e.content,
      color: e.color,
      pinned: e.pinned,
      createdAt: e.createdAt.toISOString(),
      updatedAt: e.updatedAt.toISOString(),
    })),
    notes: notes.map((n) => ({
      id: n.id,
      title: n.title,
      content: n.content,
      createdAt: n.createdAt.toISOString(),
    })),
    decks: decks.map((d) => ({
      id: d.id,
      title: d.title,
      language: d.language,
      source: d.source,
      createdAt: d.createdAt.toISOString(),
      updatedAt: d.updatedAt.toISOString(),
      cards: d.cards.map((c) => ({ id: c.id, front: c.front, back: c.back })),
    })),
    marks: markRows
      .filter((m) => m.subjectId != null)
      .map((m) => ({
        id: m.id,
        subjectId: m.subjectId ?? "",
        score: m.score,
        total: m.total,
        examDate: m.examDate.toISOString().split("T")[0],
        name: m.name,
      })),
    pastRecords: markRows
      .filter((m) => m.subjectId == null)
      .map((m) => ({
        id: m.id,
        paperType: m.name,
        score: m.score ?? 0,
        total: m.total,
        examDate: m.examDate.toISOString(),
      })),
    workLogs: workLogs.map((w) => ({
      id: w.id,
      date: w.date.toISOString().split("T")[0],
      minutes: w.minutes,
      ...(w.note ? { note: w.note } : {}),
    })),
    classes: classes.map((c) => ({
      id: c.id,
      subjectName: c.subjectName,
      dayOfWeek: c.dayOfWeek,
      startMinute: c.startMinute,
      endMinute: c.endMinute,
      color: c.color ?? "#10B981",
    })),
    classAttendance: unmapped.classAttendance,
    progress: progressRows.map((r) => ({
      id: r.id,
      userId: r.userId,
      topicId: r.topicId,
      subtopicId: r.subtopicId ?? "",
      status: r.status,
      masteryScore: r.masteryScore,
      completionPercent: r.completionPercent,
      questionsAttempted: r.questionsAttempted,
      questionsCorrect: r.questionsCorrect,
      studyMinutes: r.studyMinutes,
      confidence: r.confidence,
      lastStudiedAt: isoOrNull(r.lastStudiedAt),
      lastReviewedAt: isoOrNull(r.lastReviewedAt),
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    })),
    plannerPrefs,
    plannerDays: tDays.map((d) => ({
      dayOfWeek: d.dayOfWeek,
      enabled: d.enabled,
      dailyTargetMin: d.dailyTargetMin,
      blocks: (d.blocks as unknown as unknown[]) ?? [],
    })),
    plannerSessions: pSessions.map((s) => ({
      id: s.id,
      subjectId: s.subjectId,
      subjectName: s.subjectName,
      topicId: s.topicId,
      topicTitle: s.topicTitle,
      date: s.date ? s.date.toISOString().split("T")[0] : null,
      dayOfWeek: s.dayOfWeek,
      startMinute: s.startMinute,
      endMinute: s.endMinute,
      type: s.type,
      priority: s.priority,
      status: s.status,
      recurrence: s.recurrence,
      recurrenceDays: s.recurrenceDays,
      reminderMin: s.reminderMin,
      notes: s.notes,
    })),
    quizzes: unmapped.quizzes,
    attempts: unmapped.attempts,
    studySessions: studySessions.map((s) => ({
      id: s.id,
      subjectId: s.subjectId ?? "",
      minutes: s.minutes,
      completedAt: s.completedAt.toISOString(),
    })),
    chatMessages: unmapped.chatMessages,
    statuses: unmapped.statuses,
  };

  // ---- deletion tombstones ----
  // Anything that was present at the previous interaction but is gone from the
  // DB now was deleted on the web, so record a tombstone so the phone drops it
  // too instead of re-uploading it. Tombstones are then persisted and returned.
  const meta = await readMeta(userId);
  const deleted = unionDeleted(meta.deleted, undefined);
  const curSeen = seenOf(out);
  const nowIso = new Date().toISOString();
  for (const name of TRACKED) {
    const prev = meta.seen[name] ?? {};
    const cur = curSeen[name] ?? {};
    for (const k of Object.keys(prev)) {
      if (!(k in cur)) {
        if (!deleted[name]) deleted[name] = {};
        deleted[name][k] = nowIso;
      }
    }
  }
  dropTombstoned(out, deleted);
  out.deleted = deleted;
  await writeMeta(userId, deleted, seenOf(out));

  return out;
}

function maxIso(dates: (Date | null | undefined)[]): string {
  let best = 0;
  for (const d of dates) {
    if (d instanceof Date && !Number.isNaN(d.getTime())) best = Math.max(best, d.getTime());
  }
  return best ? new Date(best).toISOString() : "";
}
