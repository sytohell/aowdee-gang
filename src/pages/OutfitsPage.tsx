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
import { useAction } from '@/lib/use-action'
import type { Outfit, OutfitCode, OutfitGender, OutfitMedia } from '@/lib/types'

type OutfitDialog =
  | { type: 'edit'; outfit?: Outfit }
  | { type: 'manage'; outfit: Outfit }
  | null

const GENDER_LABELS: Record<OutfitGender, string> = {
  male: 'ชาย',
  female: 'หญิง',
}

export function OutfitsPage() {
  const { whoami } = useAuth()
  const role = whoami?.member?.site_role
  const canEdit = role === 'owner' || role === 'editor'

  const [dialog, setDialog] = useState<OutfitDialog>(null)
  const [genderFilter, setGenderFilter] = useState<'all' | OutfitGender>('all')

  const outfitsQuery = useQuery<Outfit[]>({
    queryKey: ['outfits'],
    queryFn: async () =>
      unwrap(
        await db()
          .from('outfits')
          .select('*')
          .order('gender', { ascending: true })
          .order('set_name', { ascending: true }),
      ),
  })

  const mediaQuery = useQuery<OutfitMedia[]>({
    queryKey: ['outfit_media', 'covers'],
    queryFn: async () =>
      unwrap(
        await db()
          .from('outfit_media')
          .select('*')
          .order('sort_order', { ascending: true }),
      ),
  })

  const codesQuery = useQuery<OutfitCode[]>({
    queryKey: ['outfit_codes', 'counts'],
    queryFn: async () => unwrap(await db().from('outfit_codes').select('*')),
  })

  const media = useMemo(() => mediaQuery.data ?? [], [mediaQuery.data])
  const codes = useMemo(() => codesQuery.data ?? [], [codesQuery.data])

  const firstMedia = useMemo(() => {
    const map = new Map<string, OutfitMedia>()
    for (const item of media) {
      if (!map.has(item.outfit_id)) map.set(item.outfit_id, item)
    }
    return map
  }, [media])

  const mediaCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const item of media) counts.set(item.outfit_id, (counts.get(item.outfit_id) ?? 0) + 1)
    return counts
  }, [media])

  const codeCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const code of codes) counts.set(code.outfit_id, (counts.get(code.outfit_id) ?? 0) + 1)
    return counts
  }, [codes])

  const coverPaths = Array.from(firstMedia.values()).map((item) => item.storage_path)

  const coversQuery = useQuery<Record<string, string | null>>({
    queryKey: ['outfit_covers', coverPaths.join('|')],
    queryFn: async () => {
      const entries = await Promise.all(
        coverPaths.map(async (path) => [path, await signedUrl('outfit-media', path)] as const),
      )
      return Object.fromEntries(entries)
    },
    enabled: coverPaths.length > 0,
    staleTime: 30 * 60_000,
  })

  const covers = coversQuery.data ?? {}
  const outfits = (outfitsQuery.data ?? []).filter(
    (outfit) => genderFilter === 'all' || outfit.gender === genderFilter,
  )

  if (outfitsQuery.isPending) return <LoadingBlock />
  if (outfitsQuery.isError) {
    return (
      <ErrorBlock error={outfitsQuery.error} onRetry={() => void outfitsQuery.refetch()} />
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="ตู้เสื้อผ้า"
        title="ชุดและรหัสชุด"
        description="คลังชุดของแก๊ง พร้อมรหัสสำหรับใส่ในเกมและรูปประกอบ แยกชุดชายและชุดหญิงชัดเจน"
        actions={
          canEdit ? (
            <button
              type="button"
              className="pill pill-primary"
              onClick={() => setDialog({ type: 'edit' })}
            >
              เพิ่มชุด
            </button>
          ) : null
        }
      />

      <PaperPanel padded={false}>
        <div className="flex flex-wrap items-end justify-between gap-3 p-5 sm:p-6">
          <SectionTitle
            title="ชุดทั้งหมด"
            description={`${outfits.length} ชุดในมุมมองนี้`}
          />
          <div className="flex flex-wrap gap-2" role="group" aria-label="กรองเพศของชุด">
            {(
              [
                ['all', 'ทั้งหมด'],
                ['male', 'ชุดชาย'],
                ['female', 'ชุดหญิง'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setGenderFilter(value)}
                className={
                  genderFilter === value
                    ? 'pill min-h-[40px] bg-brass px-4 text-sm text-ground'
                    : 'pill min-h-[40px] border border-paper-dim px-4 text-sm text-ink'
                }
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {outfits.length === 0 ? (
          <div className="px-5 pb-6 sm:px-6">
            <EmptyState
              title="ยังไม่มีชุดในหมวดนี้"
              description="เพิ่มชุดพร้อมรหัสและรูป เพื่อให้สมาชิกเปิดดูและใส่ได้ตรงกัน"
              action={
                canEdit ? (
                  <button
                    type="button"
                    className="pill bg-brass text-ground"
                    onClick={() => setDialog({ type: 'edit' })}
                  >
                    เพิ่มชุดแรก
                  </button>
                ) : null
              }
            />
          </div>
        ) : (
          <div className="grid gap-4 p-5 sm:p-6 md:grid-cols-2 xl:grid-cols-3">
            {outfits.map((outfit) => {
              const cover = firstMedia.get(outfit.id)
              const coverUrl = cover ? covers[cover.storage_path] : null
              return (
                <article
                  key={outfit.id}
                  className="flex flex-col overflow-hidden rounded-card border border-paper-dim bg-[#fbf9f2]"
                >
                  <div className="aspect-[4/3] bg-paper-dim">
                    {coverUrl ? (
                      <img
                        src={coverUrl}
                        alt={`รูป ${outfit.set_name}`}
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center px-6 text-center text-sm text-ink-muted">
                        ยังไม่มีรูปของชุดนี้
                      </div>
                    )}
                  </div>
                  <div className="flex flex-1 flex-col p-5">
                    <div className="flex items-start justify-between gap-2">
                      <h2 className="text-base font-semibold text-ink">{outfit.set_name}</h2>
                      <StatusChip tone={outfit.gender === 'female' ? 'warn' : 'neutral'}>
                        {GENDER_LABELS[outfit.gender]}
                      </StatusChip>
                    </div>
                    {!outfit.is_active ? (
                      <p className="mt-2 text-xs text-rust">ปิดใช้งานอยู่</p>
                    ) : null}
                    <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-ink-muted">
                      {outfit.description || 'ไม่มีคำอธิบาย'}
                    </p>
                    <div className="mt-auto flex flex-wrap items-center gap-2 pt-4 text-xs text-ink-muted">
                      <span>{mediaCounts.get(outfit.id) ?? 0} รูป</span>
                      <span aria-hidden>·</span>
                      <span>{codeCounts.get(outfit.id) ?? 0} รหัส</span>
                    </div>
                    <div className="flex flex-wrap gap-2 pt-3">
                      <RowButton onClick={() => setDialog({ type: 'manage', outfit })}>
                        ดูรหัสและรูป
                      </RowButton>
                      {canEdit ? (
                        <RowButton onClick={() => setDialog({ type: 'edit', outfit })}>
                          แก้ไข
                        </RowButton>
                      ) : null}
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </PaperPanel>

      {dialog?.type === 'edit' ? (
        <OutfitFormDialog outfit={dialog.outfit} onClose={() => setDialog(null)} />
      ) : null}
      {dialog?.type === 'manage' ? (
        <ManageOutfitDialog
          outfit={dialog.outfit}
          canEdit={canEdit}
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

function OutfitFormDialog({ outfit, onClose }: { outfit?: Outfit; onClose: () => void }) {
  const { pending, run } = useAction()
  const [gender, setGender] = useState<OutfitGender>(outfit?.gender ?? 'male')
  const [setName, setSetName] = useState(outfit?.set_name ?? '')
  const [description, setDescription] = useState(outfit?.description ?? '')
  const [isActive, setIsActive] = useState(outfit?.is_active ?? true)
  const [error, setError] = useState<string | null>(null)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    if (!setName.trim()) {
      setError('กรอกชื่อชุด')
      return
    }
    const success = await run(
      () =>
        callRpc('editor_save_outfit', {
          p_outfit_id: outfit?.id ?? null,
          p_gender: gender,
          p_set_name: setName.trim(),
          p_description: description.trim() || null,
          p_is_active: isActive,
          p_key: newIdempotencyKey('outfit-save'),
        }),
      outfit ? 'บันทึกชุดแล้ว' : 'เพิ่มชุดแล้ว',
    )
    if (success) onClose()
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={outfit ? 'แก้ไขชุด' : 'เพิ่มชุด'}
      description="ชื่อชุดควรตรงกับที่สมาชิกเรียกกันจริง เพื่อให้ค้นหาและใส่ชุดได้ตรงกัน"
    >
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="เพศ" htmlFor="outfit-gender">
            <select
              id="outfit-gender"
              className="field"
              value={gender}
              onChange={(event) => setGender(event.target.value as OutfitGender)}
            >
              <option value="male">ชุดชาย</option>
              <option value="female">ชุดหญิง</option>
            </select>
          </Field>
          <Field label="ชื่อชุด" htmlFor="outfit-name" required>
            <input
              id="outfit-name"
              className="field"
              value={setName}
              onChange={(event) => setSetName(event.target.value)}
              maxLength={80}
            />
          </Field>
        </div>
        <Field label="คำอธิบาย" htmlFor="outfit-description" hint="ไม่บังคับ · ไม่เกิน 2,000 ตัวอักษร">
          <textarea
            id="outfit-description"
            className="field"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            maxLength={2000}
          />
        </Field>
        <label className="flex min-h-[44px] items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(event) => setIsActive(event.target.checked)}
            className="h-4 w-4 accent-[#a98f4f]"
          />
          เปิดให้สมาชิกใช้ชุดนี้
        </label>
        {error ? <InlineError>{error}</InlineError> : null}
        <FormActions pending={pending} onCancel={onClose}>
          <SubmitButton pending={pending}>{outfit ? 'บันทึก' : 'เพิ่มชุด'}</SubmitButton>
        </FormActions>
      </form>
    </Dialog>
  )
}

function ManageOutfitDialog({
  outfit,
  canEdit,
  onClose,
}: {
  outfit: Outfit
  canEdit: boolean
  onClose: () => void
}) {
  const { pending, run } = useAction()
  const [code, setCode] = useState('')
  const [label, setLabel] = useState('ชุด')
  const [file, setFile] = useState<File | null>(null)
  const [altText, setAltText] = useState('')
  const [removeCodeTarget, setRemoveCodeTarget] = useState<OutfitCode | null>(null)
  const [removeMediaTarget, setRemoveMediaTarget] = useState<OutfitMedia | null>(null)
  const [error, setError] = useState<string | null>(null)

  const codesQuery = useQuery<OutfitCode[]>({
    queryKey: ['outfit_codes', outfit.id],
    queryFn: async () =>
      unwrap(
        await db()
          .from('outfit_codes')
          .select('*')
          .eq('outfit_id', outfit.id)
          .order('sort_order', { ascending: true }),
      ),
  })

  const mediaQuery = useQuery<OutfitMedia[]>({
    queryKey: ['outfit_media', outfit.id],
    queryFn: async () =>
      unwrap(
        await db()
          .from('outfit_media')
          .select('*')
          .eq('outfit_id', outfit.id)
          .order('sort_order', { ascending: true }),
      ),
  })

  const media = mediaQuery.data ?? []
  const codes = codesQuery.data ?? []
  const paths = media.map((item) => item.storage_path)

  const urlsQuery = useQuery<Record<string, string | null>>({
    queryKey: ['outfit_media_urls', outfit.id, paths.join('|')],
    queryFn: async () => {
      const entries = await Promise.all(
        paths.map(async (path) => [path, await signedUrl('outfit-media', path)] as const),
      )
      return Object.fromEntries(entries)
    },
    enabled: paths.length > 0,
    staleTime: 30 * 60_000,
  })

  const urls = urlsQuery.data ?? {}

  async function addCode(event: FormEvent) {
    event.preventDefault()
    setError(null)
    if (!code.trim()) {
      setError('กรอกรหัสชุด')
      return
    }
    const success = await run(
      () =>
        callRpc('editor_add_outfit_code', {
          p_outfit_id: outfit.id,
          p_code: code.trim(),
          p_label: label.trim() || 'ชุด',
          p_sort_order: codes.length,
          p_key: newIdempotencyKey('outfit-code'),
        }),
      'เพิ่มรหัสชุดแล้ว',
    )
    if (success) {
      setCode('')
      setLabel('ชุด')
    }
  }

  async function addMedia(event: FormEvent) {
    event.preventDefault()
    setError(null)
    if (!file) {
      setError('เลือกไฟล์รูปก่อน')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('ไฟล์ต้องมีขนาดไม่เกิน 5 MB')
      return
    }
    const success = await run(
      async () => {
        const path = await uploadImage('outfit-media', file)
        await callRpc('editor_add_outfit_media', {
          p_outfit_id: outfit.id,
          p_storage_path: path,
          p_alt_text: altText.trim() || null,
          p_sort_order: media.length,
          p_key: newIdempotencyKey('outfit-media'),
        })
      },
      'เพิ่มรูปชุดแล้ว',
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
      title={`ชุด · ${outfit.set_name}`}
      description={`${GENDER_LABELS[outfit.gender]} · รหัสและรูปใช้ร่วมกันทั้งแก๊ง`}
      size="lg"
    >
      <section>
        <SectionTitle title="รหัสชุด" description="คัดลอกรหัสไปใส่ในเกมได้ทันที" />
        {codesQuery.isPending ? (
          <div className="mt-4">
            <LoadingBlock />
          </div>
        ) : codes.length === 0 ? (
          <p className="mt-4 text-sm text-ink-muted">ยังไม่มีรหัสสำหรับชุดนี้</p>
        ) : (
          <ul className="mt-4 divide-y divide-[#e7dfcd] rounded-control border border-paper-dim">
            {codes.map((item) => (
              <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
                <div className="min-w-0">
                  <p className="text-xs text-ink-muted">{item.label}</p>
                  <p className="mt-0.5 break-all font-mono text-sm text-ink">{item.code}</p>
                </div>
                <div className="flex items-center gap-3">
                  <CopyButton value={item.code} />
                  {canEdit ? (
                    <button
                      type="button"
                      onClick={() => setRemoveCodeTarget(item)}
                      className="text-xs font-medium text-rust underline underline-offset-4"
                    >
                      ลบ
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}

        {canEdit ? (
          <form onSubmit={addCode} className="mt-4 flex flex-wrap items-end gap-3">
            <div className="min-w-[12rem] flex-1">
              <Field label="รหัส" htmlFor="outfit-code" required>
                <input
                  id="outfit-code"
                  className="field font-mono"
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  maxLength={60}
                />
              </Field>
            </div>
            <div className="min-w-[9rem] flex-1">
              <Field label="ชื่อรหัส" htmlFor="outfit-code-label">
                <input
                  id="outfit-code-label"
                  className="field"
                  value={label}
                  onChange={(event) => setLabel(event.target.value)}
                  maxLength={40}
                />
              </Field>
            </div>
            <button
              type="submit"
              disabled={pending}
              className="pill min-h-[44px] bg-brass px-5 text-sm text-ground disabled:opacity-60"
            >
              เพิ่มรหัส
            </button>
          </form>
        ) : null}
      </section>

      <section className="mt-7 border-t border-paper-dim pt-6">
        <SectionTitle title="รูปชุด" description="รูปถูกเก็บในถังส่วนตัวและเปิดผ่านลิงก์ชั่วคราว" />
        {mediaQuery.isPending ? (
          <div className="mt-4">
            <LoadingBlock />
          </div>
        ) : media.length === 0 ? (
          <p className="mt-4 text-sm text-ink-muted">ยังไม่มีรูปของชุดนี้</p>
        ) : (
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {media.map((item) => (
              <figure
                key={item.id}
                className="overflow-hidden rounded-control border border-paper-dim bg-[#fbf9f2]"
              >
                <div className="aspect-square bg-paper-dim">
                  {urls[item.storage_path] ? (
                    <img
                      src={urls[item.storage_path] ?? ''}
                      alt={item.alt_text ?? 'รูปชุด'}
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-xs text-ink-muted">
                      กำลังโหลด…
                    </div>
                  )}
                </div>
                {canEdit ? (
                  <figcaption className="p-2 text-right">
                    <button
                      type="button"
                      onClick={() => setRemoveMediaTarget(item)}
                      className="text-xs font-medium text-rust underline underline-offset-4"
                    >
                      ลบรูป
                    </button>
                  </figcaption>
                ) : null}
              </figure>
            ))}
          </div>
        )}

        {canEdit ? (
          <form onSubmit={addMedia} className="mt-4 space-y-3">
            <Field label="ไฟล์รูป" htmlFor="outfit-media-file" hint="JPG, PNG หรือ WebP ไม่เกิน 5 MB">
              <input
                id="outfit-media-file"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="field"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              />
            </Field>
            <Field label="คำอธิบายรูป" htmlFor="outfit-media-alt" hint="ไม่บังคับ">
              <input
                id="outfit-media-alt"
                className="field"
                value={altText}
                onChange={(event) => setAltText(event.target.value)}
                maxLength={200}
              />
            </Field>
            <div className="flex justify-end">
              <SubmitButton pending={pending}>อัปโหลดและเพิ่มรูป</SubmitButton>
            </div>
          </form>
        ) : null}
        {error ? <div className="mt-3"><InlineError>{error}</InlineError></div> : null}
      </section>

      <ConfirmDialog
        open={removeCodeTarget !== null}
        onOpenChange={(open) => !open && setRemoveCodeTarget(null)}
        title="ลบรหัสชุด"
        description="รหัสจะหายจากรายการ แต่ประวัติการเพิ่ม–ลบยังอยู่ในบันทึกระบบ"
        confirmLabel="ลบรหัส"
        danger
        pending={pending}
        onConfirm={() => {
          void (async () => {
            if (!removeCodeTarget) return
            const success = await run(
              () =>
                callRpc('editor_remove_outfit_code', {
                  p_code_id: removeCodeTarget.id,
                  p_key: newIdempotencyKey('outfit-code-remove'),
                }),
              'ลบรหัสชุดแล้ว',
            )
            if (success) setRemoveCodeTarget(null)
          })()
        }}
      />

      <ConfirmDialog
        open={removeMediaTarget !== null}
        onOpenChange={(open) => !open && setRemoveMediaTarget(null)}
        title="ลบรูปชุด"
        description="รูปจะถูกถอดออกจากชุด ประวัติการเพิ่มรูปยังอยู่ในบันทึกระบบ"
        confirmLabel="ลบรูป"
        danger
        pending={pending}
        onConfirm={() => {
          void (async () => {
            if (!removeMediaTarget) return
            const success = await run(
              () =>
                callRpc('editor_remove_outfit_media', {
                  p_media_id: removeMediaTarget.id,
                  p_key: newIdempotencyKey('outfit-media-remove'),
                }),
              'ลบรูปชุดแล้ว',
            )
            if (success) setRemoveMediaTarget(null)
          })()
        }}
      />
    </Dialog>
  )
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  return (
    <button
      type="button"
      onClick={() => void copy()}
      className="text-xs font-medium text-ink-muted underline underline-offset-4 hover:text-ink"
    >
      {copied ? 'คัดลอกแล้ว' : 'คัดลอก'}
    </button>
  )
}
