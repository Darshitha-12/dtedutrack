import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export async function DELETE(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const partnerId = String(body?.partnerId || "").trim();
    if (!partnerId) {
      return NextResponse.json({ error: "partnerId required" }, { status: 400 });
    }
    const me = session.user.id;
    if (partnerId === me) {
      return NextResponse.json({ error: "Cannot delete your own thread" }, { status: 400 });
    }

    await db.directMessage.deleteMany({
      where: {
        OR: [
          { senderId: me, receiverId: partnerId },
          { senderId: partnerId, receiverId: me },
        ],
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Conversation DELETE error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}