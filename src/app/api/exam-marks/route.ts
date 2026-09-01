import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";

const SUBJECT_IDS = ["bio", "chem", "phy", "agri", "math", "ict", "dt"] as const;

const createSchema = z.object({
  subjectId: z.enum(SUBJECT_IDS),
  total: z.number().int().positive(),
  examDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
  name: z.string().max(200).optional().default(""),
});

const idSchema = z.object({ id: z.string().min(1) });

const updateSchema = z.object({
  id: z.string().min(1),
  subjectId: z.enum(SUBJECT_IDS).optional(),
  total: z.number().int().positive().optional(),
  examDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  name: z.string().max(200).optional(),
});

async function getOwned(rowId: string, userId: string) {
  const row = await db.markRecord.findUnique({ where: { id: rowId } });
  if (!row || row.userId !== userId) return null;
  return row;
}

function serialize(r: {
  id: string;
  subjectId: string | null;
  score: number | null;
  total: number;
  name: string;
  examDate: Date;
}) {
  return {
    id: r.id,
    subjectId: r.subjectId,
    score: r.score,
    total: r.total,
    examDate: r.examDate.toISOString().split("T")[0],
    name: r.name,
  };
}

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const records = await db.markRecord.findMany({
      where: { userId: session.user.id },
      orderBy: { examDate: "asc" },
    });
    return NextResponse.json({ marks: records.map(serialize) });
  } catch (error) {
    console.error("Exam marks GET error:", error);
    return NextResponse.json({ error: "Failed to load marks." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const body = await req.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 },
      );
    }
    const created = await db.markRecord.create({
      data: {
        userId: session.user.id,
        subjectId: parsed.data.subjectId,
        total: parsed.data.total,
        examDate: new Date(parsed.data.examDate + "T00:00:00.000Z"),
        name: parsed.data.name,
      },
    });
    return NextResponse.json({ mark: serialize(created) }, { status: 201 });
  } catch (error) {
    console.error("Exam marks POST error:", error);
    return NextResponse.json({ error: "Failed to save mark." }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const body = await req.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 },
      );
    }
    const owned = await getOwned(parsed.data.id, session.user.id);
    if (!owned) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const updated = await db.markRecord.update({
      where: { id: owned.id },
      data: {
        ...(parsed.data.subjectId ? { subjectId: parsed.data.subjectId } : {}),
        ...(parsed.data.total !== undefined ? { total: parsed.data.total } : {}),
        ...(parsed.data.examDate ? { examDate: new Date(parsed.data.examDate + "T00:00:00.000Z") } : {}),
        ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
      },
    });
    return NextResponse.json({ mark: serialize(updated) });
  } catch (error) {
    console.error("Exam marks PATCH error:", error);
    return NextResponse.json({ error: "Failed to update mark." }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const body = await req.json();
    const parsed = idSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "A mark id is required." }, { status: 400 });
    }
    const owned = await getOwned(parsed.data.id, session.user.id);
    if (!owned) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    await db.markRecord.delete({ where: { id: owned.id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Exam marks DELETE error:", error);
    return NextResponse.json({ error: "Failed to delete mark." }, { status: 500 });
  }
}
