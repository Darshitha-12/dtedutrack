import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sendTelegramNotification } from "@/lib/fcm";

export const maxDuration = 30;

const MAX_LOG = 30;
const logStore: string[] = [];

function addLog(entry: string) {
  logStore.push(`[${new Date().toISOString()}] ${entry}`);
  if (logStore.length > MAX_LOG) logStore.shift();
}

export async function POST(req: Request) {
  const traceId = Math.random().toString(36).slice(2, 8);
  try {
    addLog(`[${traceId}] POST received`);
    const raw = await req.text();
    addLog(`[${traceId}] body len=${raw.length} start=${raw.slice(0, 80)}`);
    let update: any = null;
    try {
      update = JSON.parse(raw);
    } catch (e) {
      addLog(`[${traceId}] JSON parse failed: ${String(e)}`);
      return NextResponse.json({ ok: true });
    }
    if (!update) {
      addLog(`[${traceId}] empty update`);
      return NextResponse.json({ ok: true });
    }

    const message = update.message || update.edited_message;
    if (!message) {
      addLog(`[${traceId}] no message in update (update_type=${Object.keys(update).join(",")})`);
      return NextResponse.json({ ok: true });
    }
    const text: string = message.text || message.caption || "";
    addLog(`[${traceId}] text="${text.slice(0, 50)}"`);
    if (!text) {
      addLog(`[${traceId}] empty text, ignoring`);
      return NextResponse.json({ ok: true });
    }
    const sender =
      message.from?.first_name ||
      message.from?.username ||
      message.chat?.title ||
      "Telegram";
    const chatId = message.chat?.id != null ? String(message.chat.id) : "";
    addLog(`[${traceId}] sender=${sender} chatId=${chatId}`);

    const devices = await db.notificationPreference.findMany({
      where: { fcmToken: { not: "" } },
      select: { fcmToken: true, telegramChatId: true },
    });
    addLog(`[${traceId}] devices=${devices.length}`);

    const chatDevices = chatId
      ? devices.filter((d) => d.telegramChatId === chatId)
      : devices;
    const targets = chatDevices.length > 0 ? chatDevices : devices;
    addLog(`[${traceId}] chatMatched=${chatDevices.length} targets=${targets.length}`);

    if (targets.length === 0) {
      addLog(`[${traceId}] NO TARGETS - returning ok, nothing sent`);
      return NextResponse.json({ ok: true, message: "no targets" });
    }

    const results: { ok: boolean; error?: string }[] = [];
    for (const d of targets) {
      if (d.fcmToken) {
        const r = await sendTelegramNotification(d.fcmToken, sender, text);
        addLog(`[${traceId}] send result ok=${r.ok} err=${r.error ?? "none"}`);
        results.push(r);
      }
    }
    addLog(`[${traceId}] done sent=${results.length}`);
    return NextResponse.json({ ok: true, sent: results.length, traceId });
  } catch (error) {
    addLog(`[${traceId}] CATCH error=${error instanceof Error ? error.message : String(error)}`);
    return NextResponse.json(
      { error: "Internal server error", detail: error instanceof Error ? error.message : String(error), traceId },
      { status: 500 }
    );
  }
}

export async function GET(req: Request) {
  const key = new URL(req.url).searchParams.get("key");
  if (key !== "bp-log-2026") {
    return NextResponse.json({ error: "bad key" }, { status: 403 });
  }
  return NextResponse.json({ logs: [...logStore] });
}
