import { NextResponse } from "next/server";
import { z } from "zod";
import { requireDbUser } from "@/lib/require-db-user";
import { db } from "@/lib/db";
import {
  CALL_SIGNAL_MEDIA_TYPE,
  CALL_SIGNAL_TTL_MS,
  CALL_SIGNAL_MAX_BYTES,
} from "@/lib/call-signal";

// ============================================================
// WebRTC signaling relay over the existing `direct_messages` table.
//
// POST  -> queue a signal addressed to a peer.
// GET   -> fetch + consume unconsumed signals for a call (polled by the client).
// DELETE-> prune consumed/stale rows for a call.
//
// No schema migration is required: signaling rows reuse DirectMessage with a
// reserved mediaType marker that the normal chat read path filters out.
// ============================================================

export const dynamic = "force-dynamic";

const postSchema = z.object({
  callId: z.string().min(1).max(120),
  toId: z.string().min(1).max(64),
  kind: z.enum(["hello", "offer", "answer", "ice", "accept", "decline", "bye"]),
  sdp: z.unknown().optional(),
  ice: z.unknown().optional(),
  caller: z
    .object({
      id: z.string(),
      name: z.string(),
      avatar: z.string().nullable(),
    })
    .optional(),
});

export async function POST(req: Request) {
  try {
    const session = await requireDbUser();
    const me = session?.user?.id;
    if (!me) {
      return NextResponse.json(
        { error: "Session expired. Please sign in again." },
        { status: 401 },
      );
    }

    const parsed = postSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid signal." }, { status: 400 });
    }

    const { callId, toId, kind, sdp, ice, caller } = parsed.data;
    if (toId === me) {
      return NextResponse.json({ error: "Cannot signal yourself." }, { status: 400 });
    }

    const serialized = JSON.stringify({ sdp: sdp ?? null, ice: ice ?? null });
    if (serialized.length > CALL_SIGNAL_MAX_BYTES) {
      return NextResponse.json({ error: "Signal too large." }, { status: 413 });
    }

    await db.directMessage.create({
      data: {
        senderId: me,
        receiverId: toId,
        text: JSON.stringify({ kind, sdp: sdp ?? null, ice: ice ?? null }),
        mediaType: CALL_SIGNAL_MEDIA_TYPE,
        mediaName: `${callId}|${kind}`,
      },
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Could not relay signal." }, { status: 500 });
  }
}

export async function GET(req: Request) {
  try {
    const session = await requireDbUser();
    const me = session?.user?.id;
    if (!me) {
      return NextResponse.json(
        { error: "Session expired. Please sign in again." },
        { status: 401 },
      );
    }

    const url = new URL(req.url);
    const callId = url.searchParams.get("callId");
    const partnerId = url.searchParams.get("partnerId");
    if (!callId || !partnerId) {
      return NextResponse.json(
        { error: "callId and partnerId are required." },
        { status: 400 },
      );
    }

    const since = new Date(Date.now() - CALL_SIGNAL_TTL_MS);

    // Only rows addressed TO us. Both peers poll this endpoint concurrently, so
    // consuming only inbound rows keeps each side's mailbox separate.
    const rows = await db.directMessage.findMany({
      where: {
        mediaType: CALL_SIGNAL_MEDIA_TYPE,
        receiverId: me,
        senderId: partnerId,
        createdAt: { gte: since },
      },
      orderBy: { createdAt: "asc" },
      take: 40,
    });

    // Delete on read so the mailbox cannot grow without bound.
    if (rows.length > 0) {
      await db.directMessage.deleteMany({
        where: { id: { in: rows.map((r) => r.id) } },
      });
    }

    const signals = rows.map((r) => {
      let body: Record<string, unknown> = {};
      try {
        body = JSON.parse(r.text) as Record<string, unknown>;
      } catch {
        body = {};
      }
      const [rowCallId, kind] = (r.mediaName || "|").split("|");
      return {
        id: r.id,
        from: r.senderId,
        callId: rowCallId,
        kind,
        sdp: body.sdp ?? null,
        ice: body.ice ?? null,
        at: r.createdAt.toISOString(),
      };
    });

    return NextResponse.json({ signals });
  } catch {
    return NextResponse.json({ error: "Could not fetch signals." }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const session = await requireDbUser();
    const me = session?.user?.id;
    if (!me) {
      return NextResponse.json(
        { error: "Session expired. Please sign in again." },
        { status: 401 },
      );
    }

    const url = new URL(req.url);
    const callId = url.searchParams.get("callId");
    if (callId) {
      // Only rows belonging to this exact call, both directions.
      await db.directMessage.deleteMany({
        where: {
          mediaType: CALL_SIGNAL_MEDIA_TYPE,
          mediaName: { startsWith: `${callId}|` },
          OR: [{ senderId: me }, { receiverId: me }],
        },
      });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Could not clear signals." }, { status: 500 });
  }
}