import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

const sendSchema = z.object({
  room: z.string().min(1).max(80),
  text: z.string().min(1).max(4000),
});

export async function GET(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const room = searchParams.get("room")?.trim() || "general";
    const limit = Math.min(Math.max(Number(searchParams.get("limit")) || 50, 1), 200);

    const messages = await db.chatMessage.findMany({
      where: { room },
      orderBy: { createdAt: "asc" } as const,
      take: limit,
      include: { user: { select: { id: true, name: true, image: true } } },
    });

    return NextResponse.json({
      messages: messages.map((message: { id: string; userId: string; userName: string; userImage: string | null; room: string; text: string; createdAt: string }) => ({
        id: message.id,
        userId: message.userId,
        userName: message.userName,
        userImage: message.userImage,
        room: message.room,
        text: message.text,
        createdAt: message.createdAt,
      })),
    });
  } catch (error) {
    console.error("Telegram messages GET error:", error);
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

    const message = await db.chatMessage.create({
      data: { userId: session.user.id, room: parsed.data.room, text: parsed.data.text },
      include: { user: { select: { id: true, name: true, image: true } } },
    });

    return NextResponse.json(
      {
        message: {
          id: message.id,
          userId: message.userId,
          userName: message.user.name || "Student",
          userImage: message.user.image,
          room: message.room,
          text: message.text,
          createdAt: message.createdAt.toISOString(),
        },
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Telegram messages POST error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
