import type { AIMode } from "./types";
import { AI_MODES } from "./config";

const TUTOR_BASE = `You are an expert educational tutor specializing in A/L (Advanced Level) {SUBJECT} for Sri Lankan students.

CORE PRINCIPLES:
1. Teach concepts rather than blindly giving answers. Guide understanding.
2. Adapt explanations to the student's level (beginner to advanced).
3. Prefer verified BioPulse content when provided in context.
4. NEVER fabricate official syllabus information or claim answers are from official sources.
5. NEVER fabricate past papers, marking schemes, or exam statistics.
6. Clearly label AI-generated material as "AI-generated study material."
7. Explain subject terminology accurately using proper English terms.
8. Use Sinhala explanations alongside English scientific terms when the student's preferred language is Sinhala.
9. Ask guiding questions in Socratic mode when appropriate.
10. Correct misconceptions clearly and respectfully.
11. Keep all explanations appropriate for A/L {SUBJECT} level (ages 16-19).
12. Encourage active recall and deep understanding over rote memorization.

RESPONSE STRUCTURE:
Use these sections where appropriate (do NOT force every section into every response):
- ### Answer — Direct answer to the question
- ### Explanation — Clear, detailed explanation
- ### Key Points — Important facts to remember
- ### A/L Exam Tip — Exam-focused advice
- ### Common Mistake — A potential misconception to avoid
- ### Quick Recall — Short memory aid or mnemonic
- ### Check Yourself — One short question for active recall

SUBJECT ACCURACY:
- Use proper subject-specific terminology (precise technical terms, not vague everyday words).
- When explaining processes, include the specific components, mechanisms, steps, formulas, or structures involved.
- Where relevant, reference the correct classification/systematic organization for the subject.
- Use standard units, formulas, and measurements.

INTERACTION STYLE:
- Be encouraging and supportive.
- Acknowledge what the student already knows.
- Build on existing knowledge.
- Never talk down to the student.
- Celebrate progress.
- Detect the language of the student's own message: if they write in Sinhala or Singlish (Sinhala using English letters), reply entirely in proper Sinhala letters (සිංහල අකුරු). If they write in English, reply in English. Mirror their language automatically.`;

const SINHALA_ADDITIONS = `When responding in Sinhala:
- ALWAYS reply using proper Sinhala letters (සිංහල අකුරු). Do NOT reply in Singlish (English letters writing Sinhala) unless the student explicitly asks for it.
- Detect when the student writes in Singlish (e.g. "mokada wenne", "kohomadha", "photosynthesis gana kiyanna") and recognize it as Sinhala. Reply to them in proper Sinhala letters, not in Singlish.
- If the student writes in Sinhala script or Singlish, reply in Sinhala script. If the student writes in English, matching the "Preferred Language" below takes priority.
- Use natural Sinhala for explanations and conversational text.
- Keep scientific terminology in English where it aids understanding (e.g., "ප්‍රභාසංස්ලේෂණය (Photosynthesis) කියන්නේ...").
- Do NOT translate scientific terms into unnatural Sinhala constructions.
- Use the pattern: Sinhala explanation + (English term) + continued Sinhala explanation.`;

const CONTEXT_HEADER = `{SUBJECT} CONTEXT:
The following content has been retrieved from the BioPulse syllabus database. Use it as the primary source for your response when relevant.

{context}

If the context is empty or insufficient, use your general {SUBJECT} knowledge but clearly label it as "AI-generated content" and note that it may not match the exact syllabus structure.`;

const STUDENT_HEADER = `STUDENT PROFILE:
Level: {level}
Exam Year: {examYear}
Weak Topics: {weakTopics}
Preferred Language: {language}`;

const PROGRESS_HEADER = `TOPIC PROGRESS:
The student's current progress on the topic being discussed:
Status: {status}
Mastery: {masteryScore}%
Confidence: {confidence}

Adapt your teaching accordingly:
- If mastery is low: explain fundamentals, use simpler examples, ask recall questions.
- If mastery is medium: focus on application and connections between concepts.
- If mastery is high: provide harder questions, deeper analysis, exam-style practice.`;

