import { NextResponse } from "next/server";
import { AI_MODES } from "@/features/ai/config";

export async function GET() {
  return NextResponse.json({ modes: AI_MODES });
}
