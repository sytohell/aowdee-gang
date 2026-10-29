import { useQuery } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { useAuth } from '@/auth/AuthProvider'
import {
  ConfirmDialog,
  Dialog,
  ErrorBlock,
  Field,
  FormActions,
  InlineError,
  KeyValue,
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
import { db, unwrap } from '@/lib/db'
import { formatDate, formatDateTime } from '@/lib/format'
import { useAction } from '@/lib/use-action'
import type {
  GangRank,
  MemberRow,
  MemberWeapon,
  SiteRole,
  SlotKind,
  WeaponType,
} from '@/lib/types'
import {
  GANG_RANK_LABELS,
  SITE_ROLE_LABELS,
  SLOT_LABELS,
  WEAPON_LABELS,
  WEAPON_MAX_LEVEL,
} from '@/lib/types'

type IdentityRow = {
  id: string
  member_id: string
  discord_user_id: string
  linked_at: string
}

export function MemberDetailPage() {
  const { memberId } = useParams()
  const navigate = useNavigate()
  const { whoami } = useAuth()
  const role = whoami?.member?.site_role
  const isOwner = role === 'owner'
  const canEdit = role === 'owner' || role === 'editor'

  const memberQuery = useQuery<MemberRow | null>({
    queryKey: ['member', memberId],
    queryFn: async () =>
      unwrap(await db().from('roster_overview').select('*').eq('id', memberId).maybeSingle()),
    enabled: Boolean(memberId),
  })

  const weaponsQuery = useQuery<MemberWeapon[]>({
    queryKey: ['member-weapons', memberId],
    queryFn: async () =>
      unwrap(await db().from('member_weapons').select('*').eq('member_id', memberId)),
    enabled: Boolean(memberId),
  })

  const identityQuery = useQuery<IdentityRow | null>({
    queryKey: ['member-identity', memberId],
    queryFn: async () =>
      unwrap(
        await db()
          .from('member_identities')
          .select('*')
          .eq('member_id', memberId)
          .is('revoked_at', null)
          .maybeSingle(),
      ),
    enabled: Boolean(memberId) && isOwner,
  })

  const [editOpen, setEditOpen] = useState(false)
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [transferOpen, setTransferOpen] = useState(false)
  const [pendingWeapon, setPendingWeapon] = useState<WeaponType | null>(null)
  const [roleDraft, setRoleDraft] = useState<SiteRole | ''>('')
  const { pending, run } = useAction()

  const member = memberQuery.data
  const weapons = weaponsQuery.data ?? []

  if (memberQuery.isPending) return <LoadingBlock />
  if (memberQuery.isError) {
    return <ErrorBlock error={memberQuery.error} onRetry={() => void memberQuery.refetch()} />
  }
  if (!member) {
    return (
      <div className="space-y-6">
        <PageHeader title="ไม่พบสมาชิก" description="สมาชิกคนนี้อาจถูกย้ายหรือลิงก์ไม่ถูกต้อง" />
        <Link to="/app/members" className="pill pill-quiet inline-flex">
          กลับรายชื่อสมาชิก
        </Link>
      </div>
    )
  }

  const weaponLevels = new Map(weapons.map((weapon) => [weapon.weapon, weapon.level]))
  const editable = canEdit && member.state === 'active'
  const targetRole = roleDraft || member.site_role

  async function saveWeapon(weapon: WeaponType, level: number) {
    if (!member) return
    const existing = weaponLevels.has(weapon)
    setPendingWeapon(weapon)
    try {
      if (level === 0) {
        if (existing) {
          await run(
            () =>
              callRpc('editor_remove_weapon', {
                p_member_id: member.id,
                p_weapon: weapon,
                p_key: newIdempotencyKey('weapon-remove'),
              }),
            `ลบ ${WEAPON_LABELS[weapon]} แล้ว`,
          )
        }
      } else {
        await run(
          () =>
            callRpc('editor_set_weapon', {
              p_member_id: member.id,
              p_weapon: weapon,
              p_level: level,
              p_key: newIdempotencyKey('weapon-set'),
            }),
          `บันทึก ${WEAPON_LABELS[weapon]} LV ${level} แล้ว`,
        )
      }
    } finally {
      setPendingWeapon(null)
    }
  }

  async function archive(reason: string) {
    const success = await run(
      () =>
        callRpc('admin_archive_member', {
          p_member_id: member!.id,
          p_reason: reason || null,
          p_key: newIdempotencyKey('member-archive'),
        }),
      'เก็บสมาชิกถาวรแล้ว',
    )
    if (success) {
      setArchiveOpen(false)
      navigate('/app/members')
    }
  }

  async function saveRole() {
    if (!member || targetRole === member.site_role) return
    await run(
      () =>
        callRpc('admin_set_role', {
          p_member_id: member.id,
          p_site_role: targetRole,
          p_key: newIdempotencyKey('member-role'),
        }),
      'เปลี่ยนสิทธิ์แล้ว',
    )
    setRoleDraft('')
  }

  async function toggleExempt() {
    if (!member) return
    await run(
      () =>
        callRpc('admin_set_dues_exempt', {
          p_member_id: member.id,
          p_exempt: !member.dues_exempt,
          p_key: newIdempotencyKey('member-exempt'),
        }),
      member.dues_exempt ? 'ยกเลิกการยกเว้นค่าหัวแล้ว' : 'ยกเว้นค่าหัวแล้ว',
    )
  }

  async function linkDiscord(discordId: string) {
    if (!member) return false
    return run(
      () =>
        callRpc('admin_link_discord', {
          p_member_id: member.id,
          p_discord_user_id: discordId,
          p_key: newIdempotencyKey('member-link'),
        }),
      'ผูก Discord แล้ว',
    )
  }

  async function unlinkDiscord() {
    if (!member) return
    await run(
      () =>
        callRpc('admin_unlink_discord', {
          p_member_id: member.id,
          p_reason: 'unlinked from member page',
          p_key: newIdempotencyKey('member-unlink'),
        }),
      'ยกเลิกการผูก Discord แล้ว',
    )
  }

  return (
    <div className="space-y-6">
      <Link
        to="/app/members"
        className="inline-flex min-h-[44px] items-center text-sm text-cream-muted hover:text-cream"
      >
        ← กลับรายชื่อสมาชิก
      </Link>

      <PageHeader
        eyebrow={`${SLOT_LABELS[member.slot_kind]} ${member.slot_number}`}
        title={member.in_game_name}
        description={`${GANG_RANK_LABELS[member.gang_rank]} · สิทธิ์เว็บ ${SITE_ROLE_LABELS[member.site_role]}`}
        actions={
          editable ? (
            <>
              <button type="button" className="pill pill-quiet" onClick={() => setEditOpen(true)}>
                แก้ไขข้อมูล
              </button>
              {isOwner && member.site_role !== 'owner' ? (
                <button
                  type="button"
                  className="pill border border-rust/50 text-rust hover:bg-rust/10"
                  onClick={() => setArchiveOpen(true)}
                >
                  เก็บถาวร
                </button>
              ) : null}
            </>
          ) : null
        }
      />

      {member.state === 'archived' ? (
        <div className="rounded-card border border-rust/40 bg-rust/10 p-4 text-sm text-rust">
          สมาชิกคนนี้ถูกเก็บถาวรเมื่อ {formatDateTime(member.archived_at)}
          {member.archived_reason ? ` · เหตุผล: ${member.archived_reason}` : ''}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <div className="space-y-4">
          <PaperPanel>
            <SectionTitle title="ข้อมูลสมาชิก" />
            <dl className="mt-4 space-y-4">
              <KeyValue label="ช่อง">
                {SLOT_LABELS[member.slot_kind]} {member.slot_number}
              </KeyValue>
              <KeyValue label="ตำแหน่งในแก๊ง">{GANG_RANK_LABELS[member.gang_rank]}</KeyValue>
              <KeyValue label="สิทธิ์เว็บ">
                <StatusChip tone={member.site_role === 'owner' ? 'warn' : member.site_role === 'editor' ? 'ok' : 'neutral'}>
                  {SITE_ROLE_LABELS[member.site_role]}
                </StatusChip>
              </KeyValue>
              <KeyValue label="เบอร์ในเกม">{member.in_game_phone ?? '—'}</KeyValue>
              <KeyValue label="เข้าร่วมเมื่อ">{formatDate(member.joined_at)}</KeyValue>
              <KeyValue label="ค่าหัว">
                {member.slot_kind === 'reserve'
                  ? 'ไม่ต้องจ่าย (ช่องสำรอง)'
                  : member.dues_exempt
                    ? 'ยกเว้น'
                    : 'ต้องจ่ายตามรอบ'}
              </KeyValue>
              <KeyValue label="Discord">
                {isOwner && identityQuery.data ? (
                  <span className="font-mono text-xs">{identityQuery.data.discord_user_id}</span>
                ) : member.discord_linked ? (
                  'ผูกแล้ว'
                ) : (
                  'ยังไม่ผูก'
                )}
              </KeyValue>
            </dl>
          </PaperPanel>

          {isOwner ? (
            <PaperPanel>
              <SectionTitle title="การจัดการเจ้าของ" />
              <div className="mt-4 space-y-5">
                {member.site_role !== 'owner' ? (
                  <>
                    <Field label="สิทธิ์เว็บ" htmlFor="member-role">
                      <div className="flex gap-2">
                        <select
                          id="member-role"
                          className="field"
                          value={targetRole}
                          onChange={(event) => setRoleDraft(event.target.value as SiteRole)}
                        >
                          <option value="viewer">ผู้อ่าน</option>
                          <option value="editor">ผู้แก้ไข</option>
                        </select>
                        <button
                          type="button"
                          onClick={() => void saveRole()}
                          disabled={pending || targetRole === member.site_role}
                          className="pill min-h-[44px] shrink-0 border border-paper-dim px-4 text-sm text-ink disabled:opacity-50"
                        >
                          บันทึก
                        </button>
                      </div>
                    </Field>

                    <div>
                      <p className="t-label text-ink">ค่าหัวรายสัปดาห์</p>
                      <p className="mt-1 text-sm text-ink-muted">
                        {member.dues_exempt ? 'ยกเว้นอยู่' : 'ต้องจ่ายตามปกติ'} · การเปลี่ยนมีผลกับรอบที่สร้างใหม่
                      </p>
                      <button
                        type="button"
                        onClick={() => void toggleExempt()}
                        disabled={pending}
                        className="pill mt-2 min-h-[40px] border border-paper-dim px-4 text-sm text-ink disabled:opacity-50"
                      >
                        {member.dues_exempt ? 'ยกเลิกการยกเว้น' : 'ยกเว้นค่าหัว'}
                      </button>
                    </div>

                    <DiscordPanel
                      currentId={identityQuery.data?.discord_user_id ?? null}
                      onLink={linkDiscord}
                      onUnlink={unlinkDiscord}
                      pending={pending}
                    />
                    <div className="border-t border-paper-dim pt-4">
                      <p className="t-label text-ink">โอนสิทธิ์เจ้าของ</p>
                      <p className="mt-1 text-sm text-ink-muted">
                        คุณจะกลายเป็นผู้แก้ไข และสมาชิกคนนี้จะกลายเป็นเจ้าของระบบแทน
                      </p>
                      <button
                        type="button"
                        onClick={() => setTransferOpen(true)}
                        className="pill mt-2 min-h-[40px] border border-rust/40 px-4 text-sm text-rust"
                      >
                        โอนสิทธิ์ให้สมาชิกคนนี้
                      </button>
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-ink-muted">
                    นี่คือบัญชีเจ้าของระบบ การเปลี่ยนสิทธิ์หรือเก็บถาวรต้องโอนสิทธิ์ให้คนอื่นก่อน
                  </p>
                )}
              </div>
            </PaperPanel>
          ) : null}
        </div>

        <PaperPanel>
          <SectionTitle
            title="อาวุธและระดับ"
            description="ระดับสูงสุด: ไม้และปืน LV 3 · อาวุธระยะประชิด LV 4"
          />
          <div className="mt-4">
            <TableShell>
              <thead>
                <tr>
                  <TableHeadCell>อาวุธ</TableHeadCell>
                  <TableHeadCell>ระดับปัจจุบัน</TableHeadCell>
                  <TableHeadCell>กำหนดระดับ</TableHeadCell>
                </tr>
              </thead>
              <tbody>
                {(Object.keys(WEAPON_LABELS) as WeaponType[]).map((weapon) => {
                  const level = weaponLevels.get(weapon) ?? 0
                  return (
                    <tr key={weapon}>
                      <TableCell>{WEAPON_LABELS[weapon]}</TableCell>
                      <TableCell>
                        {level > 0 ? (
                          <StatusChip tone="warn">LV {level}</StatusChip>
                        ) : (
                          <span className="text-sm text-ink-muted">ยังไม่มี</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {editable ? (
                          <select
                            aria-label={`ระดับ ${WEAPON_LABELS[weapon]}`}
                            className="field max-w-[10rem]"
                            value={level}
                            disabled={pendingWeapon === weapon}
                            onChange={(event) => void saveWeapon(weapon, Number(event.target.value))}
                          >
                            <option value={0}>ไม่มี</option>
                            {Array.from({ length: WEAPON_MAX_LEVEL[weapon] }, (_, index) => index + 1).map(
                              (option) => (
                                <option key={option} value={option}>
                                  LV {option}
                                </option>
                              ),
                            )}
                          </select>
                        ) : (
                          <span className="text-sm text-ink-muted">อ่านอย่างเดียว</span>
                        )}
                      </TableCell>
                    </tr>
                  )
                })}
              </tbody>
            </TableShell>
          </div>
          {weaponsQuery.isError ? (
            <div className="mt-4">
              <ErrorBlock error={weaponsQuery.error} onRetry={() => void weaponsQuery.refetch()} />
            </div>
          ) : null}
        </PaperPanel>
      </div>

      {editOpen ? (
        <EditMemberDialog
          member={member}
          onClose={() => setEditOpen(false)}
        />
      ) : null}

      {archiveOpen ? (
        <ArchiveDialog
          member={member}
          onClose={() => setArchiveOpen(false)}
          onConfirm={(reason) => void archive(reason)}
          pending={pending}
        />
      ) : null}

      <ConfirmDialog
        open={transferOpen}
        onOpenChange={setTransferOpen}
        title="โอนสิทธิ์เจ้าของ"
        description={`ยืนยันโอนสิทธิ์เจ้าของให้ ${member.in_game_name} หลังทำรายการ คุณจะเหลือสิทธิ์ผู้แก้ไข`}
        confirmLabel="โอนสิทธิ์"
        danger
        pending={pending}
        onConfirm={() => {
          void (async () => {
            const success = await run(
              () =>
                callRpc('admin_transfer_owner', {
                  p_new_member_id: member.id,
                  p_key: newIdempotencyKey('owner-transfer'),
                }),
              'โอนสิทธิ์เจ้าของแล้ว',
            )
            if (success) navigate('/app')
          })()
        }}
      />
    </div>
  )
}

function DiscordPanel({
  currentId,
  onLink,
  onUnlink,
  pending,
}: {
  currentId: string | null
  onLink: (discordId: string) => Promise<boolean>
  onUnlink: () => Promise<void>
  pending: boolean
}) {
  const [discordId, setDiscordId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [confirmUnlink, setConfirmUnlink] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    const trimmed = discordId.trim()
    if (!/^\d{15,20}$/.test(trimmed)) {
      setError('Discord ID ต้องเป็นตัวเลข 15–20 หลัก')
      return
    }
    const success = await onLink(trimmed)
    if (success) setDiscordId('')
  }

  return (
    <div className="border-t border-paper-dim pt-4">
      <p className="t-label text-ink">Discord ที่ผูกอยู่</p>
      <p className="mt-1 break-all font-mono text-sm text-ink">
        {currentId ?? 'ยังไม่ผูก'}
      </p>
      <form onSubmit={submit} className="mt-3 space-y-2">
        <label htmlFor="link-discord" className="sr-only">
          Discord ID ใหม่
        </label>
        <div className="flex gap-2">
          <input
            id="link-discord"
            className="field font-mono"
            inputMode="numeric"
            placeholder="Discord ID 15–20 หลัก"
            value={discordId}
            onChange={(event) => setDiscordId(event.target.value)}
          />
          <button
            type="submit"
            disabled={pending || !discordId}
            className="pill min-h-[44px] shrink-0 border border-paper-dim px-4 text-sm text-ink disabled:opacity-50"
          >
            {currentId ? 'เปลี่ยน' : 'ผูก'}
          </button>
        </div>
        {error ? <InlineError>{error}</InlineError> : null}
      </form>
      {currentId ? (
        <button
          type="button"
          onClick={() => setConfirmUnlink(true)}
          disabled={pending}
          className="mt-3 text-sm font-medium text-rust underline underline-offset-4 disabled:opacity-50"
        >
          ยกเลิกการผูก Discord
        </button>
      ) : null}
      <ConfirmDialog
        open={confirmUnlink}
        onOpenChange={setConfirmUnlink}
        title="ยกเลิกการผูก Discord"
        description="สมาชิกคนนี้จะเข้าสู่ระบบไม่ได้ทันที จนกว่าจะผูกบัญชีใหม่"
        confirmLabel="ยกเลิกการผูก"
        danger
        pending={pending}
        onConfirm={() => {
          void (async () => {
            await onUnlink()
            setConfirmUnlink(false)
          })()
        }}
      />
    </div>
  )
}

const RANK_OPTIONS: Array<{ value: GangRank; label: string }> = [
  { value: 'deputy', label: 'รองหัวหน้า' },
  { value: 'member', label: 'สมาชิก' },
]

function EditMemberDialog({ member, onClose }: { member: MemberRow; onClose: () => void }) {
  const { pending, run } = useAction()
  const [name, setName] = useState(member.in_game_name)
  const [phone, setPhone] = useState(member.in_game_phone ?? '')
  const [rank, setRank] = useState<GangRank>(member.gang_rank === 'head' ? 'head' : member.gang_rank)
  const [slotKind, setSlotKind] = useState<SlotKind>(member.slot_kind)
  const [slotNumber, setSlotNumber] = useState(String(member.slot_number))
  const [error, setError] = useState<string | null>(null)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    const slot = Number(slotNumber)
    if (!name.trim()) {
      setError('กรอกชื่อในเกม')
      return
    }
    if (!Number.isInteger(slot) || slot < 1 || slot > (slotKind === 'main' ? 30 : 5)) {
      setError(slotKind === 'main' ? 'ช่องหลักต้องอยู่ระหว่าง 1–30' : 'ช่องสำรองต้องอยู่ระหว่าง 1–5')
      return
    }
    const success = await run(
      () =>
        callRpc('admin_update_member', {
          p_member_id: member.id,
          p_in_game_name: name.trim(),
          p_in_game_phone: phone.trim() || null,
          p_gang_rank: rank,
          p_slot_kind: slotKind,
          p_slot_number: slot,
          p_key: newIdempotencyKey('member-update'),
        }),
      'บันทึกข้อมูลสมาชิกแล้ว',
    )
    if (success) onClose()
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()} title="แก้ไขข้อมูลสมาชิก">
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="ชื่อในเกม" htmlFor="edit-name" required>
            <input id="edit-name" className="field" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="เบอร์ในเกม" htmlFor="edit-phone">
            <input id="edit-phone" className="field" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </Field>
          <Field label="ตำแหน่งในแก๊ง" htmlFor="edit-rank">
            {member.gang_rank === 'head' ? (
              <input id="edit-rank" className="field" value="หัวหน้า" disabled />
            ) : (
              <select id="edit-rank" className="field" value={rank} onChange={(e) => setRank(e.target.value as GangRank)}>
                {RANK_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label="ประเภทช่อง" htmlFor="edit-slot-kind">
            <select
              id="edit-slot-kind"
              className="field"
              value={slotKind}
              onChange={(e) => setSlotKind(e.target.value as SlotKind)}
            >
              <option value="main">ช่องหลัก</option>
              <option value="reserve">ช่องสำรอง</option>
            </select>
          </Field>
          <Field label="หมายเลขช่อง" htmlFor="edit-slot">
            <input id="edit-slot" className="field" inputMode="numeric" value={slotNumber} onChange={(e) => setSlotNumber(e.target.value)} />
          </Field>
        </div>
        {error ? <InlineError>{error}</InlineError> : null}
        <FormActions pending={pending} onCancel={onClose}>
          <SubmitButton pending={pending}>บันทึก</SubmitButton>
        </FormActions>
      </form>
    </Dialog>
  )
}

function ArchiveDialog({
  member,
  onClose,
  onConfirm,
  pending,
}: {
  member: MemberRow
  onClose: () => void
  onConfirm: (reason: string) => void
  pending: boolean
}) {
  const [reason, setReason] = useState('')

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={`เก็บถาวร ${member.in_game_name}`}
      description="สมาชิกจะเข้าสู่ระบบไม่ได้ทันที ช่องจะว่างและประวัติทั้งหมดยังอยู่"
      size="sm"
    >
      <Field label="เหตุผล" htmlFor="archive-reason" hint="ไม่บังคับ แต่ช่วยให้ตรวจย้อนหลังได้">
        <input
          id="archive-reason"
          className="field"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          maxLength={500}
        />
      </Field>
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" onClick={onClose} className="pill border border-paper-dim text-ink">
          ยกเลิก
        </button>
        <button
          type="button"
          onClick={() => onConfirm(reason.trim())}
          disabled={pending}
          className="pill bg-rust text-paper disabled:opacity-60"
        >
          {pending ? 'กำลังเก็บ…' : 'เก็บถาวร'}
        </button>
      </div>
    </Dialog>
  )
}
