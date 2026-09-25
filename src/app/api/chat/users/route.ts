import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { resolvePresence } from "@/lib/presence";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const users = await db.user.findMany({
      where: { id: { not: session.user.id } },
      select: {
        id: true,
        name: true,
        displayName: true,
        avatarUrl: true,
        image: true,
        about: true,
        email: true,
        presence: { select: { status: true, lastSeen: true } },
      },
      orderBy: { createdAt: "asc" },
    });

    const list = users.map((u) => {
      const { status, lastSeen } = resolvePresence(u.presence || null);
      return {
        id: u.id,
        name: u.displayName || u.name || u.email?.split("@")[0] || "User",
        fullName: u.name || u.displayName || "",
        email: u.email,
        image: u.image || u.avatarUrl,
        about: u.about || "",
        status,
        lastSeen,
      };
    });

    return NextResponse.json({ users: list });
  } catch (error) {
    console.error("Chat users GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
