import { NextResponse } from "next/server";
import { signIn } from "@/lib/auth";
import { loginSchema } from "@/lib/validations";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.errors[0]?.message || "Invalid input" }, { status: 400 });
    }
    const { email, password } = parsed.data;
    await signIn("credentials", { email, password, redirect: false });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.json(
      { error: "Invalid email or password", detail: error instanceof Error ? error.message : String(error) },
      { status: 401 }
    );
  }
}
