import type OpenAI from "openai";
import type { AIProvider, AIProviderConfig } from "./types";
import { aiConfig } from "./config";

class OpenAIProvider implements AIProvider {
  private async getClient() {
    if (!aiConfig.apiKey) return null;
    try {
      const { default: OpenAI } = await import("openai");
      return new OpenAI({ apiKey: aiConfig.apiKey });
    } catch {
      return null;
    }
  }

  async chat(
    messages: { role: string; content: string }[],
    overrides?: Partial<AIProviderConfig>,
  ) {
    const client = await this.getClient();
    if (!client) throw new Error("AI provider not configured");

    const response = await client.chat.completions.create({
      model: overrides?.model || aiConfig.model,
      messages: messages as OpenAI.ChatCompletionMessageParam[],
      max_tokens: overrides?.maxTokens || aiConfig.maxTokens,
      temperature: overrides?.temperature ?? aiConfig.temperature,
    });

    const choice = response.choices?.[0];
    const content = choice?.message?.content || "";
    const usage = response.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

    return {
      content,
      usage: {
        promptTokens: usage.prompt_tokens,
        completionTokens: usage.completion_tokens,
        totalTokens: usage.total_tokens,
      },
    };
  }

  async *streamChat(
    messages: { role: string; content: string }[],
    overrides?: Partial<AIProviderConfig>,
  ): AsyncIterable<string> {
    const client = await this.getClient();
    if (!client) throw new Error("AI provider not configured");

    const stream = await client.chat.completions.create({
      model: overrides?.model || aiConfig.model,
      messages: messages as OpenAI.ChatCompletionMessageParam[],
      max_tokens: overrides?.maxTokens || aiConfig.maxTokens,
      temperature: overrides?.temperature ?? aiConfig.temperature,
      stream: true,
    });

    for await (const chunk of stream) {
      const delta = chunk.choices?.[0]?.delta?.content;
      if (delta) yield delta;
    }
  }

  isAvailable(): boolean {
    return Boolean(aiConfig.apiKey);
  }
}

class GeminiProvider implements AIProvider {
  private async getClient() {
    const key = aiConfig.gemini.apiKey;
    if (!key) return null;
    try {
      const { GoogleGenAI } = await import("@google/genai");
      return new GoogleGenAI({ apiKey: key });
    } catch {
      return null;
    }
  }

  private isRetryable(error: unknown): boolean {
    const msg = error instanceof Error ? error.message : String(error);
    return /503|UNAVAILABLE|high demand|temporar.*overloaded|resource_exhausted|429/i.test(msg);
  }

  private async sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private splitMessages(messages: { role: string; content: string }[]) {
    let systemInstruction: string | undefined;
    const contents: { role: string; parts: { text: string }[] }[] = [];
    for (const m of messages) {
      if (m.role === "system") {
        systemInstruction = (systemInstruction ? systemInstruction + "\n" : "") + m.content;
      } else {
        const role = m.role === "assistant" ? "model" : "user";
        contents.push({ role, parts: [{ text: m.content }] });
      }
    }
    return { systemInstruction, contents };
  }

  private modelCandidates(overrides?: Partial<AIProviderConfig>): string[] {
    const base = overrides?.model || aiConfig.gemini.model;
    const fallbacks = [
      "gemini-3.6-flash",
      "gemini-2.5-flash",
      "gemini-2.0-flash",
    ];
    const list: string[] = [];
    for (const m of [base, ...fallbacks]) {
      if (!list.includes(m)) list.push(m);
    }
    return list;
  }

