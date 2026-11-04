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
    // Prisma wraps driver failures in P2010 and keeps the socket error on
    // `cause`; the code alone (ENOTFOUND, 28P01, 3D000 …) says whether it is
    // DNS, credentials or a missing database, and carries no secrets.
    const cause = error as { cause?: { code?: string; errno?: string } };
    const causeCode = cause?.cause?.code || cause?.cause?.errno || null;
    return NextResponse.json({ ok: false, code: String(code), causeCode }, { status: 503, headers });
  }
}
