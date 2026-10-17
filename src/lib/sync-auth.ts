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

/**
 * Per-process cache of device token -> user id.
 *
 * Both the APK and the web poll constantly (chat, unread counts, account sync),
 * and each request used to cost two more database round-trips: a
 * `deviceToken.findUnique` plus an unconditional `lastSeen` update. The update
 * in particular is a *write*, so every poll produced WAL traffic — that is what
 * burned the database plan's transfer/history allowance. Warm serverless
 * instances now answer from memory and only refresh `lastSeen` every few
 * minutes. A revoked token therefore stays usable for at most
 * TOKEN_CACHE_TTL_MS, which is an acceptable trade for a chat client whose
 * tokens are long-lived.
 */
const TOKEN_CACHE_TTL_MS = 5 * 60_000;
const TOKEN_NEGATIVE_TTL_MS = 60_000;
const LAST_SEEN_THROTTLE_MS = 5 * 60_000;
const TOKEN_CACHE_MAX = 500;

type TokenCacheEntry = {
  userId: string | null;
  cachedAt: number;
  lastSeenAt: number;
};

const tokenCache = new Map<string, TokenCacheEntry>();

function rememberToken(token: string, userId: string | null, lastSeenAt: number): void {
  if (tokenCache.size >= TOKEN_CACHE_MAX && !tokenCache.has(token)) {
    const oldest = tokenCache.keys().next();
    if (!oldest.done) tokenCache.delete(oldest.value);
  }
  tokenCache.set(token, { userId, cachedAt: Date.now(), lastSeenAt });
}

export async function resolveSyncIdentity(req: Request): Promise<SyncIdentity | null> {
  const header = req.headers.get("authorization") || "";
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (match) {
    const token = match[1].trim();
    if (token) {
      const now = Date.now();
      const cached = tokenCache.get(token);
      const stillFresh =
        !!cached &&
        now - cached.cachedAt < (cached.userId ? TOKEN_CACHE_TTL_MS : TOKEN_NEGATIVE_TTL_MS);

      if (stillFresh && cached.userId) {
        // Hot path: a polling client with a known token does zero queries.
        if (now - cached.lastSeenAt > LAST_SEEN_THROTTLE_MS) {
          cached.lastSeenAt = now;
          db.deviceToken
            .update({ where: { token }, data: { lastSeen: new Date() } })
            .catch(() => {});
        }
        return { userId: cached.userId, method: "token", token };
      }

      if (!stillFresh) {
        const device = await db.deviceToken.findUnique({ where: { token } });
        rememberToken(token, device?.userId ?? null, now);
        if (device) {
          // Touch lastSeen without blocking the response on failure.
          db.deviceToken
            .update({ where: { token }, data: { lastSeen: new Date() } })
            .catch(() => {});
          return { userId: device.userId, method: "token", token };
        }
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
