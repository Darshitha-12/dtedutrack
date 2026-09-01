import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase-admin";
import { channelRoomFor } from "@/lib/supabase";

const readSchema = z.object({
  partnerId: z.string().min(1),
});

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const parsed = readSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    const me = session.user.id;
    const { partnerId } = parsed.data;

    const result = await db.directMessage.updateMany({
      where: { senderId: partnerId, receiverId: me, readAt: null },
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
