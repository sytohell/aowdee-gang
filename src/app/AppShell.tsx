import * as DialogPrimitive from '@radix-ui/react-dialog'
import { clsx } from 'clsx'
import { useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router'
import { useAuth } from '@/auth/AuthProvider'
import { Crest } from '@/components/Crest'
import { SITE_ROLE_LABELS } from '@/lib/types'

type NavItem = {
  to: string
  label: string
  end?: boolean
  roles?: Array<'owner' | 'editor' | 'viewer'>
}

const NAV_ITEMS: NavItem[] = [
  { to: '/app', label: 'ภาพรวม', end: true },
  { to: '/app/members', label: 'สมาชิก' },
  { to: '/app/inventory', label: 'คลังของ' },
  { to: '/app/treasury', label: 'การเงิน' },
  { to: '/app/dues', label: 'ค่าหัว' },
  { to: '/app/vehicles', label: 'รถ' },
  { to: '/app/points', label: 'แต้ม' },
  { to: '/app/activities', label: 'กิจกรรม' },
  { to: '/app/outfits', label: 'ชุด' },
  { to: '/app/admin', label: 'จัดการ', roles: ['owner', 'editor'] },
]

function visibleItems(role: 'owner' | 'editor' | 'viewer') {
  return NAV_ITEMS.filter((item) => !item.roles || item.roles.includes(role))
}

function navClass({ isActive }: { isActive: boolean }) {
  return clsx(
    'relative flex min-h-[44px] items-center px-1 text-[0.8125rem] font-medium tracking-[0.02em] transition-colors',
    isActive ? 'text-cream' : 'text-cream-muted hover:text-cream',
  )
}

function NavUnderline({ active }: { active: boolean }) {
  return (
    <span
      aria-hidden
      className={clsx(
        'absolute inset-x-0 -bottom-[17px] h-[2px] transition-colors',
        active ? 'bg-brass' : 'bg-transparent',
      )}
    />
  )
}

function MobileMenu({ role, name }: { role: 'owner' | 'editor' | 'viewer'; name: string }) {
  const [open, setOpen] = useState(false)
  const { signOut } = useAuth()

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Trigger asChild>
        <button
          type="button"
          className="pill min-h-[40px] border border-brass/25 px-4 text-sm text-cream lg:hidden"
        >
          เมนู
        </button>
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-[#01120a]/80" />
        <DialogPrimitive.Content className="fixed inset-y-0 right-0 z-50 flex w-[min(88vw,22rem)] flex-col bg-ground p-6 shadow-[0_24px_48px_-12px_rgba(1,29,17,0.45)]">
          <div className="flex items-center justify-between">
            <DialogPrimitive.Title className="t-label text-brass">เมนู</DialogPrimitive.Title>
            <DialogPrimitive.Close
              className="rounded-full border border-brass/25 px-2.5 py-1 text-sm text-cream-muted hover:text-cream"
              aria-label="ปิดเมนู"
            >
              ✕
            </DialogPrimitive.Close>
          </div>

          <div className="mt-6 border-b border-brass/15 pb-4">
            <p className="text-sm font-medium text-cream">{name}</p>
            <p className="t-label mt-1 text-cream-muted">{SITE_ROLE_LABELS[role]}</p>
          </div>

          <nav className="mt-3 flex flex-1 flex-col" aria-label="เมนูหลัก">
            {visibleItems(role).map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                onClick={() => setOpen(false)}
                className={({ isActive }) =>
                  clsx(
                    'flex min-h-[48px] items-center border-b border-brass/10 text-base',
                    isActive ? 'text-brass' : 'text-cream-muted',
                  )
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <button
            type="button"
            onClick={() => {
              setOpen(false)
              void signOut()
            }}
            className="pill pill-quiet mt-6 w-full"
          >
            ออกจากระบบ
          </button>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

export function AppShell() {
  const { whoami, signOut } = useAuth()
  const location = useLocation()
  const member = whoami?.member
  const role = member?.site_role ?? 'viewer'

  return (
    <div className="flex min-h-dvh flex-col bg-ground">
      <header className="sticky top-0 z-30 border-b border-brass/15 bg-ground">
        <div className="mx-auto flex h-16 w-full max-w-[1200px] items-center gap-6 px-4 sm:px-6">
          <Link to="/app" className="flex shrink-0 items-center gap-2.5">
            <Crest size={32} className="rounded-sm ring-1 ring-brass/40" />
            <span className="t-label hidden text-cream sm:inline">AOWDEE</span>
          </Link>

          <nav className="hidden flex-1 items-center gap-5 lg:flex" aria-label="เมนูหลัก">
            {visibleItems(role).map((item) => (
              <NavLink key={item.to} to={item.to} end={item.end} className={navClass}>
                {({ isActive }) => (
                  <>
                    {item.label}
                    <NavUnderline active={isActive} />
                  </>
                )}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium leading-tight text-cream">{member?.in_game_name}</p>
              <p className="t-label mt-0.5 text-cream-muted">{SITE_ROLE_LABELS[role]}</p>
            </div>
            <button
              type="button"
              onClick={() => void signOut()}
              className="hidden min-h-[40px] rounded-full border border-brass/20 px-4 text-sm text-cream-muted transition-colors hover:text-cream lg:block"
            >
              ออก
            </button>
            <MobileMenu role={role} name={member?.in_game_name ?? ''} />
          </div>
        </div>
      </header>

      <main key={location.pathname} className="mx-auto w-full max-w-[1200px] flex-1 px-4 py-8 sm:px-6 sm:py-10">
        <Outlet />
      </main>

      <footer className="border-t border-brass/10">
        <div className="mx-auto flex w-full max-w-[1200px] flex-wrap items-center justify-between gap-2 px-4 py-5 sm:px-6">
          <p className="t-label text-cream-muted">AOWDEE GANG HQ · LUV TOWN</p>
          <p className="t-label text-cream-muted">เวลาทั้งหมดแสดงตาม Asia/Bangkok</p>
        </div>
      </footer>
    </div>
  )
}
