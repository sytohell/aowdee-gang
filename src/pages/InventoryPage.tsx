import { useQuery } from '@tanstack/react-query'
import { useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { useAuth } from '@/auth/AuthProvider'
import {
  Dialog,
  EmptyState,
  ErrorBlock,
  Field,
  FormActions,
  InlineError,
  LoadingBlock,
  PageHeader,
  PaperPanel,
  StatusChip,
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
  InventoryBalance,
  InventoryClass,
  InventoryItem,
  InventoryLedgerEntry,
  InventoryReason,
  MemberRow,
} from '@/lib/types'
import { INVENTORY_CLASS_LABELS, INVENTORY_REASON_LABELS } from '@/lib/types'

type DialogState =
  | { type: 'item'; item?: InventoryItem }
  | { type: 'adjust'; item: InventoryItem; quantity: number }
  | { type: 'purchase'; item: InventoryItem; quantity: number }
  | { type: 'sale'; item: InventoryItem; quantity: number }
  | { type: 'initial'; item: InventoryItem }
  | { type: 'history'; item: InventoryItem }
  | null

const MOVEMENT_REASONS: InventoryReason[] = [
  'gang_shop',
  'story',
  'air_drop',
  'robbery',
  'supply',
  'trade',
  'gang_activity',
  'other',
]

export function InventoryPage() {
  const { whoami } = useAuth()
  const role = whoami?.member?.site_role
  const canEdit = role === 'owner' || role === 'editor'
  const isOwner = role === 'owner'

  const [dialog, setDialog] = useState<DialogState>(null)
  const [filter, setFilter] = useState<'all' | InventoryClass>('all')
  const [search, setSearch] = useState('')

  const itemsQuery = useQuery<InventoryItem[]>({
    queryKey: ['inventory_items'],
    queryFn: async () =>
      unwrap(await db().from('inventory_items').select('*').order('name', { ascending: true })),
  })

  const balancesQuery = useQuery<InventoryBalance[]>({
    queryKey: ['inventory_balances'],
    queryFn: async () => unwrap(await db().from('inventory_balances').select('*')),
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

  const settingsQuery = useQuery<AppSettings>({
    queryKey: ['app_settings'],
    queryFn: async () => unwrap(await db().from('app_settings').select('*').single()),
    staleTime: 5 * 60_000,
  })

  const ledgerItemIdsQuery = useQuery<string[]>({
    queryKey: ['inventory_ledger_item_ids'],
    queryFn: async () => {
      const rows = await unwrap<Array<{ item_id: string }>>(
        await db().from('inventory_ledger').select('item_id'),
      )
      return Array.from(new Set(rows.map((row) => row.item_id)))
    },
    enabled: canEdit,
  })

  const items = useMemo(() => itemsQuery.data ?? [], [itemsQuery.data])
  const balances = new Map(
    (balancesQuery.data ?? []).map((balance) => [balance.item_id, toNumber(balance.quantity)]),
  )
  const ledgerItemIds = new Set(ledgerItemIdsQuery.data ?? [])
  const unit = settingsQuery.data?.currency_unit ?? 'เงินในเกม'

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return items.filter((item) => {
      if (filter !== 'all' && item.inventory_class !== filter) return false
      if (needle && !item.name.toLowerCase().includes(needle)) return false
      return true
    })
  }, [items, filter, search])

  const loading = itemsQuery.isPending || balancesQuery.isPending
  const error = itemsQuery.error ?? balancesQuery.error

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="คลังกลาง"
        title="คลังของ"
        description="ทุกความเคลื่อนไหวถูกบันทึกเป็นรายการบัญชี แก้ไขย้อนหลังได้ด้วยรายการกลับรายการเท่านั้น"
        actions={
          canEdit ? (
            <button type="button" className="pill pill-primary" onClick={() => setDialog({ type: 'item' })}>
              เพิ่มรายการของ
            </button>
          ) : null
        }
      />

      <PaperPanel padded={false}>
        <div className="flex flex-wrap items-end justify-between gap-3 p-5 sm:p-6">
          <div className="w-full max-w-xs">
            <label htmlFor="inventory-search" className="t-label block text-ink">
              ค้นหาของ
            </label>
            <input
              id="inventory-search"
              className="field mt-1.5"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="ชื่อของ"
            />
          </div>
          <div className="flex flex-wrap gap-2" role="group" aria-label="กรองประเภทของ">
            {(['all', 'general', 'fighting'] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setFilter(option)}
                className={
                  filter === option
                    ? 'pill min-h-[40px] bg-brass px-4 text-sm text-ground'
                    : 'pill min-h-[40px] border border-paper-dim px-4 text-sm text-ink'
                }
              >
                {option === 'all' ? 'ทั้งหมด' : INVENTORY_CLASS_LABELS[option]}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="px-5 pb-5 sm:px-6">
            <LoadingBlock />
          </div>
        ) : error ? (
          <div className="px-5 pb-5 sm:px-6">
            <ErrorBlock
              error={error}
              onRetry={() => {
                void itemsQuery.refetch()
                void balancesQuery.refetch()
              }}
            />
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-5 pb-6 sm:px-6">
            <EmptyState
              title={items.length === 0 ? 'ยังไม่มีรายการของในคลัง' : 'ไม่พบของที่ตรงกับเงื่อนไข'}
              description={
                items.length === 0
                  ? 'เริ่มจากเพิ่มชื่อของที่แก๊งใช้จริง แล้วเจ้าของจึงตั้งยอดยกมาครั้งแรก'
                  : 'ลองล้างคำค้นหาหรือเปลี่ยนตัวกรองประเภท'
              }
              action={
                canEdit && items.length === 0 ? (
                  <button type="button" className="pill bg-brass text-ground" onClick={() => setDialog({ type: 'item' })}>
                    เพิ่มรายการแรก
                  </button>
                ) : null
              }
            />
          </div>
        ) : (
          <TableShell>
            <thead>
              <tr>
                <TableHeadCell>ของ</TableHeadCell>
                <TableHeadCell>ประเภท</TableHeadCell>
                <TableHeadCell numeric>คงเหลือ</TableHeadCell>
                <TableHeadCell>หน่วย</TableHeadCell>
                <TableHeadCell>จัดการ</TableHeadCell>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => {
                const quantity = balances.get(item.id) ?? 0
                const hasLedger = ledgerItemIds.has(item.id)
                return (
                  <tr key={item.id}>
                    <TableCell>
                      <p className="font-medium text-ink">{item.name}</p>
                    </TableCell>
                    <TableCell>
                      <StatusChip tone={item.inventory_class === 'fighting' ? 'warn' : 'neutral'}>
                        {INVENTORY_CLASS_LABELS[item.inventory_class]}
                      </StatusChip>
                    </TableCell>
                    <TableCell numeric>
                      <span className="text-lg font-semibold">{formatNumber(quantity)}</span>
                    </TableCell>
                    <TableCell className="text-sm text-ink-muted">{item.unit}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-2">
                        {canEdit ? (
                          <>
                            <RowButton onClick={() => setDialog({ type: 'adjust', item, quantity })}>
                              ปรับ
                            </RowButton>
                            <RowButton onClick={() => setDialog({ type: 'purchase', item, quantity })}>
                              ซื้อเข้า
                            </RowButton>
                            <RowButton onClick={() => setDialog({ type: 'sale', item, quantity })}>
                              ขายออก
                            </RowButton>
                            {isOwner && !hasLedger ? (
                              <RowButton onClick={() => setDialog({ type: 'initial', item })}>
                                ตั้งยอดยกมา
                              </RowButton>
                            ) : null}
                            <RowButton onClick={() => setDialog({ type: 'item', item })}>แก้ไข</RowButton>
                          </>
                        ) : null}
                        <RowButton onClick={() => setDialog({ type: 'history', item })}>ประวัติ</RowButton>
                      </div>
                    </TableCell>
                  </tr>
                )
              })}
            </tbody>
          </TableShell>
        )}
      </PaperPanel>

      {dialog?.type === 'item' ? (
        <ItemDialog item={dialog.item} onClose={() => setDialog(null)} />
      ) : null}
      {dialog?.type === 'adjust' ? (
        <AdjustDialog item={dialog.item} onClose={() => setDialog(null)} members={membersQuery.data ?? []} />
      ) : null}
      {dialog?.type === 'purchase' || dialog?.type === 'sale' ? (
        <TradeDialog
          mode={dialog.type}
          item={dialog.item}
          unit={unit}
          onClose={() => setDialog(null)}
          members={membersQuery.data ?? []}
        />
      ) : null}
      {dialog?.type === 'initial' ? (
        <InitialStockDialog item={dialog.item} onClose={() => setDialog(null)} />
      ) : null}
      {dialog?.type === 'history' ? (
        <HistoryDialog
          item={dialog.item}
          canReverse={canEdit}
          onClose={() => setDialog(null)}
          members={membersQuery.data ?? []}
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

function ItemDialog({ item, onClose }: { item?: InventoryItem; onClose: () => void }) {
  const { pending, run } = useAction()
  const [name, setName] = useState(item?.name ?? '')
  const [inventoryClass, setInventoryClass] = useState<InventoryClass>(item?.inventory_class ?? 'general')
  const [unit, setUnit] = useState(item?.unit ?? 'ชิ้น')
  const [error, setError] = useState<string | null>(null)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    if (!name.trim()) {
      setError('กรอกชื่อของ')
      return
    }
    const success = await run(
      () =>
        callRpc('editor_upsert_item', {
          p_item_id: item?.id ?? null,
          p_name: name.trim(),
          p_inventory_class: inventoryClass,
          p_unit: unit.trim() || 'ชิ้น',
          p_key: newIdempotencyKey('item-save'),
        }),
      item ? 'บันทึกชื่อของแล้ว' : 'เพิ่มรายการของแล้ว',
    )
    if (success) onClose()
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()} title={item ? 'แก้ไขรายการของ' : 'เพิ่มรายการของ'}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="ชื่อของ" htmlFor="item-name" required>
          <input id="item-name" className="field" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="ประเภท" htmlFor="item-class">
            <select
              id="item-class"
              className="field"
              value={inventoryClass}
              onChange={(e) => setInventoryClass(e.target.value as InventoryClass)}
            >
              <option value="general">ของทั่วไป</option>
              <option value="fighting">ของสำหรับ Fighting</option>
            </select>
          </Field>
          <Field label="หน่วยนับ" htmlFor="item-unit">
            <input id="item-unit" className="field" value={unit} onChange={(e) => setUnit(e.target.value)} maxLength={16} />
          </Field>
        </div>
        {item ? null : (
          <p className="rounded-control border border-paper-dim bg-[#fbf9f2] p-3 text-sm text-ink-muted">
            ยอดคงเหลือจะเริ่มที่ 0 และเจ้าของต้องตั้งยอดยกมาครั้งแรกก่อนจึงจะปรับได้
          </p>
        )}
        {error ? <InlineError>{error}</InlineError> : null}
        <FormActions pending={pending} onCancel={onClose}>
          <SubmitButton pending={pending}>{item ? 'บันทึก' : 'เพิ่มของ'}</SubmitButton>
        </FormActions>
      </form>
    </Dialog>
  )
}

