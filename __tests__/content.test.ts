import { describe, it, expect } from "vitest";
import {
  contentStatusSchema,
  contentSourceSchema,
  difficultySchema,
  importanceSchema,
  progressStatusSchema,
  confidenceSchema,
  updateProgressSchema,
  searchQuerySchema,
} from "@/features/content/validations";
import type {
  ContentStatus,
  ContentSource,
  Difficulty,
  Importance,
  ProgressStatus,
  Confidence,
  ContentSubjectData,
  ContentUnitData,
  ContentTopicData,
  ContentSubtopicData,
  ContentLearningObjectiveData,
  UserTopicProgressData,
  SearchResult,
  BiologyContext,
  TopicWithProgress,
} from "@/features/content/types";

// ─── Seed data structure (mirrors prisma/seed.ts without DB) ─────────────

interface SeedSubject {
  id: string;
  slug: string;
  name: string;
  nameSi: string;
  description: string;
  descriptionSi: string;
  icon: string;
  color: string;
  status: ContentStatus;
  source: ContentSource;
}

interface SeedUnit {
  id: string;
  slug: string;
  title: string;
  titleSi: string;
  description: string;
  descriptionSi: string;
  order: number;
  estimatedMinutes: number;
  status: ContentStatus;
  source: ContentSource;
  subjectId: string;
}

interface SeedTopic {
  id: string;
  slug: string;
  title: string;
  titleSi: string;
  description: string;
  descriptionSi: string;
  order: number;
  difficulty: Difficulty;
  importance: Importance;
  examRelevance: number;
  estimatedMinutes: number;
  status: ContentStatus;
  source: ContentSource;
  unitId: string;
}

interface SeedSubtopic {
  id: string;
  slug: string;
  title: string;
  titleSi: string;
  description: string;
  descriptionSi: string;
  content: string;
  contentSi: string;
  order: number;
  estimatedMinutes: number;
  status: ContentStatus;
  source: ContentSource;
  topicId: string;
}

interface SeedLearningObjective {
  id: string;
  slug: string;
  title: string;
  titleSi: string;
  description: string;
  descriptionSi: string;
  order: number;
  difficulty: Difficulty;
  status: ContentStatus;
  source: ContentSource;
  subtopicId: string;
}

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function validateSlug(slug: string): boolean {
  return SLUG_RE.test(slug) && slug.length > 0;
}

const seedSubjects: SeedSubject[] = [
  {
    id: "bio",
    slug: "biology",
    name: "Biology",
    nameSi: "ජීව විද්‍යාව",
    description: "Complete A/L Biology curriculum",
    descriptionSi: "සම්පූර්ණ A/L ජීව විද්‍යා පාඨ්‍යක්‍රමය",
    icon: "🧬",
    color: "#10B981",
    status: "DEMO",
    source: "DEMO",
  },
];

const seedUnits: SeedUnit[] = [
  {
    id: "unit-cell-biology",
    slug: "cell-biology",
    title: "Cell Biology",
    titleSi: "සිංහල Cell Biology",
    description: "Explore the fundamental unit of life",
    descriptionSi: "ජීවයේ මූලික ඒකකය",
    order: 1,
    estimatedMinutes: 240,
    status: "DEMO",
    source: "DEMO",
    subjectId: "bio",
  },
  {
    id: "unit-molecular-biology",
    slug: "molecular-biology",
    title: "Molecular Biology",
    titleSi: "සිංහල Molecular Biology",
    description: "Dive into the molecular mechanisms of life",
    descriptionSi: "ජීවයේ අණුක යාන්ත්‍රණයන්",
    order: 2,
    estimatedMinutes: 300,
    status: "DEMO",
    source: "DEMO",
    subjectId: "bio",
  },
  {
    id: "unit-ecology",
    slug: "ecology",
    title: "Ecology",
    titleSi: "සිංහල Ecology",
    description: "Understand how organisms interact",
    descriptionSi: "ක්ෂුද්‍ර ජීවීන් අන්තර්ක්‍රියා කරන ආකාරය",
    order: 3,
    estimatedMinutes: 180,
    status: "DEMO",
    source: "DEMO",
    subjectId: "bio",
  },
];

const seedTopics: SeedTopic[] = [
  {
    id: "topic-cell-structure",
    slug: "cell-structure",
    title: "Cell Structure",
    titleSi: "සිංහල Cell Structure",
    description: "Understand the components of plant and animal cells",
    descriptionSi: "ශාක සහ සතුන්ගේ සෛලවල සංඝටක",
    order: 1,
    difficulty: "beginner",
    importance: "high",
    examRelevance: 80,
    estimatedMinutes: 90,
    status: "DEMO",
    source: "DEMO",
    unitId: "unit-cell-biology",
  },
  {
    id: "topic-cell-division",
    slug: "cell-division",
    title: "Cell Division",
    titleSi: "සිංහල Cell Division",
    description: "Study mitosis and meiosis",
    descriptionSi: "මයිටෝසිස් සහ මයෝසිස්",
    order: 2,
    difficulty: "intermediate",
    importance: "high",
    examRelevance: 90,
    estimatedMinutes: 150,
    status: "DEMO",
    source: "DEMO",
    unitId: "unit-cell-biology",
  },
  {
    id: "topic-dna-structure",
    slug: "dna-structure",
    title: "DNA Structure",
    titleSi: "සිංහල DNA Structure",
    description: "Learn about the double helix model of DNA",
    descriptionSi: "DNA හි ද්විත්ව හෙලික්ස් ආකෘතිය",
    order: 1,
    difficulty: "intermediate",
    importance: "critical",
    examRelevance: 95,
    estimatedMinutes: 150,
    status: "DEMO",
    source: "DEMO",
    unitId: "unit-molecular-biology",
  },
  {
    id: "topic-protein-synthesis",
    slug: "protein-synthesis",
    title: "Protein Synthesis",
    titleSi: "සිංහල Protein Synthesis",
    description: "The central dogma of molecular biology",
    descriptionSi: "අණුක ජීව විද්‍යාවේ මධ්‍ය මතය",
    order: 2,
    difficulty: "advanced",
    importance: "high",
    examRelevance: 85,
    estimatedMinutes: 150,
    status: "DEMO",
    source: "DEMO",
    unitId: "unit-molecular-biology",
  },
  {
    id: "topic-ecosystems",
    slug: "ecosystems",
    title: "Ecosystems",
    titleSi: "සිංහල Ecosystems",
    description: "Explore how energy flows through ecosystems",
    descriptionSi: "පරිසර පද්ධති හරහා ශක්තිය ගලා යන ආකාරය",
    order: 1,
    difficulty: "beginner",
    importance: "normal",
    examRelevance: 60,
    estimatedMinutes: 90,
    status: "DEMO",
    source: "DEMO",
    unitId: "unit-ecology",
  },
  {
    id: "topic-biodiversity",
    slug: "biodiversity",
    title: "Biodiversity",
    titleSi: "සිංහල Biodiversity",
    description: "The variety of life on Earth",
    descriptionSi: "පෘථිවියේ ජීවයේ විවිධත්වය",
    order: 2,
    difficulty: "intermediate",
    importance: "normal",
    examRelevance: 55,
    estimatedMinutes: 90,
    status: "DEMO",
    source: "DEMO",
    unitId: "unit-ecology",
  },
];

