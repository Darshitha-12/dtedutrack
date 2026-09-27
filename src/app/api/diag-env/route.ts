import { NextRequest, NextResponse } from "next/server";
import { Pool } from "pg";

export const maxDuration = 60;

export async function GET(_req: NextRequest) {
  const out: Record<string, unknown> = {};
  const url = process.env.DATABASE_URL || "(undefined)";
  out.datasource_url_masked = url.replace(/:[^:@/]+@/, ":****@").slice(0, 140);
  let host = "";
  try {
    const u = new URL(url);
    host = u.hostname;
    out.host = host;
    out.port = u.port || "5432";
    out.params = [...u.searchParams.keys()];
    out.user_prefix = u.username.slice(0, 6);
  } catch (e) {
    out.url_parse_error = String(e);
  }
  try {
    const pool = new Pool({ connectionString: url, connectionTimeoutMillis: 15000, ssl: { rejectUnauthorized: false } });
    const t = Date.now();
    const r = await pool.query("select 1::int as ok");
    out.raw_pg = { ok: r.rows[0], ms: Date.now() - t, host };
  } catch (e) {
    out.raw_pg_error = (e as Error).message.slice(0, 300);
  }
  return NextResponse.json(out);
}