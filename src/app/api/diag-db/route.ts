import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const token = req.headers.get("x-diag-token");
  if (token !== "biopulse-diag-7f3a9") {
    return NextResponse.json({ ok: false }, { status: 404 });
  }

  const url = String(process.env.DATABASE_URL || "");
  const masked = url.replace(/:\/\/([^:]+):([^@]+)@/, "://$1:***@");

  try {
    const rows = await db.$queryRawUnsafe("select 1 as ok, current_database() as db, version() as v");
    return NextResponse.json({ ok: true, masked, rows });
  } catch (error) {
    const e = error as { name?: string; message?: string; code?: string; stack?: string };
    return NextResponse.json({
      ok: false,
      masked,
      name: e?.name,
      message: e?.message,
      code: e?.code,
      stack: (e?.stack || "").split("\n").slice(0, 8),
    });
  }
}
