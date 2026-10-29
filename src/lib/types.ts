export type SiteRole = 'owner' | 'editor' | 'viewer'
export type GangRank = 'head' | 'deputy' | 'member'
export type SlotKind = 'main' | 'reserve'
export type MemberState = 'active' | 'archived'
export type WeaponType =
  | 'mai'
  | 'gun'
  | 'shark_knife'
  | 'm9_knife'
  | 'dagger'
  | 'machete'
  | 'knuckle'
export type InventoryClass = 'general' | 'fighting'
export type InventoryReason =
  | 'initial'
  | 'gang_shop'
  | 'story'
  | 'air_drop'
  | 'robbery'
  | 'supply'
  | 'trade'
  | 'gang_activity'
  | 'correction'
  | 'other'
export type TreasuryCategory =
  | 'opening'
  | 'dues'
  | 'item_purchase'
  | 'item_sale'
  | 'story'
  | 'gang_expense'
  | 'agency_doctor'
  | 'agency_police'
  | 'agency_council'
  | 'agency_mechanic'
  | 'other'
  | 'correction'
export type DuesState = 'pending' | 'partial' | 'paid' | 'waived'
export type AnnouncementStatus = 'upcoming' | 'active' | 'completed' | 'cancelled'
export type OutfitGender = 'male' | 'female'

export type WhoAmI = {
  authenticated: boolean
  discord_user_id: string | null
  allowed: boolean
  owner_configured: boolean
  member: {
    id: string
    in_game_name: string
    gang_rank: GangRank
    slot_kind: SlotKind
    slot_number: number
    site_role: SiteRole
    dues_exempt: boolean
  } | null
}

export type MemberRow = {
  id: string
  in_game_name: string
  in_game_phone: string | null
  gang_rank: GangRank
  slot_kind: SlotKind
  slot_number: number
  site_role: SiteRole
  state: MemberState
  dues_exempt: boolean
  joined_at: string
  archived_at: string | null
  archived_reason: string | null
  created_at: string
  updated_at: string
  weapon_count?: number
  discord_linked?: boolean
}

export type MemberWeapon = {
  id: string
  member_id: string
  weapon: WeaponType
  level: number
}

