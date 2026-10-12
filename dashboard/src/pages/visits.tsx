import * as React from "react"
import { toast } from "sonner"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Archive02Icon,
  ArrowTurnBackwardIcon,
  Download04Icon,
  MoreHorizontalIcon,
  PencilEdit02Icon,
  Search01Icon,
} from "@hugeicons/core-free-icons"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { Input } from "@/components/ui/input"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { PageBody, StatusBadge, StudentAvatar, Toolbar, errorMessage, useConfirm } from "@/components/common"
import { DurationDialog } from "@/components/visit-dialogs"
import { REASONS, apiUrl, get, post, type Visit, type VisitList } from "@/lib/api"
import { useDashboard } from "@/lib/dashboard"
import { useDebouncedValue } from "@/lib/hooks"
import {
  CHECKOUT_LABELS,
  addDays,
  formatCalendarDate,
  formatDateTime,
  formatDuration,
  formatNumber,
  fullName,
  plural,
  todayLocal,
} from "@/lib/format"
import { cn } from "@/lib/utils"

const PAGE_SIZE = 50
type Period = "today" | "7" | "30" | "custom"

const REASON_ITEMS = [{ value: "", label: "All reasons" }, ...REASONS.map((reason) => ({ value: reason, label: reason }))]
const VIEW_ITEMS = [
  { value: "active", label: "Active records" },
  { value: "archived", label: "Archived" },
]

function rangeFor(period: Period, custom: { from: string; to: string }) {
  const today = todayLocal()
  if (period === "custom") return custom
  const days = period === "today" ? 0 : period === "7" ? 6 : 29
  return { from: addDays(today, -days), to: today }
}

function isEditable(visit: Visit) {
  return Boolean(visit.checkedOutAt) && !visit.archivedAt
}

