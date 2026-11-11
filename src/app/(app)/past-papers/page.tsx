"use client";

import { useState, useEffect } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { EmptyState } from "@/components/ui/empty-state";
import { Loader2, FileText, Save, BarChart3, Clock } from "lucide-react";

interface Paper {
  year: number;
  paper: string;
  total: number;
  timeMinutes: number;
}

interface Record {
  id: string;
  paperType: string;
  score: number;
  total: number;
  examDate: string;
}

export default function PastPapersPage() {
  const [papers, setPapers] = useState<Paper[]>([]);
  const [records, setRecords] = useState<Record[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [selYear, setSelYear] = useState("2024");
  const [selPaper, setSelPaper] = useState("A/L Biology Paper I (MCQ)");
  const [score, setScore] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/past-papers");
      const data = await res.json();
      setPapers(data.papers || []);
      setRecords(data.records || []);
    } catch {
      setPapers([]);
      setRecords([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const paperOptions = [...new Set(papers.map((p) => p.paper))];
  const totalForSelection = papers.find(
    (p) => p.year === Number(selYear) && p.paper === selPaper,
  )?.total;

  const saveRecord = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const res = await fetch("/api/past-papers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          year: Number(selYear),
          paperType: selPaper,
          score: Number(score) || 0,
          total: totalForSelection || 50,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save mark");
      setScore("");
      setSuccess("Mark recorded successfully!");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save mark");
    } finally {
      setSaving(false);
    }
  };

  const avgScore = records.length
    ? Math.round((records.reduce((s, r) => s + (r.total ? (r.score / r.total) * 100 : 0), 0) / records.length))
    : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Past Papers"
        description="Practice with real A/L Biology past paper structure and track your marks."
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileText className="h-4 w-4 text-primary" /> Papers
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <ul className="space-y-2">
                {papers.map((p, i) => (
                  <li
                    key={`${p.year}-${p.paper}-${i}`}
                    className="flex items-center gap-3 rounded-md border border-border px-3 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{p.paper} ({p.year})</div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{p.total} marks</span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" /> {p.timeMinutes} min
                        </span>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Save className="h-4 w-4 text-primary" /> Record a Mark
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={saveRecord} className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-muted-foreground">Year</label>
                    <Select value={selYear} onChange={(e) => setSelYear(e.target.value)}>
                      {[...new Set(papers.map((p) => p.year))].map((y) => (
                        <option key={y} value={String(y)}>{y}</option>
                      ))}
                    </Select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-muted-foreground">Score</label>
                    <Input
                      type="number"
                      min={0}
                      value={score}
                      onChange={(e) => setScore(e.target.value)}
                      placeholder={`out of ${totalForSelection ?? 50}`}
                    />
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Paper</label>
                  <Select value={selPaper} onChange={(e) => setSelPaper(e.target.value)}>
                    {paperOptions.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </Select>
                </div>
                {error && (
                  <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                    {error}
                  </div>
                )}
                {success && (
                  <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-600">
                    {success}
                  </div>
                )}
                <Button type="submit" className="w-full gap-2" disabled={saving}>
                  {saving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  Save Mark
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <BarChart3 className="h-4 w-4 text-primary" /> My Performance
                {records.length > 0 && <Badge variant="secondary" className="ml-auto">{avgScore}% avg</Badge>}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {records.length === 0 ? (
                <EmptyState
                  icon="📊"
                  title="No marks recorded"
                  description="Record a mark after attempting a past paper to see your progress."
                />
              ) : (
                <ul className="space-y-2">
                  {records.map((r) => {
                    const pct = r.total ? Math.round((r.score / r.total) * 100) : 0;
                    return (
                      <li
                        key={r.id}
                        className="flex items-center gap-3 rounded-md border border-border px-3 py-2 text-sm"
                      >
                        <Badge variant={pct >= 70 ? "default" : "secondary"}>{pct}%</Badge>
                        <span className="min-w-0 flex-1 truncate">{r.paperType}</span>
                        <span className="font-medium">
                          {r.score}/{r.total}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {new Date(r.examDate).toLocaleDateString()}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
