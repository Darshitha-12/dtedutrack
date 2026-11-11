# BioPulse — Biology Content Architecture

> Content engine architecture for the Sri Lankan A/L Biology curriculum on the BioPulse platform.

---

## 1. Purpose

BioPulse is an A/L Biology study platform targeting the Sri Lankan curriculum. This document defines the **content engine architecture**: the data models, hierarchy, slug/ordering strategies, progress tracking, search, AI retrieval, localization, and future workflows that power the syllabus content served to students.

The content layer is designed to be:

- **Hierarchical** — mirroring the official syllabus structure.
- **Extensible** — supporting demo data today, verified official content tomorrow.
- **Bilingual** — English and Sinhala for every content node.
- **Searchable** — full-text search with relevance-weighted scoring.
- **AI-ready** — structured context retrieval for an AI study coach.

---

## 2. Content Hierarchy

```
Subject (Biology)
  └── Unit (Cell Biology, Molecular Biology, Ecology, …)
        └── Topic (Cell Structure, DNA Structure, …)
              ├── Subtopic (Plant Cell, Animal Cell, …)
              └── Learning Objective (Identify organelles, …)
```

Each level is an independent database model with its own `id`, `slug`, and `order` field. Parent–child relationships are expressed through foreign keys (e.g., `ContentTopic.unitId`).

| Level | Parent | Children |
|-------|--------|----------|
| **Subject** | — | Units |
| **Unit** | Subject | Topics |
| **Topic** | Unit | Subtopics, Learning Objectives |
| **Subtopic** | Topic | Learning Objectives (optional) |
| **Learning Objective** | Topic or Subtopic | — |

---

## 3. Prisma Models

### 3.1 ContentSubject

| Field | Type | Notes |
|-------|------|-------|
| `id` | `String` (CUID) | Primary key |
| `slug` | `String` | Unique |
| `name` | `String` | English name |
| `nameSi` | `String` | Sinhala name |
| `icon` | `String` | Emoji or icon identifier |
| `color` | `String` | Hex color for UI accent |
| `order` | `Int` | Display ordering |
| `status` | `ContentStatus` | `DEMO \| DRAFT \| VERIFIED \| ARCHIVED` |
| `source` | `ContentSource` | Relation — how this content was created |

### 3.2 ContentUnit

| Field | Type | Notes |
|-------|------|-------|
| `id` | `String` (CUID) | Primary key |
| `subjectId` | `String` | FK → `ContentSubject` |
| `slug` | `String` | Unique within subject |
| `order` | `Int` | Display ordering within subject |
| `title` | `String` | English title |
| `titleSi` | `String` | Sinhala title |
| `description` | `String?` | Optional description |
| `descriptionSi` | `String?` | Optional Sinhala description |
| `estimatedMinutes` | `Int` | Estimated study time |
| `status` | `ContentStatus` | Inherited or overridden |
| `sourceId` | `String?` | FK → `ContentSource` |

### 3.3 ContentTopic

| Field | Type | Notes |
|-------|------|-------|
| `id` | `String` (CUID) | Primary key |
| `unitId` | `String` | FK → `ContentUnit` |
| `slug` | `String` | Unique within unit |
| `order` | `Int` | Display ordering within unit |
| `title` | `String` | English title |
| `titleSi` | `String` | Sinhala title |
| `difficulty` | `TopicDifficulty` | `BEGINNER \| INTERMEDIATE \| ADVANCED` |
| `importance` | `TopicImportance` | `CORE \| STANDARD \| SUPPLEMENTARY` |
| `examRelevance` | `Int` | `0–100` — weight for exam-focused features |
| `estimatedMinutes` | `Int?` | Estimated study time |
| `status` | `ContentStatus` | Inherited or overridden |
| `sourceId` | `String?` | FK → `ContentSource` |

### 3.4 ContentSubtopic

| Field | Type | Notes |
|-------|------|-------|
| `id` | `String` (CUID) | Primary key |
| `topicId` | `String` | FK → `ContentTopic` |
| `slug` | `String` | Unique within topic |
| `order` | `Int` | Display ordering within topic |
| `title` | `String` | English title |
| `titleSi` | `String` | Sinhala title |
| `content` | `String` | Markdown body — English |
| `contentSi` | `String` | Markdown body — Sinhala |
| `status` | `ContentStatus` | Inherited or overridden |
| `sourceId` | `String?` | FK → `ContentSource` |

