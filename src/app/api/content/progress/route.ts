import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth-helpers";
import { getUserProgress, upsertTopicProgress } from "@/features/content/service";
import { updateProgressSchema } from "@/features/content/validations";

export async function GET() {
  try {
    const session = await requireSession();
    const userId = session?.user?.id;
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const progress = await getUserProgress(userId);
    return NextResponse.json({ progress });
  } catch (error) {
    console.error("Failed to fetch progress:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const session = await requireSession();
    const userId = session?.user?.id;
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const body = await req.json();
    const parsed = updateProgressSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
    }
    const progress = await upsertTopicProgress(userId, parsed.data);
    return NextResponse.json({ progress });
  } catch (error) {
    console.error("Failed to update progress:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
