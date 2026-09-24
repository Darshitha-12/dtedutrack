import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase-admin";

const BUCKET = "chat-media"; // reuse existing bucket; avatars live under avatars/
const MAX_BYTES = 5 * 1024 * 1024; // 5MB
const MAX_DB_BYTES = 2 * 1024 * 1024; // base64 data-URL fallback cap (2MB raw)

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = session.user.id;

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

    // Prefer Supabase storage when configured; otherwise fall back to storing
    // the image as a base64 data URL directly on the user row so avatar upload
    // keeps working without any external storage service.
    if (isSupabaseConfigured) {
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
    }

    if (file.size > MAX_DB_BYTES) {
      return NextResponse.json(
        { error: "Image too large (max 2MB when storage isn't configured)" },
        { status: 400 },
      );
    }

    const dataUrl = `data:${file.type || "image/png"};base64,${Buffer.from(await file.arrayBuffer()).toString("base64")}`;

    await db.user.update({
      where: { id: userId },
      data: { image: dataUrl, avatarUrl: dataUrl },
    });

    return NextResponse.json({ avatarUrl: dataUrl });
  } catch (error) {
    console.error("Avatar upload POST error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}