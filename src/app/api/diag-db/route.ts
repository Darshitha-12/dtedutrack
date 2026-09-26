import { NextResponse } from "next/server";
import net from "net";

const RAW_URL = process.env.DATABASE_URL || "";

function extractHost(url: string): { host: string; port: number } {
  try {
    const u = new URL(url);
    return { host: u.hostname, port: Number(u.port || 5432) };
  } catch {
    return { host: "url-parse-fail", port: 5432 };
  }
}

const { host: HOST, port: PORT } = extractHost(RAW_URL);
const SHAPE = (() => {
  try {
    const u = new URL(RAW_URL);
    return { scheme: u.protocol, hostname: u.hostname, port: u.port, hasUser: !!u.username, hasPass: !!u.password, db: u.pathname?.split("/").filter(Boolean)[0], params: Array.from(new URLSearchParams(u.search).keys()) };
  } catch {
    return { raw: RAW_URL.slice(0, 40).replace(/[^ -~]/g, ".") };
  }
})();

function tcpProbe(): Promise<string> {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const s = net.connect({ host: HOST, port: PORT });
    const t = setTimeout(() => {
      s.destroy();
      resolve("TIMEOUT after " + (Date.now() - t0) + "ms");
    }, 25000);
    s.setTimeout(25000);
    s.on("connect", () => {
      clearTimeout(t);
      s.destroy();
      resolve("CONNECT OK in " + (Date.now() - t0) + "ms to " + HOST + ":" + PORT);
    });
    s.on("timeout", () => {
      clearTimeout(t);
      s.destroy();
      resolve("TIMEOUT after " + (Date.now() - t0) + "ms");
    });
    s.on("error", (e) => {
      clearTimeout(t);
      s.destroy();
      resolve("ERROR " + e.message + " after " + (Date.now() - t0) + "ms");
    });
  });
}

function dnsProbe(): Promise<string> {
  return new Promise((resolve) => {
    try {
      const dns = require("dns") as typeof import("dns");
      dns.lookup(HOST, { all: true }, (err, addrs) => {
        if (err) resolve("DNS ERROR " + err.message);
        else resolve("DNS OK " + JSON.stringify(addrs.map((a) => a.address)));
      });
    } catch (e) {
      resolve("DNS SCRIPT ERR " + String(e));
    }
  });
}

export async function GET() {
  const { db: _db, PrismaNext } = await importDb();
  const dbInstance = _db as { $queryRawUnsafe(sql: string): Promise<unknown> };
  const results: Record<string, string> = {};
  results.urlLen = String(RAW_URL.length);
  results.host = HOST + ":" + PORT;
  results.urlShape = JSON.stringify(SHAPE);
  results.dns = await dnsProbe();
  results.tcp = await tcpProbe();
  try {
    const t0 = Date.now();
    const table = await dbInstance.$queryRawUnsafe("SELECT 1 as ok");
    results.query = "QUERY OK result=" + JSON.stringify(table) + " in " + (Date.now() - t0) + "ms";
  } catch (e) {
    results.query = "QUERY ERR [" + (e as { constructor?: { name?: string } })?.constructor?.name + "] " + String((e as { message?: string })?.message).split("\n").slice(0, 4).join(" | ");
  }
  results.prismaVer = PrismaNext;
  return NextResponse.json(results);
}

async function importDb() {
  const dbMod = await import("@/lib/db");
  const prismaMod = await import("@prisma/client");
  return { db: (dbMod as { db: unknown }).db, PrismaNext: (prismaMod as { Prisma: { prismaVersion?: { version?: string } } }).Prisma?.prismaVersion?.version || "?" };
}

// 15-minute limit to allow long probes
export const maxDuration = 60;