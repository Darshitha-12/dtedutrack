import { NextRequest, NextResponse } from "next/server";
import { signIn, handlers } from "@/lib/auth";
import { encode } from "@auth/core/jwt";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const FALLBACK = "biopulse-dev-fallback-secret-please-change-on-production-1234567890abcdef";
const resolvedSecret = () => process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || FALLBACK;

const rejections: any[] = [];
if (typeof process !== "undefined") {
  process.on("unhandledRejection", (r: any) => rejections.push({ kind: "unhandledRejection", msg: String(r?.message || r), stack: String(r?.stack || "").split("\n").slice(0, 5) }));
  process.on("uncaughtException", (r: any) => rejections.push({ kind: "uncaughtException", msg: String(r?.message || r), stack: String(r?.stack || "").split("\n").slice(0, 5) }));
}

const now = () => Date.now();

export async function GET() {
  return NextResponse.json({ ok: true, secretLen: resolvedSecret().length });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const email = typeof body.email === "string" ? body.email : "";
  const password = typeof body.password === "string" ? body.password : "";
  const out: any = { steps: {} };
  const t0 = now();

  // 1. DB + bcrypt
  let user: any = null;
  try {
    const { db } = await import("@/lib/db");
    const s = now();
    user = await db.user.findFirst({
      where: { email: { equals: email.trim(), mode: "insensitive" } },
      select: { id: true, email: true, name: true, image: true, passwordHash: true },
    });
    out.steps.dbMs = now() - s;
    const s2 = now();
    const bcrypt = (await import("bcryptjs")).default;
    out.steps.compare = user?.passwordHash ? await bcrypt.compare(password, user.passwordHash) : false;
    out.steps.bcryptMs = now() - s2;
  } catch (e: any) {
    out.steps.dbError = String(e?.message || e);
  }

  // 2. encode with the real user's data
  if (user) {
    try {
      const s = now();
      const tok = await encode({
        token: { sub: user.id, email: user.email, name: user.name, picture: user.image },
        secret: resolvedSecret(),
        salt: "authjs.session-token",
      });
      out.steps.encodeMs = now() - s;
      out.steps.tokenLen = tok.length;
    } catch (e: any) {
      out.steps.encodeError = String(e?.message || e);
    }
  }

  // 3. signIn raced with a 6s timeout
  try {
    const s = now();
    out.steps.signIn = await Promise.race([
      signIn("credentials", { email, password, redirect: false })
        .then((r: any) => ({ resolved: typeof r === "string" ? r : String(r) }))
        .catch((e: any) => ({ threw: `${e?.name}: ${e?.message}`, cause: e?.cause ? `${e.cause?.name}: ${e.cause?.message}` : null })),
      new Promise((r) => setTimeout(() => r({ timeout: true }), 6000)),
    ]);
    out.steps.signInMs = now() - s;
  } catch (e: any) {
    out.steps.signInError = String(e?.message || e);
  }

  if (out.steps.signIn?.timeout) {
    out.steps.handlers = { skipped: "signIn hung" };
    out.totalMs = now() - t0;
    out.rejections = rejections;
    return NextResponse.json(out);
  }

  // 4. handlers.POST via a real CSRF round-trip, raced with 6s
  try {
    const csrfRes = await handlers.GET(new NextRequest("https://biopulse-study.netlify.app/api/auth/csrf"));
    const csrfJson: any = await csrfRes.json();
    const setCookie = csrfRes.headers.getSetCookie ? csrfRes.headers.getSetCookie() : [];
    const cookieHeader = setCookie.map((c) => c.split(";")[0]).join("; ");
    const form = new URLSearchParams({
      email,
      password,
      csrfToken: csrfJson.csrfToken,
      callbackUrl: "https://biopulse-study.netlify.app/dashboard",
    });
    const cbReq = new NextRequest("https://biopulse-study.netlify.app/api/auth/callback/credentials", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        cookie: cookieHeader,
        "X-Auth-Return-Redirect": "1",
      },
      body: form.toString(),
    });
    const s = now();
    out.steps.handlers = await Promise.race([
      handlers
        .POST(cbReq)
        .then(async (r: Response) => ({ status: r.status, setCookie: r.headers.getSetCookie ? r.headers.getSetCookie().length : -1, body: (await r.text()).slice(0, 200) }))
        .catch((e: any) => ({ threw: `${e?.name}: ${e?.message}` })),
      new Promise((r) => setTimeout(() => r({ timeout: true }), 6000)),
    ]);
    out.steps.handlersMs = now() - s;
  } catch (e: any) {
    out.steps.handlersError = String(e?.message || e);
  }

  out.totalMs = now() - t0;
  out.rejections = rejections;
  return NextResponse.json(out);
}