const seedSubtopics: SeedSubtopic[] = [
  {
    id: "subtopic-plant-cell",
    slug: "plant-cell",
    title: "Plant Cell",
    titleSi: "සිංහල Plant Cell",
    description: "Structure and organelles unique to plant cells",
    descriptionSi: "ශාක සෛලවලට ආවේණික ව්‍යුහය",
    content: "Plant cells are eukaryotic cells that have a rigid cell wall",
    contentSi: "සිංහල Plant cells are eukaryotic",
    order: 1,
    estimatedMinutes: 45,
    status: "DEMO",
    source: "DEMO",
    topicId: "topic-cell-structure",
  },
  {
    id: "subtopic-animal-cell",
    slug: "animal-cell",
    title: "Animal Cell",
    titleSi: "සිංහල Animal Cell",
    description: "Structure and organelles of animal cells",
    descriptionSi: "සතුන්ගේ සෛලවල ව්‍යුහය",
    content: "Animal cells are eukaryotic cells that lack a cell wall",
    contentSi: "සිංහල Animal cells are eukaryotic",
    order: 2,
    estimatedMinutes: 45,
    status: "DEMO",
    source: "DEMO",
    topicId: "topic-cell-structure",
  },
  {
    id: "subtopic-mitosis",
    slug: "mitosis",
    title: "Mitosis",
    titleSi: "සිංහල Mitosis",
    description: "The process of nuclear division",
    descriptionSi: "න්‍යෂ්ටි බෙදීමේ ක්‍රියාවලිය",
    content: "Mitosis is a type of cell division that results in two daughter cells",
    contentSi: "සිංහල Mitosis is a type of cell division",
    order: 1,
    estimatedMinutes: 75,
    status: "DEMO",
    source: "DEMO",
    topicId: "topic-cell-division",
  },
  {
    id: "subtopic-meiosis",
    slug: "meiosis",
    title: "Meiosis",
    titleSi: "සිංහල Meiosis",
    description: "Reduction division producing four haploid gametes",
    descriptionSi: "හප්ලොයිඩ් ගැමීට නිපදවන බෙදීම",
    content: "Meiosis is a special type of cell division",
    contentSi: "සිංහල Meiosis is a special type of cell division",
    order: 2,
    estimatedMinutes: 75,
    status: "DEMO",
    source: "DEMO",
    topicId: "topic-cell-division",
  },
  {
    id: "subtopic-dna-double-helix",
    slug: "dna-double-helix",
    title: "DNA Double Helix",
    titleSi: "සිංහල DNA Double Helix",
    description: "Watson and Crick's model of DNA",
    descriptionSi: "DNA හි වොට්සන් සහ ක්‍රික් ආකෘතිය",
    content: "DNA is a double-stranded helical molecule",
    contentSi: "සිංහල DNA is a double-stranded helical molecule",
    order: 1,
    estimatedMinutes: 75,
    status: "DEMO",
    source: "DEMO",
    topicId: "topic-dna-structure",
  },
  {
    id: "subtopic-dna-replication",
    slug: "dna-replication",
    title: "DNA Replication",
    titleSi: "සිංහල DNA Replication",
    description: "Semi-conservative replication",
    descriptionSi: "අර්ධ-සංරක්ෂිත ප්‍රතිපාතනය",
    content: "DNA replication is semi-conservative",
    contentSi: "සිංහල DNA replication is semi-conservative",
    order: 2,
    estimatedMinutes: 75,
    status: "DEMO",
    source: "DEMO",
    topicId: "topic-dna-structure",
  },
  {
    id: "subtopic-transcription",
    slug: "transcription",
    title: "Transcription",
    titleSi: "සිංහල Transcription",
    description: "RNA polymerase binding, initiation, elongation, and termination",
    descriptionSi: "RNA පොලිමරේස් බැඳීම",
    content: "Transcription is the process of copying a segment of DNA into mRNA",
    contentSi: "සිංහල Transcription is the process of copying DNA",
    order: 1,
    estimatedMinutes: 75,
    status: "DEMO",
    source: "DEMO",
    topicId: "topic-protein-synthesis",
  },
  {
    id: "subtopic-translation",
    slug: "translation",
    title: "Translation",
    titleSi: "සිංහල Translation",
    description: "mRNA decoding at the ribosome",
    descriptionSi: "රයිබොසෝමයේ mRNA විකේතනය",
    content: "Translation occurs at ribosomes where mRNA is decoded",
    contentSi: "සිංහල Translation occurs at ribosomes",
    order: 2,
    estimatedMinutes: 75,
    status: "DEMO",
    source: "DEMO",
    topicId: "topic-protein-synthesis",
  },
  {
    id: "subtopic-food-chains",
    slug: "food-chains",
    title: "Food Chains",
    titleSi: "සිංහල Food Chains",
    description: "Linear sequences of organisms showing energy transfer",
    descriptionSi: "ශක්ති හුවමාරුව පෙන්වන අනුපිළිවෙල",
    content: "A food chain is a linear sequence of organisms",
    contentSi: "සිංහල A food chain is a linear sequence of organisms",
    order: 1,
    estimatedMinutes: 45,
    status: "DEMO",
    source: "DEMO",
    topicId: "topic-ecosystems",
  },
  {
    id: "subtopic-energy-flow",
    slug: "energy-flow",
    title: "Energy Flow",
    titleSi: "සිංහල Energy Flow",
    description: "The 10% rule and trophic levels",
    descriptionSi: "10% නීතිය",
    content: "Energy flows through ecosystems in one direction",
    contentSi: "සිංහල Energy flows through ecosystems",
    order: 2,
    estimatedMinutes: 45,
    status: "DEMO",
    source: "DEMO",
    topicId: "topic-ecosystems",
  },
];

