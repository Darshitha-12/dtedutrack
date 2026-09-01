import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getQuiz } from "@/features/questions/service";

export async function GET(
  _req: Request,
  { params }: { params: { quizId: string } },
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const quiz = await getQuiz(session.user.id, params.quizId);
    return NextResponse.json({ quiz });
  } catch (error) {
    console.error("Quiz GET by id error:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
