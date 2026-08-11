import adminApp from "./admin";

const TIMEZONE = "America/New_York" as const;
const API_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
};

type StatVisitRow = {
  id: number;
  student_row_id: number;
  student_id: string;
  first_name: string;
  last_name: string;
  grade: string | null;
  reason: string;
  checked_in_at: string;
  checked_out_at: string | null;
};

type FirstVisitRow = { student_row_id: number; first_seen: string };
type CountRow = { count: number };

export default {
  async fetch(request, env, ctx): Promise<Response> {
    const url = new URL(request.url);
    const pathname = normalizePath(url.pathname);

    if (pathname === "/api/library/admin-stats") {
      if (!isStaffAuthorized(request)) return json({ error: "Unauthorized." }, 401);
      if (request.method !== "GET") return json({ error: "Method not allowed." }, 405);
      try {
        return await handleStats(request, env);
      } catch (error) {
        console.error(JSON.stringify({ event: "library_stats_error", error: String(error) }));
        return json({ error: "Could not calculate library statistics." }, 500);
      }
    }

    return adminApp.fetch(request, env, ctx);
  },

  async scheduled(controller, env, ctx): Promise<void> {
    return adminApp.scheduled(controller, env, ctx);
  },
} satisfies ExportedHandler<Env>;

async function handleStats(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const today = dateInTimezone(new Date());
  const defaultFrom = monthStart(today);
  const from = parseDateOnly(url.searchParams.get("from")) ?? defaultFrom;
  const to = parseDateOnly(url.searchParams.get("to")) ?? today;
  if (from > to) return json({ error: "Start date must be before end date." }, 400);
  const days = daysBetween(from, to) + 1;
  if (days > 800) return json({ error: "Date range is too large." }, 400);

  const startIso = localDateStartIso(from);
  const endIso = localDateStartIso(addDateOnly(to, 1));
  const previousTo = days === 1 ? addDateOnly(from, -7) : addDateOnly(from, -1);
  const previousFrom = days === 1 ? previousTo : addDateOnly(previousTo, -(days - 1));
  const previousStartIso = localDateStartIso(previousFrom);
  const previousEndIso = startIso;

  const schoolStart = schoolYearStartFor(to);
  const schoolEndExclusive = localDateStartIso(addDateOnly(to, 1));
  const schoolStartIso = localDateStartIso(schoolStart);

  const [visitsResult, overlapResult, firstResult, previousCount, schoolVisitsResult] = await Promise.all([
    env.SIGNAGE_DB.prepare(
      `SELECT v.id, v.student_row_id, v.student_id, s.first_name, s.last_name, s.grade,
              v.reason, v.checked_in_at, v.checked_out_at
       FROM library_visits v
       JOIN library_students s ON s.id = v.student_row_id
       WHERE v.checked_in_at >= ? AND v.checked_in_at < ? AND v.archived_at IS NULL
       ORDER BY v.checked_in_at ASC`
    ).bind(startIso, endIso).all<StatVisitRow>(),
    env.SIGNAGE_DB.prepare(
      `SELECT v.id, v.student_row_id, v.student_id, s.first_name, s.last_name, s.grade,
              v.reason, v.checked_in_at, v.checked_out_at
       FROM library_visits v
       JOIN library_students s ON s.id = v.student_row_id
       WHERE v.checked_in_at < ? AND (v.checked_out_at IS NULL OR v.checked_out_at >= ?) AND v.archived_at IS NULL
       ORDER BY v.checked_in_at ASC`
    ).bind(endIso, startIso).all<StatVisitRow>(),
    env.SIGNAGE_DB.prepare(
      `SELECT student_row_id, MIN(checked_in_at) AS first_seen
       FROM library_visits
       WHERE archived_at IS NULL
       GROUP BY student_row_id`
    ).all<FirstVisitRow>(),
    env.SIGNAGE_DB.prepare(
      `SELECT COUNT(*) AS count FROM library_visits WHERE checked_in_at >= ? AND checked_in_at < ? AND archived_at IS NULL`
    ).bind(previousStartIso, previousEndIso).first<CountRow>(),
    env.SIGNAGE_DB.prepare(
      `SELECT v.id, v.student_row_id, v.student_id, s.first_name, s.last_name, s.grade,
              v.reason, v.checked_in_at, v.checked_out_at
       FROM library_visits v
       JOIN library_students s ON s.id = v.student_row_id
       WHERE v.checked_in_at >= ? AND v.checked_in_at < ? AND v.archived_at IS NULL
       ORDER BY v.checked_in_at ASC`
    ).bind(schoolStartIso, schoolEndExclusive).all<StatVisitRow>(),
  ]);

  const visits = visitsResult.results;
  const overlaps = overlapResult.results;
  const schoolVisits = schoolVisitsResult.results;
  const firstSeen = new Map(firstResult.results.map((row) => [row.student_row_id, row.first_seen]));

  const visitCount = visits.length;
  const studentVisits = new Map<number, StatVisitRow[]>();
  const dayCounts = new Map<string, number>();
  const weekdayCounts = new Map<string, number>();
  const hourCounts = new Map<number, number>();
  const reasonCounts = new Map<string, number>();
  const gradeCounts = new Map<string, number>();
  const completedDurations: number[] = [];
  const lunchDurations: number[] = [];
  const daypartReasons = new Map<string, Map<string, number>>();
  let lunchVisits = 0;

  for (const visit of visits) {
    const list = studentVisits.get(visit.student_row_id) ?? [];
    list.push(visit);
    studentVisits.set(visit.student_row_id, list);

    const parts = zonedParts(visit.checked_in_at);
    increment(dayCounts, parts.date);
    increment(weekdayCounts, parts.weekday);
    increment(hourCounts, parts.hour);
    const reason = visit.reason || "Other";
    increment(reasonCounts, reason);
    increment(gradeCounts, visit.grade || "Not set");
    const daypart = parts.hour < 11 ? "Morning" : parts.hour < 14 ? "Midday" : "Afternoon";
    const daypartMap = daypartReasons.get(daypart) ?? new Map<string, number>();
    increment(daypartMap, reason);
    daypartReasons.set(daypart, daypartMap);

    if ((visit.reason || "").toLowerCase() === "lunch") lunchVisits += 1;
    if (visit.checked_out_at) {
      const minutes = durationMinutes(visit.checked_in_at, visit.checked_out_at);
      if (minutes !== null) {
        completedDurations.push(minutes);
        if ((visit.reason || "").toLowerCase() === "lunch") lunchDurations.push(minutes);
      }
    }
  }

  const uniqueStudents = studentVisits.size;
  let returningStudents = 0;
  let repeatVisitors = 0;
  let regularCount = 0;
  let fiveDayVisitors = 0;
  const regulars = Array.from(studentVisits.entries()).map(([studentRowId, rows]) => {
    const daysVisited = new Set(rows.map((row) => zonedParts(row.checked_in_at).date)).size;
    const first = firstSeen.get(studentRowId) ?? rows[0]?.checked_in_at;
    if (first && first < startIso) returningStudents += 1;
    if (rows.length >= 2) repeatVisitors += 1;
    if (rows.length >= 5) regularCount += 1;
    if (daysVisited >= 5) fiveDayVisitors += 1;
    const sample = rows[0];
    return {
      studentRowId,
      studentId: sample?.student_id ?? "",
      firstName: sample?.first_name ?? "",
      lastName: sample?.last_name ?? "",
      grade: sample?.grade ?? null,
      visits: rows.length,
      daysVisited,
    };
  }).sort((a, b) => b.visits - a.visits || b.daysVisited - a.daysVisited || a.lastName.localeCompare(b.lastName));

  const firstTimeStudents = Math.max(0, uniqueStudents - returningStudents);
  const averageDailyVisits = dayCounts.size ? visitCount / dayCounts.size : 0;
  const averageDuration = average(completedDurations);
  const medianDuration = median(completedDurations);
  const longestDuration = completedDurations.length ? Math.max(...completedDurations) : null;
  const meaningfulDurations = completedDurations.filter((value) => value >= 2);
  const shortestMeaningfulDuration = meaningfulDurations.length ? Math.min(...meaningfulDurations) : null;
  const lunchMedianDuration = median(lunchDurations);

  const busiestDateEntry = maxEntry(dayCounts);
  const busiestWeekdayEntry = maxEntry(weekdayCounts);
  const favoriteReasonEntry = maxEntry(reasonCounts);
  const topGradeEntry = maxEntry(gradeCounts, (key) => key !== "Not set");
  const busiestHourEntry = maxEntry(hourCounts);
  const quietestHourEntry = minPositiveEntry(hourCounts);

  const rangeStartMs = new Date(startIso).getTime();
  const rangeEndMs = new Date(endIso).getTime();
  const peakOccupancy = peakConcurrent(overlaps, rangeStartMs, rangeEndMs);
  const lunchOverlapVisits = overlaps.filter((v) => (v.reason || "").toLowerCase() === "lunch");
  const peakLunchOccupancy = peakConcurrent(lunchOverlapVisits, rangeStartMs, rangeEndMs);
  const typicalLunchPeak = averageDailyPeak(lunchOverlapVisits, from, to);
  const rush = busiestThirtyMinutes(visits);

  const traffic = buildTrafficSeries(from, to, dayCounts);
  const hourly = buildHourlySeries(hourCounts);
  const weekdays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map((label) => ({ label, visits: weekdayCounts.get(label) ?? 0 }));
  const reasons = sortedBreakdown(reasonCounts);
  const grades = ["9", "10", "11", "12", "Not set"].map((label) => ({ label, visits: gradeCounts.get(label) ?? 0 })).filter((x) => x.visits > 0);
  const reasonByDaypart = ["Morning", "Midday", "Afternoon"].map((daypart) => {
    const top = maxEntry(daypartReasons.get(daypart) ?? new Map<string, number>());
    return top ? { daypart, reason: top[0], visits: top[1] } : { daypart, reason: null, visits: 0 };
  });

  const schoolUnique = new Set(schoolVisits.map((v) => v.student_row_id)).size;
  const milestones = buildMilestones(schoolVisits);
  const currentSchoolVisitCount = schoolVisits.length;
  const currentSchoolUnique = schoolUnique;

  return json({
    range: { from, to, days },
    summary: {
      visits: visitCount,
      uniqueStudents,
      averageDailyVisits: round1(averageDailyVisits),
      peakOccupancy,
      averageDurationMinutes: averageDuration === null ? null : round1(averageDuration),
      medianDurationMinutes: medianDuration,
      previousVisits: previousCount?.count ?? 0,
      visitChange: visitCount - (previousCount?.count ?? 0),
    },
    visitors: {
      returningStudents,
      firstTimeStudents,
      returningRate: percentage(returningStudents, uniqueStudents),
      repeatVisitors,
      repeatRate: percentage(repeatVisitors, uniqueStudents),
      regularCount,
      fiveDayVisitors,
      regulars: regulars.filter((row) => row.visits >= 5).slice(0, 10),
    },
    patterns: {
      busiestDate: busiestDateEntry ? { date: busiestDateEntry[0], visits: busiestDateEntry[1] } : null,
      busiestWeekday: busiestWeekdayEntry ? { weekday: busiestWeekdayEntry[0], visits: busiestWeekdayEntry[1] } : null,
      favoriteReason: favoriteReasonEntry ? { reason: favoriteReasonEntry[0], visits: favoriteReasonEntry[1], share: percentage(favoriteReasonEntry[1], visitCount) } : null,
      topGrade: topGradeEntry ? { grade: topGradeEntry[0], visits: topGradeEntry[1] } : null,
      busiestHour: busiestHourEntry ? { hour: busiestHourEntry[0], visits: busiestHourEntry[1] } : null,
      quietestActiveHour: quietestHourEntry ? { hour: quietestHourEntry[0], visits: quietestHourEntry[1] } : null,
      rushHour: rush,
      longestCompletedVisitMinutes: longestDuration,
      shortestMeaningfulVisitMinutes: shortestMeaningfulDuration,
      reasonByDaypart,
    },
    lunch: {
      visits: lunchVisits,
      peakOccupancy: peakLunchOccupancy,
      typicalPeakOccupancy: typicalLunchPeak,
      medianDurationMinutes: lunchMedianDuration,
    },
    traffic,
    hourly,
    weekdays,
    reasons,
    grades,
    schoolYear: {
      start: schoolStart,
      through: to,
      visits: currentSchoolVisitCount,
      uniqueStudents: currentSchoolUnique,
      milestones: milestones.reached.slice(-6).reverse(),
      nextVisitMilestone: milestones.nextVisit,
      nextUniqueMilestone: milestones.nextUnique,
    },
  });
}

