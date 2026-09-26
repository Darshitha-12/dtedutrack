import { NextResponse } from "next/server";
import net from "net";
import tls from "tls";

const RAW_URL = process.env.DATABASE_URL || "";

function pgStartup(cb: (ok: string, err?: string) => void) {
  try {
    const u = new URL(RAW_URL);
    const host = u.hostname;
    const port = Number(u.port || 5432);
    const user = Buffer.from(u.username);
    const db = Buffer.from(u.pathname?.split("/").filter(Boolean)[0] || "neondb");
    const body = Buffer.concat([
      Buffer.from([0, 3, 0, 0]),
      Buffer.from("user\0"), user, Buffer.from([0]),
      Buffer.from("database\0"), db, Buffer.from([0]),
      Buffer.from([0]),
    ]);
    const len = Buffer.alloc(4);
    len.writeInt32BE(body.length + 4, 0);

    // Do TLS right away (sslmode=require style)
    const sock = tls.connect({ host, port, rejectUnauthorized: false });
    const t = setTimeout(() => { sock.destroy(); cb("TIMEOUT", "no response in 25s"); }, 25000);
    sock.setTimeout(25000);
    sock.on("secureConnect", () => {
      sock.write(Buffer.concat([len, body]));
    });
    sock.on("data", (d) => {
      clearTimeout(t);
      sock.destroy();
      cb("BYTES " + d.toString("hex").slice(0, 80));
    });
    sock.on("timeout", () => { clearTimeout(t); sock.destroy(); cb("TIMEOUT"); });
    sock.on("error", (e) => { clearTimeout(t); sock.destroy(); cb("TLS_ERR", e.message); });
  } catch (e) {
    cb("SCRIPT_ERR", String(e));
  }
}

export async function GET() {
  const dbMod = await import("@/lib/db");
  const dbInstance = (dbMod as { db: unknown }).db as {
    $queryRawUnsafe(sql: string): Promise<unknown>;
    $on?(event: string, cb: (e: unknown) => void): void;
  };

  const results: Record<string, string> = {};
  results.protocol = await new Promise((resolve) => pgStartup((a, b) => resolve(b ? `${a}: ${b}` : a)));

  if (typeof dbInstance.$on === "function") {
    const events: string[] = [];
    dbInstance.$on("query" as never, (e: unknown) => {
      events.push(String((e as { query?: string })?.query || "").slice(0, 80));
    });
    dbInstance.$on("info" as never, (e: unknown) => {
      events.push("INFO:" + String((e as { message?: string })?.message || "").slice(0, 80));
    });
    results.eventsBefore = events.join(" | ");
  }

  try {
    const t0 = Date.now();
    const table = await dbInstance.$queryRawUnsafe("SELECT 1 as ok");
    results.query = "QUERY OK " + JSON.stringify(table) + " in " + (Date.now() - t0) + "ms";
  } catch (e) {
    const err = e as { constructor?: { name?: string }; message?: string; code?: string };
    results.queryErrName = err.constructor?.name || "?";
    results.queryErrCode = String(err.code || "none");
    results.query = String(err.message || "").replace(/\s+/g, " ");
  }

  return NextResponse.json(results);
}

export const maxDuration = 60;