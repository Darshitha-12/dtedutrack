import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

const EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

async function ensureSchema() {
  try {
    await db.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "user_statuses" (
      "id" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      "text" TEXT,
      "imageUrl" TEXT,
      "imageType" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "user_statuses_pkey" PRIMARY KEY ("id")
    )`);
    await db.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "user_statuses_userId_createdAt_idx" ON "user_statuses" ("userId", "createdAt")`
    );
    await db.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "status_views" (
      "id" TEXT NOT NULL,
      "statusId" TEXT NOT NULL,
      "viewerId" TEXT NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "status_views_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "status_views_statusId_viewerId_key" UNIQUE ("statusId", "viewerId")
    )`);
    await db.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "status_views_statusId_idx" ON "status_views" ("statusId")`
    );
    await db.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "status_reactions" (
      "id" TEXT NOT NULL,
      "statusId" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      "emoji" TEXT NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "status_reactions_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "status_reactions_statusId_userId_key" UNIQUE ("statusId", "userId")
    )`);
    await db.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "status_reactions_statusId_idx" ON "status_reactions" ("statusId")`
    );
  } catch (error) {
    console.error("ensureSchema error:", error);
  }
}

function pruneExpired() {
  db.userStatus
    .deleteMany({ where: { createdAt: { lt: new Date(Date.now() - EXPIRY_MS) } } })
    .catch(() => {});
}

const statusSchema = z.object({
  text: z.string().max(5000).optional().default(""),
  imageUrl: z.string().max(6_000_000).optional(),
  imageType: z.string().max(20).optional(),
  duration: z.number().max(60_000).optional(),
});

export async function GET(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    await ensureSchema();
    pruneExpired();

    const since = new Date(Date.now() - EXPIRY_MS);
    let rows: { id: string; text: string | null; imageUrl: string | null; imageType: string | null; createdAt: Date; userId: string; user: { id: string; name: string; displayName?: string | null; avatarUrl?: string | null; image?: string | null } }[];
    try {
      rows = (await db.userStatus.findMany({
        where: { createdAt: { gte: since } },
        include: {
          user: { select: { id: true, name: true, displayName: true, avatarUrl: true, image: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 500,
      })) as typeof rows;
    } catch {
      // Deployed DB may predate displayName/avatarUrl columns.
      rows = (await db.userStatus.findMany({
        where: { createdAt: { gte: since } },
        include: { user: { select: { id: true, name: true, image: true } } },
        orderBy: { createdAt: "desc" },
        take: 500,
      })) as typeof rows;
    }

    const statusIds = rows.map((s) => s.id);
    const ownIds = rows.filter((s) => s.userId === session.user!.id).map((s) => s.id);
    const [views, reactions, myViews] = await Promise.all([
      db.statusView.findMany({ where: { statusId: { in: statusIds } } }),
      db.statusReaction.findMany({ where: { statusId: { in: statusIds } } }),
      ownIds.length
        ? db.statusView.findMany({
            where: { statusId: { in: ownIds } },
            include: {
              viewer: { select: { id: true, name: true, displayName: true, avatarUrl: true, image: true } },
            },
            orderBy: { createdAt: "desc" },
          })
        : Promise.resolve([]),
    ]).catch(() => [[], [], []]);

    const myViewersByStatus: Record<string, { userId: string; name: string; image: string | null; viewedAt: string }[]> = {};
    for (const v of myViews as any[]) {
      const name = v.viewer?.displayName || v.viewer?.name || "User";
      const image = v.viewer?.image || v.viewer?.avatarUrl || null;
      (myViewersByStatus[v.statusId] ||= []).push({
        userId: v.viewer?.id || "?",
        name,
        image,
        viewedAt: v.createdAt?.toISOString?.() || new Date().toISOString(),
      });
    }

    const statuses = rows.map((s) => {
      const sViews = views.filter((v) => v.statusId === s.id);
      const sReactions = reactions.filter((r) => r.statusId === s.id);
      const mine = s.userId === session.user!.id;
      const reactionMap: Record<string, number> = {};
      for (const r of sReactions) reactionMap[r.emoji] = (reactionMap[r.emoji] || 0) + 1;
      return {
        id: s.id,
        userId: s.user.id,
        name: s.user.displayName || s.user.name || "User",
        image: s.user.image || s.user.avatarUrl || null,
        text: s.text,
        imageUrl: s.imageUrl,
        imageType: s.imageType,
        createdAt: s.createdAt.toISOString(),
        viewCount: sViews.length,
        myReaction: sReactions.find((r) => r.userId === session.user!.id)?.emoji || null,
        reactions: Object.entries(reactionMap)
          .map(([emoji, count]) => ({ emoji, count }))
          .sort((a, b) => b.count - a.count),
        seenByFew: sViews.length > 0 && sViews.length < 5,
        viewedByMe: mine || sViews.some((v) => v.viewerId === session.user!.id),
        viewers: mine ? (myViewersByStatus[s.id as keyof typeof myViewersByStatus] || []) : undefined,
      };
    });

    return NextResponse.json({ statuses });
  } catch (error) {
    console.error("Chat status GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    await ensureSchema();

    const body = await req.json();
    const parsed = statusSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }
    const { text, imageUrl, imageType, duration } = parsed.data;
    if (!text.trim() && !imageUrl) {
      return NextResponse.json({ error: "Status needs some text or media" }, { status: 400 });
    }

    const status = await db.userStatus.create({
      data: {
        userId: session.user.id,
        text: text.trim() || null,
        imageUrl: imageUrl || null,
        imageType: imageUrl ? imageType || (duration ? "video" : "image") : null,
      },
    });

    return NextResponse.json(
      { status: { id: status.id, createdAt: status.createdAt.toISOString() } },
      { status: 201 },
    );
  } catch (error) {
    console.error("Chat status POST error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    await ensureSchema();
    await db.userStatus.deleteMany({ where: { userId: session.user.id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Chat status DELETE error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}