"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { Loader2, Plus, Users, Clock, Trash2 } from "lucide-react";
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

const COLORS = ["#3b82f6", "#22c55e", "#f59e0b", "#8b5cf6", "#ef4444", "#06b6d4", "#ec4899"];

export default function WorkLogPage() {
  const { status } = useSession();
  const { showToast } = useToast();
  const [workHours, setWorkHours] = useState("");
  const [workMins, setWorkMins] = useState("");
  const [workNote, setWorkNote] = useState("");
  const [savingWork, setSavingWork] = useState(false);
  const [workHistory, setWorkHistory] = useState<{ id: string; date: string; minutes: number; note?: string }[]>([]);
  const [community, setCommunity] = useState<{ totalMinutes: number; activeUsers: number } | null>(null);
  const [loading, setLoading] = useState(true);

  function fmtWork(mins: number) {
    return `${Math.floor(mins / 60)}h ${mins % 60}m`;
  }

  async function loadAll() {
    try {
      const [wl, an] = await Promise.all([
        fetch("/api/work-log"),
        fetch("/api/analytics"),
      ]);
      const wlb = await wl.json();
      setWorkHistory(wlb.logs || []);
      if (an.ok) {
        const anb = await an.json();
        setCommunity(anb.community || null);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (status === "authenticated") {
      loadAll();
    } else if (status === "unauthenticated") {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  async function saveWork(minutes: number, note?: string) {
    setSavingWork(true);
    try {
      const res = await fetch("/api/work-log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: new Date().toISOString().slice(0, 10), minutes, note }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.detail || body?.error || `Failed (${res.status})`);
      }
      setWorkHours("");
      setWorkMins("");
      setWorkNote("");
      showToast(`${fmtWork(minutes)} logged`, "success");
      await loadAll();
    } catch (e) {
      showToast(`Failed to save work: ${e instanceof Error ? e.message : "Unknown error"}`, "error");
    } finally {
      setSavingWork(false);
    }
  }

  useEffect(() => {
    (window as any).__bpWorkLog = async (r: { date?: string; minutes?: number; note?: string }) => {
      const minutes = Math.floor(Number(r?.minutes));
      if (!minutes || minutes < 1) {
        showToast("Enter hours or minutes", "error");
        return;
      }
      await saveWork(minutes, r?.note || undefined);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function deleteWork(id: string) {
    if (!confirm("Delete this work log entry?")) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/work-log?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || `Delete failed (${res.status})`);
      }
      showToast("Work log deleted", "success");
      await loadAll();
    } catch (e) {
      showToast(`Failed to delete: ${e instanceof Error ? e.message : "Unknown error"}`, "error");
    } finally {
      setDeletingId(null);
    }
  }

  function onSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    const bridge = (window as any).BioPulseBridge;
    if (bridge && typeof bridge.openWorkLog === "function") {
      bridge.openWorkLog();
      return;
    }
    const hrs = Math.floor(Number(workHours)) || 0;
    const mins = Math.floor(Number(workMins)) || 0;
    const total = hrs * 60 + mins;
    if (total < 1) {
      showToast("Enter hours or minutes", "error");
      return;
    }
    saveWork(total, workNote.trim() || undefined);
  }

  if (status === "loading" || (status === "authenticated" && loading)) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const todayMin = workHistory.filter((w) => w.date === new Date().toISOString().slice(0, 10))[0]?.minutes ?? 0;
  const weekMin = workHistory.slice(0, 7).reduce((s, w) => s + w.minutes, 0);
  const communityMin = community?.totalMinutes ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader title="Work Log" description="Track the time you worked each day" />

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" />
            <CardTitle className="text-base">Log Today&apos;s Work</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3 mb-4">
            <div className="flex items-center gap-1 flex-1 min-w-[120px]">
              <Input
                type="number"
                min={0}
                max={24}
                placeholder="0"
                value={workHours}
                onChange={(e) => setWorkHours(e.target.value)}
                className="flex-1"
              />
              <span className="text-sm text-muted-foreground mb-2">hrs</span>
              <Input
                type="number"
                min={0}
                max={59}
                placeholder="45"
                value={workMins}
                onChange={(e) => setWorkMins(e.target.value)}
                className="flex-1"
              />
              <span className="text-sm text-muted-foreground mb-2">min</span>
            </div>
            <div className="flex-1 min-w-[180px]">
              <Input
                placeholder="Note (optional)"
                value={workNote}
                onChange={(e) => setWorkNote(e.target.value)}
              />
            </div>
            <Button type="submit" disabled={savingWork} className="gap-2">
              <Plus className="h-4 w-4" />
              {savingWork ? "Saving..." : "Log Work"}
            </Button>
          </form>

          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg bg-primary/10 p-3 text-center">
              <p className="text-2xl font-bold">{fmtWork(todayMin)}</p>
              <p className="text-xs text-muted-foreground">Today</p>
            </div>
            <div className="rounded-lg bg-green-500/10 p-3 text-center">
              <p className="text-2xl font-bold">{fmtWork(weekMin)}</p>
              <p className="text-xs text-muted-foreground">This Week</p>
            </div>
            <div className="rounded-lg bg-blue-500/10 p-3 text-center">
              <p className="text-2xl font-bold">{fmtWork(communityMin)}</p>
              <p className="text-xs text-muted-foreground">Community</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" />
            <CardTitle className="text-base">Daily Work Time</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {workHistory.length > 0 ? (
            <div className="h-[240px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={workHistory
                    .slice(0, 7)
                    .reverse()
                    .map((w) => ({
                      day: new Date(w.date + "T00:00:00").toLocaleDateString("en", { weekday: "short" }),
                      min: w.minutes,
                    }))}
                  margin={{ top: 5, right: 10, left: -10, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="day" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 12 }} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}h`} />
                  <Tooltip
                    formatter={(v: number) => [`${Math.floor(v / 60)}h ${v % 60}m`, "Worked"]}
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                      fontSize: "13px",
                    }}
                  />
                  <Bar dataKey="min" radius={[6, 6, 0, 0]} maxBarSize={48}>
                    {workHistory
                      .slice(0, 7)
                      .reverse()
                      .map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} fillOpacity={0.85} />
                      ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No work logged yet.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">History</CardTitle>
        </CardHeader>
        <CardContent>
          {workHistory.length > 0 ? (
            <div className="space-y-1.5">
              {workHistory.slice(0, 15).map((w) => (
                <div
                  key={w.id || w.date}
                  className="flex items-center justify-between gap-2 rounded-md bg-muted/40 px-3 py-2 text-sm"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span>{w.date}</span>
                      <span className="font-medium">{fmtWork(w.minutes)}</span>
                    </div>
                    {w.note && (
                      <p className="truncate text-xs text-muted-foreground">{w.note}</p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => w.id && deleteWork(w.id)}
                    disabled={deletingId === w.id}
                    className="shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                    aria-label={`Delete work log for ${w.date}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No work logged yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
