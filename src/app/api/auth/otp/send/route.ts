import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { sendOtpEmail } from "@/lib/email";
import { generateOtpCode, otpHash, OTP_TTL_MS } from "@/lib/otp";

const sendSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  purpose: z.enum(["login", "register"]).default("login"),
});

const RESEND_MIN_MS = 60 * 1000; // 60s before a new code can be requested

// The live DB was set up without Prisma migrations, so guarantee the table
// (and its columns) exist, and dedupe any stale rows from older deploys that
// predate the [email, purpose] unique index.
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
    await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "otp_verifications_email_idx" ON "otp_verifications" ("email")`);
    // Remove consumed/stale rows so verify() can never land on a used code.
    await db.$executeRawUnsafe(
      `DELETE FROM "otp_verifications" WHERE email = $1 AND purpose = $2 AND "usedAt" IS NOT NULL`,
      normalizedEmail,
      purpose,
    );
  } catch (error) {
    console.error("OTP ensureSchema error:", error);
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = sendSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    const { email, purpose } = parsed.data;
    const normalizedEmail = email.trim().toLowerCase();
    await ensureSchema(normalizedEmail, purpose);

    const existing = await db.otpVerification.findFirst({
      where: { email: normalizedEmail, purpose, usedAt: null },
      orderBy: { createdAt: "desc" },
    });

    if (existing && !existing.usedAt) {
      const elapsed = Date.now() - existing.createdAt.getTime();
      if (elapsed < RESEND_MIN_MS) {
        const wait = Math.ceil((RESEND_MIN_MS - elapsed) / 1000);
        return NextResponse.json(
          { error: `Please wait ${wait}s before requesting another code.`, resendIn: wait },
          { status: 429 },
        );
      }
    }

    if (purpose === "login") {
      const user = await db.user.findUnique({ where: { email: normalizedEmail } });
      if (!user) {
        return NextResponse.json(
          { error: "No account found with this email. Create an account instead." },
          { status: 404 },
        );
      }
    }

    const code = generateOtpCode();

    const record =
      existing ||
      (await db.otpVerification.findFirst({
        where: { email: normalizedEmail, purpose },
        orderBy: { createdAt: "desc" },
      }));

    await db.otpVerification.upsert({
      where: { id: record?.id || "__none__" },
      update: {
        codeHash: otpHash(normalizedEmail, purpose, code),
        attempts: 0,
        expiresAt: new Date(Date.now() + OTP_TTL_MS),
        usedAt: null,
        tokenHash: null,
        tokenExpiresAt: null,
      },
      create: {
        email: normalizedEmail,
        purpose,
        codeHash: otpHash(normalizedEmail, purpose, code),
        expiresAt: new Date(Date.now() + OTP_TTL_MS),
      },
    });

    const sendResult = await sendOtpEmail(normalizedEmail, code);

    // Fallback when no email provider is available:
    //  - dev mode always returns the code,
    //  - production falls back automatically when the email service is not
    //    configured at all (no RESEND_API_KEY), so login keeps working on
    //    deploys that haven't added Resend yet.
    const providerConfigured = Boolean(process.env.RESEND_API_KEY);
    const allowDevCode =
      process.env.NODE_ENV !== "production" ||
      !providerConfigured ||
      process.env.OTP_DEV_FALLBACK === "1";
    if (!sendResult.ok && allowDevCode) {
      return NextResponse.json({ ok: true, devCode: code, warning: sendResult.error });
    }
    if (!sendResult.ok) {
      return NextResponse.json({ error: sendResult.error || "Failed to send email" }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("OTP send error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}