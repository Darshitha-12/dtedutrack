import { NextResponse } from "next/server";

// TEMPORARY diagnostic: reports which environment variables the running
// function can actually see (presence and shape only — never the values).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const present = (k: string) => Boolean(process.env[k]);

export async function GET() {
  const url = process.env.NEXTAUTH_URL || "";
  return NextResponse.json(
    {
      ok: true,
      hasAuthSecret: present("AUTH_SECRET"),
      hasNextauthUrl: present("NEXTAUTH_URL"),
      nextauthUrlIsValid: /^https?:\/\/[^\s/]+$/.test(url),
      nextauthUrlHost: (() => {
        try {
          return new URL(url).host || null;
        } catch {
          return "INVALID";
        }
      })(),
      hasDatabaseUrl: present("DATABASE_URL"),
      databaseUrlScheme: (process.env.DATABASE_URL || "").split(":")[0] || null,
      hasOpenaiKey: present("OPENAI_API_KEY"),
      hasResendKey: present("RESEND_API_KEY"),
      hasGeminiKey: present("GEMINI_API_KEY"),
      trustHost: process.env.AUTH_TRUST_HOST || null,
      nodeVersion: process.env.NODE_VERSION || null,
      // Which env-var scope the runtime actually exposes.
      envKeysVisible: Object.keys(process.env).length,
    },
    { status: 200 }
  );
}
