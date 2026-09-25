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
    const body = await req.json();
    const parsed = setPasswordSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    const { email, token, password } = parsed.data;
    const normalizedEmail = email.trim().toLowerCase();

    const otp = await db.otpVerification.findFirst({
      where: {
        email: normalizedEmail,
        purpose: "login",
        usedAt: null,
        tokenHash: hashSecret(token),
        tokenExpiresAt: { gt: new Date() },
      },
    });

    if (!otp) {
      return NextResponse.json(
        { error: "Verification expired. Please request a new code." },
        { status: 400 },
      );
    }

    const user = await db.user.findUnique({ where: { email: normalizedEmail } });
    if (!user) {
      return NextResponse.json({ error: "No account found with this email." }, { status: 404 });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    await db.user.update({
      where: { email: normalizedEmail },
      data: { passwordHash: hashedPassword },
    });

    await db.otpVerification.update({
      where: { id: otp.id },
      data: { usedAt: new Date() },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Set password error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}