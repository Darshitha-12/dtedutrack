import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";

const createSchema = z.object({
  title: z.string().max(200).default(""),
  content: z.string().max(50000).default(""),
  color: z.string().max(50).default(""),
});

const updateSchema = z.object({
  id: z.string().min(1),
  title: z.string().max(200).optional(),
  content: z.string().max(50000).optional(),
  color: z.string().max(50).optional(),
  pinned: z.boolean().optional(),
});

const idSchema = z.object({ id: z.string().min(1) });

async function getOwned(entryId: string, userId: string) {
  const entry = await db.notepadEntry.findUnique({ where: { id: entryId } });
  if (!entry || entry.userId !== userId) return null;
  return entry;
}

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const entries = await db.notepadEntry.findMany({
      where: { userId: session.user.id },
      orderBy: [{ pinned: "desc" }, { updatedAt: "desc" }],
    });
    return NextResponse.json({
      entries: entries.map((e) => ({
        id: e.id,
        title: e.title,
        content: e.content,
        color: e.color,
        pinned: e.pinned,
        createdAt: e.createdAt,
        updatedAt: e.updatedAt,
      })),
    });
  } catch (error) {
    console.error("Notepad GET error:", error);
    return NextResponse.json({ error: "Failed to load notes." }, { status: 500 });
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
    const entry = await db.notepadEntry.create({
      data: {
        userId: session.user.id,
        title: parsed.data.title,
        content: parsed.data.content,
        color: parsed.data.color,
      },
    });
    return NextResponse.json(
      {
        entry: {
          id: entry.id,
          title: entry.title,
          content: entry.content,
          color: entry.color,
          pinned: entry.pinned,
          createdAt: entry.createdAt,
          updatedAt: entry.updatedAt,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Notepad POST error:", error);
    return NextResponse.json({ error: "Failed to create note." }, { status: 500 });
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
    const updated = await db.notepadEntry.update({
      where: { id: owned.id },
      data: {
        ...(parsed.data.title !== undefined ? { title: parsed.data.title } : {}),
        ...(parsed.data.content !== undefined ? { content: parsed.data.content } : {}),
        ...(parsed.data.color !== undefined ? { color: parsed.data.color } : {}),
        ...(parsed.data.pinned !== undefined ? { pinned: parsed.data.pinned } : {}),
      },
    });
    return NextResponse.json({
      entry: {
        id: updated.id,
        title: updated.title,
        content: updated.content,
        color: updated.color,
        pinned: updated.pinned,
        createdAt: updated.createdAt,
        updatedAt: updated.updatedAt,
      },
    });
  } catch (error) {
    console.error("Notepad PATCH error:", error);
    return NextResponse.json({ error: "Failed to update note." }, { status: 500 });
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
      return NextResponse.json({ error: "A note id is required." }, { status: 400 });
    }
    const owned = await getOwned(parsed.data.id, session.user.id);
    if (!owned) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    await db.notepadEntry.delete({ where: { id: owned.id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Notepad DELETE error:", error);
    return NextResponse.json({ error: "Failed to delete note." }, { status: 500 });
  }
}
