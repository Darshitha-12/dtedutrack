import { NextResponse } from "next/server";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "@/lib/db";

export const runtime = "nodejs";

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const bodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  label: z.string().max(80).optional(),
});

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

/**
 * Mints a long-lived device token for the offline Android app. The app runs
 * without the NextAuth cookie, so after the user "signs in" it exchanges the
 * email + password once for a bearer token it stores locally and uses for every
 * /api/account/snapshot call afterwards.
 */
export async function POST(req: Request) {
  try {
    const json = await req.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "A valid email and password are required." },
        { status: 400, headers: CORS },
      );
    }

    const email = parsed.data.email.trim().toLowerCase();
    const user = await db.user.findUnique({
      where: { email },
      select: { id: true, email: true, name: true, passwordHash: true },
    });
    if (!user || !user.passwordHash) {
      return NextResponse.json(
        { error: "Incorrect email or password." },
        { status: 401, headers: CORS },
      );
    }

    const ok = await bcrypt.compare(parsed.data.password, user.passwordHash);
    if (!ok) {
      return NextResponse.json(
        { error: "Incorrect email or password." },
        { status: 401, headers: CORS },
      );
    }

    const token = crypto.randomBytes(32).toString("hex");
    await db.deviceToken.create({
      data: {
        token,
        userId: user.id,
        label: parsed.data.label?.slice(0, 80) || "device",
      },
    });

    return NextResponse.json(
      { token, user: { id: user.id, email: user.email, name: user.name } },
      { status: 200, headers: CORS },
    );
  } catch (error) {
    console.error("Account connect error:", error);
    return NextResponse.json(
      { error: "Could not connect this device. Please try again." },
      { status: 500, headers: CORS },
    );
  }
}
