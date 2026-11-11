import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { answerQuestionSchema } from "@/features/questions/validations";
import { answerQuestion } from "@/features/questions/service";

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const parsed = answerQuestionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 },
      );
    }

    const result = await answerQuestion(session.user.id, parsed.data);
    return NextResponse.json({ result });
  } catch (error) {
    console.error("Quiz answer error:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
