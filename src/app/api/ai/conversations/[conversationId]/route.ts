import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { aiService } from "@/features/ai/service";

export async function GET(
  _req: Request,
  { params }: { params: { conversationId: string } },
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const messages = await aiService.getConversationMessages(
      session.user.id,
      params.conversationId,
    );
    return NextResponse.json({ messages });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    if (message === "Conversation not found") {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    console.error("Failed to fetch messages:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: { conversationId: string } },
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await aiService.deleteConversation(session.user.id, params.conversationId);
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    if (message === "Conversation not found") {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    console.error("Failed to delete conversation:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: { conversationId: string } },
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    if (!body.title || typeof body.title !== "string") {
      return NextResponse.json({ error: "Title required" }, { status: 400 });
    }

    await aiService.updateConversationTitle(
      session.user.id,
      params.conversationId,
      body.title,
    );
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    if (message === "Conversation not found") {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    console.error("Failed to update conversation:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
