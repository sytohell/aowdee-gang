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
} from '@/components/ui'
import { callRpc, newIdempotencyKey, signedUrl, uploadImage } from '@/lib/api'
import { db, unwrap } from '@/lib/db'
import { bangkokInputToIso, formatDateTime, isoToBangkokInput } from '@/lib/format'
import { useAction } from '@/lib/use-action'
import type { Activity, ActivityMedia, AnnouncementStatus } from '@/lib/types'
import { ACTIVITY_STATUS_LABELS } from '@/lib/types'

type ActivityDialog =
  | { type: 'edit'; activity?: Activity }
  | { type: 'media'; activity: Activity }
  | { type: 'archive'; activity: Activity }
  | null

function statusTone(status: AnnouncementStatus): 'ok' | 'warn' | 'neutral' | 'danger' {
  if (status === 'active') return 'ok'
  if (status === 'upcoming') return 'warn'
  if (status === 'cancelled') return 'danger'
  return 'neutral'
}

export function ActivitiesPage() {
  const { whoami } = useAuth()
  const role = whoami?.member?.site_role
  const canEdit = role === 'owner' || role === 'editor'

  const [dialog, setDialog] = useState<ActivityDialog>(null)
  const [showArchived, setShowArchived] = useState(false)

  const activitiesQuery = useQuery<Activity[]>({
    queryKey: ['announcements', 'all'],
    queryFn: async () =>
      unwrap(
        await db()
          .from('announcements')
          .select('*')
          .order('pinned', { ascending: false })
          .order('starts_at', { ascending: false, nullsFirst: false })
          .order('created_at', { ascending: false }),
      ),
  })

  const mediaQuery = useQuery<ActivityMedia[]>({
    queryKey: ['announcement_media', 'counts'],
    queryFn: async () => unwrap(await db().from('announcement_media').select('*')),
  })

  const mediaCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const media of mediaQuery.data ?? []) {
      counts.set(media.announcement_id, (counts.get(media.announcement_id) ?? 0) + 1)
    }
    return counts
  }, [mediaQuery.data])

  const activities = (activitiesQuery.data ?? []).filter(
    (activity) => showArchived || activity.archived_at === null,
  )

  if (activitiesQuery.isPending) return <LoadingBlock />
  if (activitiesQuery.isError) {
    return (
      <ErrorBlock
        error={activitiesQuery.error}
        onRetry={() => void activitiesQuery.refetch()}
      />
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="ประกาศและกิจกรรม"
        title="กิจกรรมแก๊ง"
        description="ประกาศ กิจกรรม และรูปภาพของแก๊ง ทุกการแก้ไขถูกบันทึกพร้อมผู้ทำรายการ"
        actions={
          canEdit ? (
            <button
              type="button"
              className="pill pill-primary"
              onClick={() => setDialog({ type: 'edit' })}
            >
              เพิ่มประกาศ
            </button>
          ) : null
        }
      />

      <PaperPanel padded={false}>
        <div className="flex flex-wrap items-center justify-between gap-3 p-5 sm:p-6">
          <SectionTitle title="ประกาศทั้งหมด" description="ปักหมุดจะอยู่บนสุดเสมอ" />
          <label className="flex min-h-[44px] items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(event) => setShowArchived(event.target.checked)}
              className="h-4 w-4 accent-[#a98f4f]"
            />
            แสดงที่เก็บถาวรแล้ว
          </label>
        </div>

        {activities.length === 0 ? (
          <div className="px-5 pb-6 sm:px-6">
            <EmptyState
              title={showArchived ? 'ยังไม่มีประกาศในระบบ' : 'ยังไม่มีประกาศที่ใช้งานอยู่'}
              description={
                showArchived
                  ? 'เริ่มจากเพิ่มประกาศแรกของแก๊ง พร้อมวันเวลาและรายละเอียดที่สมาชิกต้องรู้'
                  : 'ประกาศที่ถูกเก็บถาวรแล้วจะแสดงเมื่อเปิดตัวเลือกด้านบน'
              }
              action={
                canEdit ? (
                  <button
                    type="button"
                    className="pill bg-brass text-ground"
                    onClick={() => setDialog({ type: 'edit' })}
                  >
                    เพิ่มประกาศแรก
                  </button>
                ) : null
              }
            />
          </div>
        ) : (
          <ul className="divide-y divide-[#e7dfcd]">
            {activities.map((activity) => (
              <li key={activity.id} className="px-5 py-5 sm:px-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      {activity.pinned ? <StatusChip tone="warn">ปักหมุด</StatusChip> : null}
                      <StatusChip tone={statusTone(activity.status)}>
                        {ACTIVITY_STATUS_LABELS[activity.status]}
                      </StatusChip>
                      {activity.archived_at ? (
                        <StatusChip tone="neutral">เก็บถาวร</StatusChip>
                      ) : null}
                    </div>
                    <h2 className="mt-2 text-lg font-semibold text-ink">{activity.title}</h2>
                    <p className="mt-1 text-sm text-ink-muted">
                      {activity.starts_at
                        ? `เริ่ม ${formatDateTime(activity.starts_at)}`
                        : 'ยังไม่กำหนดเวลาเริ่ม'}
                      {activity.ends_at ? ` · สิ้นสุด ${formatDateTime(activity.ends_at)}` : ''}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <RowButton onClick={() => setDialog({ type: 'media', activity })}>
                      รูปภาพ {mediaCounts.get(activity.id) ?? 0}
                    </RowButton>
                    {canEdit ? (
                      <>
                        <RowButton onClick={() => setDialog({ type: 'edit', activity })}>
                          แก้ไข
                        </RowButton>
                        <RowButton onClick={() => setDialog({ type: 'archive', activity })}>
                          {activity.archived_at ? 'นำกลับ' : 'เก็บถาวร'}
                        </RowButton>
                      </>
                    ) : null}
                  </div>
                </div>

                {activity.body ? (
                  <p className="mt-3 max-w-[80ch] whitespace-pre-line text-sm leading-relaxed text-ink">
                    {activity.body}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </PaperPanel>

      {dialog?.type === 'edit' ? (
        <AnnouncementDialog activity={dialog.activity} onClose={() => setDialog(null)} />
      ) : null}
      {dialog?.type === 'media' ? (
        <MediaDialog
          activity={dialog.activity}
          canEdit={canEdit}
          onClose={() => setDialog(null)}
        />
      ) : null}
      {dialog?.type === 'archive' ? (
        <ArchiveDialog
          activity={dialog.activity}
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

function AnnouncementDialog({
  activity,
  onClose,
}: {
  activity?: Activity
  onClose: () => void
}) {
  const { pending, run } = useAction()
  const [title, setTitle] = useState(activity?.title ?? '')
  const [body, setBody] = useState(activity?.body ?? '')
  const [status, setStatus] = useState<AnnouncementStatus>(activity?.status ?? 'upcoming')
  const [startsAt, setStartsAt] = useState(isoToBangkokInput(activity?.starts_at))
  const [endsAt, setEndsAt] = useState(isoToBangkokInput(activity?.ends_at))
  const [pinned, setPinned] = useState(activity?.pinned ?? false)
  const [error, setError] = useState<string | null>(null)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    if (!title.trim()) {
      setError('กรอกหัวข้อประกาศ')
      return
    }
    const startIso = startsAt ? bangkokInputToIso(startsAt) : null
    const endIso = endsAt ? bangkokInputToIso(endsAt) : null
    if (startsAt && !startIso) {
      setError('เวลาเริ่มไม่ถูกต้อง')
      return
    }
    if (endsAt && !endIso) {
      setError('เวลาสิ้นสุดไม่ถูกต้อง')
      return
    }
    if (startIso && endIso && new Date(endIso) <= new Date(startIso)) {
      setError('เวลาสิ้นสุดต้องอยู่หลังเวลาเริ่ม')
      return
    }
    const success = await run(
      () =>
        callRpc('editor_save_announcement', {
          p_announcement_id: activity?.id ?? null,
          p_title: title.trim(),
          p_body: body.trim() || null,
          p_status: status,
          p_starts_at: startIso,
          p_ends_at: endIso,
          p_pinned: pinned,
          p_key: newIdempotencyKey('announcement-save'),
        }),
      activity ? 'บันทึกประกาศแล้ว' : 'เพิ่มประกาศแล้ว',
    )
    if (success) onClose()
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={activity ? 'แก้ไขประกาศ' : 'เพิ่มประกาศ'}
      description="เวลาเป็นเวลาไทย (Asia/Bangkok) และระบบเก็บเป็น UTC"
      size="lg"
    >
      <form onSubmit={submit} className="space-y-4">
        <Field label="หัวข้อ" htmlFor="announcement-title" required>
          <input
            id="announcement-title"
            className="field"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={120}
          />
        </Field>

        <Field label="รายละเอียด" htmlFor="announcement-body" hint="ไม่บังคับ · ไม่เกิน 5,000 ตัวอักษร">
          <textarea
            id="announcement-body"
            className="field"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            maxLength={5000}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="สถานะ" htmlFor="announcement-status">
            <select
              id="announcement-status"
              className="field"
              value={status}
              onChange={(event) => setStatus(event.target.value as AnnouncementStatus)}
            >
              {(Object.keys(ACTIVITY_STATUS_LABELS) as AnnouncementStatus[]).map((option) => (
                <option key={option} value={option}>
                  {ACTIVITY_STATUS_LABELS[option]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="เริ่ม" htmlFor="announcement-start">
            <input
              id="announcement-start"
              type="datetime-local"
              className="field"
              value={startsAt}
              onChange={(event) => setStartsAt(event.target.value)}
            />
          </Field>
          <Field label="สิ้นสุด" htmlFor="announcement-end">
            <input
              id="announcement-end"
              type="datetime-local"
              className="field"
              value={endsAt}
              onChange={(event) => setEndsAt(event.target.value)}
            />
          </Field>
        </div>

        <label className="flex min-h-[44px] items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            checked={pinned}
            onChange={(event) => setPinned(event.target.checked)}
            className="h-4 w-4 accent-[#a98f4f]"
          />
          ปักหมุดไว้บนสุดของรายการ
        </label>

        {error ? <InlineError>{error}</InlineError> : null}
        <FormActions pending={pending} onCancel={onClose}>
          <SubmitButton pending={pending}>{activity ? 'บันทึก' : 'เพิ่มประกาศ'}</SubmitButton>
        </FormActions>
      </form>
    </Dialog>
  )
}

function MediaDialog({
  activity,
  canEdit,
  onClose,
}: {
  activity: Activity
  canEdit: boolean
  onClose: () => void
}) {
  const { pending, run } = useAction()
  const [file, setFile] = useState<File | null>(null)
  const [altText, setAltText] = useState('')
  const [removeTarget, setRemoveTarget] = useState<ActivityMedia | null>(null)
  const [error, setError] = useState<string | null>(null)

  const mediaQuery = useQuery<ActivityMedia[]>({
    queryKey: ['announcement_media', activity.id],
    queryFn: async () =>
      unwrap(
        await db()
          .from('announcement_media')
          .select('*')
          .eq('announcement_id', activity.id)
          .order('sort_order', { ascending: true }),
      ),
  })

  const media = mediaQuery.data ?? []
  const paths = media.map((item) => item.storage_path)

  const urlsQuery = useQuery<Record<string, string | null>>({
    queryKey: ['announcement_media_urls', activity.id, paths.join('|')],
    queryFn: async () => {
      const entries = await Promise.all(
        paths.map(async (path) => [path, await signedUrl('activity-media', path)] as const),
      )
      return Object.fromEntries(entries)
    },
    enabled: paths.length > 0,
    staleTime: 30 * 60_000,
  })

  const urls = urlsQuery.data ?? {}

  async function addMedia(event: FormEvent) {
    event.preventDefault()
    setError(null)
    if (!file) {
      setError('เลือกไฟล์รูปก่อน')
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      setError('ไฟล์ต้องมีขนาดไม่เกิน 10 MB')
      return
    }
    const success = await run(
      async () => {
        const path = await uploadImage('activity-media', file)
        await callRpc('editor_add_announcement_media', {
          p_announcement_id: activity.id,
          p_storage_path: path,
          p_alt_text: altText.trim() || null,
          p_sort_order: media.length,
          p_key: newIdempotencyKey('announcement-media'),
        })
      },
      'เพิ่มรูปในประกาศแล้ว',
    )
    if (success) {
      setFile(null)
      setAltText('')
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={`รูปภาพ · ${activity.title}`}
      description="รูปถูกเก็บในถังส่วนตัวและเปิดผ่านลิงก์ชั่วคราวเท่านั้น"
      size="lg"
    >
      {mediaQuery.isPending ? (
        <LoadingBlock />
      ) : mediaQuery.isError ? (
        <ErrorBlock error={mediaQuery.error} onRetry={() => void mediaQuery.refetch()} />
      ) : media.length === 0 ? (
        <p className="text-sm text-ink-muted">ยังไม่มีรูปในประกาศนี้</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {media.map((item) => (
            <figure
              key={item.id}
              className="overflow-hidden rounded-control border border-paper-dim bg-[#fbf9f2]"
            >
              <div className="aspect-[4/3] bg-paper-dim">
                {urls[item.storage_path] ? (
                  <img
                    src={urls[item.storage_path] ?? ''}
                    alt={item.alt_text ?? 'รูปกิจกรรม'}
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-ink-muted">
                    กำลังโหลดรูป…
                  </div>
                )}
              </div>
              <figcaption className="flex items-center justify-between gap-2 p-3">
                <span className="text-xs text-ink-muted">{item.alt_text ?? 'ไม่มีคำอธิบาย'}</span>
                {canEdit ? (
                  <button
                    type="button"
                    onClick={() => setRemoveTarget(item)}
                    className="text-xs font-medium text-rust underline underline-offset-4"
                  >
                    ลบ
                  </button>
                ) : null}
              </figcaption>
            </figure>
          ))}
        </div>
      )}

      {canEdit ? (
        <form
          onSubmit={addMedia}
          className="mt-6 space-y-4 border-t border-paper-dim pt-5"
        >
          <p className="t-label text-ink">เพิ่มรูป</p>
          <Field label="ไฟล์รูป" htmlFor="media-file" hint="JPG, PNG หรือ WebP ไม่เกิน 10 MB">
            <input
              id="media-file"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="field"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
          </Field>
          <Field label="คำอธิบายรูป" htmlFor="media-alt" hint="ไม่บังคับ · ช่วยให้ผู้ใช้ screen reader เข้าใจรูป">
            <input
              id="media-alt"
              className="field"
              value={altText}
              onChange={(event) => setAltText(event.target.value)}
              maxLength={200}
            />
          </Field>
          {error ? <InlineError>{error}</InlineError> : null}
          <div className="flex justify-end">
            <SubmitButton pending={pending}>อัปโหลดและเพิ่มรูป</SubmitButton>
          </div>
        </form>
      ) : null}

      <ConfirmDialog
        open={removeTarget !== null}
        onOpenChange={(open) => !open && setRemoveTarget(null)}
        title="ลบรูปออกจากประกาศ"
        description="ลบได้เฉพาะรายการรูปในประกาศนี้ ประวัติการเพิ่มรูปยังอยู่ในบันทึกระบบ"
        confirmLabel="ลบรูป"
        danger
        pending={pending}
        onConfirm={() => {
          void (async () => {
            if (!removeTarget) return
            const success = await run(
              () =>
                callRpc('editor_remove_announcement_media', {
                  p_media_id: removeTarget.id,
                  p_key: newIdempotencyKey('announcement-media-remove'),
                }),
              'ลบรูปแล้ว',
            )
            if (success) setRemoveTarget(null)
          })()
        }}
      />
    </Dialog>
  )
}

function ArchiveDialog({ activity, onClose }: { activity: Activity; onClose: () => void }) {
  const { pending, run } = useAction()
  const archived = activity.archived_at !== null

  return (
    <ConfirmDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={archived ? 'นำประกาศกลับมาใช้' : 'เก็บประกาศถาวร'}
      description={
        archived
          ? 'ประกาศจะกลับมาแสดงในรายการปกติ และยังคงรูปภาพทั้งหมดไว้'
          : 'ประกาศจะหายจากรายการปกติ แต่ยังเปิดดูย้อนหลังได้เมื่อเปิดตัวเลือกแสดงที่เก็บถาวร'
      }
      confirmLabel={archived ? 'นำกลับ' : 'เก็บถาวร'}
      danger={!archived}
      pending={pending}
      onConfirm={() => {
        void (async () => {
          const success = await run(
            () =>
              callRpc('editor_archive_announcement', {
                p_announcement_id: activity.id,
                p_archived: !archived,
                p_key: newIdempotencyKey('announcement-archive'),
              }),
            archived ? 'นำประกาศกลับแล้ว' : 'เก็บประกาศถาวรแล้ว',
          )
          if (success) onClose()
        })()
      }}
    />
  )
}
