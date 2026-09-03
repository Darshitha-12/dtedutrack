import { initializeApp, getApps, deleteApp, cert } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";

function getServiceAccount(): Record<string, string> | null {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Record<string, string>;
  } catch {
    return null;
  }
}

let adminApp: any = null;

function ensureApp(): any { if (adminApp) return adminApp; const sa = getServiceAccount(); if (!sa) return null; const existing = getApps().find((a: any) => a.name === "biopulse-fcm"); if (existing) { adminApp = existing; return adminApp; } adminApp = initializeApp({ credential: cert(sa) }, "biopulse-fcm"); return adminApp; }

export async function sendTelegramNotification(
  deviceToken: string,
  sender: string,
  text: string,
): Promise<{ ok: boolean; error?: string }> {
  const app = ensureApp(); if (!app) {
    return { ok: false, error: "FCM not configured" };
  }
  try {
    await getMessaging(app).send({
      token: deviceToken,
      notification: {
        title: `Telegram \u00b7 ${sender}`,
        body: text.length > 160 ? text.slice(0, 157) + "\u2026" : text,
      },
      data: {
        channelId: "telegram_messages",
      },
      android: {
        priority: "high",
        notification: {
          channelId: "telegram_messages",
          priority: "high",
        },
      },
    });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}