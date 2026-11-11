import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { generateGeminiContent } from "@/lib/gemini";

const generateSchema = z.object({
  topic: z.string().min(2, "Topic must be at least 2 characters").max(200),
  prompt: z.string().max(1000).optional().default(""),
  language: z.enum(["English", "Sinhala"]).optional().default("English"),
});

type GenerateInput = z.infer<typeof generateSchema>;

async function generateNote(input: GenerateInput): Promise<string> {
  const systemInstruction =
    "You are an expert A/L Biology tutor. Create a FULL, COMPLETE, and comprehensive study note for " +
    "the given lesson. Do NOT shorten, abbreviate, or truncate the content. Structure it with # and ## " +
    "headings, clear bullet points, and tables where helpful. Cover ALL key definitions, concepts, " +
    "processes, the full mechanism, any equations, examples, and exam-relevant points in detail — as if " +
    "writing a complete textbook chapter. Respond entirely in plain text.";

  const userInstruction =
    `Create a FULL, COMPLETE, and detailed study note for the lesson: "${input.topic}" (A/L Biology).\n` +
    `Do not leave anything out — write the complete note covering all important concepts, mechanisms, ` +
    `definitions, examples, and exam points in full detail.\n` +
    `Write the entire note in ${input.language}.\n` +
    `Additional instructions: ${input.prompt || "none"}`;

  if (!process.env.GEMINI_API_KEY) {
    return (
      `# ${input.topic}\n\n` +
      "AI note generation is not configured yet. Add GEMINI_API_KEY to enable AI study notes."
    );
  }

  try {
    return await generateGeminiContent(userInstruction, {
      systemInstruction,
      maxOutputTokens: 8192,
    });
  } catch (error) {
    console.error("[NOTES] Gemini generation error:", error);
    throw new Error("Failed to generate the note. Please try again later.");
  }
}

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const notes = await db.note.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
      select: { id: true, title: true, content: true, createdAt: true },
    });
    return NextResponse.json({ notes });
  } catch (error) {
    console.error("Notes GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
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

    const content = await generateNote(parsed.data);

    const note = await db.note.create({
      data: {
        title: parsed.data.topic,
        content,
        userId: session.user.id,
      },
      select: { id: true, title: true, content: true, createdAt: true },
    });

    return NextResponse.json(note, { status: 201 });
  } catch (error) {
    console.error("Notes POST error:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Note id is required" }, { status: 400 });
    }

    const note = await db.note.findUnique({ where: { id } });
    if (!note || note.userId !== session.user.id) {
      return NextResponse.json({ error: "Note not found" }, { status: 404 });
    }

    await db.note.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Notes DELETE error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
