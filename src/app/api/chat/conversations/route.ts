import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const me = session.user.id;

    const messages = await db.directMessage.findMany({
      where: {
        OR: [{ senderId: me }, { receiverId: me }],
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        senderId: true,
        receiverId: true,
        text: true,
        mediaUrl: true,
        mediaType: true,
        mediaName: true,
        readAt: true,
        createdAt: true,
      },
    });

    const byPartner = new Map<
      string,
      { last: (typeof messages)[number]; unread: number; lastIsMine: boolean }
    >();

    for (const m of messages) {
      const partnerId = m.senderId === me ? m.receiverId : m.senderId;
      const entry = byPartner.get(partnerId);
      if (!entry) {
        byPartner.set(partnerId, {
          last: m,
          unread: m.senderId !== me && !m.readAt ? 1 : 0,
          lastIsMine: m.senderId === me,
        });
      } else {
        if (m.senderId !== me && !m.readAt) entry.unread += 1;
      }
    }

    const partnerIds = [...byPartner.keys()];
    const partners = partnerIds.length
      ? await db.user.findMany({
          where: { id: { in: partnerIds } },
          select: {
            id: true,
            name: true,
            displayName: true,
            image: true,
            avatarUrl: true,
            presence: { select: { status: true, lastSeen: true } },
          },
        })
      : [];

    const partnerMap = new Map(partners.map((p) => [p.id, p]));

    const list = [...byPartner.entries()]
      .map(([id, entry]) => {
        const p = partnerMap.get(id);
        const last = entry.last;
        const preview = last.mediaUrl
          ? last.mediaType === "image"
            ? "📷 Photo"
            : last.mediaType === "video"
            ? "🎬 Video"
            : last.mediaType === "audio"
            ? "🎤 Voice note"
            : "📎 " + (last.mediaName || "File")
          : last.text || "";
        return {
          id,
          name: p?.displayName || p?.name || "User",
          image: p?.image || p?.avatarUrl || null,
          status: p?.presence?.status || "offline",
          lastSeen: p?.presence?.lastSeen?.toISOString() || null,
          lastMessage: entry.lastIsMine ? `You: ${preview}` : preview,
          lastMessageIsMine: entry.lastIsMine,
          lastMessageAt: last.createdAt.toISOString(),
          unread: entry.unread,
        };
      })
      .sort((a, b) => (a.lastMessageAt < b.lastMessageAt ? 1 : -1));

    return NextResponse.json({ conversations: list });
  } catch (error) {
    console.error("Chat conversations GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}