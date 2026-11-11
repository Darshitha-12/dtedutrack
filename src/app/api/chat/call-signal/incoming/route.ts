import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { CALL_SIGNAL_MEDIA_TYPE, CALL_SIGNAL_TTL_MS } from "@/lib/call-signal";
import { chatPreflight, resolveChatUser } from "@/lib/chat-api";

// ============================================================
// Surfaces an unanswered incoming call so the callee's client can auto-open
// the call overlay without any realtime backend. The client polls this.
// ============================================================

export const dynamic = "force-dynamic";

export const runtime = "nodejs";

export async function OPTIONS() {
  return chatPreflight();
}

export async function GET(req: Request) {
  try {
    const me = (await resolveChatUser(req))?.id;
    if (!me) {
      return NextResponse.json(
        { error: "Session expired. Please sign in again." },
        { status: 401 },
      );
    }

    const since = new Date(Date.now() - CALL_SIGNAL_TTL_MS);

    // An offer addressed to me that I have not answered yet = someone is
    // ringing me. The newest such offer wins — unless the caller has since
    // hung up (bye) or the call was declined, in which case we stay silent.
    const rows = await db.directMessage.findMany({
      where: {
        mediaType: CALL_SIGNAL_MEDIA_TYPE,
        receiverId: me,
        createdAt: { gte: since },
      },
      orderBy: { createdAt: "desc" },
      take: 40,
      select: {
        id: true,
        senderId: true,
        text: true,
        mediaName: true,
        createdAt: true,
      },
    });

    const parts = (row: { mediaName: string | null }) =>
      (row.mediaName || "|").split("|");

    const ring = rows.find((row) => parts(row)[1] === "offer");

    if (!ring) {
      return NextResponse.json({ caller: null });
    }

    const ringCallId = parts(ring)[0];

    // Any terminal signal for the same call that arrived after the offer means
    // the caller gave up: stop ringing.
    const ended = rows.some((row) => {
      const [cid, kind] = parts(row);
      return (
        cid === ringCallId &&
        (kind === "bye" || kind === "decline") &&
        row.createdAt.getTime() > ring.createdAt.getTime()
      );
    });
    if (ended) {
      return NextResponse.json({ caller: null });
    }

    let callKind: "voice" | "video" = "video";
    try {
      const body = JSON.parse(ring.text) as { callKind?: string };
      if (body.callKind === "voice") callKind = "voice";
    } catch {
      /* default to video */
    }

    const user = await db.user.findUnique({
      where: { id: ring.senderId },
      select: { id: true, name: true, displayName: true, email: true, image: true },
    });

    return NextResponse.json({
      caller: {
        id: user?.id ?? ring.senderId,
        name:
          user?.displayName ||
          user?.name ||
          user?.email?.split("@")[0] ||
          "Unknown",
        avatar: user?.image ?? null,
        callId: ringCallId,
        kind: callKind,
      },
    });
  } catch {
    // Never block the chat page because ringing detection failed.
    return NextResponse.json({ caller: null });
  }
}