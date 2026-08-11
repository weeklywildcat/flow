import adminApp from "./admin-v3";

const TIMEZONE = "America/New_York" as const;
const LUNCH_START_MINUTE = 11 * 60 + 45;
const LUNCH_END_MINUTE = 13 * 60 + 40;

type VisitTimeRow = {
  checked_in_at: string;
  checked_out_at: string | null;
};

type StudentTimeRow = {
  completed_minutes: number | null;
  completed_count: number;
  active_since: string | null;
};

export default {
  async fetch(request, env, ctx): Promise<Response> {
    const url = new URL(request.url);
    const pathname = normalizePath(url.pathname);

    if (pathname === "/api/library/admin-student" && request.method === "GET") {
      const response = await adminApp.fetch(request, env, ctx);
      if (!response.ok) return response;
      return enrichStudentTime(response, request, env);
    }

    if (pathname === "/api/library/admin-stats" && request.method === "GET") {
      const response = await adminApp.fetch(request, env, ctx);
      if (!response.ok) return response;
      return enrichStats(response, env);
    }

    return adminApp.fetch(request, env, ctx);
  },

  async scheduled(controller, env, ctx): Promise<void> {
    return adminApp.scheduled(controller, env, ctx);
  },
} satisfies ExportedHandler<Env>;

async function enrichStudentTime(response: Response, request: Request, env: Env): Promise<Response> {
  const id = Number(new URL(request.url).searchParams.get("id") ?? 0);
  if (!Number.isInteger(id) || id <= 0) return response;

  const payload = await response.json() as Record<string, any>;
  const row = await env.SIGNAGE_DB.prepare(
    `SELECT
       COALESCE(SUM(CASE
         WHEN checked_out_at IS NOT NULL AND checked_out_at >= checked_in_at
         THEN (julianday(checked_out_at) - julianday(checked_in_at)) * 1440
         ELSE 0 END), 0) AS completed_minutes,
       SUM(CASE WHEN checked_out_at IS NOT NULL AND checked_out_at >= checked_in_at THEN 1 ELSE 0 END) AS completed_count,
       MAX(CASE WHEN checked_out_at IS NULL THEN checked_in_at ELSE NULL END) AS active_since
     FROM library_visits
     WHERE student_row_id = ? AND archived_at IS NULL`
  ).bind(id).first<StudentTimeRow>();

  const completedMinutes = Math.max(0, Number(row?.completed_minutes ?? 0));
  const completedCount = Math.max(0, Number(row?.completed_count ?? 0));
  const activeSince = row?.active_since ?? null;
  const activeMinutes = activeSince
    ? Math.max(0, (Date.now() - new Date(activeSince).getTime()) / 60000)
    : 0;

  payload.student = {
    ...(payload.student ?? {}),
    completedTimeMinutes: round1(completedMinutes),
    timeSpentMinutes: round1(completedMinutes + activeMinutes),
    completedVisitCount: completedCount,
    averageCompletedVisitMinutes: completedCount ? round1(completedMinutes / completedCount) : null,
    activeSince,
  };

  return jsonLike(response, payload);
}

