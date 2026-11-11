"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { EmptyState } from "@/components/ui/empty-state";
import { Loader2, Plus, Trash2, Award, Target, Search, FileText } from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
} from "recharts";
import { SUBJECT_LIST } from "@/types/subject";

interface Mark {
  id: string;
  subjectId: string;
  total: number;
  examDate: string;
  name: string;
}

const COLORS: Record<string, string> = {
  bio: "#10B981",
  chem: "#06B6D4",
  phy: "#8B5CF6",
  agri: "#F59E0B",
  math: "#EF4444",
  ict: "#EC4899",
};

export default function ExamMarksPage() {
  const [marks, setMarks] = useState<Mark[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [subjectId, setSubjectId] = useState("bio");
  const [name, setName] = useState("");
  const [fullMarks, setFullMarks] = useState("");
  const [examDate, setExamDate] = useState(() => new Date().toISOString().split("T")[0]);

  const [search, setSearch] = useState("");
  const [filterSubject, setFilterSubject] = useState("all");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/exam-marks");
      if (!res.ok) throw new Error("Failed to load marks");
      const data = await res.json();
      setMarks(data.marks || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load marks");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    const fm = Number(fullMarks);
    if (Number.isNaN(fm) || fm <= 0) {
      setError("Enter the full marks (must be greater than 0).");
      return;
    }
    setError("");
    setSaving(true);
    try {
      const res = await fetch("/api/exam-marks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subjectId,
          total: fm,
          examDate,
          name: name.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save mark");
      await load();
      setFullMarks("");
      setName("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save mark");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    setError("");
    try {
      const res = await fetch("/api/exam-marks", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Failed to delete mark");
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete mark");
    }
  };

  const filteredMarks = useMemo(() => {
    return marks.filter((m) => {
      const matchSubject = filterSubject === "all" || m.subjectId === filterSubject;
      const q = search.trim().toLowerCase();
      const matchSearch =
        !q ||
        m.name.toLowerCase().includes(q) ||
        (SUBJECT_LIST.find((s) => s.id === m.subjectId)?.name.toLowerCase().includes(q) ?? false);
      return matchSubject && matchSearch;
    });
  }, [marks, search, filterSubject]);

  const totalFullMarks = marks.reduce((s, m) => s + m.total, 0);

  const bySubject = SUBJECT_LIST.map((s) => {
    const list = marks.filter((m) => m.subjectId === s.id);
    return {
      subject: s.name,
      subjectId: s.id,
      fullMarks: list.reduce((sum, m) => sum + m.total, 0),
      count: list.length,
      color: s.color,
    };
  }).filter((s) => s.fullMarks > 0);

  const trend = [...marks]
    .sort((a, b) => a.examDate.localeCompare(b.examDate))
    .map((m) => ({
      date: m.examDate.slice(5),
      label: m.name || SUBJECT_LIST.find((s) => s.id === m.subjectId)?.name || m.subjectId,
      fullMarks: m.total,
      color: COLORS[m.subjectId] || "#3b82f6",
    }));

  const topSubject =
    bySubject.length > 0 ? bySubject.reduce((a, b) => (b.fullMarks > a.fullMarks ? b : a)) : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Exam Marks"
        description="Record the full (maximum) marks for each exam/paper and track how your marks add up by subject."
      />

      {error && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          <Target className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Plus className="h-4 w-4 text-primary" /> Add Exam Full Marks
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={add} className="space-y-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Exam / Paper name (optional)</label>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Unit Test 3"
                    disabled={saving}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Subject</label>
                  <Select value={subjectId} onChange={(e) => setSubjectId(e.target.value)} disabled={saving}>
                    {SUBJECT_LIST.map((s) => (
                      <option key={s.id} value={s.id}>{s.icon} {s.name}</option>
                    ))}
                  </Select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Full Marks</label>
                  <Input
                    type="number"
                    min={1}
                    value={fullMarks}
                    onChange={(e) => setFullMarks(e.target.value)}
                    placeholder="e.g. 100"
                    disabled={saving}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Date</label>
                  <Input type="date" value={examDate} onChange={(e) => setExamDate(e.target.value)} disabled={saving} />
                </div>
                <Button type="submit" className="w-full gap-2" disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  Save
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <FileText className="h-4 w-4" /> Exams
                </div>
                <p className="mt-1 text-2xl font-bold">{marks.length}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Award className="h-4 w-4" /> Total Full Marks
                </div>
                <p className="mt-1 text-2xl font-bold">{totalFullMarks}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Target className="h-4 w-4" /> Top Subject
                </div>
                <p className="mt-1 text-2xl font-bold">{topSubject?.fullMarks ?? "–"}</p>
                {topSubject && (
                  <p className="text-xs text-muted-foreground">{topSubject.subject}</p>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Search className="h-4 w-4" /> My Marks
              </CardTitle>
              <div className="flex flex-col gap-2 sm:flex-row">
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    className="pl-9"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search marks..."
                  />
                </div>
                <Select value={filterSubject} onChange={(e) => setFilterSubject(e.target.value)} className="sm:w-44">
                  <option value="all">All subjects</option>
                  {SUBJECT_LIST.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading marks...
                </div>
              ) : filteredMarks.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  {marks.length === 0 ? "No marks yet. Add your first exam mark!" : "No marks match your search."}
                </p>
              ) : (
                <ul className="space-y-2">
                  {filteredMarks.map((m) => (
                    <li key={m.id} className="flex items-center gap-3 rounded-md border border-border px-3 py-2">
                      <span className="text-base">{SUBJECT_LIST.find((s) => s.id === m.subjectId)?.icon}</span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {m.name || SUBJECT_LIST.find((s) => s.id === m.subjectId)?.name || m.subjectId}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {SUBJECT_LIST.find((s) => s.id === m.subjectId)?.name} · {m.examDate}
                        </p>
                      </div>
                      <Badge>{m.total} marks</Badge>
                      <button
                        onClick={() => remove(m.id)}
                        className="shrink-0 rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        aria-label="Delete mark"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Full Marks by Exam</CardTitle>
            </CardHeader>
            <CardContent>
              {trend.length === 0 ? (
                <EmptyState
                  icon="📊"
                  title="No data yet"
                  description="Add exam marks to see the chart."
                />
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={trend}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                    <XAxis dataKey="date" stroke="#888" fontSize={12} />
                    <YAxis stroke="#888" fontSize={12} />
                    <Tooltip
                      contentStyle={{ background: "#1f2937", border: "1px solid #333", borderRadius: 8 }}
                      formatter={(value) => [`${value}`, "Full Marks"]}
                    />
                    <Bar dataKey="fullMarks" radius={[6, 6, 0, 0]}>
                      {trend.map((m, i) => (
                        <Cell key={i} fill={m.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Full Marks by Subject</CardTitle>
            </CardHeader>
            <CardContent>
              {bySubject.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  Add marks to see per-subject totals.
                </p>
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={bySubject}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                    <XAxis dataKey="subject" stroke="#888" fontSize={12} />
                    <YAxis stroke="#888" fontSize={12} />
                    <Tooltip
                      contentStyle={{ background: "#1f2937", border: "1px solid #333", borderRadius: 8 }}
                      formatter={(value) => [`${value}`, "Full Marks"]}
                    />
                    <Bar dataKey="fullMarks" radius={[6, 6, 0, 0]}>
                      {bySubject.map((s) => (
                        <Cell key={s.subjectId} fill={s.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
