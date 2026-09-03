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

let appInitialized = false;

function ensureApp(): boolean {
  if (appInitialized) return true;
  const sa = getServiceAccount();
  if (!sa) return false;
  if (getApps().length === 0) {
    initializeApp({ credential: cert(sa) }, "biopulse-fcm");
  }
  appInitialized = true;
  return true;
}

export async function sendTelegramNotification(
  deviceToken: string,
  sender: string,
  text: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!ensureApp()) {
    return { ok: false, error: "FCM not configured" };
  }
  try {
    await getMessaging().send({
      token: deviceToken,
      notification: {
        title: `Telegram · ${sender}`,
        body: text.length > 160 ? text.slice(0, 157) + "…" : text,
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
