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
  SubmitButton,
  TableCell,
  TableHeadCell,
  TableShell,
} from '@/components/ui'
import { callRpc, newIdempotencyKey } from '@/lib/api'
import { db, toNumber, unwrap } from '@/lib/db'
import { formatDateTime, formatMoney, formatNumber } from '@/lib/format'
import { useAction } from '@/lib/use-action'
import type {
  AppSettings,
  MemberRow,
  TreasuryCategory,
  TreasuryLedgerEntry,
} from '@/lib/types'
import { TREASURY_CATEGORY_LABELS } from '@/lib/types'

type BalanceRow = { id: boolean; balance_minor: number; updated_at: string }

const ADJUST_CATEGORIES: TreasuryCategory[] = [
  'story',
  'gang_expense',
  'agency_doctor',
  'agency_police',
  'agency_council',
  'agency_mechanic',
  'other',
]

export function TreasuryPage() {
  const { whoami } = useAuth()
  const role = whoami?.member?.site_role
  const canEdit = role === 'owner' || role === 'editor'
  const isOwner = role === 'owner'

  const [adjustOpen, setAdjustOpen] = useState(false)
  const [openingOpen, setOpeningOpen] = useState(false)
  const [reverseTarget, setReverseTarget] = useState<TreasuryLedgerEntry | null>(null)
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'in' | 'out'>('all')
  const { pending, run } = useAction()

  const settingsQuery = useQuery<AppSettings>({
    queryKey: ['app_settings'],
    queryFn: async () => unwrap(await db().from('app_settings').select('*').single()),
    staleTime: 5 * 60_000,
  })

  const balanceQuery = useQuery<BalanceRow>({
    queryKey: ['treasury_balance'],
    queryFn: async () => unwrap(await db().from('treasury_balance').select('*').single()),
  })

  const ledgerQuery = useQuery<TreasuryLedgerEntry[]>({
    queryKey: ['treasury_ledger'],
    queryFn: async () =>
      unwrap(
        await db()
          .from('treasury_ledger')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(150),
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

  const entries = useMemo(() => ledgerQuery.data ?? [], [ledgerQuery.data])
  const names = new Map((membersQuery.data ?? []).map((member) => [member.id, member.in_game_name]))
  const unit = settingsQuery.data?.currency_unit ?? 'เงินในเกม'
  const balance = toNumber(balanceQuery.data?.balance_minor)

  const filtered = useMemo(() => {
    if (categoryFilter === 'in') return entries.filter((entry) => toNumber(entry.amount_minor) > 0)
    if (categoryFilter === 'out') return entries.filter((entry) => toNumber(entry.amount_minor) < 0)
    return entries
  }, [entries, categoryFilter])

  const reversedIds = new Set(
    entries.filter((entry) => entry.correction_of).map((entry) => entry.correction_of as string),
  )

  if (balanceQuery.isPending || settingsQuery.isPending) return <LoadingBlock />
  if (balanceQuery.isError || settingsQuery.isError) {
    return (
      <ErrorBlock
        error={balanceQuery.error ?? settingsQuery.error}
        onRetry={() => {
          void balanceQuery.refetch()
          void settingsQuery.refetch()
        }}
      />
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="บัญชีกลาง"
        title="การเงินแก๊ง"
        description="ทุกยอดที่รับเข้าหรือจ่ายออกต้องมีที่มาและผู้บันทึก ยอดติดลบทำได้เฉพาะการกลับรายการที่ตรวจสอบแล้ว"
        actions={
          <>
            {isOwner && entries.length === 0 ? (
              <button type="button" className="pill pill-quiet" onClick={() => setOpeningOpen(true)}>
                ตั้งยอดยกมา
              </button>
            ) : null}
            {canEdit ? (
              <button type="button" className="pill pill-primary" onClick={() => setAdjustOpen(true)}>
                บันทึกรับ–จ่าย
              </button>
            ) : null}
          </>
        }
      />

      <PaperPanel>
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="t-label text-ink-muted">เงินในแก๊งคงเหลือ</p>
            <p className="t-numeral mt-2 text-3xl text-ink">{formatMoney(balance, unit)}</p>
            <p className="mt-2 text-sm text-ink-muted">
              อัปเดตล่าสุด {formatDateTime(balanceQuery.data?.updated_at)}
            </p>
          </div>
          <div className="max-w-sm text-sm leading-relaxed text-ink-muted">
            ตัวเลขนี้มาจากบัญชีแยกประเภทเดียวกับที่ใช้ตรวจย้อนหลัง การแก้ไขทุกครั้งจะสร้างรายการใหม่
            ไม่เขียนทับรายการเดิม
          </div>
        </div>
      </PaperPanel>

      <PaperPanel padded={false}>
        <div className="flex flex-wrap items-end justify-between gap-3 p-5 sm:p-6">
          <SectionTitle title="บัญชีแยกประเภท" description="150 รายการล่าสุด" />
          <div className="flex flex-wrap gap-2" role="group" aria-label="กรองรายการเงิน">
            {(
              [
                ['all', 'ทั้งหมด'],
                ['in', 'รับเข้า'],
                ['out', 'จ่ายออก'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setCategoryFilter(value)}
                className={
                  categoryFilter === value
                    ? 'pill min-h-[40px] bg-brass px-4 text-sm text-ground'
                    : 'pill min-h-[40px] border border-paper-dim px-4 text-sm text-ink'
                }
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {ledgerQuery.isPending ? (
          <div className="px-5 pb-5 sm:px-6">
            <LoadingBlock />
          </div>
        ) : ledgerQuery.isError ? (
          <div className="px-5 pb-5 sm:px-6">
            <ErrorBlock error={ledgerQuery.error} onRetry={() => void ledgerQuery.refetch()} />
          </div>
        ) : entries.length === 0 ? (
          <div className="px-5 pb-6 sm:px-6">
            <EmptyState
              title="ยังไม่มียอดเงินในแก๊ง"
              description="เจ้าของระบบต้องตั้งยอดยกมาครั้งแรกก่อน จากนั้นจึงบันทึกการรับ–จ่ายได้"
              action={
                isOwner ? (
                  <button type="button" className="pill bg-brass text-ground" onClick={() => setOpeningOpen(true)}>
                    ตั้งยอดยกมา
                  </button>
                ) : null
              }
            />
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-5 pb-6 sm:px-6">
            <p className="text-sm text-ink-muted">ไม่มีรายการในตัวกรองนี้</p>
          </div>
        ) : (
          <TableShell>
            <thead>
              <tr>
                <TableHeadCell>เวลา</TableHeadCell>
                <TableHeadCell>ประเภท</TableHeadCell>
                <TableHeadCell>ผู้เกี่ยวข้อง</TableHeadCell>
                <TableHeadCell>หมายเหตุ</TableHeadCell>
                <TableHeadCell numeric>จำนวน</TableHeadCell>
                <TableHeadCell numeric>คงเหลือ</TableHeadCell>
                <TableHeadCell>จัดการ</TableHeadCell>
              </tr>
            </thead>
            <tbody>
              {filtered.map((entry) => {
                const amount = toNumber(entry.amount_minor)
                const reversible =
                  canEdit &&
                  !entry.correction_of &&
                  !reversedIds.has(entry.id) &&
                  !entry.linked_inventory_ledger_id &&
                  !['dues', 'opening'].includes(entry.category)
                return (
                  <tr key={entry.id}>
                    <TableCell className="whitespace-nowrap text-xs text-ink-muted">
                      {formatDateTime(entry.created_at)}
                    </TableCell>
                    <TableCell className="text-sm">
                      {TREASURY_CATEGORY_LABELS[entry.category]}
                    </TableCell>
                    <TableCell className="text-sm text-ink-muted">
                      {entry.subject_member_id ? (names.get(entry.subject_member_id) ?? '—') : '—'}
                    </TableCell>
                    <TableCell className="max-w-[18rem] text-sm text-ink-muted">
                      {entry.note ?? '—'}
                      {entry.correction_of ? ' · รายการแก้ไข' : ''}
                    </TableCell>
                    <TableCell numeric>
                      <span className={amount < 0 ? 'text-rust' : 'text-moss'}>
                        {amount > 0 ? '+' : ''}
                        {formatMoney(amount, unit)}
                      </span>
                    </TableCell>
                    <TableCell numeric>{formatNumber(toNumber(entry.balance_after))}</TableCell>
                    <TableCell>
                      {reversible ? (
                        <button
                          type="button"
                          onClick={() => setReverseTarget(entry)}
                          className="inline-flex min-h-[36px] items-center rounded-full border border-paper-dim px-3 text-xs font-medium text-ink hover:border-brass-deep"
                        >
                          แก้ไขย้อนหลัง
                        </button>
                      ) : entry.category === 'dues' ? (
                        <span className="text-xs text-ink-muted">ย้อนที่หน้าค่าหัว</span>
                      ) : entry.linked_inventory_ledger_id ? (
                        <span className="text-xs text-ink-muted">ย้อนที่คลังของ</span>
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
      </PaperPanel>

      {adjustOpen ? (
        <AdjustDialog
          unit={unit}
          members={membersQuery.data ?? []}
          onClose={() => setAdjustOpen(false)}
        />
      ) : null}

      {openingOpen ? <OpeningDialog onClose={() => setOpeningOpen(false)} unit={unit} /> : null}

      <ConfirmDialog
        open={reverseTarget !== null}
        onOpenChange={(open) => !open && setReverseTarget(null)}
        title="แก้ไขย้อนหลัง"
        description={
          reverseTarget
            ? `ระบบจะสร้างรายการกลับรายการ ${formatMoney(Math.abs(toNumber(reverseTarget.amount_minor)), unit)} ไม่ลบประวัติเดิม`
            : ''
        }
        confirmLabel="ยืนยันแก้ไข"
        danger
        pending={pending}
        onConfirm={() => {
          void (async () => {
            if (!reverseTarget) return
            const success = await run(
              () =>
                callRpc('treasury_reverse', {
                  p_ledger_id: reverseTarget.id,
                  p_note: 'reversal from treasury page',
                  p_key: newIdempotencyKey('treasury-reverse'),
                }),
              'สร้างรายการกลับรายการแล้ว',
            )
            if (success) setReverseTarget(null)
          })()
        }}
      />
    </div>
  )
}

function AdjustDialog({
  unit,
  members,
  onClose,
}: {
  unit: string
  members: MemberRow[]
  onClose: () => void
}) {
  const { pending, run } = useAction()
  const [direction, setDirection] = useState<'in' | 'out'>('in')
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState<TreasuryCategory>('other')
  const [subject, setSubject] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    const value = Number(amount)
    if (!Number.isInteger(value) || value <= 0) {
      setError('จำนวนเงินต้องเป็นจำนวนเต็มมากกว่า 0')
      return
    }
    const success = await run(
      () =>
        callRpc('treasury_adjust', {
          p_amount_minor: direction === 'in' ? value : -value,
          p_category: category,
          p_subject_member_id: subject || null,
          p_note: note.trim() || null,
          p_key: newIdempotencyKey('treasury-adjust'),
        }),
      'บันทึกการเงินแล้ว',
    )
    if (success) onClose()
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()} title="บันทึกรับ–จ่าย">
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-2 sm:grid-cols-2" role="group" aria-label="ทิศทางการเงิน">
          {(['in', 'out'] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setDirection(option)}
              className={
                direction === option
                  ? 'pill bg-brass text-ground'
                  : 'pill border border-paper-dim text-ink'
              }
            >
              {option === 'in' ? 'รับเข้า' : 'จ่ายออก'}
            </button>
          ))}
        </div>

        <Field label="จำนวนเงิน" htmlFor="cash-amount" hint={unit} required>
          <input
            id="cash-amount"
            className="field numeral"
            inputMode="numeric"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="ประเภท" htmlFor="treasury-category">
            <select
              id="treasury-category"
              className="field"
              value={category}
              onChange={(event) => setCategory(event.target.value as TreasuryCategory)}
            >
              {ADJUST_CATEGORIES.map((option) => (
                <option key={option} value={option}>
                  {TREASURY_CATEGORY_LABELS[option]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="สมาชิกที่เกี่ยวข้อง" htmlFor="treasury-subject" hint="ไม่บังคับ">
            <select
              id="treasury-subject"
              className="field"
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
            >
              <option value="">ไม่ระบุ</option>
              {members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.in_game_name}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="หมายเหตุ" htmlFor="treasury-note" hint="อธิบายให้คนตรวจย้อนหลังเข้าใจ">
          <input
            id="treasury-note"
            className="field"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            maxLength={500}
          />
        </Field>

        {error ? <InlineError>{error}</InlineError> : null}
        <FormActions pending={pending} onCancel={onClose}>
          <SubmitButton pending={pending}>บันทึก</SubmitButton>
        </FormActions>
      </form>
    </Dialog>
  )
}

function OpeningDialog({ onClose, unit }: { onClose: () => void; unit: string }) {
  const { pending, run } = useAction()
  const [amount, setAmount] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    const value = Number(amount)
    if (!Number.isInteger(value) || value <= 0) {
      setError('ยอดยกมาต้องเป็นจำนวนเต็มมากกว่า 0')
      return
    }
    const success = await run(
      () =>
        callRpc('owner_set_opening_balance', {
          p_amount_minor: value,
          p_key: newIdempotencyKey('treasury-opening'),
        }),
      'ตั้งยอดยกมาแล้ว',
    )
    if (success) onClose()
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title="ตั้งยอดยกมา"
      description="ทำได้ครั้งเดียวเมื่อยังไม่มีรายการเงินใด ๆ"
      size="sm"
    >
      <form onSubmit={submit} className="space-y-4">
        <Field label="ยอดยกมา" htmlFor="opening-amount" hint={unit} required>
          <input
            id="opening-amount"
            className="field numeral"
            inputMode="numeric"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
          />
        </Field>
        {error ? <InlineError>{error}</InlineError> : null}
        <FormActions pending={pending} onCancel={onClose}>
          <SubmitButton pending={pending}>ยืนยันยอดยกมา</SubmitButton>
        </FormActions>
      </form>
    </Dialog>
  )
}