async function enrichStats(response: Response, env: Env): Promise<Response> {
  const payload = await response.json() as Record<string, any>;
  const from = typeof payload.range?.from === "string" ? payload.range.from : null;
  const to = typeof payload.range?.to === "string" ? payload.range.to : null;
  if (!from || !to) return jsonLike(response, payload);

  const startIso = localDateStartIso(from);
  const endIso = localDateStartIso(addDateOnly(to, 1));

  const [rangeRows, overlapRows] = await Promise.all([
    env.SIGNAGE_DB.prepare(
      `SELECT checked_in_at, checked_out_at
       FROM library_visits
       WHERE checked_in_at >= ? AND checked_in_at < ? AND archived_at IS NULL
       ORDER BY checked_in_at ASC`
    ).bind(startIso, endIso).all<VisitTimeRow>(),
    env.SIGNAGE_DB.prepare(
      `SELECT checked_in_at, checked_out_at
       FROM library_visits
       WHERE checked_in_at < ? AND (checked_out_at IS NULL OR checked_out_at >= ?) AND archived_at IS NULL
       ORDER BY checked_in_at ASC`
    ).bind(endIso, startIso).all<VisitTimeRow>(),
  ]);

  const rows = rangeRows.results;
  const overlaps = overlapRows.results;
  const completedDurations = rows
    .map((row) => row.checked_out_at ? durationMinutes(row.checked_in_at, row.checked_out_at) : null)
    .filter((value): value is number => value !== null && value >= 0)
    .sort((a, b) => a - b);

  const patterns = { ...(payload.patterns ?? {}) };
  delete patterns.shortestMeaningfulVisitMinutes;
  patterns.durationMiddle50 = completedDurations.length ? {
    lowMinutes: round1(percentile(completedDurations, 0.25)),
    highMinutes: round1(percentile(completedDurations, 0.75)),
  } : null;
  patterns.durationP90Minutes = completedDurations.length
    ? round1(percentile(completedDurations, 0.90))
    : null;

  const lunchCheckIns = rows.filter((row) => {
    const parts = zonedClockParts(row.checked_in_at);
    const minute = parts.hour * 60 + parts.minute;
    return minute >= LUNCH_START_MINUTE && minute < LUNCH_END_MINUTE;
  });
  const lunchDurations = lunchCheckIns
    .map((row) => row.checked_out_at ? durationMinutes(row.checked_in_at, row.checked_out_at) : null)
    .filter((value): value is number => value !== null && value >= 0)
    .sort((a, b) => a - b);

  const dailyLunchPeaks: number[] = [];
  let peakLunchOccupancy = 0;
  for (let date = from; date <= to; date = addDateOnly(date, 1)) {
    const windowStart = localDateTimeMs(date, 11, 45);
    const windowEnd = localDateTimeMs(date, 13, 40);
    const peak = peakConcurrent(overlaps, windowStart, windowEnd);
    peakLunchOccupancy = Math.max(peakLunchOccupancy, peak);
    if (peak > 0) dailyLunchPeaks.push(peak);
  }

  const lunchRush = busiestClockWindow(lunchCheckIns, LUNCH_START_MINUTE, LUNCH_END_MINUTE, 30);
  payload.patterns = patterns;
  payload.lunch = {
    ...(payload.lunch ?? {}),
    windowLabel: "11:45 AM–1:40 PM",
    visits: lunchCheckIns.length,
    peakOccupancy: peakLunchOccupancy,
    typicalPeakOccupancy: dailyLunchPeaks.length ? round1(average(dailyLunchPeaks)) : null,
    medianDurationMinutes: lunchDurations.length ? round1(percentile(lunchDurations, 0.5)) : null,
    rushWindow: lunchRush,
  };

  const weekdayOrder = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  const weekdayTotals = new Map<string, number>();
  const weekdayOccurrences = new Map<string, number>();
  const dayTotals = new Map<string, number>();
  for (const row of rows) {
    const date = zonedClockParts(row.checked_in_at).date;
    dayTotals.set(date, (dayTotals.get(date) ?? 0) + 1);
  }
  for (let date = from; date <= to; date = addDateOnly(date, 1)) {
    const weekday = weekdayLabel(date);
    weekdayOccurrences.set(weekday, (weekdayOccurrences.get(weekday) ?? 0) + 1);
    weekdayTotals.set(weekday, (weekdayTotals.get(weekday) ?? 0) + (dayTotals.get(date) ?? 0));
  }
  const weekdayAverages = weekdayOrder.map((label) => {
    const occurrences = weekdayOccurrences.get(label) ?? 0;
    const total = weekdayTotals.get(label) ?? 0;
    return { label, visits: occurrences ? round1(total / occurrences) : 0, totalVisits: total, occurrences };
  });
  payload.weekdays = weekdayAverages;
  const busiestWeekday = weekdayAverages
    .filter((row) => row.occurrences > 0)
    .sort((a, b) => b.visits - a.visits || b.totalVisits - a.totalVisits)[0];
  if (busiestWeekday) {
    payload.patterns = {
      ...(payload.patterns ?? {}),
      busiestWeekday: {
        weekday: busiestWeekday.label,
        visits: busiestWeekday.totalVisits,
        averageVisits: busiestWeekday.visits,
      },
    };
  }

  return jsonLike(response, payload);
}

