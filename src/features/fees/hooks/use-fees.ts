"use client";

import { useState, useCallback, useEffect } from "react";

export const STORAGE_KEY = "biopulse_fees_v1";

export interface FeeClass {
  id: string;
  name: string;
  amount: number;
  auto: boolean;
  startMonth: string; // yyyy-MM
}

export interface FeePayment {
  id: string;
  classId: string;
  month: string; // yyyy-MM
  amount: number;
  paid: boolean;
  ts: number;
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function monthAdd(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  if (Number.isNaN(y) || Number.isNaN(m)) return month;
  return new Intl.DateTimeFormat(undefined, { year: "numeric", month: "long" }).format(
    new Date(y, m - 1, 1),
  );
}

export function monthShort(month: string): string {
  const [y, m] = month.split("-").map(Number);
  if (Number.isNaN(y) || Number.isNaN(m)) return month;
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: "short" });
}

export function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function useFees() {
  const [classes, setClasses] = useState<FeeClass[]>([]);
  const [payments, setPayments] = useState<FeePayment[]>([]);

  const load = useCallback(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      const cs: FeeClass[] = Array.isArray(parsed.classes)
        ? parsed.classes
            .filter((c: any) => c && typeof c.name === "string")
            .map((c: any) => ({
              id: String(c.id ?? ""),
              name: c.name,
              amount: Number(c.amount) > 0 ? Number(c.amount) : 0,
              auto: c.auto !== false,
              startMonth: typeof c.startMonth === "string" ? c.startMonth : currentMonth(),
            }))
        : [];
      const ps: FeePayment[] = Array.isArray(parsed.payments)
        ? parsed.payments
            .filter((p: any) => p && typeof p.month === "string")
            .map((p: any) => ({
              id: String(p.id ?? ""),
              classId: String(p.classId ?? ""),
              month: p.month,
              amount: Number(p.amount) > 0 ? Number(p.amount) : 0,
              paid: !!p.paid,
              ts: Number(p.ts) || 0,
            }))
        : [];
      setClasses(cs);
      setPayments(ps);
    } catch {
      // ignore corrupt data
    }
  }, []);

  const save = useCallback(
    (cs: FeeClass[], ps: FeePayment[]) => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ classes: cs, payments: ps }));
      } catch {
        // storage full or unavailable
      }
    },
    [],
  );

  useEffect(() => {
    load();
  }, [load]);

  const topUpTo = useCallback(
    (cs: FeeClass[], ps: FeePayment[], upto: string): FeePayment[] => {
      const out = [...ps];
      for (const c of cs) {
        if (!c.auto) continue;
        let cur = c.startMonth || upto;
        while (cur <= upto) {
          const exists = out.some((p) => p.classId === c.id && p.month === cur);
          if (!exists) {
            out.push({
              id: generateId(),
              classId: c.id,
              month: cur,
              amount: c.amount,
              paid: false,
              ts: Date.now(),
            });
          }
          cur = monthAdd(cur, 1);
        }
      }
      return out;
    },
    [],
  );

  useEffect(() => {
    if (classes.length === 0 && payments.length === 0) return;
    setPayments((prev) => {
      const upto = currentMonth();
      const next = topUpTo(classes, prev, upto);
      if (JSON.stringify(next.map((p) => [p.classId, p.month])) !== JSON.stringify(prev.map((p) => [p.classId, p.month]))) {
        return next;
      }
      return prev;
    });
  }, [classes, topUpTo]);

  useEffect(() => {
    if (classes.length > 0 || payments.length > 0) {
      save(classes, payments);
    }
  }, [classes, payments, save]);

  const addClass = useCallback((name: string, amount: number, auto: boolean) => {
    const c: FeeClass = {
      id: generateId(),
      name,
      amount: Math.max(Number(amount) || 0, 0),
      auto,
      startMonth: currentMonth(),
    };
    setClasses((prev) => [...prev, c]);
  }, []);

  const removeClass = useCallback((id: string) => {
    setClasses((prev) => prev.filter((c) => c.id !== id));
    setPayments((prev) => prev.filter((p) => p.classId !== id));
  }, []);

  const addPayment = useCallback((classId: string, month: string, amount: number) => {
    const p: FeePayment = {
      id: generateId(),
      classId,
      month,
      amount: Math.max(Number(amount) || 0, 0),
      paid: false,
      ts: Date.now(),
    };
    setPayments((prev) => [...prev, p]);
  }, []);

  const togglePaid = useCallback((id: string) => {
    setPayments((prev) => prev.map((p) => (p.id === id ? { ...p, paid: !p.paid } : p)));
  }, []);

  const setAmount = useCallback((id: string, amount: number) => {
    setPayments((prev) =>
      prev.map((p) => (p.id === id ? { ...p, amount: Math.max(Number(amount) || 0, 0) } : p)),
    );
  }, []);

  const removePayment = useCallback((id: string) => {
    setPayments((prev) => prev.filter((p) => p.id !== id));
  }, []);

  return {
    classes,
    payments,
    currentMonth,
    monthLabel,
    monthAdd,
    addClass,
    removeClass,
    addPayment,
    togglePaid,
    setAmount,
    removePayment,
  };
}