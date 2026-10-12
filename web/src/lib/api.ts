// Every staff call goes through /library/manage?api=<route>. Cloudflare Access protects that
// path, so the Worker receives the Access identity headers the staff routes require.
const MANAGE_PATH = "/library/manage"

/** Fired on window after every successful API response; drives the "updated" indicator. */
export const SYNCED_EVENT = "flow:synced"

export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

type Params = Record<string, string | number | boolean | null | undefined>

export function apiUrl(route: string, params: Params = {}): string {
  const search = new URLSearchParams({ api: route })
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === "" || value === false) continue
    search.set(key, String(value))
  }
  return `${MANAGE_PATH}?${search}`
}

async function request<T>(route: string, init: RequestInit, params?: Params): Promise<T> {
  const response = await fetch(apiUrl(route, params), { cache: "no-store", ...init })
  const body = (await response.json().catch(() => ({}))) as { error?: string }
  if (!response.ok) {
    throw new ApiError(body.error || "Something went wrong. Try again.", response.status)
  }
  window.dispatchEvent(new Event(SYNCED_EVENT))
  return body as T
}

export function get<T>(route: string, params?: Params): Promise<T> {
  return request<T>(route, { method: "GET" }, params)
}

export function post<T>(route: string, body: unknown = {}): Promise<T> {
  return request<T>(route, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

export type CheckoutMethod = "scan_out" | "librarian" | "clear_all" | "auto_end_of_day"

export type Visit = {
  visitId: number
  studentId: string
  firstName: string
  lastName: string
  grade: string | null
  reason: string
  checkedInAt: string
  checkedOutAt: string | null
  checkoutMethod: CheckoutMethod | null
  checkedOutBy?: string | null
  archivedAt?: string | null
  archivedBy?: string | null
  durationMinutes: number | null
}

export type CurrentState = {
  currentCount: number
  generatedAt: string
  students: Visit[]
}

export type Overview = {
  generatedAt: string
  currentCount: number
  visitsToday: number
  uniqueVisitorsToday: number
  activeStudents: number
  pairedKiosks: number
  onlineKiosks: number
  flaggedVisits: number
  recent: Visit[]
  attention: {
    longVisits: Visit[]
    staleKiosks: { id: number; name: string; lastSeenAt: string | null }[]
  }
}

export type Student = {
  id: number
  studentId: string
  barcode: string
  firstName: string
  lastName: string
  grade: string | null
  active: boolean
  updatedAt: string
  visitCount: number
  lastVisitAt: string | null
  timeSpentMinutes?: number
  completedTimeMinutes?: number
  averageCompletedVisitMinutes?: number | null
  activeSince?: string | null
}

export type FlagKind = "open" | "cleared" | "long"

export type FlaggedVisit = Visit & {
  flag: FlagKind
  elapsedMinutes: number
  /** Longest length that keeps the checkout in the past. */
  maxMinutes: number
  suggestedMinutes: number
}

export type FlaggedList = {
  thresholdMinutes: number
  total: number
  typical: { overallMinutes: number; byReason: Record<string, number>; sampleSize: number; lookbackDays: number }
  visits: FlaggedVisit[]
}

export type StudentList = { total: number; limit: number; offset: number; students: Student[] }
export type StudentDetail = { student: Student; recentVisits: Visit[] }
export type VisitList = { total: number; limit: number; offset: number; visits: Visit[] }

export type KioskDevice = {
  id: number
  name: string
  createdAt: string
  lastSeenAt: string | null
  revokedAt: string | null
}

export type SheetStatus = {
  configured: boolean
  pending: number
  exhausted: number
  lastQueuedAt: string | null
  lastSyncedAt: string | null
  lastError: string | null
}

type Point = { label: string; visits: number }

export type Stats = {
  range: { from: string; to: string; days: number }
  summary: {
    visits: number
    uniqueStudents: number
    averageDailyVisits: number
    peakOccupancy: number
    averageDurationMinutes: number | null
    medianDurationMinutes: number | null
    previousVisits: number
    visitChange: number
    comparisonLabel?: string
  }
  visitors: {
    returningStudents: number
    firstTimeStudents: number
    returningRate: number
    repeatVisitors: number
    repeatRate: number
    regularCount: number
    fiveDayVisitors: number
    regulars: {
      studentRowId: number
      studentId: string
      firstName: string
      lastName: string
      grade: string | null
      visits: number
      daysVisited: number
    }[]
  }
  patterns: {
    busiestDate: { date: string; visits: number } | null
    busiestWeekday: { weekday: string; visits: number; averageVisits?: number } | null
    favoriteReason: { reason: string; visits: number; share: number } | null
    topGrade: { grade: string; visits: number } | null
    busiestHour: { hour: number; visits: number } | null
    quietestActiveHour: { hour: number; visits: number } | null
    rushHour: { startAt: string; endAt: string; checkIns: number; perMinute: number } | null
    longestCompletedVisitMinutes: number | null
    durationMiddle50?: { lowMinutes: number; highMinutes: number } | null
    durationP90Minutes?: number | null
    reasonByDaypart: { daypart: string; reason: string | null; visits: number }[]
  }
  lunch: {
    windowLabel?: string
    visits: number
    peakOccupancy: number | null
    typicalPeakOccupancy: number | null
    medianDurationMinutes: number | null
    rushWindow?: { startMinute: number; endMinute: number; checkIns: number; checkInsPerActiveDay: number } | null
  }
  traffic: { granularity: "day" | "week"; points: (Point & { date: string })[] }
  hourly: (Point & { hour: number })[]
  weekdays: (Point & { totalVisits?: number; occurrences?: number })[]
  reasons: Point[]
  grades: Point[]
  schoolYear: {
    start: string
    through: string
    visits: number
    uniqueStudents: number
    milestones: { type: "visits" | "students"; value: number; reachedAt: string }[]
    nextVisitMilestone: number
    nextUniqueMilestone: number
  }
}

export const REASONS = ["Class work", "Printing", "Book checkout", "Lunch", "Meeting", "Other"]
export const GRADES = ["9", "10", "11", "12"]
