import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase-admin";
import { channelRoomFor } from "@/lib/supabase";

const presenceSchema = z.object({
  status: z.enum(["online", "offline"]).default("online"),
});

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const parsed = presenceSchema.safeParse(body);
    const status = parsed.success ? parsed.data.status : "online";
    const me = session.user.id;

    const now = new Date();
    await db.presence.upsert({
      where: { userId: me },
      create: { userId: me, status, lastSeen: now },
      update: { status, lastSeen: now },
    });

    // Broadcast presence change so contacts update live
    if (isSupabaseConfigured) {
      await supabaseAdmin.channel("presence-events").send({
        type: "broadcast",
        event: "presence",
        payload: {
          userId: me,
          status,
          lastSeen: now.toISOString(),
          at: now.toISOString(),
        },
      });
    }

    return NextResponse.json({ ok: true, status, lastSeen: now.toISOString() });
  } catch (error) {
    console.error("Presence POST error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
