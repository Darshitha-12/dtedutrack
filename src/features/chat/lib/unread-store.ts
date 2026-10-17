"use client";

import { useEffect, useState } from "react";
import { AudioEngine } from "@/features/alarms/lib/audio-engine";

/**
 * Global DM unread count shared by the topbar bell and the sidebar Messages
 * badge. One poller runs for every subscriber:
 *  - the unread badge updates whenever the total changes,
 *  - a "message" sound plays when the total rises (a new incoming DM),
 *  - on the Android app, a system notification with the contact name and
 *    message preview is fired for every partner whose unread count grew.
 */

type UnreadListener = (total: number) => void;

interface PartnerState {
  unread: number;
  name: string;
  lastMessage: string;
}

let totalUnread = 0;
let baselineSet = false;
let pollerActive = false;
let timer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<UnreadListener>();
const prevPartners = new Map<string, PartnerState>();

/**
 * Unread badge poll.
 *
 * This is the app's only *global* poller — it runs on every page — so its cadence
 * is the single biggest lever on how often an idle UI touches the database. The
 * endpoint it reads, `/api/chat/conversations`, is also the most expensive read in
 * the app because it rebuilds every conversation together with its unread count.
 * So: 30s is plenty for a badge, a hidden page skips the fetch entirely (the
 * native foreground service owns background delivery), and a failing fetch backs
 * off instead of retrying at full rate.
 */
const UNREAD_POLL_MS = 30_000;
const UNREAD_POLL_MAX_MS = 120_000;
let failStreak = 0;
let lastFetchOk = true;

function emit(): void {
  listeners.forEach((l) => l(totalUnread));
}

async function fetchTotal(): Promise<number> {
  const res = await fetch("/api/chat/conversations", { credentials: "same-origin" });
  if (!res.ok) return -1;
  const data = await res.json();
  const list = Array.isArray(data) ? data : data?.conversations ?? [];
  let n = 0;
  for (const c of list) {
    const u = c?.unread;
    const num = typeof u === "number" ? u : Number(u);
    if (!Number.isNaN(num) && num > 0) n += num;
  }
  return n;
}

function cleanText(s: unknown): string {
  const txt = String(s ?? "").length > 0 ? String(s) : "";
  return txt.replace(/^You:\s*/, "").slice(0, 280);
}

/**
 * The Android shell announces new messages itself while the app is closed (a hidden WebView's
 * timers are frozen, so the poller above cannot be the only source). Both sides therefore record
 * the unread count they last announced for a partner, and each skips anything already recorded —
 * one message must never produce two notifications.
 */
type NotifyBridge = {
  showChatNotification?: (name: string, text: string, id: string) => void;
  getChatUnreadSeen?: (id: string) => number;
  setChatUnreadSeen?: (id: string, unread: number) => void;
};

function notifyBridge(): NotifyBridge | undefined {
  try {
    return (window as unknown as { BioPulseBridge?: NotifyBridge }).BioPulseBridge;
  } catch {
    return undefined;
  }
}

/** Last unread count already announced for this partner (-1 when nothing has been announced). */
function announcedUnread(pid: string): number {
  try {
    const v = notifyBridge()?.getChatUnreadSeen?.(pid);
    return typeof v === "number" && Number.isFinite(v) ? v : -1;
  } catch {
    return -1;
  }
}

/** Records what we just announced, so the native poller will not repeat it. */
function rememberAnnounced(pid: string, unread: number): void {
  try {
    notifyBridge()?.setChatUnreadSeen?.(pid, unread);
  } catch {
    /* bridge unavailable */
  }
}

function notifyNativeChatMessage(
  name: string,
  text: string,
  partnerId: string,
  unread: number,
): void {
  const title = String(name ?? "").slice(0, 60) || "New message";
  const body = String(text ?? "").slice(0, 280);
  const pid = String(partnerId ?? "");

  // Already announced (by the native background poller, or by an earlier poll in this page)?
  const announced = announcedUnread(pid);
  if (announced >= 0 && unread <= announced) return;
  rememberAnnounced(pid, unread);

  try {
    const b = notifyBridge();
    if (b && typeof b.showChatNotification === "function") {
      b.showChatNotification(title, body, pid);
      return;
    }
  } catch {
    /* bridge unavailable — fall through to the browser notification below */
  }
  // Browser / PWA fallback: a real system notification that opens the conversation when tapped.
  // (The Android app always takes the native-bridge branch above.)
  try {
    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      const n = new Notification(title, {
        body,
        tag: `bp-dm-${pid}`,
        icon: "/icon-192.png",
      });
      n.onclick = () => {
        try {
          window.focus();
          window.location.href = `/chat?partner=${encodeURIComponent(pid)}`;
        } catch {
          /* ignore */
        }
        n.close();
      };
    }
  } catch {
    /* notifications unavailable (WebView / unsupported) — ignore */
  }
}

