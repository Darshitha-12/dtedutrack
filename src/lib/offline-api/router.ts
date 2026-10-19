// URL/method dispatch for the offline API layer.

import {
  jsonResult,
  fakeSession,
  csrfToken,
  applyLoginEmail,
  profileGet,
  profilePatch,
  profileAvatar,
  settingsGet,
  settingsPatch,
  onboardingPatch,
  notepadGet,
  notepadPost,
  notepadPatch,
  notepadDelete,
  notesGet,
  notesPost,
  notesDelete,
  flashcardsGet,
  flashcardsPost,
  flashcardsPatch,
  flashcardsDelete,
  marksGet,
  marksPost,
  marksPatch,
  marksDelete,
  pastPapersGet,
  pastPapersPost,
  workLogGet,
  workLogPost,
  workLogDelete,
  classesGet,
  classesPost,
  classesDelete,
  attendancePost,
  progressGet,
  progressPatch,
  analytics,
  type Result,
} from "./handlers";
import { contentSubjects, contentSubject, contentUnit, contentTopic, contentSearch, contentContext } from "./content";
import { listQuizzes, startQuiz, getQuiz, answerQuestion, completeQuiz, listQuizTopics, getMistakes } from "./quiz";
import { plannerGet, plannerPost, plannerPatch, ValidationErr } from "./planner";
import { fetchAsset } from "./runtime";
import {
  chatConversations,
  chatUsers,
  chatMessages,
  sendChatMessage,
  editChatMessage,
  chatTyping,
  clearChatMessages,
  deleteChatMessage,
  reactChatMessage,
  chatRead,
  deleteConversation,
  chatPresence,
  chatStatuses,
  createStatus,
  deleteOwnStatuses,
  viewStatus,
  reactStatus,
  uploadChatMedia,
  callSignalPost,
  callSignalGet,
  callSignalDelete,
  callSignalIncoming,
} from "./chat";

export interface ApiRequest {
  method: string;
  pathname: string;
  query: URLSearchParams;
  text: string | undefined;
  form: FormData | undefined;
  json(): Record<string, unknown>;
  urlencoded(): URLSearchParams;
}

/**
 * The offline bundle runs from Capacitor's local origin and has no server of its own, so
 * other people's accounts simply do not exist on the device. Once the device is linked to an
 * account (the sync device token lives in localStorage) the chat routes are proxied to the
 * deployed site instead of being shimmed locally — that is what makes Messages actually work
 * inside the APK, while every other feature keeps working fully offline.
 */
const CHAT_BASE = (process.env.NEXT_PUBLIC_SYNC_BASE || "").replace(/\/$/, "");

function chatDeviceToken(): string {
  try {
    return localStorage.getItem("biopulse.sync.token") || "";
  } catch {
    return "";
  }
}

/** A stalled network must never hang the UI: fall back to the local shim. */
const CHAT_PROXY_TIMEOUT_MS = 10_000;

