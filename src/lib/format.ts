const dateTimeFormatter = new Intl.DateTimeFormat('th-TH-u-ca-buddhist', {
  timeZone: 'Asia/Bangkok',
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

const dateFormatter = new Intl.DateTimeFormat('th-TH-u-ca-buddhist', {
  timeZone: 'Asia/Bangkok',
  day: '2-digit',
  month: 'short',
  year: 'numeric',
})

const timeFormatter = new Intl.DateTimeFormat('th-TH-u-ca-buddhist', {
  timeZone: 'Asia/Bangkok',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

const numberFormatter = new Intl.NumberFormat('th-TH')

export function formatDateTime(value: string | Date | null | undefined) {
  if (!value) return '—'
  const date = typeof value === 'string' ? new Date(value) : value
  if (Number.isNaN(date.getTime())) return '—'
  return dateTimeFormatter.format(date)
}

export function formatDate(value: string | Date | null | undefined) {
  if (!value) return '—'
  const date = typeof value === 'string' ? new Date(value) : value
  if (Number.isNaN(date.getTime())) return '—'
  return dateFormatter.format(date)
}

export function formatTime(value: string | Date | null | undefined) {
  if (!value) return '—'
  const date = typeof value === 'string' ? new Date(value) : value
  if (Number.isNaN(date.getTime())) return '—'
  return timeFormatter.format(date)
}

export function formatNumber(value: number | string | null | undefined) {
  if (value === null || value === undefined) return '—'
  const numeric = typeof value === 'string' ? Number(value) : value
  if (Number.isNaN(numeric)) return '—'
  return numberFormatter.format(numeric)
}

export function formatSigned(value: number | string) {
  const numeric = typeof value === 'string' ? Number(value) : value
  if (numeric > 0) return `+${formatNumber(numeric)}`
  return formatNumber(numeric)
}

export function formatMoney(value: number | string | null | undefined, unit: string) {
  return `${formatNumber(value)} ${unit}`
}

export function formatDuration(minutes: number | null | undefined) {
  if (minutes === null || minutes === undefined) return '—'
  if (minutes <= 0) return 'หมดเวลา'
  const days = Math.floor(minutes / 1440)
  const hours = Math.floor((minutes % 1440) / 60)
  const mins = minutes % 60
  const parts: string[] = []
  if (days > 0) parts.push(`${days} วัน`)
  if (hours > 0) parts.push(`${hours} ชม.`)
  if (days === 0 && mins > 0) parts.push(`${mins} นาที`)
  return parts.join(' ') || 'น้อยกว่า 1 นาที'
}

export function nowIso() {
  return new Date().toISOString()
}

export function toDateTimeLocalValue(value: string | Date | null | undefined) {
  if (!value) return ''
  const date = typeof value === 'string' ? new Date(value) : value
  if (Number.isNaN(date.getTime())) return ''
  const offset = date.getTimezoneOffset() * 60000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

export function fromDateTimeLocalValue(value: string) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString()
}

export function startOfWeekMonday(date = new Date()) {
  const copy = new Date(date)
  copy.setHours(0, 0, 0, 0)
  const day = copy.getDay()
  const diff = day === 0 ? -6 : 1 - day
  copy.setDate(copy.getDate() + diff)
  return copy
}

export function isoDate(date: Date) {
  const offset = date.getTimezoneOffset() * 60000
  return new Date(date.getTime() - offset).toISOString().slice(0, 10)
}

export function addDays(date: Date, days: number) {
  const copy = new Date(date)
  copy.setDate(copy.getDate() + days)
  return copy
}

const bangkokDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Bangkok',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

const bangkokPartsFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Bangkok',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

function partsToRecord(parts: Intl.DateTimeFormatPart[]) {
  return Object.fromEntries(parts.map((part) => [part.type, part.value])) as Record<string, string>
}

/** Today's date in Asia/Bangkok as YYYY-MM-DD. */
export function bangkokTodayIso() {
  return bangkokDateFormatter.format(new Date())
}

/** Monday of the current Bangkok week as YYYY-MM-DD. */
export function bangkokWeekStartIso() {
  const today = bangkokTodayIso()
  const date = new Date(`${today}T00:00:00Z`)
  const weekday = date.getUTCDay()
  const diff = weekday === 0 ? -6 : 1 - weekday
  date.setUTCDate(date.getUTCDate() + diff)
  return date.toISOString().slice(0, 10)
}

export function addIsoDays(iso: string, days: number) {
  const date = new Date(`${iso}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

/** Converts a stored instant into the value a Bangkok datetime-local input expects. */
export function isoToBangkokInput(value: string | null | undefined) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const parts = partsToRecord(bangkokPartsFormatter.formatToParts(date))
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`
}

/** Interprets a datetime-local value as Asia/Bangkok and returns a UTC instant. */
export function bangkokInputToIso(value: string) {
  if (!value) return null
  const date = new Date(`${value}:00+07:00`)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

export function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