### 3.5 ContentLearningObjective

| Field | Type | Notes |
|-------|------|-------|
| `id` | `String` (CUID) | Primary key |
| `topicId` | `String?` | FK → `ContentTopic` (nullable) |
| `subtopicId` | `String?` | FK → `ContentSubtopic` (nullable) |
| `slug` | `String` | Unique within parent |
| `order` | `Int` | Display ordering |
| `title` | `String` | English objective statement |
| `titleSi` | `String` | Sinhala objective statement |
| `bloomLevel` | `BloomLevel?` | `REMEMBER \| UNDERSTAND \| APPLY \| ANALYSE \| EVALUATE \| CREATE` |
| `status` | `ContentStatus` | Inherited or overridden |
| `sourceId` | `String?` | FK → `ContentSource` |

> Exactly one of `topicId` or `subtopicId` must be non-null (enforced at the application layer or via a check constraint).

### 3.6 ContentSource

| Field | Type | Notes |
|-------|------|-------|
| `id` | `String` (CUID) | Primary key |
| `name` | `String` | Human-readable source name |
| `type` | `SourceType` | `DEMO \| OFFICIAL \| TEACHER_CREATED \| AI_GENERATED \| USER_CREATED` |
| `url` | `String?` | Optional reference URL |
| `verified` | `Boolean` | Whether this source has been reviewed |
| `createdAt` | `DateTime` | Auto-generated |
| `updatedAt` | `DateTime` | Auto-generated |

### 3.7 UserTopicProgress

| Field | Type | Notes |
|-------|------|-------|
| `id` | `String` (CUID) | Primary key |
| `userId` | `String` | FK → `User` |
| `topicId` | `String` | FK → `ContentTopic` |
| `subtopicId` | `String?` | FK → `ContentSubtopic` (nullable) |
| `status` | `ProgressStatus` | `NOT_STARTED \| IN_PROGRESS \| REVIEW \| MASTERED` |
| `confidence` | `Confidence` | `LOW \| MEDIUM \| HIGH` |
| `masteryScore` | `Int` | `0–100` |
| `completionPercent` | `Int` | `0–100` |
| `studyMinutes` | `Int` | Cumulative minutes spent |
| `lastStudiedAt` | `DateTime?` | Timestamp of most recent session |
| `createdAt` | `DateTime` | Auto-generated |
| `updatedAt` | `DateTime` | Auto-generated |

---

## 4. Relationships

```
ContentSubject 1 ──── N ContentUnit
ContentUnit    1 ──── N ContentTopic
ContentTopic   1 ──── N ContentSubtopic
ContentTopic   1 ──── N ContentLearningObjective
ContentSubtopic 1 ─── N ContentLearningObjective

ContentSource  1 ──── N ContentSubject
ContentSource  1 ──── N ContentUnit
ContentSource  1 ──── N ContentTopic
ContentSource  1 ──── N ContentSubtopic
ContentSource  1 ──── N ContentLearningObjective

User           1 ──── N UserTopicProgress
ContentTopic   1 ──── N UserTopicProgress
ContentSubtopic 1 ── N UserTopicProgress
```

### Cascade Rules

| Relation | On Delete | On Update |
|----------|-----------|-----------|
| `ContentUnit.subjectId` → `ContentSubject.id` | `Cascade` | `Cascade` |
| `ContentTopic.unitId` → `ContentUnit.id` | `Cascade` | `Cascade` |
| `ContentSubtopic.topicId` → `ContentTopic.id` | `Cascade` | `Cascade` |
| `ContentLearningObjective.topicId` → `ContentTopic.id` | `Cascade` | `Cascade` |
| `ContentLearningObjective.subtopicId` → `ContentSubtopic.id` | `Cascade` | `Cascade` |
| `UserTopicProgress.topicId` → `ContentTopic.id` | `Cascade` | `Cascade` |
| `UserTopicProgress.subtopicId` → `ContentSubtopic.id` | `SetNull` | `Cascade` |
| `*.sourceId` → `ContentSource.id` | `SetNull` | `Cascade` |

Deleting a Subject cascades to all its Units → Topics → Subtopics → Objectives → Progress.

---

## 5. Content Status

Every content node carries a `status` field following this lifecycle:

```
DEMO  →  DRAFT  →  VERIFIED  →  ARCHIVED
```

