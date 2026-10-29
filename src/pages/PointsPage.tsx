import { useQuery } from '@tanstack/react-query'
import { useMemo, useState, type FormEvent, type ReactNode } from 'react'
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
import { formatDateTime, formatNumber } from '@/lib/format'
import { useAction } from '@/lib/use-action'
import type { MemberRow, PointAccount, PointLedgerEntry } from '@/lib/types'

type PointDialog =
  | { type: 'adjust'; account: PointAccount }
  | { type: 'history'; account: PointAccount }
  | null

export function PointsPage() {
  const { whoami } = useAuth()
  const role = whoami?.member?.site_role
  const canEdit = role === 'owner' || role === 'editor'

  const [dialog, setDialog] = useState<PointDialog>(null)
  const [kindFilter, setKindFilter] = useState<'all' | 'gang' | 'personal'>('all')

  const accountsQuery = useQuery<PointAccount[]>({
    queryKey: ['point_overview'],
    queryFn: async () =>
      unwrap(await db().from('point_overview').select('*').order('kind', { ascending: true })),
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

  const accounts = useMemo(() => accountsQuery.data ?? [], [accountsQuery.data])
  const members = membersQuery.data ?? []

  const filtered = useMemo(() => {
    return accounts.filter((account) => kindFilter === 'all' || account.kind === kindFilter)
  }, [accounts, kindFilter])

  const gangTotal = accounts
    .filter((account) => account.kind === 'gang')
    .reduce((sum, account) => sum + toNumber(account.balance), 0)
  const personalTotal = accounts
    .filter((account) => account.kind === 'personal')
    .reduce((sum, account) => sum + toNumber(account.balance), 0)

  if (accountsQuery.isPending) return <LoadingBlock />
  if (accountsQuery.isError) {
    return (
      <ErrorBlock error={accountsQuery.error} onRetry={() => void accountsQuery.refetch()} />
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="แต้ม"
        title="แต้มแก๊งและแต้มส่วนตัว"
        description="แต้มแก๊งและแต้มส่วนตัวแยกจากกันโดยสิ้นเชิง ไม่มีการโอนหรือแลกเปลี่ยนระหว่างบัญชี"
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <PaperPanel>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="t-label text-ink-muted">แต้มแก๊ง</p>
              <p className="t-numeral mt-2 text-3xl text-ink">{formatNumber(gangTotal)}</p>
            </div>
            <StatusChip tone="warn">ใช้ร่วมกัน</StatusChip>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-ink-muted">
            แต้มของแก๊งใช้กับกิจกรรมส่วนรวม และไม่สามารถโอนเข้าบัญชีสมาชิก
          </p>
        </PaperPanel>
        <PaperPanel>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="t-label text-ink-muted">แต้มส่วนตัวรวม</p>
              <p className="t-numeral mt-2 text-3xl text-ink">{formatNumber(personalTotal)}</p>
            </div>
            <StatusChip tone="neutral">แยกบัญชี</StatusChip>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-ink-muted">
            แต่ละคนมีบัญชีของตัวเอง ยอดรวมนี้เป็นผลรวมเพื่อดูภาพรวมเท่านั้น ไม่ใช่กองกลาง
          </p>
        </PaperPanel>
      </div>

      <PaperPanel padded={false}>
        <div className="flex flex-wrap items-end justify-between gap-3 p-5 sm:p-6">
          <SectionTitle
            title="บัญชีแต้ม"
            description="ทุกการปรับมีเหตุผล ผู้บันทึก และประวัติย้อนหลัง"
          />
          <div className="flex flex-wrap gap-2" role="group" aria-label="กรองประเภทบัญชี">
            {(
              [
                ['all', 'ทั้งหมด'],
                ['gang', 'แต้มแก๊ง'],
                ['personal', 'แต้มส่วนตัว'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setKindFilter(value)}
                className={
                  kindFilter === value
                    ? 'pill min-h-[40px] bg-brass px-4 text-sm text-ground'
                    : 'pill min-h-[40px] border border-paper-dim px-4 text-sm text-ink'
                }
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="px-5 pb-6 sm:px-6">
            <EmptyState
              title="ไม่พบบัญชีแต้มในตัวกรองนี้"
              description="บัญชีแต้มแก๊งมีอยู่เสมอ ส่วนบัญชีส่วนตัวจะแสดงเมื่อมีสมาชิกในระบบ"
            />
          </div>
        ) : (
          <TableShell>
            <thead>
              <tr>
                <TableHeadCell>บัญชี</TableHeadCell>
                <TableHeadCell>ประเภท</TableHeadCell>
                <TableHeadCell numeric>คงเหลือ</TableHeadCell>
                <TableHeadCell>อัปเดตล่าสุด</TableHeadCell>
                <TableHeadCell>จัดการ</TableHeadCell>
              </tr>
            </thead>
            <tbody>
              {filtered.map((account) => (
                <tr key={account.account_id}>
                  <TableCell>
                    <p className="font-medium text-ink">
                      {account.kind === 'gang' ? 'แต้มแก๊ง' : (account.in_game_name ?? 'ไม่พบชื่อ')}
                    </p>
                    {account.kind === 'personal' ? (
                      <p className="mt-0.5 text-xs text-ink-muted">บัญชีส่วนตัว</p>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <StatusChip tone={account.kind === 'gang' ? 'warn' : 'neutral'}>
                      {account.kind === 'gang' ? 'แก๊ง' : 'ส่วนตัว'}
                    </StatusChip>
                  </TableCell>
                  <TableCell numeric>
                    <span className="text-lg font-semibold">{formatNumber(account.balance)}</span>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-xs text-ink-muted">
                    {formatDateTime(account.updated_at)}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-2">
                      {canEdit ? (
                        <RowButton onClick={() => setDialog({ type: 'adjust', account })}>
                          ปรับแต้ม
                        </RowButton>
                      ) : null}
                      <RowButton onClick={() => setDialog({ type: 'history', account })}>
                        ประวัติ
                      </RowButton>
                    </div>
                  </TableCell>
                </tr>
              ))}
            </tbody>
          </TableShell>
        )}
      </PaperPanel>

      {dialog?.type === 'adjust' ? (
        <AdjustPointsDialog
          account={dialog.account}
          members={members}
          onClose={() => setDialog(null)}
        />
      ) : null}
      {dialog?.type === 'history' ? (
        <PointHistoryDialog
          account={dialog.account}
          members={members}
          canReverse={canEdit}
          onClose={() => setDialog(null)}
        />
      ) : null}
    </div>
  )
}

function RowButton({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex min-h-[36px] items-center rounded-full border border-paper-dim px-3 text-xs font-medium text-ink hover:border-brass-deep"
    >
      {children}
    </button>
  )
}

function AdjustPointsDialog({
  account,
  members,
  onClose,
}: {
  account: PointAccount
  members: MemberRow[]
  onClose: () => void
}) {
  const { pending, run } = useAction()
  const [direction, setDirection] = useState<'in' | 'out'>('in')
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [subject, setSubject] = useState(account.member_id ?? '')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)

  const label = account.kind === 'gang' ? 'แต้มแก๊ง' : (account.in_game_name ?? 'แต้มส่วนตัว')

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    const value = Number(amount)
    if (!Number.isInteger(value) || value <= 0) {
      setError('จำนวนแต้มต้องเป็นจำนวนเต็มมากกว่า 0')
      return
    }
    if (account.kind === 'gang' && !reason.trim()) {
      setError('กรอกเหตุผลของการปรับแต้มแก๊ง')
      return
    }
    if (!reason.trim()) {
      setError('กรอกเหตุผลของการปรับแต้ม')
      return
    }
    const delta = direction === 'in' ? value : -value
    if (toNumber(account.balance) + delta < 0) {
      setError('แต้มคงเหลือไม่พอสำหรับการหัก')
      return
    }
    const success = await run(
      () =>
        callRpc('editor_adjust_points', {
          p_account_id: account.account_id,
          p_delta: delta,
          p_reason: reason.trim(),
          p_subject_member_id: account.kind === 'personal' ? account.member_id : subject || null,
          p_note: note.trim() || null,
          p_key: newIdempotencyKey('points-adjust'),
        }),
      'ปรับแต้มแล้ว',
    )
    if (success) onClose()
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={`ปรับแต้ม · ${label}`}
      description={`คงเหลือปัจจุบัน ${formatNumber(account.balance)} แต้ม`}
    >
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-2 sm:grid-cols-2" role="group" aria-label="ทิศทางการปรับแต้ม">
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
              {option === 'in' ? 'เพิ่มแต้ม' : 'หักแต้ม'}
            </button>
          ))}
        </div>

        <Field label="จำนวนแต้ม" htmlFor="points-amount" required>
          <input
            id="points-amount"
            className="field numeral"
            inputMode="numeric"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
          />
        </Field>

        <Field label="เหตุผล" htmlFor="points-reason" required>
          <input
            id="points-reason"
            className="field"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={80}
            placeholder="เช่น เข้าร่วมกิจกรรม, ช่วยงานแก๊ง"
          />
        </Field>

        {account.kind === 'gang' ? (
          <Field
            label="สมาชิกที่เกี่ยวข้อง"
            htmlFor="points-subject"
            hint="ไม่บังคับ · บันทึกว่าแต้มนี้เกี่ยวกับใครในแก๊ง"
          >
            <select
              id="points-subject"
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
        ) : null}

        <Field label="หมายเหตุ" htmlFor="points-note" hint="ไม่บังคับ">
          <input
            id="points-note"
            className="field"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            maxLength={500}
          />
        </Field>

        {error ? <InlineError>{error}</InlineError> : null}
        <FormActions pending={pending} onCancel={onClose}>
          <SubmitButton pending={pending}>บันทึกการปรับ</SubmitButton>
        </FormActions>
      </form>
    </Dialog>
  )
}

function PointHistoryDialog({
  account,
  members,
  canReverse,
  onClose,
}: {
  account: PointAccount
  members: MemberRow[]
  canReverse: boolean
  onClose: () => void
}) {
  const { pending, run } = useAction()
  const [reverseTarget, setReverseTarget] = useState<PointLedgerEntry | null>(null)
  const names = new Map(members.map((member) => [member.id, member.in_game_name]))

  const ledgerQuery = useQuery<PointLedgerEntry[]>({
    queryKey: ['point_ledger', account.account_id],
    queryFn: async () =>
      unwrap(
        await db()
          .from('point_ledger')
          .select('*')
          .eq('account_id', account.account_id)
          .order('created_at', { ascending: false })
          .limit(100),
      ),
  })

  const entries = ledgerQuery.data ?? []
  const reversedIds = new Set(
    entries.filter((entry) => entry.correction_of).map((entry) => entry.correction_of as string),
  )

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={`ประวัติแต้ม · ${account.kind === 'gang' ? 'แต้มแก๊ง' : (account.in_game_name ?? '')}`}
      description="100 รายการล่าสุด เรียงจากใหม่ไปเก่า"
      size="lg"
    >
      {ledgerQuery.isPending ? (
        <LoadingBlock />
      ) : ledgerQuery.isError ? (
        <ErrorBlock error={ledgerQuery.error} onRetry={() => void ledgerQuery.refetch()} />
      ) : entries.length === 0 ? (
        <p className="text-sm text-ink-muted">ยังไม่มีการปรับแต้มของบัญชีนี้</p>
      ) : (
        <TableShell>
          <thead>
            <tr>
              <TableHeadCell>เวลา</TableHeadCell>
              <TableHeadCell>เหตุผล</TableHeadCell>
              <TableHeadCell>ผู้บันทึก</TableHeadCell>
              <TableHeadCell>เกี่ยวข้องกับ</TableHeadCell>
              <TableHeadCell numeric>เปลี่ยน</TableHeadCell>
              <TableHeadCell numeric>คงเหลือ</TableHeadCell>
              <TableHeadCell>จัดการ</TableHeadCell>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => {
              const delta = toNumber(entry.delta)
              const reversible =
                canReverse && !entry.correction_of && !reversedIds.has(entry.id)
              return (
                <tr key={entry.id}>
                  <TableCell className="whitespace-nowrap text-xs text-ink-muted">
                    {formatDateTime(entry.created_at)}
                  </TableCell>
                  <TableCell className="text-sm text-ink">
                    {entry.reason}
                    {entry.note ? (
                      <p className="mt-0.5 text-xs text-ink-muted">{entry.note}</p>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-sm text-ink-muted">
                    {names.get(entry.actor_member_id) ?? '—'}
                  </TableCell>
                  <TableCell className="text-sm text-ink-muted">
                    {entry.subject_member_id ? (names.get(entry.subject_member_id) ?? '—') : '—'}
                  </TableCell>
                  <TableCell numeric>
                    <span className={delta < 0 ? 'text-rust' : 'text-moss'}>
                      {delta > 0 ? '+' : ''}
                      {formatNumber(delta)}
                    </span>
                  </TableCell>
                  <TableCell numeric>{formatNumber(entry.balance_after)}</TableCell>
                  <TableCell>
                    {reversible ? (
                      <button
                        type="button"
                        onClick={() => setReverseTarget(entry)}
                        className="inline-flex min-h-[36px] items-center rounded-full border border-paper-dim px-3 text-xs font-medium text-ink hover:border-brass-deep"
                      >
                        แก้ไขย้อนหลัง
                      </button>
                    ) : (
                      <span className="text-xs text-ink-muted">
                        {entry.correction_of ? 'รายการกลับ' : '—'}
                      </span>
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
        title="ย้อนรายการแต้ม"
        description={
          reverseTarget
            ? `ระบบจะสร้างรายการกลับ ${formatNumber(-toNumber(reverseTarget.delta))} แต้ม และคงประวัติเดิมไว้`
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
                callRpc('editor_reverse_points', {
                  p_ledger_id: reverseTarget.id,
                  p_reason: 'reversal from points history',
                  p_key: newIdempotencyKey('points-reverse'),
                }),
              'ย้อนรายการแต้มแล้ว',
            )
            if (success) setReverseTarget(null)
          })()
        }}
      />
    </Dialog>
  )
}
