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
  text: z.string().max(2000).optional().default(""),
  imageUrl: z.string().max(2000).optional(),
  imageType: z.string().max(20).optional(),
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
    const rows = await db.userStatus.findMany({
      where: { createdAt: { gte: since } },
      include: {
        user: { select: { id: true, name: true, displayName: true, avatarUrl: true, image: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 500,
    });

    const statuses = rows.map((s) => ({
      id: s.id,
      userId: s.user.id,
      name: s.user.displayName || s.user.name || "User",
      image: s.user.image || s.user.avatarUrl || null,
      text: s.text,
      imageUrl: s.imageUrl,
      imageType: s.imageType,
      createdAt: s.createdAt.toISOString(),
    }));

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
    const { text, imageUrl, imageType } = parsed.data;
    if (!text.trim() && !imageUrl) {
      return NextResponse.json({ error: "Status needs some text or a photo" }, { status: 400 });
    }

    const status = await db.userStatus.create({
      data: {
        userId: session.user.id,
        text: text.trim() || null,
        imageUrl: imageUrl || null,
        imageType: imageUrl ? imageType || "image" : null,
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