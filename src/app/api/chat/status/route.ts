import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { chatPreflight, resolveChatUser } from "@/lib/chat-api";
import {
  ensureStatusExtras,
  hideStatusForUser,
  loadHiddenStatusIds,
  loadMutedUserIds,
} from "@/lib/status-extras";

const EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

/** WhatsApp-style text-status backgrounds. */
const TEXT_BACKGROUNDS = [
  "#0f172a",
  "#1e293b",
  "#334155",
  "#7c2d12",
  "#14532d",
  "#164e63",
  "#4c1d95",
  "#831843",
  "#3f3f46",
  "#0c4a6e",
];

const FONTS = ["classic", "serif", "bold", "script"] as const;

async function ensureSchema() {
  await ensureStatusExtras();
  await db.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "status_views" (
    "id" TEXT NOT NULL,
    "statusId" TEXT NOT NULL,
    "viewerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "status_views_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "status_views_statusId_viewerId_key" UNIQUE ("statusId", "viewerId")
  )`);
  await db.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "status_views_statusId_idx" ON "status_views" ("statusId")`,
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
    `CREATE INDEX IF NOT EXISTS "status_reactions_statusId_idx" ON "status_reactions" ("statusId")`,
  );
}

/** Drop expired, non-highlighted rows. Fire-and-forget so it never delays a read. */
function pruneExpired() {
  db.userStatus
    .deleteMany({
      where: { pinned: false, expiresAt: { lt: new Date() } },
    })
    .catch(() => {});
}

const statusSchema = z.object({
  text: z.string().max(5000).optional().default(""),
  imageUrl: z.string().max(14_000_000).optional(),
  imageType: z.string().max(20).optional(),
  caption: z.string().max(2000).optional(),
  bgColor: z.string().max(32).optional(),
  font: z.string().max(20).optional(),
  /** Keep this item past 24h as a highlight. */
  keep: z.boolean().optional(),
  duration: z.number().max(60_000).optional(),
});

const editSchema = z.object({
  statusId: z.string().min(1).max(200),
  text: z.string().max(5000).optional(),
  caption: z.string().max(2000).optional(),
  bgColor: z.string().max(32).optional(),
  font: z.string().max(20).optional(),
});

const deleteSchema = z.object({
  /** Omit to delete every one of my updates (the "Clear my status" button). */
  statusId: z.string().min(1).max(200).optional(),
});

export async function OPTIONS() {
  return chatPreflight();
}