function buildTrafficSeries(from: string, to: string, counts: Map<string, number>) {
  const days = daysBetween(from, to) + 1;
  if (days <= 62) {
    const out: Array<{ date: string; label: string; visits: number }> = [];
    for (let d = from; d <= to; d = addDateOnly(d, 1)) {
      out.push({ date: d, label: shortDate(d), visits: counts.get(d) ?? 0 });
    }
    return { granularity: "day", points: out };
  }

  const buckets = new Map<string, number>();
  for (let d = from; d <= to; d = addDateOnly(d, 1)) {
    const week = mondayOf(d);
    buckets.set(week, (buckets.get(week) ?? 0) + (counts.get(d) ?? 0));
  }
  return {
    granularity: "week",
    points: Array.from(buckets.entries()).map(([date, visits]) => ({ date, label: "Week of " + shortDate(date), visits })),
  };
}

function buildHourlySeries(counts: Map<number, number>) {
  if (!counts.size) return [];
  const observed = Array.from(counts.keys()).filter((h) => h >= 5 && h <= 20);
  const min = observed.length ? Math.max(5, Math.min(...observed)) : 8;
  const max = observed.length ? Math.min(20, Math.max(...observed)) : 15;
  const out = [];
  for (let hour = min; hour <= max; hour += 1) out.push({ hour, label: hourLabel(hour), visits: counts.get(hour) ?? 0 });
  return out;
}

