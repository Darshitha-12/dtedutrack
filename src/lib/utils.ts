import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export function esc(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function fmtHM(minutes: number): string {
  if (minutes >= 60) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  return `${minutes}m`;
}

export function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function pctOf(score: number, total: number): number {
  return total > 0 ? Math.round((score / total) * 1000) / 10 : 0;
}

export function avg(values: number[]): number {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

export function slopeOf(ys: number[]): number {
  const n = ys.length;
  if (n < 2) return 0;
  const mx = (n - 1) / 2;
  const my = avg(ys);
  let num = 0;
  let den = 0;
  ys.forEach((y, x) => {
    num += (x - mx) * (y - my);
    den += (x - mx) ** 2;
  });
  return den ? num / den : 0;
}

export function stdev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = avg(values);
  return Math.sqrt(avg(values.map((v) => (v - m) ** 2)) * values.length / (values.length - 1));
}

export type Grade = "A" | "B" | "C" | "S" | "W";

const GRADE_BANDS = [
  { min: 75, grade: "A" as Grade },
  { min: 65, grade: "B" as Grade },
  { min: 55, grade: "C" as Grade },
  { min: 40, grade: "S" as Grade },
  { min: 0, grade: "W" as Grade },
];

export function gradeOf(percentage: number): Grade {
  return GRADE_BANDS.find((b) => percentage >= b.min)!.grade;
}
