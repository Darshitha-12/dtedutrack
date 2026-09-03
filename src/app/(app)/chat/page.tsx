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
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { supabase, isSupabaseConfigured, channelRoomFor } from "@/lib/supabase";

interface ChatUser {
  id: string;
  name: string;
  email: string;
  image: string | null;
  status: string;
  lastSeen: string | null;
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

const POLL_MS = 4000;

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDay(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return "Today";
  const y = new Date();
  y.setDate(y.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return "Yesterday";
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
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
        className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium transition-colors hover:bg-accent"
      >
        <Download className="h-3 w-3" /> Save {name}
      </button>
    </div>
  );
}

export default function ChatPage() {
  const { data: session } = useSession();
  const me = session?.user?.id;
  const { showToast } = useToast();

  const [users, setUsers] = useState<ChatUser[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Dm[]>([]);
  const [text, setText] = useState("");
  const [search, setSearch] = useState("");
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [sending, setSending] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const activeRoomRef = useRef<string | null>(null);
  const usersRef = useRef<ChatUser[]>([]);

  const activeUser = users.find((u) => u.id === activeId) || null;
  const filteredUsers = users.filter(
    (u) =>
      u.name.toLowerCase().includes(search.toLowerCase()) ||
      (u.email || "").toLowerCase().includes(search.toLowerCase()),
  );

  const loadUsers = useCallback(async () => {
    try {
      const res = await fetch("/api/chat/users");
      if (res.ok) {
        const data = await res.json();
        usersRef.current = data.users || [];
        setUsers(data.users || []);
      }
    } catch {
      /* ignore */
    } finally {
      setLoadingUsers(false);
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
      // re-mark newly arrived ones
      setMessages((prev) =>
        prev.map((m) =>
          m.senderId === partnerId && !m.readAt ? { ...m, readAt: new Date().toISOString() } : m,
        ),
      );
    },
    [],
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
    loadUsers();
    updatePresence("online");
    const hb = setInterval(() => updatePresence("online"), 15000);
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
  }, [loadUsers, updatePresence]);

  // select conversation
  const openChat = useCallback(
    (id: string) => {
      setActiveId(id);
      activeRoomRef.current = id;
      setMobileOpen(true);
      loadMessages(id);
      markRead(id);
    },
    [loadMessages, markRead],
  );

  // Poll fallback for messages + presence + users
  useEffect(() => {
    const poll = setInterval(
      () => {
        loadUsers();
        if (activeRoomRef.current) {
          loadMessages(activeRoomRef.current);
          markRead(activeRoomRef.current);
        }
      },
      POLL_MS,
    );
    return () => clearInterval(poll);
  }, [loadUsers, loadMessages, markRead]);

  // Real-time via Supabase broadcast
  useEffect(() => {
    if (!isSupabaseConfigured || !me) return;

    const dm = supabase.channel("dm-events");
    const presence = supabase.channel("presence-events");

    dm
      .on("broadcast", { event: "new" }, () => {
        // new message may belong to the active room
        if (activeRoomRef.current) loadMessages(activeRoomRef.current);
      })
      .on("broadcast", { event: "read" }, () => {
        if (activeRoomRef.current) loadMessages(activeRoomRef.current);
      })
      .subscribe();

    presence.on("broadcast", { event: "presence" }, ({ payload }) => {
      usersRef.current = usersRef.current.map((u) =>
        u.id === payload.userId
          ? { ...u, status: payload.status, lastSeen: payload.lastSeen || u.lastSeen }
          : u,
      );
      setUsers(usersRef.current);
    });

    // Broadcast a join so partner can refresh their presence view
    presence.subscribe();

    return () => {
      supabase.removeChannel(dm);
      supabase.removeChannel(presence);
    };
  }, [me, loadMessages]);

  const sendMessage = async (payload: { text?: string; mediaUrl?: string; mediaType?: string; mediaName?: string }) => {
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
        // broadcast to peer
        if (isSupabaseConfigured) {
          await supabase.channel("dm-events").send({
            type: "broadcast",
            event: "new",
            payload: { room: channelRoomFor(me, activeId), from: me, at: new Date().toISOString() },
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
      // Web fallback: fetch as blob and save locally
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

  const handleFile = async (file: File) => {
    if (!file) return;
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

  const avatar = (u: ChatUser | null, size = 9) => {
    if (!u) return <div className={cn("h-9 w-9 rounded-full bg-primary/15 flex items-center justify-center")}>?</div>;
    if (u.image) {
      return <img src={u.image} alt="" className={cn("h-9 w-9 rounded-full object-cover")} />;
    }
    return (
      <div className={cn("h-9 w-9 rounded-full bg-primary/15 flex items-center justify-center text-sm font-bold text-primary")}>
        {u.name.charAt(0).toUpperCase()}
      </div>
    );
  };

  const active = activeUser as ChatUser | null;

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      <div className="hidden md:block">
        <PageHeader
          title="Messages"
          description="Private 1-on-1 chat between study buddies"
        />
      </div>

      <div className="flex flex-1 overflow-hidden rounded-lg border border-border bg-card">
        {/* Left: contact list */}
        <div
          className={cn(
            "w-full flex-col border-r border-border md:flex md:w-80 lg:w-96",
            mobileOpen && activeId ? "hidden md:flex" : "flex",
          )}
        >
          <div className="p-3 border-b border-border">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search people..."
                className="pl-9"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {loadingUsers ? (
              <div className="flex justify-center py-10">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="py-10 px-4 text-center text-sm text-muted-foreground">No users found</div>
            ) : (
              filteredUsers.map((u) => (
                <button
                  key={u.id}
                  onClick={() => openChat(u.id)}
                  className={cn(
                    "flex w-full items-center gap-3 px-3 py-3 text-left hover:bg-accent transition-colors",
                    activeId === u.id && "bg-accent",
                  )}
                >
                  <div className="relative shrink-0">
                    {avatar(u)}
                    <span
                      className={cn(
                        "absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-card",
                        u.status === "online" ? "bg-green-500" : "bg-muted",
                      )}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{u.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {lastSeenLabel(u.lastSeen, u.status)}
                    </p>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Right: conversation */}
        <div className={cn("flex-1 flex-col", !mobileOpen || !activeId ? "hidden md:flex" : "flex")}>
          {!activeId ? (
            <div className="flex flex-1 items-center justify-center">
              <EmptyState
                icon="💬"
                title="Select a conversation"
                description="Pick a user to start chatting. Only registered students appear here."
              />
            </div>
          ) : (
            <div className="flex h-full flex-col">
              {/* Header */}
              <div className="flex items-center gap-3 border-b border-border px-4 py-3">
                <button onClick={() => setMobileOpen(false)} className="md:hidden">
                  <ArrowLeft className="h-5 w-5" />
                </button>
                <div className="relative">
                  {avatar(active, 9)}
                  <span
                    className={cn(
                      "absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-card",
                      activeUser?.status === "online" ? "bg-green-500" : "bg-muted",
                    )}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{activeUser?.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {lastSeenLabel(activeUser?.lastSeen || null, activeUser?.status || "offline")}
                  </p>
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto bg-background/50 px-3 py-4 space-y-1.5">
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
                            <span className="rounded-full bg-muted px-3 py-0.5 text-[11px] text-muted-foreground">
                              {formatDay(m.createdAt)}
                            </span>
                          </div>
                        )}
                        <div className={cn("flex", mine ? "justify-end" : "justify-start")}>
                          <div
                            className={cn(
                              "max-w-[75%] rounded-2xl px-3 py-2 text-sm shadow-sm",
                              mine ? "bg-primary text-primary-foreground rounded-br-sm" : "bg-muted rounded-bl-sm",
                            )}
                          >
                            {mediaBubble(m, saveMedia)}
                            {m.text && <p className="whitespace-pre-wrap break-words">{m.text}</p>}
                            <div
                              className={cn(
                                "mt-0.5 flex items-center justify-end gap-1 text-[10px]",
                                mine ? "text-primary-foreground/70" : "text-muted-foreground",
                              )}
                            >
                              <span>{formatTime(m.createdAt)}</span>
                              {mine && (m.readAt ? <CheckCheck className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />)}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Input */}
              <div className="flex items-center gap-2 border-t border-border p-3">
                <label className="relative cursor-pointer text-muted-foreground hover:text-foreground">
                  {sending ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <Paperclip className="h-5 w-5" />
                  )}
                  <input
                    type="file"
                    accept="image/*,video/*,audio/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleFile(f);
                      e.target.value = "";
                    }}
                  />
                </label>
                <Input
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSendText();
                    }
                  }}
                  placeholder="Type a message..."
                  className="flex-1"
                />
                <Button size="icon" onClick={handleSendText} disabled={!text.trim() || sending}>
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
