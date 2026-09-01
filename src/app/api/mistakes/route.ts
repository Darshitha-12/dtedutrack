import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  getWrongQuestionSummaries,
  getWeakTopics,
} from "@/features/questions/service";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const [wrongQuestions, weakTopics] = await Promise.all([
      getWrongQuestionSummaries(session.user.id, 50),
      getWeakTopics(session.user.id, 10),
    ]);
    return NextResponse.json({ wrongQuestions, weakTopics });
  } catch (error) {
    console.error("Mistakes GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