function MemberSelect({
  members,
  value,
  onChange,
}: {
  members: MemberRow[]
  value: string
  onChange: (next: string) => void
}) {
  return (
    <Field label="สมาชิกที่เกี่ยวข้อง" htmlFor="subject-member" hint="ไม่บังคับ">
      <select id="subject-member" className="field" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">ไม่ระบุ</option>
        {members.map((member) => (
          <option key={member.id} value={member.id}>
            {member.in_game_name} · {member.slot_kind === 'main' ? `ช่อง ${member.slot_number}` : 'สำรอง'}
          </option>
        ))}
      </select>
    </Field>
  )
}

function ReasonSelect({
  value,
  onChange,
  id,
}: {
  value: InventoryReason
  onChange: (next: InventoryReason) => void
  id: string
}) {
  return (
    <Field label="เหตุผล" htmlFor={id}>
      <select id={id} className="field" value={value} onChange={(e) => onChange(e.target.value as InventoryReason)}>
        {MOVEMENT_REASONS.map((reason) => (
          <option key={reason} value={reason}>
            {INVENTORY_REASON_LABELS[reason]}
          </option>
        ))}
      </select>
    </Field>
  )
}

function AdjustDialog({
  item,
  onClose,
  members,
}: {
  item: InventoryItem
  onClose: () => void
  members: MemberRow[]
}) {
  const { pending, run } = useAction()
  const [direction, setDirection] = useState<'in' | 'out'>('in')
  const [quantity, setQuantity] = useState('1')
  const [reason, setReason] = useState<InventoryReason>('gang_shop')
  const [subject, setSubject] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    const amount = Number(quantity)
    if (!Number.isInteger(amount) || amount <= 0) {
      setError('จำนวนต้องเป็นจำนวนเต็มมากกว่า 0')
      return
    }
    const success = await run(
      () =>
        callRpc('inventory_adjust', {
          p_item_id: item.id,
          p_delta: direction === 'in' ? amount : -amount,
          p_reason: reason,
          p_subject_member_id: subject || null,
          p_note: note.trim() || null,
          p_key: newIdempotencyKey('inventory-adjust'),
        }),
      'ปรับสต็อกแล้ว',
    )
    if (success) onClose()
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()} title={`ปรับสต็อก · ${item.name}`}>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-2 sm:grid-cols-2" role="group" aria-label="ทิศทางการปรับ">
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
        <Field label="จำนวน" htmlFor="adjust-quantity" required>
          <input
            id="adjust-quantity"
            className="field numeral"
            inputMode="numeric"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <ReasonSelect id="adjust-reason" value={reason} onChange={setReason} />
          <MemberSelect members={members} value={subject} onChange={setSubject} />
        </div>
        <Field label="หมายเหตุ" htmlFor="adjust-note" hint="ไม่บังคับ">
          <input id="adjust-note" className="field" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
        </Field>
        {error ? <InlineError>{error}</InlineError> : null}
        <FormActions pending={pending} onCancel={onClose}>
          <SubmitButton pending={pending}>บันทึกการปรับ</SubmitButton>
        </FormActions>
      </form>
    </Dialog>
  )
}

