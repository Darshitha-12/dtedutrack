import { NextResponse } from "next/server";
import tls from "tls";

const RAW_URL = process.env.DATABASE_URL || "";

function fullAuth(servername?: string): Promise<string> {
  return new Promise((resolve) => {
    try {
      const u = new URL(RAW_URL);
      const host = u.hostname;
      const port = Number(u.port || 5432);
      const user = Buffer.from(decodeURIComponent(u.username));
      const pass = Buffer.from(decodeURIComponent(u.password));
      const db = Buffer.from((u.pathname || "").split("/").filter(Boolean)[0] || "neondb");

      const body = Buffer.concat([
        Buffer.from([0, 3, 0, 0]),
        Buffer.from("user\0"), user, Buffer.from([0]),
        Buffer.from("database\0"), db, Buffer.from([0]),
        Buffer.from([0]),
      ]);
      const len = Buffer.alloc(4);
      len.writeInt32BE(body.length + 4, 0);

      const opts: tls.ConnectionOptions = { host, port, rejectUnauthorized: false };
      if (servername) opts.servername = servername;

      const sock = tls.connect(opts);
      let buf = Buffer.alloc(0);
      let authed = false;
      sock.setTimeout(20000);
      const timer = setTimeout(() => { sock.destroy(); resolve("TIMEOUT"); }, 25000);

      sock.on("secureConnect", () => sock.write(Buffer.concat([len, body])));

      sock.on("data", (d) => {
        buf = Buffer.concat([buf, d]);
        while (buf.length >= 5) {
          const type = buf[0];
          const mlen = buf.readInt32BE(1);
          if (buf.length < mlen + 1) break;
          const msg = buf.subarray(5, mlen + 1);
          buf = buf.subarray(mlen + 1);

          if (type === 82) {
            const code = msg.readInt32BE(0);
            if (code === 3) {
              const plen = Buffer.alloc(4);
              plen.writeInt32BE(pass.length + 5, 0);
              sock.write(Buffer.concat([Buffer.from("p"), plen, pass, Buffer.from([0])]));
            } else if (code === 0) {
              authed = true;
              const q = Buffer.from("SELECT 1 as ok");
              const qlen = Buffer.alloc(4);
              qlen.writeInt32BE(q.length + 5, 0);
              sock.write(Buffer.concat([Buffer.from("Q"), qlen, q, Buffer.from([0])]));
            } else {
              sock.destroy(); clearTimeout(timer);
              resolve("AUTH_CODE_" + code + " (unsupported)");
              return;
            }
          } else if (type === 69) {
            sock.destroy(); clearTimeout(timer);
            resolve("PG_ERROR " + msg.toString("latin1").replace(/[^\x20-\x7e]/g, ".").slice(0, 120));
            return;
          } else if (type === 90) {
            sock.destroy(); clearTimeout(timer);
            resolve("READY (auth+select1 OK, authed=" + authed + ")");
            return;
          }
        }
      });
      sock.on("error", (e) => { clearTimeout(timer); sock.destroy(); resolve("TLS_ERR " + e.message); });
      sock.on("timeout", () => { clearTimeout(timer); sock.destroy(); resolve("SOCK_TIMEOUT"); });
    } catch (e) {
      resolve("SCRIPT " + String(e));
    }
  });
}

export async function GET() {
  const u = new URL(RAW_URL);
  const full = u.hostname;
  const ep = u.hostname.split(".")[0].replace("-pooler", "");
  const r: Record<string, string> = {};
  r.sniFull = await fullAuth(full);
  r.sniEp = await fullAuth(ep);
  r.sniNone = await fullAuth();
  return NextResponse.json(r);
}

export const maxDuration = 60;