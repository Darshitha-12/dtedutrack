import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getApps, initializeApp, cert, deleteApp } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";

export const maxDuration = 30;

function saInfo(): { configured: boolean; email?: string; project?: string } {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) return { configured: false };
  try {
    const o = JSON.parse(raw);
    return {
      configured: true,
      email: o.client_email,
      project: o.project_id,
    };
  } catch {
    return { configured: false };
  }
}

export async function GET(req: Request) {
  try {
    const key = new URL(req.url).searchParams.get("key");
    if (key !== "bp-diag-2026") {
      return NextResponse.json({ error: "bad key" }, { status: 403 });
    }
    const action = new URL(req.url).searchParams.get("action") || "status";

    if (action === "fdm") {
      const sa = saInfo();
      const devices = await db.notificationPreference.count({
        where: { fcmToken: { not: "" } },
      });
      const withChat = await db.notificationPreference.count({
        where: { fcmToken: { not: "" }, telegramChatId: { not: "" } },
      });
      const samples = await db.notificationPreference.findMany({
        where: { fcmToken: { not: "" } },
        select: { userId: true, fcmToken: true, telegramChatId: true },
        take: 10,
      });
      return NextResponse.json({
        serviceAccount: sa,
        deviceCount: devices,
        withChatCount: withChat,
        samples: samples.map((s) => ({
          userId: s.userId,
          telegramChatId: s.telegramChatId,
          tokenPrefix: s.fcmToken.slice(0, 20) + "…",
        })),
      });
    }

    if (action === "test-send") {
      const sa = saInfo();
      const devices = await db.notificationPreference.findMany({
        where: { fcmToken: { not: "" } },
        select: { fcmToken: true },
        take: 3,
      });
      if (devices.length === 0) {
        return NextResponse.json({ error: "No registered devices", serviceAccount: sa });
      }
      const results: { ok: boolean; error?: string }[] = [];
      for (const d of devices) {
        if (!sa.configured) {
          results.push({ ok: false, error: "FCM not configured on server" });
          break;
        }
        if (getApps().length > 0) {
          for (const app of getApps()) {
            deleteApp(app).catch(() => {});
          }
        }
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT!);
        const app = initializeApp(
          { credential: cert(serviceAccount) },
          "diag-" + Date.now()
        );
        try {
          await getMessaging(app).send({
            token: d.fcmToken,
            notification: { title: "BioPulse Test", body: "Test notification from diag route" },
            android: { priority: "high", notification: { channelId: "telegram_messages", priority: "high" } },
          });
          results.push({ ok: true });
        } catch (e) {
          results.push({ ok: false, error: e instanceof Error ? e.message : String(e) });
        }
        try { deleteApp(app).catch(() => {}); } catch {}
      }
      return NextResponse.json({ serviceAccount: sa, results });
    }

    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: "diag error", detail: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
