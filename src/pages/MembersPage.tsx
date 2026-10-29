import { useQuery } from '@tanstack/react-query'
import { useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { useAuth } from '@/auth/AuthProvider'
import {
  Dialog,
  EmptyState,
  ErrorBlock,
  Field,
  FormActions,
  LoadingBlock,
  PageHeader,
  PaperPanel,
  StatusChip,
  SubmitButton,
  TableCell,
  TableHeadCell,
  TableShell,
  InlineError,
} from '@/components/ui'
import { callRpc, newIdempotencyKey } from '@/lib/api'
import { db, toNumber, unwrap } from '@/lib/db'
import { useAction } from '@/lib/use-action'
import type { GangRank, MemberRow, SiteRole, SlotKind } from '@/lib/types'
import {
  GANG_RANK_LABELS,
  SITE_ROLE_LABELS,
  SLOT_LABELS,
} from '@/lib/types'

function slotLabel(member: MemberRow) {
  return `${SLOT_LABELS[member.slot_kind]} ${member.slot_number}`
}

function roleTone(role: SiteRole): 'warn' | 'ok' | 'neutral' {
  if (role === 'owner') return 'warn'
  if (role === 'editor') return 'ok'
  return 'neutral'
}

export function MembersPage() {
  const { whoami } = useAuth()
  const role = whoami?.member?.site_role
  const isOwner = role === 'owner'

  const [createOpen, setCreateOpen] = useState(false)
  const [showArchived, setShowArchived] = useState(false)
  const [search, setSearch] = useState('')

  const membersQuery = useQuery<MemberRow[]>({
    queryKey: ['members'],
    queryFn: async () =>
      unwrap(
        await db()
          .from('roster_overview')
          .select('*')
          .order('slot_kind', { ascending: true })
          .order('slot_number', { ascending: true }),
      ),
  })

  const members = useMemo(() => membersQuery.data ?? [], [membersQuery.data])
  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return members.filter((member) => {
      if (!showArchived && member.state === 'archived') return false
      if (needle && !member.in_game_name.toLowerCase().includes(needle)) return false
      return true
    })
  }, [members, search, showArchived])

  const activeCount = members.filter((member) => member.state === 'active').length
  const archivedCount = members.length - activeCount

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="รายชื่อ"
        title="สมาชิก"
        description="ช่องหลัก 30 ช่องและช่องสำรอง 5 ช่อง สิทธิ์แก้ไขถูกบังคับที่ฐานข้อมูล ไม่ใช่แค่ซ่อนปุ่ม"
        actions={
          isOwner ? (
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="pill pill-primary"
            >
              เพิ่มสมาชิก
            </button>
          ) : null
        }
      />

      <PaperPanel padded={false}>
        <div className="flex flex-wrap items-end justify-between gap-3 p-5 sm:p-6">
          <div className="w-full max-w-xs">
            <label htmlFor="member-search" className="t-label block text-ink">
              ค้นหาชื่อในเกม
            </label>
            <input
              id="member-search"
              className="field mt-1.5"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="พิมพ์ชื่อ"
            />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm text-ink-muted">
              ใช้งาน {activeCount} คน · เก็บถาวร {archivedCount} คน
            </p>
            <label className="flex min-h-[44px] items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                checked={showArchived}
                onChange={(event) => setShowArchived(event.target.checked)}
                className="h-4 w-4 accent-[#a98f4f]"
              />
              แสดงคนที่เก็บถาวร
            </label>
          </div>
        </div>

        {membersQuery.isPending ? (
          <div className="px-5 pb-5 sm:px-6">
            <LoadingBlock />
          </div>
        ) : membersQuery.isError ? (
          <div className="px-5 pb-5 sm:px-6">
            <ErrorBlock error={membersQuery.error} onRetry={() => void membersQuery.refetch()} />
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-5 pb-6 sm:px-6">
            <EmptyState
              title={members.length === 0 ? 'ยังไม่มีสมาชิกในระบบ' : 'ไม่พบสมาชิกที่ตรงกับเงื่อนไข'}
              description={
                members.length === 0
                  ? 'เริ่มจากเจ้าของระบบเพิ่มสมาชิกคนแรก พร้อมระบุช่องและสิทธิ์ให้ตรงกับรายชื่อจริง'
                  : 'ลองล้างคำค้นหาหรือเปิดการแสดงคนที่เก็บถาวร'
              }
              action={
                isOwner && members.length === 0 ? (
                  <button type="button" onClick={() => setCreateOpen(true)} className="pill bg-brass text-ground">
                    เพิ่มสมาชิกคนแรก
                  </button>
                ) : null
              }
            />
          </div>
        ) : (
          <TableShell>
            <thead>
              <tr>
                <TableHeadCell>ช่อง</TableHeadCell>
                <TableHeadCell>ชื่อในเกม</TableHeadCell>
                <TableHeadCell>ตำแหน่ง</TableHeadCell>
                <TableHeadCell>สิทธิ์เว็บ</TableHeadCell>
                <TableHeadCell>Discord</TableHeadCell>
                <TableHeadCell numeric>อาวุธ</TableHeadCell>
                <TableHeadCell>สถานะ</TableHeadCell>
              </tr>
            </thead>
            <tbody>
              {filtered.map((member) => (
                <tr key={member.id} className={member.state === 'archived' ? 'opacity-70' : undefined}>
                  <TableCell>
                    <span className="numeral text-sm text-ink-muted">{slotLabel(member)}</span>
                  </TableCell>
                  <TableCell>
                    <Link
                      to={`/app/members/${member.id}`}
                      className="font-medium text-ink underline-offset-4 hover:underline"
                    >
                      {member.in_game_name}
                    </Link>
                    {member.in_game_phone ? (
                      <p className="mt-0.5 text-xs text-ink-muted">{member.in_game_phone}</p>
                    ) : null}
                  </TableCell>
                  <TableCell>{GANG_RANK_LABELS[member.gang_rank]}</TableCell>
                  <TableCell>
                    <StatusChip tone={roleTone(member.site_role)}>
                      {SITE_ROLE_LABELS[member.site_role]}
                    </StatusChip>
                  </TableCell>
                  <TableCell className="text-sm text-ink-muted">
                    {member.discord_linked ? 'ผูกแล้ว' : 'ยังไม่ผูก'}
                  </TableCell>
                  <TableCell numeric>{toNumber(member.weapon_count)}</TableCell>
                  <TableCell>
                    {member.state === 'archived' ? (
                      <StatusChip tone="danger">เก็บถาวร</StatusChip>
                    ) : member.slot_kind === 'reserve' ? (
                      <StatusChip tone="neutral">สำรอง</StatusChip>
                    ) : (
                      <StatusChip tone="ok">ใช้งาน</StatusChip>
                    )}
                  </TableCell>
                </tr>
              ))}
            </tbody>
          </TableShell>
        )}
      </PaperPanel>

      {createOpen ? <AddMemberDialog onClose={() => setCreateOpen(false)} /> : null}
    </div>
  )
}

