# AI Tutor Architecture

This document describes the architecture of BioPulse's AI Tutor feature, covering provider abstraction, conversation management, prompt engineering, streaming, security, and usage tracking.

---

## Provider Architecture

The AI system uses an abstract provider interface to decouple the application from any specific AI vendor.

### Abstract Interface

```ts
interface AIProvider {
  chat(messages: Message[], config?: Partial<AIProviderConfig>): Promise<AIProviderResult>;
  streamChat(messages: Message[], config?: Partial<AIProviderConfig>): AsyncIterable<string>;
  isAvailable(): boolean;
}
```

Every provider must implement:
- `chat()` — non-streaming completion
- `streamChat()` — token-by-token async generator
- `isAvailable()` — runtime check for configuration

### OpenAIProvider Implementation

The default provider (`src/features/ai/provider.ts`) wraps the OpenAI SDK:

1. `getClient()` dynamically `require()`s the `openai` module at runtime
2. If the SDK is not installed or the API key is missing, returns `null`
3. `chat()` calls `client.chat.completions.create()` with standard options
4. `streamChat()` uses `stream: true` and yields `delta.content` from each chunk
5. Returns token usage metrics (prompt, completion, total)

### Dynamic Import

The OpenAI SDK is loaded via CommonJS `require()` inside a try/catch:

```ts
const OpenAI = require("openai");
return new OpenAI.default({ apiKey: aiConfig.apiKey });
```

This prevents build failures when the SDK is not installed (e.g., CI environments, frontend-only bundles). The provider gracefully degrades — `isAvailable()` returns `false` and all requests get a 503 response.

### Singleton Pattern

A module-level `providerInstance` ensures a single provider instance is reused across requests.

### Environment-Based Configuration

All settings come from environment variables with sensible defaults:

| Variable | Default | Description |
|---|---|---|
| `OPENAI_API_KEY` | `""` | API key (empty = disabled) |
| `AI_MODEL` | `gpt-4o-mini` | Model identifier |
| `AI_MAX_TOKENS` | `2048` | Max completion tokens |
| `AI_TEMPERATURE` | `0.7` | Sampling temperature |
| `AI_MAX_CONTEXT` | `8000` | Max context window tokens |
| `AI_MAX_MESSAGE_LENGTH` | `4000` | Max chars per user message |
| `AI_MAX_HISTORY` | `20` | Max conversation messages sent |
| `AI_RATE_LIMIT` | `20` | Max requests per minute per user |

---

## Conversation Architecture

### Conversation Model

```
Conversation
  id          String (UUID)
  userId      String (FK → User)
  title       String (auto-generated, editable)
  createdAt   DateTime
  updatedAt   DateTime (touched on each message)
  messages    Message[]
```

- Created automatically on first message in a new conversation
- Title is auto-generated from the first message (truncated to 50 chars)
- `updatedAt` is bumped on each exchange for ordering by recency

### Message Model

```
Message
  id             String (UUID)
  conversationId String (FK → Conversation, onDelete: Cascade)
  role           String ("USER" | "ASSISTANT" | "SYSTEM")
  content        Text
  createdAt      DateTime
```

- Messages are stored in insertion order
- `content` uses the Prisma `Text` type for unlimited length
- Indexed on `(conversationId, createdAt)` for efficient history loading

### Ownership Verification

Every conversation access performs a userId check:

```ts
const conversation = await db.conversation.findUnique({ where: { id: conversationId } });
if (!conversation || conversation.userId !== userId) {
  throw new Error("Conversation not found");
}
```

This prevents users from accessing, modifying, or deleting other users' conversations.

### Cascade Deletes

Deleting a `Conversation` cascades to all child `Message` records via the Prisma `onDelete: Cascade` relation.

---

## Message Architecture

### Roles

| Role | Source | Purpose |
|---|---|---|
| `USER` | Client input | Student's typed message |
| `ASSISTANT` | AI provider response | Generated tutor reply |
| `SYSTEM` | Server only | System prompt (never persisted) |

