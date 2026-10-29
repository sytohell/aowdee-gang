import { useState, type FormEvent, type ReactNode } from 'react'
import { Outlet } from 'react-router'
import { useAuth } from '@/auth/AuthProvider'
import { Crest } from '@/components/Crest'
import { Field, InlineError, SubmitButton } from '@/components/ui'
import { callRpc } from '@/lib/api'
import { useAction } from '@/lib/use-action'
import { isSupabaseConfigured } from '@/lib/env'

function AuthFrame({ children }: { children: ReactNode }) {
  return (
    <main className="landing-field flex min-h-dvh items-center justify-center px-6 py-12">
      <div className="w-full max-w-lg">
        <div className="mb-8 flex items-center justify-center gap-3">
          <Crest size={40} className="rounded-sm ring-1 ring-brass/40" />
          <span className="t-label text-cream-muted">AOWDEE GANG HQ</span>
        </div>
        {children}
        <p className="t-label mt-8 text-center text-cream-muted">ข้อมูลภายใน · ห้ามเผยแพร่</p>
      </div>
    </main>
  )
}

function SignInScreen() {
  const { signIn } = useAuth()
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function handleSignIn() {
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
    <AuthFrame>
      <div className="paper rounded-card border border-paper-dim p-7">
        <p className="t-label text-brass-deep">ประตูด้านหน้า</p>
        <h1 className="t-headline mt-2 text-ink">เข้าสู่ห้องบัญชีของแก๊ง</h1>
        <p className="t-body mt-3 text-ink-muted">
          ใช้บัญชี Discord ที่เจ้าของแก๊งผูกไว้กับรายชื่อสมาชิกแล้วเท่านั้น
        </p>
        <button
          type="button"
          onClick={handleSignIn}
          disabled={pending}
          className="pill mt-6 w-full bg-brass text-ground hover:bg-[#e2cf9c] disabled:opacity-60"
        >
          {pending ? 'กำลังพาไปที่ Discord…' : 'เข้าสู่ระบบด้วย Discord'}
        </button>
        {error ? (
          <div className="mt-4">
            <InlineError>{error}</InlineError>
          </div>
        ) : null}
      </div>
    </AuthFrame>
  )
}

