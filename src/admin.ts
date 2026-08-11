import libraryApp, { ensureVisitArchiveColumns } from "./library";
import { adminHtml } from "./admin-ui";

const TIMEZONE = "America/New_York" as const;

const API_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  ...securityHeaders(),
};

const HTML_HEADERS = {
  "Content-Type": "text/html; charset=utf-8",
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

export default {
  async fetch(request, env, ctx): Promise<Response> {
    const url = new URL(request.url);
    const pathname = normalizePath(url.pathname);

    if (pathname === "/library/manage") {
      return request.method === "GET"
        ? new Response(adminHtml(), { headers: HTML_HEADERS })
        : methodNotAllowed(["GET"]);
    }

    if (pathname.startsWith("/api/library/admin-")) {
      if (!isStaffAuthorized(request)) return json({ error: "Unauthorized." }, 401);

      try {
        await ensureVisitArchiveColumns(env);
        if (pathname === "/api/library/admin-overview") {
          return request.method === "GET" ? handleOverview(env) : methodNotAllowed(["GET"]);
        }
        if (pathname === "/api/library/admin-students") {
          if (request.method === "GET") return handleStudents(request, env);
          if (request.method === "POST") return handleSaveStudent(request, env);
          return methodNotAllowed(["GET", "POST"]);
        }
        if (pathname === "/api/library/admin-student") {
          return request.method === "GET" ? handleStudentDetail(request, env) : methodNotAllowed(["GET"]);
        }
        if (pathname === "/api/library/admin-history") {
          return request.method === "GET" ? handleHistory(request, env) : methodNotAllowed(["GET"]);
        }
        if (pathname === "/api/library/admin-archive-visit") {
          return request.method === "POST" ? handleArchiveVisit(request, env) : methodNotAllowed(["POST"]);
        }
      } catch (error) {
        console.error(JSON.stringify({ event: "library_admin_error", pathname, error: String(error) }));
        return json({ error: "Something went wrong." }, 500);
      }
    }

    return libraryApp.fetch(request, env, ctx);
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
  const longVisitCutoff = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString();

  const [current, todayVisits, uniqueToday, students, kiosks, onlineKiosks, recent, longVisits, staleKiosks] = await Promise.all([
    env.SIGNAGE_DB.prepare("SELECT COUNT(*) AS count FROM library_visits WHERE checked_out_at IS NULL AND archived_at IS NULL").first<{ count: number }>(),
    env.SIGNAGE_DB.prepare("SELECT COUNT(*) AS count FROM library_visits WHERE checked_in_at >= ? AND checked_in_at < ? AND archived_at IS NULL").bind(start, end).first<{ count: number }>(),
    env.SIGNAGE_DB.prepare("SELECT COUNT(DISTINCT student_row_id) AS count FROM library_visits WHERE checked_in_at >= ? AND checked_in_at < ? AND archived_at IS NULL").bind(start, end).first<{ count: number }>(),
    env.SIGNAGE_DB.prepare("SELECT COUNT(*) AS count FROM library_students WHERE active = 1").first<{ count: number }>(),
    env.SIGNAGE_DB.prepare("SELECT COUNT(*) AS count FROM library_kiosk_devices WHERE revoked_at IS NULL").first<{ count: number }>(),
    env.SIGNAGE_DB.prepare("SELECT COUNT(*) AS count FROM library_kiosk_devices WHERE revoked_at IS NULL AND last_seen_at >= ?").bind(onlineCutoff).first<{ count: number }>(),
    env.SIGNAGE_DB.prepare(`${historySelectSql()} WHERE v.archived_at IS NULL ORDER BY v.checked_in_at DESC LIMIT 10`).all<HistoryRow>(),
    env.SIGNAGE_DB.prepare(
      `${historySelectSql()} WHERE v.checked_out_at IS NULL AND v.archived_at IS NULL AND v.checked_in_at < ? ORDER BY v.checked_in_at ASC LIMIT 5`
    ).bind(longVisitCutoff).all<HistoryRow>(),
    env.SIGNAGE_DB.prepare(
      `SELECT id, name, last_seen_at
       FROM library_kiosk_devices
       WHERE revoked_at IS NULL AND (last_seen_at IS NULL OR last_seen_at < ?)
       ORDER BY CASE WHEN last_seen_at IS NULL THEN 0 ELSE 1 END, last_seen_at ASC
       LIMIT 5`
    ).bind(onlineCutoff).all<KioskAttentionRow>(),
  ]);

  return json({
    generatedAt: now.toISOString(),
    currentCount: current?.count ?? 0,
    visitsToday: todayVisits?.count ?? 0,
    uniqueVisitorsToday: uniqueToday?.count ?? 0,
    activeStudents: students?.count ?? 0,
    pairedKiosks: kiosks?.count ?? 0,
    onlineKiosks: onlineKiosks?.count ?? 0,
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

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const countRow = await env.SIGNAGE_DB.prepare(
    `SELECT COUNT(*) AS count FROM library_students s ${whereSql}`
  ).bind(...binds).first<{ count: number }>();

  const rows = await env.SIGNAGE_DB.prepare(
    `SELECT
       s.id, s.student_id, s.barcode, s.first_name, s.last_name, s.grade, s.active, s.updated_at,
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

async function handleStudentDetail(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const id = clampInt(url.searchParams.get("id"), 1, 1000000000, 0);
  if (!id) return json({ error: "Student ID is required." }, 400);

  const student = await env.SIGNAGE_DB.prepare(
    `SELECT
       s.id, s.student_id, s.barcode, s.first_name, s.last_name, s.grade, s.active, s.updated_at,
       COUNT(v.id) AS visit_count,
       MAX(v.checked_in_at) AS last_visit_at
     FROM library_students s
     LEFT JOIN library_visits v ON v.student_row_id = s.id AND v.archived_at IS NULL
     WHERE s.id = ?
     GROUP BY s.id`
  ).bind(id).first<AdminStudentRow>();

  if (!student) return json({ error: "Student was not found." }, 404);

  const recent = await env.SIGNAGE_DB.prepare(
    `${historySelectSql()} WHERE v.student_row_id = ? AND v.archived_at IS NULL ORDER BY v.checked_in_at DESC LIMIT 8`
  ).bind(id).all<HistoryRow>();

  return json({
    student: publicAdminStudent(student),
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
  };
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
