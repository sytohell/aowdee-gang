import { Route, Routes } from 'react-router'
import { AppPage } from '@/pages/AppPage'
import { LandingPage } from '@/pages/LandingPage'
import { NotFoundPage } from '@/pages/NotFoundPage'

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/app" element={<AppPage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}