### SYSTEM Message Rules

- SYSTEM messages are constructed server-side and never accepted from client input
- They contain the system prompt with mode instructions, biology context, and student profile
- They are prepended to the messages array sent to the provider
- They are never stored in the database

### Timestamp Ordering

Messages are loaded in `createdAt: "asc"` order to maintain conversation flow. The database index `(conversationId, createdAt)` supports this pattern efficiently.

### Content Storage

All message content is stored verbatim. The AI response is captured in full before persistence, ensuring no partial responses are saved. For streaming, the accumulated content is persisted only after the stream completes.

---

## Context Retrieval

The AI Tutor provides context-aware responses by retrieving relevant biology content from the database.

### BiologyContext Integration

When a `topicId` is provided, the service:

1. Looks up the `ContentTopic` with its parent unit and subject
2. Calls `getBiologyContext()` to retrieve structured content
3. Formats it via `formatBiologyContext()` into a text block
4. Injects it into the system prompt under `BIOLOGY CONTEXT`

### formatBiologyContext Output

The formatter assembles a structured text block from the context object:

- **Subject**: name and Sinhala name
- **Unit**: title and Sinhala title
- **Topic**: title, description, difficulty, exam relevance percentage
- **Subtopic**: title and full markdown content
- **Learning Objectives**: numbered list with titles and descriptions

Any missing field is simply omitted, so partial context works correctly.

### Student Profile Context

If a `StudentProfile` exists for the user, the following is included in the system prompt:

- **Current Level**: beginner, intermediate, or advanced
- **Exam Year**: the student's target exam year
- **Weak Topics**: list of topics the student struggles with
- **Preferred Language**: English or Sinhala

### Topic Progress Context

If the student has progress on the requested topic:

- **Status**: NOT_STARTED, IN_PROGRESS, REVIEW, or MASTERED
- **Mastery Score**: 0–100 percentage
- **Confidence**: low, medium, or high

The prompt instructs the AI to adapt its teaching:
- Low mastery → fundamentals, simpler examples, recall questions
- Medium mastery → application, concept connections
- High mastery → harder questions, deeper analysis, exam-style practice

### Context Window Management

The system respects `AI_MAX_CONTEXT` (default 8000 tokens). Conversation history is capped at `AI_MAX_HISTORY` (default 20 messages). Only the most recent messages are included, sliced from the end of the history array.

---

## Student Context

### Data Sent to Provider

Only the following non-identifying fields are included:

- Language preference (en/si)
- Current academic level
- Target exam year
- Weak topic names (strings, not IDs)
- Topic mastery percentage

### Privacy Principles

- No userId, email, name, or identifying information is sent to the AI provider
- Student profile data is optional — if missing, the prompt works without it
- Weak topics are sent as display names, not database IDs
- The system prompt explicitly labels AI-generated content as such

---

## Prompt Architecture

### System Prompt Construction

`buildSystemPrompt()` assembles the full system message from components:

```
[BIOLOGY_TUTOR_BASE]
[MODE_SUFFIX]
[SINHALA_ADDITIONS] (if si)
[BIOLOGY_CONTEXT] (if context available)
[STUDENT_PROFILE] (if profile data exists)
[TOPIC_PROGRESS] (if progress data exists)
```

### Base Instructions

The base prompt establishes the AI's identity as an A/L Biology tutor with 12 core principles:

1. Teach concepts, not just answers
2. Adapt to student level
3. Prefer verified BioPulse content
4. Never fabricate official syllabus information
5. Never fabricate past papers or marking schemes
6. Label AI-generated material
7. Use proper scientific terminology
8. Support Sinhala alongside English
9. Use Socratic questioning when appropriate
10. Correct misconceptions respectfully
11. Keep content age-appropriate (16–19)
12. Encourage active recall

### Response Structure

