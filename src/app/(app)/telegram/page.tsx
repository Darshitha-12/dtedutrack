"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Search, Send, Users, MessageSquare, ExternalLink, Loader2, MessagesSquare, Link2, ArrowUpRight } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

interface TelegramGroup {
  id: string;
  name: string;
  username: string;
  inviteLink: string;
  category: string;
  description: string;
  memberCount: number;
  isOfficial: boolean;
  isJoined: boolean;
}

interface ChatMessage {
  id: string;
  userId: string;
  userName: string;
  userImage: string | null;
  room: string;
  text: string;
  createdAt: string;
}

interface AppChannel {
  id: string;
  name: string;
  slug: string;
  description: string;
  category: string;
  isOfficial: boolean;
  memberCount: number;
  isJoined: boolean;
}

const categories = ["all", "group", "channel", "supergroup"];

const POLL_MS = 5000;

function formatCount(n: number): string {
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, "") + "k";
  return String(n);
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function sanitizeQuery(q: string): string {
  return q.replace(/^@+/, "").trim();
}

function TelegramSearchCard({ query }: { query: string }) {
  const clean = sanitizeQuery(query);
  const previewUrl = `https://t.me/s/${clean}`;
  const directUrl = `https://t.me/${clean}`;
  return (
    <Card className="border-dashed bg-muted/40">
      <CardContent className="p-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-semibold">
              Search &ldquo;{query}&rdquo; on Telegram
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              This group or channel isn&rsquo;t in the local directory yet. Open the global
              Telegram search to find it directly.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <a
              href={directUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex"
              title={`Open t.me/${clean}`}
            >
              <Button size="sm">
                <ExternalLink className="mr-1 h-4 w-4" />
                Open on Telegram
              </Button>
            </a>
            <a
              href={previewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex"
              title={`Search preview for ${clean}`}
            >
              <Button size="sm" variant="outline">
                <Search className="mr-1 h-4 w-4" />
                Preview
              </Button>
            </a>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Normalizes any user input into a clean Telegram username:
// "https://t.me/BioALQuiz", "t.me/BioALQuiz", "@BioALQuiz", "BioALQuiz" -> "BioALQuiz"
function normalizeTelegramRef(input: string): string | null {
  const v = input.trim();
  if (!v) return null;
  const withHost = v.match(/(?:t\.me|telegram\.me)\/([A-Za-z0-9_]{3,})/);
  if (withHost) return withHost[1];
  const bare = v.replace(/^@+/, "");
  if (/^[A-Za-z0-9_]{3,}$/.test(bare)) return bare;
  const seg = v.split("/").pop() || "";
  if (/^[A-Za-z0-9_]{3,}$/.test(seg)) return seg;
  return null;
}

function TelegramEmbedPanel({ username }: { username: string }) {
  const embedUrl = `https://t.me/${username}?embed=1`;
  const joinUrl = `https://t.me/${username}`;
  return (
    <Card className="overflow-hidden bg-sky-50/40 border-sky-200">
      <CardContent className="p-0">
        <div className="flex items-center justify-between gap-3 p-3 border-b">
          <div className="flex items-center gap-2 min-w-0">
            <MessagesSquare className="h-4 w-4 shrink-0 text-sky-600" />
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate">@{username}</p>
              <p className="text-xs text-muted-foreground truncate">Preview & join this Telegram group / channel</p>
            </div>
          </div>
          <a
            href={joinUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex shrink-0"
            title={`Open and join t.me/${username}`}
          >
            <Button size="sm" className="bg-sky-600 hover:bg-sky-700">
              <ArrowUpRight className="mr-1 h-4 w-4" />
              Join on Telegram
            </Button>
          </a>
        </div>
        <iframe
          src={embedUrl}
          title={`Telegram preview for @${username}`}
          className="h-56 w-full bg-white"
          loading="lazy"
          allow="fullscreen"
        />
        <div className="flex items-center justify-between gap-2 p-2 border-t bg-muted/40">
          <span className="text-xs text-muted-foreground truncate">{joinUrl}</span>
          <a
            href={joinUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex shrink-0"
          >
            <Button size="sm" variant="outline">
              <ExternalLink className="mr-1 h-4 w-4" />
              Open
            </Button>
          </a>
        </div>
      </CardContent>
    </Card>
  );
}

export default function TelegramPage() {
  const { showToast } = useToast();

  const [groups, setGroups] = useState<TelegramGroup[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [cat, setCat] = useState("all");

  const [room, setRoom] = useState("general");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [activeUsername, setActiveUsername] = useState("");
  const [pasteInput, setPasteInput] = useState("");

  const [channels, setChannels] = useState<AppChannel[]>([]);
  const [channelsLoading, setChannelsLoading] = useState(true);
  const [channelsUpdating, setChannelsUpdating] = useState<string | null>(null);
  const [tgUpdating, setTgUpdating] = useState<string | null>(null);

  const chatEndRef = useRef<HTMLDivElement>(null);

  const loadGroups = useCallback(async () => {
    const params = new URLSearchParams();
    const normalized = search.trim().replace(/^@+/, "");
    if (normalized) params.set("q", normalized);
    if (cat !== "all") params.set("category", cat);
    try {
      const res = await fetch(`/api/telegram-groups?${params.toString()}`);
      const data = await res.json();
      setGroups(Array.isArray(data.groups) ? data.groups : []);
    } catch {
      showToast("විද්‍යුත් කණ්ඩායම් පූරණය කිරීමට අසමත් විය", "error");
    } finally {
      setGroupsLoading(false);
    }
  }, [search, cat, showToast]);

  const loadMessages = useCallback(async () => {
    try {
      const res = await fetch(`/api/telegram/messages?room=${encodeURIComponent(room)}`);
      const data = await res.json();
      setMessages(Array.isArray(data.messages) ? data.messages : []);
    } catch {
      /* polling errors are non-fatal */
    } finally {
      setChatLoading(false);
    }
  }, [room]);

  useEffect(() => {
      const t = setTimeout(loadGroups, 250);
    return () => clearTimeout(t);
  }, [loadGroups]);

  useEffect(() => {
    setChatLoading(true);
    loadMessages();
    const interval = setInterval(loadMessages, POLL_MS);
    return () => clearInterval(interval);
  }, [loadMessages, room]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const selectGroup = (g: TelegramGroup) => {
    setActiveUsername(g.username);
    setRoom(g.username);
  };

  const openPaste = () => {
    const username = normalizeTelegramRef(pasteInput);
    if (!username) {
      showToast("වලංගු Telegram link එකක් හෝ @username එකක් ඇතුළත් කරන්න", "error");
      return;
    }
    setActiveUsername(username);
    setRoom(username);
    setPasteInput("");
    showToast(`@${username} තෝරාගත්තා — Telegram එකේ view/join කරන්න`, "success");
  };

  const loadChannels = useCallback(async () => {
    try {
      const res = await fetch("/api/channels");
      const data = await res.json();
      setChannels(Array.isArray(data.channels) ? data.channels : []);
    } catch {
      showToast("App channels පූරණය කිරීමට අසමත් විය", "error");
    } finally {
      setChannelsLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadChannels();
  }, [loadChannels]);

  const openChannelChat = (slug: string) => {
    setRoom(slug);
  };

  const toggleChannel = async (c: AppChannel) => {
    setChannelsUpdating(c.id);
    try {
      const action = c.isJoined ? "leave" : "join";
      const res = await fetch("/api/channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelId: c.id, action }),
      });
      if (!res.ok) throw new Error("failed");
      const data = await res.json();
      setChannels((prev) =>
        prev.map((ch) =>
          ch.id === c.id ? { ...ch, isJoined: data.isJoined, memberCount: data.memberCount } : ch,
        ),
      );
      showToast(action === "join" ? `"${c.name}" channel එකට join වුනා 🎉` : `"${c.name}" වලින් leave වුනා`, "success");
    } catch {
      showToast("Channel action එක අසාර්ථක විය", "error");
    } finally {
      setChannelsUpdating(null);
    }
  };

  const toggleTelegramGroup = async (g: TelegramGroup) => {
    setTgUpdating(g.id);
    try {
      const action = g.isJoined ? "leave" : "join";
      const res = await fetch("/api/channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ telegramGroupId: g.id, action }),
      });
      if (!res.ok) throw new Error("failed");
      const data = await res.json();
      setGroups((prev) =>
        prev.map((grp) =>
          grp.id === g.id ? { ...grp, isJoined: data.isJoined, memberCount: data.memberCount } : grp,
        ),
      );
      if (action === "join") {
        setActiveUsername(g.username);
        setRoom(g.username);
      }
      showToast(action === "join" ? `"${g.name}" එක app ඇතුළෙම join වුනා 🎉` : `"${g.name}" වලින් leave වුනා`, "success");
    } catch {
      showToast("Join action එක අසාර්ථක විය", "error");
    } finally {
      setTgUpdating(null);
    }
  };

  const queryForTelegram = search.replace(/^@/, "").trim();
  const showGlobalSearch = !groupsLoading && groups.length === 0 && search.trim() !== "";

  const sendMessage = async () => {
    const text = draft.trim();
    if (!text) return;
    setSending(true);
    try {
      const res = await fetch("/api/telegram/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ room, text }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Send failed");
      }
      setDraft("");
      await loadMessages();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "පණිවිඩය යැවීමට අසමත් විය", "error");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="container max-w-6xl mx-auto p-4 lg:p-8 space-y-6">
      <PageHeader
        title="Telegram Groups & Community Chat"
        description="Join Sri Lankan A/L study groups and channels, or chat live with the BioPulse community."
      />

      {/* ─── App channels (join & chat in-app, no Telegram needed) ─── */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">App Channels</h2>
            <p className="text-sm text-muted-foreground">
              Join these channels right here in BioPulse and chat live — no Telegram account needed.
            </p>
          </div>
        </div>

        {channelsLoading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : channels.length === 0 ? (
          <EmptyState
            icon="📡"
            title="No channels yet"
            description="Check back soon for new study channels."
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {channels.map((c) => (
              <Card key={c.id} className="overflow-hidden">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold truncate">{c.name}</h3>
                      {c.isOfficial && <Badge>Official</Badge>}
                      <Badge variant="outline" className="capitalize">{c.category}</Badge>
                    </div>
                  </div>
                  {c.description && (
                    <p className="mt-1 text-sm text-muted-foreground line-clamp-2">{c.description}</p>
                  )}
                  <p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
                    <Users className="h-3.5 w-3.5" />
                    {formatCount(c.memberCount)} members
                  </p>
                  <div className="mt-3 flex items-center gap-2">
                    <Button
                      size="sm"
                      variant={c.isJoined ? "secondary" : "default"}
                      disabled={channelsUpdating === c.id}
                      onClick={() => toggleChannel(c)}
                    >
                      {channelsUpdating === c.id ? (
                        <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                      ) : null}
                      {c.isJoined ? "Leave" : "Join"}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => openChannelChat(c.slug)}>
                      <MessageSquare className="mr-1 h-4 w-4" />
                      Open Chat
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* ─── Group directory ─── */}
        <section>
          <div className="flex flex-col gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-10"
                placeholder="Search groups or channels (e.g. @BioALQuiz, Chemistry)..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <div className="flex flex-wrap gap-2">
              {categories.map((c) => (
                <Button
                  key={c}
                  size="sm"
                  variant={cat === c ? "default" : "outline"}
                  onClick={() => setCat(c)}
                >
                  {c.charAt(0).toUpperCase() + c.slice(1)}
                </Button>
              ))}
            </div>
          </div>

          <div className="mt-4 space-y-3">
            {groupsLoading && groups.length === 0 ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : showGlobalSearch ? (
              <TelegramSearchCard query={search.trim()} />
            ) : groups.length === 0 ? (
              <EmptyState
                icon="🔎"
                title="No groups found"
                description="Try a different keyword or category, or check back later."
              />
            ) : (
              groups.map((g) => (
                <Card
                  key={g.id}
                  className={cn(
                    "overflow-hidden cursor-pointer transition-colors",
                    activeUsername === g.username
                      ? "ring-2 ring-sky-500/60 border-sky-500"
                      : "hover:border-sky-400/50",
                  )}
                  onClick={() => selectGroup(g)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-semibold truncate">{g.name}</h3>
                          <Badge variant="secondary">@{g.username}</Badge>
                          {g.isOfficial && <Badge>Official</Badge>}
                          <Badge variant="outline" className="capitalize">{g.category}</Badge>
                        </div>
                        {g.description && (
                          <p className="mt-1 text-sm text-muted-foreground">{g.description}</p>
                        )}
                        <p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
                          <Users className="h-3.5 w-3.5" />
                          {formatCount(g.memberCount)} members
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => selectGroup(g)}
                          title={`View & chat in ${g.name}`}
                        >
                          <MessageSquare className="mr-1 h-4 w-4" />
                          View &amp; Chat
                        </Button>
                        <a
                          href={g.inviteLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex"
                        >
                          <Button size="sm" variant="outline">
                            <ExternalLink className="mr-1 h-4 w-4" />
                            Open in Telegram
                          </Button>
                        </a>
                        <Button
                          size="sm"
                          variant={g.isJoined ? "secondary" : "default"}
                          disabled={tgUpdating === g.id}
                          onClick={() => toggleTelegramGroup(g)}
                        >
                          {tgUpdating === g.id ? (
                            <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                          ) : null}
                          {g.isJoined ? "In-app ✓" : "Join in-app"}
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </section>

        {/* ─── Join a Telegram group / live chat ─── */}
        <section>
          <Card className="h-full flex flex-col">
            <CardHeader className="border-b">
              <div className="flex items-center gap-2">
                <MessagesSquare className="h-5 w-5 text-sky-500" />
                <CardTitle className="text-lg truncate">#{room}</CardTitle>
              </div>
              <p className="text-sm text-muted-foreground">
                Pick a group, paste a Telegram link, then view &amp; join it — or chat live below.
              </p>
            </CardHeader>

            {/* Paste a Telegram link / @username to view & join */}
            <div className="border-b p-3">
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  openPaste();
                }}
              >
                <div className="relative flex-1">
                  <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    className="pl-10"
                    placeholder="Paste a Telegram link or @username... (e.g. t.me/BioALQuiz)"
                    value={pasteInput}
                    onChange={(e) => setPasteInput(e.target.value)}
                  />
                </div>
                <Button type="submit" size="sm">
                  <Search className="mr-1 h-4 w-4" />
                  Open
                </Button>
              </form>
              <p className="mt-2 text-xs text-muted-foreground">
                Paste <span className="font-mono">https://t.me/&lt;channel&gt;</span>,{" "}
                <span className="font-mono">@username</span>, or a bare{" "}
                <span className="font-mono">username</span> — preview it here, then join on Telegram.
              </p>
            </div>

            {/* Embedded Telegram preview for the active group */}
            {activeUsername && (
              <div className="border-b p-3 bg-sky-50/30 space-y-3">
                <TelegramEmbedPanel username={activeUsername} />
                {(() => {
                  const matched = groups.find((grp) => grp.username === activeUsername);
                  if (!matched) return null;
                  return (
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        size="sm"
                        variant={matched.isJoined ? "secondary" : "default"}
                        disabled={tgUpdating === matched.id}
                        onClick={() => toggleTelegramGroup(matched)}
                      >
                        {tgUpdating === matched.id ? (
                          <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                        ) : null}
                        {matched.isJoined ? "Joined in-app ✓" : "Join & Chat in-app"}
                      </Button>
                      <span className="text-xs text-muted-foreground">
                        Join and chat with this group right here in BioPulse — no Telegram needed.
                      </span>
                    </div>
                  );
                })()}
              </div>
            )}

            <div className="flex-1 space-y-3 overflow-y-auto p-4 max-h-[420px]">
              {chatLoading && messages.length === 0 ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : messages.length === 0 ? (
                <EmptyState
                  icon="💬"
                  title="No messages yet"
                  description="Be the first to say hello in this room."
                />
              ) : (
                messages.map((m) => {
                  const isMe = m.userName === "Dilshan Perera";
                  return (
                    <div
                      key={m.id}
                      className={cn(
                        "flex",
                        isMe ? "justify-end" : "justify-start",
                      )}
                    >
                      <div
                        className={cn(
                          "max-w-[80%] rounded-2xl px-4 py-2 text-sm",
                          isMe
                            ? "bg-sky-600 text-white rounded-br-sm"
                            : "bg-muted rounded-bl-sm",
                        )}
                      >
                        {!isMe && (
                          <p className="mb-0.5 text-xs font-semibold opacity-80">{m.userName}</p>
                        )}
                        <p className="whitespace-pre-wrap break-words">{m.text}</p>
                        <p
                          className={cn(
                            "mt-1 text-[10px] opacity-60 text-right",
                          )}
                        >
                          {formatTime(m.createdAt)}
                        </p>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={chatEndRef} />
            </div>

            <div className="border-t p-3">
              <div className="flex items-end gap-2">
                <textarea
                  className="min-h-[44px] flex-1 resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  placeholder={`Send a message to #${room}...`}
                  value={draft}
                  rows={1}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      sendMessage();
                    }
                  }}
                />
                <Button size="icon" onClick={sendMessage} disabled={sending || !draft.trim()}>
                  {sending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          </Card>
        </section>
      </div>
    </div>
  );
}