function DeniedScreen() {
  const { whoami, signOut } = useAuth()
  const [copied, setCopied] = useState(false)
  const discordId = whoami?.discord_user_id

  async function copyId() {
    if (!discordId) return
    try {
      await navigator.clipboard.writeText(discordId)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  return (
    <AuthFrame>
      <div className="paper rounded-card border border-paper-dim p-7">
        <p className="t-label text-rust">ยังไม่มีสิทธิ์</p>
        <h1 className="t-headline mt-2 text-ink">บัญชีนี้ยังไม่ถูกผูกกับสมาชิก</h1>
        <p className="t-body mt-3 text-ink-muted">
          ส่ง Discord ID ด้านล่างให้เจ้าของแก๊ง แล้วให้เจ้าของผูกบัญชีนี้กับรายชื่อของคุณในหน้า
          “สมาชิก” จากนั้นเข้าสู่ระบบใหม่
        </p>

        {discordId ? (
          <div className="mt-5 rounded-control border border-paper-dim bg-[#fbf9f2] p-4">
            <p className="t-label text-ink-muted">Discord ID ของบัญชีที่ใช้อยู่</p>
            <p className="mt-2 font-mono text-lg tracking-wide text-ink">{discordId}</p>
            <button
              type="button"
              onClick={copyId}
              className="pill mt-3 min-h-[40px] border border-paper-dim px-4 text-sm text-ink"
            >
              {copied ? 'คัดลอกแล้ว' : 'คัดลอก ID'}
            </button>
          </div>
        ) : (
          <p className="t-body mt-5 rounded-control border border-paper-dim bg-[#fbf9f2] p-4 text-ink-muted">
            ไม่พบข้อมูล Discord ที่ยืนยันแล้วในบัญชีนี้ กรุณาออกจากระบบแล้วเข้าสู่ระบบด้วย Discord
            อีกครั้ง
          </p>
        )}

        <button
          type="button"
          onClick={() => void signOut()}
          className="pill mt-6 w-full border border-paper-dim text-ink"
        >
          ออกจากระบบ
        </button>
      </div>
    </AuthFrame>
  )
}

function ClaimOwnerScreen() {
  const { whoami, signOut } = useAuth()
  const [name, setName] = useState('')
  const { pending, run } = useAction()
  const [localError, setLocalError] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setLocalError(null)
    if (!name.trim()) {
      setLocalError('กรอกชื่อในเกมก่อน')
      return
    }
    const success = await run(
      () => callRpc('claim_owner', { p_in_game_name: name.trim() }),
      'ตั้งเจ้าของระบบเรียบร้อย',
    )
    if (!success) setLocalError('บัญชีนี้ไม่ใช่บัญชี Discord ของเจ้าของที่ตั้งไว้')
  }

  return (
    <AuthFrame>
      <div className="paper rounded-card border border-paper-dim p-7">
        <p className="t-label text-brass-deep">ครั้งแรกของระบบ</p>
        <h1 className="t-headline mt-2 text-ink">ตั้งเจ้าของระบบ</h1>
        <p className="t-body mt-3 text-ink-muted">
          ระบบยังไม่มีเจ้าของ บัญชี Discord ที่ตั้งไว้จะกลายเป็นหัวหน้าแก๊งและได้ช่องหลักช่องแรก
          เฉพาะบัญชีที่ตรงกับ Discord ID ที่ตั้งไว้ในฐานข้อมูลเท่านั้นที่ทำขั้นนี้ได้
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <Field label="ชื่อในเกม" htmlFor="owner-name" required>
            <input
              id="owner-name"
              className="field"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={60}
              autoComplete="off"
            />
          </Field>
          {localError ? <InlineError>{localError}</InlineError> : null}
          <SubmitButton pending={pending} className="w-full">
            ยืนยันเป็นเจ้าของระบบ
          </SubmitButton>
        </form>

        <div className="mt-5 border-t border-paper-dim pt-4">
          <p className="text-xs text-ink-muted">
            Discord ID ที่ตรวจพบ: <span className="font-mono">{whoami?.discord_user_id ?? '—'}</span>
          </p>
          <button
            type="button"
            onClick={() => void signOut()}
            className="mt-3 text-sm font-medium text-ink-muted underline underline-offset-4 hover:text-ink"
          >
            ออกจากระบบ
          </button>
        </div>
      </div>
    </AuthFrame>
  )
}

function ConfigMissing() {
  return (
    <main className="landing-field flex min-h-dvh items-center justify-center px-6 py-12">
      <div className="paper w-full max-w-2xl rounded-card border border-paper-dim p-7 sm:p-9">
        <p className="t-label text-brass-deep">พื้นที่สมาชิก</p>
        <h1 className="t-headline mt-3 text-ink">ยังไม่ได้เชื่อมต่อฐานข้อมูล</h1>
        <p className="t-body mt-3 text-ink-muted">
          พื้นที่นี้จะแสดงข้อมูลจริงหลังตั้งค่า Supabase, Discord OAuth และสิทธิ์สมาชิกเสร็จ
          ตอนนี้ยังไม่มีการสร้างสมาชิกหรือยอดเงินใด ๆ เพื่อไม่ให้ตัวเลขปลอมปนกับข้อมูลจริง
        </p>
        <div className="mt-7 rounded-control border border-paper-dim bg-[#fbf9f2] p-5">
          <p className="t-label text-ink-muted">ขั้นถัดไป</p>
          <ol className="t-body mt-3 list-decimal space-y-2 pl-5 text-ink">
            <li>เชื่อม Discord OAuth ในโปรเจกต์ Supabase</li>
            <li>ใส่ URL และ publishable key ในไฟล์ .env.local</li>
            <li>ผูก Discord ID ของเจ้าของเข้ากับสิทธิ์เจ้าของ</li>
          </ol>
        </div>
      </div>
    </main>
  )
}

export function AuthGate() {
  const { session, sessionLoading, whoami, whoamiLoading, whoamiError, signOut } = useAuth()

  if (!isSupabaseConfigured) return <ConfigMissing />

  if (sessionLoading) {
    return (
      <AuthFrame>
        <div className="paper rounded-card border border-paper-dim p-8 text-center">
          <p role="status" className="t-body text-ink-muted">
            กำลังตรวจสอบเซสชัน…
          </p>
        </div>
      </AuthFrame>
    )
  }

  if (!session) return <SignInScreen />

  if (whoamiLoading) {
    return (
      <AuthFrame>
        <div className="paper rounded-card border border-paper-dim p-8 text-center">
          <p role="status" className="t-body text-ink-muted">
            กำลังตรวจสอบสิทธิ์การเข้าถึง…
          </p>
        </div>
      </AuthFrame>
    )
  }

  if (whoamiError) {
    return (
      <AuthFrame>
        <div className="paper rounded-card border border-rust/40 p-7">
          <h1 className="t-headline text-ink">ตรวจสอบสิทธิ์ไม่สำเร็จ</h1>
          <p role="alert" className="t-body mt-3 text-rust">
            {whoamiError.message}
          </p>
          <button
            type="button"
            onClick={() => void signOut()}
            className="pill mt-6 border border-paper-dim text-ink"
          >
            ออกจากระบบแล้วลองใหม่
          </button>
        </div>
      </AuthFrame>
    )
  }

  if (!whoami) {
    return (
      <AuthFrame>
        <div className="paper rounded-card border border-rust/40 p-7">
          <h1 className="t-headline text-ink">ไม่พบข้อมูลสิทธิ์</h1>
          <p className="t-body mt-3 text-ink-muted">กรุณาออกจากระบบแล้วเข้าสู่ระบบใหม่</p>
          <button
            type="button"
            onClick={() => void signOut()}
            className="pill mt-6 border border-paper-dim text-ink"
          >
            ออกจากระบบ
          </button>
        </div>
      </AuthFrame>
    )
  }

  if (!whoami.allowed) {
    return whoami.owner_configured ? <DeniedScreen /> : <ClaimOwnerScreen />
  }

  return <Outlet />
}