| Status | Meaning |
|--------|---------|
| `DEMO` | Seed/placeholder content. Clearly labeled as non-official. |
| `DRAFT` | Work-in-progress. Not yet reviewed or approved. |
| `VERIFIED` | Reviewed, approved, and ready for student consumption. |
| `ARCHIVED` | No longer actively served. Retained for history/versioning. |

A node can override its parent's status (e.g., a single Topic within a VERIFIED Unit can remain in DRAFT).

---

## 6. Content Source Types

Each content node is attributed to a `ContentSource`. The source `type` enum:

| Type | Description |
|------|-------------|
| `DEMO` | Auto-generated seed data for development and demonstration. |
| `OFFICIAL` | Imported from official Department of Education (DoE) syllabus documents. |
| `TEACHER_CREATED` | Authored or curated by a verified teacher. |
| `AI_GENERATED` | Generated by an AI pipeline, pending teacher review. |
| `USER_CREATED` | Student-contributed (e.g., notes, flashcards). Requires moderation. |

Only `OFFICIAL` and `TEACHER_CREATED` (after review) sources are eligible for `VERIFIED` status.

---

## 7. Slug Strategy

All slugs follow these rules:

1. **Format** — lowercase, kebab-case (e.g., `cell-structure`, `dna-replication`).
2. **Scoped uniqueness** — unique only within the parent scope.
3. **Deterministic** — generated from the title via `title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')`.

### Unique Constraints

```prisma
@@unique([subjectId, slug])       // ContentUnit
@@unique([unitId, slug])           // ContentTopic
@@unique([topicId, slug])          // ContentSubtopic, ContentLearningObjective
@@unique([subtopicId, slug])       // ContentLearningObjective (when subtopicId is set)
```

This means two Topics under different Units can share the same slug, but two Topics under the same Unit cannot.

---

## 8. Ordering Strategy

Each content node has an integer `order` field for deterministic display ordering.

| Rule | Detail |
|------|--------|
| **Start value** | `1` (1-indexed) |
| **Increment** | Sequential — no gaps in the final set |
| **Scope** | Independent within each parent (Topics are ordered 1, 2, 3 … within their Unit) |
| **Gaps allowed?** | Gaps may exist during editing (e.g., after deletion), but the UI renders in `order` ascending. Admin tooling can re-sequence. |
| **Re-ordering** | A bulk reorder endpoint accepts an array of `{ id, order }` pairs. |

---

## 9. User Progress Model

### Status

| Status | Meaning |
|--------|---------|
| `NOT_STARTED` | User has not engaged with this topic/subtopic. |
| `IN_PROGRESS` | Actively being studied. |
| ` REVIEW` | Completed once, scheduled for spaced-repetition review. |
| `MASTERED` | Mastery threshold met (e.g., `masteryScore >= 80`). |

### Confidence

| Level | Threshold |
|-------|-----------|
| `LOW` | Self-reported or derived from quiz performance < 50% |
| `MEDIUM` | Quiz performance 50–79% |
| `HIGH` | Quiz performance ≥ 80% |

### Tracked Metrics

| Field | Range | Description |
|-------|-------|-------------|
| `masteryScore` | `0–100` | Weighted score from quizzes, reviews, and engagement. |
| `completionPercent` | `0–100` | How much of the content the user has consumed. |
| `studyMinutes` | `≥ 0` | Cumulative time spent studying this topic/subtopic. |
| `lastStudiedAt` | timestamp | When the user last interacted with this content. |

### Unique Constraint

```prisma
@@unique([userId, topicId, subtopicId])
```

A user has at most one progress record per topic-subtopic pair. For topic-level progress, `subtopicId` is `null`.

---

## 10. Search Architecture

The platform provides **full-text search** across the entire content hierarchy.

### Search Scope

| Level | Relevance Weight | Indexed Fields |
|-------|-----------------|----------------|
| Subject | 100 | `name`, `nameSi`, `slug` |
| Unit | 90 | `title`, `titleSi`, `slug` |
| Topic | 80 | `title`, `titleSi`, `slug` |
| Subtopic | 70 | `title`, `titleSi`, `content`, `slug` |
| Learning Objective | 60 | `title`, `titleSi`, `slug` |

### Behavior

