import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { otpHash, safeEqual, generateSigninToken, hashSecret, MAX_ATTEMPTS, SIGNIN_TOKEN_TTL_MS } from "@/lib/otp";

const verifySchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  code: z.string().length(6, "Enter the 6-digit code"),
  purpose: z.enum(["login", "register"]).default("login"),
  name: z.string().max(100).optional(),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = verifySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    const { email, code, purpose, name } = parsed.data;
    const normalizedEmail = email.trim().toLowerCase();
    const codeTrimmed = code.trim();

    const record = await db.otpVerification.findUnique({
      where: { email_purpose: { email: normalizedEmail, purpose } },
    });

    if (!record || record.usedAt) {
      return NextResponse.json({ error: "No pending verification found. Request a new code." }, { status: 400 });
    }
    if (record.attempts >= MAX_ATTEMPTS) {
      return NextResponse.json({ error: "Too many attempts. Request a new code." }, { status: 429 });
    }
    if (record.expiresAt.getTime() < Date.now()) {
      return NextResponse.json({ error: "This code has expired. Request a new one." }, { status: 400 });
    }

    const expected = otpHash(normalizedEmail, purpose, codeTrimmed);
    if (!safeEqual(expected, record.codeHash)) {
      await db.otpVerification.update({
        where: { id: record.id },
        data: { attempts: { increment: 1 } },
      });
      const remaining = MAX_ATTEMPTS - (record.attempts + 1);
      return NextResponse.json(
        { error: remaining > 0 ? `Incorrect code. ${remaining} attempts remaining.` : "Too many attempts. Request a new code." },
        { status: 400 },
      );
    }

    // Auto-create the user when needed (OTP is the primary sign-up method)
    let user = await db.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true, email: true, name: true, image: true },
    });

    if (!user) {
      const fullName = name?.trim() || normalizedEmail.split("@")[0];
      user = await db.user.create({
        data: {
          name: fullName,
          displayName: fullName,
          email: normalizedEmail,
          emailVerified: new Date(),
          studentProfile: {
            create: {
              fullName,
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
        },
        select: { id: true, email: true, name: true, image: true },
      });
    }

    const token = generateSigninToken();

    await db.otpVerification.update({
      where: { id: record.id },
      data: {
        codeHash: hashSecret(`${normalizedEmail}:${purpose}:consumed:${Date.now()}`),
        tokenHash: hashSecret(token),
        tokenExpiresAt: new Date(Date.now() + SIGNIN_TOKEN_TTL_MS),
      },
    });

    return NextResponse.json({ ok: true, token, user });
  } catch (error) {
    console.error("OTP verify error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}