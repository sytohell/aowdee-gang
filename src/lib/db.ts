import { requireSupabase, thaiErrorMessage } from '@/lib/api'

export function db() {
  return requireSupabase()
}

/**
 * Supabase returns bigint columns as strings in some PostgREST configurations.
 * Every numeric boundary in the app goes through this so arithmetic never
 * silently concatenates.
 */
export function toNumber(value: number | string | null | undefined) {
  if (value === null || value === undefined) return 0
  const numeric = typeof value === 'string' ? Number(value) : value
  return Number.isFinite(numeric) ? numeric : 0
}

export async function unwrap<T>(result: {
  data: unknown
  error: { message: string } | null
}): Promise<T> {
  if (result.error) throw new Error(thaiErrorMessage(result.error.message))
  return result.data as T
}