export type InventoryItem = {
  id: string
  name: string
  inventory_class: InventoryClass
  unit: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export type InventoryBalance = {
  item_id: string
  quantity: number
  updated_at: string
}

export type InventoryLedgerEntry = {
  id: string
  item_id: string
  delta: number
  balance_before: number
  balance_after: number
  reason: InventoryReason
  actor_member_id: string
  subject_member_id: string | null
  note: string | null
  transaction_group_id: string
  correction_of: string | null
  created_at: string
}

export type TreasuryLedgerEntry = {
  id: string
  amount_minor: number
  balance_before: number
  balance_after: number
  category: TreasuryCategory
  actor_member_id: string
  subject_member_id: string | null
  linked_inventory_ledger_id: string | null
  note: string | null
  correction_of: string | null
  created_at: string
}

export type DuesOutstanding = {
  id: string
  period_id: string
  member_id: string
  in_game_name: string
  slot_kind: SlotKind
  week_start: string
  amount_minor: number
  paid_minor: number
  unpaid_minor: number
  due_at: string
  state: DuesState
  overdue: boolean
}

export type DuesPolicy = {
  id: string
  amount_minor: number
  due_weekday: number
  due_time: string
  effective_from: string
  note: string | null
  created_at: string
}

export type DuesPayment = {
  id: string
  obligation_id: string
  amount_minor: number
  treasury_ledger_id: string
  recorded_by: string
  paid_at: string
  note: string | null
  reversal_of: string | null
  created_at: string
}

export type DuesPeriod = {
  id: string
  week_start: string
  week_end: string
  due_at: string
  policy_id: string
  amount_minor: number
  policy_snapshot: Record<string, unknown>
  generated_by: string
  created_at: string
}

export type VehicleStatus = {
  id: string
  name: string
  model: string
  plate: string
  photo_path: string | null
  note: string | null
  is_active: boolean
  contract_id: string | null
  holder_member_id: string | null
  holder_name: string | null
  start_at: string | null
  end_at: string | null
  released_at: string | null
  status: 'available' | 'held'
  remaining_minutes: number | null
}

export type VehicleContract = {
  id: string
  vehicle_id: string
  holder_member_id: string
  start_at: string
  end_at: string
  released_at: string | null
  note: string | null
  created_at: string
}

export type PointAccount = {
  account_id: string
  kind: 'gang' | 'personal'
  member_id: string | null
  in_game_name: string | null
  balance: number
  updated_at: string
}

export type PointLedgerEntry = {
  id: string
  account_id: string
  delta: number
  balance_before: number
  balance_after: number
  reason: string
  actor_member_id: string
  subject_member_id: string | null
  note: string | null
  transaction_group_id: string
  correction_of: string | null
  created_at: string
}

export type Activity = {
  id: string
  title: string
  body: string
  status: AnnouncementStatus
  starts_at: string | null
  ends_at: string | null
  pinned: boolean
  created_by: string
  updated_by: string
  archived_at: string | null
  created_at: string
  updated_at: string
}

export type ActivityMedia = {
  id: string
  announcement_id: string
  storage_path: string
  alt_text: string | null
  sort_order: number
}

export type Outfit = {
  id: string
  gender: OutfitGender
  set_name: string
  description: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export type OutfitMedia = {
  id: string
  outfit_id: string
  storage_path: string
  alt_text: string | null
  sort_order: number
}

export type OutfitCode = {
  id: string
  outfit_id: string
  code: string
  label: string
  sort_order: number
}

export type DashboardSummary = {
  main_filled: number
  reserve_filled: number
  dues_overdue_count: number
  dues_overdue_minor: number
  vehicles_held: number
  vehicles_expiring_24h: number
  gang_points: number
  announcement_count: number
}

export type AppSettings = {
  id: boolean
  currency_unit: string
  timezone: string
  updated_at: string
}

export type AuditEvent = {
  id: number | string
  actor_member_id: string | null
  actor_discord_user_id: string | null
  subject_member_id: string | null
  entity: string
  entity_id: string | null
  event_type: string
  before: Record<string, unknown> | null
  after: Record<string, unknown> | null
  transaction_group_id: string | null
  request_id: string | null
  created_at: string
}

export const WEAPON_LABELS: Record<WeaponType, string> = {
  mai: 'ไม้',
  gun: 'ปืน',
  shark_knife: 'มีดปากฉลาม',
  m9_knife: 'มีด M9',
  dagger: 'มีด Dagger',
  machete: 'มาเช',
  knuckle: 'สนับ',
}

export const WEAPON_MAX_LEVEL: Record<WeaponType, number> = {
  mai: 3,
  gun: 3,
  shark_knife: 4,
  m9_knife: 4,
  dagger: 4,
  machete: 4,
  knuckle: 4,
}

export const GANG_RANK_LABELS: Record<GangRank, string> = {
  head: 'หัวหน้า',
  deputy: 'รองหัวหน้า',
  member: 'สมาชิก',
}

export const SITE_ROLE_LABELS: Record<SiteRole, string> = {
  owner: 'เจ้าของ',
  editor: 'ผู้แก้ไข',
  viewer: 'ผู้อ่าน',
}

export const SLOT_LABELS: Record<SlotKind, string> = {
  main: 'ช่องหลัก',
  reserve: 'ช่องสำรอง',
}

export const INVENTORY_CLASS_LABELS: Record<InventoryClass, string> = {
  general: 'ของทั่วไป',
  fighting: 'ของสำหรับ Fighting',
}

export const INVENTORY_REASON_LABELS: Record<InventoryReason, string> = {
  initial: 'ยอดยกมา',
  gang_shop: 'Gang Shop',
  story: 'Story',
  air_drop: 'Air Drop',
  robbery: 'งัดร้าน',
  supply: 'Supply',
  trade: 'ซื้อ–ขาย',
  gang_activity: 'กิจกรรมแก๊ง',
  correction: 'แก้ไขย้อนหลัง',
  other: 'อื่น ๆ',
}

export const TREASURY_CATEGORY_LABELS: Record<TreasuryCategory, string> = {
  opening: 'ยอดยกมา',
  dues: 'ค่าหัวรายสัปดาห์',
  item_purchase: 'ซื้อของเข้ากอง',
  item_sale: 'ขายของออกจากกอง',
  story: 'Story',
  gang_expense: 'ค่าใช้จ่ายแก๊ง',
  agency_doctor: 'จ่ายหมอ',
  agency_police: 'จ่ายตำรวจ',
  agency_council: 'จ่ายสภา',
  agency_mechanic: 'จ่ายช่าง',
  other: 'อื่น ๆ',
  correction: 'แก้ไขย้อนหลัง',
}

export const DUES_STATE_LABELS: Record<DuesState, string> = {
  pending: 'ค้างชำระ',
  partial: 'ชำระบางส่วน',
  paid: 'ชำระครบ',
  waived: 'ยกเว้น',
}

export const ACTIVITY_STATUS_LABELS: Record<AnnouncementStatus, string> = {
  upcoming: 'กำลังจะมาถึง',
  active: 'กำลังจัด',
  completed: 'จบแล้ว',
  cancelled: 'ยกเลิก',
}

export const THAI_DAYS = ['จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์', 'อาทิตย์']