The prompt defines optional response sections:
- `### Answer` — Direct answer
- `### Explanation` — Detailed explanation
- `### Key Points` — Important facts
- `### A/L Exam Tip` — Exam-focused advice
- `### Common Mistake` — Misconception to avoid
- `### Quick Recall` — Memory aid or mnemonic
- `### Check Yourself` — Active recall question

### Mode-Specific Suffixes

Each mode appends unique behavioral instructions to the base prompt. For example:

- **Socratic**: "Do NOT give direct answers. Instead, ask guiding questions..."
- **Exam**: "Solve exam-style Biology questions step by step..."
- **Quiz**: "Create and administer Biology quizzes. Ask one question at a time..."
- **Mistake**: "Help them understand WHY their answer was wrong..."

### Sinhala Additions

When `language: "si"`, an additional block is appended:

- Use natural Sinhala for explanations
- Keep scientific terms in English
- Pattern: Sinhala explanation + (English term) + continued Sinhala

### Conversation History Management

`buildConversationHistory()`:

1. Takes the last N messages (configurable, default 20)
2. If the first message in the window is from the assistant, prepends a context-reminder user message
3. This ensures the conversation always alternates properly

---

## AI Modes

All 9 modes are defined in `AI_MODES` array in `src/features/ai/config.ts`:

| ID | Name | Description |
|---|---|---|
| `tutor` | A/L Tutor | Standard A/L Biology tutoring |
| `beginner` | Beginner | Simplified explanations with analogies |
| `deep` | Deep Explanation | Molecular and cellular level detail |
| `revision` | Quick Revision | Concise bullet points and key facts |
| `socratic` | Socratic Tutor | Guided questioning, no direct answers |
| `exam` | Exam Question Solver | Step-by-step exam question approach |
| `compare` | Compare Concepts | Side-by-side concept comparison tables |
| `quiz` | Quiz Me | Interactive quiz with feedback |
| `mistake` | Explain My Mistake | Analyze wrong answers and misconceptions |

Each mode config includes:
- `id` — unique identifier
- `name` / `nameSi` — display names in English and Sinhala
- `description` — short description
- `systemSuffix` — prompt suffix appended to the base instructions
- `icon` — emoji icon for UI display

---

## Streaming

### Server-Sent Events (SSE)

The streaming endpoint (`streamChat` in `AIService`) uses async generators to yield `AIStreamChunk` objects:

```ts
type AIStreamChunk =
  | { type: "metadata"; conversationId: string }
  | { type: "token"; content: string }
  | { type: "done"; messageId: string }
  | { type: "error"; error: string };
```

### Chunk Types

1. **`metadata`** — Sent first, contains the `conversationId` so the client can track the conversation
2. **`token`** — Individual text tokens as they arrive from the provider
3. **`done`** — Sent after the stream completes, contains the `messageId` of the persisted assistant message
4. **`error`** — Sent when something fails during the stream

### Token Delivery

Each token from the provider's `streamChat()` async iterable is yielded as a `{ type: "token", content: token }` chunk. The client accumulates these for real-time rendering.

### Stop Generation

The streaming architecture supports client-side disconnection. If the client disconnects mid-stream:
- The async generator stops when the consumer stops iterating
- The user message is already persisted
- No partial assistant message is saved
- Usage is tracked for the tokens consumed so far

### Error Handling During Stream

If the provider throws during streaming:
- An error chunk is emitted: `{ type: "error", error: "Failed to get AI response..." }`
- Usage is tracked with `success: false` and the error message
- No partial response is persisted

---

## Security

### Authentication Required

All AI endpoints require an authenticated session. The `userId` is extracted server-side from the session — never from client-supplied data.

### Conversation Ownership

Every conversation operation verifies `conversation.userId === userId`. Users cannot:
- Send messages to another user's conversation
- Read another user's conversation history
- Delete another user's conversations

### No Client-Controlled System Prompts

The system prompt is built entirely server-side from:
- The selected mode (validated against an allowlist)
- Database content (biology context, student profile, progress)
- Hardcoded base instructions

The client cannot inject arbitrary system-level instructions.

