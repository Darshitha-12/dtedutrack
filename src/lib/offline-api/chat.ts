// Chat endpoints. Offline there are no other users, so lists stay empty and
// presence/status round-trips simply succeed against local state.

import { getState, mutate, meId, ME, type StoredChatMessage, type StoredStatus } from "./store";
import { nowIso, uid } from "./runtime";

type Result = { status: number; body: Record<string, unknown> };

const SESSION_EXPIRED = "Session expired. Please sign in again.";

/**
 * Stored messages can carry either the real account id (synced from the server) or the
 * synthetic offline id (created on the device before it was linked), so treat both as "me".
 */
function isMe(id: string): boolean {
  return id === ME || id === meId();
}

/** The other side of a stored message. */
function partnerOf(m: StoredChatMessage): string {
  return isMe(m.senderId) ? m.receiverId : m.senderId;
}

function otherUsers(): { id: string; name: string; fullName: string; email: string; image: string | null; about: string; status: string; lastSeen: string | null }[] {
  // No other accounts exist offline.
  return [];
}

export function chatConversations(): Result {
  const state = getState();
  const byPartner = new Map<string, StoredChatMessage[]>();
  for (const m of state.chatMessages) {
    const partner = partnerOf(m);
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
      const mine = isMe(last.senderId);
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
        unread: sorted.filter((m) => !isMe(m.senderId) && !m.readAt).length,
      };
    })
    .sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt));
  return { status: 200, body: { conversations, me: meId() } };
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
        (isMe(m.senderId) && m.receiverId === partnerId) ||
        (m.senderId === partnerId && isMe(m.receiverId)),
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
      editedAt: m.editedAt ?? null,
      forwarded: m.forwarded === true,
      replyTo: (() => {
        if (!m.replyToId) return null;
        const quoted = state.chatMessages.find((x) => x.id === m.replyToId);
        if (!quoted) return null;
        return {
          id: quoted.id,
          senderId: quoted.senderId,
          text: quoted.text,
          mediaType: quoted.mediaType,
          mediaName: quoted.mediaName,
        };
      })(),
      reactions: (state.chatReactions ?? [])
        .filter((r) => r.messageId === m.id)
        .map((r) => ({ emoji: r.emoji, count: 1, mine: true })),
    }));
  return { status: 200, body: { messages } };
}

export function sendChatMessage(body: Record<string, unknown>): Result {
  const partnerId = String(body.partnerId ?? "");
  if (!partnerId) return { status: 400, body: { error: "partnerId required" } };
  if (isMe(partnerId)) return { status: 400, body: { error: "Cannot message yourself" } };
  // Offline there are no other accounts, and the blob sync does not write messages back to
  // the server — so a locally-stored send would look sent yet never reach anyone. Refuse it.
  if (!otherUsers().some((u) => u.id === partnerId)) {
    return { status: 404, body: { error: "User not found" } };
  }
  const text = typeof body.text === "string" ? body.text : "";
  const mediaUrl = typeof body.mediaUrl === "string" ? body.mediaUrl : null;
  if (!text && !mediaUrl) return { status: 400, body: { error: "Message is empty" } };
  const replyToId = typeof body.replyToId === "string" ? body.replyToId : null;
  const msg: StoredChatMessage = {
    id: uid(),
    senderId: meId(),
    receiverId: partnerId,
    text,
    mediaUrl,
    mediaType: typeof body.mediaType === "string" ? body.mediaType : null,
    mediaName: typeof body.mediaName === "string" ? body.mediaName : null,
    readAt: null,
    createdAt: nowIso(),
    replyToId,
    editedAt: null,
    forwarded: body.forwarded === true,
  };
  mutate((s) => s.chatMessages.push(msg));
  const quoted = replyToId
    ? getState().chatMessages.find((m) => m.id === replyToId) ?? null
    : null;
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
        editedAt: null,
        forwarded: msg.forwarded === true,
        replyTo: quoted
          ? {
              id: quoted.id,
              senderId: quoted.senderId,
              text: quoted.text,
              mediaType: quoted.mediaType,
              mediaName: quoted.mediaName,
            }
          : null,
      },
    },
  };
}

/** Edit a text message in the offline store (the 15-minute rule still applies). */
export function editChatMessage(body: Record<string, unknown>): Result {
  const messageId = typeof body.messageId === "string" ? body.messageId : "";
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!messageId) return { status: 400, body: { error: "messageId required" } };
  if (!text) return { status: 400, body: { error: "Message is empty" } };
  const existing = getState().chatMessages.find((m) => m.id === messageId);
  if (!existing) return { status: 404, body: { error: "Message not found" } };
  if (!isMe(existing.senderId)) {
    return { status: 403, body: { error: "You can only edit your own messages" } };
  }
  if (existing.mediaUrl) {
    return { status: 400, body: { error: "Media messages cannot be edited" } };
  }
  if (Date.now() - new Date(existing.createdAt).getTime() > 15 * 60 * 1000) {
    return {
      status: 403,
      body: { error: "Messages can only be edited within 15 minutes of sending" },
    };
  }
  const editedAt = nowIso();
  mutate((s) => {
    const m = s.chatMessages.find((x) => x.id === messageId);
    if (m) {
      m.text = text;
      m.editedAt = editedAt;
    }
  });
  return { status: 200, body: { message: { id: messageId, text, editedAt } } };
}

