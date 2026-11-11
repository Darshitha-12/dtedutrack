import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

const toggleSchema = z
  .object({
    action: z.enum(["join", "leave"]),
    channelId: z.string().min(1).optional(),
    telegramGroupId: z.string().min(1).optional(),
  })
  .refine((v) => !!v.channelId !== !!v.telegramGroupId, {
    message: "Provide exactly one of channelId or telegramGroupId",
  });

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = session.user.id;

    const channels = await db.groupChannel.findMany({
      orderBy: [{ isOfficial: "desc" }, { memberCount: "desc" }],
      include: {
        members: { where: { userId }, select: { id: true } },
      },
    });

    return NextResponse.json({
      channels: channels.map((c) => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
        description: c.description,
        category: c.category,
        isOfficial: c.isOfficial,
        memberCount: c.memberCount,
        isJoined: c.members.length > 0,
        createdAt: c.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error("App channels GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = session.user.id;

    const body = await req.json();
    const parsed = toggleSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    const isAppChannel = !!parsed.data.channelId;
    const targetId = (parsed.data.channelId || parsed.data.telegramGroupId) as string;

    if (isAppChannel) {
      const channel = await db.groupChannel.findUnique({
        where: { id: targetId },
        select: { id: true },
      });
      if (!channel) {
        return NextResponse.json({ error: "Channel not found" }, { status: 404 });
      }
    } else {
      const tg = await db.telegramGroup.findUnique({
        where: { id: targetId },
        select: { id: true },
      });
      if (!tg) {
        return NextResponse.json({ error: "Telegram group not found" }, { status: 404 });
      }
    }

    const whereMember = isAppChannel
      ? { userId, channelId: targetId, telegramGroupId: null }
      : { userId, channelId: null, telegramGroupId: targetId };

    if (parsed.data.action === "join") {
      const existing = await db.groupMember.findFirst({ where: whereMember, select: { id: true } });
      if (!existing) {
        await db.groupMember.create({
          data: isAppChannel
            ? { userId, channelId: targetId }
            : { userId, telegramGroupId: targetId },
        });
      }
    } else {
      await db.groupMember.deleteMany({ where: whereMember });
    }

    const memberCount = isAppChannel
      ? await db.groupMember.count({ where: { channelId: targetId } })
      : await db.groupMember.count({ where: { telegramGroupId: targetId } });
    if (isAppChannel) {
      await db.groupChannel.update({ where: { id: targetId }, data: { memberCount } });
    }

    return NextResponse.json(
      { ok: true, isJoined: parsed.data.action === "join", memberCount },
      { status: 200 },
    );
  } catch (error) {
    console.error("App channels POST error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
