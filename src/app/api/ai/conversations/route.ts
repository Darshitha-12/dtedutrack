import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { aiService } from "@/features/ai/service";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const conversations = await aiService.getConversations(session.user.id);
    return NextResponse.json({ conversations });
  } catch (error) {
    console.error("Failed to fetch conversations:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
