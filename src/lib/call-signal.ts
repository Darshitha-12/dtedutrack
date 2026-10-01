// ============================================================
// WebRTC signaling constants.
//
// The configured Supabase project does not resolve in DNS, so realtime
// broadcast cannot carry SDP/ICE. Signals are relayed as rows on the existing
// `direct_messages` table (no schema migration required) and polled by the
// client. This avoids needing a production DB migration for the video calls.
// ============================================================

/**
 * Marker written to `direct_messages.mediaType` for signaling rows.
 * Anything with this mediaType is filtered out of the normal chat read path.
 */
export const CALL_SIGNAL_MEDIA_TYPE = "__webrtc_signal";

/** Signals older than this are treated as stale and pruned. */
export const CALL_SIGNAL_TTL_MS = 60_000;

/** Max serialized signal payload (a full SDP is a few KB). */
export const CALL_SIGNAL_MAX_BYTES = 60_000;

export type CallSignalPayload = {
  callId: string;
  kind:
    | "hello"
    | "offer"
    | "answer"
    | "ice"
    | "accept"
    | "decline"
    | "bye";
  sdp?: unknown;
  ice?: unknown;
  caller?: {
    id: string;
    name: string;
    avatar: string | null;
  };
};

/**
 * Deterministic per-pair call id so both peers independently compute the same
 * relay key without any server round-trip.
 */
export function callIdFor(a: string, b: string): string {
  const sorted = [a, b].sort();
  return `call_${sorted[0]}_${sorted[1]}`.slice(0, 120);
}