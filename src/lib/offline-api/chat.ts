// Chat endpoints. Offline there are no other users, so lists stay empty and
// presence/status round-trips simply succeed against local state.

import { getState, mutate, ME, type StoredChatMessage, type StoredStatus } from "./store";
import { nowIso, uid } from "./runtime";

type Result = { status: number; body: Record<string, unknown> };

const SESSION_EXPIRED = "Session expired. Please sign in again.";

function otherUsers(): { id: string; name: string; fullName: string; email: string; image: string | null; about: string; status: string; lastSeen: string | null }[] {
  // No other accounts exist offline.
  return [];
}

export function chatConversations(): Result {
  const state = getState();
  const byPartner = new Map<string, StoredChatMessage[]>();
  for (const m of state.chatMessages) {
    const partner = m.senderId === ME ? m.receiverId : m.senderId;
    const list = byPartner.get(partner) ?? [];
    list.push(m);
    byPartner.set(partner, list);
  }
  const users = otherUsers();
  const conversations = [...byPartner.entries()]
    .map(([partner, msgs]) => {
      const sorted = [...msgs].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      const last = sorted[sorted.length - 1];
      const preview =
        last.text ||
        (last.mediaType === "photo" || (last.mediaType === "image" && !last.mediaName)
          ? "📷 Photo"
          : last.mediaType === "video"
            ? "🎬 Video"
            : last.mediaType === "audio"
              ? "🎤 Voice note"
              : `📎 ${last.mediaName || "File"}`);
      const mine = last.senderId === ME;
      const user = users.find((u) => u.id === partner);
      return {
        id: partner,
        name: user?.name ?? "Unknown",
        image: user?.image ?? null,
        status: "offline",
        lastSeen: null,
        lastMessage: (mine ? "You: " : "") + preview,
        lastMessageIsMine: mine,
        lastMessageAt: last.createdAt,
        unread: sorted.filter((m) => m.senderId !== ME && !m.readAt).length,
      };
    })
    .sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt));
  return { status: 200, body: { conversations, me: ME } };
}

export function chatUsers(): Result {
  return { status: 200, body: { users: otherUsers() } };
}

export function chatMessages(query: URLSearchParams): Result {
  const partnerId = query.get("partnerId");
  if (!partnerId) return { status: 400, body: { error: "partnerId required" } };
  const state = getState();
  const hidden = new Set(state.hiddenChatMessages ?? []);
  const messages = state.chatMessages
    .filter(
      (m) =>
        (m.senderId === ME && m.receiverId === partnerId) ||
        (m.senderId === partnerId && m.receiverId === ME),
    )
    .filter((m) => !hidden.has(m.id))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map((m) => ({
      id: m.id,
      senderId: m.senderId,
      text: m.text,
      mediaUrl: m.mediaUrl,
      mediaType: m.mediaType,
      mediaName: m.mediaName,
      readAt: m.readAt,
      createdAt: m.createdAt,
      reactions: (state.chatReactions ?? [])
        .filter((r) => r.messageId === m.id)
        .map((r) => ({ emoji: r.emoji, count: 1, mine: true })),
    }));
  return { status: 200, body: { messages } };
}

export function sendChatMessage(body: Record<string, unknown>): Result {
  const partnerId = String(body.partnerId ?? "");
  if (!partnerId) return { status: 400, body: { error: "partnerId required" } };
  if (partnerId === ME) return { status: 400, body: { error: "Cannot message yourself" } };
  if (!otherUsers().some((u) => u.id === partnerId)) {
    return { status: 404, body: { error: "User not found" } };
  }
  const text = typeof body.text === "string" ? body.text : "";
  const mediaUrl = typeof body.mediaUrl === "string" ? body.mediaUrl : null;
  if (!text && !mediaUrl) return { status: 400, body: { error: "Message is empty" } };
  const msg: StoredChatMessage = {
    id: uid(),
    senderId: ME,
    receiverId: partnerId,
    text,
    mediaUrl,
    mediaType: typeof body.mediaType === "string" ? body.mediaType : null,
    mediaName: typeof body.mediaName === "string" ? body.mediaName : null,
    readAt: null,
    createdAt: nowIso(),
  };
  mutate((s) => s.chatMessages.push(msg));
  return {
    status: 201,
    body: {
      message: {
        id: msg.id,
        senderId: msg.senderId,
        text: msg.text,
        mediaUrl: msg.mediaUrl,
        mediaType: msg.mediaType,
        mediaName: msg.mediaName,
        readAt: msg.readAt,
        createdAt: msg.createdAt,
      },
    },
  };
}

export function clearChatMessages(body: Record<string, unknown>): Result {
  const partnerId = String(body.partnerId ?? "");
  if (!partnerId) return { status: 400, body: { error: "partnerId required" } };
  if (partnerId === ME) return { status: 400, body: { error: "Cannot clear your own thread" } };
  mutate((s) => {
    s.chatMessages = s.chatMessages.filter(
      (m) => !((m.senderId === ME && m.receiverId === partnerId) || (m.senderId === partnerId && m.receiverId === ME)),
    );
  });
  return { status: 200, body: { ok: true } };
}

/** Single-message delete. Offline there is only one account, so both scopes behave the same. */
export function deleteChatMessage(body: Record<string, unknown>): Result {
  const messageId = String(body.messageId ?? "");
  if (!messageId) return { status: 400, body: { error: "messageId required" } };
  const scope = String(body.scope ?? "me") === "everyone" ? "everyone" : "me";
  mutate((s) => {
    s.chatMessages = s.chatMessages.filter((m) => m.id !== messageId);
    s.chatReactions = (s.chatReactions ?? []).filter((r) => r.messageId !== messageId);
    if (scope === "me") {
      const hidden = new Set(s.hiddenChatMessages ?? []);
      hidden.add(messageId);
      s.hiddenChatMessages = [...hidden];
    }
  });
  return { status: 200, body: { ok: true, scope } };
}

