import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth-helpers";
import { onboardingSchema } from "@/lib/validations";

export async function PATCH(req: Request) {
  try {
    const session = await requireSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = session.user.id;
    const body = await req.json();

    const parsed = onboardingSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const updatedProfile = await db.studentProfile.upsert({
      where: { userId },
      update: {
        ...parsed.data,
        onboarded: true,
      },
      create: {
        userId,
        ...parsed.data,
        onboarded: true,
        examType: "A/L Biology",
        weeklyStudyTarget: parsed.data.weeklyStudyTarget,
        targetGrade: "A",
        preferredTime: "morning",
        weakTopics: parsed.data.weakTopics ?? [],
        subjects: ["bio"],
      },
    });

    return NextResponse.json({ profile: updatedProfile });
  } catch (error) {
    console.error("Onboarding PATCH error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
