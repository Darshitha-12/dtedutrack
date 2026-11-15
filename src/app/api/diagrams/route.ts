import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { generateGeminiContent, generateGeminiImage } from "@/lib/gemini";

const generateSchema = z.object({
  topic: z.string().min(2).max(200),
  structure: z.string().max(400).optional().default(""),
  language: z.enum(["English", "Sinhala"]).optional().default("English"),
});

/**
 * The diagram must look like a student drew it in a notebook — gray pencil on
 * light paper, simple lines, straight leader arrows and bilingual labels.
 * Explicitly rules out the "coloured textbook illustration" look.
 */
const DIAGRAM_STYLE_PROMPT = `You are an AI diagram generator for Sri Lankan G.C.E. A/L science students (Biology and Physics).

TASK: Draw the requested structure or process as a hand-drawn PENCIL SKETCH on a page of a student's study notebook.

STYLE (strict):
- Gray pencil / charcoal sketch only. NO colour. NO coloured textbook illustration, NO 3D render, NO photograph, NO glossy digital art.
- High-contrast black-and-white lines on a light, slightly textured notebook-paper background.
- Clean, simple, well-drawn lines with a neat hand-drawn feel; at most light pencil hatching for shading.
- Scientifically accurate for G.C.E. A/L standard (NIE Resource Book), simplified to only the essential parts an exam answer needs.

LABELS (strict):
- Every essential part MUST be labelled.
- Use simple, straight pencil leader lines; each line ends in a small arrowhead pointing precisely at the part (no curvy or decorative arrows).
- Each label is written in BOTH languages, Sinhala first and English second, e.g. "දකුණු කර්ණිකාව / Right Atrium".
- Use the exact NIE Resource Book terminology. Keep label lettering small, legible and handwritten-style.
- Add a small handwritten title at the top of the page.

Do not add colour swatches, coloured borders, watermarks, decorative backgrounds or extra panels. The whole image must read as gray pencil on light notebook paper.`;

/**
 * Free-tier text model fallback: draw the same pencil sketch as inline SVG.
 * SVG rendered through an <img> cannot run scripts, but the markup is still
 * validated because it originates from a model.
 */
const SVG_STYLE_PROMPT = `You are an AI diagram generator for Sri Lankan G.C.E. A/L science students (Biology and Physics). Output ONLY one standalone SVG document — no markdown fences, no explanation before or after.

DRAWING RULES (strict):
- viewBox="0 0 1000 750", with width="1000" height="750" and xmlns="http://www.w3.org/2000/svg".
- Pencil-on-notebook-paper look: background rect fill #f7f2e6 with a few faint ruled lines in #e6ddc9. All drawing strokes in gray (#444444 / #555555). NO colour, NO gradients, NO filters, NO embedded images.
- Hand-drawn feel: draw each main outline twice with a tiny offset (about 1px, second copy opacity 0.3). Use stroke-linecap="round" and stroke-linejoin="round".
- Scientifically accurate simplified schematic for G.C.E. A/L (NIE Resource Book); show only the essential parts an exam answer needs.
- LABELS: every essential part gets a label. Use a straight <line> leader from the label to the part, ending in a small filled gray <polygon> arrowhead that points precisely at the part.
- Each label text is BOTH languages, Sinhala first: e.g. <text ...>දකුණු කර්ණිකාව / Right Atrium</text>. Use font-family="'Segoe UI', 'Noto Sans Sinhala', sans-serif", font-size 13-15, fill #333333.
- Add a small handwritten-style title at the top: "<Sinhala title> / <English title>".
- Keep the SVG compact (under 120 KB) and self-contained. No <script>, no <foreignObject>, no external href/xlink:href, no event handler attributes.`;

/** Returns the model's SVG markup, or null when the output is not safe/usable. */
function extractSvg(raw: string): string | null {
  const start = raw.indexOf("<svg");
  const end = raw.lastIndexOf("</svg>");
  if (start < 0 || end < 0) return null;
  let svg = raw.slice(start, end + "</svg>".length).trim();
  if (!/^<svg[\s>]/i.test(svg) || svg.length > 150_000) return null;
  // Model output is untrusted markup even though <img> sandboxes it.
  if (/<script|<foreignObject|\son\w+\s*=|\shref\s*=|xlink:href|javascript:/i.test(svg)) {
    return null;
  }
  if (!/\sxmlns\s*=/.test(svg)) {
    svg = svg.replace(/^<svg/i, '<svg xmlns="http://www.w3.org/2000/svg"');
  }
  if (!/\sviewBox\s*=/i.test(svg)) return null;
  return svg;
}

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

    const { topic, structure, language } = parsed.data;
    const subjectBrief = [
      `Structure / process: ${topic}`,
      structure ? `Must show: ${structure}` : "",
      `Write any accompanying explanation text in ${language}.`,
    ]
      .filter(Boolean)
      .join("\n");

    // 1) Preferred: a real pencil-sketch drawing with bilingual labels.
    try {
      const image = await generateGeminiImage(subjectBrief, {
        systemInstruction: DIAGRAM_STYLE_PROMPT,
        temperature: 0.5,
      });
      return NextResponse.json({
        image: image.dataUrl,
        mimeType: image.mimeType,
        content: image.caption,
      });
    } catch (imageError) {
      // A text model cannot draw, but a text diagram still helps — keep the
      // feature working instead of failing outright.
      console.error("[DIAGRAMS] Image model failed, using text diagram:", imageError);
    }

    // 2) Free-tier fallback: the text model draws the same style as SVG.
    try {
      const rawSvg = await generateGeminiContent(
        [
          "Draw this A/L diagram as SVG:",
          `Structure / process: ${topic}`,
          structure ? `Must show: ${structure}` : "",
        ]
          .filter(Boolean)
          .join("\n"),
        { systemInstruction: SVG_STYLE_PROMPT, temperature: 0.5, maxOutputTokens: 16384, thinkingBudget: 0 },
      );
      const svg = extractSvg(rawSvg);
      if (svg) {
        return NextResponse.json({
          image: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
          mimeType: "image/svg+xml",
          content: "",
        });
      }
      console.error("[DIAGRAMS] SVG output was unusable, using text diagram.");
    } catch (svgError) {
      console.error("[DIAGRAMS] SVG fallback failed:", svgError);
    }

    // 3) Last resort: ASCII line-art diagram, bilingual labels and explanation.
    const systemInstruction =
      "You are an expert A/L science tutor. Build a clear visual diagram for the requested biological " +
      "or physical structure/process using ASCII-art-style text (with box-drawing or label arrows), then " +
      "provide a step-by-step labelling guide and a short function explanation. Use # and ## headings and bullet points.";

    const fallbackInstruction =
      `Create a labelled diagram and explanation for: "${topic}" (A/L Science).\n` +
      (structure ? `Focus structure/process: ${structure}\n` : "") +
      `Write the explanation in ${language}, but write EVERY diagram label in both Sinhala and English ` +
      `(e.g. "දකුණු කර්ණිකාව / Right Atrium").\n` +
      "Format:\n# <Title>\n## Diagram\n<ascii diagram with labels>\n## Labels\n- Part: purpose\n## How it works\n<short explanation>\n";

    try {
      const text = await generateGeminiContent(fallbackInstruction, {
        systemInstruction,
        maxOutputTokens: 4096,
      });
      return NextResponse.json({ image: null, content: toMarkdown(text.split("\n")) });
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
