import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const topics = await db.contentTopic.findMany({
      orderBy: { order: "asc" },
      select: {
        id: true,
        title: true,
        slug: true,
        unit: { select: { title: true, subject: { select: { name: true } } } },
        _count: { select: { questions: { where: { status: "PUBLISHED" } } } },
      },
    });

    const result = topics
      .filter((t) => t._count.questions > 0)
      .map((t) => ({
        id: t.id,
        title: t.title,
        slug: t.slug,
        unitTitle: t.unit.title,
        subjectName: t.unit.subject.name,
        questionCount: t._count.questions,
      }));

    return NextResponse.json({ topics: result });
  } catch (error) {
    console.error("Quiz topics GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
