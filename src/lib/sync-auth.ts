import { db } from "@/lib/db";
import { auth } from "@/lib/auth";

/**
 * Resolves the acting user for a sync request.
 *
 * Two identities are accepted so the same endpoint serves both clients:
 *  - the normal NextAuth cookie session (laptop web),
 *  - a `Authorization: Bearer <token>` long-lived device token (Android APK,
 *    which runs offline and cannot carry the auth cookie cross-origin).
 */
export type SyncIdentity = {
  userId: string;
  method: "token" | "session";
  token?: string;
};

export async function resolveSyncIdentity(req: Request): Promise<SyncIdentity | null> {
  const header = req.headers.get("authorization") || "";
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (match) {
    const token = match[1].trim();
    if (token) {
      const device = await db.deviceToken.findUnique({ where: { token } });
      if (device) {
        // Touch lastSeen without blocking the response on failure.
        db.deviceToken
          .update({ where: { token }, data: { lastSeen: new Date() } })
          .catch(() => {});
        return { userId: device.userId, method: "token", token };
      }
    }
  }

  const session = await auth();
  if (session?.user?.id) return { userId: session.user.id, method: "session" };
  return null;
}

export async function resolveSyncUserId(req: Request): Promise<string | null> {
  const identity = await resolveSyncIdentity(req);
  return identity?.userId ?? null;
}