export function VisitsPage() {
  const { dataVersion, invalidate, openStudent } = useDashboard()
  const confirm = useConfirm()
  const [period, setPeriod] = React.useState<Period>("7")
  const [custom, setCustom] = React.useState(() => ({ from: todayLocal(), to: todayLocal() }))
  const [search, setSearch] = React.useState("")
  const [reason, setReason] = React.useState("")
  const [view, setView] = React.useState<"active" | "archived">("active")
  const [offset, setOffset] = React.useState(0)
  const [data, setData] = React.useState<VisitList | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [selected, setSelected] = React.useState<Set<number>>(new Set())
  const [editing, setEditing] = React.useState<Visit[] | null>(null)
  const query = useDebouncedValue(search.trim(), 250)
  const archived = view === "archived"
  const range = rangeFor(period, custom)

  React.useEffect(() => setOffset(0), [period, custom.from, custom.to, query, reason, view])

  React.useEffect(() => {
    let cancelled = false
    setLoading(true)
    get<VisitList>("admin-history", {
      limit: PAGE_SIZE,
      offset,
      q: query,
      reason,
      from: range.from,
      to: range.to,
      archived: archived ? 1 : null,
    })
      .then((next) => {
        if (cancelled) return
        setData(next)
        setSelected(new Set())
      })
      .catch((error) => !cancelled && toast.error(errorMessage(error)))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [offset, query, reason, range.from, range.to, archived, dataVersion])

  const visits = data?.visits ?? []
  const editable = visits.filter(isEditable)
  const allSelected = editable.length > 0 && editable.every((visit) => selected.has(visit.visitId))
  const someSelected = editable.some((visit) => selected.has(visit.visitId))
  const total = data?.total ?? 0

  function toggle(visitId: number, checked: boolean) {
    setSelected((set) => {
      const next = new Set(set)
      if (checked) next.add(visitId)
      else next.delete(visitId)
      return next
    })
  }

  function archive(visit: Visit, restore: boolean) {
    const who = fullName(visit)
    confirm(
      restore
        ? {
            title: "Restore this visit?",
            description: `${who}'s visit from ${formatDateTime(visit.checkedInAt)} goes back into history, stats, and exports.`,
            action: "Restore visit",
            run: async () => {
              await post("admin-archive-visit", { visitId: visit.visitId, archived: false })
              toast.success("Visit restored")
              invalidate()
            },
          }
        : {
            title: "Archive this visit?",
            description: `${who}'s visit from ${formatDateTime(visit.checkedInAt)} will be hidden from history, stats, and exports. You can restore it from Archived.${visit.checkedOutAt ? "" : " It has no checkout yet, so archiving also closes it."}`,
            action: "Archive visit",
            destructive: true,
            run: async () => {
              await post("admin-archive-visit", { visitId: visit.visitId, archived: true })
              toast.success("Visit archived")
              invalidate()
            },
          }
    )
  }

  const exportHref = apiUrl("export-csv", { from: range.from, to: range.to })

  return (
    <PageBody>
      <Toolbar>
        <Tabs value={period} onValueChange={(value) => setPeriod(value as Period)} className="max-w-full overflow-x-auto [scrollbar-width:none]">
          <TabsList>
            <TabsTrigger value="today">Today</TabsTrigger>
            <TabsTrigger value="7">7 days</TabsTrigger>
            <TabsTrigger value="30">30 days</TabsTrigger>
            <TabsTrigger value="custom">Custom</TabsTrigger>
          </TabsList>
        </Tabs>
        {period === "custom" ? (
          <div className="flex items-center gap-2">
            <Input
              type="date"
              aria-label="From"
              className="w-40"
              value={custom.from}
              max={custom.to}
              onChange={(event) => event.target.value && setCustom((range) => ({ ...range, from: event.target.value }))}
            />
            <span className="text-sm text-muted-foreground">to</span>
            <Input
              type="date"
              aria-label="To"
              className="w-40"
              value={custom.to}
              min={custom.from}
              max={todayLocal()}
              onChange={(event) => event.target.value && setCustom((range) => ({ ...range, to: event.target.value }))}
            />
          </div>
        ) : null}
        <InputGroup className="w-full sm:w-64">
          <InputGroupAddon>
            <HugeiconsIcon icon={Search01Icon} strokeWidth={2} />
          </InputGroupAddon>
          <InputGroupInput
            type="search"
            placeholder="Name or student ID"
            aria-label="Search visits"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </InputGroup>
        <Select items={REASON_ITEMS} value={reason} onValueChange={(value) => setReason(String(value ?? ""))}>
          <SelectTrigger aria-label="Reason" className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {REASON_ITEMS.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select items={VIEW_ITEMS} value={view} onValueChange={(value) => setView(value as "active" | "archived")}>
          <SelectTrigger aria-label="Records" className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {VIEW_ITEMS.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" className="sm:ml-auto" nativeButton={false} render={<a href={exportHref} download />}>
          <HugeiconsIcon icon={Download04Icon} strokeWidth={2} data-icon="inline-start" />
          Export CSV
        </Button>
      </Toolbar>

      <Card className="min-w-0">
        <CardHeader className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <CardTitle>{archived ? "Archived visits" : "Visit history"}</CardTitle>
            <CardDescription>
              {data ? plural(total, archived ? "archived visit" : "visit") : "Loading…"} ·{" "}
              {range.from === range.to
                ? formatCalendarDate(range.from)
                : `${formatCalendarDate(range.from, false)} – ${formatCalendarDate(range.to)}`}
            </CardDescription>
          </div>
          {selected.size ? (
            <div className="flex items-center gap-2 rounded-full bg-muted py-1 pr-1 pl-3 text-sm">
              <span className="font-medium">{selected.size} selected</span>
              <Button size="sm" onClick={() => setEditing(visits.filter((visit) => selected.has(visit.visitId)))}>
                <HugeiconsIcon icon={PencilEdit02Icon} strokeWidth={2} data-icon="inline-start" />
                Edit durations
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
                Clear
              </Button>
            </div>
          ) : null}
        </CardHeader>
        <CardContent className={cn("px-0 transition-opacity", loading && data && "opacity-60")}>
          {visits.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10 pl-(--card-spacing)">
                    {!archived && editable.length ? (
                      <Checkbox
                        aria-label="Select every completed visit on this page"
                        checked={allSelected}
                        indeterminate={someSelected && !allSelected}
                        onCheckedChange={(checked) =>
                          setSelected(checked ? new Set(editable.map((visit) => visit.visitId)) : new Set())
                        }
                      />
                    ) : null}
                  </TableHead>
                  <TableHead>Student</TableHead>
                  <TableHead className="hidden md:table-cell">Reason</TableHead>
                  <TableHead>Checked in</TableHead>
                  <TableHead className="hidden lg:table-cell">Checked out</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead className="hidden sm:table-cell">Checkout</TableHead>
                  <TableHead className="w-12 pr-(--card-spacing)">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visits.map((visit) => (
                  <TableRow key={visit.visitId} data-state={selected.has(visit.visitId) ? "selected" : undefined}>
                    <TableCell className="pl-(--card-spacing)">
                      {!archived && isEditable(visit) ? (
                        <Checkbox
                          aria-label={`Select ${fullName(visit)}'s visit`}
                          checked={selected.has(visit.visitId)}
                          onCheckedChange={(checked) => toggle(visit.visitId, Boolean(checked))}
                        />
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <button
                        type="button"
                        className="flex items-center gap-3 text-left"
                        onClick={() => openStudent({ studentId: visit.studentId })}
                      >
                        <StudentAvatar person={visit} />
                        <span className="min-w-0">
                          <span className="block truncate font-medium hover:underline">{fullName(visit)}</span>
                          <span className="block text-xs text-muted-foreground tabular-nums">
                            {visit.studentId}
                            {visit.archivedAt ? ` · archived ${formatDateTime(visit.archivedAt)}` : ""}
                          </span>
                        </span>
                      </button>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <Badge variant="secondary">{visit.reason}</Badge>
                    </TableCell>
                    <TableCell className="tabular-nums text-muted-foreground">{formatDateTime(visit.checkedInAt)}</TableCell>
                    <TableCell className="hidden tabular-nums text-muted-foreground lg:table-cell">
                      {formatDateTime(visit.checkedOutAt)}
                    </TableCell>
                    <TableCell className="tabular-nums">{formatDuration(visit.durationMinutes)}</TableCell>
                    <TableCell className="hidden sm:table-cell">
                      {visit.checkedOutAt ? (
                        <span className="text-muted-foreground">
                          {visit.checkoutMethod ? CHECKOUT_LABELS[visit.checkoutMethod] : "Checked out"}
                        </span>
                      ) : (
                        <StatusBadge tone="good">Still here</StatusBadge>
                      )}
                    </TableCell>
                    <TableCell className="pr-(--card-spacing) text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={<Button variant="ghost" size="icon-sm" aria-label={`Actions for ${fullName(visit)}'s visit`} />}
                        >
                          <HugeiconsIcon icon={MoreHorizontalIcon} strokeWidth={2} />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-44">
                          {archived ? (
                            <DropdownMenuItem onClick={() => archive(visit, true)}>
                              <HugeiconsIcon icon={ArrowTurnBackwardIcon} strokeWidth={2} />
                              Restore
                            </DropdownMenuItem>
                          ) : (
                            <>
                              <DropdownMenuItem disabled={!isEditable(visit)} onClick={() => setEditing([visit])}>
                                <HugeiconsIcon icon={PencilEdit02Icon} strokeWidth={2} />
                                Edit duration
                              </DropdownMenuItem>
                              <DropdownMenuItem variant="destructive" onClick={() => archive(visit, false)}>
                                <HugeiconsIcon icon={Archive02Icon} strokeWidth={2} />
                                Archive
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <Empty className="py-12">
              <EmptyHeader>
                <EmptyTitle>{loading ? "Loading visits…" : archived ? "No archived visits" : "No visits found"}</EmptyTitle>
                <EmptyDescription>
                  {loading ? "" : archived ? "Visits you archive show up here." : "Try a different date range, reason, or search."}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </CardContent>
        {total > PAGE_SIZE ? (
          <CardFooter className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
            <span className="tabular-nums">
              {formatNumber(offset + 1)}–{formatNumber(Math.min(offset + visits.length, total))} of {formatNumber(total)}
            </span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}>
                Previous
              </Button>
              <Button variant="outline" size="sm" disabled={offset + PAGE_SIZE >= total} onClick={() => setOffset(offset + PAGE_SIZE)}>
                Next
              </Button>
            </div>
          </CardFooter>
        ) : null}
      </Card>

      <DurationDialog visits={editing} onOpenChange={(open) => !open && setEditing(null)} onDone={invalidate} />
    </PageBody>
  )
}
