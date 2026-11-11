import { createClient, type SupabaseClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ""
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)

// Only create the client when configured. Calling createClient with an empty URL
// throws immediately, which would break builds when env vars are absent.
export const supabase: SupabaseClient =
  isSupabaseConfigured
    ? createClient(supabaseUrl, supabaseAnonKey)
    : (null as unknown as SupabaseClient)

// Channel used for realtime chat delivery + presence.
// Room id encodes a deterministic pair so both peers subscribe to the same room.
export function channelRoomFor(a: string, b: string): string {
  const sorted = [a, b].sort()
  return `dm:${sorted[0]}:${sorted[1]}`
}
