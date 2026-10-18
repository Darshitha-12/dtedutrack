// Last-known chat data, cached in localStorage.
//
// Every /api/chat/* endpoint is backed by Postgres, so whenever the database is
// unavailable -- a Neon quota outage, a tunnel that is down, a phone that just
// lost signal -- every list came back empty and the UI flipped straight to
// "No contacts yet" / "No chats yet". That reads as "the app is broken" even
// though the server is the thing that is down.
//
// So each successful payload is memoised here and replayed when a request fails:
// the app keeps showing the last known contacts, threads and messages, with a
// visible offline hint. Stale data clearly labelled beats an empty screen, and
// it is what makes the offline-first promise hold for the server-backed parts.

const PREFIX = "bp.chat-cache.";

/** Entries older than this are ignored; a month-old contact list is not worth showing. */
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

/** Keep the cache small: messages dominate, so cap per thread and per device. */
const MAX_MESSAGES_PER_THREAD = 120;
const MAX_CACHED_THREADS = 20;
const THREAD_INDEX_KEY = "threads";

type Envelope<T> = { at: number; value: T };

function ls(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    // Private mode / storage disabled.
    return null;
  }
}

function read<T>(key: string): T | null {
  const store = ls();
  if (!store) return null;
  try {
    const raw = store.getItem(PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Envelope<T> | null;
    if (!parsed || typeof parsed.at !== "number") return null;
    if (Date.now() - parsed.at > MAX_AGE_MS) {
      store.removeItem(PREFIX + key);
      return null;
    }
    return parsed.value ?? null;
  } catch {
    return null;
  }
}

/** Drops the per-thread message caches, which are by far the largest entries. */
function clearThreadCaches(): void {
  const store = ls();
  if (!store) return;
  for (const id of read<string[]>(THREAD_INDEX_KEY) || []) {
    store.removeItem(PREFIX + "msgs." + id);
  }
  store.removeItem(PREFIX + THREAD_INDEX_KEY);
}

function write(key: string, value: unknown): void {
  const store = ls();
  if (!store) return;
  const payload = JSON.stringify({ at: Date.now(), value } as Envelope<unknown>);
  try {
    store.setItem(PREFIX + key, payload);
  } catch {
    // Quota exceeded -- free the message caches and try once more. Caching is
    // best-effort: losing it must never break the chat itself.
    clearThreadCaches();
    try {
      store.setItem(PREFIX + key, payload);
    } catch {
      /* give up */
    }
  }
}

// ---- Contacts (the Calls list) --------------------------------------------

export function saveCachedUsers(users: unknown): void {
  if (Array.isArray(users)) write("users", users);
}

export function loadCachedUsers<T>(): T[] | null {
  const value = read<T[]>("users");
  return Array.isArray(value) ? value : null;
}

// ---- Thread list ----------------------------------------------------------

export function saveCachedConversations(conversations: unknown, me?: string): void {
  if (!Array.isArray(conversations)) return;
  write("convos", { conversations, me: typeof me === "string" ? me : undefined });
}

export function loadCachedConversations<T>(): { conversations: T[]; me?: string } | null {
  const value = read<{ conversations: T[]; me?: string }>("convos");
  if (!value || !Array.isArray(value.conversations)) return null;
  return value;
}

// ---- Messages, capped per thread and LRU-evicted across threads -----------

export function saveCachedMessages(partnerId: string, messages: unknown): void {
  if (!partnerId || !Array.isArray(messages)) return;
  write("msgs." + partnerId, { messages: messages.slice(-MAX_MESSAGES_PER_THREAD) });

  const store = ls();
  const index = (read<string[]>(THREAD_INDEX_KEY) || []).filter((id) => id !== partnerId);
  index.push(partnerId);
  while (index.length > MAX_CACHED_THREADS) {
    const drop = index.shift();
    if (drop && store) store.removeItem(PREFIX + "msgs." + drop);
  }
  write(THREAD_INDEX_KEY, index);
}

export function loadCachedMessages<T>(partnerId: string): T[] | null {
  if (!partnerId) return null;
  const value = read<{ messages: T[] }>("msgs." + partnerId);
  return value && Array.isArray(value.messages) ? value.messages : null;
}