- **Case-insensitive** — query is lowercased before matching.
- **Slug matching** — partial slug matches are included (e.g., searching "cell" matches `cell-structure`).
- **Relevance scoring** — results are ranked by `(level weight × match quality)`.
- **Search index** — powered by a GIN/GiST index on a generated full-text column (PostgreSQL) or equivalent.
- **API** — `GET /api/content/search?q=...` returns a flat, relevance-sorted list of results with their hierarchy breadcrumb.

---

## 11. AI Retrieval Architecture

The `getBiologyContext()` utility builds a structured `BiologyContext` object for the AI study coach.

### BiologyContext Shape

```typescript
interface BiologyContext {
  subject: {
    id: string;
    name: string;
    nameSi: string;
  };
  unit: {
    id: string;
    title: string;
    titleSi: string;
    order: number;
  } | null;
  topic: {
    id: string;
    title: string;
    titleSi: string;
    difficulty: TopicDifficulty;
    importance: TopicImportance;
    examRelevance: number;
  } | null;
  subtopic: {
    id: string;
    title: string;
    titleSi: string;
    content: string;
    contentSi: string;
  } | null;
  objectives: ContentLearningObjective[];
  relatedTopics: {
    id: string;
    title: string;
    titleSi: string;
    slug: string;
    examRelevance: number;
  }[];
}
```

### Usage

1. User asks a biology question or navigates to a topic.
2. `getBiologyContext(userId?, topicId?, subtopicId?)` is called.
3. The returned context is injected into the AI coach's system prompt.
4. The coach provides **context-aware** answers grounded in syllabus content.

> **Note:** This is retrieval preparation only. No external AI API is connected yet. The context object is built and ready for integration.

---

## 12. Localization Strategy

BioPulse is **bilingual**: English and Sinhala.

### Content-Level Localization

| Field | Language |
|-------|----------|
| `name` / `nameSi` | Subject |
| `title` / `titleSi` | Unit, Topic, Subtopic, Objective |
| `content` / `contentSi` | Subtopic (Markdown body) |
| `description` / `descriptionSi` | Unit |

Both language variants are stored **directly in the database** as separate columns. This avoids runtime translation lookups and ensures content quality is controlled at the authoring level.

### UI-Level Localization

- UI strings (buttons, labels, navigation) use an **i18n system** with translation files (e.g., `en.json`, `si.json`).
- The user's language preference is stored in their profile and respected across the app.
- Language toggle is available in the header/settings.

---

## 13. Demo Content Rules

Demo content exists to showcase the platform before official syllabus data is available.

| Rule | Detail |
|------|--------|
| **Status** | All seed data is marked `status = "DEMO"`. |
| **Source** | All seed data references a `ContentSource` with `type = "DEMO"`. |
| **Badge** | A prominent "Demo" badge is shown on every syllabus page containing demo content. |
| **Disclaimer** | Displayed on syllabus pages: *"This is demo content for demonstration purposes. It is not the official Sri Lankan A/L Biology syllabus."* |
| **Never official** | Demo data must never be presented as official, verified, or exam-accurate. |
| **Easy removal** | Demo content can be bulk-deleted or filtered out via `WHERE status != 'DEMO'` without affecting verified content. |

---

## 14. Future Verified-Content Import Strategy

When official content becomes available, the following import pipeline will be used:

### Import Sources

- Official Department of Education (DoE) A/L Biology syllabus PDFs.
- Teacher-contributed content vetted through the review workflow.

### Pipeline

```
Official PDF → Parser/Extractor → DRAFT nodes → Teacher Review → VERIFIED
```

### Version Control

| Field | Purpose |
|-------|---------|
| `publishedAt` | Timestamp when content was promoted to `VERIFIED`. |
| `archivedAt` | Timestamp when content was superseded or retired. |
| `version` | Integer version number, incremented on each verified update. |

### Attribution

Every imported node references a `ContentSource` with `type = "OFFICIAL"`, `verified = true`, and the source document name/URL. This ensures full traceability from content back to the original syllabus document.

---

## 15. Future Admin/Content Management Strategy

### Admin Dashboard

- **CRUD interface** for all content models (Subjects → Units → Topics → Subtopics → Objectives).
- **Bulk operations** — import from CSV/JSON, bulk status changes, bulk re-ordering.
- **Export** — download full syllabus as JSON or Markdown for offline use.

### Review Workflow

```
Author creates DRAFT
  → Reviewer sees it in queue
    → Reviewer approves → status = VERIFIED, publishedAt set
    → Reviewer rejects → status = DRAFT, feedback added
```

