import { NextResponse } from "next/server";
import tls from "tls";
import dns from "dns";
import net from "net";

const RAW_URL = process.env.DATABASE_URL || "";
const full = new URL(RAW_URL).hostname;
const port = Number(new URL(RAW_URL).port || 5432);

function trySocket(host: string, label: string): Promise<string> {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const s = net.connect({ host, port, family: host.includes(":") ? 6 : 0 });
    s.setTimeout(8000);
    const t = setTimeout(() => { s.destroy(); resolve(label + " TIMEOUT"); }, 8000);
    s.on("connect", () => { clearTimeout(t); s.destroy(); resolve(label + " CONNECT_OK " + (Date.now() - t0) + "ms"); });
    s.on("error", (e) => { clearTimeout(t); s.destroy(); resolve(label + " ERR " + e.message); });
    s.on("timeout", () => { clearTimeout(t); s.destroy(); resolve(label + " TIMEOUT"); });
  });
}

export async function GET() {
  const r: Record<string, string> = {};
  const addrs = await new Promise<string[]>((resolve) =>
    dns.lookup(full, { all: true }, (e, a) => resolve(e ? [String(e)] : a.map((x) => x.address)))
  );
  r.addrs = addrs.join(" | ");
  const v4 = addrs.filter((a) => a.includes("."));
  const v6 = addrs.filter((a) => a.includes(":"));
  for (const a of v6.slice(0, 2)) r["v6 " + a] = await trySocket(a, "v6");
  for (const a of v4.slice(0, 2)) r["v4 " + a] = await trySocket(a, "v4");
  return NextResponse.json(r);
}

export const maxDuration = 60;