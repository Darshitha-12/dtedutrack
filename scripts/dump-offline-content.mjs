/**
 * Dumps the content corpus + question bank out of the database into static JSON
 * so the offline APK can ship the syllabus and quizzes as bundled assets.
 *
 * Outputs:
 *   public/offline/content.json          — subjects/units/topics/subtopics/objectives/questions
 *   src/generated/offline-manifest.json  — slug params for generateStaticParams
 *
 * Run: node scripts/dump-offline-content.mjs
 * Fails the build (exit 1) when the dump cannot be produced.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (!m) continue;
    let value = m[2];
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(m[1] in process.env)) process.env[m[1]] = value;
  }
}

loadEnvFile(path.join(root, ".env"));
loadEnvFile(path.join(root, ".env.prodlocal"));

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set (checked .env / .env.prodlocal)");
  process.exit(1);
}

const { PrismaClient } = await import("@prisma/client");
const prisma = new PrismaClient();

try {
  const [subjects, units, topics, subtopics, objectives, questions] =
    await Promise.all([
      prisma.contentSubject.findMany({ orderBy: { order: "asc" } }),
      prisma.contentUnit.findMany({ orderBy: { order: "asc" } }),
      prisma.contentTopic.findMany({ orderBy: { order: "asc" } }),
      prisma.contentSubtopic.findMany({ orderBy: { order: "asc" } }),
      prisma.contentLearningObjective.findMany({ orderBy: { order: "asc" } }),
      prisma.question.findMany({
        where: { status: "PUBLISHED" },
        include: { options: { orderBy: { order: "asc" } } },
        orderBy: { createdAt: "asc" },
      }),
    ]);

  if (subjects.length === 0) {
    console.error("Database has no content_subjects — run `npm run db:seed` first.");
    process.exit(1);
  }

  const dump = {
    exportedAt: new Date().toISOString(),
    subjects,
    units,
    topics,
    subtopics,
    objectives,
    questions,
  };

  const outDir = path.join(root, "public", "offline");
  fs.mkdirSync(outDir, { recursive: true });
  const contentFile = path.join(outDir, "content.json");
  fs.writeFileSync(contentFile, JSON.stringify(dump));

  const subjectParams = [];
  const unitParams = [];
  const topicParams = [];
  for (const s of subjects) {
    subjectParams.push({ subjectSlug: s.slug });
    for (const u of units.filter((x) => x.subjectId === s.id)) {
      unitParams.push({ subjectSlug: s.slug, unitSlug: u.slug });
      for (const t of topics.filter((x) => x.unitId === u.id)) {
        topicParams.push({
          subjectSlug: s.slug,
          unitSlug: u.slug,
          topicSlug: t.slug,
        });
      }
    }
  }
  const manifest = {
    generatedAt: dump.exportedAt,
    subjectParams,
    unitParams,
    topicParams,
  };
  const genDir = path.join(root, "src", "generated");
  fs.mkdirSync(genDir, { recursive: true });
  fs.writeFileSync(
    path.join(genDir, "offline-manifest.json"),
    JSON.stringify(manifest, null, 2)
  );

  const kb = Math.round(fs.statSync(contentFile).size / 1024);
  console.log(
    `offline content dump OK: ${subjects.length} subjects, ${units.length} units, ` +
      `${topics.length} topics, ${subtopics.length} subtopics, ${objectives.length} objectives, ` +
      `${questions.length} questions (${kb} KB)`
  );
} catch (err) {
  console.error("offline content dump FAILED:", err.message);
  process.exit(1);
} finally {
  await prisma.$disconnect();
}
