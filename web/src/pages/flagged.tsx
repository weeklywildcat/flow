import * as React from "react"
import { toast } from "sonner"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  CheckmarkCircle02Icon,
  MoreHorizontalIcon,
  Tick02Icon,
  UserCircleIcon,
  WrenchIcon,
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
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { PageBody, StudentAvatar, Toolbar, errorMessage, useConfirm } from "@/components/common"
import { post, type FlagKind, type FlaggedList, type FlaggedVisit } from "@/lib/api"
import { useCachedGet } from "@/lib/cache"
import { useDashboard } from "@/lib/dashboard"
import { formatDateTime, formatDuration, fullName, plural } from "@/lib/format"
import { cn } from "@/lib/utils"

const NO_PARAMS = {}

const FLAG_LABELS: Record<FlagKind, { label: string; hint: string }> = {
  open: { label: "Never checked out", hint: "Still open long after check-in" },
  cleared: { label: "Cleared at closing", hint: "Closed by Check everyone out" },
  long: { label: "Unusually long", hint: "Scanned out, but over the limit" },
}

type Mode = "typical" | "fixed"
const MODE_ITEMS = [
  { value: "typical", label: "Typical for each reason" },
  { value: "fixed", label: "Same length for all" },
]

function formatOpenFor(minutes: number): string {
  if (minutes < 24 * 60) return formatDuration(minutes)
  const days = Math.floor(minutes / (24 * 60))
  return `${days} day${days === 1 ? "" : "s"}`
}

