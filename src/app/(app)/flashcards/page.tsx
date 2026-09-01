"use client";

import { useState, useEffect, useCallback } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { EmptyState } from "@/components/ui/empty-state";
import { Loader2, Sparkles, Trash2, RotateCcw, ArrowLeft, ArrowRight, Save, AlertCircle } from "lucide-react";

interface Flashcard {
  front: string;
  back: string;
}

interface DeckSummary {
  id: string;
  title: string;
  language: string;
  source: string;
  cardCount: number;
  updatedAt: string;
}

export default function FlashcardsPage() {
  const [topic, setTopic] = useState("");
  const [count, setCount] = useState("8");
  const [language, setLanguage] = useState<"English" | "Sinhala">("English");
  const [decks, setDecks] = useState<DeckSummary[]>([]);
  const [loadingDecks, setLoadingDecks] = useState(true);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [generated, setGenerated] = useState<Flashcard[] | null>(null);
  const [activeDeckId, setActiveDeckId] = useState<string | null>(null);
  const [activeDeckCards, setActiveDeckCards] = useState<Flashcard[]>([]);
  const [activeDeckTitle, setActiveDeckTitle] = useState("");
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);

  const loadDecks = useCallback(async () => {
    setLoadingDecks(true);
    setError("");
    try {
      const res = await fetch("/api/flashcards");
      if (!res.ok) throw new Error("Failed to load decks");
      const data = await res.json();
      setDecks(data.decks || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load decks");
    } finally {
      setLoadingDecks(false);
    }
  }, []);

  const loadDeck = useCallback(async (id: string) => {
    setError("");
    try {
      const res = await fetch(`/api/flashcards?id=${encodeURIComponent(id)}`);
      if (!res.ok) throw new Error("Failed to load deck");
      const data = await res.json();
      setActiveDeckCards(data.deck.cards || []);
      setActiveDeckTitle(data.deck.title);
      setActiveDeckId(id);
      setIndex(0);
      setFlipped(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load deck");
    }
  }, []);

  useEffect(() => {
    loadDecks();
  }, [loadDecks]);

  const generate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!topic.trim()) {
      setError("Please enter a topic.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/flashcards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "generate",
          topic: topic.trim(),
          count: Number(count),
          language,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to generate flashcards");
      const cards: Flashcard[] = data.cards || [];
      if (cards.length === 0) throw new Error("No flashcards were generated.");
      setGenerated(cards);
      setActiveDeckId(null);
      setActiveDeckCards([]);
      setIndex(0);
      setFlipped(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate flashcards");
    } finally {
      setLoading(false);
    }
  };

  const saveGenerated = async () => {
    if (!generated || generated.length === 0 || !topic.trim()) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/flashcards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: topic.trim(),
          language,
          cards: generated,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save deck");
      setDeckFromResponse(data.deck);
      await loadDecks();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save deck");
    } finally {
      setSaving(false);
    }
  };

  const setDeckFromResponse = (deck: { id: string; title: string }) => {
    setActiveDeckId(deck.id);
    setActiveDeckTitle(deck.title);
    setActiveDeckCards(generated || []);
    setGenerated(null);
    setTopic("");
    setIndex(0);
    setFlipped(false);
  };

  const deleteDeck = async (id: string) => {
    setError("");
    try {
      const res = await fetch("/api/flashcards", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to delete deck");
      }
      if (activeDeckId === id) {
        setActiveDeckId(null);
        setActiveDeckCards([]);
      }
      await loadDecks();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete deck");
    }
  };

  const current = activeDeckCards[index];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Flashcards"
        description="Generate AI flashcards and review them with active recall."
      />

      <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Sparkles className="h-4 w-4 text-primary" /> Generate Flashcards
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={generate} className="space-y-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Topic</label>
                  <Input
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    placeholder="e.g. Cell Division"
                    disabled={loading}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Cards</label>
                  <Select value={count} onChange={(e) => setCount(e.target.value)} disabled={loading}>
                    {[5, 8, 10, 15, 20].map((n) => (
                      <option key={n} value={String(n)}>{n}</option>
                    ))}
                  </Select>
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
                  <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}
                <Button type="submit" className="w-full gap-2" disabled={loading}>
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4" />
                  )}
                  Generate
                </Button>
              </form>

              {generated && generated.length > 0 && (
                <div className="mt-4 rounded-md border border-primary/30 bg-primary/5 p-3">
                  <p className="mb-2 text-sm font-medium">
                    Generated {generated.length} cards — save them to your collection?
                  </p>
                  <Button
                    size="sm"
                    className="w-full gap-2"
                    onClick={saveGenerated}
                    disabled={saving}
                  >
                    {saving ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4" />
                    )}
                    Save Deck
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                My Decks <Badge variant="secondary" className="ml-auto">{decks.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loadingDecks ? (
                <div className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading decks...
                </div>
              ) : decks.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  No decks yet. Generate your first set!
                </p>
              ) : (
                <ul className="space-y-2">
                  {decks.map((d) => (
                    <li key={d.id} className="flex items-center gap-2 rounded-md border border-border px-3 py-2">
                      <button
                        onClick={() => {
                          if (activeDeckId === d.id) return;
                          loadDeck(d.id);
                        }}
                        className="min-w-0 flex-1 text-left"
                      >
                        <span className="block truncate text-sm font-medium">{d.title}</span>
                        <span className="text-xs text-muted-foreground">
                          {d.cardCount} cards
                          {d.language === "Sinhala" ? " · සිංහල" : ""}
                        </span>
                      </button>
                      <button
                        onClick={() => deleteDeck(d.id)}
                        className="shrink-0 rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        aria-label="Delete deck"
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

        <Card className="min-h-[320px]">
          {activeDeckCards.length > 0 && current ? (
            <>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{activeDeckTitle}</CardTitle>
                  <Badge variant="secondary">{index + 1} / {activeDeckCards.length}</Badge>
                </div>
              </CardHeader>
              <CardContent>
                <button
                  onClick={() => setFlipped((f) => !f)}
                  className="flex min-h-[220px] w-full flex-col items-center justify-center rounded-xl border-2 border-dashed border-border p-8 text-center hover:border-primary/50"
                >
                  {flipped ? (
                    <>
                      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-primary">Answer</div>
                      <p className="text-lg font-medium">{current.back}</p>
                    </>
                  ) : (
                    <>
                      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Question</div>
                      <p className="text-lg font-medium">{current.front}</p>
                    </>
                  )}
                </button>
                <p className="mt-2 text-center text-xs text-muted-foreground">
                  Click the card to flip it
                </p>
                <div className="mt-4 flex items-center justify-between">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setIndex((i) => Math.max(0, i - 1));
                      setFlipped(false);
                    }}
                    disabled={index === 0}
                  >
                    <ArrowLeft className="h-4 w-4" /> Prev
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setFlipped(false)}
                    className="gap-1"
                  >
                    <RotateCcw className="h-4 w-4" /> Reset Flip
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => {
                      setIndex((i) => Math.min(activeDeckCards.length - 1, i + 1));
                      setFlipped(false);
                    }}
                    disabled={index >= activeDeckCards.length - 1}
                  >
                    Next <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </>
          ) : (
            <EmptyState
              icon="🃏"
              title="No deck selected"
              description="Generate a flashcard deck or pick one from your saved decks to begin reviewing."
            />
          )}
        </Card>
      </div>
    </div>
  );
}