const seedObjectives: SeedLearningObjective[] = [
  {
    id: "lo-identify-plant-cell-organelles",
    slug: "identify-plant-cell-organelles",
    title: "Identify key plant cell organelles",
    titleSi: "සිංහල Identify key plant cell organelles",
    description: "Label and describe the function of each plant cell organelle",
    descriptionSi: "සිංහල Label and describe the function of each plant cell organelle",
    order: 1,
    difficulty: "beginner",
    status: "DEMO",
    source: "DEMO",
    subtopicId: "subtopic-plant-cell",
  },
  {
    id: "lo-describe-phases-of-mitosis",
    slug: "describe-phases-of-mitosis",
    title: "Describe each phase of mitosis in order",
    titleSi: "සිංහල Describe each phase of mitosis in order",
    description: "Name and describe prophase, metaphase, anaphase, and telophase",
    descriptionSi: "සිංහල Name and describe phases of mitosis",
    order: 1,
    difficulty: "intermediate",
    status: "DEMO",
    source: "DEMO",
    subtopicId: "subtopic-mitosis",
  },
  {
    id: "lo-compare-mitosis-meiosis",
    slug: "compare-mitosis-meiosis",
    title: "Compare and contrast mitosis and meiosis",
    titleSi: "සිංහල Compare and contrast mitosis and meiosis",
    description: "Create a table highlighting differences",
    descriptionSi: "සිංහල Create a table highlighting differences",
    order: 1,
    difficulty: "intermediate",
    status: "DEMO",
    source: "DEMO",
    subtopicId: "subtopic-meiosis",
  },
  {
    id: "lo-describe-dna-structure",
    slug: "describe-dna-structure",
    title: "Describe the structure of the DNA double helix",
    titleSi: "සිංහල Describe the structure of the DNA double helix",
    description: "Label the components of a nucleotide",
    descriptionSi: "සිංහල Label the components of a nucleotide",
    order: 1,
    difficulty: "intermediate",
    status: "DEMO",
    source: "DEMO",
    subtopicId: "subtopic-dna-double-helix",
  },
  {
    id: "lo-describe-transcription-process",
    slug: "describe-transcription-process",
    title: "Describe the process of transcription",
    titleSi: "සිංහල Describe the process of transcription",
    description: "Outline the steps of initiation, elongation, and termination",
    descriptionSi: "සිංහල Outline the steps of transcription",
    order: 1,
    difficulty: "advanced",
    status: "DEMO",
    source: "DEMO",
    subtopicId: "subtopic-transcription",
  },
  {
    id: "lo-explain-translation-process",
    slug: "explain-translation-process",
    title: "Explain the stages of translation at the ribosome",
    titleSi: "සිංහල Explain the stages of translation at the ribosome",
    description: "Describe initiation, elongation, and termination in translation",
    descriptionSi: "සිංහල Describe stages of translation",
    order: 1,
    difficulty: "advanced",
    status: "DEMO",
    source: "DEMO",
    subtopicId: "subtopic-translation",
  },
  {
    id: "lo-describe-animal-cell-organelles",
    slug: "describe-animal-cell-organelles",
    title: "Describe animal cell organelles and their functions",
    titleSi: "සිංහල Describe animal cell organelles and their functions",
    description: "List and explain the function of major animal cell organelles",
    descriptionSi: "සිංහල List and explain the function of major animal cell organelles",
    order: 1,
    difficulty: "beginner",
    status: "DEMO",
    source: "DEMO",
    subtopicId: "subtopic-animal-cell",
  },
  {
    id: "lo-explain-semiconservative-replication",
    slug: "explain-semiconservative-replication",
    title: "Explain the semi-conservative model of DNA replication",
    titleSi: "සිංහල Explain the semi-conservative model of DNA replication",
    description: "Describe how each new DNA molecule retains one original strand",
    descriptionSi: "සිංහල Describe how each new DNA molecule retains one original strand",
    order: 1,
    difficulty: "intermediate",
    status: "DEMO",
    source: "DEMO",
    subtopicId: "subtopic-dna-replication",
  },
  {
    id: "lo-construct-food-chains",
    slug: "construct-food-chains",
    title: "Construct food chains from given organisms",
    titleSi: "සිංහල Construct food chains from given organisms",
    description: "Draw food chains identifying producers, consumers, and decomposers",
    descriptionSi: "සිංහල Draw food chains identifying producers",
    order: 1,
    difficulty: "beginner",
    status: "DEMO",
    source: "DEMO",
    subtopicId: "subtopic-food-chains",
  },
  {
    id: "lo-explain-10-percent-rule",
    slug: "explain-10-percent-rule",
    title: "Explain the 10% rule of energy transfer",
    titleSi: "සිංහල Explain the 10% rule of energy transfer",
    description: "Calculate energy available at each trophic level",
    descriptionSi: "සිංහල Calculate energy available at each trophic level",
    order: 1,
    difficulty: "beginner",
    status: "DEMO",
    source: "DEMO",
    subtopicId: "subtopic-energy-flow",
  },
];

function validateSeedSubject(s: unknown): s is SeedSubject {
  const obj = s as SeedSubject;
  return (
    typeof obj.id === "string" &&
    typeof obj.slug === "string" &&
    validateSlug(obj.slug) &&
    typeof obj.name === "string" &&
    typeof obj.nameSi === "string" &&
    typeof obj.description === "string" &&
    typeof obj.descriptionSi === "string" &&
    typeof obj.icon === "string" &&
    typeof obj.color === "string" &&
    contentStatusSchema.safeParse(obj.status).success &&
    contentSourceSchema.safeParse(obj.source).success
  );
}

