import { db } from "@/lib/db";

/**
 * Status extras: mutes, per-user hides and forwards.
 *
 * The deployed database is managed with `db push` and carries no migration history, so —
 * exactly like `dm-extras` and the chat status tables — every side table and every new
 * column is created on first use. They live beside `user_statuses` rather than inside it
 * so a schema change can never hide or corrupt a real update.
 */

let ready: Promise<void> | null = null;

async function createTables() {
  await db.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "status_mutes" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mutedId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "status_mutes_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "status_mutes_userId_mutedId_key" UNIQUE ("userId", "mutedId")
  )`);
  await db.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "status_mutes_userId_idx" ON "status_mutes" ("userId")`,
  );

  await db.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "status_hides" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "statusId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "status_hides_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "status_hides_userId_statusId_key" UNIQUE ("userId", "statusId")
  )`);
  await db.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "status_hides_userId_idx" ON "status_hides" ("userId")`,
  );

  await db.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "status_forwards" (
    "id" TEXT NOT NULL,
    "statusId" TEXT NOT NULL,
    "fromId" TEXT NOT NULL,
    "toId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "status_forwards_pkey" PRIMARY KEY ("id")
  )`);
  await db.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "status_forwards_statusId_idx" ON "status_forwards" ("statusId")`,
  );

  // New columns on the existing table. `ADD COLUMN IF NOT EXISTS` keeps this safe on a
  // database that predates them (and on every subsequent boot).
  await db.$executeRawUnsafe(
    `ALTER TABLE "user_statuses" ADD COLUMN IF NOT EXISTS "caption" TEXT`,
  );
  await db.$executeRawUnsafe(
    `ALTER TABLE "user_statuses" ADD COLUMN IF NOT EXISTS "bgColor" TEXT`,
  );
  await db.$executeRawUnsafe(
    `ALTER TABLE "user_statuses" ADD COLUMN IF NOT EXISTS "font" TEXT`,
  );
  await db.$executeRawUnsafe(
    `ALTER TABLE "user_statuses" ADD COLUMN IF NOT EXISTS "expiresAt" TIMESTAMP(3)`,
  );
  await db.$executeRawUnsafe(
    `ALTER TABLE "user_statuses" ADD COLUMN IF NOT EXISTS "pinned" BOOLEAN NOT NULL DEFAULT false`,
  );
  await db.$executeRawUnsafe(
    `ALTER TABLE "user_statuses" ADD COLUMN IF NOT EXISTS "editedAt" TIMESTAMP(3)`,
  );
  // Backfill: rows written before `expiresAt` existed expire 24h after creation.
  await db.$executeRawUnsafe(
    `UPDATE "user_statuses" SET "expiresAt" = "createdAt" + INTERVAL '24 hours' WHERE "expiresAt" IS NULL`,
  );
}

/** Idempotent, cached per process: every status route awaits this before touching a table. */
export function ensureStatusExtras(): Promise<void> {
  if (!ready) {
    ready = createTables().catch((error) => {
      ready = null;
      throw error;
    });
  }
  return ready;
}

/** Ids of users whose statuses `userId` muted. */
export async function loadMutedUserIds(userId: string): Promise<Set<string>> {
  try {
    await ensureStatusExtras();
    const rows = await db.$queryRawUnsafe<{ mutedId: string }[]>(
      `SELECT "mutedId" FROM "status_mutes" WHERE "userId" = $1`,
      userId,
    );
    return new Set(rows.map((r) => r.mutedId));
  } catch (error) {
    console.error("loadMutedUserIds error:", error);
    return new Set();
  }
}

/** Toggle a status mute. Returns the new state (true = muted). */
export async function setStatusMuted(
  userId: string,
  mutedId: string,
  muted: boolean,
): Promise<boolean> {
  await ensureStatusExtras();
  if (muted) {
    await db.$executeRawUnsafe(
      `INSERT INTO "status_mutes" ("id", "userId", "mutedId")
       VALUES (gen_random_uuid()::text, $1, $2)
       ON CONFLICT ("userId", "mutedId") DO NOTHING`,
      userId,
      mutedId,
    );
  } else {
    await db.$executeRawUnsafe(
      `DELETE FROM "status_mutes" WHERE "userId" = $1 AND "mutedId" = $2`,
      userId,
      mutedId,
    );
  }
  return muted;
}

/** Ids of status items `userId` removed from their own feed ("delete for me"). */
export async function loadHiddenStatusIds(userId: string): Promise<Set<string>> {
  try {
    await ensureStatusExtras();
    const rows = await db.$queryRawUnsafe<{ statusId: string }[]>(
      `SELECT "statusId" FROM "status_hides" WHERE "userId" = $1`,
      userId,
    );
    return new Set(rows.map((r) => r.statusId));
  } catch (error) {
    console.error("loadHiddenStatusIds error:", error);
    return new Set();
  }
}

/** "Delete for me" on a single status item (the author's own item is deleted for everyone). */
export async function hideStatusForUser(userId: string, statusId: string): Promise<void> {
  await ensureStatusExtras();
  await db.$executeRawUnsafe(
    `INSERT INTO "status_hides" ("id", "userId", "statusId")
     VALUES (gen_random_uuid()::text, $1, $2)
     ON CONFLICT ("userId", "statusId") DO NOTHING`,
    userId,
    statusId,
  );
}

/** Record a forward (used to show "Forwarded" and to stop double forwards). */
export async function recordStatusForward(
  statusId: string,
  fromId: string,
  toId: string,
): Promise<void> {
  await ensureStatusExtras();
  await db.$executeRawUnsafe(
    `INSERT INTO "status_forwards" ("id", "statusId", "fromId", "toId")
     VALUES (gen_random_uuid()::text, $1, $2, $3)`,
    statusId,
    fromId,
    toId,
  );
}

/** Whether `statusId` was already forwarded into the `fromId` → `toId` thread. */
export async function hasForwardedStatus(
  statusId: string,
  fromId: string,
  toId: string,
): Promise<boolean> {
  try {
    await ensureStatusExtras();
    const rows = await db.$queryRawUnsafe<{ n: bigint }[]>(
      `SELECT COUNT(*)::bigint AS n FROM "status_forwards"
        WHERE "statusId" = $1 AND "fromId" = $2 AND "toId" = $3`,
      statusId,
      fromId,
      toId,
    );
    return Number(rows[0]?.n ?? 0) > 0;
  } catch {
    return false;
  }
}
