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

    let user;
    try {
      user = await db.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
          displayName: true,
          avatarUrl: true,
          about: true,
          createdAt: true,
          studentProfile: true,
        },
      });
    } catch {
      // Deployed DB may predate the displayName/avatarUrl/about columns.
      // Fall back to the base columns so the dashboard never shows as a brand-new user.
      user = await db.user.findUnique({
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
    }

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const sp = user.studentProfile;
    const extended = user as unknown as {
      displayName?: string | null;
      avatarUrl?: string | null;
      about?: string | null;
    };

    return NextResponse.json({
      name: user.name ?? "",
      displayName: extended.displayName ?? user.name ?? "",
      email: user.email,
      image: user.image ?? null,
      avatarUrl: extended.avatarUrl ?? user.image ?? null,
      about: extended.about ?? "",
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

    const name = typeof body.name === "string" ? body.name.trim() : undefined;
    if (name !== undefined && (name.length < 2 || name.length > 100)) {
      return NextResponse.json(
        { error: { name: ["Name must be 2-100 characters"] } },
        { status: 400 }
      );
    }

    const displayName = typeof body.displayName === "string" ? body.displayName.trim() : undefined;
    if (displayName !== undefined && (displayName.length > 100)) {
      return NextResponse.json(
        { error: { displayName: ["Display name must be at most 100 characters"] } },
        { status: 400 }
      );
    }

    const about = typeof body.about === "string" ? body.about.trim() : undefined;
    if (about !== undefined && about.length > 500) {
      return NextResponse.json(
        { error: { about: ["About must be at most 500 characters"] } },
        { status: 400 }
      );
    }

    const avatarUrl = typeof body.avatarUrl === "string" ? body.avatarUrl.trim() : undefined;

    const parsed = studentProfileSchema.partial().safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { ...profileData } = parsed.data as Record<string, unknown>;

    if (profileData.examDate !== undefined && profileData.examDate !== null) {
      const rawExamDate = profileData.examDate as string;
      if (rawExamDate.trim() === "") {
        profileData.examDate = null;
      } else {
        const examDate = new Date(rawExamDate);
        if (isNaN(examDate.getTime())) {
          return NextResponse.json(
            { error: { examDate: ["Invalid exam date"] } },
            { status: 400 }
          );
        }
        profileData.examDate = examDate;
      }
    }

    const userData: Record<string, unknown> = {};
    if (name !== undefined) userData.name = name;
    if (name !== undefined && displayName === undefined) userData.displayName = name;
    if (displayName !== undefined) userData.displayName = displayName;
    if (about !== undefined) userData.about = about;
    if (avatarUrl !== undefined) {
      userData.avatarUrl = avatarUrl;
      userData.image = avatarUrl;
    }

    if (Object.keys(userData).length > 0) {
      await db.user.update({ where: { id: userId }, data: userData });
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

    let updatedUser;
    try {
      updatedUser = await db.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
          displayName: true,
          avatarUrl: true,
          about: true,
          studentProfile: true,
        },
      });
    } catch {
      updatedUser = await db.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
          studentProfile: true,
        },
      });
    }

    return NextResponse.json({ user: updatedUser });
  } catch (error) {
    console.error("Profile PATCH error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
