"use client";

import { useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { EmptyState } from "@/components/ui/empty-state";
import { Loader2, Sparkles, Boxes, Eraser } from "lucide-react";

export default function DiagramsPage() {
  const [topic, setTopic] = useState("");
  const [structure, setStructure] = useState("");
  const [language, setLanguage] = useState<"English" | "Sinhala">("English");
  const [loading, setLoading] = useState(false);
  const [content, setContent] = useState("");
  const [error, setError] = useState("");

  const generate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!topic.trim()) {
      setError("Please enter a topic or structure.");
      return;
    }
    setError("");
    setLoading(true);
    setContent("");
    try {
      const res = await fetch("/api/diagrams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: topic.trim(), structure, language }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to generate diagram");
      setContent(data.content || "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate diagram");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Diagram Lab"
        description="Generate labelled Biology diagrams and explanations with AI."
      />

      <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Boxes className="h-4 w-4 text-primary" /> Diagram Request
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={generate} className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  Structure / Process
                </label>
                <Input
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="e.g. Human Heart"
                  disabled={loading}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  Focus details (optional)
                </label>
                <textarea
                  value={structure}
                  onChange={(e) => setStructure(e.target.value)}
                  rows={3}
                  disabled={loading}
                  placeholder="e.g. chambers, valves, blood flow direction"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Language</label>
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
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                Generate Diagram
              </Button>
              {content && (
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full gap-2"
                  onClick={() => setContent("")}
                >
                  <Eraser className="h-4 w-4" /> Clear
                </Button>
              )}
            </form>
          </CardContent>
        </Card>

        <Card className="min-h-[400px]">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <p className="mt-3 text-sm text-muted-foreground">Drawing diagram...</p>
            </div>
          ) : content ? (
            <CardContent className="pt-6 max-w-none">
              {renderDiagram(content)}
            </CardContent>
          ) : (
            <EmptyState
              icon="🧬"
              title="No diagram yet"
              description="Enter a biological structure to generate a labelled diagram and explanation."
            />
          )}
        </Card>
      </div>
    </div>
  );
}

function renderDiagram(content: string) {
  const lines = content.split("\n");
  return lines.map((line, i) => {
    const trimmed = line.trim();
    if (trimmed.startsWith("### ")) {
      return (
        <h4 key={i} className="mt-5 mb-2 text-base font-semibold text-foreground">
          {trimmed.slice(4)}
        </h4>
      );
    }
    if (trimmed.startsWith("## ")) {
      return (
        <h3 key={i} className="mt-6 mb-2 text-lg font-bold text-foreground">
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
    if (trimmed.startsWith("|") || /^[+\-=┌└├┤┐┘|\s]+$/.test(trimmed)) {
      return (
        <pre key={i} className="mb-3 overflow-x-auto rounded-md border border-border bg-muted/40 p-3 text-xs leading-tight">
          {line}
        </pre>
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