### Audit Trail

| Table | Purpose |
|-------|---------|
| `ContentAuditLog` | Records every create/update/delete/status-change with `userId`, `timestamp`, `previousValue`, `newValue`. |
| `ContentVersion` | Stores a snapshot of each content node at the time it was promoted to `VERIFIED`. |

### Access Control

| Role | Permissions |
|------|-------------|
| `STUDENT` | Read-only on verified content. |
| `TEACHER` | Create DRAFT, edit own drafts, review peers. |
| `ADMIN` | Full CRUD, bulk operations, manage sources, publish/verify. |
| `SUPER_ADMIN` | All admin permissions + user management, system config. |

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         BioPulse Platform                           │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌──────────────┐    ┌──────────────┐    ┌───────────────────────┐ │
│  │   Frontend    │    │  API Routes  │    │   Prisma ORM          │ │
│  │  (Next.js)    │───▶│  /api/       │───▶│   Content Models      │ │
│  │               │    │  content/    │    │                       │ │
│  │  • Syllabus   │    │  search      │    │  ContentSubject       │ │
│  │  • Topics     │    │  progress    │    │    └── ContentUnit    │ │
│  │  • Search     │    │  ai-context  │    │         └── ContentTopic│ │
│  │  • Progress   │    │              │    │            ├── ContentSubtopic│ │
│  └──────┬───────┘    └──────────────┘    │            └── ContentObjective│ │
│         │                                 │                       │ │
│         │  i18n                           │  ContentSource        │ │
│         │  (en.json / si.json)            │  (attribution)        │ │
│         │                                 └───────────┬───────────┘ │
│         │                                             │             │
│         │                                 ┌───────────▼───────────┐ │
│         │                                 │   PostgreSQL          │ │
│         │                                 │                       │ │
│         │                                 │  • Full-text search   │ │
│         │                                 │  • GIN indexes        │ │
│         │                                 │  • Unique constraints │ │
│         │                                 └───────────▲───────────┘ │
│         │                                             │             │
│  ┌──────▼───────────────────────┐    ┌────────────────┴───────────┐│
│  │   AI Coach (Future)         │    │   Admin Dashboard (Future) ││
│  │                             │    │                            ││
│  │  getBiologyContext()        │    │  • Content CRUD            ││
│  │    → BiologyContext         │    │  • Review workflow         ││
│  │    → System prompt inject   │    │  • Bulk import/export      ││
│  │    → Context-aware answers  │    │  • Audit trail             ││
│  └─────────────────────────────┘    └────────────────────────────┘│
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│                     Data Hierarchy                                   │
│                                                                     │
│  Subject ──▶ Unit ──▶ Topic ──▶ Subtopic ──▶ Learning Objective    │
│     │           │         │          │              │               │
│     │           │         │          │              │               │
│     └───── all nodes reference ── ContentSource ───┘               │
│                                                                     │
│  User ──▶ UserTopicProgress ──▶ Topic / Subtopic                   │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│                     Content Lifecycle                                │
│                                                                     │
│  DEMO ──▶ DRAFT ──▶ VERIFIED ──▶ ARCHIVED                         │
│  (seed)   (author)  (reviewed)   (superseded)                      │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│                     Search & Retrieval                               │
│                                                                     │
│  Full-text search ──▶ Relevance scoring (Subject=100 … Objective=60)│
│  AI retrieval    ──▶ getBiologyContext() ──▶ BiologyContext object  │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│                     Localization                                     │
│                                                                     │
│  Content: English columns + Sinhala columns (DB)                    │
│  UI:      i18n translation files (en.json, si.json)                 │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### API Route Map

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/content/subjects` | `GET` | List all subjects |
| `/api/content/subjects/[slug]` | `GET` | Get subject with units |
| `/api/content/units/[slug]` | `GET` | Get unit with topics |
| `/api/content/topics/[slug]` | `GET` | Get topic with subtopics & objectives |
| `/api/content/search?q=` | `GET` | Full-text search across all levels |
| `/api/content/progress` | `GET` | Get user's progress for a topic |
| `/api/content/progress` | `POST` | Update user's progress |
| `/api/content/ai-context` | `POST` | Get `BiologyContext` for AI coach |
| `/api/admin/content/**` | `*` | Admin CRUD (future, auth-gated) |

---

*Document version: 1.0 — BioPulse Content Architecture*
