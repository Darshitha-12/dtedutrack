import { NextResponse } from "next/server";
import { getSubjectBySlug, getUnits } from "@/features/content/service";

export async function GET(
  _req: Request,
  { params }: { params: { subjectSlug: string } },
) {
  try {
    const subject = await getSubjectBySlug(params.subjectSlug);
    if (!subject) {
      return NextResponse.json({ error: "Subject not found" }, { status: 404 });
    }
    const units = await getUnits(subject.id);
    return NextResponse.json({ subject, units });
  } catch (error) {
    console.error("Failed to fetch subject:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
