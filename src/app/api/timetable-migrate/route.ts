import { NextResponse } from "next/server";
import { execSync } from "child_process";

export const maxDuration = 60;

export async function GET(req: Request) {
  const key = new URL(req.url).searchParams.get("key");
  if (key !== "ttp-migrate-2026") {
    return NextResponse.json({ error: "bad key" }, { status: 403 });
  }
  try {
    const out = execSync("npx prisma db push --accept-data-loss 2>&1", {
      timeout: 55000,
      env: process.env,
      stdio: "pipe",
    }).toString();
    return NextResponse.json({ ok: true, output: out.slice(0, 2000) });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}