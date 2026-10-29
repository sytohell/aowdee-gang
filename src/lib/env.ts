const url = import.meta.env.VITE_SUPABASE_URL?.trim()
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()

export const supabaseConfig = url && publishableKey ? { url, publishableKey } : null

export const isSupabaseConfigured = supabaseConfig !== null
