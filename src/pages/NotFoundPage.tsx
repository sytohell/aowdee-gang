import { Link } from 'react-router'

export function NotFoundPage() {
  return (
    <main className="landing-field flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <p className="t-label text-brass">404</p>
      <h1 className="t-headline mt-3 text-cream">ไม่พบหน้าที่ต้องการ</h1>
      <p className="t-body mt-3 max-w-md text-cream-muted">
        ลิงก์นี้อาจถูกเปลี่ยนหรือถูกถอนออกแล้ว
      </p>
      <Link to="/" className="pill pill-quiet mt-8">
        กลับหน้าหลัก
      </Link>
    </main>
  )
}
