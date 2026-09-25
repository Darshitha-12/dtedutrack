import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

async function ensureSchema() {
  try {
    await db.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "status_reactions" (
      "id" TEXT NOT NULL,
      "statusId" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      "emoji" TEXT NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "status_reactions_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "status_reactions_statusId_userId_key" UNIQUE ("statusId", "userId")
    )`);
  } catch (error) {
    console.error("status reaction ensureSchema error:", error);
  }
}

const reactionSchema = z.object({
  statusId: z.string().min(1).max(200),
  emoji: z.string().min(1).max(16),
});

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    await ensureSchema();

    const body = await req.json();
    const parsed = reactionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }
    const { statusId, emoji } = parsed.data;

    const status = await db.userStatus.findUnique({ where: { id: statusId } });
    if (!status) {
      return NextResponse.json({ error: "Status not found" }, { status: 404 });
    }

    // Toggle: same emoji removes the reaction.
    const existing = await db.statusReaction.findUnique({
      where: { statusId_userId: { statusId, userId: session.user.id } },
    });
    if (existing?.emoji === emoji) {
      await db.statusReaction.delete({
        where: { statusId_userId: { statusId, userId: session.user.id } },
      });
    } else {
      await db.statusReaction.upsert({
        where: { statusId_userId: { statusId, userId: session.user.id } },
        create: { statusId, userId: session.user.id, emoji },
        update: { emoji },
      });
    }

    const reactions = await db.statusReaction.findMany({ where: { statusId } });
    const reactionMap: Record<string, number> = {};
    for (const r of reactions) reactionMap[r.emoji] = (reactionMap[r.emoji] || 0) + 1;
    const myReaction = reactions.find((r) => r.userId === session.user!.id)?.emoji || null;

    return NextResponse.json({
      myReaction,
      reactions: Object.entries(reactionMap)
        .map(([emoji, count]) => ({ emoji, count }))
        .sort((a, b) => b.count - a.count),
    });
  } catch (error) {
    console.error("Status reaction POST error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}