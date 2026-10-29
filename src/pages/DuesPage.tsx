import { useQuery } from '@tanstack/react-query'
import { useMemo, useState, type FormEvent } from 'react'
import { useAuth } from '@/auth/AuthProvider'
import {
  ConfirmDialog,
  Dialog,
  EmptyState,
  ErrorBlock,
  Field,
  FormActions,
  InlineError,
  LoadingBlock,
  PageHeader,
  PaperPanel,
  SectionTitle,
  StatusChip,
  SubmitButton,
  TableCell,
  TableHeadCell,
  TableShell,
} from '@/components/ui'
import { callRpc, newIdempotencyKey } from '@/lib/api'
import { db, toNumber, unwrap } from '@/lib/db'
import {
  bangkokTodayIso,
  bangkokWeekStartIso,
  formatDate,
  formatDateTime,
  formatMoney,
} from '@/lib/format'
import { useAction } from '@/lib/use-action'
import type {
  AppSettings,
  DuesOutstanding,
  DuesPayment,
  DuesPeriod,
  DuesPolicy,
  DuesState,
  MemberRow,
} from '@/lib/types'
import { DUES_STATE_LABELS, THAI_DAYS } from '@/lib/types'

function stateTone(state: DuesState, overdue: boolean): 'ok' | 'warn' | 'danger' | 'neutral' {
  if (state === 'paid') return 'ok'
  if (state === 'waived') return 'neutral'
  if (state === 'partial') return 'warn'
  return overdue ? 'danger' : 'neutral'
}

