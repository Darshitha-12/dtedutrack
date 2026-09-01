import { NextResponse } from "next/server";
import { getSubjectBySlug, getUnitBySlug, getTopicBySlug, getSubtopics, getLearningObjectives } from "@/features/content/service";

export async function GET(
  _req: Request,
  { params }: { params: { subjectSlug: string; unitSlug: string; topicSlug: string } },
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
    const topic = await getTopicBySlug(unit.id, params.topicSlug);
    if (!topic) {
      return NextResponse.json({ error: "Topic not found" }, { status: 404 });
    }
    const subtopics = await getSubtopics(topic.id);
    const objectives = await getLearningObjectives({ topicId: topic.id });
    return NextResponse.json({ subject, unit, topic, subtopics, objectives });
  } catch (error) {
    console.error("Failed to fetch topic:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
