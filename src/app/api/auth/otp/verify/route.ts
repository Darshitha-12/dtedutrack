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

async function ensureSchema(normalizedEmail: string, purpose: string) {
  try {
    await db.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "otp_verifications" (
      "id" TEXT NOT NULL,
      "email" TEXT NOT NULL,
      "codeHash" TEXT NOT NULL,
      "purpose" TEXT NOT NULL DEFAULT 'login',
      "attempts" INTEGER NOT NULL DEFAULT 0,
      "expiresAt" TIMESTAMP(3) NOT NULL,
      "tokenHash" TEXT,
      "tokenExpiresAt" TIMESTAMP(3),
      "usedAt" TIMESTAMP(3),
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "otp_verifications_pkey" PRIMARY KEY ("id")
    )`);
    await db.$executeRawUnsafe(
      `ALTER TABLE "otp_verifications" ADD COLUMN IF NOT EXISTS "tokenHash" TEXT`
    );
    await db.$executeRawUnsafe(
      `ALTER TABLE "otp_verifications" ADD COLUMN IF NOT EXISTS "tokenExpiresAt" TIMESTAMP(3)`
    );
    await db.$executeRawUnsafe(`ALTER TABLE "otp_verifications" ADD COLUMN IF NOT EXISTS "usedAt" TIMESTAMP(3)`);
    // Remove stale duplicates from old deploys (pre-unique-index) so verify()
    // only ever sees the row just created by send().
    await db.$executeRawUnsafe(
      `DELETE FROM "otp_verifications" WHERE email = $1 AND purpose = $2 AND "usedAt" IS NULL AND id NOT IN (
        SELECT id FROM "otp_verifications" t2
        WHERE t2.email = $1 AND t2.purpose = $2 AND "usedAt" IS NULL
        ORDER BY t2."createdAt" DESC
        LIMIT 1
      )`,
      normalizedEmail,
      purpose,
    );
  } catch (error) {
    console.error("OTP verify ensureSchema error:", error);
  }
}

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
    await ensureSchema(normalizedEmail, purpose);

    const record = await db.otpVerification.findFirst({
      where: { email: normalizedEmail, purpose, usedAt: null },
      orderBy: { createdAt: "desc" },
    });

    if (!record) {
      // The most-recent row may already be consumed (usedAt set); fall back to
      // the newest row of any state so the correct match still succeeds.
      const anyRecord = await db.otpVerification.findFirst({
        where: { email: normalizedEmail, purpose },
        orderBy: { createdAt: "desc" },
      });
      if (!anyRecord) {
        return NextResponse.json({ error: "No pending verification found. Request a new code." }, { status: 400 });
      }
      const expectedFallback = otpHash(normalizedEmail, purpose, codeTrimmed);
      if (safeEqual(expectedFallback, anyRecord.codeHash)) {
        return continueVerify({ record: anyRecord, normalizedEmail, purpose, codeTrimmed, name });
      }
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

    return continueVerify({ record, normalizedEmail, purpose, codeTrimmed, name });
  } catch (error) {
    console.error("OTP verify error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// Shared success path used by both the primary lookup and the usedAt fallback.
async function continueVerify(opts: {
  record: { id: string };
  normalizedEmail: string;
  purpose: string;
  codeTrimmed: string;
  name?: string;
}) {
  const { record, normalizedEmail, purpose, codeTrimmed, name } = opts;

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
}