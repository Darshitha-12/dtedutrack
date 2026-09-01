"use client";

import { useState, useEffect } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Loader2, RotateCcw, TrendingDown, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";

interface WrongQuestion {
  id: string;
  stem: string;
  explanation: string;
  options: { id: string; text: string; order: number }[];
  topicTitle: string;
}

interface WeakTopic {
  topicId: string;
  topicTitle: string;
  accuracy: number;
  attempted: number;
}

export default function MistakesPage() {
  const [wrongQuestions, setWrongQuestions] = useState<WrongQuestion[]>([]);
  const [weakTopics, setWeakTopics] = useState<WeakTopic[]>([]);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState(false);
  const [message, setMessage] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/mistakes");
      const data = await res.json();
      setWrongQuestions(data.wrongQuestions || []);
      setWeakTopics(data.weakTopics || []);
    } catch {
      setWrongQuestions([]);
      setWeakTopics([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const retryWrong = async (topicId?: string) => {
    setRetrying(true);
    setMessage("");
    try {
      const res = await fetch("/api/quiz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "RETRY_WRONG", topicId: topicId || null, count: 10 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to start retry");
      window.location.href = "/practice";
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to start retry");
    } finally {
      setRetrying(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Mistake Book"
        description="Review your wrong answers and weak topics to improve."
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-4 w-4 text-amber-500" /> Wrong Questions
              <Badge variant="secondary" className="ml-auto">{wrongQuestions.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : wrongQuestions.length === 0 ? (
              <EmptyState
                icon="🎉"
                title="No mistakes yet"
                description="Questions you answer incorrectly will appear here for review."
              />
            ) : (
              <ul className="space-y-3">
                {wrongQuestions.map((q) => (
                  <li key={q.id} className="rounded-md border border-border p-3">
                    <div className="mb-1 flex items-center gap-2">
                      <Badge variant="outline">{q.topicTitle}</Badge>
                    </div>
                    <p className="text-sm font-medium">{q.stem}</p>
                    <div className="mt-2 space-y-1">
                      {q.options
                        .slice()
                        .sort((a, b) => a.order - b.order)
                        .map((o, i) => (
                          <div key={o.id} className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span className="font-medium">{String.fromCharCode(65 + i)}.</span>
                            <span>{o.text}</span>
                          </div>
                        ))}
                    </div>
                    {q.explanation && (
                      <p className="mt-2 text-xs text-muted-foreground">
                        <span className="font-semibold">Explanation: </span>
                        {q.explanation}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingDown className="h-4 w-4 text-destructive" /> Weak Topics
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : weakTopics.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                No weak topics detected yet. Keep practicing!
              </p>
            ) : (
              weakTopics.map((t) => (
                <div
                  key={t.topicId}
                  className="flex items-center gap-3 rounded-md border border-border px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{t.topicTitle}</div>
                    <div className="text-xs text-muted-foreground">
                      {t.attempted} attempted ·{" "}
                      {t.accuracy < 0.4 ? (
                        <span className="text-destructive">Needs work</span>
                      ) : (
                        <span className="text-amber-500">Improving</span>
                      )}
                    </div>
                  </div>
                  <Badge variant={t.accuracy < 0.4 ? "destructive" : "secondary"}>
                    {Math.round(t.accuracy * 100)}%
                  </Badge>
                  <Button variant="outline" size="sm" onClick={() => retryWrong(t.topicId)}>
                    Retry
                  </Button>
                </div>
              ))
            )}
            <Button
              onClick={() => retryWrong()}
              disabled={retrying || wrongQuestions.length === 0}
              className="w-full gap-2"
              variant="secondary"
            >
              {retrying ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RotateCcw className="h-4 w-4" />
              )}
              Retry All Wrong Questions
            </Button>
            {message && (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                {message}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center gap-4 rounded-md border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
        <CheckCircle2 className="h-5 w-5 text-emerald-500" />
        <span>
          Tips: Review each explanation carefully. Retrying missed questions helps solidify the
          concepts through active recall.
        </span>
        <XCircle className="ml-auto h-5 w-5 text-muted-foreground/40" />
      </div>
    </div>
  );
}
