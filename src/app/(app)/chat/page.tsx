"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useSession, signOut } from "next-auth/react";
import {
  Search,
  Send,
  Loader2,
  Paperclip,
  Check,
  CheckCheck,
  ArrowLeft,
  Download,
  MessageCircle,
  Phone,
  MoreVertical,
  Video,
  Smile,
  Mic,
  MessageSquarePlus,
  X,
  UserRound,
  CircleDot,
  Trash2,
  StopCircle,
  Copy,
  CloudOff,
  Reply,
  Forward,
  Pencil,
  Info,
  Star,
  Pin,
  BellOff,
  Bell,
} from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import {
  loadCachedConversations,
  loadCachedMessages,
  loadCachedUsers,
  saveCachedConversations,
  saveCachedMessages,
  saveCachedUsers,
} from "@/lib/chat-cache";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import {
  VideoCallOverlay,
  type CallPeer,
  type CallKind,
} from "@/features/chat/components/video-call-overlay";
import { MediaLightbox, type LightboxMedia } from "@/features/chat/components/media-lightbox";

function VideoIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M4 5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5zm12.5 3.5 3-2.3A1 1 0 0 1 21 7v10a1 1 0 0 1-1.5.9l-3-2.3v-1.6z" />
    </svg>
  );
}

const EMOJI_CATEGORIES: { name: string; icon: string; emojis: string[] }[] = [
  {
    name: "Smileys",
    icon: "😀",
    emojis: [
      "😀", "😁", "😂", "🤣", "😃", "😄", "😅", "😆", "😉", "😊", "😋", "😎",
      "😍", "😘", "🥰", "😗", "😙", "🥲", "😚", "🙂", "🤗", "🤩", "🤔", "🤨",
      "😐", "😑", "😶", "🫥", "😏", "😒", "🙄", "😬", "😮", "🤐", "😯", "😪",
      "😫", "🥱", "😴", "😌", "😛", "😜", "😝", "🤤", "😒", "😓", "😔", "😕",
      "🙃", "🫠", "😳", "😞", "😟", "😠", "😡", "🤬", "😈", "👿", "💀", "☠️",
      "💩", "🤡", "👻", "👽", "🤖", "🎃", "😺", "😸", "😹", "😻", "😼", "😽",
      "🙀", "😿", "😾",
    ],
  },
  {
    name: "Gestures",
    icon: "👍",
    emojis: [
      "👍", "👎", "👌", "🤌", "🤏", "✌️", "🤞", "🫰", "🤟", "🤘", "🤙", "👈",
      "👉", "👆", "👇", "☝️", "✋", "🤚", "🖐️", "🖖", "👋", "🤝", "🙏", "✍️",
      "💪", "🦾", "🦵", "🦶", "👂", "🦻", "👃", "🧠", "🫀", "🫁", "🦷", "🦴",
      "👀", "👁️", "👅", "👄", "🫦", "💋", "🦸", "🦸‍♀️", "🦸‍♂️", "🧑‍🚀",
    ],
  },
  {
    name: "Hearts",
    icon: "❤️",
    emojis: [
      "❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "🤎", "💔", "❣️", "💕",
      "💞", "💓", "💗", "💖", "💘", "💝", "💟", "♥️", "💯", "💢", "💥", "💫",
      "💦", "💨", "🕳️", "💬", "🗨️", "🗯️", "💭", "💤",
    ],
  },
  {
    name: "Animals",
    icon: "🐶",
    emojis: [
      "🐶", "🐱", "🐭", "🐹", "🐰", "🦊", "🐻", "🐼", "🐨", "🐯", "🦁", "🐮",
      "🐷", "🐽", "🐸", "🐵", "🙈", "🙉", "🙊", "🐔", "🐧", "🐦", "🐤", "🦆",
      "🦅", "🦉", "🦇", "🐺", "🐗", "🐴", "🦄", "🐝", "🪱", "🐛", "🦋", "🐌",
      "🐞", "🐜", "🪰", "🪲", "🦟", "🦗", "🕷️", "🦂", "🐢", "🐍", "🦎", "🦖",
      "🦕", "🐙", "🦑", "🦐", "🦞", "🦀", "🐡", "🐠", "🐟", "🐬", "🐳", "🐋",
      "🦈", "🐊", "🐅", "🐆", "🦓", "🦍", "🦧", "🐘", "🦛", "🦏", "🐪", "🐫",
      "🦒", "🦘", "🦬", "🐃", "🐂", "🐄", "🐎", "🐖", "🐏", "🐑", "🦙", "🐐",
      "🦌", "🐕", "🐩", "🦮", "🐈", "🪶", "🐓", "🦃", "🦤", "🦚", "🦜", "🦢",
    ],
  },
  {
    name: "Food",
    icon: "🍎",
    emojis: [
      "🍎", "🍐", "🍊", "🍋", "🍌", "🍉", "🍇", "🍓", "🫐", "🍈", "🍒", "🍑",
      "🥭", "🍍", "🥥", "🥝", "🍅", "🍆", "🥑", "🥦", "🥬", "🥒", "🌶️", "🫑",
      "🌽", "🥕", "🫒", "🧄", "🧅", "🥔", "🍠", "🥐", "🥯", "🍞", "🥖", "🥨",
      "🧀", "🥚", "🍳", "🧈", "🥞", "🧇", "🥓", "🥩", "🍗", "🍖", "🌭", "🍔",
      "🍟", "🍕", "🫓", "🥪", "🥙", "🧆", "🌮", "🌯", "🫔", "🥗", "🥘", "🫕",
      "🥫", "🍝", "🍜", "🍲", "🍛", "🍣", "🍱", "🥟", "🦪", "🍤", "🍙", "🍚",
      "🍘", "🍥", "🥠", "🥮", "🍢", "🍡", "🍧", "🍨", "🍦", "🥧", "🧁", "🍰",
      "🎂", "🍮", "🍭", "🍬", "🍫", "🍿", "🍩", "🍪", "🌰", "🥜", "🍯", "🥛",
      "🍼", "🫖", "☕", "🍵", "🧃", "🥤", "🧋", "🍶", "🍺", "🍻", "🥂", "🍷",
      "🥃", "🍸", "🍹", "🧉", "🍾", "🧊",
    ],
  },
  {
    name: "Activities",
    icon: "⚽",
    emojis: [
      "⚽", "🏀", "🏈", "⚾", "🥎", "🎾", "🏐", "🏉", "🥏", "🎱", "🪀", "🏓",
      "🏸", "🏒", "🏑", "🥍", "🏏", "🪃", "🥅", "⛳", "🪁", "🏹", "🎣", "🤿",
      "🥊", "🥋", "🎽", "🛹", "🛼", "🛷", "⛸️", "🥌", "🎿", "⛷️", "🏂", "🪂",
      "🏋️", "🤸", "🤺", "🤾", "🏌️", "🏇", "🧘", "🏄", "🏊", "🤽", "🚣", "🧗",
      "🚵", "🚴", "🏆", "🥇", "🥈", "🥉", "🏅", "🎖️", "🏵️", "🎗️", "🎫", "🎟️",
      "🎪", "🤹", "🎭", "🩰", "🎨", "🎬", "🎤", "🎧", "🎼", "🎹", "🥁", "🪘",
      "🎷", "🎺", "🪗", "🎸", "🪕", "🎻", "🎲", "♟️", "🎯", "🎳", "🎮", "🎰",
      "🧩",
    ],
  },
  {
    name: "Travel",
    icon: "🌍",
    emojis: [
      "🚗", "🚕", "🚙", "🚌", "🚎", "🏎️", "🚓", "🚑", "🚒", "🚐", "🛻", "🚚",
      "🚛", "🚜", "🦯", "🦽", "🦼", "🛴", "🚲", "🛵", "🏍️", "🛺", "🚨", "🚔",
      "🚍", "🚘", "🚖", "🚡", "🚠", "🚟", "🚃", "🚋", "🚞", "🚝", "🚄", "🚅",
      "🚈", "🚂", "🚆", "🚇", "🚊", "🚉", "✈️", "🛫", "🛬", "🛩️", "💺", "🛰️",
      "🚀", "🛸", "🚁", "🛶", "⛵", "🚤", "🛥️", "🛳️", "⛴️", "🚢", "⚓", "🪝",
      "⛽", "🚧", "🚦", "🚥", "🗺️", "🗿", "🗽", "🗼", "🏰", "🏯", "🏟️", "🎡",
      "🎢", "🎠", "⛲", "⛱️", "🏖️", "🏝️", "🏜️", "🌋", "⛰️", "🏔️", "🗻", "🏕️",
      "🏠", "🏡", "🏘️", "🏚️", "🏗️", "🏭", "🏢", "🏬", "🏣", "🏤", "🏥", "🏦",
      "🏨", "🏪", "🏫", "🏩", "💒", "🏛️", "⛪", "🕌", "🕍", "🛕", "🕋", "⛩️",
      "🛤️", "🛣️", "🗾", "🎑", "🏞️", "🌅", "🌄", "🌠", "🎇", "🎆", "🌇", "🌆",
      "🏙️", "🌃", "🌌", "🌉", "🌁",
    ],
  },
  {
    name: "Objects",
    icon: "💡",
    emojis: [
      "⌚", "📱", "📲", "💻", "⌨️", "🖥️", "🖨️", "🖱️", "🖲️", "🕹️", "🗜️",
      "💽", "💾", "💿", "📀", "📼", "📷", "📸", "📹", "🎥", "📽️", "🎞️",
      "📞", "☎️", "📟", "📠", "📺", "📻", "🎙️", "🎚️", "🎛️", "🧭", "⏱️",
      "⏲️", "⏰", "🕰️", "⌛", "⏳", "📡", "🔋", "🪫", "🔌", "💡", "🔦", "🕯️",
      "🪔", "🧯", "🛢️", "💸", "💵", "💴", "💶", "💷", "🪙", "💰", "💳", "💎",
      "⚖️", "🪜", "🧰", "🪛", "🔧", "🔨", "⚒️", "🛠️", "⛏️", "🪚", "🔩",
      "⚙️", "🪤", "🧱", "⛓️", "🧲", "🔫", "💣", "🧨", "🪓", "🔪", "🗡️",
      "⚔️", "🛡️", "🚬", "⚰️", "🪦", "⚱️", "🏺", "🔮", "📿", "🧿", "💈",
      "⚗️", "🔭", "🔬", "🕳️", "🩹", "🩺", "🩻", "🩼", "💊", "💉", "🩸",
      "🧬", "🦠", "🧫", "🧪", "🌡️", "🧹", "🪠", "🧺", "🧻", "🚽", "🚰", "🚿",
      "🛁", "🛀", "🧼", "🪥", "🪒", "🧽", "🪣", "🧴", "🛎️", "🔑", "🗝️",
      "🚪", "🪑", "🛋️", "🛏️", "🛌", "🧸", "🪆", "🖼️", "🧳", "🛒", "🎁",
      "🎈", "🎏", "🎀", "🪄", "🪅", "🎊", "🎉", "🎎", "🏮", "🎐", "🧧", "✉️",
      "📩", "📨", "📧", "💌", "📥", "📤", "📦", "🏷️", "🪧", "📪", "📫",
      "📬", "📭", "📮", "📯", "📜", "📃", "📄", "📑", "🧾", "📊", "📈", "📉",
      "🗒️", "🗓️", "📆", "📅", "🗑️", "📇", "🗃️", "🗳️", "🗄️", "📋", "📁",
      "📂", "🗂️", "🗞️", "📰", "📓", "📔", "📒", "📕", "📗", "📘", "📙",
      "📚", "📖", "🔖", "🧷", "🔗", "📎", "🖇️", "📐", "📏", "🧮", "📌",
      "📍", "✂️", "🖊️", "🖋️", "✒️", "🖌️", "🖍️", "📝", "✏️", "🔍", "🔎",
      "🔏", "🔐", "🔒", "🔓",
    ],
  },
  {
    name: "Symbols",
    icon: "💯",
    emojis: [
      "❤️", "✖️", "➕", "➖", "➗", "🟰", "♾️", "💲", "💱", "™️", "©️", "®️",
      "‼️", "⁉️", "❗", "❓", "💭", "💬", "🔇", "🔈", "🔉", "🔊", "🔔", "🔕",
      "🎵", "🎶", "🏧", "🚮", "🚰", "♿", "🚹", "🚺", "🛗", "🚻", "🚼", "🚾",
      "🛂", "🛃", "🛄", "🛅", "⚠️", "🚸", "⛔", "🚫", "🚳", "🚭", "🚯", "🚱",
      "🚷", "📵", "🔞", "☢️", "☣️", "✅", "❌", "❎", "➕", "➖", "➗", "✖️",
      "💠", "🌀", "♻️", "🈯", "🉐", "🈹", "🈚", "🈲", "🈺", "🈸", "🈴", "🈳",
      "㊗️", "㊙️", "🈁", "🈂️", "🅰️", "🅱️", "🆎", "🆑", "🅾️", "🆘", "🆚",
      "🈶", "🈷️", "🈸", "🉑", "🆔", "🈳", "🈴", "🈵", "🈶", "🈶", "🈹", "🈺",
      "🈷️", "🈯", "🉐", "🅰️", "🅱️", "🆎", "🆑", "🆒", "🆓", "ℹ️", "🆔",
      "Ⓜ️", "🆕", "🆖", "🅾️", "🆗", "🅿️", "🆘", "🆙", "🆚", "🈁", "🈂️",
      "🔟", "🔢", "🔣", "🔤", "🈸", "🈹", "🈷️", "🈶", "🈯", "🉐", "🈲", "🈳",
      "🈴", "🈵", "🔠", "🔡", "🔃", "🔄", "🔙", "🔚", "🔛", "🔜", "🔝", "🛐",
      "⚛️", "🕉️", "✡️", "☸️", "☯️", "✝️", "☦️", "☪️", "☮️", "🕎", "🔯",
      "♈", "♉", "♊", "♋", "♌", "♍", "♎", "♏", "♐", "♑", "♒", "♓",
      "⛎", "🔀", "🔁", "🔂", "▶️", "⏩", "⏭️", "⏯️", "◀️", "⏪", "⏮️", "🔼",
      "⏫", "🔽", "⏬", "⏸️", "⏹️", "⏺️", "⏏️", "🎦", "🔅", "🔆", "📶",
      "📳", "📴", "♀️", "♂️", "⚧️", "✖️", "➕", "➖", "➗", "🟰", "♾️", "💲",
      "💱", "™️", "©️", "®️", "‼️", "⁉️", "❗", "❓", "💭", "💬", "🔇", "🔈",
      "🔉", "🔊", "🔔", "🔕", "🚮", "🚰", "♿", "⚠️", "🚸", "⛔", "🚫", "🚳",
      "🚭", "🚯", "🚱", "🚷", "📵", "🔞", "🎗️", "🏳️", "🏴", "🏁", "🚩", "🏳️‍🌈",
    ],
  },
];

