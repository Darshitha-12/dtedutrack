import { NextResponse } from "next/server";

// Deployment probe: connects to Postgres with the same pg driver the app uses
// and reports whether the deployed runtime can reach it. It returns the target
// host/user and the driver error code so a misconfigured DATABASE_URL can be
// diagnosed without Netlify function logs. Credentials are never returned:
// anything shaped like "://user:pass@" is redacted first.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function redact(text: string) {
  return text.replace(/:\/\/[^@\s]*@/g, "://***@").replace(/\s+/g, " ").slice(0, 140);
}

export async function GET() {
  const headers = { "Cache-Control": "no-store, max-age=0" };
  const raw = String(process.env.DATABASE_URL || "").replace(/^\uFEFF/, "").trim();

  if (!raw) {
    return NextResponse.json({ ok: false, code: "NO_DATABASE_URL" }, { status: 503, headers });
  }

  let host = "";
  let user = "";
  let port = "";
  try {
    const parsed = new URL(raw);
    host = parsed.hostname;
    port = parsed.port;
    user = decodeURIComponent(parsed.username);
  } catch {
    return NextResponse.json(
      { ok: false, code: "MALFORMED_URL", valueLength: raw.length },
      { status: 503, headers },
    );
  }

  const { Pool } = require("pg") as typeof import("pg");
  const pool = new Pool({
    connectionString: raw,
    max: 1,
    connectionTimeoutMillis: 8_000,
    ssl: /sslmode|neon\.tech|pooler|supabase\.(co|com)/.test(raw)
      ? { rejectUnauthorized: false }
      : undefined,
  });

  try {
    const result = await pool.query("select 1 as n");
    return NextResponse.json(
      { ok: true, probe: result.rows[0]?.n ?? null, host, port, user },
      { headers },
    );
  } catch (error) {
    const err = error as { code?: string; message?: string };
    return NextResponse.json(
      {
        ok: false,
        code: String(err.code || "unknown"),
        host,
        port,
        user,
        detail: redact(String(err.message || "")),
      },
      { status: 503, headers },
    );
  } finally {
    await pool.end().catch(() => {});
  }
}
