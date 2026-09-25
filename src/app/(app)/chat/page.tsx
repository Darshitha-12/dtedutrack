"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useSession } from "next-auth/react";
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
} from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";

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

interface Dm {
  id: string;
  senderId: string;
  text: string;
  mediaUrl: string | null;
  mediaType: string | null;
  mediaName: string | null;
  readAt: string | null;
  createdAt: string;
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

const POLL_MS = 4000;

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

function mediaBubble(m: Dm, onDownload: (url: string, name: string) => void) {
  if (!m.mediaUrl) return null;
  let body: ReactNode;
  if (m.mediaType === "image") {
    body = <img src={m.mediaUrl} alt={m.mediaName || "image"} className="max-h-64 rounded-lg object-cover" />;
  } else if (m.mediaType === "video") {
    body = <video src={m.mediaUrl} controls className="max-h-64 rounded-lg" />;
  } else if (m.mediaType === "audio") {
    body = <audio src={m.mediaUrl} controls className="max-w-full" />;
  } else {
    body = (
      <a href={m.mediaUrl} target="_blank" rel="noreferrer" className="underline underline-offset-2">
        📎 {m.mediaName || "File"}
      </a>
    );
  }
  const name = fileNameFromUrl(m.mediaUrl, m.mediaName);
  return (
    <div className="space-y-1.5">
      {body}
      <button
        type="button"
        onClick={() => onDownload(m.mediaUrl as string, name)}
        className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium transition-colors hover:bg-white/10"
      >
        <Download className="h-3 w-3" /> Save {name}
      </button>
    </div>
  );
}

export default function ChatPage() {
  const { data: session } = useSession();
  const me = session?.user?.id;
  const myName = session?.user?.name || "";
  const myImage = (session?.user as { image?: string | null })?.image || null;
  const { showToast } = useToast();

  const [users, setUsers] = useState<ChatUser[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Dm[]>([]);
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
  const [recording, setRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [recordingError, setRecordingError] = useState("");
  const [statuses, setStatuses] = useState<StatusItem[]>([]);
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

  const loadConversations = useCallback(async () => {
    try {
      const res = await fetch("/api/chat/conversations");
      if (res.ok) {
        const data = await res.json();
        setConversations(data.conversations || []);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const loadUsers = useCallback(async () => {
    try {
      const res = await fetch("/api/chat/users");
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users || []);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const loadMessages = useCallback(async (partnerId: string) => {
    try {
      setLoadingMsgs(true);
      const res = await fetch(`/api/chat/messages?partnerId=${encodeURIComponent(partnerId)}&limit=200`);
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages || []);
      }
    } catch {
      /* ignore */
    } finally {
      setLoadingMsgs(false);
    }
  }, []);

  const markRead = useCallback(
    async (partnerId: string) => {
      try {
        await fetch("/api/chat/read", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ partnerId }),
        });
      } catch {
        /* ignore */
      }
      setMessages((prev) =>
        prev.map((m) =>
          m.senderId === partnerId && !m.readAt ? { ...m, readAt: new Date().toISOString() } : m,
        ),
      );
      loadConversations();
    },
    [loadConversations],
  );

  const updatePresence = useCallback(async (status: string) => {
    try {
      await fetch("/api/chat/presence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    loadConversations();
    loadUsers();
    updatePresence("online");
    // Heartbeat only while the tab is visible so a hidden/backgrounded tab
    // doesn't flip the user back to "online" after we've gone offline.
    const hb = setInterval(() => {
      if (!document.hidden) updatePresence("online");
    }, 15000);
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
      setActiveId(id);
      activeRoomRef.current = id;
      setMobilePane("chat");
      setNewChatOpen(false);
      loadUsers();
      loadMessages(id);
      markRead(id);
    },
    [loadUsers, loadMessages, markRead],
  );

  const closeChat = useCallback(() => {
    setActiveId(null);
    activeRoomRef.current = null;
    setMessages([]);
    setMobilePane("list");
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
    loadStatuses();
    const id = setInterval(loadStatuses, 30000);
    return () => clearInterval(id);
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
      await fetch("/api/chat/status/view", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ statusId }),
      });
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
    const poll = setInterval(
      () => {
        loadConversations();
        if (activeRoomRef.current) {
          loadMessages(activeRoomRef.current);
          markRead(activeRoomRef.current);
        }
      },
      POLL_MS,
    );
    return () => clearInterval(poll);
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

  const sendMessage = async (payload: {
    text?: string;
    mediaUrl?: string;
    mediaType?: string;
    mediaName?: string;
  }) => {
    if (!activeId || !me) return;
    setSending(true);
    try {
      const res = await fetch("/api/chat/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ partnerId: activeId, ...payload }),
      });
      if (res.ok) {
        await fetch("/api/chat/messages?partnerId=" + encodeURIComponent(activeId) + "&limit=200")
          .then((r) => r.json())
          .then((d) => setMessages(d.messages || []));
        loadConversations();
        if (isSupabaseConfigured) {
          await supabase.channel("dm-events").send({
            type: "broadcast",
            event: "new",
            payload: { room: activeId, from: me, at: new Date().toISOString() },
          });
        }
        setText("");
      } else {
        const d = await res.json().catch(() => ({}));
        showToast(d.error || "Failed to send", "error");
      }
    } catch {
      showToast("Failed to send", "error");
    } finally {
      setSending(false);
    }
  };

  const handleSendText = () => {
    const t = text.trim();
    if (!t) return;
    sendMessage({ text: t });
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

  const filteredConversations = conversations.filter(
    (c) => c.name.toLowerCase().includes(search.toLowerCase()),
  );

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
    <div className="-mx-4 -my-6 flex h-[calc(100dvh-4rem)] flex-col overflow-hidden bg-card text-foreground md:mx-auto md:my-0 md:h-[calc(100dvh-7rem)] md:max-w-5xl md:rounded-lg md:border md:border-border">
      {/* OUTSIDE: header + tabs + list */}
      <div
        className={cn(
          "flex min-h-0 w-full flex-col md:flex md:w-[30%] md:min-w-[320px] md:border-r md:border-border",
          mobilePane === "chat" ? "hidden md:flex" : "flex",
        )}
      >
        {/* Header */}
        <div className="flex h-14 items-center justify-between border-b border-border bg-card px-4">
          <div className="flex items-center gap-3">
            <Avatar src={myImage} name={myName} size={38} />
            <span className="text-base font-medium">{myName}</span>
          </div>
          <div className="flex items-center gap-4 text-muted-foreground">
            <button onClick={() => setNewChatOpen(true)} aria-label="New chat" className="hover:text-foreground">
              <MessageCircle className="h-5 w-5" />
            </button>
            <div className="relative">
              <button
                onClick={() => toggleMenu("header")}
                aria-label="Menu"
                className="hover:text-foreground"
              >
                <MoreVertical className="h-5 w-5" />
              </button>
              {menuOpen === "header" && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setMenuOpen("none")} />
                  <div className="absolute right-0 top-9 z-50 w-56 overflow-hidden rounded-xl border border-border py-1.5 text-sm shadow-xl" style={{ background: "var(--popover)", color: "var(--foreground)", boxShadow: "0 8px 24px rgba(0,0,0,0.5)" }}>
                    <button
                      onClick={() => { setMenuOpen("none"); setNewChatOpen(true); }}
                      className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-muted"
                    >
                      <MessageSquarePlus className="h-4 w-4 text-muted-foreground" /> New chat
                    </button>
                    <a
                      href="/profile"
                      onClick={() => setMenuOpen("none")}
                      className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-muted"
                    >
                      <UserRound className="h-4 w-4 text-muted-foreground" /> My profile
                    </a>
                    <a
                      href="/settings"
                      onClick={() => setMenuOpen("none")}
                      className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-muted"
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
        <div className="flex h-12 items-end border-b border-border bg-card text-muted-foreground">
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
                "relative flex flex-1 items-center justify-center gap-1.5 py-2.5 text-sm font-medium transition-colors",
                tab === t.id ? "text-foreground" : "hover:text-foreground",
              )}
            >
              <t.icon className="h-4 w-4" />
              {t.label}
              {tab === t.id && (
                <span className="absolute bottom-0 left-0 right-0 h-[3px] rounded-t bg-primary" />
              )}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="bg-card px-3 py-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search or start a new chat"
              className="h-10 w-full rounded-lg bg-muted pl-9 pr-9 text-sm text-foreground placeholder:text-muted-foreground outline-none"
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
        <div className="min-h-0 flex-1 overflow-y-auto bg-card">
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
                    "flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors",
                    activeId === c.id ? "bg-primary/10" : "hover:bg-muted",
                  )}
                >
                  <Avatar src={c.image} name={c.name} online={c.status === "online"} size={49} />
                  <div className="min-w-0 flex-1 border-b border-border/50 pb-2">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="truncate text-[15px] font-medium text-foreground">{c.name}</p>
                      <span className="shrink-0 text-[11px] text-muted-foreground">
                        {shortDate(c.lastMessageAt)}
                      </span>
                    </div>
                    <div className="mt-0.5 flex items-center justify-between gap-2">
                      <p className={cn("truncate text-[13px]", c.unread > 0 ? "text-foreground" : "text-muted-foreground")}>
                        {c.lastMessage}
                      </p>
                      {c.unread > 0 && (
                        <span className="shrink-0 rounded-full bg-primary px-1.5 py-0.5 text-[11px] font-medium text-white">
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
            <div className="flex h-full flex-col items-center justify-center px-6 text-center">
              <div className="mb-3 grid h-16 w-16 place-items-center rounded-full bg-muted">
                <Phone className="h-7 w-7 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium text-foreground">Calls</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Call history will appear here. Coming soon.
              </p>
            </div>
          )}
        </div>

        {/* FAB */}
        <button
          onClick={() => setNewChatOpen(true)}
          aria-label="New chat"
          className="absolute bottom-8 right-4 grid h-14 w-14 place-items-center rounded-full bg-primary text-white shadow-lg transition-transform hover:scale-105 active:scale-95"
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
          <div className="relative flex flex-1 flex-col items-center justify-center bg-card px-6 text-center">
            <div className="grid h-20 w-20 place-items-center rounded-full bg-muted">
              <MessageCircle className="h-9 w-9 text-muted-foreground" />
            </div>
            <h2 className="mt-4 text-lg font-medium text-foreground">Select a chat to start messaging</h2>
            <p className="mt-1 max-w-xs text-sm text-muted-foreground">
              Pick a conversation from the list, or start a new one.
            </p>
          </div>
        ) : (
          <div className="relative flex h-full flex-col">
            {/* Top wallpaper hint (WhatsApp style) */}
            <div
              className="pointer-events-none absolute inset-0 z-0"
              style={{ background: "var(--background)" }}
            />
            <div
              className="pointer-events-none absolute inset-0 z-0 opacity-[0.04]"
              style={{
                backgroundImage:
                  "radial-gradient(circle at 20% 20%, #fff 1px, transparent 1px), radial-gradient(circle at 80% 40%, #fff 1px, transparent 1px), radial-gradient(circle at 40% 70%, #fff 1px, transparent 1px), radial-gradient(circle at 90% 90%, #fff 1px, transparent 1px)",
                backgroundSize: "180px 180px",
              }}
            />

            {/* Header */}
            <div className="relative z-10 flex h-14 items-center gap-2 bg-card px-3">
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
                <p className="truncate text-[15px] font-medium text-foreground">
                  {activeConv?.name || activeUser?.name || "User"}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {lastSeenLabel(activeConv?.lastSeen || activeUser?.lastSeen || null, activeConv?.status || activeUser?.status || "offline")}
                </p>
              </div>
              <div className="flex items-center gap-4 text-muted-foreground">
                <button
                  onClick={() => showToast("Video calls coming soon.", "info")}
                  className="hover:text-foreground"
                >
                  <Video className="h-5 w-5" />
                </button>
                <button
                  onClick={() => showToast("Voice calls coming soon.", "info")}
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

            {/* Messages */}
            <div
              ref={messagesScrollRef}
              onScroll={handleMessagesScroll}
              className="relative z-10 min-h-0 flex-1 overflow-y-auto px-3 py-4 space-y-1"
            >
              {loadingMsgs && messages.length === 0 ? (
                <div className="flex justify-center py-10">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                messages.map((m, i) => {
                  const mine = m.senderId === me;
                  const prev = messages[i - 1];
                  const showDay = !prev || formatDay(prev.createdAt) !== formatDay(m.createdAt);
                  return (
                    <div key={m.id}>
                      {showDay && (
                        <div className="my-2 flex justify-center">
                          <span
                            className="rounded-md px-3 py-1 text-[11px] text-foreground/80"
                            style={{ background: "var(--muted)", boxShadow: "0 1px 1px rgba(0,0,0,0.3)" }}
                          >
                            {formatDay(m.createdAt)}
                          </span>
                        </div>
                      )}
                      <div className={cn("flex", mine ? "justify-end" : "justify-start")}>
                        <div
                          className={cn(
                            "relative max-w-[80%] rounded-lg px-2 py-1.5 text-sm shadow-sm",
                            mine
                              ? "rounded-tr-md bg-primary"
                              : "rounded-tl-md bg-muted",
                          )}
                        >
                          {mediaBubble(m, saveMedia)}
                          {m.text && (
                            <p className="whitespace-pre-wrap break-words pl-0.5 pr-9 text-[14px] text-foreground">
                              {m.text}
                            </p>
                          )}
                          <div
                            className={cn(
                              "mt-0.5 flex items-center justify-end gap-1 text-[11px]",
                              mine ? "text-primary-foreground/70" : "text-muted-foreground",
                            )}
                          >
                            <span>{formatTime(m.createdAt)}</span>
                            {mine &&
                              (m.readAt ? (
                                <CheckCheck className="h-4 w-4 text-primary-foreground/80" />
                              ) : (
                                <Check className="h-4 w-4" />
                              ))}
                          </div>
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
              {recording ? (
                <div className="flex h-[60px] items-center gap-3 border-t border-border bg-card px-3 py-2.5">
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
                <div className="flex items-center gap-2 border-t border-border bg-card px-3 py-2.5">
                  <button
                    onClick={() => setEmojiOpen((o) => !o)}
                    className={cn("hover:text-foreground", emojiOpen ? "text-primary" : "text-muted-foreground")}
                    aria-label="Emoji"
                  >
                    <Smile className="h-6 w-6" />
                  </button>
                  <input
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSendText();
                      }
                    }}
                    placeholder="Type a message"
                    className="h-11 flex-1 rounded-lg bg-muted px-4 text-[14px] text-foreground placeholder:text-muted-foreground outline-none"
                  />
                  <label className="relative cursor-pointer text-muted-foreground hover:text-foreground">
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
                      className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-primary text-white transition-transform hover:scale-105 active:scale-95 disabled:opacity-60"
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
                      className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-primary text-white"
                    >
                      <Mic className="h-5 w-5" />
                    </button>
                  )}
                </div>
              )}
              {recordingError && (
                <div className="absolute bottom-[calc(100%+8px)] left-3 right-3 z-20 rounded-lg border border-border px-3 py-2 text-xs text-red-400" style={{ background: "var(--popover)" }}>
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
    </div>
  );
}