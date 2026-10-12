import type { CheckoutMethod } from "@/lib/api"

export const TIMEZONE = "America/New_York"

const dateTimeFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: TIMEZONE,
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
})
const timeFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: TIMEZONE,
  hour: "numeric",
  minute: "2-digit",
})
const dayFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: TIMEZONE,
  weekday: "short",
  month: "short",
  day: "numeric",
})
const localDateParts = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
})

function toDate(value: string | null | undefined): Date | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

export function formatDateTime(value: string | null | undefined): string {
  const date = toDate(value)
  return date ? dateTimeFormat.format(date) : "—"
}

export function formatTime(value: string | null | undefined): string {
  const date = toDate(value)
  return date ? timeFormat.format(date) : "—"
}

export function formatDay(value: string | null | undefined): string {
  const date = toDate(value)
  return date ? dayFormat.format(date) : "—"
}

/** Formats a YYYY-MM-DD calendar date without shifting it through a timezone. */
export function formatCalendarDate(value: string | null | undefined, withYear = true): string {
  if (!value) return "—"
  const [year, month, day] = value.split("-").map(Number)
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: withYear ? "numeric" : undefined,
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)))
}

export function minutesSince(value: string | null | undefined, now = Date.now()): number | null {
  const date = toDate(value)
  if (!date) return null
  return Math.max(0, Math.floor((now - date.getTime()) / 60000))
}

export function formatDuration(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined || !Number.isFinite(minutes)) return "—"
  const rounded = Math.round(minutes)
  if (rounded < 60) return `${rounded} min`
  const hours = Math.floor(rounded / 60)
  const rest = rounded % 60
  return rest ? `${hours} hr ${rest} min` : `${hours} hr`
}

/** Compact form for dense tables: 1h 05m, 42m. */
export function formatElapsed(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined) return "—"
  if (minutes < 60) return `${minutes}m`
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`
}

export function formatAgo(value: string | null | undefined, now = Date.now()): string {
  const minutes = minutesSince(value, now)
  if (minutes === null) return "never"
  if (minutes < 1) return "just now"
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} hr ago`
  const days = Math.floor(hours / 24)
  return `${days} day${days === 1 ? "" : "s"} ago`
}

export function formatHour(hour: number | null | undefined): string {
  if (hour === null || hour === undefined) return "—"
  return `${hour % 12 || 12} ${hour >= 12 ? "PM" : "AM"}`
}

export function formatClockMinute(minute: number): string {
  const hours = Math.floor(minute / 60)
  const mins = Math.round(minute % 60)
  return `${hours % 12 || 12}:${String(mins).padStart(2, "0")} ${hours >= 12 ? "PM" : "AM"}`
}

export function formatPercent(value: number | null | undefined): string {
  const number = Number(value ?? 0)
  return `${number % 1 ? number.toFixed(1) : number.toFixed(0)}%`
}

export function formatNumber(value: number | null | undefined): string {
  return Number(value ?? 0).toLocaleString("en-US")
}

export function plural(count: number, word: string, pluralWord = `${word}s`): string {
  return `${formatNumber(count)} ${count === 1 ? word : pluralWord}`
}

export function fullName(person: { firstName: string; lastName: string }): string {
  return `${person.firstName} ${person.lastName}`.trim()
}

export function initials(person: { firstName: string; lastName: string }): string {
  return `${person.firstName.charAt(0)}${person.lastName.charAt(0)}`.toUpperCase()
}

export const CHECKOUT_LABELS: Record<CheckoutMethod, string> = {
  scan_out: "Scanned out",
  librarian: "Librarian",
  clear_all: "Cleared",
  auto_end_of_day: "End of day",
}

export function todayLocal(): string {
  return localDate(new Date())
}

export function localDate(date: Date): string {
  const parts = Object.fromEntries(localDateParts.formatToParts(date).map((part) => [part.type, part.value]))
  return `${parts.year}-${parts.month}-${parts.day}`
}

export function addDays(value: string, days: number): string {
  const [year, month, day] = value.split("-").map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

export function mondayOf(value: string): string {
  const [year, month, day] = value.split("-").map(Number)
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay()
  return addDays(value, weekday === 0 ? -6 : 1 - weekday)
}

export function schoolYearStart(value: string): string {
  const [year, month] = value.split("-").map(Number)
  return `${month >= 8 ? year : year - 1}-08-01`
}
