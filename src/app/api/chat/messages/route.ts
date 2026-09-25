import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { sendChatNotification } from "@/lib/fcm";

const sendSchema = z.object({
  partnerId: z.string().min(1),
  text: z.string().max(4000).optional().default(""),
  mediaUrl: z.string().max(6_000_000).optional(),
  mediaType: z.string().max(20).optional(),
  mediaName: z.string().max(255).optional(),
});

async function pushDirectMessage(receiverId: string, senderId: string, text: string) {
  try {
    const prefs = await db.notificationPreference.findUnique({ where: { userId: receiverId } });
    const token = prefs?.fcmToken;
    if (!token) return;
    const sender = await db.user.findUnique({
      where: { id: senderId },
      select: { name: true, displayName: true, email: true },
    });
    const name =
      sender?.displayName || sender?.name || (sender?.email ? sender.email.split("@")[0] : "BioPulse");
    await sendChatNotification(token, name, text || "Media");
  } catch (error) {
    console.error("pushDirectMessage error:", error);
  }
}

export async function GET(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const partnerId = searchParams.get("partnerId")?.trim();
    if (!partnerId) {
      return NextResponse.json({ error: "partnerId required" }, { status: 400 });
    }

    const limit = Math.min(Math.max(Number(searchParams.get("limit")) || 50, 1), 200);
    const me = session.user.id;

    const messages = await db.directMessage.findMany({
      where: {
        OR: [
          { senderId: me, receiverId: partnerId },
          { senderId: partnerId, receiverId: me },
        ],
      },
      orderBy: { createdAt: "asc" },
      take: limit,
    });

    return NextResponse.json({
      messages: messages.map((m) => ({
        id: m.id,
        senderId: m.senderId,
        text: m.text,
        mediaUrl: m.mediaUrl,
        mediaType: m.mediaType,
        mediaName: m.mediaName,
        readAt: m.readAt?.toISOString() || null,
        createdAt: m.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error("Direct messages GET error:", error);
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
    const parsed = sendSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    const { partnerId, text, mediaUrl, mediaType, mediaName } = parsed.data;
    const me = session.user.id;

    if (partnerId === me) {
      return NextResponse.json({ error: "Cannot message yourself" }, { status: 400 });
    }
    if (!text && !mediaUrl) {
      return NextResponse.json({ error: "Message is empty" }, { status: 400 });
    }

    const partner = await db.user.findUnique({
      where: { id: partnerId },
      select: { id: true },
    });
    if (!partner) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const message = await db.directMessage.create({
      data: {
        senderId: me,
        receiverId: partnerId,
        text: text || "",
        mediaUrl: mediaUrl || null,
        mediaType: mediaType || null,
        mediaName: mediaName || null,
      },
    });

    await pushDirectMessage(partnerId, me, text || (mediaUrl ? "Media" : ""));

    return NextResponse.json(
      {
        message: {
          id: message.id,
          senderId: message.senderId,
          text: message.text,
          mediaUrl: message.mediaUrl,
          mediaType: message.mediaType,
          mediaName: message.mediaName,
          readAt: message.readAt?.toISOString() || null,
          createdAt: message.createdAt.toISOString(),
        },
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Direct messages POST error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const partnerId = String(body?.partnerId || "").trim();
    if (!partnerId) {
      return NextResponse.json({ error: "partnerId required" }, { status: 400 });
    }
    const me = session.user.id;
    if (partnerId === me) {
      return NextResponse.json({ error: "Cannot clear your own thread" }, { status: 400 });
    }

    await db.directMessage.deleteMany({
      where: {
        OR: [
          { senderId: me, receiverId: partnerId },
          { senderId: partnerId, receiverId: me },
        ],
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Direct messages DELETE error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
