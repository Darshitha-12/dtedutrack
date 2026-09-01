import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

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
        email: true,
        image: true,
        presence: { select: { status: true, lastSeen: true } },
      },
      orderBy: { createdAt: "asc" },
    });

    const list = users.map((u) => ({
      id: u.id,
      name: u.name || u.email?.split("@")[0] || "User",
      email: u.email,
      image: u.image,
      status: u.presence?.status || "offline",
      lastSeen: u.presence?.lastSeen?.toISOString() || null,
    }));

    return NextResponse.json({ users: list });
  } catch (error) {
    console.error("Chat users GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
