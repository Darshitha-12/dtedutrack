import { NextResponse } from "next/server";
import { db } from "@/lib/db";

const ALLOWED_KEY = process.env.CLEANUP_KEY || "bp-cleanup-2026";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    if (searchParams.get("key") !== ALLOWED_KEY) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const testUsers = await db.user.findMany({
      where: {
        OR: [
          { email: { startsWith: "wl-test-" } },
          { email: { startsWith: "t2-" } },
          { email: { startsWith: "t3-" } },
          { email: { startsWith: "t4-" } },
          { email: { startsWith: "del-" } },
          { AND: [{ name: { in: ["DT", "WL Test"] } }, { email: { endsWith: "@example.com" } }] },
        ],
      },
      select: { id: true, email: true, name: true },
    });

    for (const u of testUsers) {
      await db.user.delete({ where: { id: u.id } });
    }

    return NextResponse.json({ deleted: testUsers.map((u) => ({ email: u.email, name: u.name })) });
  } catch (error) {
    console.error("Cleanup error:", error);
    return NextResponse.json(
      { error: "Internal server error", detail: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
