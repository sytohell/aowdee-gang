import { supabase } from '@/lib/supabase'

const ERROR_MESSAGES: Array<[string, string]> = [
  ['AUTH_REQUIRED', 'กรุณาเข้าสู่ระบบใหม่'],
  ['ACCESS_DENIED', 'บัญชีนี้ไม่ได้รับอนุญาตให้เข้าถึงข้อมูลแก๊ง'],
  ['NOT_BOOTSTRAP_OWNER', 'บัญชี Discord นี้ไม่ใช่เจ้าของที่ตั้งไว้'],
  ['DISCORD_IDENTITY_REQUIRED', 'ไม่พบข้อมูล Discord ที่ยืนยันแล้ว'],
  ['OWNER_ALREADY_EXISTS', 'มีเจ้าของระบบอยู่แล้ว'],
  ['OWNER_LOCKOUT', 'ต้องโอนสิทธิ์เจ้าของก่อน จึงจะทำรายการนี้ได้'],
  ['OWNER_IDENTITY_FIXED', 'ไม่สามารถเปลี่ยน Discord ของเจ้าของจากหน้านี้ได้'],
  ['FORBIDDEN', 'คุณไม่มีสิทธิ์ทำรายการนี้'],
  ['MEMBER_NOT_FOUND', 'ไม่พบสมาชิก'],
  ['MEMBER_ARCHIVED', 'สมาชิกคนนี้ถูกเก็บถาวรแล้ว'],
  ['MEMBER_ALREADY_ARCHIVED', 'สมาชิกคนนี้ถูกเก็บถาวรแล้ว'],
  ['SLOT_OR_DISCORD_TAKEN', 'ช่องหรือบัญชี Discord นี้ถูกใช้แล้ว'],
  ['SLOT_TAKEN', 'ช่องนี้ถูกใช้แล้ว'],
  ['DISCORD_ALREADY_LINKED', 'บัญชี Discord นี้ผูกกับสมาชิกคนอื่นอยู่'],
  ['ALREADY_OWNER', 'สมาชิกคนนี้เป็นเจ้าของอยู่แล้ว'],
  ['INSUFFICIENT_STOCK', 'สต็อกไม่พอสำหรับรายการนี้'],
  ['INSUFFICIENT_FUNDS', 'เงินในแก๊งไม่พอสำหรับรายการนี้'],
  ['INSUFFICIENT_POINTS', 'แต้มไม่พอสำหรับรายการนี้'],
  ['INITIAL_STOCK_LOCKED', 'ยอดยกมาตั้งได้ครั้งเดียว ใช้การปรับหรือแก้ไขย้อนหลัง'],
  ['OPENING_BALANCE_LOCKED', 'ยอดเงินยกมาตั้งได้ครั้งเดียว'],
  ['ITEM_NOT_FOUND', 'ไม่พบรายการของ'],
  ['ITEM_NAME_TAKEN', 'ชื่อของนี้มีอยู่แล้ว'],
  ['LEDGER_ENTRY_NOT_FOUND', 'ไม่พบรายการบัญชี'],
  ['ALREADY_REVERSED', 'รายการนี้ถูกแก้ไขย้อนหลังแล้ว'],
  ['CANNOT_REVERSE_A_CORRECTION', 'ไม่สามารถย้อนรายการที่แก้ไขแล้วซ้ำได้'],
  ['LINKED_TO_INVENTORY', 'รายการนี้ผูกกับคลังของ ให้ย้อนที่คลังของแทน'],
  ['USE_DEDICATED_REVERSAL', 'ใช้ปุ่มแก้ไขย้อนหลังของรายการนั้นโดยตรง'],
  ['VEHICLE_NOT_FOUND', 'ไม่พบรถ'],
  ['PLATE_TAKEN', 'ทะเบียนนี้มีอยู่แล้ว'],
  ['VEHICLE_ALREADY_HELD', 'รถคันนี้มีผู้ถือครองในช่วงเวลานี้อยู่แล้ว'],
  ['CONTRACT_NOT_FOUND', 'ไม่พบสัญญารถ'],
  ['CONTRACT_ALREADY_RELEASED', 'สัญญานี้ปิดแล้ว'],
  ['DUES_OBLIGATION_NOT_FOUND', 'ไม่พบรายการค่าหัว'],
  ['DUES_ALREADY_SETTLED', 'รายการนี้ชำระครบหรือถูกยกเว้นแล้ว'],
  ['PAYMENT_EXCEEDS_BALANCE', 'ยอดชำระเกินยอดคงเหลือ'],
  ['DUES_WAIVED', 'รายการนี้ถูกยกเว้นแล้ว'],
  ['PAYMENT_REVERSAL_UNDERFLOW', 'ยอดชำระย้อนหลังต่ำกว่าศูนย์'],
  ['NO_DUES_POLICY', 'ยังไม่ได้ตั้งนโยบายค่าหัว'],
  ['DUES_PERIOD_ALREADY_EXISTS', 'สัปดาห์นี้สร้างรายการแล้ว'],
  ['POLICY_EFFECTIVE_DATE_TAKEN', 'วันที่มีผลนี้ถูกใช้แล้ว'],
  ['POINT_ACCOUNT_NOT_FOUND', 'ไม่พบบัญชีแต้ม'],
  ['POINT_ENTRY_NOT_FOUND', 'ไม่พบรายการแต้ม'],
  ['ANNOUNCEMENT_NOT_FOUND', 'ไม่พบกิจกรรม'],
  ['ANNOUNCEMENT_ARCHIVED', 'กิจกรรมนี้ถูกเก็บถาวรแล้ว'],
  ['OUTFIT_NOT_FOUND', 'ไม่พบชุด'],
  ['OUTFIT_CODE_TAKEN', 'รหัสชุดนี้มีอยู่แล้ว'],
  ['OUTFIT_CODE_NOT_FOUND', 'ไม่พบรหัสชุด'],
  ['MEDIA_NOT_FOUND', 'ไม่พบรูป'],
  ['WEAPON_NOT_FOUND', 'ไม่พบอาวุธ'],
  ['NO_FREE_MAIN_SLOT', 'ช่องหลักเต็มทั้ง 30 ช่อง'],
  ['SUPABASE_NOT_CONFIGURED', 'ยังไม่ได้ตั้งค่าการเชื่อมต่อ Supabase'],
]

