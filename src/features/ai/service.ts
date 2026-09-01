import { db } from "@/lib/db";
import { getAIProvider } from "./provider";
import { aiConfig } from "./config";
import { buildSystemPrompt, buildConversationHistory, formatBiologyContext, generateConversationTitle } from "./prompts";
import { getBiologyContext } from "@/features/content/service";
import { toUserFacingError, toDiagnostic } from "./errors";
import type { AIMode, AIChatRequest, AIChatResponse, AIStreamChunk, ConversationSummary, ChatMessage } from "./types";

export class AIService {
  async chat(
    userId: string,
    request: AIChatRequest,
  ): Promise<AIChatResponse> {
    const provider = getAIProvider();
    if (!provider.isAvailable()) {
      throw new Error("AI Tutor is currently unavailable. Please check that OPENAI_API_KEY or GEMINI_API_KEY is configured.");
    }

    // Validate message length
    if (request.message.length > aiConfig.maxMessageLength) {
      throw new Error(`Message too long. Maximum ${aiConfig.maxMessageLength} characters.`);
    }

    // Load or create conversation
    let conversationId = request.conversationId;
    let conversation;

    if (conversationId) {
      conversation = await db.conversation.findUnique({ where: { id: conversationId } });
      if (!conversation || conversation.userId !== userId) {
        throw new Error("Conversation not found");
      }
    } else {
      conversation = await db.conversation.create({
        data: {
          userId,
          title: generateConversationTitle(request.message),
        },
      });
      conversationId = conversation.id;
    }

    // Get conversation history
    const historyMessages = await db.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: "asc" },
      take: aiConfig.maxConversationHistory,
    });

    // Build biology context
    let biologyContext = "";
    if (request.topicId || request.subtopicId) {
      // Retrieve context based on provided IDs
      // We need to look up the subject slug from the topic
      if (request.topicId) {
        const topic = await db.contentTopic.findUnique({
          where: { id: request.topicId },
          include: { unit: { include: { subject: true } } },
        });
        if (topic) {
          const context = await getBiologyContext(
            topic.unit.subject.slug,
            topic.slug,
            request.subtopicId ? undefined : undefined,
          );
          biologyContext = formatBiologyContext(context);
        }
      }
    }

    // Get student profile for context
    const profile = await db.studentProfile.findUnique({ where: { userId } });

    // Get topic progress if available
    let topicProgress = null;
    if (request.topicId) {
      topicProgress = await db.userTopicProgress.findFirst({
        where: { userId, topicId: request.topicId },
      });
    }

    // Build system prompt
    const systemPrompt = buildSystemPrompt({
      mode: request.mode || "tutor",
      language: request.language || profile?.language || "en",
      context: biologyContext || undefined,
      studentLevel: profile?.currentLevel || undefined,
      examYear: profile?.examYear || undefined,
      weakTopics: profile?.weakTopics || undefined,
      topicStatus: topicProgress?.status || undefined,
      masteryScore: topicProgress?.masteryScore || undefined,
      confidence: topicProgress?.confidence || undefined,
    });

    // Build messages array
    const conversationHistory = buildConversationHistory(
      historyMessages.map((m) => ({ role: m.role, content: m.content })),
      aiConfig.maxConversationHistory,
    );

    const messages = [
      { role: "system", content: systemPrompt },
      ...conversationHistory,
      { role: "user", content: request.message },
    ];

    // Call AI provider
    const startTime = Date.now();
    let result;
    try {
      result = await provider.chat(messages);
    } catch (error) {
      // Track failed usage
      console.error("[AI-CHAT]", toDiagnostic(error));
      await this.trackUsage(userId, "gemini", aiConfig.gemini.model, 0, Date.now() - startTime, false, String(error));
      throw new Error(toUserFacingError(error));
    }

    const duration = Date.now() - startTime;

    // Persist messages
    const userMessage = await db.message.create({
      data: {
        conversationId,
        role: "USER",
        content: request.message,
      },
    });

    const assistantMessage = await db.message.create({
      data: {
        conversationId,
        role: "ASSISTANT",
        content: result.content,
      },
    });

    // Update conversation timestamp
    await db.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    });

    // Track usage
    await this.trackUsage(
      userId,
      "gemini",
      aiConfig.gemini.model,
      result.usage.totalTokens,
      duration,
      true,
    );

    return {
      conversationId,
      messageId: assistantMessage.id,
      content: result.content,
      mode: request.mode || "tutor",
    };
  }

  async *streamChat(
    userId: string,
    request: AIChatRequest,
  ): AsyncIterable<AIStreamChunk> {
    const provider = getAIProvider();
    if (!provider.isAvailable()) {
      yield { type: "error", error: "AI Tutor is currently unavailable. Please check that OPENAI_API_KEY or GEMINI_API_KEY is configured." };
      return;
    }

    if (request.message.length > aiConfig.maxMessageLength) {
      yield { type: "error", error: `Message too long. Maximum ${aiConfig.maxMessageLength} characters.` };
      return;
    }

    // Load or create conversation
    let conversationId = request.conversationId;
    let conversation;

    if (conversationId) {
      conversation = await db.conversation.findUnique({ where: { id: conversationId } });
      if (!conversation || conversation.userId !== userId) {
        yield { type: "error", error: "Conversation not found" };
        return;
      }
    } else {
      conversation = await db.conversation.create({
        data: {
          userId,
          title: generateConversationTitle(request.message),
        },
      });
      conversationId = conversation.id;
    }

    yield { type: "metadata", conversationId };

    // Get conversation history
    const historyMessages = await db.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: "asc" },
      take: aiConfig.maxConversationHistory,
    });

    // Build context
    let biologyContext = "";
    if (request.topicId) {
      const topic = await db.contentTopic.findUnique({
        where: { id: request.topicId },
        include: { unit: { include: { subject: true } } },
      });
      if (topic) {
        const context = await getBiologyContext(topic.unit.subject.slug, topic.slug);
        biologyContext = formatBiologyContext(context);
      }
    }

    const profile = await db.studentProfile.findUnique({ where: { userId } });

    let topicProgress = null;
    if (request.topicId) {
      topicProgress = await db.userTopicProgress.findFirst({
        where: { userId, topicId: request.topicId },
      });
    }

    const systemPrompt = buildSystemPrompt({
      mode: request.mode || "tutor",
      language: request.language || profile?.language || "en",
      context: biologyContext || undefined,
      studentLevel: profile?.currentLevel || undefined,
      examYear: profile?.examYear || undefined,
      weakTopics: profile?.weakTopics || undefined,
      topicStatus: topicProgress?.status || undefined,
      masteryScore: topicProgress?.masteryScore || undefined,
      confidence: topicProgress?.confidence || undefined,
    });

    const conversationHistory = buildConversationHistory(
      historyMessages.map((m) => ({ role: m.role, content: m.content })),
      aiConfig.maxConversationHistory,
    );

    const messages = [
      { role: "system", content: systemPrompt },
      ...conversationHistory,
      { role: "user", content: request.message },
    ];

    // Persist user message immediately
    const userMessage = await db.message.create({
      data: {
        conversationId,
        role: "USER",
        content: request.message,
      },
    });

    // Stream response
    const startTime = Date.now();
    let fullContent = "";

    try {
      for await (const token of provider.streamChat(messages)) {
        fullContent += token;
        yield { type: "token", content: token };
      }
    } catch (error) {
      console.error("[AI-STREAM]", toDiagnostic(error));
      yield { type: "error", error: toUserFacingError(error) };
      await this.trackUsage(userId, "gemini", aiConfig.gemini.model, 0, Date.now() - startTime, false, String(error));
      return;
    }

    // Persist assistant response
    const assistantMessage = await db.message.create({
      data: {
        conversationId,
        role: "ASSISTANT",
        content: fullContent,
      },
    });

    // Update conversation
    await db.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    });

    await this.trackUsage(userId, "gemini", aiConfig.gemini.model, 0, Date.now() - startTime, true);

    yield { type: "done", messageId: assistantMessage.id };
  }

  async getConversations(userId: string): Promise<ConversationSummary[]> {
    const conversations = await db.conversation.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
      include: { _count: { select: { messages: true } } },
    });

    return conversations.map((c) => ({
      id: c.id,
      title: c.title,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      messageCount: c._count.messages,
    }));
  }

  async getConversationMessages(userId: string, conversationId: string): Promise<ChatMessage[]> {
    const conversation = await db.conversation.findUnique({ where: { id: conversationId } });
    if (!conversation || conversation.userId !== userId) {
      throw new Error("Conversation not found");
    }

    const messages = await db.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: "asc" },
    });

    return messages.map((m) => ({
      id: m.id,
      role: m.role as "USER" | "ASSISTANT" | "SYSTEM",
      content: m.content,
      createdAt: m.createdAt,
    }));
  }

  async deleteConversation(userId: string, conversationId: string): Promise<void> {
    const conversation = await db.conversation.findUnique({ where: { id: conversationId } });
    if (!conversation || conversation.userId !== userId) {
      throw new Error("Conversation not found");
    }

    await db.conversation.delete({ where: { id: conversationId } });
  }

  async updateConversationTitle(userId: string, conversationId: string, title: string): Promise<void> {
    const conversation = await db.conversation.findUnique({ where: { id: conversationId } });
    if (!conversation || conversation.userId !== userId) {
      throw new Error("Conversation not found");
    }

    await db.conversation.update({
      where: { id: conversationId },
      data: { title: title.slice(0, 200) },
    });
  }

  private async trackUsage(
    userId: string,
    provider: string,
    model: string,
    tokens: number,
    durationMs: number,
    success: boolean,
    errorMessage?: string,
  ): Promise<void> {
    try {
      await db.aIUsage.create({
        data: {
          userId,
          provider,
          model,
          totalTokens: tokens,
          durationMs,
          success,
          errorMessage: errorMessage || null,
        },
      });
    } catch {
      // Usage tracking should never fail the main operation
    }
  }
}

export const aiService = new AIService();