function sortedBreakdown(counts: Map<string, number>) {
  return Array.from(counts.entries()).map(([label, visits]) => ({ label, visits })).sort((a, b) => b.visits - a.visits || a.label.localeCompare(b.label));
}

function peakConcurrent(visits: StatVisitRow[], rangeStart: number, rangeEnd: number): number {
  const events: Array<[number, number]> = [];
  const now = Date.now();
  for (const visit of visits) {
    const rawStart = new Date(visit.checked_in_at).getTime();
    const rawEnd = visit.checked_out_at ? new Date(visit.checked_out_at).getTime() : now;
    if (!Number.isFinite(rawStart) || !Number.isFinite(rawEnd)) continue;
    const start = Math.max(rangeStart, rawStart);
    const end = Math.min(rangeEnd, rawEnd);
    if (end < rangeStart || start >= rangeEnd || end < start) continue;
    events.push([start, 1], [end, -1]);
  }
  events.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let current = 0;
  let peak = 0;
  for (const [, delta] of events) {
    current += delta;
    if (current > peak) peak = current;
  }
  return peak;
}

function averageDailyPeak(visits: StatVisitRow[], from: string, to: string): number | null {
  const byDate = new Map<string, StatVisitRow[]>();
  for (const visit of visits) {
    const date = zonedParts(visit.checked_in_at).date;
    if (date < from || date > to) continue;
    const rows = byDate.get(date) ?? [];
    rows.push(visit);
    byDate.set(date, rows);
  }
  const peaks: number[] = [];
  for (const [date, rows] of byDate) {
    const start = new Date(localDateStartIso(date)).getTime();
    const end = new Date(localDateStartIso(addDateOnly(date, 1))).getTime();
    peaks.push(peakConcurrent(rows, start, end));
  }
  const value = average(peaks);
  return value === null ? null : round1(value);
}

