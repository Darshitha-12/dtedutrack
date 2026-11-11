import { db } from "@/lib/db";
import type {
  ContentSubjectData,
  ContentUnitData,
  ContentTopicData,
  ContentSubtopicData,
  ContentLearningObjectiveData,
  UserTopicProgressData,
  TopicWithProgress,
  SearchResult,
  BiologyContext,
} from "./types";

// Prisma stores enum-like fields as String (not native enums).
// These helpers bridge the gap between Prisma's string types and our strict union types.
// The double-cast (unknown → target) is intentional and safe: the Prisma schema fields
// match our interface shapes exactly, but Prisma returns `string` where we use union types.
type SubjectRow = { id: string; slug: string; name: string; nameSi: string; description: string; descriptionSi: string; icon: string; color: string; order: number; status: string; source: string; version: number };
type UnitRow = { id: string; subjectId: string; slug: string; order: number; title: string; titleSi: string; description: string; descriptionSi: string; estimatedMinutes: number; status: string; source: string; version: number; _count?: { topics: number } };
type TopicRow = { id: string; unitId: string; slug: string; order: number; title: string; titleSi: string; description: string; descriptionSi: string; difficulty: string; importance: string; examRelevance: number; estimatedMinutes: number; status: string; source: string; version: number; _count?: { subtopics: number; learningObjectives: number } };
type SubtopicRow = { id: string; topicId: string; slug: string; order: number; title: string; titleSi: string; description: string; descriptionSi: string; content: string; contentSi: string; difficulty: string; estimatedMinutes: number; status: string; source: string; version: number; _count?: { learningObjectives: number } };
type ObjectiveRow = { id: string; topicId: string | null; subtopicId: string | null; slug: string; order: number; title: string; titleSi: string; description: string; descriptionSi: string; difficulty: string; status: string; source: string; version: number };
type ProgressRow = { id: string; userId: string; topicId: string; subtopicId: string | null; status: string; masteryScore: number; completionPercent: number; questionsAttempted: number; questionsCorrect: number; studyMinutes: number; confidence: string; lastStudiedAt: Date | null; lastReviewedAt: Date | null };

function asSubject(r: SubjectRow): ContentSubjectData { return r as unknown as ContentSubjectData; }
function asUnit(r: UnitRow): ContentUnitData { return r as unknown as ContentUnitData; }
function asTopic(r: TopicRow): ContentTopicData { return r as unknown as ContentTopicData; }
function asSubtopic(r: SubtopicRow): ContentSubtopicData { return r as unknown as ContentSubtopicData; }
function asObjective(r: ObjectiveRow): ContentLearningObjectiveData { return r as unknown as ContentLearningObjectiveData; }
function asProgress(r: ProgressRow): UserTopicProgressData { return r as unknown as UserTopicProgressData; }

// ---- Subject retrieval ----

export async function getSubjects(): Promise<ContentSubjectData[]> {
  const subjects = await db.contentSubject.findMany({
    orderBy: { order: "asc" },
  });
  return subjects.map(asSubject);
}

export async function getSubjectBySlug(slug: string): Promise<ContentSubjectData | null> {
  const subject = await db.contentSubject.findUnique({ where: { slug } });
  return subject ? asSubject(subject) : null;
}

// ---- Unit retrieval ----

export async function getUnits(subjectId: string): Promise<ContentUnitData[]> {
  const units = await db.contentUnit.findMany({
    where: { subjectId },
    orderBy: { order: "asc" },
    include: { _count: { select: { topics: true } } },
  });
  return units.map(asUnit);
}

export async function getUnitBySlug(subjectId: string, slug: string): Promise<ContentUnitData | null> {
  const unit = await db.contentUnit.findUnique({
    where: { subjectId_slug: { subjectId, slug } },
    include: { _count: { select: { topics: true } } },
  });
  return unit ? asUnit(unit) : null;
}

// ---- Topic retrieval ----

export async function getTopics(unitId: string): Promise<ContentTopicData[]> {
  const topics = await db.contentTopic.findMany({
    where: { unitId },
    orderBy: { order: "asc" },
    include: { _count: { select: { subtopics: true, learningObjectives: true } } },
  });
  return topics.map(asTopic);
}

export async function getTopicBySlug(unitId: string, slug: string): Promise<ContentTopicData | null> {
  const topic = await db.contentTopic.findUnique({
    where: { unitId_slug: { unitId, slug } },
    include: { _count: { select: { subtopics: true, learningObjectives: true } } },
  });
  return topic ? asTopic(topic) : null;
}

export async function getTopicWithProgress(
  topicId: string,
  userId: string,
): Promise<TopicWithProgress | null> {
  const topic = await db.contentTopic.findUnique({
    where: { id: topicId },
    include: {
      _count: { select: { subtopics: true, learningObjectives: true } },
      userProgress: { where: { userId }, take: 1 },
    },
  });
  if (!topic) return null;
  const { userProgress, ...topicData } = topic;
  return {
    ...asTopic(topicData),
    progress: userProgress[0] ? asProgress(userProgress[0]) : null,
  };
}