export function reactChatMessage(body: Record<string, unknown>): Result {
  const messageId = String(body.messageId ?? "");
  if (!messageId) return { status: 400, body: { error: "messageId required" } };
  const emoji = typeof body.emoji === "string" ? body.emoji.trim() : "";
  mutate((s) => {
    const rest = (s.chatReactions ?? []).filter((r) => r.messageId !== messageId);
    s.chatReactions = emoji ? [...rest, { messageId, emoji }] : rest;
  });
  const reactions = emoji ? [{ emoji, count: 1, mine: true }] : [];
  return { status: 200, body: { ok: true, messageId, reactions } };
}

export function chatRead(body: Record<string, unknown>): Result {
  const partnerId = String(body.partnerId ?? "");
  if (!partnerId) return { status: 400, body: { error: "partnerId required" } };
  let marked = 0;
  mutate((s) => {
    for (const m of s.chatMessages) {
      if (m.senderId === partnerId && m.receiverId === ME && !m.readAt) {
        m.readAt = nowIso();
        marked += 1;
      }
    }
  });
  return { status: 200, body: { ok: true, marked } };
}

export function deleteConversation(body: Record<string, unknown>): Result {
  const partnerId = String(body.partnerId ?? "");
  if (!partnerId) return { status: 400, body: { error: "partnerId required" } };
  if (partnerId === ME) return { status: 400, body: { error: "Cannot delete your own thread" } };
  mutate((s) => {
    s.chatMessages = s.chatMessages.filter(
      (m) => !((m.senderId === ME && m.receiverId === partnerId) || (m.senderId === partnerId && m.receiverId === ME)),
    );
  });
  return { status: 200, body: { ok: true } };
}

export function chatPresence(body: Record<string, unknown>): Result {
  const status = body.status === "offline" ? "offline" : "online";
  return { status: 200, body: { ok: true, status, lastSeen: nowIso() } };
}

export function chatStatuses(): Result {
  const state = getState();
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const statuses = state.statuses
    .filter((s) => new Date(s.createdAt).getTime() >= cutoff)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((s) => ({
      id: s.id,
      userId: s.userId,
      name: s.userId === ME ? state.profile.name : "Unknown",
      image: s.userId === ME ? state.profile.image : null,
      text: s.text,
      imageUrl: s.imageUrl,
      imageType: s.imageType,
      createdAt: s.createdAt,
      viewCount: 0,
      myReaction: null,
      reactions: [],
      seenByFew: true,
      viewedByMe: s.userId === ME,
      ...(s.userId === ME ? { viewers: [] } : {}),
    }));
  return { status: 200, body: { statuses } };
}

export function createStatus(body: Record<string, unknown>): Result {
  const text = typeof body.text === "string" ? body.text : "";
  const imageUrl = typeof body.imageUrl === "string" ? body.imageUrl : null;
  if (!text && !imageUrl) return { status: 400, body: { error: "Status needs some text or media" } };
  const status: StoredStatus = {
    id: uid(),
    userId: ME,
    text: text || null,
    imageUrl,
    imageType: typeof body.imageType === "string" ? body.imageType : null,
    createdAt: nowIso(),
  };
  mutate((s) => s.statuses.push(status));
  return { status: 201, body: { status: { id: status.id, createdAt: status.createdAt } } };
}

export function deleteOwnStatuses(): Result {
  mutate((s) => {
    s.statuses = s.statuses.filter((x) => x.userId !== ME);
  });
  return { status: 200, body: { ok: true } };
}

export function viewStatus(body: Record<string, unknown>): Result {
  const statusId = String(body.statusId ?? "");
  const state = getState();
  const status = state.statuses.find((s) => s.id === statusId);
  if (!status) return { status: 404, body: { error: "Status not found" } };
  return { status: 200, body: { ok: true, viewCount: 0 } };
}

export function reactStatus(body: Record<string, unknown>): Result {
  const statusId = String(body.statusId ?? "");
  const state = getState();
  if (!state.statuses.some((s) => s.id === statusId)) {
    return { status: 404, body: { error: "Status not found" } };
  }
  return { status: 200, body: { myReaction: null, reactions: [] } };
}

export async function uploadChatMedia(form: FormData | undefined): Promise<Result> {
  const file = form?.get("file");
  if (!(file instanceof File)) return { status: 400, body: { error: "No file provided" } };
  if (file.size > 15 * 1024 * 1024) return { status: 400, body: { error: "File too large (max 15MB)" } };
  const dataUrl = await fileToDataUrl(file);
  if (file.size > 10 * 1024 * 1024) {
    return {
      status: 500,
      body: { error: "Media storage is not configured. Try a smaller file (max 2MB) or add Supabase storage." },
    };
  }
  const mime = file.type || "application/octet-stream";
  const mediaType = mime.startsWith("image") ? "image" : mime.startsWith("video") ? "video" : mime.startsWith("audio") ? "audio" : "file";
  return {
    status: 200,
    body: { mediaUrl: dataUrl, mediaType, mediaName: file.name, bucket: null, inline: true },
  };
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

export function callSignalPost(): Result {
  return { status: 200, body: { ok: true } };
}

export function callSignalGet(): Result {
  return { status: 200, body: { signals: [] } };
}

export function callSignalDelete(): Result {
  return { status: 200, body: { ok: true } };
}

export function callSignalIncoming(): Result {
  return { status: 200, body: { caller: null } };
}

export { SESSION_EXPIRED };
