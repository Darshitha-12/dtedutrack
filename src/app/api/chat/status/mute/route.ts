import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { chatPreflight, resolveChatUser } from "@/lib/chat-api";
import { ensureStatusExtras } from "@/lib/status-extras";

const muteSchema = z.object({
  mutedId: z.string().min(1),
  muted: z.boolean(),
});

export async function OPTIONS() {
  return chatPreflight();
}

/** Mute or unmute one contact's status updates (their ring disappears from Recent updates). */
export async function POST(req: Request) {
  try {
    const me = await resolveChatUser(req);
    if (!me) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    await ensureStatusExtras();

    const parsed = muteSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }
    const { mutedId, muted } = parsed.data;
    if (mutedId === me.id) {
      return NextResponse.json({ error: "Cannot mute yourself" }, { status: 400 });
    }

    if (muted) {
      await db.$executeRawUnsafe(
        `INSERT INTO "status_mutes" ("id", "userId", "mutedId")
         VALUES (gen_random_uuid()::text, $1, $2)
         ON CONFLICT ("userId", "mutedId") DO NOTHING`,
        me.id,
        mutedId,
      );
    } else {
      await db.$executeRawUnsafe(
        `DELETE FROM "status_mutes" WHERE "userId" = $1 AND "mutedId" = $2`,
        me.id,
        mutedId,
      );
    }

    return NextResponse.json({ ok: true, muted });
  } catch (error) {
    console.error("Chat status mute error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
