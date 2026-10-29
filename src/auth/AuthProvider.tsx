import type { Session } from '@supabase/supabase-js'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { callRpc } from '@/lib/api'
import { supabase } from '@/lib/supabase'
import type { WhoAmI } from '@/lib/types'

type AuthContextValue = {
  session: Session | null
  sessionLoading: boolean
  whoami: WhoAmI | undefined
  whoamiLoading: boolean
  whoamiError: Error | null
  signIn: () => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [session, setSession] = useState<Session | null>(null)
  const [sessionLoading, setSessionLoading] = useState(Boolean(supabase))

  useEffect(() => {
    if (!supabase) {
      return
    }

    let active = true

    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      setSession(data.session)
      setSessionLoading(false)
    })

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return
      setSession(nextSession)
      setSessionLoading(false)
      void queryClient.invalidateQueries({ queryKey: ['whoami'] })
    })

    return () => {
      active = false
      data.subscription.unsubscribe()
    }
  }, [queryClient])

  const whoamiQuery = useQuery({
    queryKey: ['whoami', session?.user.id ?? 'anonymous'],
    queryFn: () => callRpc<WhoAmI>('whoami'),
    enabled: Boolean(supabase && session),
    retry: 1,
    staleTime: 30_000,
  })

  const signIn = useCallback(async () => {
    if (!supabase) {
      throw new Error('ระบบยังไม่ได้ตั้งค่าการเชื่อมต่อ')
    }
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'discord',
      options: { redirectTo: `${window.location.origin}/app` },
    })
    if (error) {
      throw new Error(
        error.message.toLowerCase().includes('provider')
          ? 'ยังไม่ได้เปิดใช้ Discord OAuth ใน Supabase'
          : error.message,
      )
    }
  }, [])

  const signOut = useCallback(async () => {
    if (!supabase) return
    await supabase.auth.signOut()
    queryClient.clear()
  }, [queryClient])

  const whoami = session ? whoamiQuery.data : undefined
  const whoamiError = useMemo(
    () =>
      whoamiQuery.error instanceof Error
        ? whoamiQuery.error
        : whoamiQuery.error
          ? new Error()
          : null,
    [whoamiQuery.error],
  )

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      sessionLoading,
      whoami,
      whoamiLoading: Boolean(session) && whoamiQuery.isPending,
      whoamiError,
      signIn,
      signOut,
    }),
    [session, sessionLoading, whoami, whoamiQuery.isPending, whoamiError, signIn, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside AuthProvider')
  return context
}
