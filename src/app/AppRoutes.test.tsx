import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import { AppRoutes } from '@/app/AppRoutes'

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
    </MemoryRouter>,
  )
}

describe('public routes', () => {
  it('shows the gang identity on the landing page', () => {
    renderAt('/')

    expect(screen.getByRole('heading', { level: 1, name: 'AOWDEE' })).toBeInTheDocument()
    expect(screen.getByText('เปิดให้เฉพาะสมาชิกที่ได้รับอนุญาต')).toBeInTheDocument()
  })

  it('states that sign-in opens after Discord is configured', async () => {
    const user = userEvent.setup()
    renderAt('/')

    await user.click(screen.getByRole('button', { name: 'เข้าสู่ระบบด้วย Discord' }))

    expect(
      screen.getByText('ระบบล็อกอินจะเปิดใช้งานหลังตั้งค่า Discord OAuth ในขั้นถัดไป'),
    ).toBeInTheDocument()
  })

  it('renders an honest empty state in the member area', () => {
    renderAt('/app')

    expect(
      screen.getByRole('heading', { name: 'ยังไม่ได้เชื่อมต่อฐานข้อมูล' }),
    ).toBeInTheDocument()
    expect(screen.queryByText(/฿/)).not.toBeInTheDocument()
  })
})
