import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resolveSyncUserId } from "@/lib/sync-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

type KvEntry = { v: string | null; t: number };
type SnapshotData = { updatedAt: number; kv: Record<string, KvEntry> };

const MAX_BYTES = 2_000_000;

function emptySnapshot(): SnapshotData {
  return { updatedAt: 0, kv: {} };
}

function sanitize(raw: unknown): SnapshotData {
  if (!raw || typeof raw !== "object") return emptySnapshot();
  const data = raw as Partial<SnapshotData>;
  const kv: Record<string, KvEntry> = {};
  if (data.kv && typeof data.kv === "object") {
    for (const [key, value] of Object.entries(data.kv)) {
      if (typeof key !== "string" || key.length > 300) continue;
      if (!value || typeof value !== "object") continue;
      const entry = value as Partial<KvEntry>;
      if (entry.v !== null && typeof entry.v !== "string") continue;
      kv[key] = { v: entry.v ?? null, t: typeof entry.t === "number" ? entry.t : 0 };
    }
  }
  return {
    updatedAt: typeof data.updatedAt === "number" ? data.updatedAt : 0,
    kv,
  };
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function GET(req: Request) {
  try {
    const userId = await resolveSyncUserId(req);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: CORS });
    }
    const row = await db.accountSnapshot.findUnique({ where: { userId } });
    const data = sanitize(row?.data);
    return NextResponse.json({ data }, { headers: CORS });
  } catch (error) {
    console.error("Snapshot GET error:", error);
    return NextResponse.json(
      { error: "Failed to load sync data." },
      { status: 500, headers: CORS },
    );
  }
}

export async function PUT(req: Request) {
  try {
    const userId = await resolveSyncUserId(req);
    if (!userId) {
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

    const incoming = sanitize((parsed as { data?: unknown })?.data ?? parsed);

    const existing = await db.accountSnapshot.findUnique({ where: { userId } });
    const current = sanitize(existing?.data);

    // Merge per key: the entry with the newer timestamp wins, so two devices
    // pushing different sections never clobber each other.
    const kv: Record<string, KvEntry> = { ...current.kv };
    for (const [key, entry] of Object.entries(incoming.kv)) {
      const prev = kv[key];
      if (!prev || entry.t >= prev.t) kv[key] = entry;
    }

    const data: SnapshotData = { updatedAt: Date.now(), kv };
    await db.accountSnapshot.upsert({
      where: { userId },
      create: { userId, data },
      update: { data },
    });

    return NextResponse.json({ data }, { headers: CORS });
  } catch (error) {
    console.error("Snapshot PUT error:", error);
    return NextResponse.json(
      { error: "Failed to save sync data." },
      { status: 500, headers: CORS },
    );
  }
}
