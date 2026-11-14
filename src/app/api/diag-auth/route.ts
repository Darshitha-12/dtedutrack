import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { db } = await import("@/lib/db");
    const user = await db.user.findFirst({
      where: { email: { equals: "darshithathikshana9@gmail.com", mode: "insensitive" } },
      select: { id: true, image: true, avatarUrl: true },
    });
    const img = user?.image ?? null;
    const avatar = user?.avatarUrl ?? null;
    return NextResponse.json({
      found: !!user,
      imageLen: img ? img.length : 0,
      imagePrefix: img ? img.slice(0, 32) : null,
      isDataUrl: !!img && img.startsWith("data:"),
      avatarUrlLen: avatar ? avatar.length : 0,
    });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