const EMOJIS: string[] = EMOJI_CATEGORIES.flatMap((c) => c.emojis);
const EMOJI_CATEGORY_NAMES = Object.fromEntries(
  EMOJI_CATEGORIES.map((c) => [c.name, c.emojis])
);

interface ChatUser {
  id: string;
  name: string;
  fullName: string;
  email: string;
  image: string | null;
  about: string;
  status: string;
  lastSeen: string | null;
}

interface Conversation {
  id: string;
  name: string;
  image: string | null;
  status: string;
  lastSeen: string | null;
  lastMessage: string;
  lastMessageIsMine: boolean;
  lastMessageAt: string;
  unread: number;
}

interface DmReaction {
  emoji: string;
  count: number;
  mine?: boolean;
}

/** Compact preview of the message a reply quotes. */
interface DmReplyPreview {
  id: string;
  senderId: string;
  text: string;
  mediaType: string | null;
  mediaName: string | null;
}

interface Dm {
  id: string;
  senderId: string;
  text: string;
  mediaUrl: string | null;
  mediaType: string | null;
  mediaName: string | null;
  readAt: string | null;
  createdAt: string;
  /** Quoted message, when this bubble is a reply. */
  replyTo?: DmReplyPreview | null;
  /** Set when the sender edited the text after sending. */
  editedAt?: string | null;
  /** Forwarded from another conversation. */
  forwarded?: boolean;
  reactions?: DmReaction[];
  /** Optimistic bubble that has not been confirmed by the server yet. */
  pending?: boolean;
  failed?: boolean;
}

/** Local per-chat preferences (pin / mute). Kept on the device so they work offline. */
interface ChatPref {
  pinned?: boolean;
  muted?: boolean;
}

interface StatusItem {
  id: string;
  userId: string;
  name: string;
  image: string | null;
  text: string | null;
  imageUrl: string | null;
  imageType: string | null;
  createdAt: string;
  viewCount: number;
  myReaction: string | null;
  reactions: { emoji: string; count: number }[];
  seenByFew: boolean;
  viewedByMe: boolean;
  viewers?: { userId: string; name: string; image: string | null; viewedAt: string }[];
}

// Poll cadence. Chat delivery here is poll-based (the Supabase realtime channel
// is gone), so these are a trade between how quickly a new message appears and
// how many requests each open device sends. They are only used while the page is
// actually visible — a background WebView is frozen and the native DM watcher
// takes over.
const POLL_MS = 10000;
const RING_POLL_MS = 10000;
/** Ceiling for the failure backoff: keeps a broken backend from being hammered. */
const POLL_MAX_MS = 60_000;

/** Quick reactions offered when a message is tapped. */
const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

/**
 * Merge a server snapshot with locally-pending bubbles. The poller must never drop an
 * optimistic message that is still in flight, otherwise a sent message flashes away until
 * the next poll picks it up.
 */
function mergeMessages(server: Dm[], local: Dm[]): Dm[] {
  const serverIds = new Set(server.map((m) => m.id));
  const inFlight = local.filter((m) => (m.pending || m.failed) && !serverIds.has(m.id));
  if (!inFlight.length) return server;
  return [...server, ...inFlight].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** One-line label for a media-only message (used by reply previews and search). */
function mediaPreviewLabel(type: string | null, name: string | null): string {
  if (type === "image") return "📷 Photo";
  if (type === "video") return "🎬 Video";
  if (type === "audio") return "🎤 Voice note";
  if (type) return `📎 ${name || "File"}`;
  return "";
}

/** Wrap every case-insensitive match of `query` in a <mark>, for in-chat search. */
function highlightText(text: string, query: string): ReactNode {
  const needle = query.trim();
  if (!needle) return text;
  const lower = text.toLowerCase();
  const target = needle.toLowerCase();
  if (!lower.includes(target)) return text;
  const parts: ReactNode[] = [];
  let from = 0;
  let at = lower.indexOf(target);
  let key = 0;
  while (at >= 0) {
    if (at > from) parts.push(text.slice(from, at));
    parts.push(
      <mark key={key++} className="rounded bg-yellow-300 px-0.5 text-black">
        {text.slice(at, at + target.length)}
      </mark>,
    );
    from = at + target.length;
    at = lower.indexOf(target, from);
  }
  if (from < text.length) parts.push(text.slice(from));
  return parts;
}

/** Recompute a bubble's reaction pills after reacting/reacting-off, before the server answers. */
function optimisticReaction(list: DmReaction[] | undefined, next: string): DmReaction[] {
  const previous = list ?? [];
  const mineNow = previous.find((r) => r.mine)?.emoji ?? null;
  const out = previous
    .map((r) => ({ ...r, mine: false }))
    .filter((r) => {
      if (r.emoji === mineNow) r.count -= 1;
      return r.count > 0;
    });
  if (next) {
    const hit = out.find((r) => r.emoji === next);
    if (hit) {
      hit.count += 1;
      hit.mine = true;
    } else {
      out.push({ emoji: next, count: 1, mine: true });
    }
  }
  return out;
}

const C = {
  bg: "var(--background)",
  panel: "var(--card)",
  header: "var(--card)",
  hover: "var(--accent)",
  bubbleMe: "var(--primary)",
  bubbleOther: "var(--muted)",
  tickBlue: "var(--primary)",
  muted: "var(--muted-foreground)",
  green: "var(--primary)",
  text: "var(--foreground)",
};

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: true });
}

function formatDay(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return "Today";
  const y = new Date();
  y.setDate(y.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return "Yesterday";
  return d.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });
}

function statusTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const mins = Math.floor((now.getTime() - d.getTime()) / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min${mins > 1 ? "s" : ""} ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs > 1 ? "s" : ""} ago`;
  return d.toLocaleDateString([], { day: "numeric", month: "short" });
}

function shortDate(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return formatTime(iso);
  const y = new Date();
  y.setDate(y.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return "Yesterday";
  return d.toLocaleDateString([], { day: "numeric", month: "short" });
}

function lastSeenLabel(lastSeen: string | null, status: string): string {
  if (status === "online") return "online";
  if (!lastSeen) return "last seen recently";
  const d = new Date(lastSeen);
  const diff = Math.floor((Date.now() - d.getTime()) / 60000);
  if (diff < 1) return "last seen just now";
  if (diff < 60) return `last seen ${diff} min ago`;
  const hours = Math.floor(diff / 60);
  if (hours < 24) return `last seen ${hours} hr ago`;
  return `last seen ${formatDay(lastSeen)}`;
}

function fileNameFromUrl(url: string, fallback: string | null): string {
  if (fallback) return fallback;
  const clean = url.split("?")[0].split("/").pop() || "media";
  return decodeURIComponent(clean);
}

function Avatar({
  src,
  name,
  online,
  size = 40,
}: {
  src: string | null | undefined;
  name: string;
  online?: boolean;
  size?: number;
}) {
  return (
    <div className="relative shrink-0">
      {src ? (
        <img
          src={src}
          alt=""
          style={{ width: size, height: size }}
          className="rounded-full object-cover"
        />
      ) : (
        <div
          style={{ width: size, height: size, background: "var(--accent)" }}
          className="flex items-center justify-center rounded-full"
        >
          {name ? (
            <span className="text-sm font-medium text-foreground">
              {name.charAt(0).toUpperCase()}
            </span>
          ) : (
            <UserRound className="h-5 w-5 text-muted-foreground" />
          )}
        </div>
      )}
      {online !== undefined && (
        <span
          className={cn(
            "absolute bottom-0 right-0 rounded-full border-2 border-card",
            online ? "bg-primary" : "bg-muted",
          )}
          style={{ width: Math.max(10, size / 4), height: Math.max(10, size / 4) }}
        />
      )}
    </div>
  );
}

function mediaBubble(
  m: Dm,
  onDownload: (url: string, name: string) => void,
  onOpen?: (media: LightboxMedia) => void,
) {
  if (!m.mediaUrl) return null;
  const name = fileNameFromUrl(m.mediaUrl, m.mediaName);
  let body: ReactNode;
  if (m.mediaType === "image") {
    body = (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onOpen?.({ url: m.mediaUrl as string, type: "image", name });
        }}
        className="block overflow-hidden rounded-lg"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={m.mediaUrl} alt={m.mediaName || "image"} className="max-h-64 object-cover" />
      </button>
    );
  } else if (m.mediaType === "video") {
    // A still preview that opens the full-screen player, the way a messaging app behaves.
    body = (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onOpen?.({ url: m.mediaUrl as string, type: "video", name });
        }}
        className="relative block overflow-hidden rounded-lg"
      >
        <video src={m.mediaUrl} preload="metadata" muted playsInline className="max-h-64 rounded-lg" />
        <span className="absolute inset-0 grid place-items-center bg-black/25">
          <span className="grid h-12 w-12 place-items-center rounded-full bg-black/60 text-white">
            ▶
          </span>
        </span>
      </button>
    );
  } else if (m.mediaType === "audio") {
    body = <audio src={m.mediaUrl} controls className="max-w-full" onClick={(e) => e.stopPropagation()} />;
  } else {
    body = (
      <a
        href={m.mediaUrl}
        target="_blank"
        rel="noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="underline underline-offset-2"
      >
        📎 {m.mediaName || "File"}
      </a>
    );
  }
  return (
    <div className="space-y-1.5">
      {body}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onDownload(m.mediaUrl as string, name);
        }}
        className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium transition-colors hover:bg-white/10"
      >
        <Download className="h-3 w-3" /> Save {name}
      </button>
    </div>
  );
}

export default function ChatPage() {
  const { data: session } = useSession();
  const sessionUserId = session?.user?.id;
  // The Android app has no NextAuth cookie, so its offline session carries a synthetic id
  // ("offline-user") that can never equal a real sender id — which made every bubble render as
  // received and hid "Delete for everyone". The chat API is the authority on who we are, so
  // adopt the id it reports ("offline-user" offline, the real id online) and fall back to the
  // session for the web, where a real session already exists.
  const [chatMeId, setChatMeId] = useState<string | null>(null);
  const me = chatMeId ?? sessionUserId;
  const myName = session?.user?.name || "";
  const myImage = (session?.user as { image?: string | null })?.image || null;
  const { showToast } = useToast();

  // The APK has no cookie session that can expire: a 401 there only means the device
  // token is stale. Signing out would discard the cached chats and force the user to
  // retype their password, so keep them signed in and offer to reconnect instead.
  const OFFLINE_BUILD = process.env.NEXT_PUBLIC_OFFLINE_BUILD === "1";
  const [needsReconnect, setNeedsReconnect] = useState(false);
  const signingOutRef = useRef(false);
  const forceReLogin = useCallback(async () => {
    if (OFFLINE_BUILD) {
      setNeedsReconnect(true);
      return;
    }
    if (signingOutRef.current) return;
    signingOutRef.current = true;
    try {
      await signOut({ callbackUrl: "/login" });
    } catch {
      window.location.href = "/login";
    }
  }, [OFFLINE_BUILD]);

  const [users, setUsers] = useState<ChatUser[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Dm[]>([]);
  // Latest messages, readable from callbacks that must not be re-created on each
  // message (markRead runs on every poll tick and is a dependency-stable ref).
  const messagesRef = useRef<Dm[]>([]);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // Device-local chat preferences. They deliberately do not need the server: pinning a
  // chat or starring a message must keep working in the offline APK.
  useEffect(() => {
    if (!me) return;
    try {
      const raw = localStorage.getItem(`biopulse-chat-stars:${me}`);
      setStarredIds(new Set(raw ? (JSON.parse(raw) as string[]) : []));
    } catch {
      setStarredIds(new Set());
    }
    try {
      const raw = localStorage.getItem(`biopulse-chat-prefs:${me}`);
      setChatPrefs(raw ? (JSON.parse(raw) as Record<string, ChatPref>) : {});
    } catch {
      setChatPrefs({});
    }
  }, [me]);

  const persistStarred = useCallback(
    (next: Set<string>) => {
      if (!me) return;
      try {
        localStorage.setItem(`biopulse-chat-stars:${me}`, JSON.stringify([...next]));
      } catch {
        /* storage full / private mode */
      }
    },
    [me],
  );

  const persistChatPrefs = useCallback(
    (next: Record<string, ChatPref>) => {
      if (!me) return;
      try {
        localStorage.setItem(`biopulse-chat-prefs:${me}`, JSON.stringify(next));
      } catch {
        /* storage full / private mode */
      }
    },
    [me],
  );

  // ---- "typing…" -------------------------------------------------------
  // Writes are throttled to one every couple of seconds and stop on send/blur, so a
  // fast typist cannot turn the composer into a write storm on the free database.
  const typingSentRef = useRef(0);
  const typingStopRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopTypingRef = useRef<() => void>(() => {});

  const sendTypingState = (partnerId: string, typing: boolean) => {
    if (!partnerId) return;
    fetch("/api/chat/typing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ partnerId, typing }),
    }).catch(() => {
      /* the TTL expires it anyway */
    });
  };

  const notifyTyping = () => {
    if (!activeId || editTarget) return;
    const now = Date.now();
    if (now - typingSentRef.current > 2500) {
      typingSentRef.current = now;
      sendTypingState(activeId, true);
    }
    if (typingStopRef.current) clearTimeout(typingStopRef.current);
    typingStopRef.current = setTimeout(() => {
      typingSentRef.current = 0;
      if (activeId) sendTypingState(activeId, false);
    }, 3200);
  };

  const stopTyping = () => {
    if (typingStopRef.current) {
      clearTimeout(typingStopRef.current);
      typingStopRef.current = null;
    }
    if (typingSentRef.current && activeId) sendTypingState(activeId, false);
    typingSentRef.current = 0;
  };
  stopTypingRef.current = stopTyping;

  // Poll the partner's typing flag a little faster than messages, and only while this
  // thread is open and visible.
  useEffect(() => {
    setPeerTyping(false);
    if (!activeId || !me) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let failStreak = 0;

    const schedule = (ms: number) => {
      if (!stopped) timer = setTimeout(check, ms);
    };

    async function check() {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") {
        schedule(4000);
        return;
      }
      try {
        const res = await fetch(
          `/api/chat/typing?partnerId=${encodeURIComponent(activeId as string)}`,
          { cache: "no-store" },
        );
        if (res.ok) {
          const data = (await res.json()) as { typing?: boolean };
          if (!stopped) setPeerTyping(data.typing === true);
          failStreak = 0;
        } else {
          failStreak = Math.min(failStreak + 1, 4);
        }
      } catch {
        failStreak = Math.min(failStreak + 1, 4);
      }
      schedule(Math.min(8000, 2500 * 2 ** failStreak));
    }

    schedule(1200);
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [activeId, me]);
  const [text, setText] = useState("");
  const [replyDraft, setReplyDraft] = useState("");
  const [search, setSearch] = useState("");
  const [newChatSearch, setNewChatSearch] = useState("");
  const [tab, setTab] = useState<"chats" | "status" | "calls">("chats");
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [sending, setSending] = useState(false);
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [mobilePane, setMobilePane] = useState<"list" | "chat">("list");
  const [menuOpen, setMenuOpen] = useState<"none" | "header" | "chat">("none");
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [emojiCategory, setEmojiCategory] = useState("Smileys");
  const [emojiQuery, setEmojiQuery] = useState("");
  const [contactOpen, setContactOpen] = useState(false);
  const [callPeer, setCallPeer] = useState<CallPeer | null>(null);
  const [callRole, setCallRole] = useState<"caller" | "callee">("caller");
  const [callKind, setCallKind] = useState<CallKind>("video");
  const [recording, setRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [recordingError, setRecordingError] = useState("");
  /** The message whose tap-menu (reply / react / copy / edit / delete) is open. */
  const [actionMsg, setActionMsg] = useState<Dm | null>(null);
  const [lightbox, setLightbox] = useState<LightboxMedia | null>(null);
  /** Message being quoted in the composer. */
  const [replyTarget, setReplyTarget] = useState<Dm | null>(null);
  /** Own message being edited in the composer (WhatsApp's 15-minute window). */
  const [editTarget, setEditTarget] = useState<Dm | null>(null);
  /** Message being forwarded (opens the "Forward to" sheet). */
  const [forwardMsg, setForwardMsg] = useState<Dm | null>(null);
  /** Message whose Sent/Read info is open. */
  const [infoMsg, setInfoMsg] = useState<Dm | null>(null);
  /** Partner is typing in the open thread (polled). */
  const [peerTyping, setPeerTyping] = useState(false);
  /** In-chat search. */
  const [msgSearchOpen, setMsgSearchOpen] = useState(false);
  const [msgSearch, setMsgSearch] = useState("");
  /** Starred message ids for this account (device-local, works offline). */
  const [starredIds, setStarredIds] = useState<Set<string>>(new Set());
  const [starredOpen, setStarredOpen] = useState(false);
  /** Pinned / muted chats for this account (device-local, works offline). */
  const [chatPrefs, setChatPrefs] = useState<Record<string, ChatPref>>({});
  const composerRef = useRef<HTMLInputElement>(null);
  const [statuses, setStatuses] = useState<StatusItem[]>([]);
  /**
   * Set when a chat request failed and the last saved snapshot is on screen, so
   * the UI can say so instead of silently pretending the stale data is live.
   */
  const [staleData, setStaleData] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [statusText, setStatusText] = useState("");
  const [statusMedia, setStatusMedia] = useState<{ url: string; type: string; name: string } | null>(null);
  const [statusBusy, setStatusBusy] = useState(false);
  const [viewerItems, setViewerItems] = useState<StatusItem[] | null>(null);
  const [viewerIdx, setViewerIdx] = useState(0);
  const [viewerProgress, setViewerProgress] = useState(0);
  const [viewerReactionsOpen, setViewerReactionsOpen] = useState(false);
  const [viewerViewersOpen, setViewerViewersOpen] = useState(false);
  const [viewerReplyTo, setViewerReplyTo] = useState<StatusItem | null>(null);
  const [viewerPaused, setViewerPaused] = useState(false);
  const viewerVideoRef = useRef<HTMLVideoElement | null>(null);
  const pausedRef = useRef(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const toggleMenu = (which: "header" | "chat") => {
    setMenuOpen((cur) => (cur === which ? "none" : which));
  };

  const messagesScrollRef = useRef<HTMLDivElement>(null);
  const nearBottomRef = useRef(true);
  const prevActiveRef = useRef<string | null>(null);
  const activeRoomRef = useRef<string | null>(null);
  const longPressRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Set when a long-press opened the menu, so the click that follows does not re-open it.
  const suppressTapRef = useRef(false);

  const handleMessagesScroll = () => {
    const el = messagesScrollRef.current;
    if (!el) return;
    nearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  };

  useEffect(() => {
    // Switching conversations always snaps to the bottom; otherwise only
    // stick to the bottom when the user is already near it, so polling
    // refreshes don't yank you up while reading history.
    if (prevActiveRef.current !== activeId) {
      prevActiveRef.current = activeId;
      nearBottomRef.current = true;
    }
    if (!nearBottomRef.current) return;
    const el = messagesScrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, activeId]);

  const activeUser = users.find((u) => u.id === activeId) || null;

  // ---- Voice & video calls --------------------------------------------
  // The overlay handles signaling (offer/answer/ICE) and the callee's own
  // `hello`. Nothing extra to send here — mounting the overlay starts the call.
  const startCall = useCallback((u: ChatUser, kind: CallKind = "video") => {
    setCallKind(kind);
    setCallRole("caller");
    setCallPeer({ id: u.id, name: u.fullName || u.name, avatar: u.image });
  }, []);

  const startCallWith = useCallback(
    (kind: CallKind) => {
      if (!activeUser) return;
      startCall(activeUser, kind);
    },
    [activeUser, startCall]
  );

  const closeCall = useCallback(() => {
    setCallPeer(null);
  }, []);

  const loadConversations = useCallback(async (): Promise<boolean> => {
    let list: Conversation[] | null = null;
    let me: string | undefined;
    let degraded = true;
    // Two attempts: the serverless database may be resuming from idle.
    for (let attempt = 0; attempt < 2 && degraded; attempt++) {
      try {
        const res = await fetch("/api/chat/conversations");
        if (!res.ok) {
          if (res.status !== 500) break; // 401 etc. — a retry cannot help
          continue;
        }
        const data = await res.json();
        list = (data.conversations || []) as Conversation[];
        me = typeof data.me === "string" && data.me ? data.me : undefined;
        // The Android offline shim answers 200 with `offline: true` when it could
        // not reach the server, so that body is not a live list.
        degraded = data.offline === true;
        if (degraded) break;
      } catch {
        break;
      }
    }
    if (!degraded && list) {
      setConversations(list);
      if (me) setChatMeId(me);
      saveCachedConversations(list, me);
      setStaleData(false);
      return true;
    }
    // The database is unreachable (quota outage, offline phone, dev server down).
    // Replay the last saved thread list instead of blanking the pane.
    const cached = loadCachedConversations<Conversation>();
    if (cached) {
      setConversations((prev) => (prev.length ? prev : cached.conversations));
      if (cached.me) setChatMeId(cached.me);
      setStaleData(true);
    }
    return false;
  }, []);

  const loadUsers = useCallback(async () => {
    let list: ChatUser[] | null = null;
    let degraded = true;
    try {
      const res = await fetch("/api/chat/users");
      if (res.ok) {
        const data = await res.json();
        list = (data.users || []) as ChatUser[];
        degraded = data.offline === true;
      }
    } catch {
      /* degraded */
    }
    if (!degraded && list) {
      setUsers(list);
      saveCachedUsers(list);
      return;
    }
    // Contacts only exist server-side, so a database outage used to leave the
    // Calls list permanently empty. Keep the last saved list on screen instead.
    const cached = loadCachedUsers<ChatUser>();
    const next = list && list.length ? list : cached;
    if (next) {
      setUsers((prev) => (prev.length ? prev : next));
      setStaleData(true);
    }
  }, []);

  const loadMessages = useCallback(async (partnerId: string): Promise<boolean> => {
    let next: Dm[] | null = null;
    let degraded = true;
    try {
      setLoadingMsgs(true);
      // Two attempts: the serverless database may be resuming from idle.
      for (let attempt = 0; attempt < 2 && degraded; attempt++) {
        const res = await fetch(`/api/chat/messages?partnerId=${encodeURIComponent(partnerId)}&limit=200`);
        if (!res.ok) {
          if (res.status !== 500) break; // 401 etc. — a retry cannot help
          continue;
        }
        const data = await res.json();
        next = (data.messages || []) as Dm[];
        degraded = data.offline === true;
        if (degraded) break;
      }
    } catch {
      /* degraded */
    } finally {
      setLoadingMsgs(false);
    }
    if (!degraded && next) {
      const list = next;
      // Merge rather than replace so an in-flight optimistic bubble is not wiped out
      // by a poll that raced the POST.
      setMessages((prev) => mergeMessages(list, prev));
      saveCachedMessages(partnerId, list);
      return true;
    }
    // The database is unreachable — show the last saved thread for this partner,
    // plus anything the offline shim returned, instead of an empty conversation.
    const cached = loadCachedMessages<Dm>(partnerId);
    const fallback = next && next.length ? next : cached;
    if (fallback && fallback.length) {
      setMessages((prev) => mergeMessages(fallback, prev));
      setStaleData(true);
    }
    return false;
  }, []);

  const markRead = useCallback(
    async (partnerId: string, opts: { force?: boolean } = {}) => {
      // This runs on every poll tick. Asking the server to mark a thread read
      // when nothing in it is unread is a database *write* every few seconds for
      // as long as the thread stays open, so only send it when there is really
      // something to clear — or when the caller just opened the thread and wants
      // the badge gone immediately.
      const hasUnread =
        opts.force === true ||
        messagesRef.current.some((m) => m.senderId === partnerId && !m.readAt);

      if (hasUnread) {
        try {
          await fetch("/api/chat/read", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ partnerId }),
          });
        } catch {
          /* ignore */
        }
      }
      // The thread is on screen now, so take away any system notification for it (the Android
      // shell keeps one per partner until it is tapped or the conversation is read here).
      try {
        (
          window as unknown as {
            BioPulseBridge?: { dismissChatNotification?: (id: string) => void };
          }
        ).BioPulseBridge?.dismissChatNotification?.(partnerId);
      } catch {
        /* bridge unavailable */
      }
      setMessages((prev) =>
        prev.map((m) =>
          m.senderId === partnerId && !m.readAt ? { ...m, readAt: new Date().toISOString() } : m,
        ),
      );
      if (hasUnread) loadConversations();
    },
    [loadConversations],
  );

  const updatePresence = useCallback(async (status: string) => {
    try {
      const res = await fetch("/api/chat/presence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (res.status === 401) forceReLogin();
    } catch {
      /* ignore */
    }
  }, [forceReLogin]);

  useEffect(() => {
    loadConversations();
    loadUsers();
    updatePresence("online");
    // Heartbeat only while the tab is visible so a hidden/backgrounded tab
    // doesn't flip the user back to "online" after we've gone offline. Each beat
    // is a database *write*, so it is deliberately slow: presence being a minute
    // stale is invisible next to paying for a write every 15s on every open
    // device. Going offline is immediate via the visibility/unload handlers.
    const hb = setInterval(() => {
      if (!document.hidden) updatePresence("online");
    }, 60000);
    const handleVisibility = () => updatePresence(document.hidden ? "offline" : "online");
    document.addEventListener("visibilitychange", handleVisibility);
    const beforeUnload = () => {
      try {
        navigator.sendBeacon?.("/api/chat/presence", JSON.stringify({ status: "offline" }));
      } catch {
        /* ignore */
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => {
      clearInterval(hb);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("beforeunload", beforeUnload);
    };
  }, [loadConversations, loadUsers, updatePresence]);

  const openChat = useCallback(
    (id: string) => {
      stopTypingRef.current();
      setActiveId(id);
      activeRoomRef.current = id;
      setMobilePane("chat");
      setNewChatOpen(false);
      setReplyTarget(null);
      setEditTarget(null);
      setMsgSearchOpen(false);
      setMsgSearch("");
      // Drop the previous thread first: its bubbles would otherwise keep rendering under the
      // new partner until the fetch lands, and since ownership is derived from the partner they
      // would all paint as ours — the very "both sides on one side" glitch.
      setMessages([]);
      loadUsers();
      loadMessages(id);
      // Opening a thread always clears its unread badge, even though the local
      // message list is still empty at this instant.
      markRead(id, { force: true });
    },
    [loadUsers, loadMessages, markRead],
  );

  const closeChat = useCallback(() => {
    stopTypingRef.current();
    setActiveId(null);
    activeRoomRef.current = null;
    setMessages([]);
    setReplyTarget(null);
    setEditTarget(null);
    setMsgSearchOpen(false);
    setMsgSearch("");
    setMobilePane("list");
  }, []);

  // Open a specific conversation when arriving from a message notification
  // (/chat?partner=<id>), then drop the query so a reload does not re-open it.
  useEffect(() => {
    try {
      const pid = new URLSearchParams(window.location.search).get("partner");
      if (pid) {
        openChat(pid);
        window.history.replaceState(null, "", "/chat");
      }
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Ask once for notification permission so new-message notifications can appear on
  // the web/PWA. The Android app uses the native bridge and needs no permission here.
  useEffect(() => {
    try {
      if (typeof Notification !== "undefined" && Notification.permission === "default") {
        void Notification.requestPermission();
      }
    } catch {
      /* ignore */
    }
  }, []);

  // Apply a pending status reply once the target chat is active.
  useEffect(() => {
    if (replyDraft && activeId) {
      setText(replyDraft);
      setReplyDraft("");
    }
  }, [replyDraft, activeId]);

  const loadStatuses = useCallback(async () => {
    try {
      const res = await fetch("/api/chat/status");
      if (res.ok) {
        const data = await res.json();
        setStatuses(data.statuses || []);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (tab !== "status") return;
    const tick = () => {
      if (document.hidden) return;
      void loadStatuses();
    };
    tick();
    // Statuses are ambient, and each poll re-reads the whole feed for every
    // viewer, so refresh slowly and only while the tab is on screen.
    const id = setInterval(tick, 60000);
    const onVisible = () => {
      if (!document.hidden) void loadStatuses();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [tab, loadStatuses]);

  const postStatus = async () => {
    const t = statusText.trim();
    if ((!t && !statusMedia) || !me) return;
    setStatusBusy(true);
    try {
      const res = await fetch("/api/chat/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: t || undefined,
          imageUrl: statusMedia?.url || undefined,
          imageType: statusMedia?.type || undefined,
        }),
      });
      if (res.status === 401) {
        forceReLogin();
        return;
      }
      if (res.ok) {
        setStatusText("");
        setStatusMedia(null);
        setComposerOpen(false);
        loadStatuses();
      } else {
        const d = await res.json().catch(() => ({}));
        showToast(d.error || "Could not add status", "error");
      }
    } catch {
      showToast("Could not add status", "error");
    } finally {
      setStatusBusy(false);
    }
  };

  const clearMyStatus = async () => {
    try {
      const res = await fetch("/api/chat/status", { method: "DELETE" });
      if (res.status === 401) {
        forceReLogin();
        return;
      }
      if (res.ok) {
        loadStatuses();
        showToast("Status cleared.", "success");
      } else {
        showToast("Could not clear status", "error");
      }
    } catch {
      showToast("Could not clear status", "error");
    }
  };

  const pickStatusImage = async (file: File) => {
    if (!file) return;
    setStatusBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/chat/upload", { method: "POST", body: fd });
      if (res.ok) {
        const d = await res.json();
        setStatusMedia({ url: d.mediaUrl, type: d.mediaType || "image", name: d.mediaName || "image" });
      } else {
        const d = await res.json().catch(() => ({}));
        showToast(d.error || "Upload failed", "error");
      }
    } catch {
      showToast("Upload failed", "error");
    } finally {
      setStatusBusy(false);
    }
  };

  const myStatusItems = statuses.filter((s) => s.userId === me);
  const otherGroups: { userId: string; name: string; image: string | null; items: StatusItem[] }[] = [];
  for (const s of statuses) {
    if (s.userId === me) continue;
    let g = otherGroups.find((x) => x.userId === s.userId);
    if (!g) {
      g = { userId: s.userId, name: s.name, image: s.image, items: [] };
      otherGroups.push(g);
    }
    g.items.push(s);
  }
  otherGroups.sort((a, b) => new Date(b.items[0].createdAt).getTime() - new Date(a.items[0].createdAt).getTime());

  const openStatusViewer = (items: StatusItem[]) => {
    setViewerItems(items);
    setViewerIdx(0);
    setViewerProgress(0);
    setViewerReactionsOpen(false);
    setViewerViewersOpen(false);
    items.forEach((s) => {
      if (s.userId !== me && !s.viewedByMe) markStatusViewed(s.id);
    });
  };

  const markStatusViewed = async (statusId: string) => {
    try {
      const res = await fetch("/api/chat/status/view", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ statusId }),
      });
      if (res.status === 401) {
        forceReLogin();
        return;
      }
      setStatuses((prev) =>
        prev.map((s) => (s.id === statusId ? { ...s, viewedByMe: true, viewCount: s.viewCount + 1 } : s)),
      );
    } catch {
      /* ignore */
    }
  };

  const reactToStatus = async (statusId: string, emoji: string) => {
    try {
      const res = await fetch("/api/chat/status/reaction", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ statusId, emoji }),
      });
      if (res.status === 401) {
        forceReLogin();
        return;
      }
      if (res.ok) {
        const d = await res.json();
        setStatuses((prev) =>
          prev.map((s) =>
            s.id === statusId ? { ...s, myReaction: d.myReaction, reactions: d.reactions } : s,
          ),
        );
        setViewerItems((prev) =>
          prev ? prev.map((s) => (s.id === statusId ? { ...s, myReaction: d.myReaction, reactions: d.reactions } : s)) : prev,
        );
      } else {
        const d = await res.json().catch(() => ({}));
        showToast(d.error || "Could not react", "error");
      }
    } catch {
      showToast("Could not react", "error");
    }
  };

  const replyToStatus = (item: StatusItem) => {
    setViewerItems(null);
    if (!item.userId) return;
    openChat(item.userId);
    const quoted = item.text ? item.text.trim() : item.imageType === "video" ? "video status" : "photo status";
    setReplyDraft(`Re: ${quoted.slice(0, 80)}`);
  };

  const viewerNext = () => {
    if (!viewerItems) return;
    const next = viewerIdx + 1;
    if (next >= viewerItems.length) {
      setViewerItems(null);
    } else {
      setViewerIdx(next);
      setViewerProgress(0);
    }
  };

  const viewerPrev = () => {
    if (viewerIdx > 0) {
      setViewerIdx(viewerIdx - 1);
      setViewerProgress(0);
    } else {
      setViewerItems(null);
    }
  };

  useEffect(() => {
    pausedRef.current = viewerPaused;
  }, [viewerPaused]);

  useEffect(() => {
    if (!viewerItems) return;
    setViewerProgress(0);
    const item = viewerItems[viewerIdx];
    if (!item) return;
    if (item.imageType === "video") return; // video progress driven by timeupdate
    const id = setInterval(() => {
      if (pausedRef.current) return;
      setViewerProgress((p) => Math.min(100, p + (100 * 50) / 5000));
    }, 50);
    return () => clearInterval(id);
  }, [viewerItems, viewerIdx]);

  useEffect(() => {
    if (viewerProgress >= 100 && viewerItems) {
      const t = setTimeout(viewerNext, 250);
      return () => clearTimeout(t);
    }
  }, [viewerProgress, viewerItems]);

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let failStreak = 0;

    function schedule(ms: number) {
      if (stopped) return;
      timer = setTimeout(() => void tick(), ms);
    }

    async function tick() {
      // While the app is in the background the native DM watcher (MediaPlaybackService)
      // owns delivery, so the page poller stands down and protects the battery.
      if (typeof document !== "undefined" && document.visibilityState !== "visible") {
        schedule(POLL_MS);
        return;
      }
      let ok = await loadConversations();
      const room = activeRoomRef.current;
      if (room) {
        const messagesOk = await loadMessages(room);
        markRead(room);
        ok = ok && messagesOk;
      }
      // Back off while the backend is unhealthy (database suspended, no network).
      // Polling at full rate through an outage only multiplies the load that made
      // it unhealthy in the first place.
      failStreak = ok ? 0 : Math.min(failStreak + 1, 5);
      schedule(ok ? POLL_MS : Math.min(POLL_MAX_MS, POLL_MS * 2 ** failStreak));
    }

    schedule(POLL_MS);
    // Catch up immediately after returning to the app (the interval may have been frozen).
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      if (timer) clearTimeout(timer);
      failStreak = 0;
      void tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [loadConversations, loadMessages, markRead]);

  // Real-time via Supabase broadcast
  useEffect(() => {
    if (!isSupabaseConfigured || !me) return;

    const dm = supabase.channel("dm-events");
    const presence = supabase.channel("presence-events");

    dm
      .on("broadcast", { event: "new" }, () => {
        loadConversations();
        if (activeRoomRef.current) loadMessages(activeRoomRef.current);
      })
      .on("broadcast", { event: "read" }, () => {
        if (activeRoomRef.current) loadMessages(activeRoomRef.current);
        loadConversations();
      })
      .subscribe();

    presence.on("broadcast", { event: "presence" }, () => {
      loadConversations();
      loadUsers();
    });

    presence.subscribe();

    return () => {
      supabase.removeChannel(dm);
      supabase.removeChannel(presence);
    };
  }, [me, loadConversations, loadMessages, loadUsers]);

  // Incoming call ring. Supabase realtime is unavailable (dead project), so we
  // poll a lightweight endpoint that surfaces unanswered call signals.
  useEffect(() => {
    if (!me) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let failStreak = 0;

    function schedule(ms: number) {
      if (stopped) return;
      timer = setTimeout(() => void check(), ms);
    }

    async function check() {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") {
        schedule(RING_POLL_MS);
        return;
      }
      let ok = false;
      try {
        const res = await fetch("/api/chat/call-signal/incoming", { cache: "no-store" });
        ok = res.ok;
        if (ok && !stopped) {
          const data = (await res.json()) as {
            caller?: CallPeer & { callId: string; kind?: CallKind };
          };
          const caller = data.caller;
          if (caller?.id && caller.id !== me && !callPeerRef.current) {
            setCallKind(caller.kind === "voice" ? "voice" : "video");
            setCallRole("callee");
            setCallPeer({ id: caller.id, name: caller.name, avatar: caller.avatar });
          }
        }
      } catch {
        ok = false;
      }
      failStreak = ok ? 0 : Math.min(failStreak + 1, 5);
      schedule(ok ? RING_POLL_MS : Math.min(POLL_MAX_MS, RING_POLL_MS * 2 ** failStreak));
    }

    void check();
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      if (timer) clearTimeout(timer);
      failStreak = 0;
      void check();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [me]);

  const callPeerRef = useRef<CallPeer | null>(null);
  useEffect(() => {
    callPeerRef.current = callPeer;
  }, [callPeer]);

  const sendMessage = async (payload: {
    text?: string;
    mediaUrl?: string;
    mediaType?: string;
    mediaName?: string;
    forwarded?: boolean;
  }) => {
    if (!activeId || !me) return;
    const room = activeId;
    const quoted = replyTarget;
    // Show the bubble immediately; the server round-trip (and the poller) only reconciles it.
    const tempId = `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const optimistic: Dm = {
      id: tempId,
      senderId: me,
      text: payload.text ?? "",
      mediaUrl: payload.mediaUrl ?? null,
      mediaType: payload.mediaType ?? null,
      mediaName: payload.mediaName ?? null,
      readAt: null,
      createdAt: new Date().toISOString(),
      replyTo: quoted
        ? {
            id: quoted.id,
            senderId: quoted.senderId,
            text: quoted.text,
            mediaType: quoted.mediaType,
            mediaName: quoted.mediaName,
          }
        : null,
      editedAt: null,
      forwarded: payload.forwarded === true,
      reactions: [],
      pending: true,
    };
    stopTyping();
    setReplyTarget(null);
    setEditTarget(null);
    nearBottomRef.current = true;
    setMessages((prev) => [...prev, optimistic]);
    setSending(true);
    try {
      const res = await fetch("/api/chat/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          partnerId: room,
          ...payload,
          replyToId: quoted?.id,
        }),
      });
      if (res.status === 401) {
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
        forceReLogin();
        return;
      }
      if (res.ok) {
        const data = await res.json().catch(() => null);
        const saved: Dm | null = data?.message ?? null;
        setMessages((prev) => {
          if (!saved) return prev.map((m) => (m.id === tempId ? { ...m, pending: false } : m));
          // A poll may already have delivered the real row — then just drop the placeholder.
          if (prev.some((m) => m.id === saved.id)) return prev.filter((m) => m.id !== tempId);
          return prev.map((m) => (m.id === tempId ? { ...saved, reactions: saved.reactions ?? [] } : m));
        });
        loadConversations();
        if (isSupabaseConfigured) {
          await supabase.channel("dm-events").send({
            type: "broadcast",
            event: "new",
            payload: { room, from: me, at: new Date().toISOString() },
          });
        }
      } else {
        const d = await res.json().catch(() => ({}));
        setMessages((prev) =>
          prev.map((m) => (m.id === tempId ? { ...m, pending: false, failed: true } : m)),
        );
        showToast(d.error || "Failed to send", "error");
      }
    } catch {
      setMessages((prev) =>
        prev.map((m) => (m.id === tempId ? { ...m, pending: false, failed: true } : m)),
      );
      showToast("Failed to send", "error");
    } finally {
      setSending(false);
    }
  };

  const handleSendText = () => {
    const t = text.trim();
    if (!t) return;
    if (editTarget) {
      void saveEdit(t);
      return;
    }
    // Clear the composer at once — the bubble is already on screen and waiting for the
    // round-trip is exactly the lag we are removing. A failure keeps the bubble in a
    // "failed" state instead of losing the text.
    setText("");
    setEmojiOpen(false);
    stopTyping();
    sendMessage({ text: t });
  };

  /** Save an edit inside WhatsApp's 15-minute window and paint it immediately. */
  const saveEdit = async (value: string) => {
    const target = editTarget;
    if (!target) return;
    setEditTarget(null);
    setText("");
    setEmojiOpen(false);
    setMessages((prev) =>
      prev.map((m) =>
        m.id === target.id ? { ...m, text: value, editedAt: new Date().toISOString() } : m,
      ),
    );
    try {
      const res = await fetch("/api/chat/messages", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId: target.id, text: value }),
      });
      if (res.status === 401) {
        forceReLogin();
        return;
      }
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        showToast(d.error || "Could not edit the message", "error");
        if (activeId) loadMessages(activeId);
        return;
      }
      const d = await res.json().catch(() => null);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === target.id ? { ...m, editedAt: d?.message?.editedAt ?? m.editedAt } : m,
        ),
      );
      showToast("Message edited", "success");
      loadConversations();
    } catch {
      showToast("Could not edit the message", "error");
      if (activeId) loadMessages(activeId);
    }
  };

  const startReply = (m: Dm) => {
    setActionMsg(null);
    setEditTarget(null);
    setReplyTarget(m);
    window.setTimeout(() => composerRef.current?.focus(), 50);
  };

  const startEdit = (m: Dm) => {
    setActionMsg(null);
    setReplyTarget(null);
    setEditTarget(m);
    setText(m.text);
    window.setTimeout(() => composerRef.current?.focus(), 50);
  };

  const startForward = (m: Dm) => {
    setActionMsg(null);
    setForwardMsg(m);
  };

  const doForward = async (partnerId: string) => {
    const m = forwardMsg;
    if (!m) return;
    setForwardMsg(null);
    try {
      const res = await fetch("/api/chat/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          partnerId,
          text: m.text,
          mediaUrl: m.mediaUrl || undefined,
          mediaType: m.mediaType || undefined,
          mediaName: m.mediaName || undefined,
          forwarded: true,
        }),
      });
      if (res.status === 401) {
        forceReLogin();
        return;
      }
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        showToast(d.error || "Could not forward the message", "error");
        return;
      }
      showToast("Message forwarded", "success");
      loadConversations();
      if (partnerId === activeId) loadMessages(partnerId);
    } catch {
      showToast("Could not forward the message", "error");
    }
  };

  const toggleStarred = (messageId: string) => {
    setActionMsg(null);
    const had = starredIds.has(messageId);
    const next = new Set(starredIds);
    if (had) next.delete(messageId);
    else next.add(messageId);
    setStarredIds(next);
    persistStarred(next);
    showToast(had ? "Removed from starred" : "Message starred", "success");
  };

  const updateChatPref = (partnerId: string, patch: ChatPref) => {
    setChatPrefs((prev) => {
      const next = { ...prev, [partnerId]: { ...prev[partnerId], ...patch } };
      persistChatPrefs(next);
      return next;
    });
  };

  const togglePinChat = (partnerId: string) => {
    const pinned = !chatPrefs[partnerId]?.pinned;
    updateChatPref(partnerId, { pinned });
    setMenuOpen("none");
    showToast(pinned ? "Chat pinned" : "Chat unpinned", "success");
  };

  const toggleMuteChat = (partnerId: string) => {
    const muted = !chatPrefs[partnerId]?.muted;
    updateChatPref(partnerId, { muted });
    setMenuOpen("none");
    showToast(muted ? "Notifications muted" : "Notifications unmuted", "success");
  };


  const beginLongPress = (m: Dm) => {
    if (longPressRef.current) clearTimeout(longPressRef.current);
    longPressRef.current = setTimeout(() => {
      // Swallow the click that ends this same touch, but not the next one.
      suppressTapRef.current = true;
      window.setTimeout(() => {
        suppressTapRef.current = false;
      }, 700);
      setActionMsg(m);
    }, 420);
  };

  const endLongPress = () => {
    if (longPressRef.current) {
      clearTimeout(longPressRef.current);
      longPressRef.current = null;
    }
  };

  const tapMessage = (m: Dm) => {
    if (suppressTapRef.current) return;
    // Media bubbles open the viewer on tap; the menu is reachable by long-press.
    if (m.mediaUrl && (m.mediaType === "image" || m.mediaType === "video")) {
      setLightbox({ url: m.mediaUrl, type: m.mediaType, name: m.mediaName });
      return;
    }
    setActionMsg(m);
  };

  const openMedia = (media: LightboxMedia) => {
    if (suppressTapRef.current) return;
    setLightbox(media);
  };

  const reactToMessage = async (messageId: string, emoji: string) => {
    const target = messages.find((m) => m.id === messageId);
    const already = target?.reactions?.some((r) => r.emoji === emoji && r.mine) ?? false;
    const next = already ? "" : emoji;
    setActionMsg(null);
    // Paint the change straight away, then let the server confirm the tally.
    setMessages((prev) =>
      prev.map((m) => (m.id === messageId ? { ...m, reactions: optimisticReaction(m.reactions, next) } : m)),
    );
    try {
      const res = await fetch("/api/chat/reactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId, emoji: next }),
      });
      if (res.ok) {
        const data = await res.json().catch(() => null);
        if (Array.isArray(data?.reactions)) {
          setMessages((prev) =>
            prev.map((m) => (m.id === messageId ? { ...m, reactions: data.reactions } : m)),
          );
        }
      }
    } catch {
      /* the next poll reconciles */
    }
  };

  const deleteMessage = async (messageId: string, scope: "me" | "everyone") => {
    setActionMsg(null);
    setMessages((prev) => prev.filter((m) => m.id !== messageId));
    try {
      const res = await fetch("/api/chat/messages", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId, scope }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        showToast(d.error || "Could not delete the message", "error");
        if (activeId) loadMessages(activeId);
        return;
      }
      showToast(scope === "everyone" ? "Deleted for everyone" : "Deleted for you", "success");
      loadConversations();
    } catch {
      showToast("Could not delete the message", "error");
      if (activeId) loadMessages(activeId);
    }
  };

  const copyMessage = async (m: Dm) => {
    setActionMsg(null);
    const value = m.mediaUrl && !m.text ? m.mediaUrl : m.text;
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      showToast("Copied", "success");
    } catch {
      showToast("Could not copy", "error");
    }
  };

  const saveMedia = (url: string, name: string) => {
    try {
      const bridge = (window as any).BioPulseBridge;
      if (bridge && typeof bridge.downloadFile === "function") {
        bridge.downloadFile(url, name);
        showToast("Download started — check your Downloads/BioPulse folder.", "success");
        return;
      }
      fetch(url)
        .then((r) => (r.ok ? r.blob() : Promise.reject()))
        .then((blob) => {
          const a = document.createElement("a");
          a.href = URL.createObjectURL(blob);
          a.download = name;
          document.body.appendChild(a);
          a.click();
          a.remove();
          URL.revokeObjectURL(a.href);
          showToast("Downloaded.", "success");
        })
        .catch(() => showToast("Could not download this file.", "error"));
    } catch {
      showToast("Could not start download.", "error");
    }
  };

  const insertEmoji = (e: string) => {
    setText((t) => t + e);
    setEmojiOpen(false);
  };

  const startRecording = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setRecordingError("Recording is not supported in this browser.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunksRef.current = [];
      let mimeType = "";
      for (const mt of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"]) {
        if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(mt)) {
          mimeType = mt;
          break;
        }
      }
      const rec = new MediaRecorder(
        stream,
        mimeType ? { mimeType } : undefined,
      );
      mediaRecorderRef.current = rec;
      rec.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) chunksRef.current.push(ev.data);
      };
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: mimeType || "audio/webm" });
        chunksRef.current = [];
        const ext = mimeType.includes("mp4") ? "m4a" : "webm";
        const file = new File([blob], `voice-${Date.now()}.${ext}`, {
          type: mimeType || "audio/webm",
        });
        handleFile(file);
      };
      rec.start();
      setRecording(true);
      setRecordingError("");
      setRecordingTime(0);
      timerRef.current = setInterval(() => {
        setRecordingTime((t) => t + 1);
      }, 1000);
    } catch {
      setRecordingError("Microphone access was denied.");
    }
  };

  const stopRecording = () => {
    const rec = mediaRecorderRef.current;
    if (rec && rec.state !== "inactive") {
      rec.stop();
    }
    mediaRecorderRef.current = null;
    setRecording(false);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const cancelRecording = () => {
    const rec = mediaRecorderRef.current;
    if (rec && rec.state !== "inactive") {
      rec.onstop = null;
      try {
        rec.stop();
      } catch {
        /* ignore */
      }
      const stream = rec.stream;
      stream?.getTracks().forEach((t) => t.stop());
    }
    mediaRecorderRef.current = null;
    chunksRef.current = [];
    setRecording(false);
    setRecordingTime(0);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const deleteChat = async () => {
    if (!activeId) return;
    try {
      const res = await fetch("/api/chat/conversation", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ partnerId: activeId }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        showToast(d.error || "Could not delete chat", "error");
        return;
      }
      closeChat();
      loadConversations();
      showToast("Chat deleted.", "success");
    } catch {
      showToast("Could not delete chat", "error");
    } finally {
      setMenuOpen("none");
    }
  };

  const clearMessages = async () => {
    if (!activeId) return;
    try {
      const res = await fetch("/api/chat/messages", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ partnerId: activeId }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        showToast(d.error || "Could not clear messages", "error");
        return;
      }
      setMessages([]);
      loadConversations();
      showToast("Messages cleared.", "success");
    } catch {
      showToast("Could not clear messages", "error");
    } finally {
      setMenuOpen("none");
    }
  };

  const formatRecTime = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  const handleFile = async (file: File) => {
    if (!file || !activeId) return;
    const fd = new FormData();
    fd.append("file", file);
    setSending(true);
    try {
      const res = await fetch("/api/chat/upload", { method: "POST", body: fd });
      if (res.ok) {
        const d = await res.json();
        await sendMessage({ mediaUrl: d.mediaUrl, mediaType: d.mediaType, mediaName: d.mediaName });
      } else {
        const d = await res.json().catch(() => ({}));
        showToast(d.error || "Upload failed", "error");
      }
    } catch {
      showToast("Upload failed", "error");
    } finally {
      setSending(false);
    }
  };

  const activeConv = conversations.find((c) => c.id === activeId) || null;
  const activeOnline = activeConv?.status === "online";

  /**
   * Whose bubble is this?
   *
   * Never trust only `me` here. On the Android build the offline session carries a
   * synthetic id ("offline-user") that can never equal a real sender id, so comparing
   * against `me` alone painted *every* bubble as received (both sides on one side) and
   * hid the seen ticks. Inside a thread we always know the partner, so anything that did
   * not come from the partner is ours — correct even while `me` is still resolving.
   */
  const isMine = useCallback(
    (m: Dm) => (activeId ? m.senderId !== activeId : m.senderId === me),
    [activeId, me],
  );

  /** WhatsApp only allows editing your own text within 15 minutes. */
  const canEditMessage = (m: Dm) =>
    isMine(m) &&
    !m.pending &&
    !m.mediaUrl &&
    !!m.text &&
    Date.now() - new Date(m.createdAt).getTime() < 15 * 60 * 1000;

  const activeDisplayName = activeConv?.name || activeUser?.name || "User";
  const normalizedMsgSearch = msgSearch.trim().toLowerCase();
  // In-chat search filters the loaded thread (text and attachment names). Filtering the
  // rendered list also keeps day dividers and reply anchors correct.
  const visibleMessages = normalizedMsgSearch
    ? messages.filter((m) =>
        `${m.text} ${m.mediaName ?? ""}`.toLowerCase().includes(normalizedMsgSearch),
      )
    : messages;
  const starredInThread = messages.filter((m) => starredIds.has(m.id));

  const filteredConversations = conversations
    .filter((c) => c.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      const pinA = chatPrefs[a.id]?.pinned ? 1 : 0;
      const pinB = chatPrefs[b.id]?.pinned ? 1 : 0;
      if (pinA !== pinB) return pinB - pinA;
      return a.lastMessageAt < b.lastMessageAt ? 1 : -1;
    });

  // Forward destinations: existing chats first, then contacts without a thread yet.
  const forwardTargets: { id: string; name: string; image: string | null; online: boolean }[] = [];
  for (const c of conversations) {
    forwardTargets.push({ id: c.id, name: c.name, image: c.image, online: c.status === "online" });
  }
  for (const u of users) {
    if (forwardTargets.some((x) => x.id === u.id)) continue;
    forwardTargets.push({
      id: u.id,
      name: u.fullName || u.name,
      image: u.image,
      online: u.status === "online",
    });
  }

  const filteredNewChat = users.filter((u) => {
    const q = newChatSearch.toLowerCase();
    return (
      !q ||
      u.name.toLowerCase().includes(q) ||
      u.fullName.toLowerCase().includes(q) ||
      (u.email || "").toLowerCase().includes(q)
    );
  });

  return (
    <div className="flex h-[calc(100dvh-70px)] flex-col overflow-hidden text-foreground md:mx-auto md:h-[calc(100dvh-2.5rem)] md:max-w-6xl md:rounded-[2rem] md:border md:border-white/[0.09] md:bg-white/[0.03] md:shadow-2xl md:backdrop-blur-2xl">
      {/* OUTSIDE: header + tabs + list */}
      <div
        className={cn(
          "flex min-h-0 w-full flex-col bg-transparent md:flex md:w-[32%] md:min-w-[330px] md:border-r md:border-white/[0.08]",
          mobilePane === "chat" ? "hidden md:flex" : "flex",
        )}
      >
        {/* Header */}
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-white/[0.07] bg-white/[0.03] px-4 backdrop-blur-xl">
          <div className="flex min-w-0 items-center gap-3">
            <Avatar src={myImage} name={myName} size={40} />
            <span className="truncate text-[15px] font-semibold">{myName}</span>
          </div>
          <div className="flex items-center gap-1 text-muted-foreground">
            <button onClick={() => setNewChatOpen(true)} aria-label="New chat" className="pressable rounded-lg p-2 hover:bg-accent hover:text-foreground">
              <MessageCircle className="h-5 w-5" />
            </button>
            <div className="relative">
              <button
                onClick={() => toggleMenu("header")}
                aria-label="Menu"
                className="pressable rounded-lg p-2 hover:bg-accent hover:text-foreground"
              >
                <MoreVertical className="h-5 w-5" />
              </button>
              {menuOpen === "header" && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setMenuOpen("none")} />
                  <div className="absolute right-0 top-11 z-50 w-56 animate-scale-in overflow-hidden rounded-xl border border-border bg-popover py-1.5 text-sm text-popover-foreground shadow-2xl">
                    <button
                      onClick={() => { setMenuOpen("none"); setNewChatOpen(true); }}
                      className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-accent"
                    >
                      <MessageSquarePlus className="h-4 w-4 text-muted-foreground" /> New chat
                    </button>
                    <a
                      href="/profile"
                      onClick={() => setMenuOpen("none")}
                      className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-accent"
                    >
                      <UserRound className="h-4 w-4 text-muted-foreground" /> My profile
                    </a>
                    <a
                      href="/settings"
                      onClick={() => setMenuOpen("none")}
                      className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-accent"
                    >
                      <CircleDot className="h-4 w-4 text-muted-foreground" /> Settings
                    </a>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex h-12 items-end border-b border-white/[0.07] bg-white/[0.02] px-2 text-muted-foreground">
          {(
            [
              { id: "chats", label: "Chats", icon: MessageCircle },
              { id: "status", label: "Status", icon: CircleDot },
              { id: "calls", label: "Calls", icon: Phone },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "relative flex flex-1 items-center justify-center gap-1.5 rounded-t-2xl py-3 text-sm font-bold transition-all duration-300 ease-premium",
                tab === t.id
                  ? "bg-gradient-aurora text-white shadow-glow"
                  : "text-muted-foreground hover:bg-white/[0.05] hover:text-foreground",
              )}
            >
              <t.icon className={cn("h-4 w-4 transition-transform duration-300", tab === t.id && "scale-110")} />
              {t.label}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="bg-transparent px-3 py-3">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search or start a new chat"
              className="h-11 w-full rounded-2xl border border-white/[0.08] bg-white/[0.04] pl-10 pr-9 text-sm font-medium text-foreground placeholder:text-muted-foreground/70 outline-none transition-all duration-300 focus:border-violet/50 focus:bg-white/[0.07]"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {/* List / placeholder */}
        {staleData && (
          <div className="mx-3 mt-2 flex items-center gap-1.5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-[11px] font-medium text-amber-600 dark:text-amber-400">
            <CloudOff className="h-3.5 w-3.5 shrink-0" />
            Offline — showing your last saved chats
          </div>
        )}
        {needsReconnect && (
          <div className="mx-3 mt-2 flex flex-col items-start gap-1 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-[11px] font-medium text-destructive">
            <span>This device is not linked to your account, so new messages cannot load.</span>
            <button
              type="button"
              onClick={() => {
                window.location.href = "/settings";
              }}
              className="underline underline-offset-2"
            >
              Reconnect in Settings → Cloud sync
            </button>
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto bg-transparent">
          {tab === "chats" ? (
            filteredConversations.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center px-6 text-center">
                <div className="mb-3 grid h-16 w-16 place-items-center rounded-full bg-muted">
                  <MessageCircle className="h-7 w-7 text-muted-foreground" />
                </div>
                <p className="text-sm font-medium text-foreground">
                  {search ? "No results" : "No chats yet"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {search
                    ? "Try a different name or email."
                    : "Tap + to start chatting with a study buddy."}
                </p>
              </div>
            ) : (
              filteredConversations.map((c) => (
                <button
                  key={c.id}
                  onClick={() => openChat(c.id)}
                  className={cn(
                    "relative mx-2 flex w-[calc(100%-1rem)] items-center gap-3 rounded-2xl border px-3 py-2.5 text-left transition-all duration-300 ease-premium",
                    activeId === c.id
                      ? "border-violet/35 bg-gradient-aurora-soft shadow-lg"
                      : "border-transparent hover:border-white/[0.07] hover:bg-white/[0.05]",
                  )}
                >
                  <Avatar src={c.image} name={c.name} online={c.status === "online"} size={49} />
                  <div className="min-w-0 flex-1 border-b border-white/[0.06] pb-2">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className={cn("truncate text-[15px] text-foreground", activeId === c.id ? "font-extrabold" : "font-semibold")}>
                        {c.name}
                      </p>
                      <span className="flex shrink-0 items-center gap-1 text-[11px] font-medium text-muted-foreground">
                        {chatPrefs[c.id]?.pinned && <Pin className="h-3 w-3" />}
                        {chatPrefs[c.id]?.muted && <BellOff className="h-3 w-3" />}
                        {shortDate(c.lastMessageAt)}
                      </span>
                    </div>
                    <div className="mt-0.5 flex items-center justify-between gap-2">
                      <p
                        className={cn(
                          "truncate text-[13px]",
                          peerTyping && activeId === c.id
                            ? "font-medium text-primary"
                            : c.unread > 0
                              ? "font-medium text-foreground"
                              : "text-muted-foreground",
                        )}
                      >
                        {peerTyping && activeId === c.id ? "typing…" : c.lastMessage}
                      </p>
                      {c.unread > 0 && (
                        <span className="shrink-0 rounded-full bg-gradient-aurora px-2 py-0.5 text-[11px] font-extrabold text-white shadow-glow">
                          {c.unread}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              ))
            )
          ) : tab === "status" ? (
            <div>
              <button
                onClick={() => (myStatusItems.length > 0 ? openStatusViewer(myStatusItems) : setComposerOpen(true))}
                className="flex w-full items-center gap-3 px-3 py-3 text-left hover:bg-muted"
              >
                <div className="shrink-0 rounded-full bg-gradient-to-tr from-bio to-chem p-[2px]">
                  <Avatar src={myImage} name={myName} size={50} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-medium text-foreground">My status</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {myStatusItems.length > 0
                      ? `${myStatusItems.length} update${myStatusItems.length > 1 ? "s" : ""} · ${
                          myStatusItems.reduce((n, s) => n + s.viewCount, 0) === 0
                            ? "no views yet"
                            : myStatusItems.reduce((n, s) => n + s.viewCount, 0) > 20
                              ? "seen by many"
                              : myStatusItems.reduce((n, s) => n + s.viewCount, 0) >= 5
                                ? "seen by several"
                                : "seen by few"
                        } · ${statusTime(myStatusItems[0].createdAt)}`
                      : "Tap to add a status update"}
                  </p>
                </div>
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary text-white">
                  <MessageSquarePlus className="h-5 w-5" />
                </span>
              </button>
              {myStatusItems.length > 0 && (
                <button
                  onClick={clearMyStatus}
                  className="flex w-full items-center gap-2 border-t border-border px-3 py-2 text-xs font-medium text-red-400 hover:bg-muted"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Clear my status
                </button>
              )}

              <div className="flex items-center gap-2 border-t border-border px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                <CircleDot className="h-4 w-4" /> Recent updates
              </div>

              {otherGroups.length === 0 ? (
                <div className="flex flex-col items-center justify-center px-6 py-10 text-center">
                  <div className="mb-3 grid h-16 w-16 place-items-center rounded-full bg-muted">
                    <CircleDot className="h-7 w-7 text-muted-foreground" />
                  </div>
                  <p className="text-sm font-medium text-foreground">No updates yet</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Statuses from your contacts appear here for 24 hours.
                  </p>
                </div>
              ) : (
                otherGroups.map((g) => {
                  const allSeen = g.items.every((s) => s.viewedByMe || s.userId === me);
                  return (
                    <button
                      key={g.userId}
                      onClick={() => openStatusViewer(g.items)}
                      className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-muted"
                    >
                      <div className={cn("shrink-0 rounded-full p-[2px]", allSeen ? "bg-muted" : "bg-gradient-to-tr from-bio to-chem")}>
                        <Avatar src={g.image} name={g.name} size={50} />
                      </div>
                      <div className="min-w-0 flex-1 border-b border-border/50 pb-2">
                        <p className="truncate text-[15px] font-medium text-foreground">{g.name}</p>
                        <p className="text-xs text-muted-foreground">{statusTime(g.items[0].createdAt)}</p>
                      </div>
                      <span className="shrink-0 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold text-primary">
                        {g.items.length} · 👁 {g.items[0].viewCount}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          ) : (
            <div className="scrollbar-slim flex-1 overflow-y-auto">
              {users.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center px-6 text-center">
                  <div className="mb-3 grid h-16 w-16 place-items-center rounded-2xl bg-muted">
                    <Phone className="h-7 w-7 text-muted-foreground" />
                  </div>
                  <p className="text-sm font-medium text-foreground">No contacts yet</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Start a chat to see contacts here.
                  </p>
                </div>
              ) : (
                <ul className="divide-y divide-border/60">
                  {users.map((u) => (
                    <li
                      key={u.id}
                      className="flex items-center gap-1.5 px-3 py-2.5 transition-all duration-200 ease-premium hover:bg-accent/50"
                    >
                      <button
                        onClick={() => startCall(u, "video")}
                        className="flex min-w-0 flex-1 items-center gap-3 text-left"
                      >
                        <Avatar src={u.image} name={u.fullName} size={44} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[15px] font-medium">{u.fullName}</p>
                          <p className="text-xs text-muted-foreground">
                            {u.status === "online" ? "Online now" : "Tap for video call"}
                          </p>
                        </div>
                      </button>
                      <button
                        onClick={() => startCall(u, "voice")}
                        aria-label={`Voice call ${u.fullName}`}
                        className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground transition-all duration-200 ease-spring hover:scale-110 hover:bg-primary hover:text-primary-foreground"
                      >
                        <Phone className="h-[18px] w-[18px]" />
                      </button>
                      <button
                        onClick={() => startCall(u, "video")}
                        aria-label={`Video call ${u.fullName}`}
                        className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/12 text-primary transition-all duration-200 ease-spring hover:scale-110 hover:bg-primary hover:text-primary-foreground"
                      >
                        <VideoIcon className="h-[18px] w-[18px]" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        {/* FAB */}
        <button
          onClick={() => setNewChatOpen(true)}
          aria-label="New chat"
          className="absolute bottom-8 right-4 grid h-14 w-14 place-items-center rounded-2xl bg-gradient-aurora text-white shadow-glow transition-transform hover:scale-105 active:scale-95"
        >
          <MessageSquarePlus className="h-7 w-7" />
        </button>
      </div>

      {/* INSIDE: active chat */}
      <div
        className={cn(
          "flex min-h-0 flex-1 flex-col",
          (!activeId || mobilePane === "list") && "hidden md:flex",
        )}
      >
        {!activeId ? (
          <div className="relative flex flex-1 flex-col items-center justify-center bg-transparent px-6 text-center">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(900px_500px_at_50%_0%,hsl(var(--violet)/0.16),transparent_65%)]" />
            <div className="gradient-border relative grid h-24 w-24 place-items-center rounded-[2rem] bg-gradient-aurora shadow-glow-lg">
              <MessageCircle className="h-10 w-10 text-white" />
            </div>
            <h2 className="relative mt-6 font-display text-2xl font-extrabold tracking-tight text-foreground">
              Select a chat to start messaging
            </h2>
            <p className="relative mt-2 max-w-xs text-sm font-medium text-muted-foreground">
              Pick a conversation from the list, or start a new one.
            </p>
          </div>
        ) : (
          <div className="relative flex h-full flex-col">
            {/* Aurora wallpaper */}
            <div
              className="pointer-events-none absolute inset-0 z-0"
              style={{
                backgroundImage:
                  "radial-gradient(760px 420px at 12% 8%, hsl(258 90% 60% / 0.14), transparent 62%), radial-gradient(680px 380px at 88% 22%, hsl(320 92% 62% / 0.11), transparent 62%), radial-gradient(760px 460px at 50% 100%, hsl(190 95% 52% / 0.1), transparent 62%)",
              }}
            />

            {/* Header */}
            <div className="relative z-10 flex h-16 items-center gap-2 border-b border-white/[0.07] bg-white/[0.05] px-3 backdrop-blur-2xl">
              <button onClick={closeChat} className="text-muted-foreground hover:text-foreground md:hidden">
                <ArrowLeft className="h-5 w-5" />
              </button>
              <Avatar
                src={activeConv?.image || null}
                name={activeConv?.name || activeUser?.name || "User"}
                online={activeOnline}
                size={40}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-bold text-foreground">
                  {activeConv?.name || activeUser?.name || "User"}
                </p>
                <p className="truncate text-xs font-medium text-muted-foreground">
                  {peerTyping ? (
                    <span className="font-semibold text-primary">typing…</span>
                  ) : chatPrefs[activeId || ""]?.muted ? (
                    <span className="inline-flex items-center gap-1">
                      <BellOff className="h-3 w-3" />
                      {lastSeenLabel(activeConv?.lastSeen || activeUser?.lastSeen || null, activeConv?.status || activeUser?.status || "offline")}
                    </span>
                  ) : (
                    lastSeenLabel(activeConv?.lastSeen || activeUser?.lastSeen || null, activeConv?.status || activeUser?.status || "offline")
                  )}
                </p>
              </div>
              <div className="flex items-center gap-4 text-muted-foreground">
                <button
                  onClick={() => {
                    setMsgSearchOpen((open) => !open);
                    setMsgSearch("");
                  }}
                  aria-label="Search in chat"
                  className="hover:text-foreground"
                >
                  <Search className="h-5 w-5" />
                </button>
                <button
                  onClick={() => startCallWith("video")}
                  aria-label="Start video call"
                  className="pressable hover:text-primary"
                >
                  <Video className="h-5 w-5" />
                </button>
                <button
                  onClick={() => startCallWith("voice")}
                  aria-label="Start voice call"
                  className="hover:text-foreground"
                >
                  <Phone className="h-5 w-5" />
                </button>
                <div className="relative">
                  <button
                    onClick={() => toggleMenu("chat")}
                    aria-label="Chat menu"
                    className="hover:text-foreground"
                  >
                    <MoreVertical className="h-5 w-5" />
                  </button>
                  {menuOpen === "chat" && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setMenuOpen("none")} />
                      <div
                        className="absolute right-0 top-9 z-50 w-60 overflow-hidden rounded-xl border border-border py-1.5 text-sm shadow-xl"
                        style={{ background: "var(--popover)", color: "var(--foreground)", boxShadow: "0 8px 24px rgba(0,0,0,0.5)" }}
                      >
                        <button
                          onClick={() => { setContactOpen(true); setMenuOpen("none"); }}
                          className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-muted"
                        >
                          <UserRound className="h-4 w-4 text-muted-foreground" /> Contact info
                        </button>
                        <button
                          onClick={() => activeId && togglePinChat(activeId)}
                          className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-muted"
                        >
                          <Pin className="h-4 w-4 text-muted-foreground" />{" "}
                          {activeId && chatPrefs[activeId]?.pinned ? "Unpin chat" : "Pin chat"}
                        </button>
                        <button
                          onClick={() => activeId && toggleMuteChat(activeId)}
                          className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-muted"
                        >
                          {activeId && chatPrefs[activeId]?.muted ? (
                            <Bell className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <BellOff className="h-4 w-4 text-muted-foreground" />
                          )}{" "}
                          {activeId && chatPrefs[activeId]?.muted
                            ? "Unmute notifications"
                            : "Mute notifications"}
                        </button>
                        <button
                          onClick={() => { setStarredOpen(true); setMenuOpen("none"); }}
                          className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-muted"
                        >
                          <Star className="h-4 w-4 text-muted-foreground" /> Starred messages
                        </button>
                        <button
                          onClick={clearMessages}
                          className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-muted"
                        >
                          <Smile className="h-4 w-4 text-muted-foreground" /> Clear messages
                        </button>
                        <button
                          onClick={deleteChat}
                          className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-red-400 hover:bg-muted"
                        >
                          <Trash2 className="h-4 w-4" /> Delete chat
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* In-chat search */}
            {msgSearchOpen && (
              <div className="relative z-10 flex items-center gap-2 border-b border-white/[0.07] bg-white/[0.05] px-3 py-2 backdrop-blur-xl">
                <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
                <input
                  autoFocus
                  value={msgSearch}
                  onChange={(e) => setMsgSearch(e.target.value)}
                  placeholder="Search in chat"
                  className="h-9 min-w-0 flex-1 rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 text-sm text-foreground placeholder:text-muted-foreground/70 outline-none focus:border-violet/50"
                />
                <span className="shrink-0 text-[11px] font-medium text-muted-foreground">
                  {msgSearch.trim()
                    ? `${visibleMessages.length} result${visibleMessages.length === 1 ? "" : "s"}`
                    : ""}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setMsgSearch("");
                    setMsgSearchOpen(false);
                  }}
                  aria-label="Close search"
                  className="shrink-0 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}

            {/* Messages */}
            {staleData && (
              <div className="mx-3 mt-2 flex items-center gap-1.5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-[11px] font-medium text-amber-600 dark:text-amber-400">
                <CloudOff className="h-3.5 w-3.5 shrink-0" />
                Offline — showing the last saved messages
              </div>
            )}
            {needsReconnect && (
              <div className="mx-3 mt-2 flex flex-col items-start gap-1 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-[11px] font-medium text-destructive">
                <span>This device is not linked to your account, so new messages cannot load.</span>
                <button
                  type="button"
                  onClick={() => {
                    window.location.href = "/settings";
                  }}
                  className="underline underline-offset-2"
                >
                  Reconnect in Settings → Cloud sync
                </button>
              </div>
            )}
            <div
              ref={messagesScrollRef}
              onScroll={handleMessagesScroll}
              className="relative z-10 min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain px-3 py-4"
            >
              {loadingMsgs && messages.length === 0 ? (
                <div className="flex justify-center py-10">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : visibleMessages.length === 0 && normalizedMsgSearch ? (
                <div className="py-10 text-center text-sm font-medium text-muted-foreground">
                  No messages found
                </div>
              ) : (
                visibleMessages.map((m, i) => {
                  const mine = isMine(m);
                  const prev = visibleMessages[i - 1];
                  const showDay = !prev || formatDay(prev.createdAt) !== formatDay(m.createdAt);
                  return (
                    <div key={m.id} id={`msg-${m.id}`}>
                      {showDay && (
                        <div className="my-3 flex justify-center">
                          <span className="rounded-full border border-border/70 bg-elevated/70 px-3 py-1 text-[11px] font-medium text-muted-foreground shadow-sm backdrop-blur-sm">
                            {formatDay(m.createdAt)}
                          </span>
                        </div>
                      )}
                      <div className={cn("flex", mine ? "justify-end" : "justify-start")}>
                        <div className={cn("flex max-w-[80%] flex-col", mine ? "items-end" : "items-start")}>
                          <div
                            onClick={() => tapMessage(m)}
                            onTouchStart={() => beginLongPress(m)}
                            onTouchEnd={endLongPress}
                            onTouchMove={endLongPress}
                            onTouchCancel={endLongPress}
                            className={cn(
                              "relative animate-bubble-in px-4 py-2 text-[14.5px] font-medium shadow-lg backdrop-blur-sm",
                              "cursor-pointer select-none active:brightness-95",
                              mine
                                ? "rounded-3xl rounded-br-lg bg-gradient-aurora text-white shadow-glow"
                                : "rounded-3xl rounded-bl-lg border border-white/[0.09] bg-white/[0.06] text-foreground",
                              actionMsg?.id === m.id && "ring-2 ring-violet/70",
                            )}
                          >
                            {m.forwarded && (
                              <div
                                className={cn(
                                  "mb-1 flex items-center gap-1 text-[10.5px] italic",
                                  mine ? "text-white/75" : "text-muted-foreground",
                                )}
                              >
                                <Forward className="h-3 w-3" /> Forwarded
                              </div>
                            )}
                            {m.replyTo && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  document
                                    .getElementById(`msg-${m.replyTo?.id}`)
                                    ?.scrollIntoView({ behavior: "smooth", block: "center" });
                                }}
                                className={cn(
                                  "mb-1.5 block w-full overflow-hidden rounded-lg border-l-[3px] px-2 py-1 text-left text-[12px]",
                                  mine
                                    ? "border-white/75 bg-black/20 text-white/85"
                                    : "border-violet-400 bg-black/20 text-muted-foreground",
                                )}
                              >
                                <span className="block truncate font-bold">
                                  {m.replyTo.senderId === activeId ? activeDisplayName : "You"}
                                </span>
                                <span className="block truncate">
                                  {m.replyTo.text ||
                                    mediaPreviewLabel(
                                      m.replyTo.mediaType,
                                      m.replyTo.mediaName,
                                    )}
                                </span>
                              </button>
                            )}
                            {mediaBubble(m, saveMedia, openMedia)}
                            {m.text && (
                              <p className="whitespace-pre-wrap break-words pr-9 leading-relaxed text-inherit">
                                {normalizedMsgSearch
                                  ? highlightText(m.text, msgSearch)
                                  : m.text}
                              </p>
                            )}
                            <div
                              className={cn(
                                "mt-0.5 flex items-center justify-end gap-1 text-[11px]",
                                mine ? "text-white/75" : "text-muted-foreground",
                              )}
                            >
                              {starredIds.has(m.id) && (
                                <Star className="h-3 w-3 fill-current" aria-label="Starred" />
                              )}
                              {m.editedAt && <span className="italic">edited</span>}
                              <span>{formatTime(m.createdAt)}</span>
                              {mine &&
                                (m.pending ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : m.failed ? (
                                  <span className="font-semibold" title="Not sent">
                                    !
                                  </span>
                                ) : m.readAt ? (
                                  <CheckCheck className="h-3.5 w-3.5 text-white/90" />
                                ) : (
                                  <Check className="h-4 w-4" />
                                ))}
                            </div>
                          </div>
                          {(m.reactions?.length ?? 0) > 0 && (
                            <div className={cn("-mt-1 flex flex-wrap gap-1 px-1", mine ? "justify-end" : "justify-start")}>
                              {m.reactions!.map((r) => (
                                <button
                                  key={r.emoji}
                                  type="button"
                                  onClick={() => reactToMessage(m.id, r.emoji)}
                                  className={cn(
                                    "flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[11px] leading-none shadow-sm backdrop-blur-sm",
                                    r.mine
                                      ? "border-violet/60 bg-violet/20 text-foreground"
                                      : "border-white/15 bg-black/30 text-foreground",
                                  )}
                                >
                                  <span>{r.emoji}</span>
                                  {r.count > 1 && <span className="font-semibold">{r.count}</span>}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Input */}
            <div className="relative z-10">
              {emojiOpen && (
                <div
                  className="absolute bottom-[calc(100%+8px)] left-3 right-3 rounded-xl border border-border p-3"
                  style={{ background: "var(--popover)", boxShadow: "0 -4px 24px rgba(0,0,0,0.4)" }}
                >
                  <div className="mb-2 flex items-center gap-1.5">
                    <input
                      value={emojiQuery}
                      onChange={(e) => setEmojiQuery(e.target.value)}
                      placeholder="Search emoji..."
                      className="min-w-0 flex-1 rounded-lg border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none placeholder:text-muted-foreground"
                    />
                    <div className="flex items-center gap-0.5 overflow-x-auto">
                      {EMOJI_CATEGORIES.map((cat) => (
                        <button
                          key={cat.name}
                          type="button"
                          onClick={() => {
                            setEmojiCategory(cat.name);
                            setEmojiQuery("");
                          }}
                          title={cat.name}
                          className={cn(
                            "grid h-8 w-8 shrink-0 place-items-center rounded-lg text-lg hover:bg-muted",
                            emojiCategory === cat.name && "bg-muted"
                          )}
                        >
                          {cat.icon}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="grid max-h-44 grid-cols-8 overflow-y-auto">
                    {(emojiQuery.trim()
                      ? EMOJIS.filter((e) => [...e].some((ch) => ch !== "️" && emojiQuery.includes(ch)))
                          .slice(0, 200)
                      : EMOJI_CATEGORY_NAMES[emojiCategory] || EMOJIS
                    ).map((e) => (
                      <button
                        key={e}
                        type="button"
                        onClick={() => insertEmoji(e)}
                        className="grid h-9 w-9 place-items-center rounded-lg text-xl hover:bg-muted"
                      >
                        {e}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {(replyTarget || editTarget) && (
                <div className="flex items-center gap-2 border-t border-white/[0.07] bg-white/[0.06] px-3 py-2 backdrop-blur-xl">
                  <div className="min-w-0 flex-1 border-l-[3px] border-violet-400 pl-2">
                    <p className="truncate text-[11px] font-bold text-violet-300">
                      {editTarget
                        ? "Editing message"
                        : `Replying to ${
                            replyTarget && replyTarget.senderId === activeId
                              ? activeDisplayName
                              : "yourself"
                          }`}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {editTarget?.text ||
                        replyTarget?.text ||
                        mediaPreviewLabel(
                          replyTarget?.mediaType ?? null,
                          replyTarget?.mediaName ?? null,
                        )}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const wasEditing = !!editTarget;
                      setReplyTarget(null);
                      setEditTarget(null);
                      if (wasEditing) setText("");
                    }}
                    aria-label="Cancel reply or edit"
                    className="shrink-0 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}
              {recording ? (
                <div className="flex min-h-[60px] items-center gap-3 border-t border-border bg-card px-3 pt-2.5 pb-[calc(env(safe-area-inset-bottom)+10px)]">
                  <button
                    onClick={cancelRecording}
                    aria-label="Cancel recording"
                    className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-5 w-5" />
                  </button>
                  <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-red-500" />
                  <span className="text-sm font-medium tabular-nums text-foreground">
                    {formatRecTime(recordingTime)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="h-1 overflow-hidden rounded-full bg-muted">
                      <div className="h-full w-1/3 animate-pulse rounded-full bg-primary" />
                    </div>
                  </div>
                  <button
                    onClick={stopRecording}
                    aria-label="Stop and send"
                    className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-primary text-white"
                  >
                    <StopCircle className="h-6 w-6" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2 border-t border-white/[0.07] bg-white/[0.03] px-3 pt-3 pb-[calc(env(safe-area-inset-bottom)+12px)] backdrop-blur-xl">
                  <button
                    onClick={() => setEmojiOpen((o) => !o)}
                    className={cn("pressable grid h-11 w-11 shrink-0 place-items-center rounded-2xl transition-colors", emojiOpen ? "bg-gradient-aurora text-white" : "text-muted-foreground hover:bg-white/[0.07] hover:text-foreground")}
                    aria-label="Emoji"
                  >
                    <Smile className="h-6 w-6" />
                  </button>
                  <input
                    ref={composerRef}
                    value={text}
                    onChange={(e) => {
                      setText(e.target.value);
                      if (e.target.value.trim()) notifyTyping();
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSendText();
                      }
                    }}
                    placeholder={editTarget ? "Edit message" : "Type a message"}
                    onBlur={stopTyping}
                    onFocus={() => {
                      // The keyboard shrinks the WebView (windowSoftInputMode=adjustResize);
                      // snap back to the newest message once the resize has settled.
                      nearBottomRef.current = true;
                      window.setTimeout(() => {
                        const el = messagesScrollRef.current;
                        if (el) el.scrollTop = el.scrollHeight;
                      }, 300);
                    }}
                    className="h-12 flex-1 rounded-2xl border border-white/[0.08] bg-white/[0.04] px-4 text-[14.5px] font-medium text-foreground placeholder:text-muted-foreground/70 outline-none transition-all duration-300 ease-smooth focus:border-violet/50 focus:bg-white/[0.07]"
                  />
                  <label className="pressable grid h-11 w-11 shrink-0 cursor-pointer place-items-center rounded-2xl text-muted-foreground transition-colors hover:bg-white/[0.07] hover:text-foreground">
                    <Paperclip className="h-6 w-6" />
                    <input
                      type="file"
                      accept="image/*,video/*,audio/*"
                      className="hidden"
                      disabled={sending}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleFile(f);
                        e.target.value = "";
                      }}
                    />
                  </label>
                  {text.trim() ? (
                    <button
                      onClick={handleSendText}
                      disabled={sending}
                      aria-label="Send"
                      className="pressable grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gradient-aurora text-white shadow-glow transition-transform hover:scale-105 active:scale-95 disabled:opacity-60"
                    >
                      {sending ? (
                        <Loader2 className="h-5 w-5 animate-spin" />
                      ) : (
                        <Send className="h-5 w-5" />
                      )}
                    </button>
                  ) : (
                    <button
                      onClick={startRecording}
                      aria-label="Record voice note"
                      className="pressable grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gradient-aurora text-white shadow-glow"
                    >
                      <Mic className="h-5 w-5" />
                    </button>
                  )}
                </div>
              )}
              {recordingError && (
                <div className="absolute bottom-[calc(100%+8px)] left-3 right-3 z-20 animate-fade-up rounded-lg border border-destructive/30 bg-popover px-3 py-2 text-xs text-destructive shadow-lg">
                  {recordingError}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* NEW CHAT SHEET */}
      {newChatOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-background/80 p-0 md:items-center md:p-6">
          <div className="flex h-[85dvh] w-full flex-col overflow-hidden rounded-t-2xl bg-card md:h-[70dvh] md:max-w-md md:rounded-2xl">
            <div className="flex items-center justify-between border-b border-border bg-card px-4 py-3">
              <div className="flex items-center gap-2">
                <button onClick={() => setNewChatOpen(false)} className="text-muted-foreground hover:text-foreground">
                  <X className="h-5 w-5" />
                </button>
                <h2 className="text-base font-medium">New chat</h2>
              </div>
            </div>
            <div className="px-3 py-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={newChatSearch}
                  onChange={(e) => setNewChatSearch(e.target.value)}
                  placeholder="Search by name or email"
                  className="h-10 w-full rounded-lg bg-muted pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground outline-none"
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {filteredNewChat.length === 0 ? (
                <div className="flex flex-col items-center justify-center px-6 py-10 text-center">
                  <CircleDot className="mb-2 h-8 w-8 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">No users found.</p>
                </div>
              ) : (
                filteredNewChat.map((u) => {
                  const inConversation = conversations.some((c) => c.id === u.id);
                  return (
                    <button
                      key={u.id}
                      onClick={() => openChat(u.id)}
                      className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-muted"
                    >
                      <Avatar src={u.image} name={u.name} online={u.status === "online"} size={44} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[15px] font-medium text-foreground">{u.name}</p>
                        {u.about && <p className="truncate text-xs text-muted-foreground">{u.about}</p>}
                      </div>
                      {inConversation && (
                        <span className="shrink-0 rounded-md px-2 py-0.5 text-[11px] font-medium text-primary">
                          Chat
                        </span>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* CONTACT INFO SHEET */}
      {contactOpen && activeConv && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4">
          <div className="w-full max-w-sm overflow-hidden rounded-2xl bg-card">
            <div className="flex items-center justify-between border-b border-border bg-card px-4 py-3">
              <h2 className="text-base font-medium">Contact info</h2>
              <button
                onClick={() => setContactOpen(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex flex-col items-center px-6 py-6 text-center">
              <Avatar
                src={activeConv.image || activeUser?.image || null}
                name={activeConv.name || activeUser?.name || "User"}
                online={activeOnline}
                size={88}
              />
              <h3 className="mt-3 text-lg font-semibold">
                {activeConv.name || activeUser?.name || "User"}
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {activeConv.status === "online"
                  ? "online"
                  : lastSeenLabel(activeConv.lastSeen || activeUser?.lastSeen || null, "offline")}
              </p>
              {activeUser?.about && (
                <p className="mt-3 max-w-xs text-sm text-foreground/80">{activeUser.about}</p>
              )}
              {activeUser?.email && (
                <div className="mt-4 w-full rounded-xl bg-card px-4 py-3 text-left">
                  <p className="text-xs text-muted-foreground">Email</p>
                  <p className="mt-0.5 break-all text-sm text-foreground">{activeUser.email}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* STATUS COMPOSER SHEET */}
      {composerOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-background/80 p-0 md:items-center md:p-6">
          <div className="flex h-[70dvh] w-full flex-col overflow-hidden rounded-t-2xl bg-card md:h-auto md:max-w-md md:rounded-2xl">
            <div className="flex items-center justify-between border-b border-border bg-card px-4 py-3">
              <div className="flex items-center gap-2">
                <button onClick={() => setComposerOpen(false)} className="text-muted-foreground hover:text-foreground">
                  <X className="h-5 w-5" />
                </button>
                <h2 className="text-base font-medium">Add status</h2>
              </div>
              <button
                onClick={postStatus}
                disabled={statusBusy || (!statusText.trim() && !statusMedia)}
                className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
              >
                {statusBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Share
              </button>
            </div>
            <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
              <div className="flex items-center gap-3">
                <Avatar src={myImage} name={myName} size={44} />
                <span className="text-sm text-muted-foreground">
                  Visible to everyone on BioPulse for 24 hours
                </span>
              </div>
              <textarea
                value={statusText}
                onChange={(e) => setStatusText(e.target.value)}
                placeholder="Write a status update…"
                maxLength={2000}
                className="min-h-[120px] w-full resize-none rounded-xl border border-border bg-muted px-4 py-3 text-[15px] text-foreground placeholder:text-muted-foreground outline-none"
              />
              {statusMedia && (
                <div className="relative">
                  {statusMedia.type === "video" ? (
                    <video src={statusMedia.url} controls className="max-h-56 w-full rounded-xl object-contain bg-black" />
                  ) : (
                    <img src={statusMedia.url} alt="status media" className="max-h-56 w-full rounded-xl object-cover" />
                  )}
                  <button
                    onClick={() => setStatusMedia(null)}
                    className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full bg-background/80 text-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}
              <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-border py-3 text-sm font-medium text-muted-foreground hover:bg-accent">
                <Paperclip className="h-4 w-4" /> Add photo or video
                <input
                  type="file"
                  accept="image/*,video/*"
                  className="hidden"
                  disabled={statusBusy}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) pickStatusImage(f);
                    e.target.value = "";
                  }}
                />
              </label>
            </div>
          </div>
        </div>
      )}

      {/* STATUS VIEWER */}
      {viewerItems && (
        <div
          className="fixed inset-0 z-[60] flex flex-col bg-background"
          onPointerDown={() => setViewerPaused(true)}
          onPointerUp={() => setViewerPaused(false)}
          onPointerLeave={() => setViewerPaused(false)}
        >
          <div className="flex items-center gap-3 px-4 pt-4">
            <button onClick={() => setViewerItems(null)} className="p-1 text-muted-foreground hover:text-foreground">
              <X className="h-6 w-6" />
            </button>
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <Avatar src={viewerItems[viewerIdx].image} name={viewerItems[viewerIdx].name} size={36} />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">{viewerItems[viewerIdx].name}</p>
                <p className="text-[11px] text-muted-foreground">{statusTime(viewerItems[viewerIdx].createdAt)}</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1 px-4 pt-2">
            {viewerItems.map((s, i) => (
              <div key={s.id} className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-foreground"
                  style={{ width: `${i < viewerIdx ? 100 : i === viewerIdx ? viewerProgress : 0}%` }}
                />
              </div>
            ))}
          </div>
          <div className="relative min-h-0 flex-1">
            {viewerItems[viewerIdx].imageUrl ? (
              viewerItems[viewerIdx].imageType === "video" ? (
                <video
                  ref={viewerVideoRef}
                  src={viewerItems[viewerIdx].imageUrl}
                  autoPlay
                  playsInline
                  controls
                  className="h-full w-full object-contain bg-black"
                  onTimeUpdate={(e) => {
                    const v = e.currentTarget;
                    if (v?.duration) setViewerProgress((v.currentTime / v.duration) * 100);
                  }}
                  onPause={() => setViewerPaused(true)}
                  onPlay={() => setViewerPaused(false)}
                />
              ) : (
                <img src={viewerItems[viewerIdx].imageUrl} alt="status" className="h-full w-full object-contain" />
              )
            ) : (
              <div className="flex h-full items-center justify-center p-8">
                <div className="w-full rounded-2xl border border-border bg-card p-6 text-center">
                  <p className="whitespace-pre-wrap text-lg text-foreground">{viewerItems[viewerIdx].text}</p>
                </div>
              </div>
            )}
            <button onClick={viewerPrev} aria-label="Previous" className="absolute inset-y-0 left-0 w-1/3" />
            <button onClick={viewerNext} aria-label="Next" className="absolute inset-y-0 right-0 w-1/3" />
          </div>
          <div className="flex items-center justify-between gap-2 px-4 py-3 text-center text-[11px] text-muted-foreground">
            <span className="min-w-0 flex-1">Hold to pause · Tap right or left to move</span>
            {viewerItems[viewerIdx].userId === me && (
              <button
                onClick={() => setViewerViewersOpen(true)}
                className="shrink-0 rounded-full border border-border bg-card px-2 py-0.5 font-medium text-foreground active:bg-muted"
              >
                👁 {viewerItems[viewerIdx].viewCount} {viewerItems[viewerIdx].viewCount === 1 ? "view" : "views"}
              </button>
            )}
          </div>
          {viewerItems[viewerIdx].reactions.length > 0 && (
            <div className="flex justify-center gap-1 px-4 pb-2">
              {viewerItems[viewerIdx].reactions.slice(0, 8).map((r) => (
                <span
                  key={r.emoji}
                  className={cn(
                    "flex items-center gap-0.5 rounded-full border px-2 py-0.5 text-sm",
                    viewerItems[viewerIdx].myReaction === r.emoji
                      ? "border-primary bg-primary/15 text-foreground"
                      : "border-border bg-card text-foreground",
                  )}
                >
                  {r.emoji} <span className="text-[10px]">{r.count}</span>
                </span>
              ))}
            </div>
          )}
          <div className="flex items-center justify-around border-t border-border/60 bg-card px-4 py-2">
            <button
              onClick={() => setViewerReactionsOpen((o) => !o)}
              className={cn(
                "flex flex-col items-center gap-1 rounded-lg px-3 py-1.5 text-[11px] font-medium transition-colors",
                viewerReactionsOpen ? "text-primary" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {viewerItems[viewerIdx].myReaction ? (
                <span className="text-xl leading-none">{viewerItems[viewerIdx].myReaction}</span>
              ) : (
                <Smile className="h-5 w-5" />
              )}
              React
            </button>
            <button
              onClick={() => replyToStatus(viewerItems[viewerIdx])}
              className="flex flex-col items-center gap-1 rounded-lg px-3 py-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              <MessageCircle className="h-5 w-5" />
              Reply
            </button>
            <button
              onClick={viewerNext}
              className="flex flex-col items-center gap-1 rounded-lg px-3 py-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              <X className="h-5 w-5" />
              Close
            </button>
          </div>
          {viewerReactionsOpen && (
            <div className="flex items-center gap-1.5 border-t border-border/60 bg-card px-4 py-2">
              {["❤️", "👍", "😂", "😮", "😢", "🙏", "😡", "🥳"].map((e) => (
                <button
                  key={e}
                  onClick={() => reactToStatus(viewerItems[viewerIdx].id, e)}
                  className={cn(
                    "grid h-9 w-9 place-items-center rounded-full text-xl transition-transform hover:scale-110",
                    viewerItems[viewerIdx].myReaction === e ? "bg-primary/20 ring-2 ring-primary" : "bg-muted",
                  )}
                >
                  {e}
                </button>
              ))}
            </div>
          )}
          {viewerViewersOpen && (
            <div className="fixed inset-0 z-[70] flex items-end justify-center bg-background/70 md:items-center md:p-6">
              <div className="flex max-h-[60dvh] w-full max-w-sm flex-col overflow-hidden rounded-t-2xl bg-card md:rounded-2xl">
                <div className="flex items-center justify-between border-b border-border px-4 py-3">
                  <h3 className="text-base font-medium">
                    {viewerItems[viewerIdx].viewCount}{" "}
                    {viewerItems[viewerIdx].viewCount === 1 ? "viewer" : "viewers"}
                  </h3>
                  <button onClick={() => setViewerViewersOpen(false)} className="text-muted-foreground hover:text-foreground">
                    <X className="h-5 w-5" />
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto p-2">
                  {(viewerItems[viewerIdx].viewers || []).length === 0 ? (
                    <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                      No one has viewed this status yet.
                    </p>
                  ) : (
                    viewerItems[viewerIdx]
                      .viewers!.map((v) => (
                        <div key={v.userId} className="flex items-center gap-3 px-3 py-2">
                          <Avatar src={v.image} name={v.name} size={40} />
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-foreground">{v.name}</p>
                            <p className="text-xs text-muted-foreground">{statusTime(v.viewedAt)}</p>
                          </div>
                        </div>
                      ))
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Message actions: react, copy, delete for me / for everyone */}
      {actionMsg && (
        <>
          <div
            className="fixed inset-0 z-[75] bg-black/50 backdrop-blur-[2px]"
            onClick={() => setActionMsg(null)}
          />
          <div className="fixed inset-x-0 bottom-0 z-[76] animate-fade-up rounded-t-3xl border-t border-white/10 bg-[var(--popover)] px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+16px)] shadow-2xl md:left-1/2 md:bottom-6 md:w-[420px] md:-translate-x-1/2 md:rounded-3xl">
            <div className="mb-3 flex items-center justify-between gap-1">
              {QUICK_REACTIONS.map((e) => {
                const active = actionMsg.reactions?.some((r) => r.emoji === e && r.mine);
                return (
                  <button
                    key={e}
                    type="button"
                    onClick={() => reactToMessage(actionMsg.id, e)}
                    className={cn(
                      "grid h-11 w-11 place-items-center rounded-full text-2xl transition-transform active:scale-90",
                      active ? "bg-violet/25 ring-2 ring-violet/70" : "bg-white/[0.06] hover:bg-white/[0.12]",
                    )}
                  >
                    {e}
                  </button>
                );
              })}
            </div>
            <div className="space-y-1">
              {!actionMsg.pending && (
                <button
                  type="button"
                  onClick={() => startReply(actionMsg)}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-medium hover:bg-white/[0.06]"
                >
                  <Reply className="h-4 w-4 text-muted-foreground" />
                  Reply
                </button>
              )}
              {!actionMsg.pending && (actionMsg.text || actionMsg.mediaUrl) && (
                <button
                  type="button"
                  onClick={() => startForward(actionMsg)}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-medium hover:bg-white/[0.06]"
                >
                  <Forward className="h-4 w-4 text-muted-foreground" />
                  Forward
                </button>
              )}
              {canEditMessage(actionMsg) && (
                <button
                  type="button"
                  onClick={() => startEdit(actionMsg)}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-medium hover:bg-white/[0.06]"
                >
                  <Pencil className="h-4 w-4 text-muted-foreground" />
                  Edit
                </button>
              )}
              {!actionMsg.pending && (
                <button
                  type="button"
                  onClick={() => toggleStarred(actionMsg.id)}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-medium hover:bg-white/[0.06]"
                >
                  <Star
                    className={cn(
                      "h-4 w-4 text-muted-foreground",
                      starredIds.has(actionMsg.id) && "fill-current text-amber-400",
                    )}
                  />
                  {starredIds.has(actionMsg.id) ? "Unstar message" : "Star message"}
                </button>
              )}
              {isMine(actionMsg) && !actionMsg.pending && (
                <button
                  type="button"
                  onClick={() => {
                    setActionMsg(null);
                    setInfoMsg(actionMsg);
                  }}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-medium hover:bg-white/[0.06]"
                >
                  <Info className="h-4 w-4 text-muted-foreground" />
                  Message info
                </button>
              )}
              {(actionMsg.text || actionMsg.mediaUrl) && (
                <button
                  type="button"
                  onClick={() => copyMessage(actionMsg)}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-medium hover:bg-white/[0.06]"
                >
                  <Copy className="h-4 w-4 text-muted-foreground" />
                  Copy
                </button>
              )}
              <button
                type="button"
                onClick={() => deleteMessage(actionMsg.id, "me")}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-medium hover:bg-white/[0.06]"
              >
                <Trash2 className="h-4 w-4 text-muted-foreground" />
                Delete for me
              </button>
              {isMine(actionMsg) && !actionMsg.pending && (
                <button
                  type="button"
                  onClick={() => deleteMessage(actionMsg.id, "everyone")}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-medium text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="h-4 w-4" />
                  Delete for everyone
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => setActionMsg(null)}
              className="mt-1 w-full rounded-xl px-3 py-3 text-center text-sm font-medium text-muted-foreground hover:bg-white/[0.06]"
            >
              Cancel
            </button>
          </div>
        </>
      )}

      {/* Forward picker */}
      {forwardMsg && (
        <div
          className="fixed inset-0 z-[80] flex items-end justify-center bg-background/80 md:items-center md:p-6"
          onClick={() => setForwardMsg(null)}
        >
          <div
            className="flex max-h-[80dvh] w-full flex-col overflow-hidden rounded-t-3xl border border-border bg-card shadow-2xl md:max-w-md md:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <h2 className="text-base font-semibold">Forward to</h2>
              <button
                type="button"
                onClick={() => setForwardMsg(null)}
                aria-label="Close"
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto py-1">
              {forwardTargets.length === 0 ? (
                <p className="px-4 py-10 text-center text-sm text-muted-foreground">
                  No contacts to forward to yet.
                </p>
              ) : (
                forwardTargets.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => void doForward(t.id)}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-muted"
                  >
                    <Avatar src={t.image} name={t.name} online={t.online} size={40} />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{t.name}</span>
                    <Forward className="h-4 w-4 text-muted-foreground" />
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Message info: sent / delivered / read timestamps */}
      {infoMsg && (
        <div
          className="fixed inset-0 z-[80] grid place-items-center bg-background/80 p-6"
          onClick={() => setInfoMsg(null)}
        >
          <div
            className="w-full max-w-sm overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <h2 className="text-base font-semibold">Message info</h2>
              <button
                type="button"
                onClick={() => setInfoMsg(null)}
                aria-label="Close"
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-3 px-4 py-4 text-sm">
              <div>
                <p className="text-xs font-medium text-muted-foreground">Sent</p>
                <p className="font-medium">
                  {formatDay(infoMsg.createdAt)} · {formatTime(infoMsg.createdAt)}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground">
                  {infoMsg.readAt ? "Read" : "Delivered"}
                </p>
                <p className="font-medium">
                  {infoMsg.readAt
                    ? `${formatDay(infoMsg.readAt)} · ${formatTime(infoMsg.readAt)}`
                    : "Not read yet"}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground">To</p>
                <p className="font-medium">{activeDisplayName}</p>
              </div>
              {infoMsg.editedAt && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Edited</p>
                  <p className="font-medium">
                    {formatDay(infoMsg.editedAt)} · {formatTime(infoMsg.editedAt)}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Starred messages in this chat */}
      {starredOpen && (
        <div
          className="fixed inset-0 z-[80] flex items-end justify-center bg-background/80 md:items-center md:p-6"
          onClick={() => setStarredOpen(false)}
        >
          <div
            className="flex max-h-[80dvh] w-full flex-col overflow-hidden rounded-t-3xl border border-border bg-card shadow-2xl md:max-w-md md:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <h2 className="flex items-center gap-2 text-base font-semibold">
                <Star className="h-4 w-4 fill-current text-amber-400" /> Starred messages
              </h2>
              <button
                type="button"
                onClick={() => setStarredOpen(false)}
                aria-label="Close"
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto py-1">
              {starredInThread.length === 0 ? (
                <p className="px-4 py-10 text-center text-sm text-muted-foreground">
                  No starred messages in this chat yet.
                </p>
              ) : (
                [...starredInThread].reverse().map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => {
                      setStarredOpen(false);
                      window.setTimeout(() => {
                        document
                          .getElementById(`msg-${m.id}`)
                          ?.scrollIntoView({ behavior: "smooth", block: "center" });
                      }, 150);
                    }}
                    className="flex w-full flex-col gap-0.5 border-b border-border/50 px-4 py-3 text-left hover:bg-muted"
                  >
                    <span className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                      <span>{formatDay(m.createdAt)} · {formatTime(m.createdAt)}</span>
                      <span>{isMine(m) ? "You" : activeDisplayName}</span>
                    </span>
                    <span className="line-clamp-2 text-sm font-medium">
                      {m.text || mediaPreviewLabel(m.mediaType, m.mediaName)}
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Full-screen image / video viewer with pinch zoom */}
      <MediaLightbox media={lightbox} onClose={() => setLightbox(null)} />

      {/* Full-screen premium video call */}
      {callPeer && me && (
        <VideoCallOverlay
          peer={callPeer}
          selfId={me}
          selfName={myName}
          selfAvatar={myImage}
          role={callRole}
          kind={callKind}
          onClose={closeCall}
        />
      )}
    </div>
  );
}