export function thaiErrorMessage(message: string) {
  for (const [code, thai] of ERROR_MESSAGES) {
    if (message.includes(code)) return thai
  }
  if (message.includes('permission denied')) return 'ฐานข้อมูลปฏิเสธสิทธิ์ของบัญชีนี้'
  if (message.includes('row-level security')) return 'ฐานข้อมูลปฏิเสธสิทธิ์ของบัญชีนี้'
  if (message.includes('duplicate key')) return 'ข้อมูลนี้มีอยู่แล้ว'
  return 'ทำรายการไม่สำเร็จ กรุณาตรวจข้อมูลแล้วลองใหม่'
}

export function requireSupabase() {
  if (!supabase) throw new Error('SUPABASE_NOT_CONFIGURED')
  return supabase
}

export async function callRpc<T>(name: string, args: Record<string, unknown> = {}) {
  const client = requireSupabase()
  const { data, error } = await client.rpc(name, args)
  if (error) throw new Error(thaiErrorMessage(error.message))
  return data as T
}

export function newIdempotencyKey(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`
}

export async function uploadImage(bucket: string, file: File) {
  const client = requireSupabase()
  const extension = file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg'
  const path = `${crypto.randomUUID()}.${extension}`
  const { error } = await client.storage.from(bucket).upload(path, file, {
    cacheControl: '3600',
    contentType: file.type,
    upsert: false,
  })
  if (error) throw new Error(thaiErrorMessage(error.message))
  return path
}

export async function signedUrl(bucket: string, path: string | null, expiresIn = 3600) {
  if (!path) return null
  const client = requireSupabase()
  const { data, error } = await client.storage.from(bucket).createSignedUrl(path, expiresIn)
  if (error) return null
  return data.signedUrl
}
