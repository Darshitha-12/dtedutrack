import { NextResponse } from "next/server";
import { z } from "zod";
import { chatPreflight, resolveChatUser } from "@/lib/chat-api";
import { isPartnerTyping, setTyping } from "@/lib/dm-extras";

export async function OPTIONS() {
  return chatPreflight();
}

const typingSchema = z.object({
  partnerId: z.string().min(1),
  typing: z.boolean().optional().default(true),
});

/**
 * WhatsApp-style "typing…" flag.
 *
 * The sender writes it (throttled by the client) while the composer has text; the
 * partner's open thread polls it every few seconds. It is a tiny row with a TTL, so a
 * closed tab or a lost request naturally expires instead of leaving it stuck on.
 */
export async function GET(req: Request) {
  try {
    const me = await resolveChatUser(req);
    if (!me) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const partnerId = new URL(req.url).searchParams.get("partnerId")?.trim();
    if (!partnerId) {
      return NextResponse.json({ error: "partnerId required" }, { status: 400 });
    }
    if (partnerId === me.id) {
      return NextResponse.json({ typing: false });
    }

    const typing = await isPartnerTyping(me.id, partnerId);
    return NextResponse.json({ typing });
  } catch (error) {
    console.error("Chat typing GET error:", error);
    return NextResponse.json({ typing: false });
  }
}

export async function POST(req: Request) {
  try {
    const me = await resolveChatUser(req);
    if (!me) {
      return NextResponse.json(
        { error: "Session expired. Please sign in again." },
        { status: 401 },
      );
    }

    const body = await req.json().catch(() => ({}));
    const parsed = typingSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    const { partnerId, typing } = parsed.data;
    if (partnerId === me.id) {
      return NextResponse.json({ error: "Cannot message yourself" }, { status: 400 });
    }

    await setTyping(me.id, partnerId, typing);
    return NextResponse.json({ ok: true, typing });
  } catch (error) {
    console.error("Chat typing POST error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
