import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resolvePresence } from "@/lib/presence";
import { CALL_SIGNAL_MEDIA_TYPE } from "@/lib/call-signal";
import { chatPreflight, resolveChatUser } from "@/lib/chat-api";
import { loadHiddenMessageIds } from "@/lib/dm-extras";

export async function OPTIONS() {
  return chatPreflight();
}

export async function GET(req: Request) {
  try {
    const me0 = await resolveChatUser(req);
    if (!me0) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const me = me0.id;

    const messages = await db.directMessage.findMany({
      where: {
        AND: [
          { OR: [{ senderId: me }, { receiverId: me }] },
          // WebRTC signaling rides on this table; never treat it as chat activity. A bare
          // `not` also hides every normal message (mediaType NULL), so match NULL explicitly.
          { OR: [{ mediaType: null }, { mediaType: { not: CALL_SIGNAL_MEDIA_TYPE } }] },
        ],
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

    // Messages this user removed with "delete for me" must not count as unread or preview.
    const hidden = await loadHiddenMessageIds(me);

    const byPartner = new Map<
      string,
      { last: (typeof messages)[number] | null; newest: (typeof messages)[number]; unread: number }
    >();

    for (const m of messages) {
      const partnerId = m.senderId === me ? m.receiverId : m.senderId;
      let entry = byPartner.get(partnerId);
      if (!entry) {
        entry = { last: null, newest: m, unread: 0 };
        byPartner.set(partnerId, entry);
      }
      if (hidden.has(m.id)) continue;
      // Newest-first order, so the first visible message wins as the preview.
      if (!entry.last) entry.last = m;
      if (m.senderId !== me && !m.readAt) entry.unread += 1;
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
        const last = entry.last ?? entry.newest;
        const lastIsMine = last.senderId === me;
        const { status, lastSeen } = resolvePresence(p?.presence || null);
        const preview = !entry.last
          ? "Message deleted"
          : entry.last.mediaUrl
          ? entry.last.mediaType === "image"
            ? "📷 Photo"
            : entry.last.mediaType === "video"
            ? "🎬 Video"
            : entry.last.mediaType === "audio"
            ? "🎤 Voice note"
            : "📎 " + (entry.last.mediaName || "File")
          : entry.last.text || "";
        return {
          id,
          name: p?.displayName || p?.name || "User",
          image: p?.image || p?.avatarUrl || null,
          status,
          // Fall back to the partner's latest message when they've never
          // opened the chat (no presence row yet).
          lastSeen: lastSeen || (last.senderId !== me ? last.createdAt.toISOString() : null),
          lastMessage: lastIsMine ? `You: ${preview}` : preview,
          lastMessageIsMine: lastIsMine,
          lastMessageAt: entry.newest.createdAt.toISOString(),
          unread: entry.unread,
        };
      })
      .sort((a, b) => (a.lastMessageAt < b.lastMessageAt ? 1 : -1));

    // `me` lets the Android client (which has no NextAuth session) learn its real user id so it
    // can tell its own messages apart from the other side's.
    return NextResponse.json({ conversations: list, me });
  } catch (error) {
    console.error("Chat conversations GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}