export function DuesPage() {
  const { whoami } = useAuth()
  const role = whoami?.member?.site_role
  const canEdit = role === 'owner' || role === 'editor'
  const isOwner = role === 'owner'

  const [policyOpen, setPolicyOpen] = useState(false)
  const [generateOpen, setGenerateOpen] = useState(false)
  const [payTarget, setPayTarget] = useState<DuesOutstanding | null>(null)
  const [waiveTarget, setWaiveTarget] = useState<DuesOutstanding | null>(null)
  const [historyTarget, setHistoryTarget] = useState<DuesOutstanding | null>(null)
  const [periodFilter, setPeriodFilter] = useState('all')
  const [stateFilter, setStateFilter] = useState<'open' | 'all' | 'paid' | 'waived'>('open')
  const { pending, run } = useAction()

  const settingsQuery = useQuery<AppSettings>({
    queryKey: ['app_settings'],
    queryFn: async () => unwrap(await db().from('app_settings').select('*').single()),
    staleTime: 5 * 60_000,
  })

  const policiesQuery = useQuery<DuesPolicy[]>({
    queryKey: ['dues_policies'],
    queryFn: async () =>
      unwrap(
        await db()
          .from('dues_policies')
          .select('*')
          .order('effective_from', { ascending: false }),
      ),
  })

  const periodsQuery = useQuery<DuesPeriod[]>({
    queryKey: ['dues_periods'],
    queryFn: async () =>
      unwrap(
        await db()
          .from('dues_periods')
          .select('*')
          .order('week_start', { ascending: false })
          .limit(24),
      ),
  })

  const obligationsQuery = useQuery<DuesOutstanding[]>({
    queryKey: ['dues_outstanding'],
    queryFn: async () =>
      unwrap(
        await db()
          .from('dues_outstanding')
          .select('*')
          .order('due_at', { ascending: false })
          .limit(300),
      ),
  })

  const membersQuery = useQuery<MemberRow[]>({
    queryKey: ['members', 'active'],
    queryFn: async () =>
      unwrap(
        await db()
          .from('members')
          .select('*')
          .eq('state', 'active')
          .order('in_game_name', { ascending: true }),
      ),
  })

  const policies = policiesQuery.data ?? []
  const latestPolicy = policies[0]
  const unit = settingsQuery.data?.currency_unit ?? 'เงินในเกม'
  const periods = periodsQuery.data ?? []
  const obligations = useMemo(() => obligationsQuery.data ?? [], [obligationsQuery.data])

  const filtered = useMemo(() => {
    return obligations.filter((item) => {
      if (periodFilter !== 'all' && item.period_id !== periodFilter) return false
      if (stateFilter === 'open') return item.state === 'pending' || item.state === 'partial'
      if (stateFilter === 'all') return true
      return item.state === stateFilter
    })
  }, [obligations, periodFilter, stateFilter])

  if (settingsQuery.isPending || policiesQuery.isPending || obligationsQuery.isPending) {
    return <LoadingBlock />
  }

  if (settingsQuery.isError || policiesQuery.isError || obligationsQuery.isError) {
    return (
      <ErrorBlock
        error={settingsQuery.error ?? policiesQuery.error ?? obligationsQuery.error}
        onRetry={() => {
          void settingsQuery.refetch()
          void policiesQuery.refetch()
          void periodsQuery.refetch()
          void obligationsQuery.refetch()
        }}
      />
    )
  }

  const openCount = obligations.filter(
    (item) => item.state === 'pending' || item.state === 'partial',
  ).length
  const overdueTotal = obligations
    .filter((item) => item.overdue)
    .reduce((sum, item) => sum + toNumber(item.unpaid_minor), 0)
  const hasOpen = obligations.some(
    (item) => item.state === 'pending' || item.state === 'partial',
  )

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="รอบสัปดาห์"
        title="ค่าหัว"
        description="แต่ละรอบตรึงยอดและรายชื่อไว้ตอนสร้าง เปลี่ยนนโยบายภายหลังไม่กระทบรอบเก่า และช่องสำรองไม่ต้องจ่าย"
        actions={
          <>
            {isOwner ? (
              <button
                type="button"
                className="pill pill-quiet"
                onClick={() => setPolicyOpen(true)}
              >
                ตั้งนโยบายค่าหัว
              </button>
            ) : null}
            {canEdit && latestPolicy ? (
              <button
                type="button"
                className="pill pill-primary"
                onClick={() => setGenerateOpen(true)}
              >
                สร้างรอบสัปดาห์
              </button>
            ) : null}
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <PaperPanel>
          <p className="t-label text-ink-muted">นโยบายล่าสุด</p>
          {latestPolicy ? (
            <>
              <p className="t-numeral mt-2 text-2xl text-ink">
                {formatMoney(toNumber(latestPolicy.amount_minor), unit)}
              </p>
              <p className="mt-2 text-sm text-ink-muted">
                ครบกำหนดทุกวัน{THAI_DAYS[latestPolicy.due_weekday - 1]} เวลา{' '}
                {latestPolicy.due_time.slice(0, 5)} น.
              </p>
              <p className="mt-1 text-xs text-ink-muted">
                มีผลตั้งแต่ {formatDate(latestPolicy.effective_from)}
              </p>
            </>
          ) : (
            <p className="mt-2 text-sm leading-relaxed text-ink-muted">
              ยังไม่มีนโยบาย เจ้าของต้องตั้งนโยบายก่อนจึงจะสร้างรอบได้
            </p>
          )}
        </PaperPanel>

        <PaperPanel>
          <p className="t-label text-ink-muted">รายการที่ยังไม่ครบ</p>
          <p className="t-numeral mt-2 text-2xl text-ink">{openCount} รายการ</p>
          <p className="mt-2 text-sm text-ink-muted">นับทุกรอบที่ยังไม่ชำระครบหรือยกเว้น</p>
        </PaperPanel>

        <PaperPanel>
          <p className="t-label text-ink-muted">ค้างเกินกำหนด</p>
          <p className={`t-numeral mt-2 text-2xl ${overdueTotal > 0 ? 'text-rust' : 'text-moss'}`}>
            {formatMoney(overdueTotal, unit)}
          </p>
          <p className="mt-2 text-sm text-ink-muted">
            {overdueTotal > 0 ? 'ต้องติดตามเก็บ' : 'ไม่มีรายการค้างเกินกำหนด'}
          </p>
        </PaperPanel>
      </div>

      <PaperPanel padded={false}>
        <div className="flex flex-wrap items-end justify-between gap-3 p-5 sm:p-6">
          <SectionTitle
            title="รายการค่าหัว"
            description="เลือกงวดและสถานะเพื่อตรวจย้อนหลัง"
          />
          <div className="flex flex-wrap gap-2">
            <select
              aria-label="กรองตามงวด"
              className="field max-w-[14rem]"
              value={periodFilter}
              onChange={(event) => setPeriodFilter(event.target.value)}
            >
              <option value="all">ทุกงวด</option>
              {periods.map((period) => (
                <option key={period.id} value={period.id}>
                  สัปดาห์ {formatDate(period.week_start)}
                </option>
              ))}
            </select>
            <select
              aria-label="กรองตามสถานะ"
              className="field max-w-[11rem]"
              value={stateFilter}
              onChange={(event) => setStateFilter(event.target.value as typeof stateFilter)}
            >
              <option value="open">ยังไม่ครบ</option>
              <option value="paid">ชำระครบ</option>
              <option value="waived">ยกเว้น</option>
              <option value="all">ทั้งหมด</option>
            </select>
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="px-5 pb-6 sm:px-6">
            <EmptyState
              title={obligations.length === 0 ? 'ยังไม่มีรอบค่าหัว' : 'ไม่มีรายการในตัวกรองนี้'}
              description={
                obligations.length === 0
                  ? latestPolicy
                    ? 'สร้างรอบสัปดาห์แรก ระบบจะตรึงยอดและรายชื่อของสมาชิกช่องหลักที่ต้องจ่าย ณ ตอนนั้น'
                    : 'ตั้งนโยบายค่าหัวก่อน แล้วจึงสร้างรอบสัปดาห์แรก'
                  : 'ลองเปลี่ยนงวดหรือสถานะที่กำลังดูอยู่'
              }
              action={
                canEdit && obligations.length === 0 && latestPolicy ? (
                  <button
                    type="button"
                    className="pill bg-brass text-ground"
                    onClick={() => setGenerateOpen(true)}
                  >
                    สร้างรอบแรก
                  </button>
                ) : null
              }
            />
          </div>
        ) : (
          <TableShell>
            <thead>
              <tr>
                <TableHeadCell>สมาชิก</TableHeadCell>
                <TableHeadCell>งวด</TableHeadCell>
                <TableHeadCell numeric>ยอด</TableHeadCell>
                <TableHeadCell numeric>ชำระแล้ว</TableHeadCell>
                <TableHeadCell numeric>คงเหลือ</TableHeadCell>
                <TableHeadCell>กำหนด</TableHeadCell>
                <TableHeadCell>สถานะ</TableHeadCell>
                <TableHeadCell>จัดการ</TableHeadCell>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => (
                <tr key={item.id}>
                  <TableCell>
                    <p className="font-medium text-ink">{item.in_game_name}</p>
                    <p className="mt-0.5 text-xs text-ink-muted">
                      {item.slot_kind === 'reserve' ? 'ช่องสำรอง' : 'ช่องหลัก'}
                    </p>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm text-ink-muted">
                    {formatDate(item.week_start)}
                  </TableCell>
                  <TableCell numeric>{formatMoney(toNumber(item.amount_minor), unit)}</TableCell>
                  <TableCell numeric>{formatMoney(toNumber(item.paid_minor), unit)}</TableCell>
                  <TableCell numeric>
                    <span className={toNumber(item.unpaid_minor) > 0 ? 'text-rust' : 'text-ink'}>
                      {formatMoney(toNumber(item.unpaid_minor), unit)}
                    </span>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm text-ink-muted">
                    {formatDateTime(item.due_at)}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <StatusChip tone={stateTone(item.state, item.overdue)}>
                        {DUES_STATE_LABELS[item.state]}
                      </StatusChip>
                      {item.overdue ? <StatusChip tone="danger">เกินกำหนด</StatusChip> : null}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-2">
                      {canEdit && (item.state === 'pending' || item.state === 'partial') ? (
                        <button
                          type="button"
                          onClick={() => setPayTarget(item)}
                          className="inline-flex min-h-[36px] items-center rounded-full border border-paper-dim px-3 text-xs font-medium text-ink hover:border-brass-deep"
                        >
                          บันทึกชำระ
                        </button>
                      ) : null}
                      {isOwner && (item.state === 'pending' || item.state === 'partial') ? (
                        <button
                          type="button"
                          onClick={() => setWaiveTarget(item)}
                          className="inline-flex min-h-[36px] items-center rounded-full border border-rust/40 px-3 text-xs font-medium text-rust"
                        >
                          ยกเว้น
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => setHistoryTarget(item)}
                        className="inline-flex min-h-[36px] items-center rounded-full border border-paper-dim px-3 text-xs font-medium text-ink hover:border-brass-deep"
                      >
                        ประวัติ
                      </button>
                    </div>
                  </TableCell>
                </tr>
              ))}
            </tbody>
          </TableShell>
        )}
      </PaperPanel>

      {hasOpen ? (
        <p className="text-sm text-ink-muted">
          การบันทึกชำระจะเพิ่มเงินเข้าบัญชีกลางทันทีในธุรกรรมเดียว การแก้ไขใช้การย้อนรายการในประวัติ
        </p>
      ) : null}

      {policyOpen ? <PolicyDialog onClose={() => setPolicyOpen(false)} unit={unit} /> : null}
      {generateOpen ? <GenerateDialog onClose={() => setGenerateOpen(false)} /> : null}
      {payTarget ? (
        <PaymentDialog obligation={payTarget} unit={unit} onClose={() => setPayTarget(null)} />
      ) : null}
      {historyTarget ? (
        <PaymentHistoryDialog
          obligation={historyTarget}
          unit={unit}
          canReverse={canEdit}
          members={membersQuery.data ?? []}
          onClose={() => setHistoryTarget(null)}
        />
      ) : null}

      <ConfirmDialog
        open={waiveTarget !== null}
        onOpenChange={(open) => !open && setWaiveTarget(null)}
        title="ยกเว้นค่าหัว"
        description={
          waiveTarget
            ? `ยกเว้นค่าหัวของ ${waiveTarget.in_game_name} สำหรับงวด ${formatDate(waiveTarget.week_start)} ระบบจะเก็บเหตุผลไว้ในประวัติ`
            : ''
        }
        confirmLabel="ยืนยันยกเว้น"
        pending={pending}
        onConfirm={() => {
          void (async () => {
            if (!waiveTarget) return
            const success = await run(
              () =>
                callRpc('owner_waive_dues', {
                  p_obligation_id: waiveTarget.id,
                  p_reason: 'waived from dues page',
                  p_key: newIdempotencyKey('dues-waive'),
                }),
              'ยกเว้นค่าหัวแล้ว',
            )
            if (success) setWaiveTarget(null)
          })()
        }}
      />
    </div>
  )
}

