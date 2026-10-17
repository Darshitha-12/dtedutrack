import { db } from "@/lib/db";

/**
 * Direct-message extras: emoji reactions and per-user "delete for me".
 *
 * The deployed database is managed with `db push` and has no migration history, so — exactly
 * like the chat status tables — the two side tables are created on first use. They are kept
 * separate from `direct_messages` so a schema change can never hide or corrupt real messages.
 *
 * One reaction per (message, user), mirroring `status_reactions`: reacting again replaces the
 * previous emoji, and reacting with the same emoji clears it.
 */

let ready: Promise<void> | null = null;

async function createTables() {
  await db.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "dm_reactions" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "dm_reactions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "dm_reactions_messageId_userId_key" UNIQUE ("messageId", "userId")
  )`);
  await db.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "dm_reactions_messageId_idx" ON "dm_reactions" ("messageId")`,
  );
  await db.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "dm_deletions" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "dm_deletions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "dm_deletions_messageId_userId_key" UNIQUE ("messageId", "userId")
  )`);
  await db.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "dm_deletions_userId_idx" ON "dm_deletions" ("userId")`,
  );
}

/**
 * Idempotent. Cached per server instance, and re-arms itself on failure so a cold database
 * only costs one retry.
 */
export function ensureDmExtras(): Promise<void> {
  if (!ready) {
    ready = createTables().catch((error) => {
      console.error("ensureDmExtras error:", error);
      ready = null;
    });
  }
  return ready;
}

export type ReactionSummary = { emoji: string; count: number; mine: boolean };

function summarise(
  rows: { messageId: string; emoji: string; userId: string }[],
  me: string,
): Map<string, ReactionSummary[]> {
  const out = new Map<string, ReactionSummary[]>();
  for (const row of rows) {
    const list = out.get(row.messageId) ?? [];
    const bucket = list.find((x) => x.emoji === row.emoji);
    if (bucket) {
      bucket.count += 1;
      if (row.userId === me) bucket.mine = true;
    } else {
      list.push({ emoji: row.emoji, count: 1, mine: row.userId === me });
    }
    out.set(row.messageId, list);
  }
  return out;
}

/** Message ids this user hid with "delete for me". */
export async function loadHiddenMessageIds(userId: string): Promise<Set<string>> {
  try {
    await ensureDmExtras();
    const rows = await db.$queryRawUnsafe<{ messageId: string }[]>(
      `SELECT "messageId" FROM "dm_deletions" WHERE "userId" = $1`,
      userId,
    );
    return new Set(rows.map((r) => r.messageId));
  } catch (error) {
    console.error("loadHiddenMessageIds error:", error);
    return new Set();
  }
}

/** Reactions for every message between two users, keyed by message id. */
export async function loadThreadReactions(
  me: string,
  partnerId: string,
): Promise<Map<string, ReactionSummary[]>> {
  try {
    await ensureDmExtras();
    const rows = await db.$queryRawUnsafe<{ messageId: string; emoji: string; userId: string }[]>(
      `SELECT r."messageId", r."emoji", r."userId"
         FROM "dm_reactions" r
         JOIN "direct_messages" m ON m."id" = r."messageId"
        WHERE (m."senderId" = $1 AND m."receiverId" = $2)
           OR (m."senderId" = $2 AND m."receiverId" = $1)`,
      me,
      partnerId,
    );
    return summarise(rows, me);
  } catch (error) {
    console.error("loadThreadReactions error:", error);
    return new Map();
  }
}

/** Reactions for a single message, so a react/unreact can answer with the fresh tally. */
export async function loadMessageReactions(
  messageId: string,
  me: string,
): Promise<ReactionSummary[]> {
  try {
    await ensureDmExtras();
    const rows = await db.$queryRawUnsafe<{ emoji: string; userId: string }[]>(
      `SELECT "emoji", "userId" FROM "dm_reactions" WHERE "messageId" = $1`,
      messageId,
    );
    return summarise(
      rows.map((r) => ({ messageId, emoji: r.emoji, userId: r.userId })),
      me,
    ).get(messageId) ?? [];
  } catch (error) {
    console.error("loadMessageReactions error:", error);
    return [];
  }
}

/** Toggle one user's reaction on one message. Empty emoji clears it. */
export async function setMessageReaction(
  messageId: string,
  userId: string,
  emoji: string,
  id: string,
): Promise<void> {
  await ensureDmExtras();
  if (!emoji) {
    await db.$executeRawUnsafe(
      `DELETE FROM "dm_reactions" WHERE "messageId" = $1 AND "userId" = $2`,
      messageId,
      userId,
    );
    return;
  }
  await db.$executeRawUnsafe(
    `INSERT INTO "dm_reactions" ("id", "messageId", "userId", "emoji")
     VALUES ($1, $2, $3, $4)
     ON CONFLICT ("messageId", "userId")
     DO UPDATE SET "emoji" = EXCLUDED."emoji", "createdAt" = CURRENT_TIMESTAMP`,
    id,
    messageId,
    userId,
    emoji,
  );
}

/** Hide a message for one user only ("delete for me"). */
export async function hideMessageForUser(
  messageId: string,
  userId: string,
  id: string,
): Promise<void> {
  await ensureDmExtras();
  await db.$executeRawUnsafe(
    `INSERT INTO "dm_deletions" ("id", "messageId", "userId")
     VALUES ($1, $2, $3)
     ON CONFLICT ("messageId", "userId") DO NOTHING`,
    id,
    messageId,
    userId,
  );
}

/** Remove every trace of a message that is being deleted for everyone. */
export async function purgeMessageExtras(messageId: string): Promise<void> {
  try {
    await ensureDmExtras();
    await db.$executeRawUnsafe(`DELETE FROM "dm_reactions" WHERE "messageId" = $1`, messageId);
    await db.$executeRawUnsafe(`DELETE FROM "dm_deletions" WHERE "messageId" = $1`, messageId);
  } catch (error) {
    console.error("purgeMessageExtras error:", error);
  }
}