function busiestThirtyMinutes(visits: StatVisitRow[]) {
  const stamps = visits.map((v) => new Date(v.checked_in_at).getTime()).filter(Number.isFinite).sort((a, b) => a - b);
  if (!stamps.length) return null;
  let bestStart = 0;
  let bestCount = 0;
  let left = 0;
  for (let right = 0; right < stamps.length; right += 1) {
    while (stamps[right] - stamps[left] >= 30 * 60 * 1000) left += 1;
    const count = right - left + 1;
    if (count > bestCount) {
      bestCount = count;
      bestStart = stamps[left];
    }
  }
  return {
    startAt: new Date(bestStart).toISOString(),
    endAt: new Date(bestStart + 30 * 60 * 1000).toISOString(),
    checkIns: bestCount,
    perMinute: round1(bestCount / 30),
  };
}

function buildMilestones(visits: StatVisitRow[]) {
  const visitTargets = [100, 250, 500, 1000, 2500, 5000, 10000, 25000];
  const uniqueTargets = [50, 100, 250, 500, 750, 1000, 1500, 2000];
  const reached: Array<{ type: "visits" | "students"; value: number; reachedAt: string }> = [];
  const seen = new Set<number>();
  let visitTargetIndex = 0;
  let uniqueTargetIndex = 0;

  for (let i = 0; i < visits.length; i += 1) {
    const visit = visits[i];
    const count = i + 1;
    seen.add(visit.student_row_id);
    while (visitTargetIndex < visitTargets.length && count >= visitTargets[visitTargetIndex]) {
      reached.push({ type: "visits", value: visitTargets[visitTargetIndex], reachedAt: visit.checked_in_at });
      visitTargetIndex += 1;
    }
    while (uniqueTargetIndex < uniqueTargets.length && seen.size >= uniqueTargets[uniqueTargetIndex]) {
      reached.push({ type: "students", value: uniqueTargets[uniqueTargetIndex], reachedAt: visit.checked_in_at });
      uniqueTargetIndex += 1;
    }
  }

  return {
    reached: reached.sort((a, b) => a.reachedAt.localeCompare(b.reachedAt)),
    nextVisit: visitTargets.find((target) => target > visits.length) ?? nextRoundMilestone(visits.length, 5000),
    nextUnique: uniqueTargets.find((target) => target > seen.size) ?? nextRoundMilestone(seen.size, 500),
  };
}