/** Typing indicators need a second account, so offline there is never anyone typing. */
export function chatTyping(): Result {
  return { status: 200, body: { ok: true, typing: false } };
}

export function clearChatMessages(body: Record<string, unknown>): Result {
  const partnerId = String(body.partnerId ?? "");
  if (!partnerId) return { status: 400, body: { error: "partnerId required" } };
  if (isMe(partnerId)) return { status: 400, body: { error: "Cannot clear your own thread" } };
  mutate((s) => {
    s.chatMessages = s.chatMessages.filter(
      (m) => !((isMe(m.senderId) && m.receiverId === partnerId) || (m.senderId === partnerId && isMe(m.receiverId))),
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
      if (m.senderId === partnerId && isMe(m.receiverId) && !m.readAt) {
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
  if (isMe(partnerId)) return { status: 400, body: { error: "Cannot delete your own thread" } };
  mutate((s) => {
    s.chatMessages = s.chatMessages.filter(
      (m) => !((isMe(m.senderId) && m.receiverId === partnerId) || (m.senderId === partnerId && isMe(m.receiverId))),
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
    .filter((s) => s.pinned || new Date(s.createdAt).getTime() >= cutoff)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((s) => ({
      id: s.id,
      userId: s.userId,
      name: s.userId === ME ? state.profile.name : "Unknown",
      image: s.userId === ME ? state.profile.image : null,
      text: s.text,
      caption: s.caption ?? null,
      imageUrl: s.imageUrl,
      imageType: s.imageType,
      bgColor: s.bgColor ?? null,
      font: s.font ?? null,
      pinned: s.pinned === true,
      editedAt: s.editedAt ?? null,
      expiresAt: new Date(new Date(s.createdAt).getTime() + 24 * 60 * 60 * 1000).toISOString(),
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
    caption: typeof body.caption === "string" ? body.caption : null,
    // A background only applies to a text-only update, mirroring the server.
    bgColor: !imageUrl && typeof body.bgColor === "string" ? body.bgColor : null,
    font: !imageUrl && typeof body.font === "string" ? body.font : null,
    pinned: body.keep === true,
    editedAt: null,
    createdAt: nowIso(),
  };
  mutate((s) => s.statuses.push(status));
  return { status: 201, body: { status: { id: status.id, createdAt: status.createdAt } } };
}

/** Delete one of mine, or every one of mine when no id is given. */
export function deleteOwnStatuses(body?: Record<string, unknown>): Result {
  const statusId = typeof body?.statusId === "string" ? body.statusId : "";
  if (!statusId) {
    mutate((s) => {
      s.statuses = s.statuses.filter((x) => x.userId !== ME);
    });
    return { status: 200, body: { ok: true, deleted: "all" } };
  }
  const existing = getState().statuses.find((s) => s.id === statusId);
  if (!existing) return { status: 404, body: { error: "Status not found" } };
  mutate((s) => {
    s.statuses = s.statuses.filter((x) => x.id !== statusId);
  });
  return { status: 200, body: { ok: true, deleted: "one" } };
}

export function editStatus(body: Record<string, unknown>): Result {
  const statusId = typeof body.statusId === "string" ? body.statusId : "";
  if (!statusId) return { status: 400, body: { error: "statusId required" } };
  const existing = getState().statuses.find((s) => s.id === statusId);
  if (!existing) return { status: 404, body: { error: "Status not found" } };
  if (existing.userId !== ME) {
    return { status: 403, body: { error: "You can only edit your own status" } };
  }
  const editedAt = nowIso();
  mutate((s) => {
    const item = s.statuses.find((x) => x.id === statusId);
    if (!item) return;
    if (typeof body.text === "string") item.text = body.text.trim() || null;
    if (typeof body.caption === "string") item.caption = body.caption.trim() || null;
    if (!item.imageUrl && typeof body.bgColor === "string") item.bgColor = body.bgColor;
    if (!item.imageUrl && typeof body.font === "string") item.font = body.font;
    item.editedAt = editedAt;
  });
  return { status: 200, body: { status: { id: statusId, editedAt } } };
}

/** Keep / unkeep one of my updates as a highlight. */
export function pinStatus(body: Record<string, unknown>): Result {
  const statusId = typeof body.statusId === "string" ? body.statusId : "";
  if (!statusId) return { status: 400, body: { error: "statusId required" } };
  const existing = getState().statuses.find((s) => s.id === statusId);
  if (!existing) return { status: 404, body: { error: "Status not found" } };
  if (existing.userId !== ME) return { status: 403, body: { error: "Not your status" } };
  const pinned = body.pinned === true;
  mutate((s) => {
    const item = s.statuses.find((x) => x.id === statusId);
    if (item) item.pinned = pinned;
  });
  return { status: 200, body: { ok: true, pinned } };
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

/** Forwarding a status needs a second account; offline there is no one to forward to. */
export function forwardStatus(): Result {
  return { status: 404, body: { error: "No contacts to forward to" } };
}

/** Muting a contact's status needs a second account, so it is a no-op offline. */
export function muteStatus(body: Record<string, unknown>): Result {
  return { status: 200, body: { ok: true, muted: body.muted === true } };
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
