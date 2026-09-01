import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q")?.trim() || "";
    const category = searchParams.get("category")?.trim() || "";

    const groups = await db.telegramGroup.findMany({
      where: {
        ...(q
          ? {
              OR: [
                { name: { contains: q, mode: "insensitive" } },
                { username: { contains: q, mode: "insensitive" } },
                { description: { contains: q, mode: "insensitive" } },
              ],
            }
          : {}),
        ...(category && category !== "all" ? { category } : {}),
      },
      orderBy: [{ isOfficial: "desc" }, { memberCount: "desc" }],
    });

    return NextResponse.json({
      query: q,
      count: groups.length,
      groups: groups.map((g) => ({
        ...g,
        inviteLink: g.inviteLink || `https://t.me/${g.username}`,
      })),
    });
  } catch (error) {
    console.error("Telegram groups GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