async function proxyChat(
  req: ApiRequest,
): Promise<{ status: number; body: Record<string, unknown> } | null> {
  if (!CHAT_BASE) return null;
  const token = chatDeviceToken();
  if (!token) return null;

  const qs = req.query.toString();
  const url = `${CHAT_BASE}${req.pathname}${qs ? `?${qs}` : ""}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
  };

  let body: BodyInit | undefined;
  if (req.form) {
    body = req.form;
  } else if (req.text !== undefined && req.text !== null) {
    headers["Content-Type"] = "application/json";
    body = req.text;
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), CHAT_PROXY_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetchAsset(url, { method: req.method, headers, body, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
  const raw = await res.text();
  let parsed: Record<string, unknown>;
  try {
    parsed = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
  } catch {
    parsed = { error: raw.slice(0, 500) || `Request failed (HTTP ${res.status}).` };
  }
  return { status: res.status, body: parsed };
}

/**
 * Tags a locally-shimmed chat response so the UI knows no server was reached.
 *
 * Offline the shim answers 200 with an empty list, which is indistinguishable
 * from "you really have no contacts / no chats". Without this flag the chat page
 * would throw away its last known snapshot and show an empty state instead.
 */
function offlineMark(result: Result): Result {
  return { status: result.status, body: { ...result.body, offline: true } };
}

// Routes the offline build deliberately does NOT shim: AI features, Telegram server
// plumbing and account creation — these pass through to the (offline) network and fail,
// which the pages handle as "feature unavailable".
const PASS_THROUGH = [
  "/api/ai/",
  "/api/diagrams",
  "/api/generate-timetable",
  "/api/telegram/",
  "/api/diag-fcm",
  "/api/account/",
  "/api/auth/register",
  "/api/auth/otp/",
  "/api/auth/set-password",
];

export function isPassThrough(pathname: string): boolean {
  return PASS_THROUGH.some((p) => pathname === p || pathname.startsWith(p));
}

function segs(pathname: string): string[] {
  return pathname.split("/").filter(Boolean); // ["api", ...]
}
export async function routeApi(req: ApiRequest): Promise<{ status: number; body: unknown }> {
  try {
    const result = await dispatch(req);
    return result;
  } catch (err) {
    if (err instanceof ValidationErr) {
      return { status: 400, body: { error: "Validation error", issues: err.issues } };
    }
    console.error("[offline-api]", req.method, req.query, err);
    return { status: 500, body: { error: "Internal server error" } };
  }
}

async function dispatch(req: ApiRequest): Promise<Result> {
  const { method, query } = req;
  const s = segs(req.pathname); // e.g. ["api","quiz","abc"]

  // --- auth ---
  if (s[1] === "auth") {
    if (s[2] === "session") return jsonResult(200, fakeSession());
    if (s[2] === "csrf") return csrfToken();
    if (s[2] === "callback" && s[3] === "credentials") {
      const form = req.urlencoded();
      applyLoginEmail(form.get("email"));
      const url = form.get("callbackUrl") || "/";
      return jsonResult(200, { url });
    }
    if (s[2] === "signout") return jsonResult(200, { url: "/login" });
    return jsonResult(404, { error: "Not Found" });
  }

  if (s[1] === "login" && method === "POST") {
    const body = req.json();
    if (!body.email || !body.password) return jsonResult(400, { error: "Email and password are required." });
    return jsonResult(200, { success: true });
  }

  // --- profile ---
  if (s[1] === "profile") {
    if (s[2] === "avatar" && method === "POST") return profileAvatar(req.form);
    if (method === "GET") return profileGet();
    if (method === "PATCH") return profilePatch(req.json());
  }
  if (s[1] === "settings") {
    if (method === "GET") return settingsGet();
    if (method === "PATCH") return settingsPatch(req.json());
  }
  if (s[1] === "account" && method === "DELETE") return jsonResult(404, { error: "Not Found" });
  if (s[1] === "onboarding" && method === "PATCH") return onboardingPatch(req.json());

  // --- notepad ---
  if (s[1] === "notepad") {
    if (method === "GET") return notepadGet();
    if (method === "POST") return notepadPost(req.json());
    if (method === "PATCH") return notepadPatch(req.json());
    if (method === "DELETE") return notepadDelete(req.json());
  }

  // --- AI notes (manual offline) ---
  if (s[1] === "notes") {
    if (method === "GET") return notesGet();
    if (method === "POST") return notesPost(req.json());
    if (method === "DELETE") return notesDelete(query);
  }

  // --- flashcards ---
  if (s[1] === "flashcards") {
    if (method === "GET") return flashcardsGet(query);
    if (method === "POST") return flashcardsPost(req.json());
    if (method === "PATCH") return flashcardsPatch(req.json());
    if (method === "DELETE") return flashcardsDelete(req.json());
  }

  // --- exam marks ---
  if (s[1] === "exam-marks") {
    if (method === "GET") return marksGet();
    if (method === "POST") return marksPost(req.json());
    if (method === "PATCH") return marksPatch(req.json());
    if (method === "DELETE") return marksDelete(req.json());
  }

  // --- past papers ---
  if (s[1] === "past-papers") {
    if (method === "GET") return pastPapersGet();
    if (method === "POST") return pastPapersPost(req.json());
  }

  // --- work log ---
  if (s[1] === "work-log") {
    if (method === "GET") return workLogGet();
    if (method === "POST") return workLogPost(req.json());
    if (method === "DELETE") return workLogDelete(query);
  }

  // --- classes ---
  if (s[1] === "classes") {
    if (s[2] === "attendance" && method === "POST") return attendancePost(req.json());
    if (method === "GET") return classesGet();
    if (method === "POST") return classesPost(req.json());
    if (method === "DELETE") return classesDelete(query);
  }

  // --- planner ---
  if (s[1] === "planner") {
    if (method === "GET") return plannerGet();
    if (method === "PATCH") return plannerPatch(req.json());
    if (method === "POST") {
      let body: Record<string, unknown>;
      try {
        body = req.json();
      } catch {
        return jsonResult(400, { error: "Invalid request body" });
      }
      return plannerPost(body);
    }
  }

  // --- quiz ---
  if (s[1] === "quiz") {
    if (s[2] === undefined) {
      if (method === "GET") return listQuizzes();
      if (method === "POST") return startQuiz(req.json());
    }
    if (s[2] === "topics" && method === "GET") return listQuizTopics();
    if (s[2] === "answer" && method === "POST") return answerQuestion(req.json());
    if (s[2] === "complete" && method === "POST") return completeQuiz(req.json());
    if (s[2] && method === "GET") return getQuiz(s[2]);
  }

  if (s[1] === "mistakes" && method === "GET") return getMistakes();
  if (s[1] === "analytics" && method === "GET") return analytics();

  // --- content ---
  if (s[1] === "content") {
    if (s[2] === "progress") {
      if (method === "GET") return progressGet();
      if (method === "PATCH") return progressPatch(req.json());
    }
    if (s[2] === "subjects" && method === "GET") {
      if (s[3] === undefined) return contentSubjects();
      if (s[4] === undefined) return contentSubject(s[3]);
      if (s[5] === undefined) return contentUnit(s[3], s[4]);
      return contentTopic(s[3], s[4], s[5]);
    }
    if (s[2] === "search" && method === "GET") {
      const q = query.get("q") ?? "";
      const limitRaw = Number(query.get("limit") ?? "20");
      const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(50, Math.floor(limitRaw))) : 20;
      if (q.length < 1 || q.length > 200) return jsonResult(400, { error: { q: ["Query must be 1-200 characters"] } });
      return contentSearch(q, query.get("subjectId"), limit);
    }
    if (s[2] === "context" && method === "GET") {
      return contentContext(query.get("subject") ?? "", query.get("unit"), query.get("topic"), query.get("subtopic"));
    }
  }

  // --- chat ---
  if (s[1] === "chat") {
    // Prefer the real server when this device is linked to an account. When offline (or not
    // linked yet) this returns null and the local shim below answers so the UI still renders.
    try {
      const proxied = await proxyChat(req);
      if (proxied) return jsonResult(proxied.status, proxied.body);
    } catch {
      /* no network — fall through to the local store */
    }
    if (s[2] === "conversations" && method === "GET") return offlineMark(chatConversations());
    if (s[2] === "conversation" && method === "DELETE") return deleteConversation(req.json());
    if (s[2] === "users" && method === "GET") return offlineMark(chatUsers());
    if (s[2] === "messages") {
      if (method === "GET") return offlineMark(chatMessages(query));
      if (method === "POST") return sendChatMessage(req.json());
      if (method === "PATCH") return editChatMessage(req.json());
      if (method === "DELETE") {
        const body = req.json();
        if (typeof body.messageId === "string" && body.messageId) return deleteChatMessage(body);
        return clearChatMessages(body);
      }
    }
    if (s[2] === "typing") return chatTyping();
    if (s[2] === "reactions" && method === "POST") return reactChatMessage(req.json());
    if (s[2] === "read" && method === "POST") return chatRead(req.json());
    if (s[2] === "presence" && method === "POST") return chatPresence(req.json());
    if (s[2] === "status") {
      if (s[3] === "view" && method === "POST") return viewStatus(req.json());
      if (s[3] === "reaction" && method === "POST") return reactStatus(req.json());
      if (method === "GET") return chatStatuses();
      if (method === "POST") return createStatus(req.json());
      if (method === "DELETE") return deleteOwnStatuses();
    }
    if (s[2] === "upload" && method === "POST") return uploadChatMedia(req.form);
    if (s[2] === "call-signal") {
      if (s[3] === "incoming" && method === "GET") return callSignalIncoming();
      if (method === "POST") return callSignalPost();
      if (method === "GET") return callSignalGet();
      if (method === "DELETE") return callSignalDelete();
    }
  }

  // --- misc ---
  if (s[1] === "yt-search" && method === "GET") return jsonResult(200, { videos: [] });

  return jsonResult(404, { error: "Not Found" });
}