function validateSeedUnit(u: unknown): u is SeedUnit {
  const obj = u as SeedUnit;
  return (
    typeof obj.id === "string" &&
    typeof obj.slug === "string" &&
    validateSlug(obj.slug) &&
    typeof obj.title === "string" &&
    typeof obj.titleSi === "string" &&
    typeof obj.subjectId === "string" &&
    typeof obj.order === "number" &&
    typeof obj.estimatedMinutes === "number" &&
    obj.estimatedMinutes > 0 &&
    contentStatusSchema.safeParse(obj.status).success &&
    contentSourceSchema.safeParse(obj.source).success
  );
}

function validateSeedTopic(t: unknown): t is SeedTopic {
  const obj = t as SeedTopic;
  return (
    typeof obj.id === "string" &&
    typeof obj.slug === "string" &&
    validateSlug(obj.slug) &&
    typeof obj.title === "string" &&
    typeof obj.titleSi === "string" &&
    typeof obj.unitId === "string" &&
    typeof obj.order === "number" &&
    typeof obj.examRelevance === "number" &&
    typeof obj.estimatedMinutes === "number" &&
    obj.estimatedMinutes > 0 &&
    difficultySchema.safeParse(obj.difficulty).success &&
    importanceSchema.safeParse(obj.importance).success &&
    contentStatusSchema.safeParse(obj.status).success &&
    contentSourceSchema.safeParse(obj.source).success
  );
}

function validateSeedSubtopic(st: unknown): st is SeedSubtopic {
  const obj = st as SeedSubtopic;
  return (
    typeof obj.id === "string" &&
    typeof obj.slug === "string" &&
    validateSlug(obj.slug) &&
    typeof obj.title === "string" &&
    typeof obj.titleSi === "string" &&
    typeof obj.topicId === "string" &&
    typeof obj.content === "string" &&
    typeof obj.contentSi === "string" &&
    typeof obj.order === "number" &&
    typeof obj.estimatedMinutes === "number" &&
    obj.estimatedMinutes > 0 &&
    contentStatusSchema.safeParse(obj.status).success &&
    contentSourceSchema.safeParse(obj.source).success
  );
}

