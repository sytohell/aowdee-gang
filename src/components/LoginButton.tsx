import { useState } from 'react'

export function LoginButton() {
  const [showNotice, setShowNotice] = useState(false)

  return (
    <div className="flex flex-col items-center gap-3">
      <button
        type="button"
        className="pill pill-primary"
        aria-describedby={showNotice ? 'login-notice' : undefined}
        onClick={() => setShowNotice(true)}
      >
        เข้าสู่ระบบด้วย Discord
      </button>
      <p id="login-notice" role="status" className="t-label max-w-xs text-cream-muted">
        {showNotice
          ? 'ระบบล็อกอินจะเปิดใช้งานหลังตั้งค่า Discord OAuth ในขั้นถัดไป'
          : 'เปิดให้เฉพาะสมาชิกที่ได้รับอนุญาต'}
      </p>
    </div>
  )
}
