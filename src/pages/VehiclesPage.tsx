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
import { callRpc, newIdempotencyKey, signedUrl, uploadImage } from '@/lib/api'
import { db, toNumber, unwrap } from '@/lib/db'
import {
  bangkokInputToIso,
  formatDuration,
  formatDateTime,
  isoToBangkokInput,
} from '@/lib/format'
import { useAction } from '@/lib/use-action'
import type { MemberRow, VehicleContract, VehicleStatus } from '@/lib/types'

type VehicleDialog =
  | { type: 'vehicle'; vehicle?: VehicleStatus }
  | { type: 'contract'; vehicle: VehicleStatus }
  | { type: 'release'; vehicle: VehicleStatus }
  | { type: 'extend'; vehicle: VehicleStatus }
  | { type: 'history'; vehicle: VehicleStatus }
  | null

export function VehiclesPage() {
  const { whoami } = useAuth()
  const role = whoami?.member?.site_role
  const canEdit = role === 'owner' || role === 'editor'

  const [dialog, setDialog] = useState<VehicleDialog>(null)

  const vehiclesQuery = useQuery<VehicleStatus[]>({
    queryKey: ['vehicle_status'],
    queryFn: async () =>
      unwrap(
        await db()
          .from('vehicle_status')
          .select('*')
          .order('status', { ascending: true })
          .order('plate', { ascending: true }),
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

  const vehicles = useMemo(() => vehiclesQuery.data ?? [], [vehiclesQuery.data])
  const photoPaths = vehicles
    .map((vehicle) => vehicle.photo_path)
    .filter((path): path is string => Boolean(path))

  const photosQuery = useQuery<Record<string, string | null>>({
    queryKey: ['vehicle-photos', photoPaths.join('|')],
    queryFn: async () => {
      const entries = await Promise.all(
        photoPaths.map(async (path) => [path, await signedUrl('vehicle-media', path)] as const),
      )
      return Object.fromEntries(entries)
    },
    enabled: photoPaths.length > 0,
    staleTime: 30 * 60_000,
  })

  const photos = photosQuery.data ?? {}
  const held = useMemo(
    () => vehicles.filter((vehicle) => vehicle.status === 'held'),
    [vehicles],
  )

  if (vehiclesQuery.isPending) return <LoadingBlock />
  if (vehiclesQuery.isError) {
    return (
      <ErrorBlock error={vehiclesQuery.error} onRetry={() => void vehiclesQuery.refetch()} />
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="สัญญารถ"
        title="รถของแก๊ง"
        description="รถหนึ่งคันมีสัญญาที่ใช้งานอยู่ได้เพียงหนึ่งสัญญา การคืนรถหรือขยายเวลาถูกบันทึกเป็นสัญญาเดิม ไม่ลบประวัติ"
        actions={
          canEdit ? (
            <button
              type="button"
              className="pill pill-primary"
              onClick={() => setDialog({ type: 'vehicle' })}
            >
              เพิ่มรถ
            </button>
          ) : null
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <PaperPanel>
          <p className="t-label text-ink-muted">รถในระบบ</p>
          <p className="t-numeral mt-2 text-2xl text-ink">{vehicles.length} คัน</p>
        </PaperPanel>
        <PaperPanel>
          <p className="t-label text-ink-muted">ถูกถือครอง</p>
          <p className="t-numeral mt-2 text-2xl text-ink">{held.length} คัน</p>
        </PaperPanel>
        <PaperPanel>
          <p className="t-label text-ink-muted">ว่าง</p>
          <p className="t-numeral mt-2 text-2xl text-moss">{vehicles.length - held.length} คัน</p>
        </PaperPanel>
      </div>

      {vehicles.length === 0 ? (
        <EmptyState
          title="ยังไม่มีรถในระบบ"
          description="เพิ่มรถคันแรกพร้อมทะเบียนจริง แล้วจึงสร้างสัญญาให้สมาชิกที่ถือรถ"
          action={
            canEdit ? (
              <button
                type="button"
                className="pill bg-brass text-ground"
                onClick={() => setDialog({ type: 'vehicle' })}
              >
                เพิ่มรถคันแรก
              </button>
            ) : null
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {vehicles.map((vehicle) => {
            const photo = vehicle.photo_path ? photos[vehicle.photo_path] : null
            return (
              <article
                key={vehicle.id}
                className="paper flex flex-col overflow-hidden rounded-card border border-paper-dim"
              >
                <div className="relative aspect-[16/10] bg-paper-dim">
                  {photo ? (
                    <img
                      src={photo}
                      alt={`รูป ${vehicle.name}`}
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center px-6 text-center">
                      <p className="text-sm text-ink-muted">ยังไม่มีรูปของรถคันนี้</p>
                    </div>
                  )}
                  <div className="absolute left-3 top-3">
                    <StatusChip tone={vehicle.status === 'held' ? 'warn' : 'ok'}>
                      {vehicle.status === 'held' ? 'ถูกถือครอง' : 'ว่าง'}
                    </StatusChip>
                  </div>
                </div>

                <div className="flex flex-1 flex-col p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="text-lg font-semibold text-ink">{vehicle.name}</h2>
                      <p className="mt-0.5 text-sm text-ink-muted">{vehicle.model}</p>
                    </div>
                    <span className="shrink-0 rounded-sm border border-[#d6ccb4] bg-[#fbf9f2] px-2.5 py-1 font-mono text-sm text-ink">
                      {vehicle.plate}
                    </span>
                  </div>

                  {vehicle.status === 'held' && vehicle.contract_id ? (
                    <dl className="mt-4 space-y-1.5 border-t border-paper-dim pt-4 text-sm">
                      <div className="flex justify-between gap-3">
                        <dt className="text-ink-muted">ผู้ถือ</dt>
                        <dd className="font-medium text-ink">{vehicle.holder_name ?? '—'}</dd>
                      </div>
                      <div className="flex justify-between gap-3">
                        <dt className="text-ink-muted">คงเหลือ</dt>
                        <dd className="numeral font-medium text-ink">
                          {formatDuration(toNumber(vehicle.remaining_minutes))}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-3">
                        <dt className="text-ink-muted">สิ้นสุด</dt>
                        <dd className="text-ink">{formatDateTime(vehicle.end_at)}</dd>
                      </div>
                    </dl>
                  ) : (
                    <p className="mt-4 border-t border-paper-dim pt-4 text-sm text-ink-muted">
                      ไม่มีผู้ถือครองอยู่ในขณะนี้
                    </p>
                  )}

                  {vehicle.note ? (
                    <p className="mt-3 text-sm leading-relaxed text-ink-muted">{vehicle.note}</p>
                  ) : null}

                  <div className="mt-auto flex flex-wrap gap-2 pt-4">
                    {canEdit ? (
                      <>
                        {vehicle.status === 'available' && vehicle.is_active ? (
                          <RowButton onClick={() => setDialog({ type: 'contract', vehicle })}>
                            ทำสัญญา
                          </RowButton>
                        ) : null}
                        {vehicle.status === 'held' ? (
                          <>
                            <RowButton onClick={() => setDialog({ type: 'extend', vehicle })}>
                              ขยายเวลา
                            </RowButton>
                            <RowButton onClick={() => setDialog({ type: 'release', vehicle })}>
                              คืนรถ
                            </RowButton>
                          </>
                        ) : null}
                        <RowButton onClick={() => setDialog({ type: 'vehicle', vehicle })}>
                          แก้ไข
                        </RowButton>
                      </>
                    ) : null}
                    <RowButton onClick={() => setDialog({ type: 'history', vehicle })}>
                      ประวัติ
                    </RowButton>
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      )}

      {dialog?.type === 'vehicle' ? (
        <VehicleDialogPanel vehicle={dialog.vehicle} onClose={() => setDialog(null)} />
      ) : null}
      {dialog?.type === 'contract' ? (
        <ContractDialog
          vehicle={dialog.vehicle}
          members={membersQuery.data ?? []}
          onClose={() => setDialog(null)}
        />
      ) : null}
      {dialog?.type === 'release' ? (
        <ReleaseDialog vehicle={dialog.vehicle} onClose={() => setDialog(null)} />
      ) : null}
      {dialog?.type === 'extend' ? (
        <ExtendDialog vehicle={dialog.vehicle} onClose={() => setDialog(null)} />
      ) : null}
      {dialog?.type === 'history' ? (
        <ContractHistoryDialog
          vehicle={dialog.vehicle}
          members={membersQuery.data ?? []}
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

function VehicleDialogPanel({
  vehicle,
  onClose,
}: {
  vehicle?: VehicleStatus
  onClose: () => void
}) {
  const { pending, run } = useAction()
  const [name, setName] = useState(vehicle?.name ?? '')
  const [model, setModel] = useState(vehicle?.model ?? '')
  const [plate, setPlate] = useState(vehicle?.plate ?? '')
  const [note, setNote] = useState(vehicle?.note ?? '')
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    if (!name.trim() || !model.trim() || !plate.trim()) {
      setError('กรอกชื่อรถ รุ่น และทะเบียนให้ครบ')
      return
    }
    const success = await run(
      async () => {
        const photoPath = file ? await uploadImage('vehicle-media', file) : (vehicle?.photo_path ?? null)
        await callRpc('editor_save_vehicle', {
          p_vehicle_id: vehicle?.id ?? null,
          p_name: name.trim(),
          p_model: model.trim(),
          p_plate: plate.trim(),
          p_photo_path: photoPath,
          p_note: note.trim() || null,
          p_key: newIdempotencyKey('vehicle-save'),
        })
      },
      vehicle ? 'บันทึกข้อมูลรถแล้ว' : 'เพิ่มรถแล้ว',
    )
    if (success) onClose()
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={vehicle ? `แก้ไข ${vehicle.name}` : 'เพิ่มรถ'}
      description="ทะเบียนต้องไม่ซ้ำกับรถคันอื่นในระบบ"
    >
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="ชื่อเรียก" htmlFor="vehicle-name" required>
            <input
              id="vehicle-name"
              className="field"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={80}
            />
          </Field>
          <Field label="รุ่น" htmlFor="vehicle-model" required>
            <input
              id="vehicle-model"
              className="field"
              value={model}
              onChange={(event) => setModel(event.target.value)}
              maxLength={80}
            />
          </Field>
        </div>
        <Field label="ทะเบียน" htmlFor="vehicle-plate" required>
          <input
            id="vehicle-plate"
            className="field font-mono"
            value={plate}
            onChange={(event) => setPlate(event.target.value)}
            maxLength={24}
          />
        </Field>
        <Field label="หมายเหตุ" htmlFor="vehicle-note" hint="ไม่บังคับ">
          <textarea
            id="vehicle-note"
            className="field"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            maxLength={1000}
          />
        </Field>
        <Field
          label="รูปรถ"
          htmlFor="vehicle-photo"
          hint="JPG, PNG หรือ WebP ไม่เกิน 5 MB · รูปถูกเก็บในถังส่วนตัว"
        >
          <input
            id="vehicle-photo"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="field"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
        </Field>
        {vehicle?.photo_path && !file ? (
          <p className="text-sm text-ink-muted">มีรูปเดิมอยู่แล้ว ไม่อัปโหลดใหม่จะใช้รูปเดิม</p>
        ) : null}
        {error ? <InlineError>{error}</InlineError> : null}
        <FormActions pending={pending} onCancel={onClose}>
          <SubmitButton pending={pending}>{vehicle ? 'บันทึก' : 'เพิ่มรถ'}</SubmitButton>
        </FormActions>
      </form>
    </Dialog>
  )
}

function ContractDialog({
  vehicle,
  members,
  onClose,
}: {
  vehicle: VehicleStatus
  members: MemberRow[]
  onClose: () => void
}) {
  const { pending, run } = useAction()
  const [holder, setHolder] = useState('')
  const [start, setStart] = useState(isoToBangkokInput(new Date().toISOString()))
  const [end, setEnd] = useState(
    isoToBangkokInput(new Date(new Date().getTime() + 7 * 24 * 60 * 60 * 1000).toISOString()),
  )
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    if (!members.some((member) => member.id === holder)) {
      setError('เลือกสมาชิกผู้ถือรถ')
      return
    }
    const startIso = bangkokInputToIso(start)
    const endIso = bangkokInputToIso(end)
    if (!startIso || !endIso) {
      setError('ระบุวันเวลาเริ่มและสิ้นสุดให้ครบ')
      return
    }
    if (new Date(endIso) <= new Date(startIso)) {
      setError('เวลาสิ้นสุดต้องอยู่หลังเวลาเริ่ม')
      return
    }
    const success = await run(
      () =>
        callRpc('editor_create_vehicle_contract', {
          p_vehicle_id: vehicle.id,
          p_holder_member_id: holder,
          p_start_at: startIso,
          p_end_at: endIso,
          p_note: note.trim() || null,
          p_key: newIdempotencyKey('vehicle-contract'),
        }),
      'สร้างสัญญารถแล้ว',
    )
    if (success) onClose()
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={`ทำสัญญา · ${vehicle.name}`}
      description={`ทะเบียน ${vehicle.plate} · หนึ่งคันมีสัญญาที่ใช้งานอยู่ได้เพียงหนึ่งสัญญา`}
    >
      <form onSubmit={submit} className="space-y-4">
        <Field label="ผู้ถือรถ" htmlFor="contract-holder" required>
          <select
            id="contract-holder"
            className="field"
            value={holder}
            onChange={(event) => setHolder(event.target.value)}
          >
            <option value="">เลือกสมาชิก</option>
            {members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.in_game_name}
              </option>
            ))}
          </select>
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="เริ่มสัญญา" htmlFor="contract-start" required>
            <input
              id="contract-start"
              type="datetime-local"
              className="field"
              value={start}
              onChange={(event) => setStart(event.target.value)}
            />
          </Field>
          <Field label="สิ้นสุดสัญญา" htmlFor="contract-end" required>
            <input
              id="contract-end"
              type="datetime-local"
              className="field"
              value={end}
              onChange={(event) => setEnd(event.target.value)}
            />
          </Field>
        </div>
        <p className="rounded-control border border-paper-dim bg-[#fbf9f2] p-3 text-xs leading-relaxed text-ink-muted">
          เวลาที่กรอกคือเวลาไทย (Asia/Bangkok) ระบบเก็บเป็น UTC และสัญญายาวได้ไม่เกิน 365 วัน
        </p>
        <Field label="หมายเหตุ" htmlFor="contract-note" hint="ไม่บังคับ">
          <input
            id="contract-note"
            className="field"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            maxLength={500}
          />
        </Field>
        {error ? <InlineError>{error}</InlineError> : null}
        <FormActions pending={pending} onCancel={onClose}>
          <SubmitButton pending={pending}>สร้างสัญญา</SubmitButton>
        </FormActions>
      </form>
    </Dialog>
  )
}

function ReleaseDialog({ vehicle, onClose }: { vehicle: VehicleStatus; onClose: () => void }) {
  const { pending, run } = useAction()
  const [releasedAt, setReleasedAt] = useState(isoToBangkokInput(new Date().toISOString()))
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    if (!vehicle.contract_id) {
      setError('ไม่พบสัญญาที่เปิดอยู่')
      return
    }
    const releaseIso = bangkokInputToIso(releasedAt)
    if (!releaseIso) {
      setError('ระบุเวลาคืนรถ')
      return
    }
    const success = await run(
      () =>
        callRpc('editor_release_vehicle_contract', {
          p_contract_id: vehicle.contract_id,
          p_released_at: releaseIso,
          p_note: note.trim() || null,
          p_key: newIdempotencyKey('vehicle-release'),
        }),
      'คืนรถแล้ว',
    )
    if (success) onClose()
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={`คืนรถ · ${vehicle.name}`}
      description={`ผู้ถือปัจจุบัน ${vehicle.holder_name ?? '—'} · สัญญาจะปิดแต่ยังอยู่ในประวัติ`}
      size="sm"
    >
      <form onSubmit={submit} className="space-y-4">
        <Field label="เวลาคืนรถ" htmlFor="release-at" required>
          <input
            id="release-at"
            type="datetime-local"
            className="field"
            value={releasedAt}
            onChange={(event) => setReleasedAt(event.target.value)}
          />
        </Field>
        <Field label="หมายเหตุ" htmlFor="release-note" hint="ไม่บังคับ">
          <input
            id="release-note"
            className="field"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            maxLength={500}
          />
        </Field>
        {error ? <InlineError>{error}</InlineError> : null}
        <FormActions pending={pending} onCancel={onClose}>
          <SubmitButton pending={pending}>ยืนยันคืนรถ</SubmitButton>
        </FormActions>
      </form>
    </Dialog>
  )
}

function ExtendDialog({ vehicle, onClose }: { vehicle: VehicleStatus; onClose: () => void }) {
  const { pending, run } = useAction()
  const [newEnd, setNewEnd] = useState(
    isoToBangkokInput(
      new Date(new Date(vehicle.end_at ?? new Date().toISOString()).getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    ),
  )
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    if (!vehicle.contract_id) {
      setError('ไม่พบสัญญาที่เปิดอยู่')
      return
    }
    const endIso = bangkokInputToIso(newEnd)
    if (!endIso) {
      setError('ระบุเวลาสิ้นสุดใหม่')
      return
    }
    if (vehicle.end_at && new Date(endIso) <= new Date(vehicle.end_at)) {
      setError('เวลาสิ้นสุดใหม่ต้องอยู่หลังเวลาสิ้นสุดเดิม')
      return
    }
    const success = await run(
      () =>
        callRpc('editor_extend_vehicle_contract', {
          p_contract_id: vehicle.contract_id,
          p_new_end_at: endIso,
          p_note: note.trim() || null,
          p_key: newIdempotencyKey('vehicle-extend'),
        }),
      'ขยายสัญญารถแล้ว',
    )
    if (success) onClose()
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={`ขยายเวลา · ${vehicle.name}`}
      description={`สิ้นสุดเดิม ${formatDateTime(vehicle.end_at)}`}
      size="sm"
    >
      <form onSubmit={submit} className="space-y-4">
        <Field label="สิ้นสุดใหม่" htmlFor="extend-at" required>
          <input
            id="extend-at"
            type="datetime-local"
            className="field"
            value={newEnd}
            onChange={(event) => setNewEnd(event.target.value)}
          />
        </Field>
        <Field label="หมายเหตุ" htmlFor="extend-note" hint="ไม่บังคับ">
          <input
            id="extend-note"
            className="field"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            maxLength={500}
          />
        </Field>
        {error ? <InlineError>{error}</InlineError> : null}
        <FormActions pending={pending} onCancel={onClose}>
          <SubmitButton pending={pending}>ยืนยันขยายเวลา</SubmitButton>
        </FormActions>
      </form>
    </Dialog>
  )
}

function ContractHistoryDialog({
  vehicle,
  members,
  onClose,
}: {
  vehicle: VehicleStatus
  members: MemberRow[]
  onClose: () => void
}) {
  const names = new Map(members.map((member) => [member.id, member.in_game_name]))
  const contractsQuery = useQuery<VehicleContract[]>({
    queryKey: ['vehicle_contracts', vehicle.id],
    queryFn: async () =>
      unwrap(
        await db()
          .from('vehicle_contracts')
          .select('*')
          .eq('vehicle_id', vehicle.id)
          .order('start_at', { ascending: false }),
      ),
  })

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={`ประวัติสัญญา · ${vehicle.name}`}
      description={`ทะเบียน ${vehicle.plate}`}
      size="lg"
    >
      {contractsQuery.isPending ? (
        <LoadingBlock />
      ) : contractsQuery.isError ? (
        <ErrorBlock error={contractsQuery.error} onRetry={() => void contractsQuery.refetch()} />
      ) : (contractsQuery.data ?? []).length === 0 ? (
        <p className="text-sm text-ink-muted">ยังไม่มีสัญญาของรถคันนี้</p>
      ) : (
        <TableShell>
          <thead>
            <tr>
              <TableHeadCell>ผู้ถือ</TableHeadCell>
              <TableHeadCell>เริ่ม</TableHeadCell>
              <TableHeadCell>สิ้นสุด</TableHeadCell>
              <TableHeadCell>คืนเมื่อ</TableHeadCell>
              <TableHeadCell>สถานะ</TableHeadCell>
            </tr>
          </thead>
          <tbody>
            {(contractsQuery.data ?? []).map((contract) => (
              <tr key={contract.id}>
                <TableCell className="font-medium text-ink">
                  {names.get(contract.holder_member_id) ?? '—'}
                </TableCell>
                <TableCell className="whitespace-nowrap text-sm text-ink-muted">
                  {formatDateTime(contract.start_at)}
                </TableCell>
                <TableCell className="whitespace-nowrap text-sm text-ink-muted">
                  {formatDateTime(contract.end_at)}
                </TableCell>
                <TableCell className="whitespace-nowrap text-sm text-ink-muted">
                  {contract.released_at ? formatDateTime(contract.released_at) : '—'}
                </TableCell>
                <TableCell>
                  {contract.released_at ? (
                    <StatusChip tone="neutral">ปิดแล้ว</StatusChip>
                  ) : (
                    <StatusChip tone="ok">ใช้งาน</StatusChip>
                  )}
                </TableCell>
              </tr>
            ))}
          </tbody>
        </TableShell>
      )}
    </Dialog>
  )
}
