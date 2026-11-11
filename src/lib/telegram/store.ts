"use client";

import { TELEGRAM_CONFIG, TELEGRAM_STORAGE } from "@/lib/telegram/config";

export function safeRead(key: string): string | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function safeWrite(key: string, value: string) {
  try {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(key, value);
  } catch {
    /* storage full / disabled — session just won't persist */
  }
}

export function safeRemove(key: string) {
  try {
    if (typeof window === "undefined") return;
    window.localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

export const telegramStore = {
  getSession: () => safeRead(TELEGRAM_STORAGE.sessionKey),
  setSession: (s: string) => safeWrite(TELEGRAM_STORAGE.sessionKey, s),
  getPhone: () => safeRead(TELEGRAM_STORAGE.phoneKey) ?? "",
  setPhone: (p: string) => safeWrite(TELEGRAM_STORAGE.phoneKey, p),
  clear: () => {
    safeRemove(TELEGRAM_STORAGE.sessionKey);
    safeRemove(TELEGRAM_STORAGE.phoneKey);
  },
};

function hashString(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  }
  return h;
}

export function messageNotifId(chatId: string, messageId: string): number {
  return (hashString(chatId + ":" + messageId) % 0x7fffffff);
}

type TgBridge = {
  notifyChat?: (id: number, title: string, text: string) => void;
  setKeepAlive?: (active: boolean) => void;
};

function bridge(): TgBridge | null {
  if (typeof window === "undefined") return null;
  const b = (window as unknown as { BioPulseBridge?: TgBridge }).BioPulseBridge;
  return b ?? null;
}

export function bridgeKeepAlive(active: boolean) {
  bridge()?.setKeepAlive?.(active);
}

function normPhone(raw: string): string {
  let p = raw.replace(/[^0-9]/g, "");
  if (p.startsWith("0")) p = p.slice(1);
  if (!p.startsWith("94") && p.length === 9) p = "94" + p;
  return p;
}

export function formatPhone(raw: string): string {
  const p = normPhone(raw);
  if (p.length === 11 && p.startsWith("94")) {
    return "+" + p.slice(0, 2) + " " + p.slice(2, 5) + " " + p.slice(5);
  }
  return "+" + p;
}

export { normPhone };