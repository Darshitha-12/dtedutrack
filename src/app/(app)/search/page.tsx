"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Search, Loader2, FileText, BookOpen, FolderTree, ListTree, Target } from "lucide-react";

interface SearchResult {
  type: "subject" | "unit" | "topic" | "subtopic" | "objective";
  id: string;
  slug: string;
  title: string;
  titleSi: string;
  description: string;
  path: string;
  relevance: number;
}

const TYPE_ICONS: Record<SearchResult["type"], React.ElementType> = {
  subject: BookOpen,
  unit: FolderTree,
  topic: ListTree,
  subtopic: FileText,
  objective: Target,
};

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const runSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([]);
      setSearched(false);
      return;
    }
    setLoading(true);
    setSearched(true);
    try {
      const res = await fetch(`/api/content/search?q=${encodeURIComponent(q)}&limit=20`);
      if (res.ok) {
        const data = await res.json();
        setResults(data.results || []);
      } else {
        setResults([]);
      }
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => runSearch(query), 300);
    return () => clearTimeout(t);
  }, [query, runSearch]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Search"
        description="Search across the Biology syllabus, units, topics, and objectives"
      />

      <Card className="p-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search topics, units, objectives..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9"
            autoFocus
          />
        </div>
      </Card>

      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {!loading && !query && (
        <p className="text-center text-sm text-muted-foreground py-8">
          Start typing to search your study materials.
        </p>
      )}

      {!loading && searched && query && results.length === 0 && (
        <p className="text-center text-sm text-muted-foreground py-8">
          No results found for &ldquo;{query}&rdquo;.
        </p>
      )}

      {!loading && results.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {results.length} result{results.length === 1 ? "" : "s"} for &ldquo;{query}&rdquo;
          </p>
          {results.map((r) => {
            const Icon = TYPE_ICONS[r.type];
            return (
              <Link key={r.id} href={r.path}>
                <Card className="p-4 hover:shadow-lg transition-shadow cursor-pointer group">
                  <div className="flex items-start gap-3">
                    <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <Icon className="h-4 w-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium truncate group-hover:text-primary transition-colors">
                          {r.title}
                        </h3>
                        <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-muted text-muted-foreground shrink-0">
                          {r.type}
                        </span>
                      </div>
                      {r.description && (
                        <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                          {r.description}
                        </p>
                      )}
                    </div>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
