import { NextResponse } from "next/server";
import { resolveSyncIdentity } from "@/lib/sync-auth";
import { applyBlob, buildBlob } from "@/lib/account/blob-bridge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const MAX_BYTES = 8_000_000;

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

/**
 * Returns the account's data rebuilt into the offline blob format
 * (profile, notes, notepad, decks, marks, past papers, classes, planner, ...).
 */
export async function GET(req: Request) {
  try {
    const identity = await resolveSyncIdentity(req);
    if (!identity) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: CORS });
    }
    const blob = await buildBlob(identity.userId);
    return NextResponse.json({ blob }, { headers: CORS });
  } catch (error) {
    console.error("Blob GET error:", error);
    return NextResponse.json(
      { error: "Failed to build sync blob." },
      { status: 500, headers: CORS },
    );
  }
}

/**
 * Applies an offline blob (from the APK) into the account's Postgres records so
 * the web sees it, and stores the client-only collections for round-tripping.
 */
export async function POST(req: Request) {
  try {
    const identity = await resolveSyncIdentity(req);
    if (!identity) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: CORS });
    }

    const text = await req.text();
    if (text.length > MAX_BYTES) {
      return NextResponse.json(
        { error: "Sync payload too large." },
        { status: 413, headers: CORS },
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return NextResponse.json({ error: "Invalid JSON." }, { status: 400, headers: CORS });
    }

    const blob = (parsed as { blob?: unknown })?.blob ?? parsed;
    await applyBlob(identity.userId, blob);
    return NextResponse.json({ ok: true }, { headers: CORS });
  } catch (error) {
    console.error("Blob POST error:", error);
    return NextResponse.json(
      { error: "Failed to apply sync blob." },
      { status: 500, headers: CORS },
    );
  }
}
