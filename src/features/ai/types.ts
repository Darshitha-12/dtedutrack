export type AIRole = "USER" | "ASSISTANT" | "SYSTEM";

export type AIMode =
  | "tutor"
  | "beginner"
  | "deep"
  | "revision"
  | "socratic"
  | "exam"
  | "compare"
  | "quiz"
  | "mistake";

export interface AIModeConfig {
  id: AIMode;
  name: string;
  nameSi: string;
  description: string;
  systemSuffix: string;
  icon: string;
}

export interface ChatMessage {
  id: string;
  role: AIRole;
  content: string;
  createdAt: Date;
}

export interface ConversationSummary {
  id: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
  messageCount: number;
}

export interface AIChatRequest {
  conversationId?: string;
  message: string;
  topicId?: string;
  subtopicId?: string;
  mode?: AIMode;
  language?: "en" | "si";
  subjectId?: string;
}

export interface AIChatResponse {
  conversationId: string;
  messageId: string;
  content: string;
  mode: AIMode;
}

export interface AIStreamChunk {
  type: "token" | "done" | "error" | "metadata";
  content?: string;
  conversationId?: string;
  messageId?: string;
  error?: string;
}

export interface AIProviderConfig {
  apiKey: string;
  model: string;
  maxTokens: number;
  temperature: number;
}

export interface AITokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface AIProviderResult {
  content: string;
  usage: AITokenUsage;
}

export interface AIProvider {
  chat(messages: { role: string; content: string }[], config?: Partial<AIProviderConfig>): Promise<AIProviderResult>;
  streamChat(messages: { role: string; content: string }[], config?: Partial<AIProviderConfig>): AsyncIterable<string>;
  isAvailable(): boolean;
}
