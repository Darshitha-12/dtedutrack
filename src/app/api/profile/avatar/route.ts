import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase-admin";

const BUCKET = "chat-media"; // reuse existing bucket; avatars live under avatars/
const MAX_BYTES = 5 * 1024 * 1024; // 5MB

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = session.user.id;

    if (!isSupabaseConfigured) {
      return NextResponse.json(
        { error: "Avatar upload is not configured. Add Supabase env variables." },
        { status: 503 },
      );
    }

    const form = await req.formData();
    const file = form.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }
    if (!file.type.startsWith("image/")) {
      return NextResponse.json({ error: "Only image files are allowed" }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "Image too large (max 5MB)" }, { status: 400 });
    }

    const safeName = (file.name || "avatar").replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${userId}/avatars/${Date.now()}-${safeName}`;

    const buffer = Buffer.from(await file.arrayBuffer());
    const { error } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(path, buffer, { contentType: file.type || "image/png", upsert: false });

    if (error) {
      console.error("Avatar upload storage error:", error);
      return NextResponse.json({ error: `Upload failed: ${error.message}` }, { status: 500 });
    }

    const { data: pub } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(path);
    const avatarUrl = pub?.publicUrl || "";

    await db.user.update({
      where: { id: userId },
      data: { image: avatarUrl, avatarUrl },
    });

    return NextResponse.json({ avatarUrl });
  } catch (error) {
    console.error("Avatar upload POST error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}