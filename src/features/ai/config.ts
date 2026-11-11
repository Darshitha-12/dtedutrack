import { config } from "@/config";
import type { AIModeConfig } from "./types";

export const aiConfig = {
  get apiKey() { return config.ai.apiKey; },
  get model() { return config.ai.model; },
  get maxTokens() { return config.ai.maxTokens; },
  get temperature() { return config.ai.temperature; },
  get maxContextTokens() { return config.ai.maxContextTokens; },
  get maxMessageLength() { return config.ai.maxMessageLength; },
  get maxConversationHistory() { return config.ai.maxConversationHistory; },
  get rateLimitPerMinute() { return config.ai.rateLimitPerMinute; },
  get isAvailable() { return Boolean(config.gemini.apiKey || config.ai.apiKey); },
  get gemini() {
    return {
      apiKey: config.gemini.apiKey,
      model: config.gemini.model,
      maxTokens: config.gemini.maxTokens,
      temperature: config.gemini.temperature,
    };
  },
};

export const AI_MODES: AIModeConfig[] = [
  {
    id: "tutor",
    name: "A/L Tutor",
    nameSi: "A/L ගුරුවරයා",
    description: "Standard A/L Biology tutor mode",
    systemSuffix: "Provide clear, accurate A/L Biology explanations. Adapt to the student's level. Use proper scientific terminology.",
    icon: "🎓",
  },
  {
    id: "beginner",
    name: "Beginner",
    nameSi: "ආරම්භක",
    description: "Simplified explanations for beginners",
    systemSuffix: "Explain concepts in the simplest terms possible. Use everyday analogies. Avoid jargon unless you explain it. Build understanding from the ground up.",
    icon: "🌱",
  },
  {
    id: "deep",
    name: "Deep Explanation",
    nameSi: "ගැඹුරු පැහැදිලි කිරීම",
    description: "In-depth molecular and cellular level explanations",
    systemSuffix: "Provide deep, detailed explanations at the molecular and cellular level. Include biochemical pathways, thermodynamic principles, and evolutionary context. Reference specific enzymes, genes, and regulatory mechanisms.",
    icon: "🔬",
  },
  {
    id: "revision",
    name: "Quick Revision",
    nameSi: "ඉක්මන් සමාලෝචනය",
    description: "Concise revision notes and key facts",
    systemSuffix: "Provide concise, exam-focused revision content. Use bullet points, numbered lists, and tables. Highlight key definitions, processes, and comparisons. Focus on high-exam-relevance topics.",
    icon: "📝",
  },
  {
    id: "socratic",
    name: "Socratic Tutor",
    nameSi: "සොක්රටික් ගුරුවරයා",
    description: "Guided questioning to build understanding",
    systemSuffix: "Do NOT give direct answers. Instead, ask guiding questions to help the student discover the answer themselves. Use the Socratic method. Start with what they already know. Guide them step by step. Only reveal the full answer after they've worked through it, or if they explicitly ask.",
    icon: "❓",
  },
  {
    id: "exam",
    name: "Exam Question Solver",
    nameSi: "විභාග ප්‍රශ්න විසඳුම",
    description: "Structured approach to exam-style questions",
    systemSuffix: "Solve exam-style Biology questions step by step. Show the reasoning process. Identify command words (describe, explain, compare, evaluate). Structure answers according to mark scheme expectations. Highlight where marks are awarded.",
    icon: "📋",
  },
  {
    id: "compare",
    name: "Compare Concepts",
    nameSi: "සංසන්දනය",
    description: "Side-by-side concept comparison",
    systemSuffix: "Compare and contrast Biology concepts using structured tables and clear distinctions. Highlight similarities, differences, and common misconceptions. Use parallel structure for clarity.",
    icon: "⚖️",
  },
  {
    id: "quiz",
    name: "Quiz Me",
    nameSi: "ප්‍රශ්නාඝෝෂණය",
    description: "Interactive quiz with feedback",
    systemSuffix: "Create and administer Biology quizzes. Ask one question at a time. Wait for the student's answer before proceeding. Provide immediate feedback with explanations. Track their performance. Vary difficulty. Focus on their weak areas.",
    icon: "🎯",
  },
  {
    id: "mistake",
    name: "Explain My Mistake",
    nameSi: "වැරැද්ද පැහැදිලි කරන්න",
    description: "Analyze and explain mistakes",
    systemSuffix: "The student will share a question they got wrong or a misconception. Help them understand WHY their answer was wrong. Explain the correct concept clearly. Identify the specific misconception. Provide a similar practice question.",
    icon: "🔍",
  },
];