function nextRoundMilestone(value: number, step: number): number {
  return Math.max(step, Math.ceil((value + 1) / step) * step);
}

function zonedParts(value: string) {
  const date = new Date(value);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "long",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return { date: `${map.year}-${map.month}-${map.day}`, weekday: map.weekday, hour: Number(map.hour) };
}

function durationMinutes(start: string, end: string): number | null {
  const a = new Date(start).getTime();
  const b = new Date(end).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return null;
  return Math.max(0, Math.round((b - a) / 60000));
}

function average(values: number[]): number | null {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

function percentage(part: number, whole: number): number {
  return whole ? round1((part / whole) * 100) : 0;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function increment<K>(map: Map<K, number>, key: K) {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function maxEntry<K>(map: Map<K, number>, include: (key: K) => boolean = () => true): [K, number] | null {
  let best: [K, number] | null = null;
  for (const entry of map.entries()) {
    if (!include(entry[0])) continue;
    if (!best || entry[1] > best[1]) best = entry;
  }
  return best;
}

function minPositiveEntry<K>(map: Map<K, number>): [K, number] | null {
  let best: [K, number] | null = null;
  for (const entry of map.entries()) {
    if (entry[1] <= 0) continue;
    if (!best || entry[1] < best[1]) best = entry;
  }
  return best;
}

function normalizePath(pathname: string): string {
  return pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
}

function isStaffAuthorized(request: Request): boolean {
  if (isLocalRequest(request)) return true;
  return Boolean(request.headers.get("CF-Access-Authenticated-User-Email")?.trim() && request.headers.get("Cf-Access-Jwt-Assertion")?.trim());
}

function isLocalRequest(request: Request): boolean {
  const hostname = new URL(request.url).hostname;
  return !request.headers.get("CF-Ray") || hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: API_HEADERS });
}

function parseDateOnly(value: string | null): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return value;
}

function dateInTimezone(value: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(value);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function monthStart(value: string): string {
  return value.slice(0, 7) + "-01";
}

function schoolYearStartFor(value: string): string {
  const [year, month] = value.split("-").map(Number);
  return `${month >= 8 ? year : year - 1}-08-01`;
}

function addDateOnly(value: string, days: number): string {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string): number {
  const a = Date.parse(from + "T00:00:00Z");
  const b = Date.parse(to + "T00:00:00Z");
  return Math.round((b - a) / 86400000);
}

function mondayOf(value: string): string {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const weekday = date.getUTCDay();
  const shift = weekday === 0 ? -6 : 1 - weekday;
  date.setUTCDate(date.getUTCDate() + shift);
  return date.toISOString().slice(0, 10);
}

function shortDate(value: string): string {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(Date.UTC(year, month - 1, day)));
}

function hourLabel(hour: number): string {
  const suffix = hour >= 12 ? "PM" : "AM";
  const h = hour % 12 || 12;
  return `${h} ${suffix}`;
}

function localDateStartIso(value: string): string {
  const [year, month, day] = value.split("-").map(Number);
  const utcWallClock = Date.UTC(year, month - 1, day);
  const offsetMinutes = timezoneOffsetMinutes(new Date(utcWallClock));
  return new Date(utcWallClock - offsetMinutes * 60000).toISOString();
}

function timezoneOffsetMinutes(value: Date): number {
  const zoneName = new Intl.DateTimeFormat("en-US", { timeZone: TIMEZONE, timeZoneName: "shortOffset" }).formatToParts(value).find((part) => part.type === "timeZoneName")?.value ?? "GMT";
  const match = zoneName.match(/^(?:GMT|UTC)([+-])(\d{1,2})(?::?(\d{2}))?$/);
  if (!match) return 0;
  const sign = match[1] === "+" ? 1 : -1;
  return sign * (Number(match[2]) * 60 + Number(match[3] ?? 0));
}
