import { createClient } from '@supabase/supabase-js'
import { supabaseConfig } from '@/lib/env'

/**
 * Null until real credentials exist in .env.local. Every caller must handle the
 * null case explicitly so a missing configuration surfaces as a clear state
 * instead of a runtime crash.
 */
export const supabase = supabaseConfig
  ? createClient(supabaseConfig.url, supabaseConfig.publishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null
