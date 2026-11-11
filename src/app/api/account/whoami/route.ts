import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resolveSyncIdentity } from "@/lib/sync-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

/**
 * Diagnostic endpoint: reports which identity the sync API resolves for this
 * request (device token vs. cookie session) plus how many keys the account
 * snapshot holds. Used by the on-screen sync diagnostics panel to compare the
 * identity seen on the phone against the identity seen on the laptop.
 */
export async function GET(req: Request) {
  try {
    const identity = await resolveSyncIdentity(req);
    if (!identity) {
      return NextResponse.json(
        { ok: false, reason: "unauthorized" },
        { status: 401, headers: CORS },
      );
    }

    const [user, snapshot] = await Promise.all([
      db.user.findUnique({
        where: { id: identity.userId },
        select: { email: true },
      }),
      db.accountSnapshot.findUnique({ where: { userId: identity.userId } }),
    ]);

    const kv = (snapshot?.data as { kv?: Record<string, unknown> } | null)?.kv ?? {};

    return NextResponse.json(
      {
        ok: true,
        method: identity.method,
        userId: identity.userId,
        email: user?.email ?? "",
        tokenPrefix: identity.token ? identity.token.slice(0, 8) : "",
        snapshotKeys: Object.keys(kv).length,
        updatedAt:
          (snapshot?.data as { updatedAt?: number } | null)?.updatedAt ?? 0,
      },
      { headers: CORS },
    );
  } catch (error) {
    console.error("Whoami error:", error);
    return NextResponse.json(
      { ok: false, reason: "error" },
      { status: 500, headers: CORS },
    );
  }
}