const RANK_OPTIONS: Array<{ value: GangRank; label: string }> = [
  { value: 'deputy', label: 'รองหัวหน้า' },
  { value: 'member', label: 'สมาชิก' },
]

function AddMemberDialog({ onClose }: { onClose: () => void }) {
  const { pending, run } = useAction()
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [rank, setRank] = useState<GangRank>('member')
  const [slotKind, setSlotKind] = useState<SlotKind>('main')
  const [slotNumber, setSlotNumber] = useState('1')
  const [siteRole, setSiteRole] = useState<SiteRole>('viewer')
  const [discordId, setDiscordId] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)

    const trimmed = name.trim()
    const slot = Number(slotNumber)
    if (trimmed.length < 1 || trimmed.length > 60) {
      setError('ชื่อในเกมต้องยาว 1–60 ตัวอักษร')
      return
    }
    if (!Number.isInteger(slot) || slot < 1 || slot > (slotKind === 'main' ? 30 : 5)) {
      setError(slotKind === 'main' ? 'ช่องหลักต้องอยู่ระหว่าง 1–30' : 'ช่องสำรองต้องอยู่ระหว่าง 1–5')
      return
    }
    if (discordId && !/^\d{15,20}$/.test(discordId.trim())) {
      setError('Discord ID ต้องเป็นตัวเลข 15–20 หลัก')
      return
    }

    const success = await run(
      () =>
        callRpc('admin_create_member', {
          p_in_game_name: trimmed,
          p_in_game_phone: phone.trim() || null,
          p_gang_rank: rank,
          p_slot_kind: slotKind,
          p_slot_number: slot,
          p_site_role: siteRole,
          p_discord_user_id: discordId.trim() || null,
          p_key: newIdempotencyKey('member-create'),
        }),
      'เพิ่มสมาชิกแล้ว',
    )
    if (success) onClose()
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()} title="เพิ่มสมาชิก" description="ระบุช่องและสิทธิ์ให้ตรงกับรายชื่อจริง ช่องที่ซ้ำจะถูกปฏิเสธ">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="ชื่อในเกม" htmlFor="new-name" required>
            <input id="new-name" className="field" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
          </Field>
          <Field label="เบอร์ในเกม" htmlFor="new-phone" hint="ไม่บังคับ">
            <input id="new-phone" className="field" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={24} />
          </Field>
          <Field label="ตำแหน่งในแก๊ง" htmlFor="new-rank">
            <select id="new-rank" className="field" value={rank} onChange={(e) => setRank(e.target.value as GangRank)}>
              {RANK_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="สิทธิ์เว็บ" htmlFor="new-role">
            <select id="new-role" className="field" value={siteRole} onChange={(e) => setSiteRole(e.target.value as SiteRole)}>
              <option value="viewer">ผู้อ่าน</option>
              <option value="editor">ผู้แก้ไข</option>
            </select>
          </Field>
          <Field label="ประเภทช่อง" htmlFor="new-slot-kind">
            <select
              id="new-slot-kind"
              className="field"
              value={slotKind}
              onChange={(e) => {
                const next = e.target.value as SlotKind
                setSlotKind(next)
                setSlotNumber('1')
              }}
            >
              <option value="main">ช่องหลัก</option>
              <option value="reserve">ช่องสำรอง</option>
            </select>
          </Field>
          <Field label="หมายเลขช่อง" htmlFor="new-slot" hint={slotKind === 'main' ? '1–30' : '1–5'}>
            <input
              id="new-slot"
              className="field"
              inputMode="numeric"
              value={slotNumber}
              onChange={(e) => setSlotNumber(e.target.value)}
            />
          </Field>
        </div>

        <Field
          label="Discord ID"
          htmlFor="new-discord"
          hint="ไม่บังคับตอนสร้าง แต่ต้องผูกก่อนสมาชิกคนนั้นเข้าสู่ระบบได้"
        >
          <input
            id="new-discord"
            className="field font-mono"
            inputMode="numeric"
            value={discordId}
            onChange={(e) => setDiscordId(e.target.value)}
            placeholder="ตัวเลข 15–20 หลัก"
          />
        </Field>

        {slotKind === 'reserve' ? (
          <p className="rounded-control border border-paper-dim bg-[#fbf9f2] p-3 text-sm text-ink-muted">
            สมาชิกช่องสำรองไม่ต้องจ่ายค่าหัวรายสัปดาห์
          </p>
        ) : null}

        {error ? <InlineError>{error}</InlineError> : null}
        <FormActions pending={pending} onCancel={onClose}>
          <SubmitButton pending={pending}>บันทึกสมาชิก</SubmitButton>
        </FormActions>
      </form>
    </Dialog>
  )
}
