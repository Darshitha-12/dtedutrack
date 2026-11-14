import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase-admin";

const BUCKET = "chat-media"; // reuse existing bucket; avatars live under avatars/
const MAX_BYTES = 5 * 1024 * 1024; // 5MB
const MAX_DB_BYTES = 2 * 1024 * 1024; // base64 data-URL fallback cap (2MB raw)

// Serves the signed-in user's own avatar. Session JWTs intentionally store only
// the short "/api/profile/avatar" URL (see src/lib/auth.ts) because an embedded
// base64 data URL would make the token far too large.
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await db.user.findUnique({
      where: { id: session.user.id },
      select: { image: true, avatarUrl: true },
    });

    const value = user?.image || user?.avatarUrl || "";
    if (!value) {
      return new NextResponse(null, { status: 404 });
    }

    if (value.startsWith("http://") || value.startsWith("https://")) {
      return NextResponse.redirect(value);
    }

    if (value.startsWith("data:")) {
      const comma = value.indexOf(",");
      const meta = comma >= 0 ? value.slice(5, comma) : "";
      const payload = comma >= 0 ? value.slice(comma + 1) : "";
      const [mime, encoding] = meta.split(";");
      const bytes =
        encoding === "base64"
          ? new Uint8Array(Buffer.from(payload, "base64"))
          : new Uint8Array(Buffer.from(decodeURIComponent(payload), "utf8"));
      return new NextResponse(bytes, {
        headers: {
          "Content-Type": mime || "image/png",
          // Avatars change rarely but must not be served stale after an update.
          "Cache-Control": "private, max-age=0, must-revalidate",
        },
      });
    }

    return new NextResponse(null, { status: 404 });
  } catch (error) {
    console.error("Avatar GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

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
    // keeps working without any external storage service (or when the storage
    // project is unreachable).
    const storeDataUrl = async () => {
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
    };

    if (isSupabaseConfigured) {
      const safeName = (file.name || "avatar").replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${userId}/avatars/${Date.now()}-${safeName}`;

      const buffer = Buffer.from(await file.arrayBuffer());
      const { error } = await supabaseAdmin.storage
        .from(BUCKET)
        .upload(path, buffer, { contentType: file.type || "image/png", upsert: false });

      if (!error) {
        const { data: pub } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(path);
        const avatarUrl = pub?.publicUrl || "";

        await db.user.update({
          where: { id: userId },
          data: { image: avatarUrl, avatarUrl },
        });

        return NextResponse.json({ avatarUrl });
      }

      console.error("Avatar upload storage error, falling back to data URL:", error);
    }

    return storeDataUrl();
  } catch (error) {
    console.error("Avatar upload POST error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}