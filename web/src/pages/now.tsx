import * as React from "react"
import { toast } from "sonner"
import { HugeiconsIcon } from "@hugeicons/react"
import { Alert02Icon, CheckmarkCircle02Icon, Flag02Icon, Logout03Icon, Search01Icon, WifiOff01Icon } from "@hugeicons/core-free-icons"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { PageBody, StatCard, StudentAvatar, errorMessage, useConfirm } from "@/components/common"
import { ClearDialog, REVIEW_AFTER_MINUTES } from "@/components/visit-dialogs"
import { post, type CurrentState, type Overview, type Visit } from "@/lib/api"
import { useCachedGet } from "@/lib/cache"
import { useDashboard } from "@/lib/dashboard"
import { useNow } from "@/lib/hooks"
import { formatAgo, formatDuration, formatElapsed, formatTime, fullName, minutesSince, plural } from "@/lib/format"
import { cn } from "@/lib/utils"

const NO_PARAMS = {}

/** Matches the server's "needs attention" cutoff for visits nobody closed. */
const LONG_VISIT_MINUTES = 120

type Sort = "recent" | "longest" | "name"
const SORTS = [
  { value: "recent", label: "Newest first" },
  { value: "longest", label: "Here longest" },
  { value: "name", label: "Last name" },
]

