export const config = {
  app: {
    name: "BioPulse",
    title: "BioPulse · Biology AI Study Platform",
    description: "Complete A/L Biology study management with AI coaching",
    url: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
  },
  ai: {
    apiKey: process.env.OPENAI_API_KEY || "",
    model: process.env.AI_MODEL || "gpt-4o-mini",
    maxTokens: parseInt(process.env.AI_MAX_TOKENS || "2048", 10),
    temperature: parseFloat(process.env.AI_TEMPERATURE || "0.7"),
    maxContextTokens: parseInt(process.env.AI_MAX_CONTEXT || "8000", 10),
    maxMessageLength: parseInt(process.env.AI_MAX_MESSAGE_LENGTH || "4000", 10),
    maxConversationHistory: parseInt(process.env.AI_MAX_HISTORY || "20", 10),
    rateLimitPerMinute: parseInt(process.env.AI_RATE_LIMIT || "20", 10),
    provider: process.env.AI_PROVIDER || "openai",
  },
  gemini: {
    apiKey: process.env.GEMINI_API_KEY || "",
    model: process.env.GEMINI_MODEL || "gemini-3.6-flash",
    maxTokens: parseInt(process.env.AI_MAX_TOKENS || "2048", 10),
    temperature: parseFloat(process.env.AI_TEMPERATURE || "0.7"),
  },
  auth: {
    secret: process.env.AUTH_SECRET || "",
    url: process.env.NEXTAUTH_URL || "http://localhost:3000",
  },
  notifications: {
    telegram: {
      token: process.env.TELEGRAM_BOT_TOKEN || "",
      chatId: process.env.TELEGRAM_CHAT_ID || "",
    },
    ntfy: {
      topic: process.env.NTFY_TOPIC || "",
    },
  },
} as const;
