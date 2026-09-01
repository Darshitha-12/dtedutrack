import { describe, it, expect } from "vitest";
import { chatRequestSchema } from "@/features/ai/validations";
import { AI_MODES, aiConfig } from "@/features/ai/config";
import {
  buildSystemPrompt,
  buildConversationHistory,
  formatBiologyContext,
  generateConversationTitle,
} from "@/features/ai/prompts";
import type { AIStreamChunk } from "@/features/ai/types";

describe("chatRequestSchema", () => {
  it("accepts valid input", () => {
    const result = chatRequestSchema.safeParse({
      message: "What is photosynthesis?",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty message", () => {
    const result = chatRequestSchema.safeParse({ message: "" });
    expect(result.success).toBe(false);
  });

  it("rejects message exceeding 4000 chars", () => {
    const result = chatRequestSchema.safeParse({ message: "x".repeat(4001) });
    expect(result.success).toBe(false);
  });

  it("accepts message with exactly 4000 chars", () => {
    const result = chatRequestSchema.safeParse({ message: "x".repeat(4000) });
    expect(result.success).toBe(true);
  });

  it("accepts whitespace-only message (schema validates min length not content)", () => {
    const result = chatRequestSchema.safeParse({ message: "   " });
    expect(result.success).toBe(true);
  });

  it("rejects invalid mode", () => {
    const result = chatRequestSchema.safeParse({
      message: "Hello",
      mode: "nonexistent",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid language", () => {
    const result = chatRequestSchema.safeParse({
      message: "Hello",
      language: "fr",
    });
    expect(result.success).toBe(false);
  });

  it("accepts optional conversationId as UUID", () => {
    const result = chatRequestSchema.safeParse({
      message: "Hello",
      conversationId: "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid conversationId UUID", () => {
    const result = chatRequestSchema.safeParse({
      message: "Hello",
      conversationId: "not-a-uuid",
    });
    expect(result.success).toBe(false);
  });

  it("accepts conversationId as optional", () => {
    const result = chatRequestSchema.safeParse({ message: "Hello" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.conversationId).toBeUndefined();
    }
  });

  it("applies default mode when not provided", () => {
    const result = chatRequestSchema.safeParse({ message: "Hello" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.mode).toBe("tutor");
    }
  });

  it("applies default language when not provided", () => {
    const result = chatRequestSchema.safeParse({ message: "Hello" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.language).toBe("en");
    }
  });
});

describe("AI_MODES validation", () => {
  it("contains all 9 modes", () => {
    expect(AI_MODES).toHaveLength(9);
  });

  it("all modes have required fields", () => {
    for (const mode of AI_MODES) {
      expect(mode.id).toBeDefined();
      expect(mode.name).toBeDefined();
      expect(mode.nameSi).toBeDefined();
      expect(mode.description).toBeDefined();
      expect(mode.systemSuffix).toBeDefined();
      expect(mode.icon).toBeDefined();
    }
  });

  it("no duplicate IDs", () => {
    const ids = AI_MODES.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("accepts all 9 valid modes in schema", () => {
    const validModes = [
      "tutor", "beginner", "deep", "revision", "socratic",
      "exam", "compare", "quiz", "mistake",
    ];
    for (const mode of validModes) {
      const result = chatRequestSchema.safeParse({
        message: "Hello",
        mode,
      });
      expect(result.success).toBe(true);
    }
  });

  it("each mode has a unique name", () => {
    const names = AI_MODES.map((m) => m.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("each mode has a unique nameSi", () => {
    const namesSi = AI_MODES.map((m) => m.nameSi);
    expect(new Set(namesSi).size).toBe(namesSi.length);
  });
});

describe("buildSystemPrompt", () => {
  it("includes mode-specific suffix", () => {
    const prompt = buildSystemPrompt({ mode: "tutor" });
    expect(prompt).toContain("Provide clear, accurate A/L Biology explanations");
  });

  it("includes beginner mode suffix", () => {
    const prompt = buildSystemPrompt({ mode: "beginner" });
    expect(prompt).toContain("simplest terms possible");
  });

  it("includes Socratic mode instructions", () => {
    const prompt = buildSystemPrompt({ mode: "socratic" });
    expect(prompt).toContain("Do NOT give direct answers");
  });

  it("includes Sinhala additions when language is si", () => {
    const prompt = buildSystemPrompt({ mode: "tutor", language: "si" });
    expect(prompt).toContain("Sinhala");
    expect(prompt).toContain("English scientific terms");
  });

  it("does not include Sinhala additions for English", () => {
    const prompt = buildSystemPrompt({ mode: "tutor", language: "en" });
    expect(prompt).not.toContain("Do NOT translate scientific terms");
  });

  it("includes biology context when provided", () => {
    const prompt = buildSystemPrompt({
      mode: "tutor",
      context: "Photosynthesis converts light energy to chemical energy.",
    });
    expect(prompt).toContain("BIOLOGY CONTEXT:");
    expect(prompt).toContain("Photosynthesis converts light energy to chemical energy.");
  });

  it("includes student profile with level", () => {
    const prompt = buildSystemPrompt({
      mode: "tutor",
      studentLevel: "intermediate",
    });
    expect(prompt).toContain("Level: intermediate");
  });

  it("includes student profile with exam year", () => {
    const prompt = buildSystemPrompt({
      mode: "tutor",
      examYear: 2027,
    });
    expect(prompt).toContain("Exam Year: 2027");
  });

  it("includes weak topics in profile", () => {
    const prompt = buildSystemPrompt({
      mode: "tutor",
      weakTopics: ["genetics", "ecology"],
    });
    expect(prompt).toContain("Weak Topics: genetics, ecology");
  });

  it("includes topic progress when provided", () => {
    const prompt = buildSystemPrompt({
      mode: "tutor",
      topicStatus: "IN_PROGRESS",
      masteryScore: 45,
      confidence: "medium",
    });
    expect(prompt).toContain("TOPIC PROGRESS:");
    expect(prompt).toContain("Status: IN_PROGRESS");
    expect(prompt).toContain("Mastery: 45%");
    expect(prompt).toContain("Confidence: medium");
  });

  it("handles missing optional fields gracefully", () => {
    const prompt = buildSystemPrompt({ mode: "tutor" });
    expect(prompt).toContain("A/L Biology");
    expect(prompt).not.toContain("STUDENT PROFILE:");
    expect(prompt).not.toContain("TOPIC PROGRESS:");
  });

  it("includes exam mode instructions", () => {
    const prompt = buildSystemPrompt({ mode: "exam" });
    expect(prompt).toContain("step by step");
    expect(prompt).toContain("command words");
  });

  it("includes compare mode instructions", () => {
    const prompt = buildSystemPrompt({ mode: "compare" });
    expect(prompt).toContain("Compare and contrast");
  });

  it("includes quiz mode instructions", () => {
    const prompt = buildSystemPrompt({ mode: "quiz" });
    expect(prompt).toContain("Create and administer");
  });

  it("includes mistake mode instructions", () => {
    const prompt = buildSystemPrompt({ mode: "mistake" });
    expect(prompt).toContain("WHY their answer was wrong");
  });

  it("includes revision mode instructions", () => {
    const prompt = buildSystemPrompt({ mode: "revision" });
    expect(prompt).toContain("concise, exam-focused");
  });

  it("includes deep mode instructions", () => {
    const prompt = buildSystemPrompt({ mode: "deep" });
    expect(prompt).toContain("molecular and cellular level");
  });
});

describe("formatBiologyContext", () => {
  it("returns empty string for null", () => {
    expect(formatBiologyContext(null)).toBe("");
  });

  it("formats subject correctly", () => {
    const result = formatBiologyContext({
      subject: { name: "Biology", nameSi: "ජීව විද්‍යාව" },
    });
    expect(result).toContain("Subject: Biology (ජීව විද්‍යාව)");
  });

  it("formats topic with all fields", () => {
    const result = formatBiologyContext({
      topic: {
        title: "Photosynthesis",
        titleSi: "ප්‍රභාසංස්ලේෂණය",
        description: "The process of converting light energy",
        descriptionSi: "ආලෝක ශක්තිය පරිවර්තනය කිරීම",
        difficulty: "intermediate",
        examRelevance: 85,
      },
    });
    expect(result).toContain("Topic: Photosynthesis (ප්‍රභාසංස්ලේෂණය)");
    expect(result).toContain("Description: The process of converting light energy");
    expect(result).toContain("Difficulty: intermediate");
    expect(result).toContain("Exam Relevance: 85%");
  });

  it("formats subtopic with content", () => {
    const result = formatBiologyContext({
      subtopic: {
        title: "Light Reactions",
        titleSi: "ආලෝක ප්‍රතික්‍රියා",
        content: "Chlorophyll absorbs light energy...",
        contentSi: "ක්ලෝරොෆිල් ආලෝක ශක්තිය අවශෝෂණය කරයි...",
      },
    });
    expect(result).toContain("Subtopic: Light Reactions (ආලෝක ප්‍රතික්‍රියා)");
    expect(result).toContain("Content:");
    expect(result).toContain("Chlorophyll absorbs light energy...");
  });

  it("formats learning objectives", () => {
    const result = formatBiologyContext({
      objectives: [
        {
          title: "Describe the light reactions",
          titleSi: "ආලෝක ප්‍රතික්‍රියා විස්තර කරන්න",
          description: "Explain how chlorophyll captures light energy",
        },
      ],
    });
    expect(result).toContain("Learning Objectives:");
    expect(result).toContain("- Describe the light reactions (ආලෝක ප්‍රතික්‍රියා විස්තර කරන්න): Explain how chlorophyll captures light energy");
  });

  it("handles partial context with only some fields", () => {
    const result = formatBiologyContext({
      subject: { name: "Biology", nameSi: "ජීව විද්‍යාව" },
    });
    expect(result).toContain("Subject:");
    expect(result).not.toContain("Unit:");
    expect(result).not.toContain("Topic:");
  });

  it("formats unit correctly", () => {
    const result = formatBiologyContext({
      unit: { title: "Plant Physiology", titleSi: "ශාක ක්‍රියාකාරකම්" },
    });
    expect(result).toContain("Unit: Plant Physiology (ශාක ක්‍රියාකාරකම්)");
  });

  it("handles empty context object", () => {
    const result = formatBiologyContext({});
    expect(result).toBe("");
  });

  it("formats multiple objectives", () => {
    const result = formatBiologyContext({
      objectives: [
        { title: "Obj 1", titleSi: "Obj 1 si", description: "Desc 1" },
        { title: "Obj 2", titleSi: "Obj 2 si", description: "Desc 2" },
      ],
    });
    expect(result).toContain("- Obj 1 (Obj 1 si): Desc 1");
    expect(result).toContain("- Obj 2 (Obj 2 si): Desc 2");
  });

  it("omits subtopic content when empty", () => {
    const result = formatBiologyContext({
      subtopic: {
        title: "Empty Topic",
        titleSi: "හිස්",
        content: "",
        contentSi: "",
      },
    });
    expect(result).toContain("Subtopic:");
    expect(result).not.toContain("Content:");
  });
});

describe("buildConversationHistory", () => {
  it("respects max limit", () => {
    const messages = Array.from({ length: 10 }, (_, i) => ({
      role: i % 2 === 0 ? "user" : "assistant",
      content: `Message ${i}`,
    }));
    const result = buildConversationHistory(messages, 3);
    expect(result).toHaveLength(3);
    expect(result[0].content).toBe("Message 7");
  });

  it("prepends context reminder when first message is assistant", () => {
    const messages = [
      { role: "ASSISTANT", content: "Hello!" },
      { role: "user", content: "Tell me about cells" },
    ];
    const result = buildConversationHistory(messages, 10);
    expect(result.length).toBe(3);
    expect(result[0].content).toContain("continue helping me");
    expect(result[0].role).toBe("user");
  });

  it("handles empty array", () => {
    const result = buildConversationHistory([], 10);
    expect(result).toEqual([]);
  });

  it("does not prepend when first message is user", () => {
    const messages = [
      { role: "user", content: "Hello" },
      { role: "ASSISTANT", content: "Hi there" },
    ];
    const result = buildConversationHistory(messages, 10);
    expect(result).toHaveLength(2);
    expect(result[0].content).toBe("Hello");
  });

  it("returns all messages when under limit", () => {
    const messages = [
      { role: "user", content: "A" },
      { role: "assistant", content: "B" },
    ];
    const result = buildConversationHistory(messages, 5);
    expect(result).toHaveLength(2);
  });
});

describe("generateConversationTitle", () => {
  it("keeps short messages as-is", () => {
    const result = generateConversationTitle("What is DNA?");
    expect(result).toBe("What is DNA?");
  });

  it("truncates long messages with ellipsis", () => {
    const longMsg = "A".repeat(60);
    const result = generateConversationTitle(longMsg);
    expect(result.length).toBe(50);
    expect(result).toContain("...");
  });

  it("keeps message at exactly 50 chars", () => {
    const msg = "A".repeat(50);
    const result = generateConversationTitle(msg);
    expect(result).toBe(msg);
  });

  it("cleans newlines", () => {
    const result = generateConversationTitle("What is\nphotosynthesis?");
    expect(result).toBe("What is photosynthesis?");
  });

  it("trims leading and trailing whitespace", () => {
    const result = generateConversationTitle("  Hello world  ");
    expect(result).toBe("Hello world");
  });
});

describe("aiConfig", () => {
  it("has expected configuration fields", () => {
    expect(aiConfig).toHaveProperty("model");
    expect(aiConfig).toHaveProperty("maxTokens");
    expect(aiConfig).toHaveProperty("temperature");
    expect(aiConfig).toHaveProperty("maxContextTokens");
    expect(aiConfig).toHaveProperty("maxMessageLength");
    expect(aiConfig).toHaveProperty("maxConversationHistory");
    expect(aiConfig).toHaveProperty("rateLimitPerMinute");
    expect(aiConfig).toHaveProperty("isAvailable");
  });

  it("returns false for isAvailable when no API key", () => {
    const original = aiConfig.apiKey;
    Object.defineProperty(aiConfig, "apiKey", { value: "", configurable: true });
    expect(aiConfig.isAvailable).toBe(false);
    Object.defineProperty(aiConfig, "apiKey", { value: original, configurable: true });
  });
});

describe("AIStreamChunk type shape", () => {
  it("token chunk has correct shape", () => {
    const chunk: AIStreamChunk = { type: "token", content: "Hello" };
    expect(chunk.type).toBe("token");
    expect(chunk.content).toBe("Hello");
  });

  it("done chunk has correct shape", () => {
    const chunk: AIStreamChunk = { type: "done", messageId: "msg-123" };
    expect(chunk.type).toBe("done");
    expect(chunk.messageId).toBe("msg-123");
  });

  it("error chunk has correct shape", () => {
    const chunk: AIStreamChunk = { type: "error", error: "Something went wrong" };
    expect(chunk.type).toBe("error");
    expect(chunk.error).toBe("Something went wrong");
  });

  it("metadata chunk has correct shape", () => {
    const chunk: AIStreamChunk = { type: "metadata", conversationId: "conv-123" };
    expect(chunk.type).toBe("metadata");
    expect(chunk.conversationId).toBe("conv-123");
  });
});
