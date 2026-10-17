import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { chatPreflight, resolveChatUser } from "@/lib/chat-api";
import { loadMessageReactions, setMessageReaction } from "@/lib/dm-extras";

export async function OPTIONS() {
  return chatPreflight();
}

const reactionSchema = z.object({
  messageId: z.string().min(1).max(100),
  /** The emoji to apply. An empty string clears this user's reaction (toggle off). */
  emoji: z.string().max(16).optional().default(""),
});

export async function POST(req: Request) {
  try {
    const meUser = await resolveChatUser(req);
    if (!meUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const parsed = reactionSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    const { messageId } = parsed.data;
    const emoji = parsed.data.emoji.trim();
    const me = meUser.id;

    // A reaction is only allowed on a message this user is part of.
    const message = await db.directMessage.findUnique({
      where: { id: messageId },
      select: { senderId: true, receiverId: true },
    });
    if (!message || (message.senderId !== me && message.receiverId !== me)) {
      return NextResponse.json({ error: "Message not found" }, { status: 404 });
    }

    await setMessageReaction(messageId, me, emoji, randomUUID());
    const reactions = await loadMessageReactions(messageId, me);

    return NextResponse.json({ ok: true, messageId, reactions });
  } catch (error) {
    console.error("Chat reaction error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
