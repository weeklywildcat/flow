// Kiosk calls go straight to /api/library with the paired Chromebook's token. Requests from
// localhost skip the token check so the kiosk can be developed without pairing.
export const TOKEN_KEY = "libraryKioskToken"

export const IS_LOCAL = location.hostname === "localhost" || location.hostname === "127.0.0.1"

export function readToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function saveToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    // A kiosk without storage simply asks to be paired again next time.
  }
}

export class KioskError extends Error {
  status: number
  constructor(message: string, status = 0) {
    super(message)
    this.status = status
  }
}

async function request<T>(path: string, init: RequestInit): Promise<T> {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), 8000)
  const token = readToken()
  try {
    const response = await fetch(path, {
      cache: "no-store",
      ...init,
      headers: { ...(init.body ? { "Content-Type": "application/json" } : {}), ...(token ? { "X-Kiosk-Token": token } : {}) },
      signal: controller.signal,
    })
    const data = (await response.json().catch(() => ({}))) as T & { error?: string }
    if (!response.ok) {
      // A revoked or unknown token means this Chromebook has to be paired again.
      if (response.status === 401 && path !== "/api/library/kiosk-enroll") saveToken(null)
      throw new KioskError(data.error || "Request failed.", response.status)
    }
    return data
  } catch (error) {
    if (error instanceof KioskError) throw error
    if (!navigator.onLine) throw new KioskError("Network connection lost.")
    if (error instanceof DOMException && error.name === "AbortError") throw new KioskError("The request timed out. Try again.")
    throw new KioskError(error instanceof Error ? error.message : "Request failed.")
  } finally {
    window.clearTimeout(timeout)
  }
}

export const kioskPost = <T,>(path: string, body: unknown) => request<T>(path, { method: "POST", body: JSON.stringify(body) })
export const kioskGet = <T,>(path: string) => request<T>(path, { method: "GET" })

export type KioskStudent = { studentId: string; firstName: string; lastName: string; grade: string | null }

export type ScanResult =
  | { mode: "checkout"; student: KioskStudent; nameCheck?: boolean }
  | { mode: "checkin"; student: KioskStudent; recentlyCleared?: boolean; nameCheck?: boolean; reasons: string[]; priority?: string[] }
  | { mode: "new_student"; barcode: string; grades: string[]; reasons: string[]; priority?: string[] }

export type FunFacts = { visitsThisMonth: number; minutesThisYear: number }
