import { NextResponse } from "next/server";

import { db } from "@/lib/db";

// Deployment probe: reports only whether the runtime can reach Postgres and,
// if not, the driver error code. Never returns the connection string, host or
// credentials, so it is safe to leave reachable in production.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const headers = { "Cache-Control": "no-store, max-age=0" };
  try {
    const rows = await db.$queryRawUnsafe<Array<{ n: number }>>("select 1 as n");
    return NextResponse.json({ ok: true, probe: rows[0]?.n ?? null }, { headers });
  } catch (error) {
    const code =
      (error as { code?: string })?.code ||
      (error as { constructor?: { name?: string } })?.constructor?.name ||
      "unknown";
    return NextResponse.json({ ok: false, code: String(code) }, { status: 503, headers });
  }
}
