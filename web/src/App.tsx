import * as React from "react"

import { AppSidebar } from "@/components/app-sidebar"
import { CommandMenu } from "@/components/command-menu"
import { ConfirmProvider } from "@/components/common"
import { SiteHeader } from "@/components/site-header"
import { StudentSheet } from "@/components/student-sheet"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { type Overview } from "@/lib/api"
import { clearCache, fetchCached } from "@/lib/cache"
import { markDirectoryStale } from "@/lib/directory"
import { DashboardContext, isPageId, type PageId, type StudentRef } from "@/lib/dashboard"
import { useVisibleInterval } from "@/lib/hooks"
import { DevicesPage } from "@/pages/devices"
import { FlaggedPage } from "@/pages/flagged"
import { NowPage } from "@/pages/now"
import { StudentsPage } from "@/pages/students"
import { VisitsPage } from "@/pages/visits"

// Charts pull in recharts, so Insights loads on first visit instead of with the shell.
const InsightsPage = React.lazy(() => import("@/pages/insights").then((module) => ({ default: module.InsightsPage })))

function pageFromHash(): PageId {
  const hash = window.location.hash.slice(1)
  // Older bookmarks used #current, #history, #stats and #kiosks.
  const legacy: Record<string, PageId> = { current: "now", overview: "now", history: "visits", stats: "insights", kiosks: "devices" }
  if (isPageId(hash)) return hash
  return legacy[hash] ?? "now"
}

export function App() {
  const [page, setPageState] = React.useState<PageId>(pageFromHash)
  const [dataVersion, setDataVersion] = React.useState(0)
  const [currentCount, setCurrentCount] = React.useState<number | null>(null)
  const [flaggedCount, setFlaggedCount] = React.useState<number | null>(null)
  const [student, setStudent] = React.useState<StudentRef | null>(null)
  const [commandOpen, setCommandOpen] = React.useState(false)

  const setPage = React.useCallback((next: PageId) => {
    setPageState(next)
    window.history.replaceState(null, "", `#${next}`)
    window.scrollTo({ top: 0 })
  }, [])

  React.useEffect(() => {
    const onHash = () => setPageState(pageFromHash())
    window.addEventListener("hashchange", onHash)
    return () => window.removeEventListener("hashchange", onHash)
  }, [])

  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault()
        setCommandOpen((open) => !open)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  // Keeps the sidebar counts current while staff are on other pages; the Now page polls faster.
  const refreshCount = React.useCallback(() => {
    fetchCached<Overview>("admin-overview")
      .then((overview) => {
        setCurrentCount(overview.currentCount)
        setFlaggedCount(overview.flaggedVisits)
      })
      .catch(() => {})
  }, [])
  React.useEffect(refreshCount, [refreshCount, dataVersion])
  useVisibleInterval(() => {
    if (page !== "now") refreshCount()
  }, 30000)

  const value = React.useMemo(
    () => ({
      page,
      setPage,
      openStudent: setStudent,
      dataVersion,
      invalidate: () => {
        // Something changed: nothing cached from before it may be shown again.
        clearCache()
        markDirectoryStale()
        setDataVersion((version) => version + 1)
      },
      currentCount,
      setCurrentCount,
      flaggedCount,
      setFlaggedCount,
    }),
    [page, setPage, dataVersion, currentCount, flaggedCount]
  )

  return (
    <DashboardContext.Provider value={value}>
      <TooltipProvider>
        <ConfirmProvider>
          <SidebarProvider>
            <AppSidebar />
            <SidebarInset>
              <SiteHeader onSearch={() => setCommandOpen(true)} />
              <main className="flex-1">
                {page === "now" ? <NowPage /> : null}
                {page === "visits" ? <VisitsPage /> : null}
                {page === "flagged" ? <FlaggedPage /> : null}
                {page === "students" ? <StudentsPage /> : null}
                {page === "insights" ? (
                  <React.Suspense fallback={null}>
                    <InsightsPage />
                  </React.Suspense>
                ) : null}
                {page === "devices" ? <DevicesPage /> : null}
              </main>
            </SidebarInset>
          </SidebarProvider>
          <StudentSheet student={student} onClose={() => setStudent(null)} />
          <CommandMenu open={commandOpen} onOpenChange={setCommandOpen} />
          <Toaster position="bottom-right" />
        </ConfirmProvider>
      </TooltipProvider>
    </DashboardContext.Provider>
  )
}
