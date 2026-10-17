import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase-admin";
import { channelRoomFor } from "@/lib/supabase";
import { CALL_SIGNAL_MEDIA_TYPE } from "@/lib/call-signal";
import { chatPreflight, resolveChatUser } from "@/lib/chat-api";

const readSchema = z.object({
  partnerId: z.string().min(1),
});

export async function OPTIONS() {
  return chatPreflight();
}

export async function POST(req: Request) {
  try {
    const meUser = await resolveChatUser(req);
    if (!meUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const parsed = readSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    const me = meUser.id;
    const { partnerId } = parsed.data;

    const result = await db.directMessage.updateMany({
      where: {
        senderId: partnerId,
        receiverId: me,
        readAt: null,
        // A bare `not` compiles to `mediaType <> '…'` and would skip every normal message
        // (mediaType NULL), so NULL is matched explicitly.
        OR: [{ mediaType: null }, { mediaType: { not: CALL_SIGNAL_MEDIA_TYPE } }],
      },
      data: { readAt: new Date() },
    });

    // Notify partner (realtime "seen")
    if (isSupabaseConfigured) {
      await supabaseAdmin.channel("dm-events").send({
        type: "broadcast",
        event: "read",
        payload: { room: channelRoomFor(me, partnerId), readerId: me, at: new Date().toISOString() },
      });
    }

    return NextResponse.json({ ok: true, marked: result.count });
  } catch (error) {
    console.error("Chat read POST error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
