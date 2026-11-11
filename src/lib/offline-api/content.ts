// Content endpoints served from the bundled DB dump (/offline/content.json).
//
// The dump script writes the exact raw rows the API would have returned from Postgres,
// so the handlers here mostly just filter/join and add the `_count` projections.

import { fetchAsset } from "./runtime";

type Row = Record<string, unknown>;

export interface ContentDb {
  exportedAt: string;
  subjects: Row[];
  units: Row[];
  topics: Row[];
  subtopics: Row[];
  objectives: Row[];
  questions: Row[];
}

let dbPromise: Promise<ContentDb> | null = null;

export function getContentDb(): Promise<ContentDb> {
  if (!dbPromise) {
    dbPromise = fetchAsset("/offline/content.json").then((r) => {
      if (!r.ok) throw new Error(`offline content missing (HTTP ${r.status})`);
      return r.json() as Promise<ContentDb>;
    });
  }
  return dbPromise;
}

const byOrder = (a: Row, b: Row) => (a.order as number) - (b.order as number);

function countTopics(unitId: string, db: ContentDb) {
  return { topics: db.topics.filter((t) => t.unitId === unitId).length };
}

function countTopicChildren(topicId: string, db: ContentDb) {
  return {
    subtopics: db.subtopics.filter((s) => s.topicId === topicId).length,
    learningObjectives: db.objectives.filter((o) => o.topicId === topicId).length,
  };
}

function countSubtopicObjectives(subtopicId: string, db: ContentDb) {
  return { learningObjectives: db.objectives.filter((o) => o.subtopicId === subtopicId).length };
}

export async function contentSubjects() {
  const db = await getContentDb();
  return { status: 200, body: { subjects: [...db.subjects].sort(byOrder) } };
}

export async function contentSubject(subjectSlug: string) {
  const db = await getContentDb();
  const subject = db.subjects.find((s) => s.slug === subjectSlug);
  if (!subject) return { status: 404, body: { error: "Subject not found" } };
  const units = db.units
    .filter((u) => u.subjectId === subject.id)
    .sort(byOrder)
    .map((u) => ({ ...u, _count: countTopics(u.id as string, db) }));
  return { status: 200, body: { subject, units } };
}

export async function contentUnit(subjectSlug: string, unitSlug: string) {
  const db = await getContentDb();
  const subject = db.subjects.find((s) => s.slug === subjectSlug);
  if (!subject) return { status: 404, body: { error: "Subject not found" } };
  const unit = db.units.find((u) => u.subjectId === subject.id && u.slug === unitSlug);
  if (!unit) return { status: 404, body: { error: "Unit not found" } };
  const topics = db.topics
    .filter((t) => t.unitId === unit.id)
    .sort(byOrder)
    .map((t) => ({ ...t, _count: countTopicChildren(t.id as string, db) }));
  return { status: 200, body: { subject, unit: { ...unit, _count: countTopics(unit.id as string, db) }, topics } };
}

export async function contentTopic(subjectSlug: string, unitSlug: string, topicSlug: string) {
  const db = await getContentDb();
  const subject = db.subjects.find((s) => s.slug === subjectSlug);
  if (!subject) return { status: 404, body: { error: "Subject not found" } };
  const unit = db.units.find((u) => u.subjectId === subject.id && u.slug === unitSlug);
  if (!unit) return { status: 404, body: { error: "Unit not found" } };
  const topic = db.topics.find((t) => t.unitId === unit.id && t.slug === topicSlug);
  if (!topic) return { status: 404, body: { error: "Topic not found" } };
  const subtopics = db.subtopics
    .filter((s) => s.topicId === topic.id)
    .sort(byOrder)
    .map((s) => ({ ...s, _count: countSubtopicObjectives(s.id as string, db) }));
  const objectives = db.objectives.filter((o) => o.topicId === topic.id).sort(byOrder);
  return {
    status: 200,
    body: {
      subject,
      unit: { ...unit, _count: countTopics(unit.id as string, db) },
      topic: { ...topic, _count: countTopicChildren(topic.id as string, db) },
      subtopics,
      objectives,
    },
  };
}

export interface SearchResult {
  type: "subject" | "unit" | "topic" | "subtopic" | "objective";
  id: string;
  slug: string;
  title: string;
  titleSi: string | null;
  description: string | null;
  path: string;
  relevance: number;
}

