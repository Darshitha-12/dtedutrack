import { NextResponse } from "next/server";
import { getSubjectBySlug, getUnitBySlug, getTopics } from "@/features/content/service";

export async function GET(
  _req: Request,
  { params }: { params: { subjectSlug: string; unitSlug: string } },
) {
  try {
    const subject = await getSubjectBySlug(params.subjectSlug);
    if (!subject) {
      return NextResponse.json({ error: "Subject not found" }, { status: 404 });
    }
    const unit = await getUnitBySlug(subject.id, params.unitSlug);
    if (!unit) {
      return NextResponse.json({ error: "Unit not found" }, { status: 404 });
    }
    const topics = await getTopics(unit.id);
    return NextResponse.json({ subject, unit, topics });
  } catch (error) {
    console.error("Failed to fetch unit:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