function TradeDialog({
  mode,
  item,
  unit,
  onClose,
  members,
}: {
  mode: 'purchase' | 'sale'
  item: InventoryItem
  unit: string
  onClose: () => void
  members: MemberRow[]
}) {
  const { pending, run } = useAction()
  const [quantity, setQuantity] = useState('1')
  const [price, setPrice] = useState('')
  const [reason, setReason] = useState<InventoryReason>('gang_shop')
  const [subject, setSubject] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)

  const amount = Number(quantity)
  const priceNumber = Number(price)
  const total = Number.isFinite(amount * priceNumber) ? amount * priceNumber : 0

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    if (!Number.isInteger(amount) || amount <= 0) {
      setError('จำนวนต้องเป็นจำนวนเต็มมากกว่า 0')
      return
    }
    if (!Number.isInteger(priceNumber) || priceNumber <= 0) {
      setError('ราคาต่อหน่วยต้องเป็นจำนวนเต็มมากกว่า 0')
      return
    }
    const success = await run(
      () =>
        callRpc(mode === 'purchase' ? 'inventory_purchase' : 'inventory_sale', {
          p_item_id: item.id,
          p_quantity: amount,
          p_unit_price_minor: priceNumber,
          p_reason: reason,
          p_subject_member_id: subject || null,
          p_note: note.trim() || null,
          p_key: newIdempotencyKey(mode === 'purchase' ? 'inventory-purchase' : 'inventory-sale'),
        }),
      mode === 'purchase' ? 'ซื้อของเข้ากองแล้ว' : 'ขายของออกจากกองแล้ว',
    )
    if (success) onClose()
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={`${mode === 'purchase' ? 'ซื้อเข้า' : 'ขายออก'} · ${item.name}`}
      description="รายการนี้จะบันทึกทั้งสต็อกและเงินในแก๊งพร้อมกันในธุรกรรมเดียว"
    >
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="จำนวน" htmlFor="trade-quantity" required>
            <input
              id="trade-quantity"
              className="field numeral"
              inputMode="numeric"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
          </Field>
          <Field label="ราคาต่อหน่วย" htmlFor="trade-price" hint={unit} required>
            <input
              id="trade-price"
              className="field numeral"
              inputMode="numeric"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
          </Field>
        </div>
        <div className="rounded-control border border-paper-dim bg-[#fbf9f2] p-4">
          <p className="t-label text-ink-muted">ยอดรวม</p>
          <p className="numeral mt-1 text-xl text-ink">{formatMoney(total, unit)}</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <ReasonSelect id="trade-reason" value={reason} onChange={setReason} />
          <MemberSelect members={members} value={subject} onChange={setSubject} />
        </div>
        <Field label="หมายเหตุ" htmlFor="trade-note" hint="ไม่บังคับ">
          <input id="trade-note" className="field" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
        </Field>
        {error ? <InlineError>{error}</InlineError> : null}
        <FormActions pending={pending} onCancel={onClose}>
          <SubmitButton pending={pending}>
            {mode === 'purchase' ? 'ยืนยันการซื้อ' : 'ยืนยันการขาย'}
          </SubmitButton>
        </FormActions>
      </form>
    </Dialog>
  )
}

