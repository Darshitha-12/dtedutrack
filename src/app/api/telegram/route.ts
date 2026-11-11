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

    const userId: string = session.user.id;
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
      groups: groups.map((group: { id: string; name: string; username: string | null; inviteLink: string | null; category: string; description: string | null; memberCount: number; isOfficial: boolean; members: { id: string }[] }) => ({
        id: group.id,
        name: group.name,
        username: group.username,
        inviteLink: group.inviteLink || `https://t.me/${group.username}`,
        category: group.category,
        description: group.description,
        memberCount: group.memberCount,
        isOfficial: group.isOfficial,
        isJoined: group.members.length > 0,
      })),
    });
  } catch (error) {
    console.error("Telegram groups GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
