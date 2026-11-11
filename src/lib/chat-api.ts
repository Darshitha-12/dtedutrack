import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resolveSyncUserId } from "@/lib/sync-auth";

/**
 * Shared plumbing for the chat API.
 *
 * Two very different clients talk to /api/chat/*:
 *  - the laptop web app, authenticated by the normal NextAuth cookie, and
 *  - the Android APK, which ships the offline web bundle and loads it from
 *    Capacitor's local origin (https://localhost). Every request it makes is
 *    therefore cross-origin, and it authenticates with its long-lived device
 *    token (Authorization: Bearer …) instead of a cookie.
 *
 * A permissive origin is safe here: the browser never attaches credentials
 * automatically, and the bearer token is the only way to act as a user.
 */
export const CHAT_CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, Accept",
  "Access-Control-Max-Age": "86400",
};

/** Shared OPTIONS (CORS preflight) handler mounted by every chat route. */
export function chatPreflight(): NextResponse {
  return new NextResponse(null, { status: 204, headers: CHAT_CORS_HEADERS });
}

/**
 * Whether a resolved user id still exists, cached per process.
 *
 * `resolveChatUser` used to run `user.findUnique` on every single poll, on top
 * of the token lookup. The row rarely changes, so memoise it — the chat pages
 * poll far more often than users are deleted.
 */
const USER_CACHE_TTL_MS = 5 * 60_000;
const USER_CACHE_MAX = 500;
const userCache = new Map<string, { exists: boolean; at: number }>();

/**
 * Resolves the acting chat user from either the NextAuth cookie (web) or the
 * long-lived device token (Android APK). Returns null when neither identifies a
 * user that still exists.
 */
export async function resolveChatUser(req: Request): Promise<{ id: string } | null> {
  const userId = await resolveSyncUserId(req);
  if (!userId) return null;

  const now = Date.now();
  const cached = userCache.get(userId);
  if (cached && now - cached.at < USER_CACHE_TTL_MS) {
    return cached.exists ? { id: userId } : null;
  }

  const user = await db.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (userCache.size >= USER_CACHE_MAX && !userCache.has(userId)) {
    const oldest = userCache.keys().next();
    if (!oldest.done) userCache.delete(oldest.value);
  }
  userCache.set(userId, { exists: !!user, at: now });
  return user ? { id: user.id } : null;
}