function InitialStockDialog({ item, onClose }: { item: InventoryItem; onClose: () => void }) {
  const { pending, run } = useAction()
  const [quantity, setQuantity] = useState('0')
  const [error, setError] = useState<string | null>(null)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    const amount = Number(quantity)
    if (!Number.isInteger(amount) || amount < 0) {
      setError('จำนวนต้องเป็น 0 หรือมากกว่า')
      return
    }
    const success = await run(
      () =>
        callRpc('owner_set_initial_stock', {
          p_item_id: item.id,
          p_quantity: amount,
          p_key: newIdempotencyKey('item-initial'),
        }),
      'ตั้งยอดยกมาแล้ว',
    )
    if (success) onClose()
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={`ตั้งยอดยกมา · ${item.name}`}
      description="ทำได้ครั้งเดียวต่อรายการ หลังตั้งแล้วต้องใช้การปรับหรือแก้ไขย้อนหลัง"
      size="sm"
    >
      <form onSubmit={submit} className="space-y-4">
        <Field label="จำนวนยกมา" htmlFor="initial-quantity" hint={item.unit} required>
          <input
            id="initial-quantity"
            className="field numeral"
            inputMode="numeric"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
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

function HistoryDialog({
  item,
  canReverse,
  onClose,
  members,
}: {
  item: InventoryItem
  canReverse: boolean
  onClose: () => void
  members: MemberRow[]
}) {
  const { pending, run } = useAction()
  const [reverseTarget, setReverseTarget] = useState<InventoryLedgerEntry | null>(null)
  const names = new Map(members.map((member) => [member.id, member.in_game_name]))

  const ledgerQuery = useQuery<InventoryLedgerEntry[]>({
    queryKey: ['inventory_ledger', item.id],
    queryFn: async () =>
      unwrap(
        await db()
          .from('inventory_ledger')
          .select('*')
          .eq('item_id', item.id)
          .order('created_at', { ascending: false })
          .limit(50),
      ),
  })

  const entries = ledgerQuery.data ?? []

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={`ประวัติ · ${item.name}`}
      description="50 รายการล่าสุด เรียงจากใหม่ไปเก่า"
      size="lg"
    >
      {ledgerQuery.isPending ? (
        <LoadingBlock />
      ) : ledgerQuery.isError ? (
        <ErrorBlock error={ledgerQuery.error} onRetry={() => void ledgerQuery.refetch()} />
      ) : entries.length === 0 ? (
        <p className="text-sm text-ink-muted">ยังไม่มีความเคลื่อนไหวของรายการนี้</p>
      ) : (
        <TableShell>
          <thead>
            <tr>
              <TableHeadCell>เวลา</TableHeadCell>
              <TableHeadCell>เหตุผล</TableHeadCell>
              <TableHeadCell>ผู้เกี่ยวข้อง</TableHeadCell>
              <TableHeadCell numeric>เปลี่ยน</TableHeadCell>
              <TableHeadCell numeric>คงเหลือ</TableHeadCell>
              <TableHeadCell>หมายเหตุ</TableHeadCell>
              <TableHeadCell>จัดการ</TableHeadCell>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => {
              const alreadyReversed = entries.some((candidate) => candidate.correction_of === entry.id)
              const reversible = canReverse && !entry.correction_of && !alreadyReversed
              return (
                <tr key={entry.id}>
                  <TableCell className="whitespace-nowrap text-xs text-ink-muted">
                    {formatDateTime(entry.created_at)}
                  </TableCell>
                  <TableCell className="text-sm">{INVENTORY_REASON_LABELS[entry.reason]}</TableCell>
                  <TableCell className="text-sm text-ink-muted">
                    {entry.subject_member_id ? (names.get(entry.subject_member_id) ?? '—') : '—'}
                  </TableCell>
                  <TableCell numeric>
                    <span className={toNumber(entry.delta) < 0 ? 'text-rust' : 'text-moss'}>
                      {toNumber(entry.delta) > 0 ? '+' : ''}
                      {formatNumber(entry.delta)}
                    </span>
                  </TableCell>
                  <TableCell numeric>{formatNumber(entry.balance_after)}</TableCell>
                  <TableCell className="max-w-[16rem] text-sm text-ink-muted">
                    {entry.note ?? '—'}
                    {entry.correction_of ? ' · รายการแก้ไข' : ''}
                  </TableCell>
                  <TableCell>
                    {reversible ? (
                      <RowButton onClick={() => setReverseTarget(entry)}>แก้ไขย้อนหลัง</RowButton>
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

      <Dialog
        open={reverseTarget !== null}
        onOpenChange={(open) => !open && setReverseTarget(null)}
        title="แก้ไขย้อนหลัง"
        description={
          reverseTarget
            ? `ระบบจะสร้างรายการกลับรายการ ${formatNumber(reverseTarget.delta)} ${item.unit} ไม่ลบประวัติเดิม`
            : ''
        }
        size="sm"
      >
        <div className="flex justify-end gap-2">
          <button type="button" onClick={() => setReverseTarget(null)} className="pill border border-paper-dim text-ink">
            ยกเลิก
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              void (async () => {
                if (!reverseTarget) return
                const success = await run(
                  () =>
                    callRpc('inventory_reverse', {
                      p_ledger_id: reverseTarget.id,
                      p_note: 'reversal from history',
                      p_key: newIdempotencyKey('inventory-reverse'),
                    }),
                  'สร้างรายการกลับรายการแล้ว',
                )
                if (success) setReverseTarget(null)
              })()
            }}
            className="pill bg-rust text-paper disabled:opacity-60"
          >
            ยืนยันแก้ไข
          </button>
        </div>
      </Dialog>
    </Dialog>
  )
}
