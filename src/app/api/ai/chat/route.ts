import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { chatRequestSchema } from "@/features/ai/validations";
import { aiService } from "@/features/ai/service";
import { aiConfig } from "@/features/ai/config";

export async function POST(req: Request) {
  try {
    // 1. Authenticate
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = session.user.id;

    // 2. Check AI availability
    if (!aiConfig.isAvailable) {
      return NextResponse.json(
        { error: "AI Tutor is currently unavailable. Configure GEMINI_API_KEY (or OPENAI_API_KEY) to enable it." },
        { status: 503 },
      );
    }

    // 3. Validate request
    const body = await req.json();
    const parsed = chatRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    // 4. Check streaming
    const acceptHeader = req.headers.get("accept");
    const isStreaming = acceptHeader?.includes("text/event-stream");

    if (isStreaming) {
      // Return SSE stream
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          try {
            for await (const chunk of aiService.streamChat(userId, parsed.data)) {
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`),
              );
            }
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          } catch (error) {
            const errorChunk = {
              type: "error" as const,
              error: error instanceof Error ? error.message : "Unknown error",
            };
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(errorChunk)}\n\n`),
            );
          } finally {
            controller.close();
          }
        },
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    }

    // 5. Non-streaming chat
    const response = await aiService.chat(userId, parsed.data);
    return NextResponse.json(response);
  } catch (error) {
    console.error("AI chat error:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