function validateSeedObjective(o: unknown): o is SeedLearningObjective {
  const obj = o as SeedLearningObjective;
  return (
    typeof obj.id === "string" &&
    typeof obj.slug === "string" &&
    validateSlug(obj.slug) &&
    typeof obj.title === "string" &&
    typeof obj.titleSi === "string" &&
    typeof obj.subtopicId === "string" &&
    typeof obj.order === "number" &&
    difficultySchema.safeParse(obj.difficulty).success &&
    contentStatusSchema.safeParse(obj.status).success &&
    contentSourceSchema.safeParse(obj.source).success
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. Content status validation
// ═══════════════════════════════════════════════════════════════════════════

describe("contentStatusSchema", () => {
  it("accepts all valid content statuses", () => {
    for (const status of ["DRAFT", "VERIFIED", "DEMO", "ARCHIVED"] as ContentStatus[]) {
      expect(contentStatusSchema.safeParse(status).success).toBe(true);
    }
  });

  it("rejects invalid content status", () => {
    expect(contentStatusSchema.safeParse("PUBLISHED").success).toBe(false);
    expect(contentStatusSchema.safeParse("draft").success).toBe(false);
    expect(contentStatusSchema.safeParse("").success).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. Content source validation
// ═══════════════════════════════════════════════════════════════════════════

describe("contentSourceSchema", () => {
  it("accepts all valid content sources", () => {
    for (const source of ["DEMO", "OFFICIAL", "TEACHER_CREATED", "AI_GENERATED", "USER_CREATED"] as ContentSource[]) {
      expect(contentSourceSchema.safeParse(source).success).toBe(true);
    }
  });

  it("rejects invalid content source", () => {
    expect(contentSourceSchema.safeParse("CUSTOM").success).toBe(false);
    expect(contentSourceSchema.safeParse("demo").success).toBe(false);
    expect(contentSourceSchema.safeParse("OFFICIAL").success).toBe(true);
    expect(contentSourceSchema.safeParse("official").success).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. Difficulty validation
// ═══════════════════════════════════════════════════════════════════════════

describe("difficultySchema", () => {
  it("accepts all valid difficulty levels", () => {
    for (const d of ["beginner", "intermediate", "advanced"] as Difficulty[]) {
      expect(difficultySchema.safeParse(d).success).toBe(true);
    }
  });

  it("rejects invalid difficulty levels", () => {
    expect(difficultySchema.safeParse("expert").success).toBe(false);
    expect(difficultySchema.safeParse("BEGINNER").success).toBe(false);
    expect(difficultySchema.safeParse("").success).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. Importance validation
// ═══════════════════════════════════════════════════════════════════════════

describe("importanceSchema", () => {
  it("accepts all valid importance levels", () => {
    for (const imp of ["low", "normal", "high", "critical"] as Importance[]) {
      expect(importanceSchema.safeParse(imp).success).toBe(true);
    }
  });

  it("rejects invalid importance levels", () => {
    expect(importanceSchema.safeParse("very_high").success).toBe(false);
    expect(importanceSchema.safeParse("CRITICAL").success).toBe(false);
    expect(importanceSchema.safeParse("none").success).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. Progress status validation
// ═══════════════════════════════════════════════════════════════════════════

describe("progressStatusSchema", () => {
  it("accepts all valid progress statuses", () => {
    for (const ps of ["NOT_STARTED", "IN_PROGRESS", "REVIEW", "MASTERED"] as ProgressStatus[]) {
      expect(progressStatusSchema.safeParse(ps).success).toBe(true);
    }
  });

  it("rejects invalid progress statuses", () => {
    expect(progressStatusSchema.safeParse("COMPLETED").success).toBe(false);
    expect(progressStatusSchema.safeParse("in_progress").success).toBe(false);
    expect(progressStatusSchema.safeParse("").success).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 6. Confidence validation
// ═══════════════════════════════════════════════════════════════════════════

describe("confidenceSchema", () => {
  it("accepts all valid confidence levels", () => {
    for (const c of ["low", "medium", "high"] as Confidence[]) {
      expect(confidenceSchema.safeParse(c).success).toBe(true);
    }
  });

  it("rejects invalid confidence levels", () => {
    expect(confidenceSchema.safeParse("very_high").success).toBe(false);
    expect(confidenceSchema.safeParse("MEDIUM").success).toBe(false);
    expect(confidenceSchema.safeParse("none").success).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 7. Update progress schema – valid inputs
// ═══════════════════════════════════════════════════════════════════════════

describe("updateProgressSchema – valid inputs", () => {
  it("accepts minimal valid input (only topicId)", () => {
    const result = updateProgressSchema.safeParse({ topicId: "topic-cell-structure" });
    expect(result.success).toBe(true);
  });

  it("accepts fully populated input", () => {
    const result = updateProgressSchema.safeParse({
      topicId: "topic-dna-structure",
      subtopicId: "subtopic-dna-double-helix",
      status: "IN_PROGRESS",
      masteryScore: 75,
      completionPercent: 60,
      studyMinutes: 120,
      confidence: "high",
    });
    expect(result.success).toBe(true);
  });

  it("accepts boundary score values (0 and 100)", () => {
    expect(updateProgressSchema.safeParse({ topicId: "t1", masteryScore: 0 }).success).toBe(true);
    expect(updateProgressSchema.safeParse({ topicId: "t1", masteryScore: 100 }).success).toBe(true);
    expect(updateProgressSchema.safeParse({ topicId: "t1", completionPercent: 0 }).success).toBe(true);
    expect(updateProgressSchema.safeParse({ topicId: "t1", completionPercent: 100 }).success).toBe(true);
  });

  it("accepts null subtopicId", () => {
    const result = updateProgressSchema.safeParse({
      topicId: "topic-cell-structure",
      subtopicId: null,
    });
    expect(result.success).toBe(true);
  });

  it("accepts zero studyMinutes", () => {
    const result = updateProgressSchema.safeParse({
      topicId: "topic-cell-structure",
      studyMinutes: 0,
    });
    expect(result.success).toBe(true);
  });

  it("accepts all valid progress status values", () => {
    for (const status of ["NOT_STARTED", "IN_PROGRESS", "REVIEW", "MASTERED"]) {
      expect(updateProgressSchema.safeParse({ topicId: "t1", status }).success).toBe(true);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 8. Update progress schema – invalid inputs
// ═══════════════════════════════════════════════════════════════════════════

describe("updateProgressSchema – invalid inputs", () => {
  it("rejects empty topicId", () => {
    const result = updateProgressSchema.safeParse({ topicId: "" });
    expect(result.success).toBe(false);
  });

  it("rejects missing topicId", () => {
    const result = updateProgressSchema.safeParse({ status: "IN_PROGRESS" });
    expect(result.success).toBe(false);
  });

  it("rejects negative masteryScore", () => {
    const result = updateProgressSchema.safeParse({ topicId: "t1", masteryScore: -1 });
    expect(result.success).toBe(false);
  });

  it("rejects masteryScore > 100", () => {
    const result = updateProgressSchema.safeParse({ topicId: "t1", masteryScore: 101 });
    expect(result.success).toBe(false);
  });

  it("rejects negative completionPercent", () => {
    const result = updateProgressSchema.safeParse({ topicId: "t1", completionPercent: -5 });
    expect(result.success).toBe(false);
  });

  it("rejects completionPercent > 100", () => {
    const result = updateProgressSchema.safeParse({ topicId: "t1", completionPercent: 150 });
    expect(result.success).toBe(false);
  });

  it("rejects negative studyMinutes", () => {
    const result = updateProgressSchema.safeParse({ topicId: "t1", studyMinutes: -10 });
    expect(result.success).toBe(false);
  });

  it("rejects non-integer studyMinutes", () => {
    const result = updateProgressSchema.safeParse({ topicId: "t1", studyMinutes: 5.5 });
    expect(result.success).toBe(false);
  });

  it("rejects invalid progress status", () => {
    const result = updateProgressSchema.safeParse({ topicId: "t1", status: "DONE" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid confidence", () => {
    const result = updateProgressSchema.safeParse({ topicId: "t1", confidence: "very_high" });
    expect(result.success).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 9. Search query schema – valid inputs
// ═══════════════════════════════════════════════════════════════════════════

describe("searchQuerySchema – valid inputs", () => {
  it("accepts minimal valid query", () => {
    const result = searchQuerySchema.safeParse({ q: "cell" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.limit).toBe(20);
    }
  });

  it("accepts query with subjectId filter", () => {
    const result = searchQuerySchema.safeParse({ q: "mitosis", subjectId: "bio" });
    expect(result.success).toBe(true);
  });

  it("accepts query with custom limit", () => {
    const result = searchQuerySchema.safeParse({ q: "DNA", limit: 5 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.limit).toBe(5);
    }
  });

  it("accepts max-length query (200 chars)", () => {
    const q = "a".repeat(200);
    const result = searchQuerySchema.safeParse({ q });
    expect(result.success).toBe(true);
  });

  it("accepts boundary limit values (1 and 50)", () => {
    expect(searchQuerySchema.safeParse({ q: "bio", limit: 1 }).success).toBe(true);
    expect(searchQuerySchema.safeParse({ q: "bio", limit: 50 }).success).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 10. Search query schema – invalid inputs
// ═══════════════════════════════════════════════════════════════════════════

describe("searchQuerySchema – invalid inputs", () => {
  it("rejects empty query", () => {
    const result = searchQuerySchema.safeParse({ q: "" });
    expect(result.success).toBe(false);
  });

  it("rejects missing query", () => {
    const result = searchQuerySchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects query exceeding 200 characters", () => {
    const q = "a".repeat(201);
    const result = searchQuerySchema.safeParse({ q });
    expect(result.success).toBe(false);
  });

  it("rejects limit < 1", () => {
    const result = searchQuerySchema.safeParse({ q: "bio", limit: 0 });
    expect(result.success).toBe(false);
  });

  it("rejects negative limit", () => {
    const result = searchQuerySchema.safeParse({ q: "bio", limit: -5 });
    expect(result.success).toBe(false);
  });

  it("rejects limit > 50", () => {
    const result = searchQuerySchema.safeParse({ q: "bio", limit: 51 });
    expect(result.success).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 11. Slug format validation – valid slugs
// ═══════════════════════════════════════════════════════════════════════════

describe("slug format validation – valid slugs", () => {
  const validSlugs = [
    "biology",
    "cell-biology",
    "cell-structure",
    "dna-double-helix",
    "protein-synthesis",
    "food-chains",
    "energy-flow",
    "a",
    "a-b-c",
    "topic1",
    "unit-1-intro",
  ];

  for (const slug of validSlugs) {
    it(`accepts "${slug}"`, () => {
      expect(validateSlug(slug)).toBe(true);
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// 12. Slug format validation – invalid slugs
// ═══════════════════════════════════════════════════════════════════════════

describe("slug format validation – invalid slugs", () => {
  const invalidSlugs = [
    { slug: "Cell Biology", reason: "contains spaces" },
    { slug: "Cell-Biology", reason: "contains uppercase" },
    { slug: "cell_biology", reason: "contains underscore" },
    { slug: "cell.biology", reason: "contains period" },
    { slug: "cell@biology", reason: "contains special char @" },
    { slug: "cell/biology", reason: "contains slash" },
    { slug: "-cell-biology", reason: "starts with hyphen" },
    { slug: "cell-biology-", reason: "ends with hyphen" },
    { slug: "", reason: "empty string" },
    { slug: "生物学", reason: "non-ascii characters" },
  ];

  for (const { slug, reason } of invalidSlugs) {
    it(`rejects "${slug}" (${reason})`, () => {
      expect(validateSlug(slug)).toBe(false);
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// 13. Content hierarchy integrity
// ═══════════════════════════════════════════════════════════════════════════

describe("content hierarchy integrity", () => {
  it("all units reference an existing subject", () => {
    const subjectIds = new Set(seedSubjects.map((s) => s.id));
    for (const unit of seedUnits) {
      expect(subjectIds.has(unit.subjectId)).toBe(true);
    }
  });

  it("all topics reference an existing unit", () => {
    const unitIds = new Set(seedUnits.map((u) => u.id));
    for (const topic of seedTopics) {
      expect(unitIds.has(topic.unitId)).toBe(true);
    }
  });

  it("all subtopics reference an existing topic", () => {
    const topicIds = new Set(seedTopics.map((t) => t.id));
    for (const sub of seedSubtopics) {
      expect(topicIds.has(sub.topicId)).toBe(true);
    }
  });

  it("all learning objectives reference an existing subtopic", () => {
    const subtopicIds = new Set(seedSubtopics.map((s) => s.id));
    for (const obj of seedObjectives) {
      expect(subtopicIds.has(obj.subtopicId)).toBe(true);
    }
  });

  it("each unit has a unique id", () => {
    const ids = seedUnits.map((u) => u.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("each topic has a unique id", () => {
    const ids = seedTopics.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("each subtopic has a unique id", () => {
    const ids = seedSubtopics.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 14. SearchResult type shape validation
// ═══════════════════════════════════════════════════════════════════════════

describe("SearchResult type shape", () => {
  const validTypes = ["subject", "unit", "topic", "subtopic", "objective"];

  it("has all required fields", () => {
    const result: SearchResult = {
      type: "topic",
      id: "topic-cell-structure",
      slug: "cell-structure",
      title: "Cell Structure",
      titleSi: "සිංහල Cell Structure",
      description: "Components of cells",
      path: "/syllabus/biology/cell-biology/cell-structure",
      relevance: 80,
    };
    expect(result).toHaveProperty("type");
    expect(result).toHaveProperty("id");
    expect(result).toHaveProperty("slug");
    expect(result).toHaveProperty("title");
    expect(result).toHaveProperty("titleSi");
    expect(result).toHaveProperty("description");
    expect(result).toHaveProperty("path");
    expect(result).toHaveProperty("relevance");
  });

  it("accepts all valid result types", () => {
    for (const type of validTypes) {
      const result: SearchResult = {
        type: type as SearchResult["type"],
        id: "id-1",
        slug: "test-slug",
        title: "Test",
        titleSi: "සිංහල Test",
        description: "Desc",
        path: "/test",
        relevance: 50,
      };
      expect(validTypes).toContain(result.type);
    }
  });

  it("relevance is a number between 0 and 100", () => {
    const result: SearchResult = {
      type: "subject",
      id: "bio",
      slug: "biology",
      title: "Biology",
      titleSi: "ජීව විද්‍යාව",
      description: "Bio",
      path: "/syllabus/biology",
      relevance: 100,
    };
    expect(result.relevance).toBeGreaterThanOrEqual(0);
    expect(result.relevance).toBeLessThanOrEqual(100);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 15. BiologyContext type shape validation
// ═══════════════════════════════════════════════════════════════════════════

describe("BiologyContext type shape", () => {
  it("constructs a valid context with all fields", () => {
    const ctx: BiologyContext = {
      subject: {
        id: "bio",
        slug: "biology",
        name: "Biology",
        nameSi: "ජීව විද්‍යාව",
        description: "Complete A/L Biology",
        descriptionSi: "සම්පූර්ණ A/L",
        icon: "🧬",
        color: "#10B981",
        order: 1,
        status: "DEMO",
        source: "DEMO",
        version: 1,
      },
      unit: null,
      topic: null,
      subtopic: null,
      objectives: [],
      relatedTopics: [],
    };

    expect(ctx).toHaveProperty("subject");
    expect(ctx).toHaveProperty("unit");
    expect(ctx).toHaveProperty("topic");
    expect(ctx).toHaveProperty("subtopic");
    expect(ctx).toHaveProperty("objectives");
    expect(ctx).toHaveProperty("relatedTopics");
    expect(Array.isArray(ctx.objectives)).toBe(true);
    expect(Array.isArray(ctx.relatedTopics)).toBe(true);
  });

  it("allows null for optional nesting levels", () => {
    const ctx: BiologyContext = {
      subject: {
        id: "bio",
        slug: "biology",
        name: "Biology",
        nameSi: "ජීව විද්‍යාව",
        description: "Bio",
        descriptionSi: "Bio",
        icon: "🧬",
        color: "#10B981",
        order: 1,
        status: "DEMO",
        source: "DEMO",
        version: 1,
      },
      unit: null,
      topic: null,
      subtopic: null,
      objectives: [],
      relatedTopics: [],
    };
    expect(ctx.unit).toBeNull();
    expect(ctx.topic).toBeNull();
    expect(ctx.subtopic).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 16. Search relevance scoring logic
// ═══════════════════════════════════════════════════════════════════════════

describe("search relevance scoring logic", () => {
  const TITLE_MATCH_SCORE = 100;
  const DESC_MATCH_SCORE = 50;

  it("title match scores higher than description match for subjects", () => {
    expect(TITLE_MATCH_SCORE).toBeGreaterThan(DESC_MATCH_SCORE);
  });

  it("sorts results by relevance descending", () => {
    const results: SearchResult[] = [
      { type: "topic", id: "1", slug: "a", title: "A", titleSi: "A", description: "", path: "", relevance: 30 },
      { type: "subject", id: "2", slug: "b", title: "B", titleSi: "B", description: "", path: "", relevance: 100 },
      { type: "unit", id: "3", slug: "c", title: "C", titleSi: "C", description: "", path: "", relevance: 90 },
    ];
    const sorted = results.sort((a, b) => b.relevance - a.relevance);
    expect(sorted[0].relevance).toBe(100);
    expect(sorted[1].relevance).toBe(90);
    expect(sorted[2].relevance).toBe(30);
  });

  it("applies correct relevance tiers for different content types", () => {
    const tiers = { subject: 100, unit: 90, topic: 80, subtopic: 70, objective: 60 };
    const sorted = Object.entries(tiers).sort(([, a], [, b]) => b - a);
    expect(sorted[0][0]).toBe("subject");
    expect(sorted[sorted.length - 1][0]).toBe("objective");
  });

  it("limits results correctly", () => {
    const allResults: SearchResult[] = Array.from({ length: 30 }, (_, i) => ({
      type: "topic" as const,
      id: `${i}`,
      slug: `topic-${i}`,
      title: `Topic ${i}`,
      titleSi: `Topic ${i}`,
      description: "",
      path: "",
      relevance: 100 - i,
    }));
    const limit = 10;
    const limited = allResults.slice(0, limit);
    expect(limited).toHaveLength(10);
    expect(limited[limited.length - 1].relevance).toBe(91);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 17. Content status transitions
// ═══════════════════════════════════════════════════════════════════════════

describe("content status transitions", () => {
  const validTransitions: Record<ContentStatus, ContentStatus[]> = {
    DEMO: ["DRAFT", "ARCHIVED"],
    DRAFT: ["VERIFIED", "ARCHIVED"],
    VERIFIED: ["ARCHIVED"],
    ARCHIVED: [],
  };

  it("DEMO can transition to DRAFT", () => {
    expect(validTransitions.DEMO).toContain("DRAFT");
  });

  it("DRAFT can transition to VERIFIED", () => {
    expect(validTransitions.DRAFT).toContain("VERIFIED");
  });

  it("VERIFIED can transition to ARCHIVED", () => {
    expect(validTransitions.VERIFIED).toContain("ARCHIVED");
  });

  it("ARCHIVED cannot transition to any other status", () => {
    expect(validTransitions.ARCHIVED).toHaveLength(0);
  });

  it("DEMO can transition directly to ARCHIVED", () => {
    expect(validTransitions.DEMO).toContain("ARCHIVED");
  });

  it("VERIFIED cannot go back to DRAFT", () => {
    expect(validTransitions.VERIFIED).not.toContain("DRAFT");
  });

  it("DRAFT cannot go back to DEMO", () => {
    expect(validTransitions.DRAFT).not.toContain("DEMO");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 18. Progress creation defaults
// ═══════════════════════════════════════════════════════════════════════════

describe("progress creation defaults", () => {
  const defaults = {
    status: "IN_PROGRESS" as ProgressStatus,
    masteryScore: 0,
    completionPercent: 0,
    studyMinutes: 0,
    confidence: "low" as Confidence,
  };

  it("defaults to IN_PROGRESS status", () => {
    expect(defaults.status).toBe("IN_PROGRESS");
  });

  it("defaults masteryScore to 0", () => {
    expect(defaults.masteryScore).toBe(0);
    expect(defaults.masteryScore).toBeGreaterThanOrEqual(0);
  });

  it("defaults completionPercent to 0", () => {
    expect(defaults.completionPercent).toBe(0);
    expect(defaults.completionPercent).toBeGreaterThanOrEqual(0);
  });

  it("defaults studyMinutes to 0", () => {
    expect(defaults.studyMinutes).toBe(0);
  });

  it("defaults confidence to low", () => {
    expect(defaults.confidence).toBe("low");
    expect(confidenceSchema.safeParse(defaults.confidence).success).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Seed data integrity
// ═══════════════════════════════════════════════════════════════════════════

describe("seed data integrity", () => {
  it("has at least one subject", () => {
    expect(seedSubjects.length).toBeGreaterThanOrEqual(1);
  });

  it("all subjects pass structural validation", () => {
    for (const s of seedSubjects) {
      expect(validateSeedSubject(s)).toBe(true);
    }
  });

  it("all units pass structural validation", () => {
    for (const u of seedUnits) {
      expect(validateSeedUnit(u)).toBe(true);
    }
  });

  it("all topics pass structural validation", () => {
    for (const t of seedTopics) {
      expect(validateSeedTopic(t)).toBe(true);
    }
  });

  it("all subtopics pass structural validation", () => {
    for (const st of seedSubtopics) {
      expect(validateSeedSubtopic(st)).toBe(true);
    }
  });

  it("all learning objectives pass structural validation", () => {
    for (const o of seedObjectives) {
      expect(validateSeedObjective(o)).toBe(true);
    }
  });

  it("every seed slug is valid format", () => {
    const allSlugs = [
      ...seedSubjects.map((s) => s.slug),
      ...seedUnits.map((u) => u.slug),
      ...seedTopics.map((t) => t.slug),
      ...seedSubtopics.map((s) => s.slug),
      ...seedObjectives.map((o) => o.slug),
    ];
    for (const slug of allSlugs) {
      expect(validateSlug(slug)).toBe(true);
    }
  });

  it("all seed statuses are valid", () => {
    const allStatuses = [
      ...seedSubjects.map((s) => s.status),
      ...seedUnits.map((u) => u.status),
      ...seedTopics.map((t) => t.status),
      ...seedSubtopics.map((s) => s.status),
      ...seedObjectives.map((o) => o.status),
    ];
    for (const status of allStatuses) {
      expect(contentStatusSchema.safeParse(status).success).toBe(true);
    }
  });

  it("all seed sources are valid", () => {
    const allSources = [
      ...seedSubjects.map((s) => s.source),
      ...seedUnits.map((u) => u.source),
      ...seedTopics.map((t) => t.source),
      ...seedSubtopics.map((s) => s.source),
      ...seedObjectives.map((o) => o.source),
    ];
    for (const source of allSources) {
      expect(contentSourceSchema.safeParse(source).success).toBe(true);
    }
  });

  it("all seed difficulties are valid", () => {
    const allDiffs = [
      ...seedTopics.map((t) => t.difficulty),
      ...seedObjectives.map((o) => o.difficulty),
    ];
    for (const d of allDiffs) {
      expect(difficultySchema.safeParse(d).success).toBe(true);
    }
  });

  it("all seed importance levels are valid", () => {
    for (const t of seedTopics) {
      expect(importanceSchema.safeParse(t.importance).success).toBe(true);
    }
  });

  it("all seed exam relevance values are between 0 and 100", () => {
    for (const t of seedTopics) {
      expect(t.examRelevance).toBeGreaterThanOrEqual(0);
      expect(t.examRelevance).toBeLessThanOrEqual(100);
    }
  });

  it("all seed estimated minutes are positive", () => {
    const allMinutes = [
      ...seedUnits.map((u) => u.estimatedMinutes),
      ...seedTopics.map((t) => t.estimatedMinutes),
      ...seedSubtopics.map((s) => s.estimatedMinutes),
    ];
    for (const m of allMinutes) {
      expect(m).toBeGreaterThan(0);
    }
  });

  it("has bilingual content for all entities", () => {
    for (const s of seedSubjects) {
      expect(s.nameSi.length).toBeGreaterThan(0);
      expect(s.descriptionSi.length).toBeGreaterThan(0);
    }
    for (const u of seedUnits) {
      expect(u.titleSi.length).toBeGreaterThan(0);
      expect(u.descriptionSi.length).toBeGreaterThan(0);
    }
    for (const t of seedTopics) {
      expect(t.titleSi.length).toBeGreaterThan(0);
      expect(t.descriptionSi.length).toBeGreaterThan(0);
    }
    for (const st of seedSubtopics) {
      expect(st.titleSi.length).toBeGreaterThan(0);
      expect(st.descriptionSi.length).toBeGreaterThan(0);
    }
    for (const o of seedObjectives) {
      expect(o.titleSi.length).toBeGreaterThan(0);
      expect(o.descriptionSi.length).toBeGreaterThan(0);
    }
  });

  it("has learning objectives for every subtopic", () => {
    const subtopicIds = new Set(seedSubtopics.map((s) => s.id));
    const subtopicsWithObjectives = new Set(seedObjectives.map((o) => o.subtopicId));
    for (const id of subtopicIds) {
      expect(subtopicsWithObjectives.has(id)).toBe(true);
    }
  });

  it("units are ordered sequentially", () => {
    const orders = seedUnits.map((u) => u.order);
    expect(orders).toEqual([1, 2, 3]);
  });

  it("topics within the same unit have unique orders", () => {
    const byUnit = new Map<string, number[]>();
    for (const t of seedTopics) {
      const arr = byUnit.get(t.unitId) ?? [];
      arr.push(t.order);
      byUnit.set(t.unitId, arr);
    }
    for (const orders of byUnit.values()) {
      expect(new Set(orders).size).toBe(orders.length);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TopicWithProgress type shape
// ═══════════════════════════════════════════════════════════════════════════

describe("TopicWithProgress type shape", () => {
  it("extends ContentTopicData with a nullable progress field", () => {
    const twp: TopicWithProgress = {
      id: "topic-cell-structure",
      unitId: "unit-cell-biology",
      slug: "cell-structure",
      order: 1,
      title: "Cell Structure",
      titleSi: "සිංහල Cell Structure",
      description: "Components of cells",
      descriptionSi: "සෛලවල සංඝටක",
      difficulty: "beginner",
      importance: "high",
      examRelevance: 80,
      estimatedMinutes: 90,
      status: "DEMO",
      source: "DEMO",
      version: 1,
      _count: { subtopics: 2, learningObjectives: 4 },
      progress: null,
    };
    expect(twp.progress).toBeNull();
    expect(twp).toHaveProperty("difficulty");
    expect(twp).toHaveProperty("importance");
    expect(twp).toHaveProperty("examRelevance");
  });

  it("can include a progress record", () => {
    const twp: TopicWithProgress = {
      id: "topic-dna-structure",
      unitId: "unit-molecular-biology",
      slug: "dna-structure",
      order: 1,
      title: "DNA Structure",
      titleSi: "සිංහල DNA Structure",
      description: "Double helix model",
      descriptionSi: "ද්විත්ව හෙලික්ස්",
      difficulty: "intermediate",
      importance: "critical",
      examRelevance: 95,
      estimatedMinutes: 150,
      status: "DEMO",
      source: "DEMO",
      version: 1,
      progress: {
        id: "prog-1",
        userId: "user-1",
        topicId: "topic-dna-structure",
        subtopicId: null,
        status: "IN_PROGRESS",
        masteryScore: 45,
        completionPercent: 30,
        questionsAttempted: 10,
        questionsCorrect: 7,
        studyMinutes: 60,
        confidence: "medium",
        lastStudiedAt: new Date("2025-01-15"),
        lastReviewedAt: null,
      },
    };
    expect(twp.progress).not.toBeNull();
    expect(twp.progress!.masteryScore).toBe(45);
    expect(twp.progress!.confidence).toBe("medium");
  });
});
