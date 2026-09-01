import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { generateGeminiContent } from "@/lib/gemini";

const generateSchema = z.object({
  topic: z.string().min(2).max(200),
  structure: z.string().max(400).optional().default(""),
  language: z.enum(["English", "Sinhala"]).optional().default("English"),
});

function toMarkdown(lines: string[]): string {
  return lines
    .map((l) => l.replace(/^```/, "").replace(/^ascii\+?html|^mermaid$/i, "").trim())
    .filter((l) => l !== "")
    .join("\n");
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const parsed = generateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 },
      );
    }

    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json(
        { error: "Diagram Lab is not configured. Add GEMINI_API_KEY." },
        { status: 503 },
      );
    }

    const systemInstruction =
      "You are an expert A/L Biology tutor. Build a clear visual diagram for the requested biological " +
      "structure/process using ASCII-art-style text (with box-drawing or label arrows), then provide a " +
      "step-by-step labelling guide and a short function explanation. Use # and ## headings and bullet points.";

    const userInstruction =
      `Create a labelled diagram and explanation for: "${parsed.data.topic}" (A/L Biology).\n` +
      (parsed.data.structure
        ? `Focus structure/process: ${parsed.data.structure}\n`
        : "") +
      `Write everything in ${parsed.data.language}.\n` +
      "Format:\n# <Title>\n## Diagram\n<ascii diagram with labels>\n## Labels\n- Part: purpose\n## How it works\n<short explanation>\n";

    try {
      const text = await generateGeminiContent(userInstruction, {
        systemInstruction,
        maxOutputTokens: 4096,
      });
      return NextResponse.json({ content: toMarkdown(text.split("\n")) });
    } catch (error) {
      console.error("[DIAGRAMS] Gemini error:", error);
      const message = error instanceof Error ? error.message : "Failed to generate the diagram.";
      return NextResponse.json(
        { error: message.slice(0, 500) },
        { status: 500 },
      );
    }
  } catch (error) {
    console.error("Diagrams POST error:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