function has(text: unknown, needle: string): boolean {
  return typeof text === "string" && text.toLowerCase().includes(needle);
}

export async function contentSearch(q: string, subjectId: string | null, limit: number) {
  const db = await getContentDb();
  const needle = q.trim().toLowerCase();
  if (needle.length < 1) return { status: 400, body: { error: { q: ["Query is required"] } } };
  const results: SearchResult[] = [];
  const subjectSlugOf = (id: unknown) => db.subjects.find((s) => s.id === id)?.slug ?? "";
  const unitOf = (id: unknown) => db.units.find((u) => u.id === id);
  const topicOf = (id: unknown) => db.topics.find((t) => t.id === id);

  for (const s of db.subjects) {
    if (subjectId && s.id !== subjectId) continue;
    if (has(s.name, needle)) {
      results.push({ type: "subject", id: s.id as string, slug: s.slug as string, title: s.name as string, titleSi: (s.nameSi as string) ?? null, description: (s.description as string) ?? null, path: `/syllabus/${s.slug}`, relevance: 100 });
    } else if (has(s.description, needle) || has(s.nameSi, needle)) {
      results.push({ type: "subject", id: s.id as string, slug: s.slug as string, title: s.name as string, titleSi: (s.nameSi as string) ?? null, description: (s.description as string) ?? null, path: `/syllabus/${s.slug}`, relevance: 50 });
    }
  }
  for (const u of db.units) {
    const subject = db.subjects.find((s) => s.id === u.subjectId);
    if (subjectId && u.subjectId !== subjectId) continue;
    if (!subject) continue;
    if (has(u.title, needle)) {
      results.push({ type: "unit", id: u.id as string, slug: u.slug as string, title: u.title as string, titleSi: (u.titleSi as string) ?? null, description: (u.description as string) ?? null, path: `/syllabus/${subject.slug}/${u.slug}`, relevance: 90 });
    } else if (has(u.description, needle) || has(u.titleSi, needle)) {
      results.push({ type: "unit", id: u.id as string, slug: u.slug as string, title: u.title as string, titleSi: (u.titleSi as string) ?? null, description: (u.description as string) ?? null, path: `/syllabus/${subject.slug}/${u.slug}`, relevance: 40 });
    }
  }
  for (const t of db.topics) {
    const unit = unitOf(t.unitId);
    const subject = unit ? db.subjects.find((s) => s.id === unit.subjectId) : null;
    if (subjectId && (!unit || unit.subjectId !== subjectId)) continue;
    if (!unit || !subject) continue;
    const path = `/syllabus/${subject.slug}/${unit.slug}/${t.slug}`;
    if (has(t.title, needle)) {
      results.push({ type: "topic", id: t.id as string, slug: t.slug as string, title: t.title as string, titleSi: (t.titleSi as string) ?? null, description: (t.description as string) ?? null, path, relevance: 80 });
    } else if (has(t.description, needle) || has(t.titleSi, needle)) {
      results.push({ type: "topic", id: t.id as string, slug: t.slug as string, title: t.title as string, titleSi: (t.titleSi as string) ?? null, description: (t.description as string) ?? null, path, relevance: 30 });
    }
  }
  for (const st of db.subtopics) {
    const topic = topicOf(st.topicId);
    const unit = topic ? unitOf(topic.unitId) : null;
    const subject = unit ? db.subjects.find((s) => s.id === unit.subjectId) : null;
    if (subjectId && (!unit || unit.subjectId !== subjectId)) continue;
    if (!topic || !unit || !subject) continue;
    if (has(st.title, needle) || has(st.description, needle) || has(st.content, needle)) {
      results.push({ type: "subtopic", id: st.id as string, slug: st.slug as string, title: st.title as string, titleSi: (st.titleSi as string) ?? null, description: (st.description as string) ?? null, path: `/syllabus/${subject.slug}/${unit.slug}/${topic.slug}#${st.slug}`, relevance: 70 });
    }
  }
  for (const o of db.objectives) {
    const topic = topicOf(o.topicId);
    const unit = topic ? unitOf(topic.unitId) : null;
    const subject = unit ? db.subjects.find((s) => s.id === unit.subjectId) : null;
    if (subjectId && (!unit || unit.subjectId !== subjectId)) continue;
    if (!topic || !unit || !subject) continue;
    if (has(o.title, needle)) {
      results.push({ type: "objective", id: o.id as string, slug: o.slug as string, title: o.title as string, titleSi: (o.titleSi as string) ?? null, description: (o.description as string) ?? null, path: `/syllabus/${subject.slug}/${unit.slug}/${topic.slug}`, relevance: 60 });
    }
  }
  results.sort((a, b) => b.relevance - a.relevance);
  return { status: 200, body: { results: results.slice(0, limit) } };
}

