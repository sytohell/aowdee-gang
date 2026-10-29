import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import {
  ErrorBlock,
  LoadingBlock,
  PageHeader,
  PaperPanel,
  SectionTitle,
  StatTile,
  StatusChip,
} from '@/components/ui'
import { db, toNumber, unwrap } from '@/lib/db'
import { formatDateTime, formatMoney } from '@/lib/format'
import type {
  Activity,
  AppSettings,
  DashboardSummary,
  DuesOutstanding,
  VehicleStatus,
} from '@/lib/types'
import { ACTIVITY_STATUS_LABELS, DUES_STATE_LABELS } from '@/lib/types'

function activityTone(status: Activity['status']): 'ok' | 'warn' | 'neutral' {
  if (status === 'active') return 'ok'
  if (status === 'upcoming') return 'warn'
  return 'neutral'
}

export function DashboardPage() {
  const settingsQuery = useQuery<AppSettings>({
    queryKey: ['app_settings'],
    queryFn: async () => unwrap(await db().from('app_settings').select('*').single()),
    staleTime: 5 * 60_000,
  })

  const summaryQuery = useQuery<DashboardSummary>({
    queryKey: ['dashboard_summary'],
    queryFn: async () => unwrap(await db().from('dashboard_summary').select('*').single()),
  })

  const duesQuery = useQuery<DuesOutstanding[]>({
    queryKey: ['dues_outstanding', 'open'],
    queryFn: async () =>
      unwrap(
        await db()
          .from('dues_outstanding')
          .select('*')
          .in('state', ['pending', 'partial'])
          .order('due_at', { ascending: true })
          .limit(6),
      ),
  })

  const vehiclesQuery = useQuery<VehicleStatus[]>({
    queryKey: ['vehicle_status', 'held'],
    queryFn: async () =>
      unwrap(
        await db()
          .from('vehicle_status')
          .select('*')
          .eq('status', 'held')
          .order('remaining_minutes', { ascending: true })
          .limit(5),
      ),
  })

  const activitiesQuery = useQuery<Activity[]>({
    queryKey: ['announcements', 'dashboard'],
    queryFn: async () =>
      unwrap(
        await db()
          .from('announcements')
          .select('*')
          .is('archived_at', null)
          .order('pinned', { ascending: false })
          .order('starts_at', { ascending: false, nullsFirst: false })
          .limit(4),
      ),
  })

  const isLoading =
    settingsQuery.isPending ||
    summaryQuery.isPending ||
    duesQuery.isPending ||
    vehiclesQuery.isPending ||
    activitiesQuery.isPending

  const error =
    settingsQuery.error ??
    summaryQuery.error ??
    duesQuery.error ??
    vehiclesQuery.error ??
    activitiesQuery.error

  if (isLoading) return <LoadingBlock />
  if (error) {
    return (
      <ErrorBlock
        error={error}
        onRetry={() => {
          void settingsQuery.refetch()
          void summaryQuery.refetch()
          void duesQuery.refetch()
          void vehiclesQuery.refetch()
          void activitiesQuery.refetch()
        }}
      />
    )
  }

  const summary = summaryQuery.data
  if (!summary) return <LoadingBlock />
  const unit = settingsQuery.data?.currency_unit ?? 'เงินในเกม'
  const dues = duesQuery.data ?? []
  const vehicles = vehiclesQuery.data ?? []
  const activities = activitiesQuery.data ?? []
  const overdueMinor = toNumber(summary.dues_overdue_minor)

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="AOWDEE · LUV TOWN"
        title="ภาพรวมแก๊ง"
        description="ตัวเลขทั้งหมดมาจากบัญชีกลางที่บันทึกไว้จริง ไม่มีการประมาณหรือเติมยอดเอง"
      />

      <section aria-label="ตัวเลขสำคัญ" className="grid gap-4 md:grid-cols-3">
        <StatTile
          label="ช่องสมาชิก"
          value={`${summary.main_filled}/30`}
          unit="ช่องหลัก"
          hint={`ช่องสำรอง ${summary.reserve_filled}/5`}
          to="/app/members"
        />
        <StatTile
          label="ค่าหัวค้างชำระ"
          value={String(summary.dues_overdue_count)}
          unit="รายการ"
          hint={
            summary.dues_overdue_count > 0
              ? `ค้างรวม ${formatMoney(overdueMinor, unit)}`
              : 'ไม่มีรายการค้าง ณ ตอนนี้'
          }
          tone={summary.dues_overdue_count > 0 ? 'danger' : 'ok'}
          to="/app/dues"
        />
        <StatTile
          label="รถที่ถูกถือครอง"
          value={String(summary.vehicles_held)}
          unit="คัน"
          hint={
            summary.vehicles_expiring_24h > 0
              ? `${summary.vehicles_expiring_24h} คันจะหมดสัญญาภายใน 24 ชม.`
              : 'ไม่มีสัญญาที่จะหมดภายใน 24 ชม.'
          }
          to="/app/vehicles"
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-12">
        <div className="lg:col-span-4">
          <StatTile
            label="แต้มแก๊ง"
            value={String(toNumber(summary.gang_points))}
            unit="แต้ม"
            hint="แต้มแก๊งแยกจากแต้มส่วนตัว และโอนระหว่างกันไม่ได้"
            to="/app/points"
          />
        </div>

        <PaperPanel className="lg:col-span-8">
          <SectionTitle
            title="กิจกรรมล่าสุด"
            description="ประกาศและกิจกรรมที่ยังไม่ถูกเก็บถาวร"
            actions={
              <Link to="/app/activities" className="text-sm font-medium text-brass-deep underline underline-offset-4">
                ดูทั้งหมด
              </Link>
            }
          />
          {activities.length === 0 ? (
            <p className="mt-5 text-sm text-ink-muted">ยังไม่มีประกาศหรือกิจกรรมในระบบ</p>
          ) : (
            <ul className="mt-4 divide-y divide-[#e7dfcd]">
              {activities.map((activity) => (
                <li key={activity.id} className="flex flex-wrap items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink">{activity.title}</p>
                    <p className="mt-1 text-xs text-ink-muted">
                      {activity.starts_at ? formatDateTime(activity.starts_at) : 'ยังไม่กำหนดเวลา'}
                      {activity.pinned ? ' · ปักหมุด' : ''}
                    </p>
                  </div>
                  <StatusChip tone={activityTone(activity.status)}>
                    {ACTIVITY_STATUS_LABELS[activity.status]}
                  </StatusChip>
                </li>
              ))}
            </ul>
          )}
        </PaperPanel>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <PaperPanel>
          <SectionTitle
            title="ค่าหัวที่ต้องเก็บ"
            actions={
              <Link to="/app/dues" className="text-sm font-medium text-brass-deep underline underline-offset-4">
                เปิดหน้าค่าหัว
              </Link>
            }
          />
          {dues.length === 0 ? (
            <p className="mt-4 text-sm text-ink-muted">ไม่มีค่าหัวค้างหรือชำระบางส่วน</p>
          ) : (
            <ul className="mt-4 divide-y divide-[#e7dfcd]">
              {dues.map((item) => (
                <li key={item.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                  <div>
                    <p className="text-sm font-medium text-ink">{item.in_game_name}</p>
                    <p className="mt-0.5 text-xs text-ink-muted">
                      ครบกำหนด {formatDateTime(item.due_at)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="numeral text-sm font-semibold text-ink">
                      {formatMoney(toNumber(item.unpaid_minor), unit)}
                    </p>
                    <p className="mt-0.5 text-xs text-ink-muted">{DUES_STATE_LABELS[item.state]}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </PaperPanel>

        <PaperPanel>
          <SectionTitle
            title="รถที่กำลังถูกถือ"
            actions={
              <Link to="/app/vehicles" className="text-sm font-medium text-brass-deep underline underline-offset-4">
                เปิดหน้ารถ
              </Link>
            }
          />
          {vehicles.length === 0 ? (
            <p className="mt-4 text-sm text-ink-muted">ยังไม่มีรถที่ถูกถือครองอยู่ในขณะนี้</p>
          ) : (
            <ul className="mt-4 divide-y divide-[#e7dfcd]">
              {vehicles.map((vehicle) => (
                <li key={itemKey(vehicle)} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                  <div>
                    <p className="text-sm font-medium text-ink">
                      {vehicle.name} · {vehicle.plate}
                    </p>
                    <p className="mt-0.5 text-sm text-ink-muted">{itemHolder(vehicle)}</p>
                  </div>
                  <div className="text-right">
                    <p className="numeral text-sm font-semibold text-ink">
                      {formatRemaining(vehicle.remaining_minutes)}
                    </p>
                    <p className="mt-0.5 text-xs text-ink-muted">คงเหลือ</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </PaperPanel>
      </section>
    </div>
  )
}

function itemKey(vehicle: VehicleStatus) {
  return vehicle.contract_id ?? vehicle.id
}

function itemHolder(vehicle: VehicleStatus) {
  return vehicle.holder_name ? `ผู้ถือ: ${vehicle.holder_name}` : 'ไม่พบชื่อผู้ถือ'
}

function formatRemaining(minutes: number | string | null) {
  const value = toNumber(minutes)
  if (value <= 0) return 'หมดเวลา'
  const hours = Math.floor(value / 60)
  const mins = value % 60
  if (hours >= 24) {
    const days = Math.floor(hours / 24)
    return `${days} วัน ${hours % 24} ชม.`
  }
  return `${hours} ชม. ${mins} นาที`
}
