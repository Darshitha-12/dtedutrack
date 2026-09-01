import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { completeQuizSchema } from "@/features/questions/validations";
import { completeQuiz } from "@/features/questions/service";

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const parsed = completeQuizSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 },
      );
    }

    const quiz = await completeQuiz(session.user.id, parsed.data.quizId);
    return NextResponse.json({ quiz });
  } catch (error) {
    console.error("Quiz complete error:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
