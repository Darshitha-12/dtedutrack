import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resolvePresence } from "@/lib/presence";
import { chatPreflight, resolveChatUser } from "@/lib/chat-api";

export async function OPTIONS() {
  return chatPreflight();
}

export async function GET(req: Request) {
  try {
    const me = await resolveChatUser(req);
    if (!me) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const users = await db.user.findMany({
      where: { id: { not: me.id } },
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
