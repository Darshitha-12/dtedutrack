import { NextRequest, NextResponse } from "next/server";
import { signIn } from "@/lib/auth";
import { encode } from "@auth/core/jwt";

export const dynamic = "force-dynamic";

const FALLBACK = "biopulse-dev-fallback-secret-please-change-on-production-1234567890abcdef";

function resolvedSecret() {
  return process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || FALLBACK;
}

function describe(e: any): any {
  if (!e) return null;
  return {
    name: e.name,
    type: e.type,
    message: e.message,
    code: e.code,
    stack: typeof e.stack === "string" ? e.stack.split("\n").slice(0, 8) : null,
    cause: e.cause ? describe(e.cause) : null,
  };
}

export async function GET() {
  const out: any = {
    env: {
      authSecretLen: (process.env.AUTH_SECRET || "").length,
      nextAuthSecretLen: (process.env.NEXTAUTH_SECRET || "").length,
      authUrl: process.env.AUTH_URL || null,
      nextAuthUrl: process.env.NEXTAUTH_URL || null,
      nodeEnv: process.env.NODE_ENV,
      vercel: process.env.VERCEL || null,
    },
  };
  for (const [label, salt] of [
    ["session-token", "authjs.session-token"],
    ["secure-session-token", "__Secure-authjs.session-token"],
  ]) {
    try {
      const t = await encode({ token: { sub: "diag" }, secret: resolvedSecret(), salt });
      out[`encode_${label}`] = { ok: true, len: t.length };
    } catch (e: any) {
      out[`encode_${label}`] = { ok: false, name: e?.name, message: e?.message };
    }
  }
  return NextResponse.json(out);
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const email = typeof body.email === "string" ? body.email : "";
  const password = typeof body.password === "string" ? body.password : "";
  const out: any = { email };
  try {
    const { db } = await import("@/lib/db");
    const bcrypt = (await import("bcryptjs")).default;
    const user = await db.user.findFirst({
      where: { email: { equals: email.trim(), mode: "insensitive" } },
      select: { id: true, email: true, name: true, image: true, passwordHash: true },
    });
    out.db = user
      ? {
          found: true,
          id: user.id,
          name: user.name,
          nameType: typeof user.name,
          imageType: typeof user.image,
          imageIsNull: user.image === null,
          hasHash: !!user.passwordHash,
          hashPrefix: user.passwordHash ? user.passwordHash.slice(0, 7) : null,
          compare: user.passwordHash ? await bcrypt.compare(password, user.passwordHash) : null,
        }
      : { found: false };
  } catch (e: any) {
    out.db = { error: describe(e) };
  }
  try {
    const url = await signIn("credentials", { email, password, redirect: false });
    out.signIn = { ok: true, url };
  } catch (e: any) {
    out.signIn = { ok: false, error: describe(e) };
  }
  return NextResponse.json(out);
}
