import * as React from "react"

import { get, type Student } from "@/lib/api"
import { useDashboard } from "@/lib/dashboard"
import { useVisibleInterval } from "@/lib/hooks"

// The whole student directory, held in this tab's memory so searching it is instant. It is
// refreshed in the background every minute, when the tab comes back into view, and after any
// change made from the dashboard. Nothing is stored on disk.

type DirectoryResponse = { generatedAt: string; truncated: boolean; students: Student[] }
export type DirectorySnapshot = { students: Student[]; truncated: boolean; fetchedAt: number; byStudentId: Map<string, Student> }

const MAX_AGE_MS = 60_000

let snapshot: DirectorySnapshot | null = null
let stale = true
let failed = false
let pending: Promise<DirectorySnapshot> | null = null
let generation = 0
const listeners = new Set<() => void>()

function emit() {
  listeners.forEach((listener) => listener())
}

export function loadDirectory(force = false): Promise<DirectorySnapshot> {
  if (!force && snapshot && !stale && Date.now() - snapshot.fetchedAt < MAX_AGE_MS) return Promise.resolve(snapshot)
  if (pending) return pending
  const startedIn = generation
  pending = get<DirectoryResponse>("admin-directory")
    .then((response) => {
      const next: DirectorySnapshot = {
        students: response.students,
        truncated: response.truncated,
        fetchedAt: Date.now(),
        byStudentId: new Map(response.students.map((student) => [student.studentId, student])),
      }
      if (startedIn === generation) {
        snapshot = next
        stale = false
        failed = false
        emit()
      }
      return next
    })
    .catch((error) => {
      failed = true
      emit()
      throw error
    })
    .finally(() => {
      pending = null
    })
  return pending
}

/** Marks the snapshot out of date after a change; it is kept on screen until the refetch lands. */
export function markDirectoryStale() {
  stale = true
  generation += 1
  pending = null
  emit()
}

export function peekDirectory(): DirectorySnapshot | null {
  return snapshot
}

export function useDirectory() {
  const { dataVersion } = useDashboard()
  const current = React.useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => snapshot
  )
  const isStale = React.useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => stale
  )
  const hasFailed = React.useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => failed
  )

  React.useEffect(() => {
    void loadDirectory().catch(() => {})
  }, [dataVersion])
  useVisibleInterval(() => void loadDirectory().catch(() => {}), MAX_AGE_MS)

  // `failed` only matters before the first snapshot; after that the last good one stays usable.
  return { directory: current, refreshing: isStale, failed: hasFailed && current === null }
}

// Mirrors the server's search in admin-students (case-insensitive substring match on name,
// student ID and barcode, then grade and status filters, in directory order), and also matches
// a full "first last" name.
export function filterDirectory(students: Student[], filters: { q?: string; grade?: string; status?: string }): Student[] {
  const needle = (filters.q ?? "").trim().toLowerCase()
  return students.filter((student) => {
    if (
      needle &&
      !`${student.firstName} ${student.lastName}`.toLowerCase().includes(needle) &&
      !student.studentId.toLowerCase().includes(needle) &&
      !student.barcode.toLowerCase().includes(needle)
    ) {
      return false
    }
    if (filters.grade && student.grade !== filters.grade) return false
    if (filters.status === "active" && !student.active) return false
    if (filters.status === "inactive" && student.active) return false
    if (filters.status === "name-check" && !student.nameCheckRequestedAt) return false
    return true
  })
}

/** Best matches first for the quick finder: exact IDs, then names that start with the query. */
export function searchDirectory(students: Student[], query: string, limit: number): Student[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return []
  const scored: { student: Student; score: number }[] = []
  for (const student of filterDirectory(students, { q: needle })) {
    const first = student.firstName.toLowerCase()
    const last = student.lastName.toLowerCase()
    const full = `${first} ${last}`
    const score =
      student.studentId.toLowerCase() === needle || student.barcode.toLowerCase() === needle
        ? 0
        : full.startsWith(needle) || last.startsWith(needle)
          ? 1
          : first.startsWith(needle)
            ? 2
            : 3
    scored.push({ student, score })
  }
  // Array sort is stable, so ties keep directory (last name) order.
  return scored.sort((a, b) => a.score - b.score).slice(0, limit).map((entry) => entry.student)
}
