import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'
import { Route, Routes } from 'react-router'
import { AppShell } from '@/app/AppShell'
import { AuthGate } from '@/auth/AuthGate'
import { AuthProvider } from '@/auth/AuthProvider'
import { ToastProvider } from '@/components/Toast'
import { ActivitiesPage } from '@/pages/ActivitiesPage'
import { AdminPage } from '@/pages/AdminPage'
import { DashboardPage } from '@/pages/DashboardPage'
import { DuesPage } from '@/pages/DuesPage'
import { InventoryPage } from '@/pages/InventoryPage'
import { LandingPage } from '@/pages/LandingPage'
import { MemberDetailPage } from '@/pages/MemberDetailPage'
import { MembersPage } from '@/pages/MembersPage'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { OutfitsPage } from '@/pages/OutfitsPage'
import { PointsPage } from '@/pages/PointsPage'
import { TreasuryPage } from '@/pages/TreasuryPage'
import { VehiclesPage } from '@/pages/VehiclesPage'

export function AppRoutes() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: 1,
            refetchOnWindowFocus: false,
            staleTime: 15_000,
          },
        },
      }),
  )

  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/app" element={<AuthGate />}>
              <Route element={<AppShell />}>
                <Route index element={<DashboardPage />} />
                <Route path="members" element={<MembersPage />} />
                <Route path="members/:memberId" element={<MemberDetailPage />} />
                <Route path="inventory" element={<InventoryPage />} />
                <Route path="treasury" element={<TreasuryPage />} />
                <Route path="dues" element={<DuesPage />} />
                <Route path="vehicles" element={<VehiclesPage />} />
                <Route path="points" element={<PointsPage />} />
                <Route path="activities" element={<ActivitiesPage />} />
                <Route path="outfits" element={<OutfitsPage />} />
                <Route path="admin" element={<AdminPage />} />
              </Route>
            </Route>
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </AuthProvider>
      </ToastProvider>
    </QueryClientProvider>
  )
}
