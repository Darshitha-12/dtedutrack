"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
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

interface IndexEntry {
  type: SearchResult["type"];
  id: string;
  slug: string;
  title: string;
  titleSi: string;
  description: string;
  path: string;
  titleScore: number;
  altScore: number;
  alt: unknown[];
}

type Row = Record<string, unknown>;

const TYPE_ICONS: Record<SearchResult["type"], React.ElementType> = {
  subject: BookOpen,
  unit: FolderTree,
  topic: ListTree,
  subtopic: FileText,
  objective: Target,
};

const str = (v: unknown): string => (typeof v === "string" ? v : "");

function has(text: unknown, needle: string): boolean {
  return typeof text === "string" && text.toLowerCase().includes(needle);
}

function buildIndex(db: Record<string, Row[]>): IndexEntry[] {
  const subjects = db.subjects || [];
  const units = db.units || [];
  const topics = db.topics || [];
  const subtopics = db.subtopics || [];
  const objectives = db.objectives || [];
  const subjectOf = (id: unknown) => subjects.find((s) => s.id === id);
  const unitOf = (id: unknown) => units.find((u) => u.id === id);
  const topicOf = (id: unknown) => topics.find((t) => t.id === id);
  const entries: IndexEntry[] = [];

  for (const s of subjects) {
    entries.push({
      type: "subject",
      id: str(s.id),
      slug: str(s.slug),
      title: str(s.name),
      titleSi: str(s.nameSi),
      description: str(s.description),
      path: `/syllabus/${str(s.slug)}`,
      titleScore: 100,
      altScore: 50,
      alt: [s.description, s.nameSi],
    });
  }
  for (const u of units) {
    const subject = subjectOf(u.subjectId);
    if (!subject) continue;
    entries.push({
      type: "unit",
      id: str(u.id),
      slug: str(u.slug),
      title: str(u.title),
      titleSi: str(u.titleSi),
      description: str(u.description),
      path: `/syllabus/${str(subject.slug)}/${str(u.slug)}`,
      titleScore: 90,
      altScore: 40,
      alt: [u.description, u.titleSi],
    });
  }
  for (const t of topics) {
    const unit = unitOf(t.unitId);
    const subject = unit ? subjectOf(unit.subjectId) : undefined;
    if (!unit || !subject) continue;
    entries.push({
      type: "topic",
      id: str(t.id),
      slug: str(t.slug),
      title: str(t.title),
      titleSi: str(t.titleSi),
      description: str(t.description),
      path: `/syllabus/${str(subject.slug)}/${str(unit.slug)}/${str(t.slug)}`,
      titleScore: 80,
      altScore: 30,
      alt: [t.description, t.titleSi],
    });
  }
  for (const st of subtopics) {
    const topic = topicOf(st.topicId);
    const unit = topic ? unitOf(topic.unitId) : undefined;
    const subject = unit ? subjectOf(unit.subjectId) : undefined;
    if (!topic || !unit || !subject) continue;
    entries.push({
      type: "subtopic",
      id: str(st.id),
      slug: str(st.slug),
      title: str(st.title),
      titleSi: str(st.titleSi),
      description: str(st.description),
      path: `/syllabus/${str(subject.slug)}/${str(unit.slug)}/${str(topic.slug)}#${str(st.slug)}`,
      titleScore: 70,
      altScore: 70,
      alt: [st.description, st.content],
    });
  }
  for (const o of objectives) {
    const topic = topicOf(o.topicId);
    const unit = topic ? unitOf(topic.unitId) : undefined;
    const subject = unit ? subjectOf(unit.subjectId) : undefined;
    if (!topic || !unit || !subject) continue;
    entries.push({
      type: "objective",
      id: str(o.id),
      slug: str(o.slug),
      title: str(o.title),
      titleSi: str(o.titleSi),
      description: str(o.description),
      path: `/syllabus/${str(subject.slug)}/${str(unit.slug)}/${str(topic.slug)}`,
      titleScore: 60,
      altScore: 0,
      alt: [],
    });
  }
  return entries;
}

function runIndexSearch(entries: IndexEntry[], q: string, limit = 20): SearchResult[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return [];
  const scored: SearchResult[] = [];
  for (const e of entries) {
    let relevance = 0;
    if (has(e.title, needle)) relevance = e.titleScore;
    else if (e.altScore > 0 && e.alt.some((a) => has(a, needle))) relevance = e.altScore;
    if (relevance > 0) {
      scored.push({
        type: e.type,
        id: e.id,
        slug: e.slug,
        title: e.title,
        titleSi: e.titleSi,
        description: e.description,
        path: e.path,
        relevance,
      });
    }
  }
  scored.sort((a, b) => b.relevance - a.relevance);
  return scored.slice(0, limit);
}

let indexPromise: Promise<IndexEntry[]> | null = null;

function loadIndex(): Promise<IndexEntry[]> {
  if (!indexPromise) {
    indexPromise = (async () => {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 12000);
      try {
        const res = await fetch("/offline/content.json", {
          signal: ctrl.signal,
          cache: "no-store",
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const db = (await res.json()) as Record<string, Row[]>;
        return buildIndex(db);
      } finally {
        clearTimeout(timer);
      }
    })().catch((err) => {
      indexPromise = null;
      throw err;
    });
  }
  return indexPromise;
}

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState("");
  const reqIdRef = useRef(0);

  const runSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      reqIdRef.current++;
      setResults([]);
      setSearched(false);
      setError("");
      setLoading(false);
      return;
    }
    const id = ++reqIdRef.current;
    setLoading(true);
    setSearched(true);
    setError("");
    try {
      const entries = await loadIndex();
      if (id !== reqIdRef.current) return;
      setResults(runIndexSearch(entries, q));
    } catch (err) {
      if (id !== reqIdRef.current) return;
      setResults([]);
      setError(
        err instanceof Error && err.name === "AbortError"
          ? "The search index took too long to load. Tap to retry."
          : "The search index could not be loaded. Tap to retry."
      );
    } finally {
      if (id === reqIdRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => runSearch(query), 300);
    return () => clearTimeout(t);
  }, [query, runSearch]);

  const retry = useCallback(() => {
    indexPromise = null;
    void runSearch(query);
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

      {!loading && error && (
        <div className="space-y-3 text-center py-8">
          <p className="text-sm text-muted-foreground">{error}</p>
          <Button variant="outline" size="sm" onClick={retry}>
            Retry
          </Button>
        </div>
      )}

      {!loading && !error && !query && (
        <p className="text-center text-sm text-muted-foreground py-8">
          Start typing to search your study materials.
        </p>
      )}

      {!loading && !error && searched && query && results.length === 0 && (
        <p className="text-center text-sm text-muted-foreground py-8">
          No results found for &ldquo;{query}&rdquo;.
        </p>
      )}

      {!loading && !error && results.length > 0 && (
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
