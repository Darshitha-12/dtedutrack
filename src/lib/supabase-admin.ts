import { createClient, type SupabaseClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ""
const supabaseServiceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""

// A placeholder key like "[SENSITIVE]" or "<your-key>" means storage is NOT
// actually usable even though the variable is set. Treat those as unconfigured
// so callers fall back to local storage instead of hitting a dead project.
function isPlaceholder(value: string): boolean {
  const v = value.trim()
  if (!v) return true
  if (/^[\[\<\{\>]/.test(v) || /[\]\>\{\}]$/.test(v)) return true
  if (/^(SENSITIVE|REDACTED|placeholder|your[-_]?key|changeme|xxx)/i.test(v)) return true
  return false
}

export const isSupabaseConfigured =
  Boolean(supabaseUrl && supabaseServiceKey) &&
  supabaseUrl.startsWith("https://") &&
  !isPlaceholder(supabaseUrl) &&
  !isPlaceholder(supabaseServiceKey)

// Only create the client when configured. Calling createClient with an empty URL
// throws immediately, which would break builds when env vars are absent.
export const supabaseAdmin: SupabaseClient = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : (null as unknown as SupabaseClient)
