import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth-helpers";
import { studentProfileSchema } from "@/lib/validations";

export async function GET() {
  try {
    const session = await requireSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = session.user.id;

    const user = await db.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        createdAt: true,
        studentProfile: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const sp = user.studentProfile;

    return NextResponse.json({
      name: user.name ?? "",
      email: user.email,
      image: user.image ?? null,
      avatarUrl: user.image ?? null,
      fullName: sp?.fullName ?? "",
      language: sp?.language ?? "en",
      examYear: sp?.examYear != null ? String(sp.examYear) : "",
      examDate: sp?.examDate ? sp.examDate.toISOString().split("T")[0] : "",
      examType: sp?.examType ?? "A/L",
      dailyTargetHours: sp?.dailyStudyTarget ?? 4,
      weeklyTargetHours: sp?.weeklyStudyTarget ?? 28,
      targetGrade: sp?.targetGrade ?? "A",
      currentLevel: sp?.currentLevel ?? "O/L",
      preferredStudyTime: sp?.preferredTime ?? "morning",
      weakTopics: sp?.weakTopics ?? [],
      onboarded: sp?.onboarded ?? false,
    });
  } catch (error) {
    console.error("Profile GET error:", error);
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

    const parsed = studentProfileSchema.partial().safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { name, ...profileData } = parsed.data as Record<string, unknown>;

    if (name) {
      await db.user.update({
        where: { id: userId },
        data: { name: name as string },
      });
    }

    const profileFields: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(profileData)) {
      if (value !== undefined) {
        profileFields[key] = value;
      }
    }

    if (Object.keys(profileFields).length > 0) {
      await db.studentProfile.upsert({
        where: { userId },
        update: profileFields,
        create: { userId, ...profileFields },
      });
    }

    const updatedUser = await db.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        studentProfile: true,
      },
    });

    return NextResponse.json({ user: updatedUser });
  } catch (error) {
    console.error("Profile PATCH error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