function busiestClockWindow(rows: VisitTimeRow[], startMinute: number, endMinute: number, windowMinutes: number) {
  if (!rows.length) return null;
  const activeDays = new Set(rows.map((row) => zonedClockParts(row.checked_in_at).date)).size;
  let bestStart = startMinute;
  let bestCount = -1;
  for (let start = startMinute; start + windowMinutes <= endMinute; start += 5) {
    const end = start + windowMinutes;
    let count = 0;
    for (const row of rows) {
      const parts = zonedClockParts(row.checked_in_at);
      const minute = parts.hour * 60 + parts.minute;
      if (minute >= start && minute < end) count += 1;
    }
    if (count > bestCount) {
      bestCount = count;
      bestStart = start;
    }
  }
  return {
    startMinute: bestStart,
    endMinute: bestStart + windowMinutes,
    checkIns: Math.max(0, bestCount),
    checkInsPerActiveDay: activeDays ? round1(Math.max(0, bestCount) / activeDays) : 0,
  };
}

function peakConcurrent(rows: VisitTimeRow[], start: number, end: number): number {
  const now = Date.now();
  const events: Array<[number, number]> = [];
  for (const row of rows) {
    const rawStart = new Date(row.checked_in_at).getTime();
    const rawEnd = row.checked_out_at ? new Date(row.checked_out_at).getTime() : now;
    if (!Number.isFinite(rawStart) || !Number.isFinite(rawEnd)) continue;
    const a = Math.max(start, rawStart);
    const b = Math.min(end, rawEnd);
    if (b <= a) continue;
    events.push([a, 1], [b, -1]);
  }
  events.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let current = 0;
  let peak = 0;
  for (const [, delta] of events) {
    current += delta;
    peak = Math.max(peak, current);
  }
  return peak;
}

function durationMinutes(start: string, end: string): number | null {
  const a = new Date(start).getTime();
  const b = new Date(end).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return null;
  return (b - a) / 60000;
}

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  if (sorted.length === 1) return sorted[0];
  const position = (sorted.length - 1) * p;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  const weight = position - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

function average(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function zonedClockParts(value: string): { date: string; hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(value));
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    date: `${map.year}-${map.month}-${map.day}`,
    hour: Number(map.hour),
    minute: Number(map.minute),
  };
}

function weekdayLabel(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: "UTC" })
    .format(new Date(Date.UTC(year, month - 1, day)));
}

function localDateStartIso(value: string): string {
  return new Date(localDateTimeMs(value, 0, 0)).toISOString();
}

function localDateTimeMs(value: string, hour: number, minute: number): number {
  const [year, month, day] = value.split("-").map(Number);
  const utcWallClock = Date.UTC(year, month - 1, day, hour, minute);
  const offsetMinutes = timezoneOffsetMinutes(new Date(utcWallClock));
  return utcWallClock - offsetMinutes * 60000;
}

function timezoneOffsetMinutes(value: Date): number {
  const zoneName = new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE,
    timeZoneName: "shortOffset",
  }).formatToParts(value).find((part) => part.type === "timeZoneName")?.value ?? "GMT";
  const match = zoneName.match(/^(?:GMT|UTC)([+-])(\d{1,2})(?::?(\d{2}))?$/);
  if (!match) return 0;
  const sign = match[1] === "+" ? 1 : -1;
  return sign * (Number(match[2]) * 60 + Number(match[3] ?? 0));
}

function addDateOnly(value: string, days: number): string {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function normalizePath(pathname: string): string {
  return pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
}

function jsonLike(response: Response, payload: unknown): Response {
  const headers = new Headers(response.headers);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  return new Response(JSON.stringify(payload), { status: response.status, statusText: response.statusText, headers });
}
