"use client";

import { useState, useEffect, useCallback } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { EmptyState } from "@/components/ui/empty-state";
import { Loader2, Sparkles, Trash2, Eye, Plus, FileText } from "lucide-react";

interface Note {
  id: string;
  title: string;
  content: string;
  createdAt: string;
}

function formatContent(content: string) {
  const lines = content.split("\n");
  return lines.map((line, i) => {
    const trimmed = line.trim();
    if (trimmed.startsWith("## ")) {
      return (
        <h3 key={i} className="mt-5 mb-2 text-lg font-semibold text-foreground">
          {trimmed.slice(3)}
        </h3>
      );
    }
    if (trimmed.startsWith("# ")) {
      return (
        <h2 key={i} className="mt-6 mb-2 text-xl font-bold text-foreground">
          {trimmed.slice(2)}
        </h2>
      );
    }
    if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      return (
        <li key={i} className="ml-5 mb-1 text-sm text-muted-foreground list-disc">
          {trimmed.slice(2)}
        </li>
      );
    }
    if (trimmed === "") {
      return <div key={i} className="h-2" />;
    }
    return (
      <p key={i} className="mb-2 text-sm leading-relaxed text-muted-foreground">
        {line}
      </p>
    );
  });
}

export default function NotesPage() {
  const [topic, setTopic] = useState("");
  const [prompt, setPrompt] = useState("");
  const [language, setLanguage] = useState<"English" | "Sinhala">("English");
  const [loading, setLoading] = useState(false);
  const [notes, setNotes] = useState<Note[]>([]);
  const [selected, setSelected] = useState<Note | null>(null);
  const [error, setError] = useState("");

  const loadNotes = useCallback(async () => {
    try {
      const res = await fetch("/api/notes");
      if (!res.ok) throw new Error("Failed to load notes");
      const data = await res.json();
      setNotes(data.notes || []);
    } catch {
      setNotes([]);
    }
  }, []);

  useEffect(() => {
    loadNotes();
  }, [loadNotes]);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!topic.trim()) {
      setError("Please enter a topic.");
      return;
    }
    setError("");
    setLoading(true);
    setSelected(null);
    try {
      const res = await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, prompt, language }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to generate note");
      setSelected(data);
      setTopic("");
      setPrompt("");
      await loadNotes();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/notes?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete note");
      setNotes((prev) => prev.filter((n) => n.id !== id));
      if (selected?.id === id) setSelected(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete note");
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Study Notes"
        description="Generate structured A/L study notes with AI and manage your saved notes."
      />

      <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
        {/* Left: form + saved list */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Sparkles className="h-4 w-4 text-primary" />
                Generate with AI
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleGenerate} className="space-y-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">
                    Topic
                  </label>
                  <Input
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    placeholder="e.g. Photosynthesis"
                    disabled={loading}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">
                    Extra instructions (optional)
                  </label>
                  <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="e.g. Focus on light reactions with bullet points"
                    disabled={loading}
                    rows={3}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">
                    Language
                  </label>
                  <Select
                    value={language}
                    onChange={(e) => setLanguage(e.target.value as "English" | "Sinhala")}
                    disabled={loading}
                  >
                    <option value="English">English</option>
                    <option value="Sinhala">සිංහල</option>
                  </Select>
                </div>
                {error && (
                  <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                    {error}
                  </div>
                )}
                <Button type="submit" className="w-full gap-2" disabled={loading}>
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4" />
                      Generate Note
                    </>
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <FileText className="h-4 w-4 text-primary" />
                Saved Notes
                <Badge variant="secondary" className="ml-auto">{notes.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {notes.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  No notes yet. Generate your first one!
                </p>
              ) : (
                <ul className="space-y-2">
                  {notes.map((n) => (
                    <li
                      key={n.id}
                      className="flex items-center gap-2 rounded-md border border-border px-3 py-2"
                    >
                      <button
                        onClick={() => setSelected(n)}
                        className="flex min-w-0 flex-1 items-center gap-2 text-left"
                      >
                        <Eye className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <span className="truncate text-sm font-medium">{n.title}</span>
                      </button>
                      <button
                        onClick={() => handleDelete(n.id)}
                        className="shrink-0 rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        aria-label="Delete note"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right: note view */}
        <Card className="min-h-[300px]">
          {selected ? (
            <>
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <CardTitle className="text-lg">{selected.title}</CardTitle>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelected(null)}
                    className="gap-1"
                  >
                    <Plus className="h-4 w-4 rotate-45" /> Close
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="max-w-none">{formatContent(selected.content)}</div>
              </CardContent>
            </>
          ) : (
            <EmptyState
              icon="📝"
              title="Select a note"
              description="Generate a note with AI or pick one from your saved list to view it here."
            />
          )}
        </Card>
      </div>
    </div>
  );
}
