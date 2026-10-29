import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useState } from 'react'
import { useToast } from '@/components/Toast'

/**
 * Runs one audited RPC, refreshes every mounted query, and reports the result.
 * Returns true when the caller should close its dialog.
 */
export function useAction() {
  const queryClient = useQueryClient()
  const toast = useToast()
  const [pending, setPending] = useState(false)

  const run = useCallback(
    async (task: () => Promise<unknown>, successMessage?: string) => {
      setPending(true)
      try {
        await task()
        await queryClient.invalidateQueries()
        if (successMessage) toast('ok', successMessage)
        return true
      } catch (error) {
        toast('error', error instanceof Error ? error.message : 'ทำรายการไม่สำเร็จ')
        return false
      } finally {
        setPending(false)
      }
    },
    [queryClient, toast],
  )

  return { pending, run }
}
