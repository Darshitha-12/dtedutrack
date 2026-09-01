import { NextResponse } from "next/server";
import { getBiologyContext } from "@/features/content/service";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const subject = searchParams.get("subject") || "";
    const topic = searchParams.get("topic") || undefined;
    const subtopic = searchParams.get("subtopic") || undefined;

    if (!subject) {
      return NextResponse.json({ error: "Subject parameter required" }, { status: 400 });
    }

    const context = await getBiologyContext(subject, topic, subtopic);
    if (!context) {
      return NextResponse.json({ error: "Context not found" }, { status: 404 });
    }
    return NextResponse.json({ context });
  } catch (error) {
    console.error("Failed to fetch context:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
