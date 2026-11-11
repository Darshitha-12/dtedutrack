import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { generateGeminiContent } from "@/lib/gemini";

const generateSchema = z.object({
  mode: z.literal("generate"),
  topic: z.string().min(2).max(200),
  count: z.number().int().min(3).max(20).default(10),
  language: z.enum(["English", "Sinhala"]).optional().default("English"),
});

const saveSchema = z.object({
  mode: z.literal("save").optional(),
  title: z.string().min(1).max(200),
  language: z.enum(["English", "Sinhala"]).optional().default("English"),
  cards: z
    .array(z.object({ front: z.string().min(1), back: z.string().min(1) }))
    .min(1)
    .max(100),
});

const deckIdSchema = z.object({
  id: z.string().min(1),
});

const updateTitleSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(200),
});

interface FlashcardDraft {
  front: string;
  back: string;
}

function parseFlashcards(text: string, fallbackTopic: string): FlashcardDraft[] {
  const lines = text.split("\n");
  const cards: FlashcardDraft[] = [];
  let front = "";
  const normalize = (s: string) =>
    s
      .replace(/^\s*\d+[\.\):–-]\s*/, "")
      .replace(/^\*\*|\*\*$/g, "")
      .replace(/^\*|\*$/g, "")
      .trim();
  for (const raw of lines) {
    const line = raw.trim();
    const norm = normalize(line);
    if (/^Q[:：]|^FRONT[:：]|^\?/.test(norm)) {
      if (front) {
        cards.push({ front, back: "" });
      }
      front = norm.replace(/^Q[:：]|^FRONT[:：]|^\?/i, "").trim();
    } else if (/^A[:：]|^BACK[:：]/.test(norm)) {
      cards.push({
        front,
        back: norm.replace(/^A[:：]|^BACK[:：]/i, "").trim(),
      });
      front = "";
    }
  }
  if (front) cards.push({ front, back: "" });
  if (cards.length === 0) {
    return [{ front: fallbackTopic, back: text.trim() }];
  }
  return cards.filter((c) => c.front && c.back);
}

async function getOwnedDeck(userId: string, id: string) {
  const deck = await db.flashcardDeck.findUnique({
    where: { id },
    include: { cards: { orderBy: { order: "asc" } } },
  });
  if (!deck || deck.userId !== userId) return null;
  return deck;
}

export async function GET(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (id) {
      const deck = await getOwnedDeck(session.user.id, id);
      if (!deck) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      return NextResponse.json({
        deck: {
          id: deck.id,
          title: deck.title,
          language: deck.language,
          source: deck.source,
          cards: deck.cards.map((c) => ({ id: c.id, front: c.front, back: c.back })),
        },
      });
    }
    const decks = await db.flashcardDeck.findMany({
      where: { userId: session.user.id },
      orderBy: { updatedAt: "desc" },
      include: { _count: { select: { cards: true } } },
    });
    return NextResponse.json({
      decks: decks.map((d) => ({
        id: d.id,
        title: d.title,
        language: d.language,
        source: d.source,
        createdAt: d.createdAt,
        updatedAt: d.updatedAt,
        cardCount: d._count.cards,
      })),
    });
  } catch (error) {
    console.error("Flashcards GET error:", error);
    return NextResponse.json(
      { error: "Failed to load flashcards." },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();

    if (body?.mode === "generate") {
      const parsed = generateSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { error: parsed.error.issues[0].message },
          { status: 400 },
        );
      }
      if (!process.env.GEMINI_API_KEY) {
        return NextResponse.json(
          { error: "AI flashcards are not configured. Add GEMINI_API_KEY." },
          { status: 503 },
        );
      }
      const systemInstruction =
        `You are an expert A/L Biology tutor. Create ${parsed.data.count} clear, accurate flashcards ` +
        "for the given lesson. Each flashcard has a short question (front) and a concise answer (back). " +
        "Format your entire answer strictly as lines: 'Q: <front>' followed by 'A: <back>' for each card. " +
        "Number them. Keep each face to one or two sentences.";
      const userInstruction =
        `Topic: "${parsed.data.topic}" (A/L Biology). Create exactly ${parsed.data.count} flashcards in ${parsed.data.language}.\n` +
        "Format each card as two lines:\nQ: <question/front>\nA: <answer/back>\n";
      try {
        const text = await generateGeminiContent(userInstruction, {
          systemInstruction,
          maxOutputTokens: 2048,
        });
        const cards = parseFlashcards(text, parsed.data.topic);
        return NextResponse.json({ cards });
      } catch (error) {
        console.error("[FLASHCARDS] Gemini error:", error);
        return NextResponse.json(
          { error: "Failed to generate flashcards. Please try again." },
          { status: 500 },
        );
      }
    }

    const parsed = saveSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 },
      );
    }
    const deck = await db.flashcardDeck.create({
      data: {
        userId: session.user.id,
        title: parsed.data.title,
        language: parsed.data.language,
        cards: {
          create: parsed.data.cards.map((c, i) => ({ front: c.front, back: c.back, order: i })),
        },
      },
    });
    return NextResponse.json(
      { deck: { id: deck.id, title: deck.title, language: deck.language } },
      { status: 201 },
    );
  } catch (error) {
    console.error("Flashcards POST error:", error);
    return NextResponse.json(
      { error: "Failed to save flashcards." },
      { status: 500 },
    );
  }
}

export async function PATCH(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const body = await req.json();
    const parsed = updateTitleSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 },
      );
    }
    const deck = await getOwnedDeck(session.user.id, parsed.data.id);
    if (!deck) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const updated = await db.flashcardDeck.update({
      where: { id: deck.id },
      data: { title: parsed.data.title },
    });
    return NextResponse.json({ deck: { id: updated.id, title: updated.title } });
  } catch (error) {
    console.error("Flashcards PATCH error:", error);
    return NextResponse.json(
      { error: "Failed to update deck." },
      { status: 500 },
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const body = await req.json();
    const parsed = deckIdSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "A deck id is required." },
        { status: 400 },
      );
    }
    const deck = await getOwnedDeck(session.user.id, parsed.data.id);
    if (!deck) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    await db.flashcardDeck.delete({ where: { id: deck.id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Flashcards DELETE error:", error);
    return NextResponse.json(
      { error: "Failed to delete deck." },
      { status: 500 },
    );
  }
}
