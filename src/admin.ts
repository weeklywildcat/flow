import libraryApp, { closeVisitAt, ensureVisitArchiveColumns } from "./library";

const TIMEZONE = "America/New_York" as const;

const API_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  ...securityHeaders(),
};

type AdminStudentRow = {
  id: number;
  student_id: string;
  barcode: string;
  first_name: string;
  last_name: string;
  grade: string | null;
  active: number;
  updated_at: string;
  name_check_requested_at: string | null;
  visit_count: number;
  last_visit_at: string | null;
};

type HistoryRow = {
  id: number;
  student_id: string;
  first_name: string;
  last_name: string;
  grade: string | null;
  reason: string;
  checked_in_at: string;
  checked_out_at: string | null;
  checkout_method: string | null;
  checked_out_by: string | null;
  archived_at: string | null;
  archived_by: string | null;
  duration_minutes: number | null;
};

type KioskAttentionRow = {
  id: number;
  name: string;
  last_seen_at: string | null;
};

type StudentTimeRow = {
  completed_minutes: number | null;
  completed_count: number;
  active_since: string | null;
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

type EditableVisitRow = {
  id: number;
  checked_in_at: string;
  checked_out_at: string | null;
  archived_at: string | null;
};

type DurationUpdate = { visitId: number; durationMinutes: number };

const LUNCH_START_MINUTE = 11 * 60 + 45;
const LUNCH_END_MINUTE = 13 * 60 + 40;
const MAX_DURATION_MINUTES = 1440;
const MAX_BATCH_VISITS = 200;
/** A school directory is a few thousand rows at most; beyond this the dashboard searches on the server. */
const MAX_DIRECTORY_STUDENTS = 5000;
/** Longer than this, a visit is probably a missed checkout. Matches the overview's "needs attention" cutoff. */
const LONG_VISIT_MINUTES = 60;
/** How far back "typical" visit lengths are measured, and the fallback when there is no history. */
const TYPICAL_LOOKBACK_DAYS = 90;
const DEFAULT_TYPICAL_MINUTES = 30;

type Handler = (request: Request, env: Env, ctx: ExecutionContext) => Promise<Response>;
type Route = { GET?: Handler; POST?: Handler; error: string };

// Every staff route lives here. Anything else falls through to the kiosk and library app.
const ROUTES: Record<string, Route> = {
  "/api/library/admin-overview": { GET: (_request, env) => handleOverview(env), error: "Something went wrong." },
  "/api/library/admin-students": { GET: handleStudents, POST: handleSaveStudent, error: "Something went wrong." },
  "/api/library/admin-student": { GET: handleStudentDetail, error: "Something went wrong." },
  "/api/library/admin-directory": { GET: (_request, env) => handleDirectory(env), error: "Could not load the student directory." },
  "/api/library/admin-history": { GET: handleHistory, error: "Something went wrong." },
  "/api/library/admin-archive-visit": { POST: handleArchiveVisit, error: "Something went wrong." },
  "/api/library/admin-stats": { GET: handleStats, error: "Could not calculate library statistics." },
  "/api/library/admin-update-visit-duration": { POST: handleUpdateVisitDuration, error: "Could not update that visit duration." },
  "/api/library/admin-update-visit-durations": { POST: handleUpdateVisitDurations, error: "Could not update those visit durations." },
  "/api/library/admin-clear-with-durations": { POST: handleClearWithDurations, error: "Could not check everyone out." },
  "/api/library/admin-flagged-visits": { GET: handleFlaggedVisits, error: "Could not load flagged visits." },
  "/api/library/admin-fix-visits": { POST: handleFixVisits, error: "Could not fix those visits." },
  "/api/library/admin-review-flag": { POST: handleReviewFlag, error: "Could not update that visit." },
  "/api/library/admin-name-check": { POST: handleNameCheck, error: "Could not update that student." },
};

export default {
  async fetch(request, env, ctx): Promise<Response> {
    const pathname = normalizePath(new URL(request.url).pathname);
    if (!pathname.startsWith("/api/library/admin-")) return libraryApp.fetch(request, env, ctx);
    if (!isStaffAuthorized(request)) return json({ error: "Unauthorized." }, 401);

    const route = ROUTES[pathname];
    if (!route) return libraryApp.fetch(request, env, ctx);
    const handler = request.method === "GET" ? route.GET : request.method === "POST" ? route.POST : undefined;
    if (!handler) return methodNotAllowed((["GET", "POST"] as const).filter((method) => route[method]));

    try {
      await ensureVisitArchiveColumns(env);
      return await handler(request, env, ctx);
    } catch (error) {
      console.error(JSON.stringify({ event: "library_admin_error", pathname, error: String(error) }));
      return json({ error: route.error }, 500);
    }
  },

  async scheduled(controller, env, ctx): Promise<void> {
    return libraryApp.scheduled(controller, env, ctx);
  },
} satisfies ExportedHandler<Env>;

async function handleOverview(env: Env): Promise<Response> {
  const now = new Date();
  const today = dateInTimezone(now);
  const start = localDateStartIso(today);
  const end = localDateStartIso(addDateOnly(today, 1));
  const onlineCutoff = new Date(now.getTime() - 10 * 60 * 1000).toISOString();

  const [current, todayVisits, uniqueToday, students, kiosks, onlineKiosks, recent, longVisits, staleKiosks, flaggedVisits] = await Promise.all([
    env.SIGNAGE_DB.prepare("SELECT COUNT(*) AS count FROM library_visits WHERE checked_out_at IS NULL AND archived_at IS NULL").first<{ count: number }>(),
    env.SIGNAGE_DB.prepare("SELECT COUNT(*) AS count FROM library_visits WHERE checked_in_at >= ? AND checked_in_at < ? AND archived_at IS NULL").bind(start, end).first<{ count: number }>(),
    env.SIGNAGE_DB.prepare("SELECT COUNT(DISTINCT student_row_id) AS count FROM library_visits WHERE checked_in_at >= ? AND checked_in_at < ? AND archived_at IS NULL").bind(start, end).first<{ count: number }>(),
    env.SIGNAGE_DB.prepare("SELECT COUNT(*) AS count FROM library_students WHERE active = 1").first<{ count: number }>(),
    env.SIGNAGE_DB.prepare("SELECT COUNT(*) AS count FROM library_kiosk_devices WHERE revoked_at IS NULL").first<{ count: number }>(),
    env.SIGNAGE_DB.prepare("SELECT COUNT(*) AS count FROM library_kiosk_devices WHERE revoked_at IS NULL AND last_seen_at >= ?").bind(onlineCutoff).first<{ count: number }>(),
    env.SIGNAGE_DB.prepare(`${historySelectSql()} WHERE v.archived_at IS NULL ORDER BY v.checked_in_at DESC LIMIT 10`).all<HistoryRow>(),
    env.SIGNAGE_DB.prepare(
      `${historySelectSql()} WHERE v.checked_out_at IS NULL AND v.archived_at IS NULL AND v.checked_in_at < ? ORDER BY v.checked_in_at ASC LIMIT 5`
    ).bind(longVisitCutoff(now.getTime())).all<HistoryRow>(),
    env.SIGNAGE_DB.prepare(
      `SELECT id, name, last_seen_at
       FROM library_kiosk_devices
       WHERE revoked_at IS NULL AND (last_seen_at IS NULL OR last_seen_at < ?)
       ORDER BY CASE WHEN last_seen_at IS NULL THEN 0 ELSE 1 END, last_seen_at ASC
       LIMIT 5`
    ).bind(onlineCutoff).all<KioskAttentionRow>(),
    countFlaggedVisits(env),
  ]);

  return json({
    generatedAt: now.toISOString(),
    currentCount: current?.count ?? 0,
    visitsToday: todayVisits?.count ?? 0,
    uniqueVisitorsToday: uniqueToday?.count ?? 0,
    activeStudents: students?.count ?? 0,
    pairedKiosks: kiosks?.count ?? 0,
    onlineKiosks: onlineKiosks?.count ?? 0,
    flaggedVisits,
    recent: recent.results.map(publicHistoryRow),
    attention: {
      longVisits: longVisits.results.map(publicHistoryRow),
      staleKiosks: staleKiosks.results.map((row) => ({
        id: row.id,
        name: row.name,
        lastSeenAt: row.last_seen_at,
      })),
    },
  });
}

async function handleStudents(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const q = normalizeString(url.searchParams.get("q"), 100);
  const grade = normalizeString(url.searchParams.get("grade"), 16);
  const status = normalizeString(url.searchParams.get("status"), 16);
  const limit = clampInt(url.searchParams.get("limit"), 1, 200, 100);
  const offset = clampInt(url.searchParams.get("offset"), 0, 100000, 0);

  const where: string[] = [];
  const binds: unknown[] = [];

  if (q) {
    const like = `%${q}%`;
    where.push("(s.first_name LIKE ? OR s.last_name LIKE ? OR s.student_id LIKE ? OR s.barcode LIKE ?)");
    binds.push(like, like, like, like);
  }
  if (grade && ["9", "10", "11", "12"].includes(grade)) {
    where.push("s.grade = ?");
    binds.push(grade);
  }
  if (status === "active") where.push("s.active = 1");
  if (status === "inactive") where.push("s.active = 0");
  if (status === "name-check") where.push("s.name_check_requested_at IS NOT NULL");

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const countRow = await env.SIGNAGE_DB.prepare(
    `SELECT COUNT(*) AS count FROM library_students s ${whereSql}`
  ).bind(...binds).first<{ count: number }>();

  const rows = await env.SIGNAGE_DB.prepare(
    `SELECT
       s.id, s.student_id, s.barcode, s.first_name, s.last_name, s.grade, s.active, s.updated_at, s.name_check_requested_at,
       COUNT(v.id) AS visit_count,
       MAX(v.checked_in_at) AS last_visit_at
     FROM library_students s
     LEFT JOIN library_visits v ON v.student_row_id = s.id AND v.archived_at IS NULL
     ${whereSql}
     GROUP BY s.id
     ORDER BY s.last_name COLLATE NOCASE, s.first_name COLLATE NOCASE, s.student_id
     LIMIT ? OFFSET ?`
  ).bind(...binds, limit, offset).all<AdminStudentRow>();

  return json({
    total: countRow?.count ?? 0,
    limit,
    offset,
    students: rows.results.map(publicAdminStudent),
  });
}

/**
 * The whole directory in one response, so the dashboard can search and filter it in memory.
 * Same rows and order as admin-students, without paging.
 */
async function handleDirectory(env: Env): Promise<Response> {
  const rows = await env.SIGNAGE_DB.prepare(
    `SELECT
       s.id, s.student_id, s.barcode, s.first_name, s.last_name, s.grade, s.active, s.updated_at, s.name_check_requested_at,
       COUNT(v.id) AS visit_count,
       MAX(v.checked_in_at) AS last_visit_at
     FROM library_students s
     LEFT JOIN library_visits v ON v.student_row_id = s.id AND v.archived_at IS NULL
     GROUP BY s.id
     ORDER BY s.last_name COLLATE NOCASE, s.first_name COLLATE NOCASE, s.student_id
     LIMIT ?`
  ).bind(MAX_DIRECTORY_STUDENTS + 1).all<AdminStudentRow>();

  const truncated = rows.results.length > MAX_DIRECTORY_STUDENTS;
  return json({
    generatedAt: new Date().toISOString(),
    // Past the cap the dashboard falls back to searching on the server.
    truncated,
    students: rows.results.slice(0, MAX_DIRECTORY_STUDENTS).map(publicAdminStudent),
  });
}

async function handleStudentDetail(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const id = clampInt(url.searchParams.get("id"), 1, 1000000000, 0);
  if (!id) return json({ error: "Student ID is required." }, 400);

  const student = await env.SIGNAGE_DB.prepare(
    `SELECT
       s.id, s.student_id, s.barcode, s.first_name, s.last_name, s.grade, s.active, s.updated_at, s.name_check_requested_at,
       COUNT(v.id) AS visit_count,
       MAX(v.checked_in_at) AS last_visit_at
     FROM library_students s
     LEFT JOIN library_visits v ON v.student_row_id = s.id AND v.archived_at IS NULL
     WHERE s.id = ?
     GROUP BY s.id`
  ).bind(id).first<AdminStudentRow>();

  if (!student) return json({ error: "Student was not found." }, 404);

  const [recent, time] = await Promise.all([
    env.SIGNAGE_DB.prepare(
      `${historySelectSql()} WHERE v.student_row_id = ? AND v.archived_at IS NULL ORDER BY v.checked_in_at DESC LIMIT 8`
    ).bind(id).all<HistoryRow>(),
    env.SIGNAGE_DB.prepare(
      `SELECT
         COALESCE(SUM(CASE
           WHEN checked_out_at IS NOT NULL AND checked_out_at >= checked_in_at
           THEN (julianday(checked_out_at) - julianday(checked_in_at)) * 1440
           ELSE 0 END), 0) AS completed_minutes,
         SUM(CASE WHEN checked_out_at IS NOT NULL AND checked_out_at >= checked_in_at THEN 1 ELSE 0 END) AS completed_count,
         MAX(CASE WHEN checked_out_at IS NULL THEN checked_in_at ELSE NULL END) AS active_since
       FROM library_visits
       WHERE student_row_id = ? AND archived_at IS NULL`
    ).bind(id).first<StudentTimeRow>(),
  ]);

  const completedMinutes = Math.max(0, Number(time?.completed_minutes ?? 0));
  const completedCount = Math.max(0, Number(time?.completed_count ?? 0));
  const activeSince = time?.active_since ?? null;
  const activeMinutes = activeSince ? Math.max(0, (Date.now() - new Date(activeSince).getTime()) / 60000) : 0;

  return json({
    student: {
      ...publicAdminStudent(student),
      completedTimeMinutes: round1(completedMinutes),
      timeSpentMinutes: round1(completedMinutes + activeMinutes),
      completedVisitCount: completedCount,
      averageCompletedVisitMinutes: completedCount ? round1(completedMinutes / completedCount) : null,
      activeSince,
    },
    recentVisits: recent.results.map(publicHistoryRow),
  });
}

function publicAdminStudent(row: AdminStudentRow) {
  return {
    id: row.id,
    studentId: row.student_id,
    barcode: row.barcode,
    firstName: row.first_name,
    lastName: row.last_name,
    grade: row.grade,
    active: row.active === 1,
    updatedAt: row.updated_at,
    visitCount: row.visit_count ?? 0,
    lastVisitAt: row.last_visit_at,
    nameCheckRequestedAt: row.name_check_requested_at,
  };
}

/** Asks the kiosk to have this student re-enter their name the next time they scan, or cancels that. */
async function handleNameCheck(request: Request, env: Env): Promise<Response> {
  const body = await readJsonBody(request);
  if (!isRecord(body)) return json({ error: "Invalid request body." }, 400);
  const id = Number(body.id);
  if (!Number.isInteger(id) || id < 1) return json({ error: "Invalid student." }, 400);
  const requested = body.requested !== false;

  const result = await env.SIGNAGE_DB.prepare("UPDATE library_students SET name_check_requested_at = ? WHERE id = ?")
    .bind(requested ? new Date().toISOString() : null, id)
    .run();
  if ((result.meta.changes ?? 0) !== 1) return json({ error: "Student was not found." }, 404);
  return json({ ok: true, id, requested });
}

async function handleSaveStudent(request: Request, env: Env): Promise<Response> {
  const body = await readJsonBody(request);
  if (!isRecord(body)) return json({ error: "Invalid request body." }, 400);

  const id = Number(body.id ?? 0);
  const firstName = normalizeString(body.firstName, 80);
  const lastName = normalizeString(body.lastName, 80);
  const barcode = normalizeBarcode(body.barcode);
  const grade = normalizeString(body.grade, 16);
  const active = body.active === false ? 0 : 1;

  if (!firstName || !lastName) return json({ error: "First and last name are required." }, 400);
  if (!barcode) return json({ error: "Barcode is required." }, 400);
  if (grade && !["9", "10", "11", "12"].includes(grade)) return json({ error: "Grade must be 9, 10, 11, or 12." }, 400);

  const now = new Date().toISOString();

  try {
    if (Number.isInteger(id) && id > 0) {
      const existing = await env.SIGNAGE_DB.prepare(
        "SELECT id, student_id FROM library_students WHERE id = ?"
      ).bind(id).first<{ id: number; student_id: string }>();
      if (!existing) return json({ error: "Student was not found." }, 404);

      await env.SIGNAGE_DB.prepare(
        `UPDATE library_students
         SET barcode = ?, first_name = ?, last_name = ?, grade = ?, active = ?, updated_at = ?
         WHERE id = ?`
      ).bind(barcode, firstName, lastName, grade || null, active, now, id).run();

      return json({ ok: true, id, studentId: existing.student_id });
    }

    const studentId = normalizeString(body.studentId, 64);
    if (!studentId) return json({ error: "Student ID is required." }, 400);

    const result = await env.SIGNAGE_DB.prepare(
      `INSERT INTO library_students (student_id, barcode, first_name, last_name, grade, active, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(studentId, barcode, firstName, lastName, grade || null, active, now).run();

    return json({ ok: true, id: Number(result.meta.last_row_id), studentId });
  } catch (error) {
    const message = String(error).toLowerCase();
    if (message.includes("unique") || message.includes("constraint")) {
      return json({ error: "That student ID or barcode is already in the database." }, 409);
    }
    throw error;
  }
}

async function handleHistory(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const q = normalizeString(url.searchParams.get("q"), 100);
  const reason = normalizeString(url.searchParams.get("reason"), 80);
  const from = parseDateOnly(url.searchParams.get("from"));
  const to = parseDateOnly(url.searchParams.get("to"));
  const limit = clampInt(url.searchParams.get("limit"), 1, 200, 100);
  const offset = clampInt(url.searchParams.get("offset"), 0, 100000, 0);
  const archived = url.searchParams.get("archived") === "1";

  // Archived visits are only ever reachable through this explicit view.
  const where: string[] = [archived ? "v.archived_at IS NOT NULL" : "v.archived_at IS NULL"];
  const binds: unknown[] = [];

  if (q) {
    const like = `%${q}%`;
    where.push("(s.first_name LIKE ? OR s.last_name LIKE ? OR v.student_id LIKE ?)");
    binds.push(like, like, like);
  }
  if (reason) {
    where.push("v.reason = ?");
    binds.push(reason);
  }
  if (from) {
    where.push("v.checked_in_at >= ?");
    binds.push(localDateStartIso(from));
  }
  if (to) {
    where.push("v.checked_in_at < ?");
    binds.push(localDateStartIso(addDateOnly(to, 1)));
  }

  const whereSql = `WHERE ${where.join(" AND ")}`;
  const countRow = await env.SIGNAGE_DB.prepare(
    `SELECT COUNT(*) AS count FROM library_visits v JOIN library_students s ON s.id = v.student_row_id ${whereSql}`
  ).bind(...binds).first<{ count: number }>();

  const rows = await env.SIGNAGE_DB.prepare(
    `${historySelectSql()} ${whereSql} ORDER BY v.checked_in_at DESC LIMIT ? OFFSET ?`
  ).bind(...binds, limit, offset).all<HistoryRow>();

  return json({
    total: countRow?.count ?? 0,
    limit,
    offset,
    visits: rows.results.map(publicHistoryRow),
  });
}

async function handleArchiveVisit(request: Request, env: Env): Promise<Response> {
  const body = await readJsonBody(request);
  if (!isRecord(body)) return json({ error: "Invalid request body." }, 400);

  const visitId = Number(body.visitId);
  if (!Number.isInteger(visitId) || visitId < 1) return json({ error: "Invalid visit." }, 400);
  const archived = body.archived !== false;

  const existing = await env.SIGNAGE_DB.prepare(
    "SELECT id, checked_out_at FROM library_visits WHERE id = ?"
  ).bind(visitId).first<{ id: number; checked_out_at: string | null }>();
  if (!existing) return json({ error: "That visit was not found." }, 404);

  if (!archived) {
    await env.SIGNAGE_DB.prepare(
      "UPDATE library_visits SET archived_at = NULL, archived_by = NULL WHERE id = ?"
    ).bind(visitId).run();
    return json({ ok: true, visitId, archived: false });
  }

  const now = new Date().toISOString();
  const actor = getActor(request);

  // Close the visit on the way out if it never got a checkout. Otherwise it would sit archived
  // and open forever, and restoring it later would silently drop the student back into the
  // live occupancy count without anyone scanning them in.
  if (existing.checked_out_at === null) {
    await env.SIGNAGE_DB.prepare(
      `UPDATE library_visits
       SET checked_out_at = ?, checkout_method = 'librarian', checked_out_by = ?, archived_at = ?, archived_by = ?
       WHERE id = ? AND archived_at IS NULL`
    ).bind(now, actor, now, actor, visitId).run();
  } else {
    await env.SIGNAGE_DB.prepare(
      "UPDATE library_visits SET archived_at = ?, archived_by = ? WHERE id = ? AND archived_at IS NULL"
    ).bind(now, actor, visitId).run();
  }

  return json({ ok: true, visitId, archived: true, closed: existing.checked_out_at === null });
}

async function handleStats(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const today = dateInTimezone(new Date());
  const from = parseDateOnly(url.searchParams.get("from")) ?? today.slice(0, 7) + "-01";
  const to = parseDateOnly(url.searchParams.get("to")) ?? today;
  if (from > to) return json({ error: "Start date must be before end date." }, 400);
  const days = daysBetween(from, to) + 1;
  if (days > 800) return json({ error: "Date range is too large." }, 400);

  const startIso = localDateStartIso(from);
  const endIso = localDateStartIso(addDateOnly(to, 1));
  const comparison = comparisonRange(from, to);
  const schoolStart = schoolYearStartFor(to);
  const statVisitSql = `SELECT v.id, v.student_row_id, v.student_id, s.first_name, s.last_name, s.grade,
         v.reason, v.checked_in_at, v.checked_out_at
       FROM library_visits v
       JOIN library_students s ON s.id = v.student_row_id`;

  const [visitsResult, overlapResult, firstResult, previousCount, schoolVisitsResult] = await Promise.all([
    env.SIGNAGE_DB.prepare(
      `${statVisitSql} WHERE v.checked_in_at >= ? AND v.checked_in_at < ? AND v.archived_at IS NULL ORDER BY v.checked_in_at ASC`
    ).bind(startIso, endIso).all<StatVisitRow>(),
    env.SIGNAGE_DB.prepare(
      `${statVisitSql} WHERE v.checked_in_at < ? AND (v.checked_out_at IS NULL OR v.checked_out_at >= ?) AND v.archived_at IS NULL ORDER BY v.checked_in_at ASC`
    ).bind(endIso, startIso).all<StatVisitRow>(),
    env.SIGNAGE_DB.prepare(
      `SELECT student_row_id, MIN(checked_in_at) AS first_seen FROM library_visits WHERE archived_at IS NULL GROUP BY student_row_id`
    ).all<{ student_row_id: number; first_seen: string }>(),
    env.SIGNAGE_DB.prepare(
      "SELECT COUNT(*) AS count FROM library_visits WHERE checked_in_at >= ? AND checked_in_at < ? AND archived_at IS NULL"
    ).bind(localDateStartIso(comparison.from), localDateStartIso(addDateOnly(comparison.to, 1))).first<{ count: number }>(),
    env.SIGNAGE_DB.prepare(
      `${statVisitSql} WHERE v.checked_in_at >= ? AND v.checked_in_at < ? AND v.archived_at IS NULL ORDER BY v.checked_in_at ASC`
    ).bind(localDateStartIso(schoolStart), endIso).all<StatVisitRow>(),
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
  const daypartReasons = new Map<string, Map<string, number>>();
  const exactDurations: number[] = [];
  const lunchCheckIns: StatVisitRow[] = [];
  const lunchDurations: number[] = [];

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

    const minutes = visit.checked_out_at ? durationMinutes(visit.checked_in_at, visit.checked_out_at) : null;
    if (minutes !== null) exactDurations.push(minutes);

    // Lunch is defined by the clock, not the reason students pick at the kiosk.
    const minuteOfDay = parts.hour * 60 + parts.minute;
    if (minuteOfDay >= LUNCH_START_MINUTE && minuteOfDay < LUNCH_END_MINUTE) {
      lunchCheckIns.push(visit);
      if (minutes !== null) lunchDurations.push(minutes);
    }
  }

  exactDurations.sort((a, b) => a - b);
  lunchDurations.sort((a, b) => a - b);
  const completedDurations = exactDurations.map((minutes) => Math.round(minutes));

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

  // Weekdays are averaged per occurrence so a range with three Mondays and two Fridays compares fairly.
  const weekdayTotals = new Map<string, number>();
  const weekdayOccurrences = new Map<string, number>();
  for (let date = from; date <= to; date = addDateOnly(date, 1)) {
    const weekday = weekdayLabel(date);
    increment(weekdayOccurrences, weekday);
    weekdayTotals.set(weekday, (weekdayTotals.get(weekday) ?? 0) + (dayCounts.get(date) ?? 0));
  }
  const weekdays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map((label) => {
    const occurrences = weekdayOccurrences.get(label) ?? 0;
    const total = weekdayTotals.get(label) ?? 0;
    return { label, visits: occurrences ? round1(total / occurrences) : 0, totalVisits: total, occurrences };
  });
  const busiestWeekday = weekdays
    .filter((row) => row.occurrences > 0)
    .sort((a, b) => b.visits - a.visits || b.totalVisits - a.totalVisits)[0];

  const dailyLunchPeaks: number[] = [];
  let peakLunchOccupancy = 0;
  for (let date = from; date <= to; date = addDateOnly(date, 1)) {
    const peak = peakConcurrent(overlaps, localDateTimeMs(date, 11, 45), localDateTimeMs(date, 13, 40));
    peakLunchOccupancy = Math.max(peakLunchOccupancy, peak);
    if (peak > 0) dailyLunchPeaks.push(peak);
  }

  const busiestDateEntry = maxEntry(dayCounts);
  const favoriteReasonEntry = maxEntry(reasonCounts);
  const topGradeEntry = maxEntry(gradeCounts, (key) => key !== "Not set");
  const busiestHourEntry = maxEntry(hourCounts);
  const quietestHourEntry = minPositiveEntry(hourCounts);
  const previousVisits = previousCount?.count ?? 0;
  const averageDuration = average(completedDurations);
  const milestones = buildMilestones(schoolVisits);

  return json({
    range: { from, to, days },
    summary: {
      visits: visitCount,
      uniqueStudents,
      averageDailyVisits: round1(dayCounts.size ? visitCount / dayCounts.size : 0),
      peakOccupancy: peakConcurrent(overlaps, new Date(startIso).getTime(), new Date(endIso).getTime()),
      averageDurationMinutes: averageDuration === null ? null : round1(averageDuration),
      medianDurationMinutes: median(completedDurations),
      previousVisits,
      visitChange: visitCount - previousVisits,
      comparisonLabel: comparison.label,
    },
    visitors: {
      returningStudents,
      firstTimeStudents: Math.max(0, uniqueStudents - returningStudents),
      returningRate: percentage(returningStudents, uniqueStudents),
      repeatVisitors,
      repeatRate: percentage(repeatVisitors, uniqueStudents),
      regularCount,
      fiveDayVisitors,
      regulars: regulars.filter((row) => row.visits >= 5).slice(0, 10),
    },
    patterns: {
      busiestDate: busiestDateEntry ? { date: busiestDateEntry[0], visits: busiestDateEntry[1] } : null,
      busiestWeekday: busiestWeekday
        ? { weekday: busiestWeekday.label, visits: busiestWeekday.totalVisits, averageVisits: busiestWeekday.visits }
        : null,
      favoriteReason: favoriteReasonEntry
        ? { reason: favoriteReasonEntry[0], visits: favoriteReasonEntry[1], share: percentage(favoriteReasonEntry[1], visitCount) }
        : null,
      topGrade: topGradeEntry ? { grade: topGradeEntry[0], visits: topGradeEntry[1] } : null,
      busiestHour: busiestHourEntry ? { hour: busiestHourEntry[0], visits: busiestHourEntry[1] } : null,
      quietestActiveHour: quietestHourEntry ? { hour: quietestHourEntry[0], visits: quietestHourEntry[1] } : null,
      rushHour: busiestThirtyMinutes(visits),
      longestCompletedVisitMinutes: completedDurations.length ? Math.max(...completedDurations) : null,
      reasonByDaypart: ["Morning", "Midday", "Afternoon"].map((daypart) => {
        const top = maxEntry(daypartReasons.get(daypart) ?? new Map<string, number>());
        return top ? { daypart, reason: top[0], visits: top[1] } : { daypart, reason: null, visits: 0 };
      }),
      durationMiddle50: exactDurations.length
        ? { lowMinutes: round1(percentile(exactDurations, 0.25)), highMinutes: round1(percentile(exactDurations, 0.75)) }
        : null,
      durationP90Minutes: exactDurations.length ? round1(percentile(exactDurations, 0.9)) : null,
    },
    lunch: {
      windowLabel: "11:45 AM–1:40 PM",
      visits: lunchCheckIns.length,
      peakOccupancy: peakLunchOccupancy,
      typicalPeakOccupancy: dailyLunchPeaks.length ? round1(average(dailyLunchPeaks) ?? 0) : null,
      medianDurationMinutes: lunchDurations.length ? round1(percentile(lunchDurations, 0.5)) : null,
      rushWindow: busiestClockWindow(lunchCheckIns, LUNCH_START_MINUTE, LUNCH_END_MINUTE, 30),
    },
    traffic: buildTrafficSeries(from, to, dayCounts),
    hourly: buildHourlySeries(hourCounts),
    weekdays,
    reasons: Array.from(reasonCounts.entries())
      .map(([label, count]) => ({ label, visits: count }))
      .sort((a, b) => b.visits - a.visits || a.label.localeCompare(b.label)),
    grades: ["9", "10", "11", "12", "Not set"]
      .map((label) => ({ label, visits: gradeCounts.get(label) ?? 0 }))
      .filter((row) => row.visits > 0),
    schoolYear: {
      start: schoolStart,
      through: to,
      visits: schoolVisits.length,
      uniqueStudents: new Set(schoolVisits.map((visit) => visit.student_row_id)).size,
      milestones: milestones.reached.slice(-6).reverse(),
      nextVisitMilestone: milestones.nextVisit,
      nextUniqueMilestone: milestones.nextUnique,
    },
  });
}

/** Picks the most meaningful earlier period to compare a range against. */
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

function buildTrafficSeries(from: string, to: string, counts: Map<string, number>) {
  if (daysBetween(from, to) + 1 <= 62) {
    const points: Array<{ date: string; label: string; visits: number }> = [];
    for (let date = from; date <= to; date = addDateOnly(date, 1)) {
      points.push({ date, label: shortDate(date), visits: counts.get(date) ?? 0 });
    }
    return { granularity: "day", points };
  }

  const buckets = new Map<string, number>();
  for (let date = from; date <= to; date = addDateOnly(date, 1)) {
    const week = mondayOf(date);
    buckets.set(week, (buckets.get(week) ?? 0) + (counts.get(date) ?? 0));
  }
  return {
    granularity: "week",
    points: Array.from(buckets.entries()).map(([date, visits]) => ({ date, label: "Week of " + shortDate(date), visits })),
  };
}

function buildHourlySeries(counts: Map<number, number>) {
  if (!counts.size) return [];
  const observed = Array.from(counts.keys()).filter((hour) => hour >= 5 && hour <= 20);
  const min = observed.length ? Math.max(5, Math.min(...observed)) : 8;
  const max = observed.length ? Math.min(20, Math.max(...observed)) : 15;
  const out = [];
  for (let hour = min; hour <= max; hour += 1) out.push({ hour, label: hourLabel(hour), visits: counts.get(hour) ?? 0 });
  return out;
}

/** Most visits open at the same moment within [start, end). Open visits run until now. */
function peakConcurrent(visits: StatVisitRow[], start: number, end: number): number {
  const now = Date.now();
  const events: Array<[number, number]> = [];
  for (const visit of visits) {
    const rawStart = new Date(visit.checked_in_at).getTime();
    const rawEnd = visit.checked_out_at ? new Date(visit.checked_out_at).getTime() : now;
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

function busiestThirtyMinutes(visits: StatVisitRow[]) {
  const stamps = visits.map((visit) => new Date(visit.checked_in_at).getTime()).filter(Number.isFinite).sort((a, b) => a - b);
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

/** The busiest fixed-length stretch of the clock, stepping five minutes at a time. */
function busiestClockWindow(visits: StatVisitRow[], startMinute: number, endMinute: number, windowMinutes: number) {
  if (!visits.length) return null;
  const minutes = visits.map((visit) => {
    const parts = zonedParts(visit.checked_in_at);
    return { date: parts.date, minute: parts.hour * 60 + parts.minute };
  });
  const activeDays = new Set(minutes.map((entry) => entry.date)).size;
  let bestStart = startMinute;
  let bestCount = -1;
  for (let start = startMinute; start + windowMinutes <= endMinute; start += 5) {
    const end = start + windowMinutes;
    const count = minutes.filter((entry) => entry.minute >= start && entry.minute < end).length;
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

function buildMilestones(visits: StatVisitRow[]) {
  const visitTargets = [100, 250, 500, 1000, 2500, 5000, 10000, 25000];
  const uniqueTargets = [50, 100, 250, 500, 750, 1000, 1500, 2000];
  const reached: Array<{ type: "visits" | "students"; value: number; reachedAt: string }> = [];
  const seen = new Set<number>();
  let visitTargetIndex = 0;
  let uniqueTargetIndex = 0;

  for (let i = 0; i < visits.length; i += 1) {
    const visit = visits[i];
    seen.add(visit.student_row_id);
    while (visitTargetIndex < visitTargets.length && i + 1 >= visitTargets[visitTargetIndex]) {
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

async function handleUpdateVisitDuration(request: Request, env: Env): Promise<Response> {
  const body = await readJsonBody(request);
  if (!isRecord(body)) return json({ error: "Invalid request body." }, 400);

  const visitId = Number(body.visitId);
  const minutes = Number(body.durationMinutes);
  if (!Number.isInteger(visitId) || visitId < 1) return json({ error: "Invalid visit." }, 400);
  if (!Number.isInteger(minutes) || minutes < 0 || minutes > MAX_DURATION_MINUTES) {
    return json({ error: `Duration must be a whole number of minutes between 0 and ${MAX_DURATION_MINUTES}.` }, 400);
  }

  const existing = await env.SIGNAGE_DB.prepare(
    "SELECT id, checked_in_at, checked_out_at, archived_at FROM library_visits WHERE id = ?"
  ).bind(visitId).first<EditableVisitRow>();
  if (!existing) return json({ error: "That visit was not found." }, 404);
  if (existing.archived_at !== null) return json({ error: "Restore this visit before editing its duration." }, 409);
  if (existing.checked_out_at === null) return json({ error: "Check this student out before editing the visit duration." }, 409);

  const checkedOutMs = checkedInMs(existing) + minutes * 60_000;
  if (checkedOutMs > Date.now()) return json({ error: "Duration cannot put the checkout time in the future." }, 400);
  const checkedOutAt = new Date(checkedOutMs).toISOString();

  const result = await moveCheckoutStatement(env, visitId, checkedOutAt).run();
  if ((result.meta.changes ?? 0) !== 1) return json({ error: "That visit changed before it could be updated. Refresh and try again." }, 409);

  return json({ ok: true, visitId, durationMinutes: minutes, checkedOutAt });
}

async function handleUpdateVisitDurations(request: Request, env: Env): Promise<Response> {
  const body = await readJsonBody(request);
  if (!isRecord(body) || !Array.isArray(body.updates)) return json({ error: "Invalid request body." }, 400);

  const updates = parseDurationUpdates(body.updates);
  if (updates === null) {
    return json({ error: `Each duration must be a whole number of minutes between 0 and ${MAX_DURATION_MINUTES}.` }, 400);
  }
  if (updates.length === 0) return json({ error: "Select at least one visit to update." }, 400);
  if (updates.length > MAX_BATCH_VISITS) return json({ error: `Select ${MAX_BATCH_VISITS} visits or fewer at a time.` }, 400);

  const placeholders = updates.map(() => "?").join(",");
  const rows = await env.SIGNAGE_DB.prepare(
    `SELECT id, checked_in_at, checked_out_at, archived_at FROM library_visits WHERE id IN (${placeholders})`
  ).bind(...updates.map((update) => update.visitId)).all<EditableVisitRow>();
  const existing = new Map(rows.results.map((row) => [row.id, row]));
  const now = Date.now();
  const statements: D1PreparedStatement[] = [];

  // Everything is checked before anything is written, so a stale row in the
  // selection cannot leave the rest of the batch half applied.
  for (const update of updates) {
    const visit = existing.get(update.visitId);
    if (!visit) return json({ error: "One of those visits was not found. Refresh and try again." }, 404);
    if (visit.archived_at !== null) return json({ error: "Restore archived visits before editing their duration." }, 409);
    if (visit.checked_out_at === null) return json({ error: "Check these students out before editing their visit duration." }, 409);

    const checkedOutMs = checkedInMs(visit) + update.durationMinutes * 60_000;
    if (checkedOutMs > now) return json({ error: "A duration cannot put the checkout time in the future." }, 400);
    statements.push(moveCheckoutStatement(env, update.visitId, new Date(checkedOutMs).toISOString()));
  }

  const results = await env.SIGNAGE_DB.batch(statements);
  const updated = results.reduce((total, result) => total + (result.meta.changes ?? 0), 0);
  if (updated !== updates.length) {
    return json({ error: "Some of those visits changed before they could be updated. Refresh and try again." }, 409);
  }

  return json({ ok: true, updated });
}

async function handleClearWithDurations(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const body = await readJsonBody(request);
  if (!isRecord(body)) return json({ error: "Invalid request body." }, 400);
  if (body.adjustments !== undefined && body.adjustments !== null && !Array.isArray(body.adjustments)) {
    return json({ error: "Invalid request body." }, 400);
  }

  const adjustments = Array.isArray(body.adjustments) ? parseDurationUpdates(body.adjustments) : [];
  if (adjustments === null) {
    return json({ error: `Each corrected visit needs a whole number of minutes between 0 and ${MAX_DURATION_MINUTES}.` }, 400);
  }
  if (adjustments.length > MAX_BATCH_VISITS) {
    return json({ error: "Too many visits were sent at once. Refresh and try again." }, 400);
  }

  const startedAt = new Map<number, string>();
  if (adjustments.length) {
    const placeholders = adjustments.map(() => "?").join(",");
    const rows = await env.SIGNAGE_DB.prepare(
      `SELECT id, checked_in_at FROM library_visits
       WHERE id IN (${placeholders}) AND checked_out_at IS NULL AND archived_at IS NULL`
    ).bind(...adjustments.map((adjustment) => adjustment.visitId)).all<{ id: number; checked_in_at: string }>();
    for (const row of rows.results) startedAt.set(row.id, row.checked_in_at);
  }

  const now = Date.now();
  const updates: { visitId: number; checkedOutAt: string }[] = [];
  for (const adjustment of adjustments) {
    const start = startedAt.get(adjustment.visitId);
    // A visit checked out or archived while the librarian was reviewing is skipped;
    // the clear below still leaves the roster empty.
    if (!start) continue;
    const startMs = new Date(start).getTime();
    if (!Number.isFinite(startMs)) continue;
    const checkedOutMs = startMs + adjustment.durationMinutes * 60_000;
    if (checkedOutMs > now) return json({ error: "A corrected duration cannot put the checkout time in the future." }, 400);
    updates.push({ visitId: adjustment.visitId, checkedOutAt: new Date(checkedOutMs).toISOString() });
  }

  // Clear through the library app so every visit gets its Google Sheets event,
  // then move the checkout times that were corrected.
  const cleared = await libraryApp.fetch(clearRequest(request), env, ctx);
  if (!cleared.ok) return cleared;
  const clearedBody = (await cleared.json().catch(() => ({}))) as Record<string, unknown>;

  if (updates.length) {
    await env.SIGNAGE_DB.batch(updates.map((update) => moveCheckoutStatement(env, update.visitId, update.checkedOutAt)));
  }

  return json({ ...clearedBody, ok: true, adjusted: updates.length });
}

/**
 * A visit is flagged when it ran past LONG_VISIT_MINUTES, or is still open that long after
 * check-in, and nobody has reviewed it yet. Both usually mean a student forgot to scan out.
 */
const FLAGGED_WHERE = `v.archived_at IS NULL AND v.flag_reviewed_at IS NULL AND (
    (v.checked_out_at IS NULL AND v.checked_in_at < ?)
    OR (v.checked_out_at IS NOT NULL AND (julianday(v.checked_out_at) - julianday(v.checked_in_at)) * 1440 > ${LONG_VISIT_MINUTES})
  )`;

function longVisitCutoff(now = Date.now()): string {
  return new Date(now - LONG_VISIT_MINUTES * 60_000).toISOString();
}

async function countFlaggedVisits(env: Env): Promise<number> {
  const row = await env.SIGNAGE_DB.prepare(`SELECT COUNT(*) AS count FROM library_visits v WHERE ${FLAGGED_WHERE}`)
    .bind(longVisitCutoff())
    .first<{ count: number }>();
  return row?.count ?? 0;
}

async function handleFlaggedVisits(_request: Request, env: Env): Promise<Response> {
  const now = Date.now();
  const typicalSince = new Date(now - TYPICAL_LOOKBACK_DAYS * 86_400_000).toISOString();

  const [rows, total, samples] = await Promise.all([
    env.SIGNAGE_DB.prepare(`${historySelectSql()} WHERE ${FLAGGED_WHERE} ORDER BY v.checked_in_at DESC LIMIT ?`)
      .bind(longVisitCutoff(now), MAX_BATCH_VISITS)
      .all<HistoryRow>(),
    countFlaggedVisits(env),
    // Only visits students scanned out of themselves are trusted as "normal" lengths.
    env.SIGNAGE_DB.prepare(
      `SELECT reason, (julianday(checked_out_at) - julianday(checked_in_at)) * 1440 AS minutes
       FROM library_visits
       WHERE archived_at IS NULL AND checkout_method = 'scan_out' AND checked_out_at IS NOT NULL
         AND checked_in_at >= ?
         AND (julianday(checked_out_at) - julianday(checked_in_at)) * 1440 BETWEEN 1 AND ${LONG_VISIT_MINUTES}`
    ).bind(typicalSince).all<{ reason: string; minutes: number }>(),
  ]);

  const byReasonSamples = new Map<string, number[]>();
  for (const sample of samples.results) {
    const list = byReasonSamples.get(sample.reason) ?? [];
    list.push(sample.minutes);
    byReasonSamples.set(sample.reason, list);
  }
  const overall = median(samples.results.map((sample) => Math.round(sample.minutes))) ?? DEFAULT_TYPICAL_MINUTES;
  const byReason: Record<string, number> = {};
  for (const [reason, minutes] of byReasonSamples) {
    // A handful of visits is too few to call a reason's length typical.
    if (minutes.length >= 5) byReason[reason] = median(minutes.map((value) => Math.round(value))) ?? overall;
  }

  return json({
    thresholdMinutes: LONG_VISIT_MINUTES,
    total,
    typical: { overallMinutes: overall, byReason, sampleSize: samples.results.length, lookbackDays: TYPICAL_LOOKBACK_DAYS },
    visits: rows.results.map((row) => {
      const elapsed = Math.max(0, Math.floor((now - new Date(row.checked_in_at).getTime()) / 60000));
      const maxMinutes = Math.min(MAX_DURATION_MINUTES, elapsed);
      const flag = row.checked_out_at === null
        ? "open"
        : row.checkout_method === "clear_all" || row.checkout_method === "auto_end_of_day"
          ? "cleared"
          : "long";
      return {
        ...publicHistoryRow(row),
        flag,
        elapsedMinutes: elapsed,
        maxMinutes,
        suggestedMinutes: Math.min(maxMinutes, byReason[row.reason] ?? overall),
      };
    }),
  });
}

async function handleFixVisits(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const body = await readJsonBody(request);
  if (!isRecord(body) || !Array.isArray(body.fixes)) return json({ error: "Invalid request body." }, 400);

  const fixes = parseDurationUpdates(body.fixes);
  if (fixes === null) {
    return json({ error: `Each length must be a whole number of minutes between 0 and ${MAX_DURATION_MINUTES}.` }, 400);
  }
  if (fixes.length === 0) return json({ error: "Select at least one visit to fix." }, 400);
  if (fixes.length > MAX_BATCH_VISITS) return json({ error: `Fix ${MAX_BATCH_VISITS} visits or fewer at a time.` }, 400);

  const placeholders = fixes.map(() => "?").join(",");
  const rows = await env.SIGNAGE_DB.prepare(
    `SELECT id, checked_in_at, checked_out_at, archived_at FROM library_visits WHERE id IN (${placeholders})`
  ).bind(...fixes.map((fix) => fix.visitId)).all<EditableVisitRow>();
  const existing = new Map(rows.results.map((row) => [row.id, row]));
  const now = Date.now();
  const planned: { visitId: number; checkedOutAt: string; open: boolean }[] = [];

  // Validate the whole batch before writing anything.
  for (const fix of fixes) {
    const visit = existing.get(fix.visitId);
    if (!visit) return json({ error: "One of those visits was not found. Refresh and try again." }, 404);
    if (visit.archived_at !== null) return json({ error: "One of those visits was archived. Refresh and try again." }, 409);
    const checkedOutMs = checkedInMs(visit) + fix.durationMinutes * 60_000;
    if (checkedOutMs > now) return json({ error: "A length cannot put the checkout time in the future." }, 400);
    planned.push({ visitId: fix.visitId, checkedOutAt: new Date(checkedOutMs).toISOString(), open: visit.checked_out_at === null });
  }

  const actor = getActor(request);
  let closed = 0;
  const moves: D1PreparedStatement[] = [];
  for (const fix of planned) {
    if (fix.open && (await closeVisitAt(env, ctx, fix.visitId, fix.checkedOutAt, actor))) {
      closed += 1;
      continue;
    }
    // Either it was already closed, or someone checked it out while this was being reviewed.
    moves.push(moveCheckoutStatement(env, fix.visitId, fix.checkedOutAt));
  }

  const reviewedAt = new Date(now).toISOString();
  await env.SIGNAGE_DB.batch([
    ...moves,
    env.SIGNAGE_DB.prepare(`UPDATE library_visits SET flag_reviewed_at = ? WHERE id IN (${placeholders})`)
      .bind(reviewedAt, ...planned.map((fix) => fix.visitId)),
  ]);

  return json({ ok: true, fixed: planned.length, closed });
}

async function handleReviewFlag(request: Request, env: Env): Promise<Response> {
  const body = await readJsonBody(request);
  if (!isRecord(body)) return json({ error: "Invalid request body." }, 400);
  const visitId = Number(body.visitId);
  if (!Number.isInteger(visitId) || visitId < 1) return json({ error: "Invalid visit." }, 400);
  const reviewed = body.reviewed !== false;

  const result = await env.SIGNAGE_DB.prepare("UPDATE library_visits SET flag_reviewed_at = ? WHERE id = ? AND archived_at IS NULL")
    .bind(reviewed ? new Date().toISOString() : null, visitId)
    .run();
  if ((result.meta.changes ?? 0) !== 1) return json({ error: "That visit was not found." }, 404);
  return json({ ok: true, visitId, reviewed });
}

function parseDurationUpdates(value: unknown[]): DurationUpdate[] | null {
  const byVisitId = new Map<number, DurationUpdate>();
  for (const entry of value) {
    if (!isRecord(entry)) return null;
    const visitId = Number(entry.visitId);
    const minutes = Number(entry.durationMinutes);
    if (!Number.isInteger(visitId) || visitId < 1) return null;
    if (!Number.isInteger(minutes) || minutes < 0 || minutes > MAX_DURATION_MINUTES) return null;
    byVisitId.set(visitId, { visitId, durationMinutes: minutes });
  }
  return [...byVisitId.values()];
}

function checkedInMs(visit: EditableVisitRow): number {
  const value = new Date(visit.checked_in_at).getTime();
  if (!Number.isFinite(value)) throw new Error("Visit has an invalid check-in timestamp.");
  return value;
}

function moveCheckoutStatement(env: Env, visitId: number, checkedOutAt: string): D1PreparedStatement {
  return env.SIGNAGE_DB.prepare(
    `UPDATE library_visits
     SET checked_out_at = ?
     WHERE id = ? AND archived_at IS NULL AND checked_out_at IS NOT NULL`
  ).bind(checkedOutAt, visitId);
}

type LibraryRequest = Parameters<NonNullable<(typeof libraryApp)["fetch"]>>[0];

function clearRequest(request: Request): LibraryRequest {
  const target = new URL(request.url);
  target.pathname = "/api/library/clear";
  target.search = "";

  const headers = new Headers({ "Content-Type": "application/json; charset=utf-8" });
  for (const name of ["CF-Access-Authenticated-User-Email", "Cf-Access-Jwt-Assertion", "CF-Ray"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }

  return new Request(target.toString(), {
    method: "POST",
    headers,
    body: JSON.stringify({ method: "clear_all" }),
  }) as LibraryRequest;
}

function getActor(request: Request): string {
  return request.headers.get("CF-Access-Authenticated-User-Email")?.trim() || "Library staff";
}

function historySelectSql(): string {
  return `SELECT
      v.id,
      v.student_id,
      s.first_name,
      s.last_name,
      s.grade,
      v.reason,
      v.checked_in_at,
      v.checked_out_at,
      v.checkout_method,
      v.checked_out_by,
      v.archived_at,
      v.archived_by,
      CASE
        WHEN v.checked_out_at IS NULL THEN NULL
        ELSE CAST(ROUND((julianday(v.checked_out_at) - julianday(v.checked_in_at)) * 1440) AS INTEGER)
      END AS duration_minutes
    FROM library_visits v
    JOIN library_students s ON s.id = v.student_row_id`;
}

function publicHistoryRow(row: HistoryRow) {
  return {
    visitId: row.id,
    studentId: row.student_id,
    firstName: row.first_name,
    lastName: row.last_name,
    grade: row.grade,
    reason: row.reason,
    checkedInAt: row.checked_in_at,
    checkedOutAt: row.checked_out_at,
    checkoutMethod: row.checkout_method,
    checkedOutBy: row.checked_out_by,
    archivedAt: row.archived_at,
    archivedBy: row.archived_by,
    durationMinutes: row.duration_minutes,
  };
}

async function readJsonBody(request: Request): Promise<unknown> {
  if (!(request.headers.get("Content-Type") ?? "").toLowerCase().includes("application/json")) return {};
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeString(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function normalizeBarcode(value: unknown): string {
  return typeof value === "string" ? value.trim().replace(/\s+/g, "").slice(0, 80) : "";
}

function normalizePath(pathname: string): string {
  return pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
}

function clampInt(value: string | null, min: number, max: number, fallback: number): number {
  if (value === null || value.trim() === "") return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

function isStaffAuthorized(request: Request): boolean {
  if (isLocalRequest(request)) return true;
  return Boolean(
    request.headers.get("CF-Access-Authenticated-User-Email")?.trim() &&
    request.headers.get("Cf-Access-Jwt-Assertion")?.trim()
  );
}

function isLocalRequest(request: Request): boolean {
  const hostname = new URL(request.url).hostname;
  return !request.headers.get("CF-Ray") || hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: API_HEADERS });
}

function methodNotAllowed(methods: string[]): Response {
  return json({ error: "Method not allowed.", allowedMethods: methods }, 405);
}

function securityHeaders(): Record<string, string> {
  return {
    "Content-Security-Policy": "default-src 'none'; base-uri 'none'; connect-src 'self'; form-action 'self'; img-src 'self' data:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; object-src 'none'",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
  };
}

function dateInTimezone(value: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function parseDateOnly(value: string | null): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return value;
}

function addDateOnly(value: string, days: number): string {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function localDateStartIso(value: string): string {
  return new Date(localDateTimeMs(value, 0, 0)).toISOString();
}

/** Epoch milliseconds for a wall-clock time on a calendar date in the library's timezone. */
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

const zonedFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  weekday: "long",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function zonedParts(value: string): { date: string; weekday: string; hour: number; minute: number } {
  const map = Object.fromEntries(zonedFormat.formatToParts(new Date(value)).map((part) => [part.type, part.value]));
  return { date: `${map.year}-${map.month}-${map.day}`, weekday: map.weekday, hour: Number(map.hour), minute: Number(map.minute) };
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to + "T00:00:00Z") - Date.parse(from + "T00:00:00Z")) / 86400000);
}

function weekdayLabel(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, day)));
}

function shortDate(value: string): string {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, day)));
}

function hourLabel(hour: number): string {
  return `${hour % 12 || 12} ${hour >= 12 ? "PM" : "AM"}`;
}

function mondayOf(value: string): string {
  const [year, month, day] = value.split("-").map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return addDateOnly(value, weekday === 0 ? -6 : 1 - weekday);
}

function schoolYearStartFor(value: string): string {
  const [year, month] = value.split("-").map(Number);
  return `${month >= 8 ? year : year - 1}-08-01`;
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

/** Exact minutes between two timestamps, or null when either is invalid or the end comes first. */
function durationMinutes(start: string, end: string): number | null {
  const a = new Date(start).getTime();
  const b = new Date(end).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return null;
  return (b - a) / 60000;
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

/** Linear-interpolated percentile of an ascending list. */
function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const position = (sorted.length - 1) * p;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  return sorted[lower] * (upper - position) + sorted[upper] * (position - lower);
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
