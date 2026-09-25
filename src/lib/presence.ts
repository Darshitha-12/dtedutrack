// Presence staleness: treat an "online" row as offline once the last
// heartbeat is older than this, because beforeunload/visibilitychange are
// unreliable (closed tabs, crashed browsers, lost connections).
export const ONLINE_TTL_MS = 45_000;

export function resolvePresence(p: {
  status?: string | null;
  lastSeen?: Date | null;
} | null): { status: string; lastSeen: string | null } {
  if (!p) return { status: "offline", lastSeen: null };
  const lastSeen = p.lastSeen;
  const isOnline =
    p.status === "online" && !!lastSeen && Date.now() - lastSeen.getTime() <= ONLINE_TTL_MS;
  return {
    status: isOnline ? "online" : "offline",
    lastSeen: lastSeen ? lastSeen.toISOString() : null,
  };
}