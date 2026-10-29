import { useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { useAuth } from '@/auth/AuthProvider'
import {
  EmptyState,
  ErrorBlock,
  LoadingBlock,
  PageHeader,
  PaperPanel,
  SectionTitle,
  TableCell,
  TableHeadCell,
  TableShell,
} from '@/components/ui'
import { callRpc } from '@/lib/api'
import { db, unwrap } from '@/lib/db'
import { formatDateTime } from '@/lib/format'
import type { AuditEvent, MemberRow } from '@/lib/types'

type IdentityRow = {
  member_id: string
  in_game_name: string
  discord_user_id: string
  linked_at: string
}

export function AdminPage() {
  const { whoami } = useAuth()
  const role = whoami?.member?.site_role
  const isOwner = role === 'owner'
  const canEdit = role === 'owner' || role === 'editor'

  const [search, setSearch] = useState('')

  const membersQuery = useQuery<MemberRow[]>({
    queryKey: ['members', 'names'],
    queryFn: async () =>
      unwrap(await db().from('members').select('*').order('in_game_name', { ascending: true })),
  })

  const identitiesQuery = useQuery<IdentityRow[]>({
    queryKey: ['owner_list_identities'],
    queryFn: () => callRpc<IdentityRow[]>('owner_list_identities'),
    enabled: isOwner,
  })

  const auditQuery = useQuery<AuditEvent[]>({
    queryKey: ['audit_events'],
    queryFn: async () =>
      unwrap(
        await db()
          .from('audit_events')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(200),
      ),
    enabled: canEdit,
  })

  const names = useMemo(() => {
    const map = new Map<string, string>()
    for (const member of membersQuery.data ?? []) map.set(member.id, member.in_game_name)
    return map
  }, [membersQuery.data])

  const events = useMemo(() => {
    const needle = search.trim().toLowerCase()
    const all = auditEventsOf(auditQuery.data)
    if (!needle) return all
    return all.filter((event) => {
      const actor = (actorName(names, event) ?? '').toLowerCase()
      return (
        event.entity.toLowerCase().includes(needle) ||
        event.event_type.toLowerCase().includes(needle) ||
        actor.includes(needle)
      )
    })
  }, [auditQuery.data, names, search])

  if (!canEdit) {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="จัดการระบบ"
          title="พื้นที่ของเจ้าของและผู้แก้ไข"
          description="บัญชีผู้อ่านดูข้อมูลได้ แต่ไม่เห็นบันทึกการตรวจสอบหรือข้อมูล Discord"
        />
        <EmptyState
          title="ไม่มีสิทธิ์เข้าถึงส่วนนี้"
          description="หากต้องการสิทธิ์แก้ไข ให้เจ้าของระบบเปลี่ยนสิทธิ์ที่หน้าสมาชิกของบัญชีคุณ"
        />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="จัดการระบบ"
        title="บัญชีและบันทึกตรวจสอบ"
        description="ทุกการกระทำที่เปลี่ยนข้อมูลจะถูกบันทึกพร้อมผู้ทำรายการและเวลา ไม่มีการแก้ไขประวัติ"
      />

      <PaperPanel>
        <SectionTitle
          title="หลักการดูแลระบบ"
          description="อ่านก่อนโอนสิทธิ์หรือผูกบัญชี Discord"
        />
        <ul className="mt-4 space-y-3 text-sm leading-relaxed text-ink">
          <li className="rounded-control border border-paper-dim bg-[#fbf9f2] p-3">
            <span className="font-medium">เจ้าของมีได้หนึ่งคน</span> — การโอนสิทธิ์เจ้าของทำได้จากหน้า
            สมาชิกของสมาชิกคนใหม่ หลังโอนแล้วบัญชีเดิมจะเหลือสิทธิ์ผู้แก้ไข
          </li>
          <li className="rounded-control border border-paper-dim bg-[#fbf9f2] p-3">
            <span className="font-medium">Discord ID ของเจ้าของถูกตรึงไว้</span> — เปลี่ยนจากหน้านี้ไม่ได้
            เพื่อกันการยึดบัญชี หากจำเป็นต้องเปลี่ยน ให้แก้ที่ฐานข้อมูลโดยผู้ดูแลระบบเท่านั้น
          </li>
          <li className="rounded-control border border-paper-dim bg-[#fbf9f2] p-3">
            <span className="font-medium">ผู้อ่านไม่เห็น Discord ID</span> — เห็นเพียงสถานะผูกแล้วหรือยัง
            และไม่เห็นบันทึกการตรวจสอบ
          </li>
          <li className="rounded-control border border-paper-dim bg-[#fbf9f2] p-3">
            <span className="font-medium">ทุกอย่างย้อนกลับได้โดยไม่ลบประวัติ</span> — ค่าหัว คลังของ
            การเงิน และแต้มใช้รายการกลับรายการ ไม่เขียนทับข้อมูลเดิม
          </li>
        </ul>
      </PaperPanel>

      {isOwner ? (
        <PaperPanel padded={false}>
          <div className="p-5 sm:p-6">
            <SectionTitle
              title="บัญชี Discord ที่ผูกอยู่"
              description="แสดงเฉพาะเจ้าของระบบ · ใช้ตรวจว่าบัญชีไหนเข้าถึงระบบนี้ได้"
            />
          </div>
          {identitiesQuery.isPending ? (
            <div className="px-5 pb-5 sm:px-6">
              <LoadingBlock />
            </div>
          ) : identitiesQuery.isError ? (
            <div className="px-5 pb-5 sm:px-6">
              <ErrorBlock
                error={identitiesQuery.error}
                onRetry={() => void identitiesQuery.refetch()}
              />
            </div>
          ) : (identitiesQuery.data ?? []).length === 0 ? (
            <div className="px-5 pb-6 sm:px-6">
              <p className="text-sm text-ink-muted">ยังไม่มีบัญชี Discord ที่ผูกกับสมาชิก</p>
            </div>
          ) : (
            <TableShell>
              <thead>
                <tr>
                  <TableHeadCell>สมาชิก</TableHeadCell>
                  <TableHeadCell>Discord ID</TableHeadCell>
                  <TableHeadCell>ผูกเมื่อ</TableHeadCell>
                  <TableHeadCell>เปิดหน้า</TableHeadCell>
                </tr>
              </thead>
              <tbody>
                {(identitiesQuery.data ?? []).map((identity) => (
                  <tr key={identity.member_id}>
                    <TableCell className="font-medium text-ink">{identity.in_game_name}</TableCell>
                    <TableCell>
                      <span className="break-all font-mono text-xs text-ink">
                        {identity.discord_user_id}
                      </span>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-ink-muted">
                      {formatDateTime(identity.linked_at)}
                    </TableCell>
                    <TableCell>
                      <Link
                        to={`/app/members/${identity.member_id}`}
                        className="text-sm font-medium text-brass-deep underline underline-offset-4"
                      >
                        ดูสมาชิก
                      </Link>
                    </TableCell>
                  </tr>
                ))}
              </tbody>
            </TableShell>
          )}
        </PaperPanel>
      ) : (
        <PaperPanel>
          <SectionTitle title="บัญชี Discord" description="เฉพาะเจ้าของระบบเท่านั้นที่ดูได้" />
          <p className="mt-3 text-sm text-ink-muted">
            คุณเป็นผู้แก้ไข จึงเห็นบันทึกการตรวจสอบได้ แต่ไม่เห็น Discord ID ของสมาชิก
          </p>
        </PaperPanel>
      )}

      <PaperPanel padded={false}>
        <div className="flex flex-wrap items-end justify-between gap-3 p-5 sm:p-6">
          <SectionTitle
            title="บันทึกการตรวจสอบ"
            description="200 รายการล่าสุด · เฉพาะเจ้าของและผู้แก้ไข"
          />
          <div className="w-full max-w-xs">
            <label htmlFor="audit-search" className="t-label block text-ink">
              ค้นหา
            </label>
            <input
              id="audit-search"
              className="field mt-1.5"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="ประเภทเหตุการณ์หรือชื่อผู้ทำ"
            />
          </div>
        </div>

        {auditQuery.isPending ? (
          <div className="px-5 pb-5 sm:px-6">
            <LoadingBlock />
          </div>
        ) : auditQuery.isError ? (
          <div className="px-5 pb-6 sm:px-6">
            <ErrorBlock error={auditQuery.error} onRetry={() => void auditQuery.refetch()} />
          </div>
        ) : events.length === 0 ? (
          <div className="px-5 pb-6 sm:px-6">
            <p className="text-sm text-ink-muted">
              {auditEventsOf(auditQuery.data).length === 0
                ? 'ยังไม่มีบันทึกการตรวจสอบในระบบ'
                : 'ไม่พบบันทึกที่ตรงกับคำค้นหา'}
            </p>
          </div>
        ) : (
          <TableShell>
            <thead>
              <tr>
                <TableHeadCell>เวลา</TableHeadCell>
                <TableHeadCell>ผู้ทำ</TableHeadCell>
                <TableHeadCell>เหตุการณ์</TableHeadCell>
                <TableHeadCell>รายการ</TableHeadCell>
                <TableHeadCell>เกี่ยวข้องกับ</TableHeadCell>
              </tr>
            </thead>
            <tbody>
              {events.map((event) => (
                <tr key={String(event.id)}>
                  <TableCell className="whitespace-nowrap text-xs text-ink-muted">
                    {formatDateTime(event.created_at)}
                  </TableCell>
                  <TableCell className="text-sm text-ink">
                    {actorName(names, event) ?? 'ระบบ'}
                    {event.actor_discord_user_id ? (
                      <p className="mt-0.5 font-mono text-[0.6875rem] text-ink-muted">
                        {event.actor_discord_user_id}
                      </p>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-sm text-ink">
                    {event.event_type}
                    <p className="mt-0.5 text-xs text-ink-muted">{event.entity}</p>
                  </TableCell>
                  <TableCell className="max-w-[12rem] break-all text-xs text-ink-muted">
                    {event.entity_id ?? '—'}
                  </TableCell>
                  <TableCell className="text-sm text-ink-muted">
                    {event.subject_member_id
                      ? (names.get(event.subject_member_id) ?? event.subject_member_id)
                      : '—'}
                  </TableCell>
                </tr>
              ))}
            </tbody>
          </TableShell>
        )}
      </PaperPanel>
    </div>
  )
}

function auditEventsOf(events: AuditEvent[] | undefined) {
  return events ?? []
}

function actorName(names: Map<string, string>, event: AuditEvent) {
  return event.actor_member_id ? names.get(event.actor_member_id) : undefined
}
