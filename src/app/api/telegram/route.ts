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
    const q = searchParams.get("search")?.trim().toLowerCase() || "";
    const category = searchParams.get("category")?.trim() || "";

    const userId = session.user.id;
    const groups = await db.telegramGroup.findMany({
      where: {
        ...(q
          ? {
              OR: [
                { name: { contains: q, mode: "insensitive" } },
                { username: { contains: q, mode: "insensitive" } },
              ],
            }
          : {}),
        ...(category ? { category } : {}),
      },
      orderBy: [{ isOfficial: "desc" }, { memberCount: "desc" }],
      include: {
        members: { where: { userId }, select: { id: true } },
      },
    });

    return NextResponse.json({
      groups: groups.map((g) => ({
        id: g.id,
        name: g.name,
        username: g.username,
        inviteLink: g.inviteLink || `https://t.me/${g.username}`,
        category: g.category,
        description: g.description,
        memberCount: g.memberCount,
        isOfficial: g.isOfficial,
        isJoined: g.members.length > 0,
      })),
    });
  } catch (error) {
    console.error("Telegram groups GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
