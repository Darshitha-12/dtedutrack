"use client";

import { useState, useEffect } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { Plus, Trash2, CheckCircle2, Circle, Wallet, Coins, Landmark, ChevronLeft, ChevronRight } from "lucide-react";
import {
  currentMonth,
  monthLabel,
  monthShort,
  useFees,
} from "@/features/fees/hooks/use-fees";

export default function FeesPage() {
  const {
    classes,
    payments,
    monthAdd,
    addClass,
    removeClass,
    addPayment,
    togglePaid,
    setAmount,
    removePayment,
  } = useFees();

  const [name, setName] = useState("");
  const [amount, setAmountText] = useState("");
  const [auto, setAuto] = useState(true);
  const [month, setMonth] = useState(() => currentMonth());
  const [showAll, setShowAll] = useState(false);
  const [error, setError] = useState("");

  // Push the web fee records into the native app store so the APK shows the
  // same classes/payments as the online interface (two-way sync).
  useEffect(() => {
    const bridge = (window as any)?.BioPulseBridge;
    if (!bridge || typeof bridge.syncFees !== "function") return;
    try {
      bridge.syncFees(JSON.stringify({ classes, payments }));
    } catch {
      // bridge serialization failure — ignore
    }
  }, [classes, payments]);

  const monthInput = (n: number) => {
    setShowAll(false);
    setMonth(monthAdd(month, n));
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const amt = Number(amount);
    if (!name.trim()) {
      setError("Enter a class name.");
      return;
    }
    if (Number.isNaN(amt) || amt <= 0) {
      setError("Enter a monthly fee greater than 0 (Rs).");
      return;
    }
    setError("");
    addClass(name.trim(), amt, auto);
    setName("");
    setAmountText("");
  };

  const filtered =
    showAll
      ? payments
      : payments.filter((p) => p.month === month);

  const filteredDue = filtered.reduce((s, p) => s + p.amount, 0);
  const filteredPaid = filtered.filter((p) => p.paid).reduce((s, p) => s + p.amount, 0);

  const classByName = new Map(classes.map((c) => [c.id, c.name]));

  // last-6-months chart
  const chartData = (() => {
    const months: string[] = [];
    for (let i = 5; i >= 0; i--) months.push(monthAdd(currentMonth(), -i));
    return months.map((m) => {
      const mps = payments.filter((p) => p.month === m);
      return {
        month: monthShort(m),
        Due: mps.reduce((s, p) => s + p.amount, 0),
        Paid: mps.filter((p) => p.paid).reduce((s, p) => s + p.amount, 0),
      };
    });
  })();

  const perClass = classes
    .map((c) => {
      const cps = payments.filter((p) => p.classId === c.id);
      return {
        name: c.name,
        Due: cps.reduce((s, p) => s + p.amount, 0),
        Paid: cps.filter((p) => p.paid).reduce((s, p) => s + p.amount, 0),
      };
    })
    .filter((c) => c.Due > 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Class Fees"
        description="Track monthly class fees. If auto-add is on, each class fee appears automatically every month — just mark it paid when you receive it."
      />

      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Plus className="h-4 w-4 text-primary" /> Add Class
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={onSubmit} className="space-y-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">
                    Class name
                  </label>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Maths tuition"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">
                    Monthly fee (Rs)
                  </label>
                  <Input
                    type="number"
                    min={1}
                    value={amount}
                    onChange={(e) => setAmountText(e.target.value)}
                    placeholder="e.g. 3000"
                  />
                </div>
                <label className="flex items-center gap-2 text-sm text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={auto}
                    onChange={(e) => setAuto(e.target.checked)}
                    className="h-4 w-4 accent-emerald-500"
                  />
                  Auto-add every month
                </label>
                <Button type="submit" className="w-full gap-2">
                  <Plus className="h-4 w-4" /> Save class
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card className="lg:hidden">
            <CardContent className="pt-4">
              <MonthSwitch
                month={month}
                showAll={showAll}
                onPrev={() => monthInput(-1)}
                onNext={() => monthInput(1)}
                onToggleAll={() => setShowAll((s) => !s)}
              />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          {/* month picker */}
          <Card className="max-lg:hidden">
            <CardContent className="pt-4">
              <MonthSwitch
                month={month}
                showAll={showAll}
                onPrev={() => monthInput(-1)}
                onNext={() => monthInput(1)}
                onToggleAll={() => setShowAll((s) => !s)}
              />
            </CardContent>
          </Card>

          {/* summary */}
          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Landmark className="h-4 w-4" /> Due
                </div>
                <p className="mt-1 text-2xl font-bold">Rs {filteredDue}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Coins className="h-4 w-4" /> Paid
                </div>
                <p className="mt-1 text-2xl font-bold">Rs {filteredPaid}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Wallet className="h-4 w-4" /> Balance
                </div>
                <p className="mt-1 text-2xl font-bold">Rs {filteredDue - filteredPaid}</p>
              </CardContent>
            </Card>
          </div>

          {/* payments */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                Payments
                <span className="ml-1 text-xs font-normal text-muted-foreground">
                  {showAll ? "ALL months" : monthLabel(month)}
                </span>
              </CardTitle>
              <div className="flex flex-wrap items-center gap-2">
                {classes.map((c) => (
                  <Button
                    key={c.id}
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (c.amount <= 0) return;
                      addPayment(c.id, showAll ? currentMonth() : month, c.amount);
                    }}
                  >
                    <Plus className="h-3 w-3" /> {c.name}
                  </Button>
                ))}
              </div>
            </CardHeader>
            <CardContent>
              {filtered.length === 0 ? (
                <EmptyState
                  icon="💰"
                  title="No fees yet"
                  description={
                    classes.length === 0
                      ? "Add a class with a monthly fee to get started."
                      : "No fees for this month. Add a class or tap a class button above for a manual payment."
                  }
                />
              ) : (
                <ul className="space-y-2">
                  {filtered.map((p) => (
                    <li
                      key={p.id}
                      className="flex items-center gap-3 rounded-md border border-border px-3 py-2"
                    >
                      <button
                        onClick={() => togglePaid(p.id)}
                        className="shrink-0"
                        aria-label="Toggle paid"
                      >
                        {p.paid ? (
                          <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                        ) : (
                          <Circle className="h-5 w-5 text-muted-foreground" />
                        )}
                      </button>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {classByName.get(p.classId) || "Deleted class"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {monthLabel(p.month)}
                          {p.paid && <span className="ml-2 text-emerald-500">✓ PAID</span>}
                        </p>
                      </div>
                      <Badge
                        variant={p.paid ? "default" : "secondary"}
                        className={p.paid ? "" : "text-amber-400"}
                      >
                        {p.paid ? "" : "Due · "}Rs {p.amount}
                      </Badge>
                      {!p.paid && (
                        <button
                          onClick={() => {
                            const v = window.prompt(`Update fee for ${classByName.get(p.classId) || "class"} (Rs)`, String(p.amount));
                            const n = Number(v);
                            if (v !== null && !Number.isNaN(n) && n > 0) setAmount(p.id, n);
                          }}
                          className="shrink-0 rounded px-1.5 py-1 text-xs text-muted-foreground hover:bg-accent"
                        >
                          ✎
                        </button>
                      )}
                      <button
                        onClick={() => removePayment(p.id)}
                        className="shrink-0 rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        aria-label="Delete payment"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* chart 6 months */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Due vs Paid · last 6 months</CardTitle>
            </CardHeader>
            <CardContent>
              {chartData.every((d) => d.Due === 0 && d.Paid === 0) ? (
                <EmptyState icon="📊" title="No data yet" description="Add a class to see the chart." />
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                    <XAxis dataKey="month" stroke="#888" fontSize={12} />
                    <YAxis stroke="#888" fontSize={12} />
                    <Tooltip
                      contentStyle={{ background: "#1f2937", border: "1px solid #333", borderRadius: 8 }}
                    />
                    <Legend />
                    <Bar dataKey="Due" fill="#F59E0B" radius={[6, 6, 0, 0]} />
                    <Bar dataKey="Paid" fill="#10B981" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* per class */}
          {perClass.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Totals by class</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={perClass}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                    <XAxis dataKey="name" stroke="#888" fontSize={12} />
                    <YAxis stroke="#888" fontSize={12} />
                    <Tooltip
                      contentStyle={{ background: "#1f2937", border: "1px solid #333", borderRadius: 8 }}
                    />
                    <Legend />
                    <Bar dataKey="Due" fill="#F59E0B" radius={[6, 6, 0, 0]} />
                    <Bar dataKey="Paid" fill="#10B981" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {classes.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Classes</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {classes.map((c) => (
                    <li
                      key={c.id}
                      className="flex items-center gap-3 rounded-md border border-border px-3 py-2"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{c.name}</p>
                        <p className="text-xs text-muted-foreground">
                          Rs {c.amount}/month{c.auto ? " · auto-add" : ""} · from {monthLabel(c.startMonth)}
                        </p>
                      </div>
                      <Badge variant="secondary">{payments.filter((p) => p.classId === c.id).length} entries</Badge>
                      <button
                        onClick={() => {
                          if (window.confirm(`Remove "${c.name}" and all its fees?`)) removeClass(c.id);
                        }}
                        className="shrink-0 rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        aria-label="Remove class"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function MonthSwitch({
  month,
  showAll,
  onPrev,
  onNext,
  onToggleAll,
}: {
  month: string;
  showAll: boolean;
  onPrev: () => void;
  onNext: () => void;
  onToggleAll: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <Button variant="outline" size="sm" onClick={onPrev} aria-label="Previous month">
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <div className="flex flex-col items-center gap-1">
        <button
          onClick={onToggleAll}
          className="rounded-md px-3 py-1.5 text-base font-bold hover:bg-accent"
          title="Toggle all months"
        >
          {showAll ? "ALL MONTHS" : monthLabel(month)}
        </button>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={showAll}
            onChange={onToggleAll}
            className="h-3.5 w-3.5 accent-emerald-500"
          />
          All months
        </label>
      </div>
      <Button variant="outline" size="sm" onClick={onNext} aria-label="Next month">
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}