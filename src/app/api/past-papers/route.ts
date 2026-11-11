import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

const PAPERS = [
  { year: 2024, paper: "A/L Biology Paper I (MCQ)", total: 50, timeMinutes: 60 },
  { year: 2023, paper: "A/L Biology Paper I (MCQ)", total: 50, timeMinutes: 60 },
  { year: 2022, paper: "A/L Biology Paper I (MCQ)", total: 50, timeMinutes: 60 },
  { year: 2021, paper: "A/L Biology Paper I (MCQ)", total: 50, timeMinutes: 60 },
  { year: 2020, paper: "A/L Biology Paper I (MCQ)", total: 50, timeMinutes: 60 },
  { year: 2024, paper: "A/L Biology Paper II (Structured & Essay)", total: 150, timeMinutes: 180 },
  { year: 2023, paper: "A/L Biology Paper II (Structured & Essay)", total: 150, timeMinutes: 180 },
];

const recordSchema = z.object({
  year: z.number().int().min(1990).max(2100),
  paperType: z.string().min(2).max(100),
  score: z.number().int().min(0).max(200),
  total: z.number().int().min(1).max(200),
  examDate: z.string().optional(),
});

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const records = await db.markRecord.findMany({
      where: { userId: session.user.id },
      orderBy: { examDate: "desc" },
    });
    return NextResponse.json({
      papers: PAPERS,
      records: records.map((r) => ({
        id: r.id,
        paperType: r.name,
        score: r.score,
        total: r.total,
        examDate: r.examDate.toISOString(),
      })),
    });
  } catch (error) {
    console.error("Past papers GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const parsed = recordSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 },
      );
    }

    const paper = PAPERS.find(
      (p) => p.year === parsed.data.year && p.paper === parsed.data.paperType,
    );

    const record = await db.markRecord.create({
      data: {
        userId: session.user.id,
        name: `${paper ? `${paper.paper} (${parsed.data.year})` : parsed.data.paperType}`,
        score: parsed.data.score,
        total: parsed.data.total,
        examDate: parsed.data.examDate ? new Date(parsed.data.examDate) : new Date(),
      },
    });

    return NextResponse.json(
      {
        record: {
          id: record.id,
          paperType: record.name,
          score: record.score,
          total: record.total,
          examDate: record.examDate.toISOString(),
        },
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Past papers POST error:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