function PolicyDialog({ onClose, unit }: { onClose: () => void; unit: string }) {
  const { pending, run } = useAction()
  const [amount, setAmount] = useState('')
  const [weekday, setWeekday] = useState('5')
  const [time, setTime] = useState('20:00')
  const [effectiveFrom, setEffectiveFrom] = useState(bangkokTodayIso())
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    const value = Number(amount)
    if (!Number.isInteger(value) || value <= 0) {
      setError('ยอดค่าหัวต้องเป็นจำนวนเต็มมากกว่า 0')
      return
    }
    if (!/^\d{2}:\d{2}$/.test(time)) {
      setError('เวลาต้องอยู่ในรูป HH:MM')
      return
    }
    const success = await run(
      () =>
        callRpc('owner_set_dues_policy', {
          p_amount_minor: value,
          p_due_weekday: Number(weekday),
          p_due_time: `${time}:00`,
          p_effective_from: effectiveFrom,
          p_note: note.trim() || null,
          p_key: newIdempotencyKey('dues-policy'),
        }),
      'บันทึกนโยบายค่าหัวแล้ว',
    )
    if (success) onClose()
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title="ตั้งนโยบายค่าหัว"
      description="มีผลกับรอบที่สร้างใหม่เท่านั้น รอบเก่ายังคงยอดเดิมตามที่ตรึงไว้"
    >
      <form onSubmit={submit} className="space-y-4">
        <Field label="ยอดต่อคนต่อสัปดาห์" htmlFor="policy-amount" hint={unit} required>
          <input
            id="policy-amount"
            className="field numeral"
            inputMode="numeric"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="วันครบกำหนด" htmlFor="policy-weekday">
            <select
              id="policy-weekday"
              className="field"
              value={weekday}
              onChange={(event) => setWeekday(event.target.value)}
            >
              {THAI_DAYS.map((day, index) => (
                <option key={day} value={index + 1}>
                  วัน{day}
                </option>
              ))}
            </select>
          </Field>
          <Field label="เวลา" htmlFor="policy-time">
            <input
              id="policy-time"
              type="time"
              className="field"
              value={time}
              onChange={(event) => setTime(event.target.value)}
            />
          </Field>
          <Field label="มีผลตั้งแต่" htmlFor="policy-effective">
            <input
              id="policy-effective"
              type="date"
              className="field"
              value={effectiveFrom}
              onChange={(event) => setEffectiveFrom(event.target.value)}
            />
          </Field>
        </div>
        <Field label="หมายเหตุ" htmlFor="policy-note" hint="ไม่บังคับ">
          <input
            id="policy-note"
            className="field"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            maxLength={500}
          />
        </Field>
        {error ? <InlineError>{error}</InlineError> : null}
        <FormActions pending={pending} onCancel={onClose}>
          <SubmitButton pending={pending}>บันทึกนโยบาย</SubmitButton>
        </FormActions>
      </form>
    </Dialog>
  )
}