export async function GET(req: Request) {
  try {
    const me = await resolveChatUser(req);
    if (!me) {
      return NextResponse.json(
        { error: "Session expired. Please sign in again." },
        { status: 401 },
      );
    }
    await ensureSchema();
    pruneExpired();

    const [hiddenIds, mutedIds] = await Promise.all([
      loadHiddenStatusIds(me.id),
      loadMutedUserIds(me.id),
    ]);

    const since = new Date(Date.now() - EXPIRY_MS);
    // Mine: everything I posted that has not expired or that I pinned. Others: only the
    // last 24 hours, minus the authors and items I muted/hid.
    const where = {
      OR: [
        { userId: me.id },
        { AND: [{ createdAt: { gte: since } }, { pinned: false }] },
      ],
    };

    let rows: {
      id: string;
      text: string | null;
      imageUrl: string | null;
      imageType: string | null;
      caption: string | null;
      bgColor: string | null;
      font: string | null;
      expiresAt: Date | null;
      pinned: boolean;
      editedAt: Date | null;
      createdAt: Date;
      userId: string;
      user: {
        id: string;
        name: string;
        displayName?: string | null;
        avatarUrl?: string | null;
        image?: string | null;
      };
    }[];
    try {
      rows = (await db.userStatus.findMany({
        where,
        include: {
          user: {
            select: { id: true, name: true, displayName: true, avatarUrl: true, image: true },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 500,
      })) as typeof rows;
    } catch {
      // Deployed DB may predate displayName/avatarUrl columns.
      rows = (await db.userStatus.findMany({
        where,
        include: { user: { select: { id: true, name: true, image: true } } },
        orderBy: { createdAt: "desc" },
        take: 500,
      })) as typeof rows;
    }

    // Hidden items and muted authors never reach the feed (my own are always shown).
    rows = rows.filter(
      (s) => s.userId === me.id || (!hiddenIds.has(s.id) && !mutedIds.has(s.userId)),
    );

    const statusIds = rows.map((s) => s.id);
    const ownIds = rows.filter((s) => s.userId === me.id).map((s) => s.id);
    const [views, reactions, myViews] = await Promise.all([
      statusIds.length
        ? db.statusView.findMany({ where: { statusId: { in: statusIds } } })
        : Promise.resolve([]),
      statusIds.length
        ? db.statusReaction.findMany({ where: { statusId: { in: statusIds } } })
        : Promise.resolve([]),
      ownIds.length
        ? db.statusView.findMany({
            where: { statusId: { in: ownIds } },
            include: {
              viewer: {
                select: { id: true, name: true, displayName: true, avatarUrl: true, image: true },
              },
            },
            orderBy: { createdAt: "desc" },
          })
        : Promise.resolve([]),
    ]).catch(() => [[], [], []]);

    const myViewersByStatus: Record<
      string,
      { userId: string; name: string; image: string | null; viewedAt: string }[]
    > = {};
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
      const mine = s.userId === me.id;
      const reactionMap: Record<string, number> = {};
      for (const r of sReactions) reactionMap[r.emoji] = (reactionMap[r.emoji] || 0) + 1;
      return {
        id: s.id,
        userId: s.user.id,
        name: s.user.displayName || s.user.name || "User",
        image: s.user.image || s.user.avatarUrl || null,
        text: s.text,
        caption: s.caption,
        imageUrl: s.imageUrl,
        imageType: s.imageType,
        bgColor: s.bgColor,
        font: s.font,
        pinned: s.pinned,
        editedAt: s.editedAt?.toISOString() || null,
        expiresAt: s.expiresAt?.toISOString() || null,
        createdAt: s.createdAt.toISOString(),
        viewCount: sViews.length,
        myReaction: sReactions.find((r) => r.userId === me.id)?.emoji || null,
        reactions: Object.entries(reactionMap)
          .map(([emoji, count]) => ({ emoji, count }))
          .sort((a, b) => b.count - a.count),
        seenByFew: sViews.length > 0 && sViews.length < 5,
        viewedByMe: mine || sViews.some((v) => v.viewerId === me.id),
        viewers: mine ? myViewersByStatus[s.id] || [] : undefined,
      };
    });

    return NextResponse.json({ statuses, mutedUserIds: [...mutedIds] });
  } catch (error) {
    console.error("Chat status GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const me = await resolveChatUser(req);
    if (!me) {
      return NextResponse.json(
        { error: "Session expired. Please sign in again." },
        { status: 401 },
      );
    }
    await ensureSchema();

    const body = await req.json();
    const parsed = statusSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }
    const { text, imageUrl, imageType, caption, bgColor, font, keep, duration } = parsed.data;
    if (!text.trim() && !imageUrl) {
      return NextResponse.json({ error: "Status needs some text or media" }, { status: 400 });
    }

    const status = await db.userStatus.create({
      data: {
        userId: me.id,
        text: text.trim() || null,
        imageUrl: imageUrl || null,
        imageType: imageUrl ? imageType || (duration ? "video" : "image") : null,
        caption: caption?.trim() || null,
        // A background only makes sense for a text-only update (WhatsApp hides it otherwise).
        bgColor: !imageUrl && bgColor ? bgColor : null,
        font: !imageUrl && font && FONTS.includes(font as (typeof FONTS)[number]) ? font : null,
        pinned: keep === true,
        expiresAt: new Date(Date.now() + EXPIRY_MS),
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

/** Edit the text/caption/colour of one of my own updates. */
export async function PATCH(req: Request) {
  try {
    const me = await resolveChatUser(req);
    if (!me) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    await ensureSchema();

    const parsed = editSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }
    const { statusId, text, caption, bgColor, font } = parsed.data;

    const existing = await db.userStatus.findUnique({
      where: { id: statusId },
      select: { userId: true, imageUrl: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Status not found" }, { status: 404 });
    }
    if (existing.userId !== me.id) {
      return NextResponse.json(
        { error: "You can only edit your own status" },
        { status: 403 },
      );
    }

    const updated = await db.userStatus.update({
      where: { id: statusId },
      data: {
        ...(text !== undefined ? { text: text.trim() || null } : {}),
        ...(caption !== undefined ? { caption: caption.trim() || null } : {}),
        ...(!existing.imageUrl && bgColor ? { bgColor } : {}),
        ...(!existing.imageUrl && font && FONTS.includes(font as (typeof FONTS)[number])
          ? { font }
          : {}),
        editedAt: new Date(),
      },
      select: { id: true, text: true, caption: true, editedAt: true },
    });

    return NextResponse.json({
      status: {
        id: updated.id,
        text: updated.text,
        caption: updated.caption,
        editedAt: updated.editedAt?.toISOString() || null,
      },
    });
  } catch (error) {
    console.error("Chat status PATCH error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/** Keep / unkeep one of my updates as a highlight (so it survives the 24h window). */
export async function PUT(req: Request) {
  try {
    const me = await resolveChatUser(req);
    if (!me) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    await ensureSchema();

    const parsed = z
      .object({ statusId: z.string().min(1).max(200), pinned: z.boolean() })
      .safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    const existing = await db.userStatus.findUnique({
      where: { id: parsed.data.statusId },
      select: { userId: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Status not found" }, { status: 404 });
    }
    if (existing.userId !== me.id) {
      return NextResponse.json({ error: "Not your status" }, { status: 403 });
    }

    await db.userStatus.update({
      where: { id: parsed.data.statusId },
      data: {
        pinned: parsed.data.pinned,
        // Unpinning restarts the 24h window from now, exactly like re-highlighting.
        expiresAt: parsed.data.pinned
          ? new Date(Date.now() + 365 * EXPIRY_MS)
          : new Date(Date.now() + EXPIRY_MS),
      },
    });

    return NextResponse.json({ ok: true, pinned: parsed.data.pinned });
  } catch (error) {
    console.error("Chat status PUT error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * Delete: one of my updates (statusId), or every one of them (no body / "Clear my status"),
 * or hide one of someone else's updates from my own feed ("delete for me").
 */
export async function DELETE(req: Request) {
  try {
    const me = await resolveChatUser(req);
    if (!me) {
      return NextResponse.json(
        { error: "Session expired. Please sign in again." },
        { status: 401 },
      );
    }
    await ensureSchema();

    // DELETE bodies are optional; an empty body means "delete all of mine".
    const raw = await req.json().catch(() => ({}));
    const parsed = deleteSchema.safeParse(raw);

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    const { statusId } = parsed.data;
    if (!statusId) {
      await db.userStatus.deleteMany({ where: { userId: me.id } });
      return NextResponse.json({ ok: true, deleted: "all" });
    }

    const existing = await db.userStatus.findUnique({
      where: { id: statusId },
      select: { userId: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Status not found" }, { status: 404 });
    }

    if (existing.userId === me.id) {
      // My own item: delete it for everyone. Cascade clears views and reactions.
      await db.userStatus.delete({ where: { id: statusId } });
      return NextResponse.json({ ok: true, deleted: "one" });
    }

    // Someone else's item: hide it from my feed only.
    await hideStatusForUser(me.id, statusId);
    return NextResponse.json({ ok: true, deleted: "hidden" });
  } catch (error) {
    console.error("Chat status DELETE error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
