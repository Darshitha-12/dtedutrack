"use client";

import { useState, useEffect, useCallback } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Loader2, Plus, Trash2, Pin, Check, AlertCircle } from "lucide-react";

interface Entry {
  id: string;
  title: string;
  content: string;
  color: string;
  pinned: boolean;
  updatedAt: string;
}

const COLORS = [
  { value: "", label: "Default", dot: "#3b82f6" },
  { value: "yellow", label: "Yellow", dot: "#facc15" },
  { value: "green", label: "Green", dot: "#22c55e" },
  { value: "pink", label: "Pink", dot: "#ec4899" },
  { value: "purple", label: "Purple", dot: "#a855f7" },
];

const COLOR_CLASS: Record<string, string> = {
  yellow: "border-yellow-500/40 bg-yellow-500/5",
  green: "border-green-500/40 bg-green-500/5",
  pink: "border-pink-500/40 bg-pink-500/5",
  purple: "border-purple-500/40 bg-purple-500/5",
};

export default function NotepadPage() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [color, setColor] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/notepad");
      if (!res.ok) throw new Error("Failed to load notes");
      const data = await res.json();
      setEntries(data.entries || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load notes");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const add = async () => {
    setError("");
    if (!content.trim() && !title.trim()) {
      setError("Write a note first.");
      return;
    }
    try {
      const res = await fetch("/api/notepad", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), content, color }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create note");
      setTitle("");
      setContent("");
      setColor("");
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 1500);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create note");
    }
  };

  const updateEntry = async (id: string, patch: Partial<Entry>) => {
    setSavingId(id);
    try {
      const res = await fetch("/api/notepad", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...patch }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Failed to update note");
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update note");
    } finally {
      setSavingId(null);
    }
  };

  const remove = async (id: string) => {
    setError("");
    try {
      const res = await fetch("/api/notepad", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Failed to delete note");
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete note");
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Note Pad"
        description="Quick notes that save instantly. Tap the ✎ icon on a note to sketch ideas on the go."
      />

      {error && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <Card>
        <CardContent className="space-y-3 pt-6">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Note title (optional)"
          />
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Start typing your note..."
            rows={5}
            className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
          <div className="flex flex-wrap items-center gap-3">
            <Select value={color} onChange={(e) => setColor(e.target.value)}>
              {COLORS.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </Select>
            <Button onClick={add} className="gap-2">
              <Plus className="h-4 w-4" /> Add Note
            </Button>
            {savedFlash && (
              <span className="flex items-center gap-1 text-sm text-emerald-500">
                <Check className="h-4 w-4" /> Saved
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading notes...
        </div>
      ) : entries.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No notes yet. Create your first note above.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {entries.map((e) => (
            <div
              key={e.id}
              className={`group relative rounded-lg border ${COLOR_CLASS[e.color] || "border-border"} bg-card p-4`}
            >
              {savingId === e.id && (
                <Loader2 className="absolute right-3 top-3 h-4 w-4 animate-spin text-muted-foreground" />
              )}
              <div className="mb-1 flex items-start justify-between gap-2">
                <h3 className="text-sm font-semibold">{e.title || "Untitled"}</h3>
                <div className="flex shrink-0 gap-1">
                  <button
                    onClick={() => updateEntry(e.id, { pinned: !e.pinned })}
                    className={`rounded p-1 ${e.pinned ? "text-primary" : "text-muted-foreground hover:text-primary"}`}
                    aria-label="Pin note"
                  >
                    <Pin className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => remove(e.id)}
                    className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    aria-label="Delete note"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <pre className="whitespace-pre-wrap break-words font-sans text-sm text-muted-foreground">
                {e.content}
              </pre>
              <p className="mt-2 text-xs text-muted-foreground/60">
                {new Date(e.updatedAt).toLocaleString()}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
