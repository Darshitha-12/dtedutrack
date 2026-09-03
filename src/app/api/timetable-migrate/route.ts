import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const maxDuration = 60;

const CREATE_TIMETABLE = `
CREATE TABLE IF NOT EXISTS "timetables" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "title" TEXT NOT NULL DEFAULT 'My AI Timetable',
  "weeklyTargetMin" INTEGER NOT NULL DEFAULT 0,
  "examDate" TIMESTAMP(3),
  "rawInput" JSONB NOT NULL DEFAULT '{}',
  "planText" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "timetables_pkey" PRIMARY KEY ("id")
);
`;

const CREATE_SLOT = `
CREATE TABLE IF NOT EXISTS "timetable_slots" (
  "id" TEXT NOT NULL,
  "timetableId" TEXT NOT NULL,
  "subjectName" TEXT NOT NULL DEFAULT '',
  "subjectId" TEXT NOT NULL DEFAULT '',
  "color" TEXT NOT NULL DEFAULT '#10B981',
  "date" TIMESTAMP(3),
  "dayOfWeek" INTEGER,
  "startMinute" INTEGER NOT NULL,
  "endMinute" INTEGER NOT NULL,
  "type" TEXT NOT NULL DEFAULT 'Learn',
  "note" TEXT NOT NULL DEFAULT '',
  CONSTRAINT "timetable_slots_pkey" PRIMARY KEY ("id")
);
`;

const INDEXES = `
CREATE INDEX IF NOT EXISTS "timetables_userId_idx" ON "timetables"("userId");
`;

const SLOT_INDEXES = `
CREATE INDEX IF NOT EXISTS "timetable_slots_timetableId_date_idx" ON "timetable_slots"("timetableId", "date");
CREATE INDEX IF NOT EXISTS "timetable_slots_timetableId_dayOfWeek_idx" ON "timetable_slots"("timetableId", "dayOfWeek");
`;

const FKS = `
ALTER TABLE "timetables" DROP CONSTRAINT IF EXISTS "timetables_userId_fkey";
`;

const FK_USER_ADD = `
ALTER TABLE "timetables" ADD CONSTRAINT "timetables_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
`;

const FK_SLOT_DROP = `
ALTER TABLE "timetable_slots" DROP CONSTRAINT IF EXISTS "timetable_slots_timetableId_fkey";
`;

const FK_SLOT_ADD = `
ALTER TABLE "timetable_slots" ADD CONSTRAINT "timetable_slots_timetableId_fkey"
  FOREIGN KEY ("timetableId") REFERENCES "timetables"("id") ON DELETE CASCADE ON UPDATE CASCADE;
`;

export async function GET(req: Request) {
  const key = new URL(req.url).searchParams.get("key");
  if (key !== "ttp-migrate-2026") {
    return NextResponse.json({ error: "bad key" }, { status: 403 });
  }
  const results: Record<string, string> = {};
  try {
    await db.$executeRawUnsafe(CREATE_TIMETABLE);
    results.timetables = "ok";
  } catch (e) {
    results.timetables = "ERR " + (e instanceof Error ? e.message : String(e)).slice(0, 200);
  }
  try {
    await db.$executeRawUnsafe(CREATE_SLOT);
    results.timetable_slots = "ok";
  } catch (e) {
    results.timetable_slots = "ERR " + (e instanceof Error ? e.message : String(e)).slice(0, 200);
  }
  try {
    await db.$executeRawUnsafe(INDEXES);
    results.timetable_index = "ok";
  } catch (e) {
    results.timetable_index = "ERR " + (e instanceof Error ? e.message : String(e)).slice(0, 200);
  }
  try {
    await db.$executeRawUnsafe(SLOT_INDEXES);
    results.slot_indexes = "ok";
  } catch (e) {
    results.slot_indexes = "ERR " + (e instanceof Error ? e.message : String(e)).slice(0, 200);
  }
  try {
    await db.$executeRawUnsafe(FKS);
    results.fk_drop = "ok";
  } catch (e) {
    results.fk_drop = "ERR " + (e instanceof Error ? e.message : String(e)).slice(0, 200);
  }
  try {
    await db.$executeRawUnsafe(FK_USER_ADD);
    results.fk_user = "ok";
  } catch (e) {
    results.fk_user = "ERR " + (e instanceof Error ? e.message : String(e)).slice(0, 200);
  }
  try {
    await db.$executeRawUnsafe(FK_SLOT_DROP);
    results.fk_slot_drop = "ok";
  } catch (e) {
    results.fk_slot_drop = "ERR " + (e instanceof Error ? e.message : String(e)).slice(0, 200);
  }
  try {
    await db.$executeRawUnsafe(FK_SLOT_ADD);
    results.fk_slot = "ok";
  } catch (e) {
    results.fk_slot = "ERR " + (e instanceof Error ? e.message : String(e)).slice(0, 200);
  }
  return NextResponse.json({ ok: true, results });
}