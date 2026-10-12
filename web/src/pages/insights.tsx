import * as React from "react"
import { Area, AreaChart, Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"
import { HugeiconsIcon } from "@hugeicons/react"
import { ArrowDown02Icon, ArrowUp02Icon, Award01Icon } from "@hugeicons/core-free-icons"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { PageBody, StudentAvatar, Toolbar } from "@/components/common"
import { type Stats } from "@/lib/api"
import { useCachedGet } from "@/lib/cache"
import { useDashboard } from "@/lib/dashboard"
import {
  formatCalendarDate,
  formatClockMinute,
  formatDay,
  formatDuration,
  formatHour,
  formatNumber,
  formatPercent,
  formatTime,
  mondayOf,
  plural,
  schoolYearStart,
  todayLocal,
} from "@/lib/format"
import { cn } from "@/lib/utils"

type Preset = "today" | "week" | "month" | "school" | "custom"

function rangeFor(preset: Preset, custom: { from: string; to: string }) {
  const today = todayLocal()
  if (preset === "today") return { from: today, to: today }
  if (preset === "week") return { from: mondayOf(today), to: today }
  if (preset === "school") return { from: schoolYearStart(today), to: today }
  if (preset === "custom") return custom
  return { from: today.slice(0, 8) + "01", to: today }
}

const visitsConfig = { visits: { label: "Visits", color: "var(--chart-visits)" } } satisfies ChartConfig

export function InsightsPage() {
  const { openStudent } = useDashboard()
  const [preset, setPreset] = React.useState<Preset>("month")
  const [custom, setCustom] = React.useState(() => ({ from: todayLocal().slice(0, 8) + "01", to: todayLocal() }))
  const range = rangeFor(preset, custom)
  // Flipping between ranges shows the last result for that range at once while it refreshes.
  const { data: stats, loading } = useCachedGet<Stats>("admin-stats", range.from > range.to ? null : range)

  const s = stats ?? null
  const dim = loading && s ? "opacity-60 transition-opacity" : "transition-opacity"

  return (
    <PageBody>
      <Toolbar>
        <Tabs value={preset} onValueChange={(value) => setPreset(value as Preset)} className="max-w-full overflow-x-auto [scrollbar-width:none]">
          <TabsList>
            <TabsTrigger value="today">Today</TabsTrigger>
            <TabsTrigger value="week">This week</TabsTrigger>
            <TabsTrigger value="month">This month</TabsTrigger>
            <TabsTrigger value="school">School year</TabsTrigger>
            <TabsTrigger value="custom">Custom</TabsTrigger>
          </TabsList>
        </Tabs>
        {preset === "custom" ? (
          <div className="flex items-center gap-2">
            <Input
              type="date"
              aria-label="From"
              className="w-40"
              value={custom.from}
              max={custom.to}
              onChange={(event) => event.target.value && setCustom((current) => ({ ...current, from: event.target.value }))}
            />
            <span className="text-sm text-muted-foreground">to</span>
            <Input
              type="date"
              aria-label="To"
              className="w-40"
              value={custom.to}
              min={custom.from}
              max={todayLocal()}
              onChange={(event) => event.target.value && setCustom((current) => ({ ...current, to: event.target.value }))}
            />
          </div>
        ) : null}
        <span className="text-sm text-muted-foreground sm:ml-auto">
          {range.from === range.to ? formatCalendarDate(range.from) : `${formatCalendarDate(range.from, false)} – ${formatCalendarDate(range.to)}`}
        </span>
      </Toolbar>

      {!s ? (
        <InsightsSkeleton />
      ) : (
        <div className={cn("flex flex-col gap-4 md:gap-6", dim)}>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Kpi
              label="Visits"
              value={formatNumber(s.summary.visits)}
              delta={s.summary.visitChange}
              deltaLabel={s.summary.comparisonLabel ?? "previous period"}
            />
            <Kpi label="Unique students" value={formatNumber(s.summary.uniqueStudents)} note={`${formatPercent(s.visitors.returningRate)} returning`} />
            <Kpi label="Peak occupancy" value={formatNumber(s.summary.peakOccupancy)} note="Most students here at once" />
            <Kpi label="Median visit" value={formatDuration(s.summary.medianDurationMinutes)} note={`Average ${formatDuration(s.summary.averageDurationMinutes)}`} />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Library traffic</CardTitle>
              <CardDescription>
                {s.traffic.granularity === "week" ? "Visits per week" : "Visits per day"} ·{" "}
                {s.summary.averageDailyVisits} on an average active day
              </CardDescription>
            </CardHeader>
            <CardContent>
              {s.summary.visits ? (
                <ChartContainer config={visitsConfig} className="aspect-auto h-64 w-full">
                  <AreaChart data={s.traffic.points} margin={{ left: 0, right: 8, top: 8 }}>
                    <defs>
                      <linearGradient id="trafficFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--color-visits)" stopOpacity={0.18} />
                        <stop offset="100%" stopColor="var(--color-visits)" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} />
                    <YAxis width={32} tickLine={false} axisLine={false} allowDecimals={false} />
                    <ChartTooltip cursor={{ strokeWidth: 1 }} content={<ChartTooltipContent indicator="line" />} />
                    <Area
                      dataKey="visits"
                      type="monotone"
                      stroke="var(--color-visits)"
                      strokeWidth={2}
                      fill="url(#trafficFill)"
                      dot={s.traffic.points.length <= 31 ? { r: 3, strokeWidth: 2, stroke: "var(--card)", fill: "var(--color-visits)" } : false}
                      activeDot={{ r: 5, strokeWidth: 2, stroke: "var(--card)" }}
                    />
                  </AreaChart>
                </ChartContainer>
              ) : (
                <NoData className="h-64" />
              )}
            </CardContent>
          </Card>

          <div className="grid gap-4 md:gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Time of day</CardTitle>
                <CardDescription>
                  {s.patterns.rushHour
                    ? `Rush: ${formatTime(s.patterns.rushHour.startAt)}–${formatTime(s.patterns.rushHour.endAt)}, ${plural(s.patterns.rushHour.checkIns, "check-in")}`
                    : "Check-ins by hour"}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {s.hourly.length ? (
                  <ChartContainer config={visitsConfig} className="aspect-auto h-56 w-full">
                    <BarChart data={s.hourly} margin={{ left: 0, right: 0, top: 8 }}>
                      <CartesianGrid vertical={false} />
                      <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={8} />
                      <YAxis width={32} tickLine={false} axisLine={false} allowDecimals={false} />
                      <ChartTooltip cursor={{ fill: "var(--muted)", opacity: 0.6 }} content={<ChartTooltipContent />} />
                      <Bar dataKey="visits" fill="var(--color-visits)" radius={[4, 4, 0, 0]} maxBarSize={24} />
                    </BarChart>
                  </ChartContainer>
                ) : (
                  <NoData className="h-56" />
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Days of the week</CardTitle>
                <CardDescription>
                  {s.patterns.busiestWeekday
                    ? `${s.patterns.busiestWeekday.weekday} is busiest, averaging ${s.patterns.busiestWeekday.averageVisits ?? s.patterns.busiestWeekday.visits}`
                    : "Average visits on each weekday"}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <BarList
                  rows={s.weekdays.filter((day) => (day.occurrences ?? 1) > 0 && (day.visits > 0 || !["Saturday", "Sunday"].includes(day.label)))}
                  format={(value) => (value % 1 ? value.toFixed(1) : String(value))}
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Why students come</CardTitle>
                <CardDescription>
                  {s.patterns.favoriteReason
                    ? `${s.patterns.favoriteReason.reason} leads with ${formatPercent(s.patterns.favoriteReason.share)} of visits`
                    : "Reasons chosen at check-in"}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <BarList rows={s.reasons} share={s.summary.visits} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Grade levels</CardTitle>
                <CardDescription>{s.patterns.topGrade ? `Grade ${s.patterns.topGrade.grade} visits most` : "Visits by grade"}</CardDescription>
              </CardHeader>
              <CardContent>
                <BarList
                  rows={s.grades.map((grade) => ({ ...grade, label: grade.label === "Not set" ? "Grade not set" : `Grade ${grade.label}` }))}
                  share={s.summary.visits}
                />
              </CardContent>
            </Card>
          </div>

          <div className="grid items-start gap-4 md:gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <VisitorsCard stats={s} />
            <Card>
              <CardHeader>
                <CardTitle>Regulars</CardTitle>
                <CardDescription>Students with five or more visits in this period</CardDescription>
              </CardHeader>
              <CardContent>
                {s.visitors.regulars.length ? (
                  <ol className="flex flex-col">
                    {s.visitors.regulars.map((student, index) => (
                      <li key={student.studentRowId}>
                        <button
                          type="button"
                          onClick={() => openStudent({ id: student.studentRowId })}
                          className="flex w-full items-center gap-3 rounded-2xl px-2 py-2 text-left hover:bg-muted"
                        >
                          <span className="w-4 text-right text-xs text-muted-foreground tabular-nums">{index + 1}</span>
                          <StudentAvatar person={student} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium">
                              {student.firstName} {student.lastName}
                            </span>
                            <span className="block text-xs text-muted-foreground">
                              {student.grade ? `Grade ${student.grade} · ` : ""}
                              {plural(student.daysVisited, "day")}
                            </span>
                          </span>
                          <span className="text-sm font-semibold tabular-nums">{student.visits}</span>
                        </button>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <NoData className="h-40" message="Nobody has five visits in this period yet." />
                )}
              </CardContent>
            </Card>
          </div>

          <FactsCard stats={s} />
          <SchoolYearCard stats={s} />
        </div>
      )}
    </PageBody>
  )
}

function Kpi({
  label,
  value,
  note,
  delta,
  deltaLabel,
}: {
  label: string
  value: string
  note?: string
  delta?: number
  deltaLabel?: string
}) {
  return (
    <Card size="sm">
      <CardContent className="flex flex-col gap-1">
        <span className="text-sm text-muted-foreground">{label}</span>
        <span className="text-3xl font-semibold tracking-tight">{value}</span>
        {delta !== undefined ? (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            {delta !== 0 ? (
              <HugeiconsIcon
                icon={delta > 0 ? ArrowUp02Icon : ArrowDown02Icon}
                strokeWidth={2.5}
                className={cn("size-3.5", delta > 0 ? "text-primary" : "text-destructive")}
              />
            ) : null}
            <span>
              <span className="font-medium text-foreground tabular-nums">
                {delta === 0 ? "Same" : `${delta > 0 ? "+" : "−"}${formatNumber(Math.abs(delta))}`}
              </span>{" "}
              vs {deltaLabel}
            </span>
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">{note}</span>
        )}
      </CardContent>
    </Card>
  )
}

/** Horizontal bars with the value at the tip; labels and values stay in text colors. */
function BarList({
  rows,
  share,
  format = (value) => formatNumber(value),
}: {
  rows: { label: string; visits: number }[]
  share?: number
  format?: (value: number) => string
}) {
  if (!rows.length) return <NoData className="h-40" />
  const max = Math.max(1, ...rows.map((row) => row.visits))
  return (
    <ul className="flex flex-col gap-3">
      {rows.map((row) => (
        <li key={row.label} className="grid grid-cols-[7rem_minmax(0,1fr)_4.5rem] items-center gap-3 text-sm">
          <span className="truncate text-muted-foreground" title={row.label}>
            {row.label}
          </span>
          <span className="h-2.5 overflow-hidden rounded-full bg-muted" title={`${row.label}: ${format(row.visits)}`}>
            <span className="block h-full rounded-full bg-chart-visits" style={{ width: `${(row.visits / max) * 100}%` }} />
          </span>
          <span className="text-right tabular-nums">
            {format(row.visits)}
            {share ? <span className="ml-1 text-xs text-muted-foreground">{Math.round((row.visits / share) * 100)}%</span> : null}
          </span>
        </li>
      ))}
    </ul>
  )
}

function VisitorsCard({ stats }: { stats: Stats }) {
  const v = stats.visitors
  const total = v.returningStudents + v.firstTimeStudents
  const returningShare = total ? (v.returningStudents / total) * 100 : 0
  return (
    <Card>
      <CardHeader>
        <CardTitle>Visitors</CardTitle>
        <CardDescription>New and returning students in this period</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {total ? (
          <div className="flex flex-col gap-2">
            <div className="flex h-3 gap-0.5 overflow-hidden rounded-full" role="img" aria-label={`${v.returningStudents} returning, ${v.firstTimeStudents} first-time`}>
              <span className="h-full rounded-l-full bg-chart-visits" style={{ width: `${returningShare}%` }} />
              <span className="h-full flex-1 rounded-r-full bg-chart-visits/30" />
            </div>
            <div className="flex justify-between text-sm">
              <span className="flex items-center gap-2">
                <span className="size-2.5 rounded-full bg-chart-visits" aria-hidden="true" />
                <span className="font-medium tabular-nums">{formatNumber(v.returningStudents)}</span>
                <span className="text-muted-foreground">returning</span>
              </span>
              <span className="flex items-center gap-2">
                <span className="size-2.5 rounded-full bg-chart-visits/30" aria-hidden="true" />
                <span className="font-medium tabular-nums">{formatNumber(v.firstTimeStudents)}</span>
                <span className="text-muted-foreground">first-time</span>
              </span>
            </div>
          </div>
        ) : null}
        <dl className="grid grid-cols-3 gap-3">
          <Metric label="Came back" value={formatPercent(v.repeatRate)} note={plural(v.repeatVisitors, "student")} />
          <Metric label="5+ visits" value={formatNumber(v.regularCount)} note="regulars" />
          <Metric label="5+ days" value={formatNumber(v.fiveDayVisitors)} note="students" />
        </dl>
      </CardContent>
    </Card>
  )
}

function Metric({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-2xl bg-muted/60 p-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-xl font-semibold tracking-tight">{value}</dd>
      {note ? <dd className="text-xs text-muted-foreground">{note}</dd> : null}
    </div>
  )
}

function FactsCard({ stats }: { stats: Stats }) {
  const p = stats.patterns
  const l = stats.lunch
  const window = l.windowLabel ?? "11:45 AM–1:40 PM"
  const groups: { title: string; facts: [string, string, string?][] }[] = [
    {
      title: "Visit length",
      facts: [
        ["Average visit", formatDuration(stats.summary.averageDurationMinutes)],
        [
          "Typical range",
          p.durationMiddle50 ? `${formatDuration(p.durationMiddle50.lowMinutes)} – ${formatDuration(p.durationMiddle50.highMinutes)}` : "—",
          "Middle half of completed visits",
        ],
        ["90% are under", formatDuration(p.durationP90Minutes)],
        ["Longest visit", formatDuration(p.longestCompletedVisitMinutes), "Can mean a missed checkout"],
      ],
    },
    {
      title: `Lunch · ${window}`,
      facts: [
        ["Lunch visits", formatNumber(l.visits)],
        ["Peak occupancy", l.peakOccupancy == null ? "—" : String(l.peakOccupancy)],
        ["Typical daily peak", l.typicalPeakOccupancy == null ? "—" : String(l.typicalPeakOccupancy)],
        ["Median lunch visit", formatDuration(l.medianDurationMinutes)],
        [
          "Busiest stretch",
          l.rushWindow ? `${formatClockMinute(l.rushWindow.startMinute)}–${formatClockMinute(l.rushWindow.endMinute)}` : "—",
          l.rushWindow ? `${l.rushWindow.checkInsPerActiveDay} check-ins a day` : undefined,
        ],
      ],
    },
    {
      title: "Patterns",
      facts: [
        ["Busiest day", p.busiestDate ? formatCalendarDate(p.busiestDate.date, false) : "—", p.busiestDate ? plural(p.busiestDate.visits, "visit") : undefined],
        ["Busiest hour", formatHour(p.busiestHour?.hour)],
        ["Quietest active hour", formatHour(p.quietestActiveHour?.hour)],
        ...p.reasonByDaypart
          .filter((part) => part.reason)
          .map((part): [string, string, string] => [`${part.daypart} favorite`, part.reason ?? "—", plural(part.visits, "visit")]),
      ],
    },
  ]

  return (
    <Card>
      <CardHeader>
        <CardTitle>Useful facts</CardTitle>
        <CardDescription>Worth knowing about this period</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6 md:grid-cols-3">
        {groups.map((group) => (
          <section key={group.title} className="flex flex-col gap-2">
            <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{group.title}</h3>
            <dl className="divide-y">
              {group.facts.map(([label, value, note]) => (
                <div key={label} className="flex items-baseline justify-between gap-3 py-2 text-sm">
                  <dt className="text-muted-foreground">
                    {label}
                    {note ? <span className="block text-xs text-muted-foreground/80">{note}</span> : null}
                  </dt>
                  <dd className="text-right font-medium tabular-nums">{value}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </CardContent>
    </Card>
  )
}

function SchoolYearCard({ stats }: { stats: Stats }) {
  const y = stats.schoolYear
  const goals = [
    { label: "Visits", value: y.visits, next: y.nextVisitMilestone },
    { label: "Students served", value: y.uniqueStudents, next: y.nextUniqueMilestone },
  ]
  return (
    <Card>
      <CardHeader>
        <CardTitle>School year</CardTitle>
        <CardDescription>
          {formatCalendarDate(y.start)} through {formatCalendarDate(y.through)}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-5">
          {goals.map((goal) => (
            <div key={goal.label} className="flex flex-col gap-2">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm text-muted-foreground">{goal.label}</span>
                <span className="text-sm">
                  <span className="text-2xl font-semibold tracking-tight">{formatNumber(goal.value)}</span>
                  <span className="text-muted-foreground"> / next {formatNumber(goal.next)}</span>
                </span>
              </div>
              <Progress value={Math.min(100, (goal.value / Math.max(1, goal.next)) * 100)} aria-label={`${goal.label} toward ${goal.next}`} />
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-2">
          <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Milestones reached</h3>
          {y.milestones.length ? (
            <ul className="flex flex-col gap-2">
              {y.milestones.map((milestone) => (
                <li key={`${milestone.type}-${milestone.value}`} className="flex items-center gap-3 text-sm">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <HugeiconsIcon icon={Award01Icon} strokeWidth={2} className="size-4" />
                  </span>
                  <span className="flex-1 font-medium">
                    {formatNumber(milestone.value)} {milestone.type === "visits" ? "visits" : "students served"}
                  </span>
                  <span className="text-xs text-muted-foreground">{formatDay(milestone.reachedAt)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">The first milestones are still ahead.</p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function NoData({ className, message = "No visits in this period." }: { className?: string; message?: string }) {
  return <div className={cn("flex items-center justify-center rounded-2xl bg-muted/40 text-sm text-muted-foreground", className)}>{message}</div>
}

function InsightsSkeleton() {
  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-28 rounded-4xl" />
        ))}
      </div>
      <Skeleton className="h-80 rounded-4xl" />
      <div className="grid gap-4 md:gap-6 lg:grid-cols-2">
        <Skeleton className="h-72 rounded-4xl" />
        <Skeleton className="h-72 rounded-4xl" />
      </div>
    </div>
  )
}
