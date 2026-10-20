import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { chatPreflight, resolveChatUser } from "@/lib/chat-api";
import { ensureStatusExtras, recordStatusForward, hasForwardedStatus } from "@/lib/status-extras";

const forwardSchema = z.object({
  statusId: z.string().min(1).max(200),
  toId: z.string().min(1),
});

export async function OPTIONS() {
  return chatPreflight();
}

/**
 * Forward a status into a chat.
 *
 * The item is re-sent as a normal direct message marked "Forwarded" — WhatsApp shows the
 * same media bubble, and re-using the chat path means the receiver's unread badge,
 * notifications and read receipts all keep working with no special casing.
 */
export async function POST(req: Request) {
  try {
    const me = await resolveChatUser(req);
    if (!me) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    await ensureStatusExtras();

    const parsed = forwardSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }
    const { statusId, toId } = parsed.data;
    if (toId === me.id) {
      return NextResponse.json({ error: "Cannot forward to yourself" }, { status: 400 });
    }

    const status = await db.userStatus.findUnique({
      where: { id: statusId },
      select: { id: true, text: true, caption: true, imageUrl: true, imageType: true },
    });
    if (!status) {
      return NextResponse.json({ error: "Status not found" }, { status: 404 });
    }

    const recipient = await db.user.findUnique({ where: { id: toId }, select: { id: true } });
    if (!recipient) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Forwarding the same item twice into the same thread is almost always a double-tap.
    if (await hasForwardedStatus(statusId, me.id, toId)) {
      return NextResponse.json({ error: "Already forwarded to this chat" }, { status: 409 });
    }

    const body =
      status.caption?.trim() || status.text?.trim() || (status.imageUrl ? "Status" : "");
    const message = await db.directMessage.create({
      data: {
        senderId: me.id,
        receiverId: toId,
        text: body,
        mediaUrl: status.imageUrl,
        mediaType: status.imageUrl ? status.imageType || "image" : null,
        mediaName: status.imageUrl ? "status" : null,
        forwarded: true,
      },
      select: { id: true },
    });

    await recordStatusForward(statusId, me.id, toId);
    return NextResponse.json({ ok: true, messageId: message.id });
  } catch (error) {
    console.error("Chat status forward error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
