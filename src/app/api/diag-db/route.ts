import { NextResponse } from "next/server";
import tls from "tls";
import net from "net";

const RAW_URL = process.env.DATABASE_URL || "";

function tryStartup(opts: { host: string; port: number; servername?: string; endpointParam?: boolean }): Promise<string> {
  return new Promise((resolve) => {
    try {
      const u = new URL(RAW_URL);
      const user = Buffer.from(decodeURIComponent(u.username));
      const db = Buffer.from("neondb");
      const body = Buffer.concat([
        Buffer.from([0, 3, 0, 0]),
        Buffer.from("user\0"), user, Buffer.from([0]),
        Buffer.from("database\0"), db, Buffer.from([0]),
        Buffer.from([0]),
      ]);
      const len = Buffer.alloc(4);
      len.writeInt32BE(body.length + 4, 0);

      const connectOpts: tls.ConnectionOptions = { host: opts.host, port: opts.port, rejectUnauthorized: false };
      if (opts.servername) connectOpts.servername = opts.servername;

      const sock = tls.connect(connectOpts);
      let buf: Buffer = Buffer.alloc(0);
      sock.setTimeout(15000);
      const timer = setTimeout(() => { sock.destroy(); resolve("TIMEOUT"); }, 20000);

      sock.on("secureConnect", () => { sock.write(Buffer.concat([len, body])); });
      sock.on("data", (d) => {
        buf = Buffer.concat([buf, d]);
        if (buf.length < 5) return;
        const type = buf[0];
        const mlen = buf.readInt32BE(1);
        if (buf.length < mlen + 1) return;
        const msg = buf.subarray(5, mlen + 1);
        if (type === 82) {
          const code = msg.readInt32BE(0);
          sock.destroy(); clearTimeout(timer);
          resolve("AUTH_REQ code=" + code);
        } else if (type === 69) {
          const txt = msg.toString("latin1").replace(/[^\x20-\x7e]/g, ".").slice(0, 100);
          sock.destroy(); clearTimeout(timer);
          resolve("PG_ERROR " + txt);
        } else {
          sock.destroy(); clearTimeout(timer);
          resolve("MSG type=" + type + " len=" + mlen + " hex=" + msg.toString("hex").slice(0, 40));
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
  const r: Record<string, string> = {};
  const full = new URL(RAW_URL).hostname;
  const ep1 = full.split(".")[0];           // ep-calm-cake-az4fzzm5-pooler
  const ep2 = ep1.replace("-pooler", "");    // ep-calm-cake-az4fzzm5
  const port = Number(new URL(RAW_URL).port || 5432);

  r.fullHost = full;
  r["SNI=fullHost"] = await tryStartup({ host: full, port });
  r["SNI=ep1"] = await tryStartup({ host: full, port, servername: ep1 });
  r["SNI=ep2"] = await tryStartup({ host: full, port, servername: ep2 });
  r["host=ep1"] = await tryStartup({ host: ep1, port });
  r["host=ep2"] = await tryStartup({ host: ep2, port });
  return NextResponse.json(r);
}

export const maxDuration = 60;