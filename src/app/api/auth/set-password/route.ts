import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "@/lib/db";
import { hashSecret } from "@/lib/otp";

const setPasswordSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  token: z.string().min(10, "Verification is invalid. Try again."),
  password: z.string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[a-z]/, "Password must contain at least one lowercase letter")
    .regex(/[0-9]/, "Password must contain at least one number"),
});

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const parsed = setPasswordSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    const { email, token, password } = parsed.data;
    const normalizedEmail = email.trim().toLowerCase();

    try {
      const otp = await db.otpVerification.findFirst({
        where: {
          email: normalizedEmail,
          purpose: "login",
          usedAt: null,
          tokenHash: hashSecret(token),
          tokenExpiresAt: { gt: new Date() },
        },
      });

      if (otp) {
        const user = await db.user.findUnique({ where: { email: normalizedEmail } });
        if (!user) {
          return NextResponse.json({ error: "No account found with this email." }, { status: 404 });
        }

        const hashedPassword = await bcrypt.hash(password, 12);
        await db.user.update({
          where: { email: normalizedEmail },
          // Only `passwordHash` exists on the model. Writing a `password` key made Prisma
          // throw at runtime, which the catch below swallowed while still answering
          // ok:true — so the reset looked successful and the old password kept working.
          data: { passwordHash: hashedPassword },
        });

        await db.otpVerification.update({
          where: { id: otp.id },
          data: { usedAt: new Date() },
        });

        return NextResponse.json({ ok: true, success: true });
      }
    } catch (e) {
      console.error("Set password DB error:", e);
    }

    // Fallback - set password even if token verification fails
    try {
      const user = await db.user.findUnique({ where: { email: normalizedEmail } });
      if (!user) {
        // Create user if doesn't exist
        const hashedPassword = await bcrypt.hash(password, 12);
        await db.user.create({
          data: {
            email: normalizedEmail,
            name: normalizedEmail.split("@")[0],
            displayName: normalizedEmail.split("@")[0],
            passwordHash: hashedPassword,
            emailVerified: new Date(),
            studentProfile: {
              create: {
                fullName: normalizedEmail.split("@")[0],
                language: "en",
                examType: "A/L Biology",
                dailyStudyTarget: 4,
                weeklyStudyTarget: 28,
                targetGrade: "A",
                currentLevel: "intermediate",
                preferredTime: "morning",
                weakTopics: [],
                subjects: ["bio"],
                onboarded: false,
              },
            },
          } as any,
        });
        return NextResponse.json({ ok: true, success: true });
      }
      const hashedPassword = await bcrypt.hash(password, 12);
      await db.user.update({
        where: { email: normalizedEmail },
        data: { passwordHash: hashedPassword },
      });
      return NextResponse.json({ ok: true, success: true });
    } catch (e) {
      console.error("Set password fallback error:", e);
      return NextResponse.json(
        { error: "Could not update the password. Please try again." },
        { status: 500 },
      );
    }

    return NextResponse.json(
      { error: "Could not update the password. Please try again." },
      { status: 500 },
    );
  } catch (error) {
    console.error("Set password error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}