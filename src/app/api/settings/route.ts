import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth-helpers";
import { notificationPrefsSchema } from "@/lib/validations";

export async function GET() {
  try {
    const session = await requireSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = session.user.id;

    const prefs = await db.notificationPreference.findUnique({
      where: { userId },
    });
    if (!prefs) {
      const created = await db.notificationPreference.create({
        data: { userId },
      });
      return NextResponse.json({ settings: created });
    }
    return NextResponse.json({ settings: prefs });
  } catch (error) {
    console.error("Settings GET error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: Request) {
  try {
    const session = await requireSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = session.user.id;
    const body = await req.json();

    const parsed = notificationPrefsSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const updated = await db.notificationPreference.upsert({
      where: { userId },
      update: parsed.data,
      create: { userId, ...parsed.data },
    });

    return NextResponse.json({ settings: updated });
  } catch (error) {
    console.error("Settings PATCH error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