function GenerateDialog({ onClose }: { onClose: () => void }) {
  const { pending, run } = useAction()
  const [weekStart, setWeekStart] = useState(bangkokWeekStartIso())
  const [error, setError] = useState<string | null>(null)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    if (!weekStart) {
      setError('เลือกวันจันทร์ของสัปดาห์')
      return
    }
    const date = new Date(`${weekStart}T00:00:00Z`)
    if (date.getUTCDay() !== 1) {
      setError('วันเริ่มรอบต้องเป็นวันจันทร์')
      return
    }
    const success = await run(
      () =>
        callRpc('editor_generate_dues_period', {
          p_week_start: weekStart,
          p_key: newIdempotencyKey('dues-period'),
        }),
      'สร้างรอบค่าหัวแล้ว',
    )
    if (success) onClose()
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title="สร้างรอบค่าหัว"
      description="ระบบจะใช้สมาชิกช่องหลักที่ยังใช้งานและไม่ได้รับการยกเว้น ณ ตอนสร้าง"
      size="sm"
    >
      <form onSubmit={submit} className="space-y-4">
        <Field label="วันจันทร์ของสัปดาห์" htmlFor="period-week" required>
          <input
            id="period-week"
            type="date"
            className="field"
            value={weekStart}
            onChange={(event) => setWeekStart(event.target.value)}
          />
        </Field>
        {error ? <InlineError>{error}</InlineError> : null}
        <FormActions pending={pending} onCancel={onClose}>
          <SubmitButton pending={pending}>สร้างรอบ</SubmitButton>
        </FormActions>
      </form>
    </Dialog>
  )
}

