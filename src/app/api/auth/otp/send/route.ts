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

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = sendSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    const { email, purpose } = parsed.data;
    const normalizedEmail = email.trim().toLowerCase();

    const existing = await db.otpVerification.findUnique({
      where: { email_purpose: { email: normalizedEmail, purpose } },
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

    await db.otpVerification.upsert({
      where: { email_purpose: { email: normalizedEmail, purpose } },
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