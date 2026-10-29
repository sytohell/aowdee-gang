import { Crest } from '@/components/Crest'
import { LoginButton } from '@/components/LoginButton'

export function LandingPage() {
  return (
    <main className="landing-field flex min-h-dvh flex-col">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-3">
          <Crest size={36} className="rounded-md ring-1 ring-brass/40" />
          <span className="t-label text-cream-muted">AOWDEE GANG HQ</span>
        </div>
        <span className="t-label hidden text-cream-muted sm:block">LUV TOWN · FIVEM</span>
      </header>

      <section className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center px-6 pb-16 pt-6 text-center">
        <div className="relative shrink-0">
          <div aria-hidden className="absolute -inset-5 rounded-[44px] border border-brass/15" />
          <Crest
            size={420}
            alt="ตราประจำแก๊ง AOWDEE"
            className="h-[min(56vw,420px)] w-[min(56vw,420px)] rounded-plate object-cover ring-1 ring-brass/40"
          />
        </div>

        <p className="t-label mt-10 text-brass">THE COUNTING ROOM</p>
        <h1 className="t-display mt-3 text-cream">AOWDEE</h1>
        <p className="t-body mt-5 max-w-lg text-cream-muted">
          ศูนย์ข้อมูลภายในแก๊ง สมาชิก คลังของ เงินแก๊ง รถ และแต้ม อยู่ในที่เดียว
        </p>

        <div className="mt-9">
          <LoginButton />
        </div>
      </section>

      <footer className="mx-auto w-full max-w-6xl border-t border-brass/15 px-6 py-6 text-center">
        <p className="t-label text-cream-muted">ข้อมูลภายใน · ห้ามเผยแพร่</p>
      </footer>
    </main>
  )
}
