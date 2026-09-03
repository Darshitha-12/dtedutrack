import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";

const schema = z.object({
  fcmToken: z.string().min(10).max(500),
  telegramChatId: z.string().optional(),
});

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = session.user.id;

    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }

    await db.notificationPreference.upsert({
      where: { userId },
      update: { fcmToken: parsed.data.fcmToken },
      create: {
        userId,
        fcmToken: parsed.data.fcmToken,
        telegramEnabled: true,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Device registration error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
