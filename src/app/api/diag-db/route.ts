import { NextResponse } from "next/server";
import tls from "tls";

const RAW_URL = process.env.DATABASE_URL || "";

function fullAuthProtocol(): Promise<string> {
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

      const sock = tls.connect({ host, port, rejectUnauthorized: false });
      let sentStartup = false;
      let authed = false;
      let chunks: Buffer[] = [];
      sock.setTimeout(20000);
      const t = setTimeout(() => { sock.destroy(); resolve("TIMEOUT (buffered: " + Buffer.concat(chunks).toString("latin1").replace(/[^\x20-\x7e]/g, ".").slice(0, 120) + ")"); }, 25000);

      sock.on("secureConnect", () => {
        sock.write(Buffer.concat([len, body]));
        sentStartup = true;
      });

      sock.on("data", (d) => {
        chunks.push(d);
        let buf = Buffer.concat(chunks);
        chunks = [];
        while (buf.length >= 5) {
          const type = buf[0];
          const msgLen = buf.readInt32BE(1);
          if (buf.length < msgLen + 1) {
            chunks.push(buf);
            break;
          }
          const msg = buf.subarray(5, msgLen + 1);
          buf = buf.subarray(msgLen + 1);

          if (type === 82) {
            // Authentication request. Code at msg[0..3]
            const code = msg.readInt32BE(0);
            if (code === 3) {
              // cleartext password
              const plen = Buffer.alloc(4);
              plen.writeInt32BE(pass.length + 5, 0);
              const pmsg = Buffer.concat([Buffer.from("p"), plen, pass, Buffer.from([0])]);
              sock.write(pmsg);
            } else if (code === 0) {
              authed = true;
              // authentication ok -> send query
              const q = Buffer.from("SELECT 1 as ok, current_database() as db");
              const qlen = Buffer.alloc(4);
              qlen.writeInt32BE(q.length + 5, 0);
              sock.write(Buffer.concat([Buffer.from("Q"), qlen, q, Buffer.from([0])]));
            } else {
              sock.destroy();
              clearTimeout(t);
              resolve("AUTH_CODE_" + code + " (unsupported, e.g. MD5/SCRAM)");
            }
          } else if (type === 69) {
            // ErrorResponse
            const txt = msg.toString("latin1").replace(/[^\x20-\x7e]/g, ".").slice(0, 150);
            sock.destroy();
            clearTimeout(t);
            resolve("PG_ERROR: " + txt);
          } else if (type === 84) {
            // RowDescription
            continue;
          } else if (type === 68) {
            // DataRow
            continue;
          } else if (type === 67) {
            // CommandComplete
            continue;
          } else if (type === 73) {
            // EmptyQueryResponse
            continue;
          } else if (type === 90) {
            // ReadyForQuery
            sock.destroy();
            clearTimeout(t);
            resolve("FULL_AUTH_QUERY_SUCCESS");
          } else {
            // unknown, keep going
            continue;
          }
          if (buf.length === 0) break;
        }
      });
      sock.on("timeout", () => { clearTimeout(t); sock.destroy(); resolve("SOCK_TIMEOUT"); });
      sock.on("error", (e) => { clearTimeout(t); sock.destroy(); resolve("TLS_ERR " + e.message); });
    } catch (e) {
      resolve("SCRIPT_ERR " + String(e));
    }
  });
}

export async function GET() {
  const results: Record<string, string> = {};
  results.userLen = String(decodeURIComponent(new URL(RAW_URL).username).length);
  results.passLen = String(decodeURIComponent(new URL(RAW_URL).password).length);
  results.socketHost = new URL(RAW_URL).hostname;
  results.auth = await fullAuthProtocol();
  return NextResponse.json(results);
}

export const maxDuration = 60;