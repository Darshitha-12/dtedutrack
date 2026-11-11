"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  Brain,
  Plus,
  MessageSquare,
  Send,
  Square,
  Trash2,
  Pencil,
  Check,
  X,
  Copy,
  CheckCheck,
  Loader2,
  Sparkles,
  BookOpen,
  Globe,
  ChevronDown,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/lib/language-context";
import { SUBJECT_LIST } from "@/types/subject";

interface Message {
  id: string;
  role: "USER" | "ASSISTANT" | "SYSTEM";
  content: string;
  createdAt: string;
}

interface Conversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
}

interface AIModeOption {
  id: string;
  name: string;
  nameSi?: string;
  icon: string;
  description: string;
}

const FALLBACK_MODES: AIModeOption[] = [
  { id: "tutor", name: "A/L Tutor", nameSi: "A/L ගුරුවරයා", icon: "🎓", description: "Standard A/L Biology tutor mode" },
  { id: "beginner", name: "Beginner", nameSi: "ආරම්භක", icon: "🌱", description: "Simplified explanations for beginners" },
  { id: "deep", name: "Deep Explanation", nameSi: "ගැඹුරු පැහැදිලි කිරීම", icon: "🔬", description: "In-depth molecular and cellular level explanations" },
  { id: "revision", name: "Quick Revision", nameSi: "ඉක්මන් සමාලෝචනය", icon: "📝", description: "Concise revision notes and key facts" },
  { id: "socratic", name: "Socratic Tutor", nameSi: "සොක්රටික් ගුරුවරයා", icon: "❓", description: "Guided questioning to build understanding" },
  { id: "exam", name: "Exam Question Solver", nameSi: "විභාග ප්‍රශ්න විසඳුම", icon: "📋", description: "Structured approach to exam-style questions" },
  { id: "compare", name: "Compare Concepts", nameSi: "සංසන්දනය", icon: "⚖️", description: "Side-by-side concept comparison" },
  { id: "quiz", name: "Quiz Me", nameSi: "ප්‍රශ්නාඝෝෂණය", icon: "🎯", description: "Interactive quiz with feedback" },
  { id: "mistake", name: "Explain My Mistake", nameSi: "වැරැද්ද පැහැදිලි කරන්න", icon: "🔍", description: "Analyze and explain mistakes" },
];

const SUGGESTED_PROMPTS: Record<"en" | "si", string[]> = {
  en: [
    "Explain photosynthesis simply",
    "Give me an A/L-level explanation of DNA replication",
    "Quiz me on cell division",
    "Compare mitosis and meiosis",
    "What are the stages of protein synthesis?",
    "Explain this topic for a beginner",
  ],
  si: [
    "ෆොටෝසින්තේසිස් සරලව පැහැදිලි කරන්න",
    "DNA ප්‍රතිකූරණය A/L මට්ටමින් පැහැදිලි කරන්න",
    "සෛල බෙදීම ගැන මට ප්‍රශ්න අහන්න",
    "මයිටෝසිස් හා මයෝසිස් සංසන්දනය කරන්න",
    "ප්‍රෝටීන් සංස්ලේෂණයේ අදියර මොනවාද?",
    "මෙම විෂය ආරම්භකයෙකුට පැහැදිලි කරන්න",
  ],
};

const MAX_CHAR_LIMIT = 4000;