interface ConversationItem {
  id?: string;
  name?: string;
  unread?: number;
  lastMessage?: string;
}

export async function refreshChatUnread(): Promise<number> {
  try {
    const res = await fetch("/api/chat/conversations", { credentials: "same-origin" });
    if (!res.ok) {
      lastFetchOk = false;
      return totalUnread;
    }
    const data = await res.json();
    lastFetchOk = true;
    const list = (Array.isArray(data) ? data : data?.conversations ?? []) as ConversationItem[];

    let n = 0;
    const seen = new Set<string>();
    const partners = new Map<string, PartnerState>();
    for (const c of list) {
      const id = c?.id;
      if (!id) continue;
      const u = Number(c?.unread) || 0;
      if (u > 0) n += u;
      partners.set(id, { unread: u, name: String(c?.name ?? ""), lastMessage: cleanText(c?.lastMessage) });
      seen.add(id);
    }

    if (!baselineSet) {
      // First successful fetch establishes the baseline — previously unread
      // messages must not fire sounds or system notifications.
      baselineSet = true;
      totalUnread = n;
      prevPartners.clear();
      partners.forEach((v, k) => {
        prevPartners.set(k, v);
        // Mirror the count to the native side. The background poller keeps its own mark, and a
        // stale-high mark would swallow the next genuinely new message.
        rememberAnnounced(k, v.unread);
      });
      emit();
      return n;
    }

    // A partner whose unread count rose got a new incoming message → system
    // notification with their name. New conversations behave the same.
    for (const [id, state] of partners) {
      const prev = prevPartners.get(id);
      if (state.unread > 0 && (prev === undefined || state.unread > prev.unread)) {
        notifyNativeChatMessage(state.name, state.lastMessage, id, state.unread);
      } else {
        // Nothing to announce, but keep the shared watermark current so a drop-then-rise in the
        // unread count (e.g. read on another device) can never re-announce an old message.
        rememberAnnounced(id, state.unread);
      }
    }
    for (const id of [...prevPartners.keys()]) {
      if (!seen.has(id)) prevPartners.delete(id);
    }
    partners.forEach((v, k) => prevPartners.set(k, v));

    const increased = n > totalUnread;
    totalUnread = n;
    emit();
    if (increased) {
      try {
        AudioEngine.cue("message");
      } catch {
        /* audio unavailable */
      }
    }
    return n;
  } catch {
    lastFetchOk = false;
    return totalUnread;
  }
}

function scheduleNextPoll(delay: number): void {
  if (!pollerActive) return;
  timer = setTimeout(() => void pollUnread(), delay);
}

async function pollUnread(): Promise<void> {
  if (!pollerActive) return;
  if (typeof document === "undefined" || !document.hidden) {
    await refreshChatUnread();
    failStreak = lastFetchOk ? 0 : Math.min(failStreak + 1, 4);
  }
  const delay = lastFetchOk
    ? UNREAD_POLL_MS
    : Math.min(UNREAD_POLL_MAX_MS, UNREAD_POLL_MS * 2 ** failStreak);
  scheduleNextPoll(delay);
}

function startPoller(): void {
  if (pollerActive) return;
  pollerActive = true;
  failStreak = 0;
  if (typeof document === "undefined" || !document.hidden) void refreshChatUnread();
  scheduleNextPoll(UNREAD_POLL_MS);
}

function stopPoller(): void {
  if (!pollerActive) return;
  pollerActive = false;
  failStreak = 0;
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
}

export function useChatUnread(): { totalUnread: number } {
  const [n, setN] = useState(totalUnread);

  useEffect(() => {
    listeners.add(setN);
    startPoller();
    // Catch up the moment the page comes back — the poller stands down while hidden.
    const onVisible = () => {
      if (!document.hidden) void refreshChatUnread();
    };
    document.addEventListener("visibilitychange", onVisible);
    // One-time user-gesture unlock for the Web Audio context so the
    // notification cue can actually play after the first tap.
    const unlock = () => {
      try {
        AudioEngine.ensure();
      } catch {
        /* ignore */
      }
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("click", unlock);
    };
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("click", unlock);
    return () => {
      listeners.delete(setN);
      if (listeners.size === 0) stopPoller();
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("click", unlock);
    };
  }, []);

  return { totalUnread: n };
}