### Message Length Limits

- Messages are capped at 4000 characters (configurable via `AI_MAX_MESSAGE_LENGTH`)
- Enforced both at the schema validation level and in the service layer
- Prevents abuse of token budget

### No SYSTEM Message Injection

The message roles are mapped server-side:
```ts
const messages = [
  { role: "system", content: systemPrompt },
  ...conversationHistory,
  { role: "user", content: request.message },
];
```

The client's message is always mapped to `role: "user"`. There is no way for the client to send a `system` role message.

---

## Usage Tracking

### AIUsage Model

Every API call creates an `AIUsage` record:

```
AIUsage
  id               String (UUID)
  userId           String
  provider         String  (e.g., "openai")
  model            String  (e.g., "gpt-4o-mini")
  promptTokens     Int     (default: 0)
  completionTokens Int     (default: 0)
  totalTokens      Int     (default: 0)
  durationMs       Int     (default: 0)
  success          Boolean (default: true)
  errorMessage     String? (nullable)
  createdAt        DateTime
```

### What Is Tracked

- **Provider and model** used for the request
- **Token counts**: prompt, completion, and total
- **Duration**: wall-clock time from request start to response
- **Success/failure**: whether the API call completed
- **Error message**: only on failure, for debugging

### What Is NOT Tracked

- Message content (user or assistant)
- System prompt contents
- Biology context content
- Student profile details

This ensures usage analytics never contain sensitive learning data.

### Non-Blocking

Usage tracking is wrapped in try/catch. If it fails, the main operation still completes successfully.

---

## Error Handling

### Missing API Key → 503

When `OPENAI_API_KEY` is not set:
- `aiConfig.isAvailable` returns `false`
- `provider.isAvailable()` returns `false`
- The service yields an error: "AI Tutor is currently unavailable. Please check that OPENAI_API_KEY is configured."
- Client receives a user-friendly unavailable state

### Provider Unavailable → Graceful Fallback

If the OpenAI SDK fails to load (not installed, network issues):
- `getClient()` returns `null`
- `chat()` and `streamChat()` throw `"AI provider not configured"`
- The service catches this and returns a friendly error message

### Rate Limiting

Configured via `AI_RATE_LIMIT` (default 20 requests/minute per user). The rate limit is enforced at the API route level before reaching the service.

### Timeout Handling

The OpenAI SDK supports timeout configuration. Long-running requests that exceed the timeout will fail gracefully with an error chunk sent to the client.

### User-Friendly Error Messages

All errors returned to the client are human-readable:
- "AI Tutor is currently unavailable..."
- "Message too long. Maximum 4000 characters."
- "Conversation not found"
- "Failed to get AI response. Please try again."

Technical details are logged server-side but never exposed to the client.

### Server-Side Error Logging

All errors are caught and logged with full context for debugging. The `trackUsage` method records the error message for failed requests.

---

## Future Enhancements

### RAG with Vector Embeddings

Store biology content as vector embeddings for semantic search:
- Embed subtopic content using OpenAI embeddings API
- Retrieve semantically relevant content for each query
- Provide more targeted context than topic-level matching
- Support cross-topic knowledge connections

### Conversation Summarization

Periodically summarize older conversations:
- Reduce token usage for long conversations
- Preserve key learning points in compressed form
- Enable "conversation memory" across sessions
- Use a cheaper model for summarization

### Long-Term Learning Memory

Track patterns across all conversations:
- Recurring misconceptions by topic
- Most-asked question types per mode
- Progress over time in conversation quality
- Personalized teaching strategy adaptation

### Image Analysis

Support image uploads in conversations:
- Diagram labeling and explanation
- Microscopy image identification
- Graph/chart interpretation
- Handwritten answer evaluation

### Multi-Model Support

Abstract beyond OpenAI:
- Add Claude, Gemini, or local model providers
- Per-mode model selection (e.g., cheaper model for quiz mode)
- Fallback chain when primary provider is unavailable
- A/B testing different models for quality comparison
