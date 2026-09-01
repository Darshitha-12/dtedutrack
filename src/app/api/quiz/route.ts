import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { startQuizSchema } from "@/features/questions/validations";
import { startQuiz, getUserQuizzes } from "@/features/questions/service";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const quizzes = await getUserQuizzes(session.user.id);
    return NextResponse.json({ quizzes });
  } catch (error) {
    console.error("Quiz GET error:", error);
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
    const parsed = startQuizSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 },
      );
    }

    const quiz = await startQuiz(session.user.id, parsed.data);
    return NextResponse.json({ quiz }, { status: 201 });
  } catch (error) {
    console.error("Quiz POST error:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
