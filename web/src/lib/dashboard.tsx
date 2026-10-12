import * as React from "react"

export type PageId = "now" | "visits" | "flagged" | "students" | "insights" | "devices"

export const PAGES: Record<PageId, { title: string; description: string }> = {
  now: { title: "Now", description: "Who is in the library right now" },
  visits: { title: "Visits", description: "Every check-in and checkout" },
  flagged: { title: "Flagged", description: "Visits that look like a missed checkout" },
  students: { title: "Students", description: "The student directory" },
  insights: { title: "Insights", description: "Traffic, patterns, and milestones" },
  devices: { title: "Devices & data", description: "Kiosks, Google Sheets sync, and exports" },
}

/**
 * Visits only carry the school's student ID, while the directory uses the row id,
 * so the profile sheet accepts either and resolves the student ID itself. `create` opens a blank form.
 */
export type StudentRef = { id: number } | { studentId: string } | { create: true }

type DashboardContextValue = {
  page: PageId
  setPage: (page: PageId) => void
  openStudent: (ref: StudentRef) => void
  /** Bumped after any change to visits, so every view refetches. */
  dataVersion: number
  invalidate: () => void
  currentCount: number | null
  setCurrentCount: (count: number) => void
  flaggedCount: number | null
  setFlaggedCount: (count: number) => void
}

export const DashboardContext = React.createContext<DashboardContextValue | null>(null)

export function useDashboard(): DashboardContextValue {
  const value = React.useContext(DashboardContext)
  if (!value) throw new Error("useDashboard must be used inside the dashboard.")
  return value
}

export function isPageId(value: string): value is PageId {
  return value in PAGES
}
