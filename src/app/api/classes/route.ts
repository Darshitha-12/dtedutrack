import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { SUBJECT_LIST } from "@/types/subject";

async function ensureSchema() {
  try {
    await db.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "class_sessions" (
      "id" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      "subjectName" TEXT NOT NULL,
      "dayOfWeek" INTEGER NOT NULL,
      "startMinute" INTEGER NOT NULL,
      "endMinute" INTEGER NOT NULL,
      "color" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "class_sessions_pkey" PRIMARY KEY ("id")
    )`);
    await db.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "class_sessions_userId_dayOfWeek_idx" ON "class_sessions" ("userId", "dayOfWeek")`
    );
  } catch (error) {
    console.error("classes ensureSchema error:", error);
  }
}

const classSchema = z.object({
  subjectName: z.string().min(1).max(100),
  dayOfWeek: z.number().int().min(0).max(6),
  startMinute: z.number().int().min(0).max(1439),
  endMinute: z.number().int().min(1).max(1440),
});

function colorFor(subject: string): string {
  const s = (subject || "").toLowerCase();
  const match = SUBJECT_LIST.find(
    (sub) => s.includes(sub.name.toLowerCase()) || s === sub.id,
  );
  return match ? match.color : "#10B981";
}

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    await ensureSchema();
    const rows = await db.classSession.findMany({
      where: { userId: session.user.id },
      orderBy: [{ dayOfWeek: "asc" }, { startMinute: "asc" }],
    });
    return NextResponse.json({
      classes: rows.map((c) => ({
        id: c.id,
        subjectName: c.subjectName,
        dayOfWeek: c.dayOfWeek,
        startMinute: c.startMinute,
        endMinute: c.endMinute,
        color: c.color || colorFor(c.subjectName),
      })),
    });
  } catch (error) {
    console.error("Classes GET error:", error);
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
    const parsed = classSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }
    const { subjectName, dayOfWeek, startMinute, endMinute } = parsed.data;
    if (endMinute <= startMinute) {
      return NextResponse.json({ error: "End time must be after start time" }, { status: 400 });
    }

    const cls = await db.classSession.create({
      data: {
        userId: session.user.id,
        subjectName,
        dayOfWeek,
        startMinute,
        endMinute,
        color: colorFor(subjectName),
      },
    });

    return NextResponse.json(
      {
        cls: {
          id: cls.id,
          subjectName: cls.subjectName,
          dayOfWeek: cls.dayOfWeek,
          startMinute: cls.startMinute,
          endMinute: cls.endMinute,
          color: cls.color,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Classes POST error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const id = new URL(req.url).searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
    const deleted = await db.classSession.deleteMany({
      where: { id, userId: session.user.id },
    });
    if (deleted.count === 0) {
      return NextResponse.json({ error: "Class not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Classes DELETE error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}