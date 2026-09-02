import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";

const postSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date"),
  minutes: z.number().int().min(1).max(1440),
  note: z.string().max(200).optional(),
});

function startOfDay(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00.000Z`);
}

function formatDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = session.user.id;

    const works = await db.workLog.findMany({
      where: { userId },
      orderBy: { date: "desc" },
      take: 60,
    });

    const dayMap = new Map<string, { id: string; minutes: number; note: string | null }>();
    for (const w of works) {
      const key = formatDay(w.date);
      const cur = dayMap.get(key);
      if (cur) {
        cur.minutes += w.minutes;
      } else {
        dayMap.set(key, { id: w.id, minutes: w.minutes, note: w.note });
      }
    }
    const logs = [...dayMap.entries()].map(([date, v]) => ({
      id: v.id,
      date,
      minutes: v.minutes,
      note: v.note ?? undefined,
    }));

    const todayKey = formatDay(new Date());
    const todayMinutes = dayMap.get(todayKey) ?? 0;
    const totalMinutes = works.reduce((s, w) => s + w.minutes, 0);

    const communityAgg = await db.workLog.aggregate({ _sum: { minutes: true } });
    const communityMinutes = communityAgg._sum.minutes ?? 0;

    return NextResponse.json({ logs, todayMinutes, totalMinutes, communityMinutes });
  } catch (error) {
    console.error("Work log GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = session.user.id;

    const body = await req.json();
    const parsed = postSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
    }

    const date = startOfDay(parsed.data.date);
    await db.workLog.upsert({
      where: { userId_date: { userId, date } },
      update: { minutes: { increment: parsed.data.minutes } },
      create: {
        userId,
        date,
        minutes: parsed.data.minutes,
        note: parsed.data.note,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Work log POST error:", error);
    return NextResponse.json(
      { error: "Internal server error", detail: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = session.user.id;

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }

    const deleted = await db.workLog.deleteMany({
      where: { id, userId },
    });

    if (deleted.count === 0) {
      return NextResponse.json({ error: "Work log entry not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Work log DELETE error:", error);
    return NextResponse.json(
      { error: "Internal server error", detail: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}