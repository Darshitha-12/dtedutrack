import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase-admin";

const BUCKET = "chat-media";
const MAX_BYTES = 15 * 1024 * 1024; // 15MB

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!isSupabaseConfigured) {
      return NextResponse.json(
        { error: "Media upload is not configured. Add Supabase env variables." },
        { status: 503 },
      );
    }

    const form = await req.formData();
    const file = form.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "File too large (max 15MB)" }, { status: 400 });
    }

    const mine = file.type || "";
    let mediaType = "file";
    if (mine.startsWith("image/")) mediaType = "image";
    else if (mine.startsWith("video/")) mediaType = "video";
    else if (mine.startsWith("audio/")) mediaType = "audio";

    const safeName = (file.name || "file").replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${session.user.id}/${Date.now()}-${safeName}`;

    const buffer = Buffer.from(await file.arrayBuffer());
    const { error } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(path, buffer, { contentType: mine, upsert: false });

    if (error) {
      console.error("Chat upload storage error:", error);
      return NextResponse.json({ error: `Upload failed: ${error.message}` }, { status: 500 });
    }

    const { data: pub } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(path);
    const mediaUrl = pub?.publicUrl || "";

    return NextResponse.json({ mediaUrl, mediaType, mediaName: file.name, bucket: BUCKET });
  } catch (error) {
    console.error("Chat upload POST error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
