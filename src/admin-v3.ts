import adminApp from "./admin-v2";

const TIMEZONE = "America/New_York" as const;

export default {
  async fetch(request, env, ctx): Promise<Response> {
    const url = new URL(request.url);
    if (normalizePath(url.pathname) !== "/api/library/admin-stats" || request.method !== "GET") {
      return adminApp.fetch(request, env, ctx);
    }

    const response = await adminApp.fetch(request, env, ctx);
    if (!response.ok) return response;

    const payload = await response.json() as Record<string, any>;
    const from = typeof payload.range?.from === "string" ? payload.range.from : null;
    const to = typeof payload.range?.to === "string" ? payload.range.to : null;
    if (!from || !to) return response;

    const comparison = comparisonRange(from, to);
    const start = localDateStartIso(comparison.from);
    const end = localDateStartIso(addDateOnly(comparison.to, 1));
    const row = await env.SIGNAGE_DB.prepare(
      "SELECT COUNT(*) AS count FROM library_visits WHERE checked_in_at >= ? AND checked_in_at < ? AND archived_at IS NULL"
    ).bind(start, end).first<{ count: number }>();
    const previousVisits = row?.count ?? 0;

    payload.summary = {
      ...(payload.summary ?? {}),
      previousVisits,
      visitChange: Number(payload.summary?.visits ?? 0) - previousVisits,
      comparisonLabel: comparison.label,
    };

    const headers = new Headers(response.headers);
    headers.set("Content-Type", "application/json; charset=utf-8");
    headers.set("Cache-Control", "no-store");
    return new Response(JSON.stringify(payload), { status: response.status, headers });
  },

  async scheduled(controller, env, ctx): Promise<void> {
    return adminApp.scheduled(controller, env, ctx);
  },
} satisfies ExportedHandler<Env>;

function comparisonRange(from: string, to: string): { from: string; to: string; label: string } {
  const days = daysBetween(from, to) + 1;
  const [year, month, day] = from.split("-").map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();

  if (days === 1) {
    const date = addDateOnly(from, -7);
    return { from: date, to: date, label: "same weekday last week" };
  }
  if (weekday === 1 && days <= 7) {
    return { from: addDateOnly(from, -7), to: addDateOnly(to, -7), label: "same days last week" };
  }
  if (from.slice(8, 10) === "01" && days <= 31) {
    const previousMonthStart = shiftMonthStart(from, -1);
    return { from: previousMonthStart, to: addDateOnly(previousMonthStart, days - 1), label: "same period last month" };
  }
  if (from.slice(5) === "08-01" && days <= 366) {
    return { from: shiftYear(from, -1), to: shiftYear(to, -1), label: "same period last school year" };
  }
  const previousTo = addDateOnly(from, -1);
  return { from: addDateOnly(previousTo, -(days - 1)), to: previousTo, label: "previous period" };
}

function shiftMonthStart(value: string, delta: number): string {
  const [year, month] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1 + delta, 1)).toISOString().slice(0, 10);
}

function shiftYear(value: string, delta: number): string {
  const [year, month, day] = value.split("-").map(Number);
  const targetYear = year + delta;
  const lastDay = new Date(Date.UTC(targetYear, month, 0)).getUTCDate();
  return new Date(Date.UTC(targetYear, month - 1, Math.min(day, lastDay))).toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to + "T00:00:00Z") - Date.parse(from + "T00:00:00Z")) / 86400000);
}

function addDateOnly(value: string, days: number): string {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function localDateStartIso(value: string): string {
  const [year, month, day] = value.split("-").map(Number);
  const utcWallClock = Date.UTC(year, month - 1, day);
  const offsetMinutes = timezoneOffsetMinutes(new Date(utcWallClock));
  return new Date(utcWallClock - offsetMinutes * 60000).toISOString();
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

function normalizePath(pathname: string): string {
  return pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
}