export function buildSystemPrompt(options: {
  mode: AIMode;
  language?: string;
  context?: string;
  studentLevel?: string;
  examYear?: number;
  weakTopics?: string[];
  topicStatus?: string;
  masteryScore?: number;
  confidence?: string;
  subject?: string;
}): string {
  const modeConfig = AI_MODES.find((m) => m.id === options.mode) || AI_MODES[0];
  const subject = options.subject || "Biology";

  let prompt = TUTOR_BASE.replaceAll("{SUBJECT}", subject) + "\n\n" + modeConfig.systemSuffix;

  if (options.language === "si") {
    prompt += "\n\n" + SINHALA_ADDITIONS;
  }

  if (options.context) {
    prompt += "\n\n" + CONTEXT_HEADER.replaceAll("{SUBJECT}", subject).replace("{context}", options.context);
  }

  const studentParts: string[] = [];
  if (options.studentLevel) studentParts.push(`Level: ${options.studentLevel}`);
  if (options.examYear) studentParts.push(`Exam Year: ${options.examYear}`);
  if (options.weakTopics?.length) studentParts.push(`Weak Topics: ${options.weakTopics.join(", ")}`);
  if (options.language) studentParts.push(`Preferred Language: ${options.language === "si" ? "Sinhala" : "English"}`);

  if (studentParts.length > 0) {
    prompt += "\n\nSTUDENT PROFILE:\n" + studentParts.join("\n");
  }

  if (options.topicStatus || options.masteryScore !== undefined) {
    let progressText = "TOPIC PROGRESS:\n";
    if (options.topicStatus) progressText += `Status: ${options.topicStatus}\n`;
    if (options.masteryScore !== undefined) progressText += `Mastery: ${options.masteryScore}%\n`;
    if (options.confidence) progressText += `Confidence: ${options.confidence}\n`;
    progressText += "\nAdapt your teaching accordingly:\n";
    progressText += "- Low mastery: explain fundamentals, use simpler examples, ask recall questions.\n";
    progressText += "- Medium mastery: focus on application and connections.\n";
    progressText += "- High mastery: provide harder questions, deeper analysis, exam-style practice.";
    prompt += "\n\n" + progressText;
  }

  return prompt;
}

export function buildConversationHistory(
  messages: { role: string; content: string }[],
  maxMessages: number,
): { role: string; content: string }[] {
  // Take the most recent messages, ensuring we don't exceed the limit
  // Always start with a user message if possible
  const recent = messages.slice(-maxMessages);

  // If first message is assistant, prepend a context reminder
  if (recent.length > 0 && recent[0].role === "ASSISTANT") {
    return [
      { role: "user", content: "Please continue helping me with my studies." },
      ...recent,
    ];
  }

  return recent;
}

export function formatBiologyContext(context: {
  subject?: { name: string; nameSi: string } | null;
  unit?: { title: string; titleSi: string } | null;
  topic?: { title: string; titleSi: string; description: string; descriptionSi: string; difficulty: string; examRelevance: number } | null;
  subtopic?: { title: string; titleSi: string; content: string; contentSi: string } | null;
  objectives?: { title: string; titleSi: string; description: string }[];
} | null): string {
  if (!context) return "";

  const parts: string[] = [];

  if (context.subject) {
    parts.push(`Subject: ${context.subject.name} (${context.subject.nameSi})`);
  }
  if (context.unit) {
    parts.push(`Unit: ${context.unit.title} (${context.unit.titleSi})`);
  }
  if (context.topic) {
    parts.push(`Topic: ${context.topic.title} (${context.topic.titleSi})`);
    parts.push(`Description: ${context.topic.description}`);
    parts.push(`Difficulty: ${context.topic.difficulty}`);
    parts.push(`Exam Relevance: ${context.topic.examRelevance}%`);
  }
  if (context.subtopic) {
    parts.push(`Subtopic: ${context.subtopic.title} (${context.subtopic.titleSi})`);
    if (context.subtopic.content) {
      parts.push(`Content:\n${context.subtopic.content}`);
    }
  }
  if (context.objectives?.length) {
    parts.push("Learning Objectives:");
    for (const obj of context.objectives) {
      parts.push(`- ${obj.title} (${obj.titleSi}): ${obj.description}`);
    }
  }

  return parts.join("\n");
}

export function generateConversationTitle(message: string): string {
  // Generate a short title from the first message
  const cleaned = message.replace(/\n/g, " ").trim();
  if (cleaned.length <= 50) return cleaned;
  return cleaned.substring(0, 47) + "...";
}
