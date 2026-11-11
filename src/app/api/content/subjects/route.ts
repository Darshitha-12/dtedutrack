import { NextResponse } from "next/server";
import { getSubjects } from "@/features/content/service";

export async function GET() {
  try {
    const subjects = await getSubjects();
    return NextResponse.json({ subjects });
  } catch (error) {
    console.error("Failed to fetch subjects:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
