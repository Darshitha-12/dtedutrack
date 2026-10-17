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
 * Resolves the acting chat user from either the NextAuth cookie (web) or the
 * long-lived device token (Android APK). Returns null when neither identifies a
 * user that still exists.
 */
export async function resolveChatUser(req: Request): Promise<{ id: string } | null> {
  const userId = await resolveSyncUserId(req);
  if (!userId) return null;
  const user = await db.user.findUnique({ where: { id: userId }, select: { id: true } });
  return user ? { id: user.id } : null;
}
