import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sendTelegramNotification } from "@/lib/fcm";

export const maxDuration = 30;

export async function POST(req: Request) {
  try {
    const update = await req.json().catch(() => null);
    if (!update) {
      return NextResponse.json({ ok: true });
    }

    const message = update.message || update.edited_message;
    if (!message) {
      return NextResponse.json({ ok: true });
    }
    const text: string = message.text || message.caption || "";
    if (!text) {
      return NextResponse.json({ ok: true });
    }
    const sender =
      message.from?.first_name ||
      message.from?.username ||
      message.chat?.title ||
      "Telegram";

    const devices = await db.notificationPreference.findMany({
      where: { fcmToken: { not: "" } },
      select: { fcmToken: true, telegramChatId: true },
    });

    const chatId = message.chat?.id != null ? String(message.chat.id) : "";
    const chatDevices = chatId
      ? devices.filter((d) => d.telegramChatId === chatId)
      : devices;
    const targets = chatDevices.length > 0 ? chatDevices : devices;

    if (targets.length === 0) {
      return NextResponse.json({ ok: true });
    }

    const results: { ok: boolean; error?: string }[] = [];
    for (const d of targets) {
      if (d.fcmToken) {
        results.push(await sendTelegramNotification(d.fcmToken, sender, text));
      }
    }

    return NextResponse.json({ ok: true, sent: results.length });
  } catch (error) {
    console.error("Telegram webhook error:", error);
    return NextResponse.json(
      { error: "Internal server error", detail: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({ ok: true });
}
