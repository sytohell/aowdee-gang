import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'

type ToastTone = 'ok' | 'error'
type ToastItem = { id: number; tone: ToastTone; message: string }
type PushToast = (tone: ToastTone, message: string) => void

const ToastContext = createContext<PushToast>(() => {})

let nextToastId = 1

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])

  const push = useCallback<PushToast>((tone, message) => {
    const id = nextToastId
    nextToastId += 1
    setItems((current) => [...current, { id, tone, message }])
    window.setTimeout(() => {
      setItems((current) => current.filter((item) => item.id !== id))
    }, 5000)
  }, [])

  const value = useMemo(() => push, [push])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4 sm:items-end sm:pr-6"
        aria-live="polite"
      >
        {items.map((item) => (
          <div
            key={item.id}
            role={item.tone === 'error' ? 'alert' : 'status'}
            className={
              item.tone === 'error'
                ? 'pointer-events-auto w-full max-w-sm rounded-card border border-rust/40 bg-paper px-5 py-4 text-sm text-rust shadow-[0_24px_48px_-12px_rgba(1,29,17,0.45)]'
                : 'pointer-events-auto w-full max-w-sm rounded-card border border-moss/40 bg-paper px-5 py-4 text-sm text-ink shadow-[0_24px_48px_-12px_rgba(1,29,17,0.45)]'
            }
          >
            <span className="font-medium">{item.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  return useContext(ToastContext)
}