export function FlaggedPage() {
  const { invalidate, openStudent } = useDashboard()
  const confirm = useConfirm()
  const [values, setValues] = React.useState<Record<number, string>>({})
  const [selected, setSelected] = React.useState<Set<number>>(new Set())
  const [mode, setMode] = React.useState<Mode>("typical")
  const [fixedMinutes, setFixedMinutes] = React.useState("30")
  const [busy, setBusy] = React.useState(false)

  const data = useCachedGet<FlaggedList>("admin-flagged-visits", NO_PARAMS).data ?? null

  // Reset the editable lengths only when the list itself changes, so a background refresh that
  // returns the same visits never wipes out minutes someone is typing.
  const listSignature = data ? data.visits.map((visit) => `${visit.visitId}:${visit.suggestedMinutes}`).join(",") : ""
  const appliedSignature = React.useRef<string | null>(null)
  React.useEffect(() => {
    if (!data || appliedSignature.current === listSignature) return
    appliedSignature.current = listSignature
    setValues(Object.fromEntries(data.visits.map((visit) => [visit.visitId, String(visit.suggestedMinutes)])))
    setSelected(new Set(data.visits.map((visit) => visit.visitId)))
    setMode("typical")
  }, [data, listSignature])

  const visits = data?.visits ?? []
  const allSelected = visits.length > 0 && visits.every((visit) => selected.has(visit.visitId))

  function applyMode(nextMode: Mode, minutesText = fixedMinutes) {
    setMode(nextMode)
    const minutes = Number(minutesText)
    if (nextMode === "fixed" && (!Number.isInteger(minutes) || minutes < 0)) return
    setValues(
      Object.fromEntries(
        visits.map((visit) => [
          visit.visitId,
          String(nextMode === "typical" ? visit.suggestedMinutes : Math.min(minutes, visit.maxMinutes)),
        ])
      )
    )
  }

  function invalidRow(visit: FlaggedVisit): boolean {
    const raw = (values[visit.visitId] ?? "").trim()
    const minutes = Number(raw)
    return raw === "" || !Number.isInteger(minutes) || minutes < 0 || minutes > visit.maxMinutes
  }

  function fixSelected() {
    const chosen = visits.filter((visit) => selected.has(visit.visitId))
    const broken = chosen.find(invalidRow)
    if (broken) {
      toast.error(`Enter whole minutes from 0 to ${broken.maxMinutes} for ${fullName(broken)}.`)
      return
    }
    const open = chosen.filter((visit) => visit.flag === "open").length
    confirm({
      title: `Fix ${plural(chosen.length, "visit")}?`,
      description: `Each visit keeps its check-in time and gets the length shown, so history, stats, and exports use it.${
        open ? ` ${open === 1 ? "The open visit" : `The ${open} open visits`} will be checked out at that time.` : ""
      }`,
      action: `Fix ${plural(chosen.length, "visit")}`,
      run: async () => {
        setBusy(true)
        try {
          const result = await post<{ fixed: number; closed: number }>("admin-fix-visits", {
            fixes: chosen.map((visit) => ({ visitId: visit.visitId, durationMinutes: Number(values[visit.visitId]) })),
          })
          toast.success(
            `${plural(result.fixed, "visit")} fixed${result.closed ? ` · ${result.closed} checked out` : ""}`
          )
          invalidate()
        } finally {
          setBusy(false)
        }
      },
    })
  }

  async function keep(visit: FlaggedVisit) {
    try {
      await post("admin-review-flag", { visitId: visit.visitId, reviewed: true })
      invalidate()
      toast(`Kept ${fullName(visit)}'s visit as is`, {
        action: {
          label: "Undo",
          onClick: () => {
            post("admin-review-flag", { visitId: visit.visitId, reviewed: false })
              .then(invalidate)
              .catch((error) => toast.error(errorMessage(error)))
          },
        },
      })
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  const typical = data?.typical
  const reasonSummary = typical
    ? Object.entries(typical.byReason)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([reason, minutes]) => `${reason} ${formatDuration(minutes)}`)
        .join(" · ")
    : ""

  return (
    <PageBody>
      <Card>
        <CardHeader>
          <CardTitle>Likely missed checkouts</CardTitle>
          <CardDescription>
            Visits longer than {formatDuration(data?.thresholdMinutes ?? 120)}, or still open that long after check-in,
            usually mean a student forgot to scan out. Fix them to a normal length, or keep any that really were that
            long.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Toolbar>
            <Select items={MODE_ITEMS} value={mode} onValueChange={(value) => applyMode(value as Mode)}>
              <SelectTrigger aria-label="Suggested lengths" className="w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MODE_ITEMS.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {mode === "fixed" ? (
              <InputGroup className="w-32">
                <InputGroupInput
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={1440}
                  aria-label="Length for every visit"
                  value={fixedMinutes}
                  onChange={(event) => {
                    setFixedMinutes(event.target.value)
                    applyMode("fixed", event.target.value)
                  }}
                />
                <InputGroupAddon align="inline-end">
                  <InputGroupText>min</InputGroupText>
                </InputGroupAddon>
              </InputGroup>
            ) : null}
            <Button className="sm:ml-auto" disabled={!selected.size || busy} onClick={fixSelected}>
              {busy ? <Spinner /> : <HugeiconsIcon icon={WrenchIcon} strokeWidth={2} data-icon="inline-start" />}
              Fix {selected.size ? plural(selected.size, "visit") : "visits"}
            </Button>
          </Toolbar>
        </CardContent>
      </Card>

      <Card className="min-w-0">
        <CardHeader>
          <CardTitle>Flagged visits</CardTitle>
          <CardDescription>
            {data
              ? data.total > visits.length
                ? `Showing the ${visits.length} most recent of ${data.total}`
                : plural(data.total, "visit") + " to review"
              : "Loading…"}
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          {!data ? (
            <div className="flex flex-col gap-3 px-(--card-spacing)">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : visits.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10 pl-(--card-spacing)">
                    <Checkbox
                      aria-label="Select every flagged visit"
                      checked={allSelected}
                      indeterminate={selected.size > 0 && !allSelected}
                      onCheckedChange={(checked) => setSelected(checked ? new Set(visits.map((visit) => visit.visitId)) : new Set())}
                    />
                  </TableHead>
                  <TableHead>Student</TableHead>
                  <TableHead className="hidden lg:table-cell">Reason</TableHead>
                  <TableHead className="hidden md:table-cell">Checked in</TableHead>
                  <TableHead>Recorded</TableHead>
                  <TableHead className="hidden sm:table-cell">Why</TableHead>
                  <TableHead>New length</TableHead>
                  <TableHead className="w-12 pr-(--card-spacing)">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visits.map((visit) => {
                  const invalid = selected.has(visit.visitId) && invalidRow(visit)
                  const suggested = values[visit.visitId] === String(visit.suggestedMinutes)
                  return (
                    <TableRow key={visit.visitId} data-state={selected.has(visit.visitId) ? "selected" : undefined}>
                      <TableCell className="pl-(--card-spacing)">
                        <Checkbox
                          aria-label={`Select ${fullName(visit)}'s visit`}
                          checked={selected.has(visit.visitId)}
                          onCheckedChange={(checked) =>
                            setSelected((set) => {
                              const next = new Set(set)
                              if (checked) next.add(visit.visitId)
                              else next.delete(visit.visitId)
                              return next
                            })
                          }
                        />
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
                            <span className="block text-xs text-muted-foreground tabular-nums md:hidden">
                              {formatDateTime(visit.checkedInAt)}
                            </span>
                            <span className="hidden text-xs text-muted-foreground tabular-nums md:block">{visit.studentId}</span>
                          </span>
                        </button>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        <Badge variant="secondary">{visit.reason}</Badge>
                      </TableCell>
                      <TableCell className="hidden tabular-nums text-muted-foreground md:table-cell">
                        {formatDateTime(visit.checkedInAt)}
                      </TableCell>
                      <TableCell className="font-medium tabular-nums text-amber-700 dark:text-amber-400">
                        {visit.flag === "open" ? `Open ${formatOpenFor(visit.elapsedMinutes)}` : formatDuration(visit.durationMinutes)}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <span className="flex flex-col">
                          <span className="text-sm">{FLAG_LABELS[visit.flag].label}</span>
                          <span className="text-xs text-muted-foreground">{FLAG_LABELS[visit.flag].hint}</span>
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <InputGroup className={cn("w-28", !selected.has(visit.visitId) && "opacity-50")}>
                            <InputGroupInput
                              type="number"
                              inputMode="numeric"
                              min={0}
                              max={visit.maxMinutes}
                              className="text-right tabular-nums"
                              aria-label={`New length for ${fullName(visit)}`}
                              aria-invalid={invalid || undefined}
                              value={values[visit.visitId] ?? ""}
                              onChange={(event) => setValues((current) => ({ ...current, [visit.visitId]: event.target.value }))}
                            />
                            <InputGroupAddon align="inline-end">
                              <InputGroupText>min</InputGroupText>
                            </InputGroupAddon>
                          </InputGroup>
                          {suggested && mode === "typical" ? (
                            <span className="hidden text-xs text-muted-foreground xl:inline">typical</span>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="pr-(--card-spacing) text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            render={<Button variant="ghost" size="icon-sm" aria-label={`Actions for ${fullName(visit)}'s visit`} />}
                          >
                            <HugeiconsIcon icon={MoreHorizontalIcon} strokeWidth={2} />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuItem onClick={() => keep(visit)}>
                              <HugeiconsIcon icon={Tick02Icon} strokeWidth={2} />
                              Keep as is
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openStudent({ studentId: visit.studentId })}>
                              <HugeiconsIcon icon={UserCircleIcon} strokeWidth={2} />
                              Open student
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
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
                  <HugeiconsIcon icon={CheckmarkCircle02Icon} strokeWidth={2} />
                </EmptyMedia>
                <EmptyTitle>Nothing to review</EmptyTitle>
                <EmptyDescription>Every visit has a believable length. Long ones you keep stay off this list.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </CardContent>
        {typical && visits.length ? (
          <CardFooter className="flex-col items-start gap-1 text-xs text-muted-foreground">
            <span>
              Typical lengths are the median of {plural(typical.sampleSize, "visit")} students scanned out of themselves in
              the last {typical.lookbackDays} days{reasonSummary ? `: ${reasonSummary}` : ""}.
            </span>
            <span>Reasons with fewer than five such visits use the overall typical, {formatDuration(typical.overallMinutes)}.</span>
          </CardFooter>
        ) : null}
      </Card>
    </PageBody>
  )
}
