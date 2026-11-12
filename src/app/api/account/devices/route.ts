import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { forgetToken, resolveSyncIdentity } from "@/lib/sync-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const PREFIX_LEN = 8;

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

/**
 * Lists every device linked to the signed-in account. Device tokens belong to the
 * Android APK, which carries no NextAuth cookie, so this route is also how the
 * phone sees which other devices share the account.
 *
 * Only a short prefix of each token is returned — never the token itself, since
 * it is a long-lived credential.
 */
export async function GET(req: Request) {
  try {
    const identity = await resolveSyncIdentity(req);
    if (!identity) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: CORS });
    }

    const rows = await db.deviceToken.findMany({
      where: { userId: identity.userId },
      orderBy: { lastSeen: "desc" },
      select: { token: true, label: true, createdAt: true, lastSeen: true },
    });

    return NextResponse.json(
      {
        currentMethod: identity.method,
        devices: rows.map(
          (row: { token: string; label: string; createdAt: Date; lastSeen: Date }) => ({
          tokenPrefix: row.token.slice(0, PREFIX_LEN),
          label: row.label || "Device",
          createdAt: row.createdAt,
          lastSeen: row.lastSeen,
          current: identity.token ? row.token === identity.token : false,
        })),
      },
      { headers: CORS },
    );
  } catch (error) {
    console.error("Devices GET error:", error);
    return NextResponse.json(
      { error: "Could not load linked devices." },
      { status: 500, headers: CORS },
    );
  }
}

/**
 * Revokes a linked device. The client sends the 8-character prefix it got from
 * GET, so the raw token never leaves the server. A prefix that matches more than
 * one token is rejected instead of guessing.
 */
export async function DELETE(req: Request) {
  try {
    const identity = await resolveSyncIdentity(req);
    if (!identity) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: CORS });
    }

    const body = (await req.json().catch(() => ({}))) as { tokenPrefix?: unknown };
    const prefix = typeof body.tokenPrefix === "string" ? body.tokenPrefix.trim() : "";
    if (prefix.length < 4) {
      return NextResponse.json({ error: "Invalid device." }, { status: 400, headers: CORS });
    }

    const rows = await db.deviceToken.findMany({
      where: { userId: identity.userId, token: { startsWith: prefix } },
      select: { token: true },
    });
    if (rows.length === 0) {
      return NextResponse.json({ error: "Device not found." }, { status: 404, headers: CORS });
    }
    if (rows.length > 1) {
      return NextResponse.json(
        { error: "That device identifier is ambiguous." },
        { status: 409, headers: CORS },
      );
    }

    const token = rows[0].token;
    await db.deviceToken.delete({ where: { token } });
    forgetToken(token);

    return NextResponse.json({ ok: true }, { headers: CORS });
  } catch (error) {
    console.error("Devices DELETE error:", error);
    return NextResponse.json(
      { error: "Could not unlink that device." },
      { status: 500, headers: CORS },
    );
  }
}
