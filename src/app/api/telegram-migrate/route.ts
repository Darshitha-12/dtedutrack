import { NextResponse } from "next/server";
import { db } from "@/lib/db";

const ALLOWED_KEY = "bp-migrate-2026";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    if (searchParams.get("key") !== ALLOWED_KEY) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    await db.$executeRawUnsafe(
      `ALTER TABLE "notification_preferences" ADD COLUMN IF NOT EXISTS "fcmToken" TEXT NOT NULL DEFAULT ''`
    );
    return NextResponse.json({ ok: true, applied: "fcmToken" });
  } catch (error) {
    console.error("Migration error:", error);
    return NextResponse.json(
      { error: "Migration failed", detail: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
