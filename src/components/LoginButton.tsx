import { useState } from 'react'
import { Link } from 'react-router'
import { useAuth } from '@/auth/AuthProvider'
import { isSupabaseConfigured } from '@/lib/env'

export function LoginButton() {
  const { session, signIn } = useAuth()
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  if (session) {
    return (
      <div className="flex flex-col items-center gap-3">
        <Link to="/app" className="pill pill-primary">
          เข้าสู่พื้นที่สมาชิก
        </Link>
        <p className="t-label max-w-xs text-center text-cream-muted">
          เซสชัน Discord ของคุณพร้อมใช้งาน
        </p>
      </div>
    )
  }

  async function handleClick() {
    if (!isSupabaseConfigured) {
      setError('ระบบล็อกอินจะเปิดใช้งานหลังตั้งค่า Discord OAuth ในขั้นถัดไป')
      return
    }
    setPending(true)
    setError(null)
    try {
      await signIn()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'เข้าสู่ระบบไม่สำเร็จ')
      setPending(false)
    }
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <button type="button" className="pill pill-primary" onClick={handleClick} disabled={pending}>
        {pending ? 'กำลังพาไปที่ Discord…' : 'เข้าสู่ระบบด้วย Discord'}
      </button>
      <p role="status" className="t-label max-w-xs text-center text-cream-muted">
        {error ?? 'เปิดให้เฉพาะสมาชิกที่ได้รับอนุญาต'}
      </p>
    </div>
  )
}
