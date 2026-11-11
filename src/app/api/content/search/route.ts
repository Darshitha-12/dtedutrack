import { NextResponse } from "next/server";
import { searchQuerySchema } from "@/features/content/validations";
import { searchContent } from "@/features/content/service";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q") || "";
    const subjectId = searchParams.get("subjectId") || undefined;
    const limit = parseInt(searchParams.get("limit") || "20", 10);

    const parsed = searchQuerySchema.safeParse({ q, subjectId, limit });
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
    }

    const results = await searchContent(parsed.data.q, parsed.data.subjectId, parsed.data.limit);
    return NextResponse.json({ results });
  } catch (error) {
    console.error("Search failed:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
