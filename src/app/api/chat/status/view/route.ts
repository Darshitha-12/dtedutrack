import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

async function ensureSchema() {
  try {
    await db.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "status_views" (
      "id" TEXT NOT NULL,
      "statusId" TEXT NOT NULL,
      "viewerId" TEXT NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "status_views_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "status_views_statusId_viewerId_key" UNIQUE ("statusId", "viewerId")
    )`);
  } catch (error) {
    console.error("status view ensureSchema error:", error);
  }
}

const viewSchema = z.object({
  statusId: z.string().min(1).max(200),
});

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    await ensureSchema();

    const body = await req.json();
    const parsed = viewSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }
    const { statusId } = parsed.data;

    const status = await db.userStatus.findUnique({ where: { id: statusId } });
    if (!status) {
      return NextResponse.json({ error: "Status not found" }, { status: 404 });
    }

    // Don't count the author's own view.
    if (status.userId !== session.user.id) {
      await db.statusView.upsert({
        where: { statusId_viewerId: { statusId, viewerId: session.user.id } },
        create: { statusId, viewerId: session.user.id },
        update: {},
      });
    }

    const viewCount = await db.statusView.count({ where: { statusId } });
    return NextResponse.json({ ok: true, viewCount });
  } catch (error) {
    console.error("Status view POST error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}