export default function AITutorPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [isLoadingConversations, setIsLoadingConversations] = useState(true);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [activeMode, setActiveMode] = useState("tutor");
  const [modes, setModes] = useState<AIModeOption[]>(FALLBACK_MODES);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [editingConversationId, setEditingConversationId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [modeDropdownOpen, setModeDropdownOpen] = useState(false);
  const [subjectDropdownOpen, setSubjectDropdownOpen] = useState(false);
  const [activeSubject, setActiveSubject] = useState("bio");
  const [loadError, setLoadError] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const { locale, setLocale } = useLanguage();
  const language = locale;
  const t = (si: string, en: string) => (language === "si" ? si : en);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  useEffect(() => {
    fetchConversations();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/ai/modes");
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.modes) && data.modes.length) {
            setModes(data.modes);
          }
        }
      } catch {
        /* keep fallback modes */
      }
    })();
  }, []);

  useEffect(() => {
    if (activeConversationId) {
      fetchMessages(activeConversationId);
    } else {
      setMessages([]);
    }
  }, [activeConversationId]);

  const fetchConversations = async () => {
    try {
      const res = await fetch("/api/ai/conversations");
      if (res.ok) {
        const data = await res.json();
        setConversations(data.conversations || []);
      } else {
        setLoadError(t("සංවාද පූරණය කිරීමට නොහැකි විය.", "Failed to load conversations. Please try again."));
      }
    } catch {
      setLoadError(t("සංවාද පූරණය කිරීමට නොහැකි විය.", "Failed to load conversations. Please try again."));
    } finally {
      setIsLoadingConversations(false);
    }
  };

  const fetchMessages = async (conversationId: string) => {
    setIsLoadingMessages(true);
    try {
      const res = await fetch(`/api/ai/conversations/${conversationId}`);
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages || []);
      } else {
        setLoadError(t("පණිවිඩ පූරණය කිරීමට නොහැකි විය.", "Failed to load messages. Please try again."));
      }
    } catch {
      setLoadError(t("පණිවිඩ පූරණය කිරීමට නොහැකි විය.", "Failed to load messages. Please try again."));
    } finally {
      setIsLoadingMessages(false);
    }
  };

  const addConversation = (id: string, title: string) => {
    const newConv: Conversation = {
      id,
      title,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messageCount: 0,
    };
    setConversations((prev) => {
      if (prev.some((c) => c.id === id)) return prev;
      return [newConv, ...prev];
    });
  };

  const deleteConversation = async (conversationId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const res = await fetch(`/api/ai/conversations/${conversationId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setConversations((prev) => prev.filter((c) => c.id !== conversationId));
        if (activeConversationId === conversationId) {
          setActiveConversationId(null);
        }
      }
    } catch {
      console.error("Failed to delete conversation");
    }
  };

  const renameConversation = async (conversationId: string) => {
    if (!editTitle.trim()) {
      setEditingConversationId(null);
      return;
    }
    try {
      const res = await fetch(`/api/ai/conversations/${conversationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: editTitle.trim() }),
      });
      if (res.ok) {
        setConversations((prev) =>
          prev.map((c) => (c.id === conversationId ? { ...c, title: editTitle.trim() } : c))
        );
      }
    } catch {
      console.error("Failed to rename conversation");
    }
    setEditingConversationId(null);
  };

  const sendMessage = async (text?: string) => {
    const content = (text || inputValue).trim();
    if (!content || isStreaming || content.length > MAX_CHAR_LIMIT) return;

    let conversationId = activeConversationId;

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "USER",
      content,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMessage]);
    setInputValue("");

    const assistantId = crypto.randomUUID();
    const assistantMessage: Message = {
      id: assistantId,
      role: "ASSISTANT",
      content: "",
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, assistantMessage]);
    setIsStreaming(true);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    let accumulated = "";

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
        },
        body: JSON.stringify({
          conversationId: conversationId ?? undefined,
          message: content,
          mode: activeMode,
          language,
          subjectId: activeSubject,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        let detail = "Failed to get a response.";
        try {
          const j = await res.json();
          detail = j?.error || detail;
        } catch {
          /* ignore */
        }
        throw new Error(detail);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response stream");

      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const events = chunk.split(/\r?\n\r?\n/);

        for (const event of events) {
          if (!event.startsWith("data: ")) continue;
          const data = event.slice(6).trim();
          if (data === "[DONE]") continue;

          let parsed: { type?: string; content?: string; conversationId?: string; error?: string };
          try {
            parsed = JSON.parse(data);
          } catch {
            accumulated += data;
            setMessages((prev) =>
              prev.map((m) => (m.id === assistantId ? { ...m, content: accumulated } : m))
            );
            continue;
          }

          if (parsed.type === "metadata" && parsed.conversationId) {
            conversationId = parsed.conversationId;
            setActiveConversationId(parsed.conversationId);
            addConversation(parsed.conversationId, content.slice(0, 60));
          } else if (parsed.type === "token" && parsed.content) {
            accumulated += parsed.content;
            setMessages((prev) =>
              prev.map((m) => (m.id === assistantId ? { ...m, content: accumulated } : m))
            );
          } else if (parsed.type === "error") {
            throw new Error(parsed.error || "Generation failed.");
          }
        }
      }

      if (conversationId) {
        setConversations((prev) =>
          prev.map((c) =>
            c.id === conversationId
              ? { ...c, messageCount: (c.messageCount || 0) + 2, updatedAt: new Date().toISOString() }
              : c
          )
        );
      }
    } catch (error: unknown) {
      if (error instanceof Error && error.name === "AbortError") {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, content: accumulated || t("නතර කරන ලදී.", "Generation stopped.") }
              : m
          )
        );
      } else {
        const msg = error instanceof Error ? error.message : "Please try again.";
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, content: msg } : m
          )
        );
      }
    } finally {
      setIsStreaming(false);
      abortControllerRef.current = null;
    }
  };

  const stopGeneration = () => {
    abortControllerRef.current?.abort();
    setIsStreaming(false);
  };

  const copyMessage = (messageId: string, content: string) => {
    navigator.clipboard.writeText(content);
    setCopiedMessageId(messageId);
    setTimeout(() => setCopiedMessageId(null), 2000);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const currentConversation = conversations.find((c) => c.id === activeConversationId);
  const currentMode = modes.find((m) => m.id === activeMode);
  const currentSubject = SUBJECT_LIST.find((s) => s.id === activeSubject) || SUBJECT_LIST[0];

  const renderMessage = (msg: Message) => {
    if (msg.role === "USER") {
      return (
        <div key={msg.id} className="flex justify-end mb-4 animate-fade-up">
          <div className="max-w-[80%] md:max-w-[70%]">
            <div className="bg-primary text-primary-foreground rounded-2xl rounded-br-md px-4 py-3">
              <p className="text-sm whitespace-pre-wrap break-words">{msg.content}</p>
            </div>
            <p className="text-[10px] text-muted-foreground mt-1 text-right">
              {new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </p>
          </div>
        </div>
      );
    }

    return (
      <div key={msg.id} className="flex justify-start mb-4 animate-fade-up">
        <div className="max-w-[80%] md:max-w-[70%]">
          <div className="flex items-start gap-2">
            <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-1">
              <Brain className="h-3.5 w-3.5 text-primary" />
            </div>
            <div>
              <div className="bg-muted/50 rounded-2xl rounded-bl-md px-4 py-3 border border-border/30">
                <p className="text-sm whitespace-pre-wrap break-words">{msg.content}</p>
                {isStreaming && !msg.content && (
                  <div className="flex items-center gap-1.5 py-1">
                    <div className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce [animation-delay:-0.3s]" />
                    <div className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce [animation-delay:-0.15s]" />
                    <div className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce" />
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 mt-1">
                <p className="text-[10px] text-muted-foreground">
                  {new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </p>
                {msg.content && (
                  <button
                    onClick={() => copyMessage(msg.id, msg.content)}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {copiedMessageId === msg.id ? (
                      <CheckCheck className="h-3 w-3 text-primary" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderConversationItem = (conv: Conversation) => {
    const isActive = conv.id === activeConversationId;
    const isEditing = conv.id === editingConversationId;

    return (
      <div
        key={conv.id}
        onClick={() => {
          if (!isEditing) {
            setActiveConversationId(conv.id);
            setSidebarOpen(false);
          }
        }}
        className={cn(
          "group flex items-center gap-2 px-3 py-2.5 rounded-lg cursor-pointer transition-colors",
          isActive
            ? "bg-primary/10 text-primary"
            : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
        )}
      >
        <MessageSquare className="h-4 w-4 shrink-0" />
        {isEditing ? (
          <div className="flex-1 flex items-center gap-1">
            <Input
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") renameConversation(conv.id);
                if (e.key === "Escape") setEditingConversationId(null);
              }}
              className="h-7 text-xs"
              autoFocus
              onClick={(e) => e.stopPropagation()}
            />
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6"
              onClick={(e) => {
                e.stopPropagation();
                renameConversation(conv.id);
              }}
            >
              <Check className="h-3 w-3" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6"
              onClick={(e) => {
                e.stopPropagation();
                setEditingConversationId(null);
              }}
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        ) : (
          <>
            <span className="flex-1 text-sm truncate">{conv.title}</span>
            <div className="hidden group-hover:flex items-center gap-0.5">
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6"
                onClick={(e) => {
                  e.stopPropagation();
                  setEditingConversationId(conv.id);
                  setEditTitle(conv.title);
                }}
              >
                <Pencil className="h-3 w-3" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6 text-destructive hover:text-destructive"
                onClick={(e) => deleteConversation(conv.id, e)}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          </>
        )}
      </div>
    );
  };

  return (
    <div className="flex h-[calc(100vh-3.5rem)] overflow-hidden">
      {/* Conversation Sidebar - Desktop */}
      <aside className="hidden lg:flex lg:w-72 lg:flex-col border-r border-border/50 bg-background/80 backdrop-blur-sm">
        <div className="flex items-center justify-between p-4 border-b border-border/50">
          <h2 className="font-semibold text-sm">{t("සංවාද", "Conversations")}</h2>
          <Button
            size="sm"
            onClick={() => {
              setActiveConversationId(null);
              setMessages([]);
            }}
            className="gap-1.5 h-8"
          >
            <Plus className="h-3.5 w-3.5" />
            {t("අලුත්", "New")}
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {isLoadingConversations ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : conversations.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-8">
              {t("සංවාද තවම නැත", "No conversations yet")}
            </p>
          ) : (
            conversations.map(renderConversationItem)
          )}
        </div>
      </aside>

      {/* Mobile sidebar toggle */}
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="lg:hidden fixed bottom-4 left-4 z-50 h-10 w-10 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center"
      >
        <MessageSquare className="h-5 w-5" />
      </button>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-40">
          <div className="fixed inset-0 bg-background/80 backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />
          <div className="fixed inset-y-0 left-0 w-72 bg-card border-r border-border animate-slide-in z-50">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h2 className="font-semibold text-sm">{t("සංවාද", "Conversations")}</h2>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  onClick={() => {
                    setActiveConversationId(null);
                    setMessages([]);
                    setSidebarOpen(false);
                  }}
                  className="gap-1.5 h-8"
                >
                  <Plus className="h-3.5 w-3.5" />
                  {t("අලුත්", "New")}
                </Button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
              {conversations.map(renderConversationItem)}
            </div>
          </div>
        </div>
      )}

      {/* Chat Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/50 bg-background/80 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <div className="relative">
              <button
                onClick={() => setModeDropdownOpen(!modeDropdownOpen)}
                className="flex items-center gap-2 text-sm font-medium hover:bg-accent px-3 py-1.5 rounded-lg transition-colors"
              >
                <span>{currentMode?.icon}</span>
                <span>{language === "si" ? currentMode?.nameSi || currentMode?.name : currentMode?.name}</span>
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
              {modeDropdownOpen && (
                <div className="absolute top-full left-0 mt-1 w-56 bg-card border border-border rounded-xl shadow-lg py-1 z-50">
                  {modes.map((mode) => (
                    <button
                      key={mode.id}
                      onClick={() => {
                        setActiveMode(mode.id);
                        setModeDropdownOpen(false);
                      }}
                      className={cn(
                        "w-full flex items-center gap-3 px-3 py-2.5 text-sm transition-colors text-left",
                        activeMode === mode.id
                          ? "bg-primary/10 text-primary"
                          : "text-foreground hover:bg-accent"
                      )}
                    >
                      <span className="text-base">{mode.icon}</span>
                      <div>
                        <p className="font-medium">{language === "si" ? mode.nameSi || mode.name : mode.name}</p>
                        <p className="text-xs text-muted-foreground">{language === "si" ? mode.nameSi || mode.description : mode.description}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="relative">
              <button
                onClick={() => setSubjectDropdownOpen(!subjectDropdownOpen)}
                className="flex items-center gap-2 text-sm font-medium hover:bg-accent px-3 py-1.5 rounded-lg transition-colors"
              >
                <span>{currentSubject.icon}</span>
                <span>{currentSubject.name}</span>
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
              {subjectDropdownOpen && (
                <div className="absolute top-full left-0 mt-1 w-56 bg-card border border-border rounded-xl shadow-lg py-1 z-50">
                  {SUBJECT_LIST.map((subject) => (
                    <button
                      key={subject.id}
                      onClick={() => {
                        setActiveSubject(subject.id);
                        setSubjectDropdownOpen(false);
                      }}
                      className={cn(
                        "w-full flex items-center gap-3 px-3 py-2.5 text-sm transition-colors text-left",
                        activeSubject === subject.id
                          ? "bg-primary/10 text-primary"
                          : "text-foreground hover:bg-accent"
                      )}
                    >
                      <span className="text-base">{subject.icon}</span>
                      <p className="font-medium">{subject.name}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {currentConversation && (
              <div className="hidden sm:block">
                <Badge variant="secondary" className="text-xs">
                  <BookOpen className="h-3 w-3 mr-1" />
                  {(currentConversation.messageCount ?? 0)} {t("පණිවිඩ", "messages")}
                </Badge>
              </div>
            )}
          </div>
          <button
            onClick={() => setLocale(language === "en" ? "si" : "en")}
            className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground px-2.5 py-1.5 rounded-lg hover:bg-accent transition-colors"
          >
            <Globe className="h-3.5 w-3.5" />
            {language === "si" ? "EN" : "සිංහල"}
          </button>
        </div>

        {loadError && (
          <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-destructive/10 border-b border-destructive/20">
            <p className="flex items-center gap-2 text-xs font-medium text-destructive">
              <AlertCircle className="h-3.5 w-3.5" />
              {loadError}
            </p>
            <button
              onClick={() => setLoadError(null)}
              className="text-xs text-muted-foreground hover:text-foreground shrink-0"
            >
              {t("වසන්න", "Dismiss")}
            </button>
          </div>
        )}

        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto px-4 py-6">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full max-w-lg mx-auto text-center">
              <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-6">
                <Sparkles className="h-8 w-8 text-primary" />
              </div>
              <h2 className="text-xl font-bold mb-2">{t("AI ගුරුවරයා", "AI Tutor")}</h2>
              <p className="text-sm text-muted-foreground mb-8">
                {t(
                  `${currentSubject.name} ගැන ඕනෑම දෙයක් මගෙන් අහන්න. මට සංකල්ප පැහැදිලි කිරීමට, ඔබට ප්‍රශ්න ඇසීමට, හෝ විභාග සඳහා සමාලෝචනයට උදව් කළ හැක.`,
                  `Ask me anything about ${currentSubject.name}. I can explain concepts, quiz you, or help you review for exams.`
                )}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full">
                {SUGGESTED_PROMPTS[language].map((prompt) => (
                  <button
                    key={prompt}
                    onClick={() => {
                      setInputValue(prompt);
                      sendMessage(prompt);
                    }}
                    className="text-left text-sm px-4 py-3 rounded-xl border border-border/50 bg-card/50 hover:bg-accent/50 hover:border-primary/30 transition-all duration-200 text-foreground"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto">
              {messages.map(renderMessage)}
              {isStreaming && messages[messages.length - 1]?.role === "ASSISTANT" && messages[messages.length - 1]?.content && (
                <div className="flex items-center gap-1.5 ml-9 mb-4">
                  <div className="h-1 w-1 rounded-full bg-primary animate-pulse" />
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input Area */}
        <div className="px-4 pb-4 pt-2 border-t border-border/50 bg-background/80 backdrop-blur-sm">
          <div className="max-w-3xl mx-auto">
            <div className="relative rounded-2xl border border-border/50 bg-card/80 backdrop-blur-sm focus-within:border-primary/50 transition-colors">
              <textarea
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={t(`${currentSubject.name} ප්‍රශ්නයක් අසන්න...`, `Ask a ${currentSubject.name} question...`)}
                rows={1}
                className="w-full resize-none bg-transparent px-4 py-3 pr-24 text-sm placeholder:text-muted-foreground focus:outline-none min-h-[48px] max-h-[200px]"
                style={{ height: "auto" }}
                onInput={(e) => {
                  const target = e.target as HTMLTextAreaElement;
                  target.style.height = "auto";
                  target.style.height = Math.min(target.scrollHeight, 200) + "px";
                }}
              />
              <div className="absolute right-2 bottom-2 flex items-center gap-1.5">
                <span
                  className={cn(
                    "text-[10px] tabular-nums px-1.5 py-0.5 rounded",
                    inputValue.length > MAX_CHAR_LIMIT
                      ? "text-destructive"
                      : inputValue.length > MAX_CHAR_LIMIT * 0.9
                      ? "text-yellow-500"
                      : "text-muted-foreground"
                  )}
                >
                  {inputValue.length}/{MAX_CHAR_LIMIT}
                </span>
                {isStreaming ? (
                  <Button
                    size="icon"
                    variant="destructive"
                    className="h-8 w-8"
                    onClick={stopGeneration}
                  >
                    <Square className="h-3.5 w-3.5" />
                  </Button>
                ) : (
                  <Button
                    size="icon"
                    className="h-8 w-8"
                    disabled={!inputValue.trim() || inputValue.length > MAX_CHAR_LIMIT}
                    onClick={() => sendMessage()}
                  >
                    <Send className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground text-center mt-2">
              {t(
                "AI ගුරුවරයා වැරදි තොරතුරු ලබා දිය හැක. සැමවිටම පෙළපොත් සමඟ සත්‍යාපනය කරන්න.",
                "AI Tutor may produce inaccurate information. Always verify with textbooks."
              )}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