function PaymentDialog({
  obligation,
  unit,
  onClose,
}: {
  obligation: DuesOutstanding
  unit: string
  onClose: () => void
}) {
  const { pending, run } = useAction()
  const unpaid = toNumber(obligation.unpaid_minor)
  const [amount, setAmount] = useState(String(unpaid))
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    const value = Number(amount)
    if (!Number.isInteger(value) || value <= 0) {
      setError('ยอดชำระต้องเป็นจำนวนเต็มมากกว่า 0')
      return
    }
    if (value > unpaid) {
      setError('ยอดชำระต้องไม่เกินยอดคงเหลือ')
      return
    }
    const success = await run(
      () =>
        callRpc('editor_record_dues_payment', {
          p_obligation_id: obligation.id,
          p_amount_minor: value,
          p_note: note.trim() || null,
          p_key: newIdempotencyKey('dues-payment'),
        }),
      'บันทึกการชำระค่าหัวแล้ว',
    )
    if (success) onClose()
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={`บันทึกชำระ · ${obligation.in_game_name}`}
      description={`งวด ${formatDate(obligation.week_start)} · คงเหลือ ${formatMoney(unpaid, unit)}`}
      size="sm"
    >
      <form onSubmit={submit} className="space-y-4">
        <Field label="ยอดที่ชำระ" htmlFor="payment-amount" hint={unit} required>
          <input
            id="payment-amount"
            className="field numeral"
            inputMode="numeric"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
          />
        </Field>
        <Field label="หมายเหตุ" htmlFor="payment-note" hint="ไม่บังคับ">
          <input
            id="payment-note"
            className="field"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            maxLength={500}
          />
        </Field>
        {error ? <InlineError>{error}</InlineError> : null}
        <FormActions pending={pending} onCancel={onClose}>
          <SubmitButton pending={pending}>บันทึกชำระ</SubmitButton>
        </FormActions>
      </form>
    </Dialog>
  )
}