export function NowPage() {
  const { invalidate, setCurrentCount, setFlaggedCount, openStudent, setPage } = useDashboard()
  const confirm = useConfirm()
  const now = useNow(30000)
  const [query, setQuery] = React.useState("")
  const [sort, setSort] = React.useState<Sort>("recent")
  const [clearOpen, setClearOpen] = React.useState(false)
  const [pending, setPending] = React.useState<Set<number>>(new Set())

  // The roster polls every 10 seconds; switching back to Now shows the last roster instantly.
  const current = useCachedGet<CurrentState>("current", NO_PARAMS, { refreshMs: 10000 }).data ?? null
  const overview = useCachedGet<Overview>("admin-overview", NO_PARAMS, { refreshMs: 10000 }).data ?? null

  React.useEffect(() => {
    if (current) setCurrentCount(current.currentCount)
  }, [current, setCurrentCount])
  React.useEffect(() => {
    if (overview) setFlaggedCount(overview.flaggedVisits)
  }, [overview, setFlaggedCount])

  const roster = current?.students ?? []
  const longCount = roster.filter((visit) => (minutesSince(visit.checkedInAt, now) ?? 0) >= LONG_VISIT_MINUTES).length

  const rows = React.useMemo(() => {
    const needle = query.trim().toLowerCase()
    const filtered = roster.filter(
      (visit) =>
        !needle || `${visit.firstName} ${visit.lastName} ${visit.studentId} ${visit.reason}`.toLowerCase().includes(needle)
    )
    return filtered.sort((a, b) => {
      if (sort === "name") return a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName)
      const diff = new Date(a.checkedInAt).getTime() - new Date(b.checkedInAt).getTime()
      return sort === "longest" ? diff : -diff
    })
  }, [roster, query, sort])

  async function checkOut(visit: Visit) {
    setPending((set) => new Set(set).add(visit.visitId))
    try {
      await post("checkout", { visitId: visit.visitId, method: "librarian" })
      toast.success(`${fullName(visit)} checked out`)
      invalidate()
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setPending((set) => {
        const next = new Set(set)
        next.delete(visit.visitId)
        return next
      })
    }
  }

  function checkOutEveryone() {
    const needsReview = roster.some((visit) => (minutesSince(visit.checkedInAt) ?? 0) > REVIEW_AFTER_MINUTES)
    if (needsReview) {
      setClearOpen(true)
      return
    }
    confirm({
      title: "Check everyone out?",
      description: `All ${plural(roster.length, "student")} in the library will be checked out as of now.`,
      action: "Check everyone out",
      run: async () => {
        await post("clear", { method: "clear_all" })
        toast.success("Everyone was checked out")
        invalidate()
      },
    })
  }

  const loading = current === null

  return (
    <PageBody>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          emphasis
          label="In the library"
          value={loading ? "—" : current.currentCount}
          detail={loading ? " " : longCount ? `${longCount} here over 2 hours` : "Live roster"}
        />
        <StatCard
          label="Visits today"
          value={overview?.visitsToday ?? "—"}
          detail={overview ? plural(overview.uniqueVisitorsToday, "unique student") : " "}
        />
        <StatCard
          label="Active students"
          value={overview?.activeStudents.toLocaleString() ?? "—"}
          detail="In the directory"
        />
        <StatCard
          label="Kiosks online"
          value={overview ? `${overview.onlineKiosks}/${overview.pairedKiosks}` : "—"}
          detail={overview ? (overview.onlineKiosks < overview.pairedKiosks ? "Some kiosks are offline" : "All paired kiosks online") : " "}
        />
      </div>

      <div className="grid gap-4 md:gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Card className="min-w-0">
          <CardHeader className="flex flex-wrap items-center gap-3">
            <div className="min-w-0 flex-1">
              <CardTitle>In the library</CardTitle>
              <CardDescription>
                {loading ? "Loading roster…" : roster.length ? `${plural(roster.length, "student")} checked in` : "Nobody is checked in"}
              </CardDescription>
            </div>
            <CardAction className="col-start-auto row-span-1 row-start-auto flex flex-wrap items-center justify-self-auto gap-2">
              <InputGroup className="w-full sm:w-56">
                <InputGroupAddon>
                  <HugeiconsIcon icon={Search01Icon} strokeWidth={2} />
                </InputGroupAddon>
                <InputGroupInput
                  type="search"
                  placeholder="Filter roster"
                  aria-label="Filter roster"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </InputGroup>
              <Select items={SORTS} value={sort} onValueChange={(value) => setSort(value as Sort)}>
                <SelectTrigger aria-label="Sort roster" className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SORTS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="destructive" onClick={checkOutEveryone} disabled={!roster.length}>
                <HugeiconsIcon icon={Logout03Icon} strokeWidth={2} data-icon="inline-start" />
                Check everyone out
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent className="px-0">
            {loading ? (
              <RosterSkeleton />
            ) : rows.length ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-(--card-spacing)">Student</TableHead>
                    <TableHead className="hidden sm:table-cell">Grade</TableHead>
                    <TableHead className="hidden md:table-cell">Reason</TableHead>
                    <TableHead>Checked in</TableHead>
                    <TableHead>Time here</TableHead>
                    <TableHead className="pr-(--card-spacing)">
                      <span className="sr-only">Actions</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((visit) => {
                    const elapsed = minutesSince(visit.checkedInAt, now)
                    const long = (elapsed ?? 0) >= LONG_VISIT_MINUTES
                    return (
                      <TableRow key={visit.visitId}>
                        <TableCell className="pl-(--card-spacing)">
                          <button
                            type="button"
                            className="flex items-center gap-3 rounded-xl text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
                            onClick={() => openStudent({ studentId: visit.studentId })}
                          >
                            <StudentAvatar person={visit} />
                            <span className="min-w-0">
                              <span className="block truncate font-medium hover:underline">{fullName(visit)}</span>
                              <span className="block text-xs text-muted-foreground tabular-nums">{visit.studentId}</span>
                            </span>
                          </button>
                        </TableCell>
                        <TableCell className="hidden text-muted-foreground sm:table-cell">{visit.grade ?? "—"}</TableCell>
                        <TableCell className="hidden md:table-cell">
                          <Badge variant="secondary">{visit.reason}</Badge>
                        </TableCell>
                        <TableCell className="tabular-nums text-muted-foreground">{formatTime(visit.checkedInAt)}</TableCell>
                        <TableCell>
                          <span className={cn("inline-flex items-center gap-1.5 tabular-nums", long && "font-medium text-amber-700 dark:text-amber-400")}>
                            {long ? <HugeiconsIcon icon={Alert02Icon} strokeWidth={2} className="size-3.5" aria-label="Long visit" /> : null}
                            {formatElapsed(elapsed)}
                          </span>
                        </TableCell>
                        <TableCell className="pr-(--card-spacing) text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={pending.has(visit.visitId)}
                            onClick={() => checkOut(visit)}
                          >
                            Check out
                          </Button>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            ) : (
              <Empty className="py-12">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <HugeiconsIcon icon={query ? Search01Icon : CheckmarkCircle02Icon} strokeWidth={2} />
                  </EmptyMedia>
                  <EmptyTitle>{query ? "No one matches that filter" : "The library is empty"}</EmptyTitle>
                  <EmptyDescription>
                    {query ? "Try a name, student ID, or reason." : "Students appear here as soon as they scan in at a kiosk."}
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}
          </CardContent>
        </Card>

        <div className="flex min-w-0 flex-col gap-4 md:gap-6">
          <AttentionCard overview={overview} now={now} onGo={setPage} onStudent={(studentId) => openStudent({ studentId })} />
          <ActivityCard overview={overview} onStudent={(studentId) => openStudent({ studentId })} onMore={() => setPage("visits")} />
        </div>
      </div>

      <ClearDialog open={clearOpen} onOpenChange={setClearOpen} visits={roster} onDone={invalidate} />
    </PageBody>
  )
}

function RosterSkeleton() {
  return (
    <div className="flex flex-col gap-4 px-(--card-spacing) py-2">
      {Array.from({ length: 5 }, (_, index) => (
        <div key={index} className="flex items-center gap-3">
          <Skeleton className="size-8 rounded-full" />
          <Skeleton className="h-4 w-40" />
          <Skeleton className="ml-auto h-4 w-16" />
        </div>
      ))}
    </div>
  )
}

function AttentionCard({
  overview,
  now,
  onGo,
  onStudent,
}: {
  overview: Overview | null
  now: number
  onGo: (page: "devices" | "flagged") => void
  onStudent: (studentId: string) => void
}) {
  const longVisits = overview?.attention.longVisits ?? []
  const staleKiosks = overview?.attention.staleKiosks ?? []
  const flagged = overview?.flaggedVisits ?? 0
  const clear = overview && !longVisits.length && !staleKiosks.length && !flagged

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Needs attention</CardTitle>
        <CardDescription>Long visits, likely missed checkouts, and offline kiosks</CardDescription>
      </CardHeader>
      <CardContent>
        {!overview ? (
          <Skeleton className="h-12 w-full" />
        ) : clear ? (
          <div className="flex items-center gap-3 rounded-2xl bg-muted/60 p-3 text-sm text-muted-foreground">
            <HugeiconsIcon icon={CheckmarkCircle02Icon} strokeWidth={2} className="size-5 text-primary" />
            Everything looks good.
          </div>
        ) : (
          <ul className="flex flex-col gap-1">
            {longVisits.map((visit) => (
              <li key={`v${visit.visitId}`}>
                <button
                  type="button"
                  onClick={() => onStudent(visit.studentId)}
                  className="flex w-full items-start gap-3 rounded-2xl p-2 text-left hover:bg-muted"
                >
                  <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-400">
                    <HugeiconsIcon icon={Alert02Icon} strokeWidth={2} className="size-4" />
                  </span>
                  <span className="min-w-0 text-sm">
                    <span className="block font-medium">{fullName(visit)}</span>
                    <span className="block text-xs text-muted-foreground">
                      Here {formatDuration(minutesSince(visit.checkedInAt, now))} · in at {formatTime(visit.checkedInAt)}
                    </span>
                  </span>
                </button>
              </li>
            ))}
            {flagged ? (
              <li>
                <button
                  type="button"
                  onClick={() => onGo("flagged")}
                  className="flex w-full items-start gap-3 rounded-2xl p-2 text-left hover:bg-muted"
                >
                  <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-400">
                    <HugeiconsIcon icon={Flag02Icon} strokeWidth={2} className="size-4" />
                  </span>
                  <span className="min-w-0 text-sm">
                    <span className="block font-medium">
                      {flagged} flagged {flagged === 1 ? "visit" : "visits"} to review
                    </span>
                    <span className="block text-xs text-muted-foreground">Likely missed checkouts you can fix in one step</span>
                  </span>
                </button>
              </li>
            ) : null}
            {staleKiosks.map((kiosk) => (
              <li key={`k${kiosk.id}`}>
                <button
                  type="button"
                  onClick={() => onGo("devices")}
                  className="flex w-full items-start gap-3 rounded-2xl p-2 text-left hover:bg-muted"
                >
                  <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                    <HugeiconsIcon icon={WifiOff01Icon} strokeWidth={2} className="size-4" />
                  </span>
                  <span className="min-w-0 text-sm">
                    <span className="block font-medium">{kiosk.name} is offline</span>
                    <span className="block text-xs text-muted-foreground">Last seen {formatAgo(kiosk.lastSeenAt, now)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

function ActivityCard({
  overview,
  onStudent,
  onMore,
}: {
  overview: Overview | null
  onStudent: (studentId: string) => void
  onMore: () => void
}) {
  const recent = overview?.recent ?? []
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Recent activity</CardTitle>
        <CardDescription>Latest check-ins</CardDescription>
        <CardAction>
          <Button variant="ghost" size="sm" onClick={onMore}>
            View all
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {!overview ? (
          <Skeleton className="h-40 w-full" />
        ) : recent.length ? (
          <ol className="relative flex flex-col">
            {recent.map((visit, index) => (
              <li key={visit.visitId} className="relative flex gap-3 pb-3 last:pb-0">
                {index < recent.length - 1 ? (
                  <span className="absolute top-5 bottom-0 left-[5px] w-px bg-border" aria-hidden="true" />
                ) : null}
                <span
                  className={cn(
                    "relative mt-1.5 size-[11px] shrink-0 rounded-full border-2 border-card",
                    visit.checkedOutAt ? "bg-muted-foreground/40" : "bg-primary"
                  )}
                  aria-hidden="true"
                />
                <button type="button" onClick={() => onStudent(visit.studentId)} className="min-w-0 flex-1 text-left">
                  <span className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="truncate font-medium hover:underline">{fullName(visit)}</span>
                    <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{formatTime(visit.checkedInAt)}</span>
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {visit.reason} · {visit.checkedOutAt ? `left after ${formatDuration(visit.durationMinutes)}` : "still here"}
                  </span>
                </button>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-muted-foreground">No activity yet today.</p>
        )}
      </CardContent>
    </Card>
  )
}
