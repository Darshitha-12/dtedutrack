import { NextResponse } from "next/server";
import { requireDbUser } from "@/lib/require-db-user";
import { db } from "@/lib/db";
import { CALL_SIGNAL_MEDIA_TYPE, CALL_SIGNAL_TTL_MS } from "@/lib/call-signal";

// ============================================================
// Surfaces an unanswered incoming call so the callee's client can auto-open
// the call overlay without any realtime backend. The client polls this.
// ============================================================

export const dynamic = "force-dynamic";

export const runtime = "nodejs";

export async function GET() {
  try {
    const session = await requireDbUser();
    const me = session?.user?.id;
    if (!me) {
      return NextResponse.json(
        { error: "Session expired. Please sign in again." },
        { status: 401 },
      );
    }

    const since = new Date(Date.now() - CALL_SIGNAL_TTL_MS);

    // An offer addressed to me that I have not answered yet = someone is
    // ringing me. The newest such offer wins.
    const rows = await db.directMessage.findMany({
      where: {
        mediaType: CALL_SIGNAL_MEDIA_TYPE,
        receiverId: me,
        createdAt: { gte: since },
      },
      orderBy: { createdAt: "desc" },
      take: 30,
      select: { id: true, senderId: true, text: true, mediaName: true },
    });

    const ring = rows.find((row) => {
      const kind = (row.mediaName || "|").split("|")[1];
      return kind === "offer";
    });

    if (!ring) {
      return NextResponse.json({ caller: null });
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
      },
    });
  } catch {
    // Never block the chat page because ringing detection failed.
    return NextResponse.json({ caller: null });
  }
}