function PaymentHistoryDialog({
  obligation,
  unit,
  canReverse,
  members,
  onClose,
}: {
  obligation: DuesOutstanding
  unit: string
  canReverse: boolean
  members: MemberRow[]
  onClose: () => void
}) {
  const { pending, run } = useAction()
  const [reverseTarget, setReverseTarget] = useState<DuesPayment | null>(null)
  const names = new Map(members.map((member) => [member.id, member.in_game_name]))

  const paymentsQuery = useQuery<DuesPayment[]>({
    queryKey: ['dues_payments', obligation.id],
    queryFn: async () =>
      unwrap(
        await db()
          .from('dues_payments')
          .select('*')
          .eq('obligation_id', obligation.id)
          .order('paid_at', { ascending: false }),
      ),
  })

  const payments = paymentsQuery.data ?? []
  const reversedIds = new Set(
    payments.filter((payment) => payment.reversal_of).map((payment) => payment.reversal_of as string),
  )

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={`ประวัติชำระ · ${obligation.in_game_name}`}
      description={`งวด ${formatDate(obligation.week_start)} · ยอด ${formatMoney(
        toNumber(obligation.amount_minor),
        unit,
      )}`}
      size="lg"
    >
      {paymentsQuery.isPending ? (
        <LoadingBlock />
      ) : paymentsQuery.isError ? (
        <ErrorBlock error={paymentsQuery.error} onRetry={() => void paymentsQuery.refetch()} />
      ) : payments.length === 0 ? (
        <p className="text-sm text-ink-muted">ยังไม่มีการชำระสำหรับรายการนี้</p>
      ) : (
        <TableShell>
          <thead>
            <tr>
              <TableHeadCell>เวลา</TableHeadCell>
              <TableHeadCell>ผู้บันทึก</TableHeadCell>
              <TableHeadCell numeric>ยอด</TableHeadCell>
              <TableHeadCell>หมายเหตุ</TableHeadCell>
              <TableHeadCell>จัดการ</TableHeadCell>
            </tr>
          </thead>
          <tbody>
            {payments.map((payment) => {
              const amount = toNumber(payment.amount_minor)
              const reversible =
                canReverse &&
                amount > 0 &&
                !payment.reversal_of &&
                !reversedIds.has(payment.id)
              return (
                <tr key={payment.id}>
                  <TableCell className="whitespace-nowrap text-xs text-ink-muted">
                    {formatDateTime(payment.paid_at)}
                  </TableCell>
                  <TableCell className="text-sm text-ink">
                    {names.get(payment.recorded_by) ?? '—'}
                  </TableCell>
                  <TableCell numeric>
                    <span className={amount < 0 ? 'text-rust' : 'text-moss'}>
                      {amount > 0 ? '+' : ''}
                      {formatMoney(amount, unit)}
                    </span>
                  </TableCell>
                  <TableCell className="max-w-[18rem] text-sm text-ink-muted">
                    {payment.note ?? '—'}
                    {payment.reversal_of ? ' · รายการกลับ' : ''}
                  </TableCell>
                  <TableCell>
                    {reversible ? (
                      <button
                        type="button"
                        onClick={() => setReverseTarget(payment)}
                        className="inline-flex min-h-[36px] items-center rounded-full border border-paper-dim px-3 text-xs font-medium text-ink hover:border-brass-deep"
                      >
                        แก้ไขย้อนหลัง
                      </button>
                    ) : (
                      <span className="text-xs text-ink-muted">—</span>
                    )}
                  </TableCell>
                </tr>
              )
            })}
          </tbody>
        </TableShell>
      )}

      <ConfirmDialog
        open={reverseTarget !== null}
        onOpenChange={(open) => !open && setReverseTarget(null)}
        title="ย้อนรายการชำระ"
        description={
          reverseTarget
            ? `ระบบจะลดยอดที่ชำระและเงินในแก๊งลง ${formatMoney(
                Math.abs(toNumber(reverseTarget.amount_minor)),
                unit,
              )} โดยไม่ลบประวัติเดิม`
            : ''
        }
        confirmLabel="ยืนยันย้อนรายการ"
        danger
        pending={pending}
        onConfirm={() => {
          void (async () => {
            if (!reverseTarget) return
            const success = await run(
              () =>
                callRpc('editor_reverse_dues_payment', {
                  p_payment_id: reverseTarget.id,
                  p_note: 'reversal from dues history',
                  p_key: newIdempotencyKey('dues-payment-reverse'),
                }),
              'ย้อนรายการชำระแล้ว',
            )
            if (success) setReverseTarget(null)
          })()
        }}
      />
    </Dialog>
  )
}