export async function contentContext(subject: string, unit: string | null, topic: string | null, subtopic: string | null) {
  if (!subject) return { status: 400, body: { error: "Subject parameter required" } };
  const db = await getContentDb();
  const subj = db.subjects.find((s) => s.slug === subject || s.id === subject || s.name === subject);
  if (!subj) return { status: 404, body: { error: "Context not found" } };
  const unitRow = unit ? db.units.find((u) => u.slug === unit && u.subjectId === subj.id) ?? null : null;
  const topicRow = topic ? db.topics.find((t) => t.slug === topic && (!unitRow || t.unitId === unitRow.id)) ?? null : null;
  const subtopicRow = subtopic ? db.subtopics.find((s) => s.slug === subtopic && (!topicRow || s.topicId === topicRow.id)) ?? null : null;
  const objectives = db.objectives.filter(
    (o) =>
      (topicRow && o.topicId === topicRow.id) ||
      (subtopicRow && o.subtopicId === subtopicRow.id),
  );
  const relatedTopics = db.topics
    .filter((t) => unitRow && t.unitId === unitRow.id && (!topicRow || t.id !== topicRow.id))
    .slice(0, 8);
  return {
    status: 200,
    body: { context: { subject: subj, unit: unitRow, topic: topicRow, subtopic: subtopicRow, objectives, relatedTopics } },
  };
}

// ---- Question serialization for practice/mistakes ----

export interface QuestionData {
  id: string;
  subjectId: string;
  unitId: string;
  topicId: string;
  type: string;
  difficulty: string;
  stem: string;
  stemSi: string;
  explanation: string;
  explanationSi: string;
  marks: number;
  tags: string[];
  status: string;
  source: unknown;
  topicSlug: string;
  topicTitle: string;
  unitSlug: string;
  unitTitle: string;
  options: { id: string; text: string; textSi: string; order: number }[];
}

export function serializeQuestion(q: Row, db: ContentDb): QuestionData {
  const topic = db.topics.find((t) => t.id === q.topicId);
  const unit = db.units.find((u) => u.id === q.unitId);
  const rawOptions = Array.isArray(q.options) ? (q.options as Row[]) : [];
  const options = [...rawOptions]
    .sort((a, b) => (a.order as number) - (b.order as number))
    .map((o) => ({
      id: o.id as string,
      text: (o.text as string) ?? "",
      textSi: (o.textSi as string) ?? "",
      order: o.order as number,
    }));
  return {
    id: q.id as string,
    subjectId: (q.subjectId as string) ?? "",
    unitId: (q.unitId as string) ?? "",
    topicId: (q.topicId as string) ?? "",
    type: (q.type as string) ?? "MCQ",
    difficulty: (q.difficulty as string) ?? "medium",
    stem: (q.stem as string) ?? "",
    stemSi: (q.stemSi as string) ?? "",
    explanation: (q.explanation as string) ?? "",
    explanationSi: (q.explanationSi as string) ?? "",
    marks: (q.marks as number) ?? 1,
    tags: (q.tags as string[]) ?? [],
    status: (q.status as string) ?? "PUBLISHED",
    source: q.source ?? null,
    topicSlug: (topic?.slug as string) ?? "",
    topicTitle: (topic?.title as string) ?? "",
    unitSlug: (unit?.slug as string) ?? "",
    unitTitle: (unit?.title as string) ?? "",
    options,
  };
}

export function correctOptionIdOf(q: Row): string {
  const rawOptions = Array.isArray(q.options) ? (q.options as Row[]) : [];
  const correct = rawOptions.find((o) => o.isCorrect === true);
  return (correct?.id as string) ?? "";
}

export async function questionById(id: string): Promise<Row | null> {
  const db = await getContentDb();
  return db.questions.find((q) => q.id === id) ?? null;
}