  async chat(
    messages: { role: string; content: string }[],
    overrides?: Partial<AIProviderConfig>,
  ) {
    const client = await this.getClient();
    if (!client) throw new Error("AI provider not configured");

    const { systemInstruction, contents } = this.splitMessages(messages);
    const models = this.modelCandidates(overrides);

    for (const model of models) {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const result = await client.models.generateContent({
            model,
            contents: contents.map((c) => ({ role: c.role, parts: c.parts })) as never,
            config: {
              systemInstruction,
              temperature: overrides?.temperature ?? aiConfig.gemini.temperature,
              maxOutputTokens: overrides?.maxTokens || aiConfig.gemini.maxTokens,
            },
          } as never);
          return {
            content: result.text || "",
            usage: {
              promptTokens: 0,
              completionTokens: 0,
              totalTokens: 0,
            },
          };
        } catch (error) {
          if (!this.isRetryable(error)) break;
          if (attempt === 0) await this.sleep(4000);
        }
      }
    }
    throw new Error("AI generation failed. Please try again later.");
  }

  async *streamChat(
    messages: { role: string; content: string }[],
    overrides?: Partial<AIProviderConfig>,
  ): AsyncIterable<string> {
    const client = await this.getClient();
    if (!client) throw new Error("AI provider not configured");

    const { systemInstruction, contents } = this.splitMessages(messages);
    const models = this.modelCandidates(overrides);

    let stream: AsyncIterable<{ text?: string }>;
    let obtained = false;
    for (const model of models) {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          stream = await client.models.generateContentStream({
            model,
            contents: contents.map((c) => ({ role: c.role, parts: c.parts })) as never,
            config: {
              systemInstruction,
              temperature: overrides?.temperature ?? aiConfig.gemini.temperature,
              maxOutputTokens: overrides?.maxTokens || aiConfig.gemini.maxTokens,
            },
          } as never);
          obtained = true;
          break;
        } catch (error) {
          if (!this.isRetryable(error)) break;
          if (attempt === 0) await this.sleep(4000);
        }
      }
      if (obtained) break;
    }
    if (!obtained) throw new Error("AI generation failed. Please try again later.");

    for await (const chunk of stream!) {
      const text = chunk.text;
      if (text) yield text;
    }
  }

  isAvailable(): boolean {
    return Boolean(aiConfig.gemini.apiKey);
  }
}

class FallbackProvider implements AIProvider {
  private primary: AIProvider;
  private fallback: AIProvider;

  constructor() {
    // Gemini is the primary provider for the AI tutor (always available with a
    // GEMINI_API_KEY and no model lock-in to a paid provider). OpenAI is kept
    // as a fallback for deployments that still configure OPENAI_API_KEY.
    this.primary = new GeminiProvider();
    this.fallback = new OpenAIProvider();
  }

  isAvailable(): boolean {
    return Boolean(this.primary.isAvailable() || this.fallback.isAvailable());
  }

  private isProviderError(error: unknown): boolean {
    const msg = error instanceof Error ? error.message : String(error);
    return (
      /insufficient_quota|quota|billing|429|401|403|no model|not configured|model.*not found|permission_denied|resource_exhausted/i.test(msg)
    );
  }

  async chat(messages: { role: string; content: string }[], overrides?: Partial<AIProviderConfig>) {
    try {
      return await this.primary.chat(messages, overrides);
    } catch (error) {
      if (this.fallback.isAvailable() && this.isProviderError(error)) {
        return this.fallback.chat(messages, overrides);
      }
      throw error;
    }
  }

  async *streamChat(
    messages: { role: string; content: string }[],
    overrides?: Partial<AIProviderConfig>,
  ): AsyncIterable<string> {
    if (this.primary.isAvailable()) {
      try {
        yield* this.primary.streamChat(messages, overrides);
        return;
      } catch (error) {
        if (this.fallback.isAvailable() && this.isProviderError(error)) {
          // try fallback below
        } else {
          throw error;
        }
      }
    }
    if (!this.fallback.isAvailable()) {
      throw new Error("AI provider not configured");
    }
    yield* this.fallback.streamChat(messages, overrides);
  }
}

let providerInstance: AIProvider | null = null;

export function getAIProvider(): AIProvider {
  if (!providerInstance) {
    providerInstance = new FallbackProvider();
  }
  return providerInstance;
}

export { OpenAIProvider, GeminiProvider };