// ---- Subtopic retrieval ----

export async function getSubtopics(topicId: string): Promise<ContentSubtopicData[]> {
  const subtopics = await db.contentSubtopic.findMany({
    where: { topicId },
    orderBy: { order: "asc" },
    include: { _count: { select: { learningObjectives: true } } },
  });
  return subtopics.map(asSubtopic);
}

export async function getSubtopicBySlug(topicId: string, slug: string): Promise<ContentSubtopicData | null> {
  const subtopic = await db.contentSubtopic.findUnique({
    where: { topicId_slug: { topicId, slug } },
    include: { _count: { select: { learningObjectives: true } } },
  });
  return subtopic ? asSubtopic(subtopic) : null;
}

// ---- Learning objectives ----

export async function getLearningObjectives(
  filters: { topicId?: string; subtopicId?: string },
): Promise<ContentLearningObjectiveData[]> {
  const where: Record<string, unknown> = {};
  if (filters.topicId) where.topicId = filters.topicId;
  if (filters.subtopicId) where.subtopicId = filters.subtopicId;

  const objectives = await db.contentLearningObjective.findMany({
    where,
    orderBy: { order: "asc" },
  });
  return objectives.map(asObjective);
}

// ---- Progress ----

export async function getUserProgress(userId: string): Promise<UserTopicProgressData[]> {
  const progress = await db.userTopicProgress.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
  });
  return progress.map(asProgress);
}

export async function getTopicProgress(
  userId: string,
  topicId: string,
): Promise<UserTopicProgressData | null> {
  const progress = await db.userTopicProgress.findUnique({
    where: { userId_topicId_subtopicId: { userId, topicId, subtopicId: "" } },
  });
  return progress ? asProgress(progress) : null;
}

export async function upsertTopicProgress(
  userId: string,
  data: {
    topicId: string;
    subtopicId?: string | null;
    status?: string;
    masteryScore?: number;
    completionPercent?: number;
    studyMinutes?: number;
    confidence?: string;
  },
): Promise<UserTopicProgressData> {
  const now = new Date();
  const updateData: Record<string, unknown> = {};
  if (data.status) updateData.status = data.status;
  if (data.masteryScore !== undefined) updateData.masteryScore = data.masteryScore;
  if (data.completionPercent !== undefined) updateData.completionPercent = data.completionPercent;
  if (data.studyMinutes !== undefined) updateData.studyMinutes = { increment: data.studyMinutes };
  if (data.confidence) updateData.confidence = data.confidence;
  updateData.lastStudiedAt = now;

  const progress = await db.userTopicProgress.upsert({
    where: {
      userId_topicId_subtopicId: {
        userId,
        topicId: data.topicId,
        subtopicId: data.subtopicId ?? "",
      },
    },
    update: updateData,
    create: {
      userId,
      topicId: data.topicId,
      subtopicId: data.subtopicId ?? null,
      status: data.status ?? "IN_PROGRESS",
      masteryScore: data.masteryScore ?? 0,
      completionPercent: data.completionPercent ?? 0,
      studyMinutes: data.studyMinutes ?? 0,
      confidence: data.confidence ?? "low",
      lastStudiedAt: now,
    },
  });
  return asProgress(progress);
}

// ---- Search ----

