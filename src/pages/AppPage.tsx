import { Link } from 'react-router'
import { Crest } from '@/components/Crest'

export function AppPage() {
  return (
    <main className="min-h-dvh bg-ground">
      <header className="border-b border-brass/15">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-6 py-4">
          <div className="flex items-center gap-3">
            <Crest size={32} className="rounded-sm ring-1 ring-brass/40" />
            <span className="t-label text-cream-muted">AOWDEE GANG HQ</span>
          </div>
          <Link to="/" className="t-label text-cream-muted hover:text-cream">
            กลับหน้าหลัก
          </Link>
        </div>
      </header>

      <section className="mx-auto w-full max-w-3xl px-6 py-14">
        <div className="paper rounded-card border border-paper-dim p-7 sm:p-9">
          <p className="t-label text-brass-deep">พื้นที่สมาชิก</p>
          <h1 className="t-headline mt-3 text-ink">ยังไม่ได้เชื่อมต่อฐานข้อมูล</h1>
          <p className="t-body mt-3 max-w-prose text-ink-muted">
            พื้นที่นี้จะแสดงข้อมูลจริงหลังตั้งค่า Supabase, Discord OAuth และสิทธิ์สมาชิกเสร็จ
            ตอนนี้ยังไม่มีการสร้างสมาชิกหรือยอดเงินใด ๆ เพื่อไม่ให้ตัวเลขปลอมปนกับข้อมูลจริง
          </p>

          <div className="mt-7 rounded-control border border-paper-dim bg-white/55 p-5">
            <p className="t-label text-ink-muted">ขั้นถัดไป</p>
            <ol className="t-body mt-3 list-decimal space-y-2 pl-5 text-ink">
              <li>เชื่อม Discord OAuth ในโปรเจกต์ Supabase</li>
              <li>รัน migration สร้างตารางและ Row Level Security</li>
              <li>ผูก Discord ID ของ OWNER เข้ากับสิทธิ์เจ้าของ</li>
            </ol>
          </div>
        </div>
      </section>
    </main>
  )
}