export async function searchContent(
  query: string,
  subjectId?: string,
  limit: number = 20,
): Promise<SearchResult[]> {
  if (!query || query.trim().length === 0) return [];
  const results: SearchResult[] = [];
  const q = query.toLowerCase().trim();

  // Search subjects
  const subjects = await db.contentSubject.findMany({
    where: subjectId ? { id: subjectId } : {},
  });
  for (const s of subjects) {
    if (
      s.name.toLowerCase().includes(q) ||
      s.description.toLowerCase().includes(q) ||
      s.slug.includes(q)
    ) {
      results.push({
        type: "subject",
        id: s.id,
        slug: s.slug,
        title: s.name,
        titleSi: s.nameSi,
        description: s.description,
        path: `/syllabus/${s.slug}`,
        relevance: s.name.toLowerCase().includes(q) ? 100 : 50,
      });
    }
  }

  // Search units
  const units = await db.contentUnit.findMany({
    where: subjectId ? { subjectId } : {},
    include: { subject: true },
  });
  for (const u of units) {
    if (
      u.title.toLowerCase().includes(q) ||
      u.description.toLowerCase().includes(q) ||
      u.slug.includes(q)
    ) {
      results.push({
        type: "unit",
        id: u.id,
        slug: u.slug,
        title: u.title,
        titleSi: u.titleSi,
        description: u.description,
        path: `/syllabus/${u.subject.slug}/${u.slug}`,
        relevance: u.title.toLowerCase().includes(q) ? 90 : 40,
      });
    }
  }

  // Search topics
  const topics = await db.contentTopic.findMany({
    where: subjectId ? { unit: { subjectId } } : {},
    include: { unit: { include: { subject: true } } },
  });
  for (const t of topics) {
    if (
      t.title.toLowerCase().includes(q) ||
      t.description.toLowerCase().includes(q) ||
      t.slug.includes(q)
    ) {
      results.push({
        type: "topic",
        id: t.id,
        slug: t.slug,
        title: t.title,
        titleSi: t.titleSi,
        description: t.description,
        path: `/syllabus/${t.unit.subject.slug}/${t.unit.slug}/${t.slug}`,
        relevance: t.title.toLowerCase().includes(q) ? 80 : 30,
      });
    }
  }

  // Search subtopics
  const subtopics = await db.contentSubtopic.findMany({
    where: subjectId ? { topic: { unit: { subjectId } } } : {},
    include: { topic: { include: { unit: { include: { subject: true } } } } },
  });
  for (const st of subtopics) {
    if (
      st.title.toLowerCase().includes(q) ||
      st.description.toLowerCase().includes(q) ||
      st.slug.includes(q)
    ) {
      results.push({
        type: "subtopic",
        id: st.id,
        slug: st.slug,
        title: st.title,
        titleSi: st.titleSi,
        description: st.description,
        path: `/syllabus/${st.topic.unit.subject.slug}/${st.topic.unit.slug}/${st.topic.slug}#${st.slug}`,
        relevance: st.title.toLowerCase().includes(q) ? 70 : 20,
      });
    }
  }

  // Search learning objectives
  const objectives = await db.contentLearningObjective.findMany({
    where: subjectId
      ? {
          OR: [
            { topic: { unit: { subjectId } } },
            { subtopic: { topic: { unit: { subjectId } } } },
          ],
        }
      : {},
    include: { topic: { include: { unit: { include: { subject: true } } } } },
  });
  for (const o of objectives) {
    if (o.title.toLowerCase().includes(q) || o.description.toLowerCase().includes(q)) {
      const topic = o.topic;
      if (topic) {
        results.push({
          type: "objective",
          id: o.id,
          slug: o.slug,
          title: o.title,
          titleSi: o.titleSi,
          description: o.description,
          path: `/syllabus/${topic.unit.subject.slug}/${topic.unit.slug}/${topic.slug}`,
          relevance: 60,
        });
      }
    }
  }

  return results
    .sort((a, b) => b.relevance - a.relevance)
    .slice(0, limit);
}

// ---- AI Retrieval ----

export async function getBiologyContext(
  subjectSlug: string,
  topicSlug?: string,
  subtopicSlug?: string,
): Promise<BiologyContext | null> {
  const subject = await getSubjectBySlug(subjectSlug);
  if (!subject) return null;

  let topic: ContentTopicData | null = null;
  let unit: ContentUnitData | null = null;
  let subtopic: ContentSubtopicData | null = null;

  if (topicSlug) {
    const allTopics = await db.contentTopic.findMany({
      where: { slug: topicSlug, unit: { subjectId: subject.id } },
      include: { unit: true },
    });
    if (allTopics.length > 0) {
      topic = asTopic(allTopics[0]);
      unit = asUnit(allTopics[0].unit);
    }
  }

  if (topic && subtopicSlug) {
    subtopic = await getSubtopicBySlug(topic.id, subtopicSlug);
  }

  const objectives = topic
    ? await getLearningObjectives({ topicId: topic.id })
    : [];

  const rawRelated = topic
    ? await db.contentTopic.findMany({
        where: { unit: { subjectId: subject.id }, id: { not: topic.id } },
        take: 5,
        orderBy: { examRelevance: "desc" },
      })
    : [];

  return {
    subject,
    unit,
    topic,
    subtopic,
    objectives,
    relatedTopics: rawRelated.map(asTopic),
  };
}

// ---- Stats for dashboard ----

export async function getSubjectProgress(userId: string, subjectId: string) {
  const topics = await db.contentTopic.findMany({
    where: { unit: { subjectId } },
    include: {
      userProgress: { where: { userId }, take: 1 },
    },
  });

  const total = topics.length;
  const studied = topics.filter((t) => t.userProgress.length > 0).length;
  const mastered = topics.filter(
    (t) => t.userProgress.length > 0 && t.userProgress[0].status === "MASTERED",
  ).length;
  const inProgress = topics.filter(
    (t) => t.userProgress.length > 0 && t.userProgress[0].status === "IN_PROGRESS",
  ).length;

  return {
    total,
    studied,
    mastered,
    inProgress,
    percentComplete: total > 0 ? Math.round((studied / total) * 100) : 0,
  };
}
