type LibraryStatus = "open" | "capacity" | "closed";
type StatusMode = "auto" | "manual";
type CheckoutMethod = "scan_out" | "librarian" | "clear_all" | "auto_end_of_day";

type LibraryEnv = Env & {
  SHEETS_WEBHOOK_URL?: string;
  SHEETS_WEBHOOK_SECRET?: string;
  KIOSK_TOKEN?: string;
};

type StudentRow = {
  id: number;
  student_id: string;
  barcode: string;
  first_name: string;
  last_name: string;
  grade: string | null;
  active: number;
};

type VisitRow = {
  id: number;
  student_row_id: number;
  student_id: string;
  first_name: string;
  last_name: string;
  grade: string | null;
  reason: string;
  checked_in_at: string;
  checked_out_at: string | null;
  checkout_method: string | null;
};

type SettingsRow = {
  id: number;
  status_mode: string;
  manual_status: string;
  capacity: number;
  custom_message: string | null;
  show_public_count: number;
  auto_capacity_enabled: number;
  updated_at: string;
  updated_by: string;
};

type ScheduleRow = {
  opens_at: string | null;
  time_value: string | null;
};

type OpeningTimePreset = {
  id: number;
  timeValue: string;
  label: string;
};

type OpeningTimePresetRow = {
  id: number;
  time_value: string;
  label: string;
};

type ScheduledOpen = {
  opensAt: string;
  timeValue: string;
  label: string;
};

type CountRow = { count: number };
type ExistingStatusRow = { status: string; message: string | null };

type SheetEventPayload = {
  event: string;
  timestamp: string;
  visitId?: number;
  studentId?: string;
  firstName?: string;
  lastName?: string;
  grade?: string | null;
  reason?: string;
  checkIn?: string;
  checkOut?: string | null;
  durationMinutes?: number | null;
  checkoutMethod?: string | null;
  actor?: string;
};

const TIMEZONE = "America/New_York" as const;
const PUBLIC_ORIGIN = "https://signage.weeklywildcat.com";
const REASONS = [
  "Class work",
  "Printing",
  "Book checkout",
  "Lunch",
  "Meeting",
  "Other",
];

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

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    const pathname = normalizePath(url.pathname);

    try {
      await ensureLibraryTables(env);

      if (pathname.startsWith("/api/library/")) {
        const kioskAllowed = pathname === "/api/library/scan" || pathname === "/api/library/checkin" || pathname === "/api/library/checkout";
        const authorized = kioskAllowed ? isKioskOrStaffAuthorized(request, env) : isStaffAuthorized(request, env);
        if (!authorized) {
          return json({ error: "Unauthorized." }, 401);
        }
      }

      if (pathname === "/" || pathname === "/library") {
        return Response.redirect(`${url.origin}/library/kiosk`, 302);
      }

      if (pathname === "/library/kiosk") {
        return request.method === "GET" ? html(kioskHtml()) : methodNotAllowed(["GET"]);
      }

      if (pathname === "/library/manage") {
        return request.method === "GET" ? html(manageHtml()) : methodNotAllowed(["GET"]);
      }

      if (pathname === "/api/library/scan") {
        return request.method === "POST" ? handleScan(request, env) : methodNotAllowed(["POST"]);
      }

      if (pathname === "/api/library/checkin") {
        return request.method === "POST" ? handleCheckin(request, env) : methodNotAllowed(["POST"]);
      }

      if (pathname === "/api/library/checkout") {
        return request.method === "POST" ? handleCheckout(request, env) : methodNotAllowed(["POST"]);
      }

      if (pathname === "/api/library/clear") {
        return request.method === "POST" ? handleClear(request, env) : methodNotAllowed(["POST"]);
      }

      if (pathname === "/api/library/current") {
        return request.method === "GET" ? json(await getCurrentState(env, true)) : methodNotAllowed(["GET"]);
      }

      if (pathname === "/api/library/settings") {
        if (request.method === "GET") {
          return json(await getCurrentState(env, true));
        }
        if (request.method === "POST") {
          return handleSettings(request, env);
        }
        return methodNotAllowed(["GET", "POST"]);
      }

      if (pathname === "/api/library/import-students") {
        return request.method === "POST" ? handleStudentImport(request, env) : methodNotAllowed(["POST"]);
      }

      if (pathname === "/api/library/sync-sheets") {
        return request.method === "POST" ? handleSheetRetry(request, env) : methodNotAllowed(["POST"]);
      }

      if (pathname === "/api/signage/library") {
        return request.method === "GET" ? json(await getPublicSignageStatus(env)) : methodNotAllowed(["GET"]);
      }

      return notFound(pathname);
    } catch (error) {
      console.error(JSON.stringify({ message: "Unhandled library app error", error: String(error) }));
      return json({ error: "Something went wrong." }, 500);
    }
  },
} satisfies ExportedHandler<LibraryEnv>;

async function handleScan(request: Request, env: LibraryEnv): Promise<Response> {
  const body = await readJsonBody(request);
  if (!isRecord(body)) return json({ error: "Invalid request body." }, 400);

  const barcode = normalizeBarcode(body.barcode);
  if (!barcode) return json({ error: "Scan a student ID." }, 400);

  const student = await findStudentByBarcode(env, barcode);
  if (!student) {
    return json({ error: "Student was not found. Ask the librarian for help.", barcode }, 404);
  }

  const activeVisit = await findActiveVisitForStudent(env, student.id);
  const state = await getCurrentState(env, false);

  if (activeVisit) {
    return json({ mode: "checkout", student: publicStudent(student), visit: visitPayload(activeVisit), state });
  }

  if (state.status === "closed") {
    return json({
      mode: "closed",
      student: publicStudent(student),
      state,
      error: "The library is currently closed.",
    }, 409);
  }

  if (state.status === "capacity") {
    return json({
      mode: "capacity",
      student: publicStudent(student),
      state,
      error: "The library is currently at capacity.",
    }, 409);
  }

  return json({ mode: "checkin", student: publicStudent(student), reasons: REASONS, state });
}

async function handleCheckin(request: Request, env: LibraryEnv): Promise<Response> {
  const body = await readJsonBody(request);
  if (!isRecord(body)) return json({ error: "Invalid request body." }, 400);

  const barcode = normalizeBarcode(body.barcode);
  if (!barcode) return json({ error: "Scan a student ID." }, 400);

  const reason = normalizeReason(body.reason);
  if (!reason) return json({ error: "Choose a reason." }, 400);

  const student = await findStudentByBarcode(env, barcode);
  if (!student) return json({ error: "Student was not found." }, 404);

  const existingVisit = await findActiveVisitForStudent(env, student.id);
  if (existingVisit) {
    return json({ ok: true, alreadyCheckedIn: true, visit: visitPayload(existingVisit), state: await getCurrentState(env, true) });
  }

  const stateBefore = await getCurrentState(env, false);
  if (stateBefore.status === "closed") {
    return json({ error: "The library is currently closed." }, 409);
  }
  if (stateBefore.status === "capacity") {
    return json({ error: "The library is currently at capacity." }, 409);
  }

  const now = new Date().toISOString();
  const result = await env.SIGNAGE_DB.prepare(
    `INSERT INTO library_visits (student_row_id, student_id, reason, checked_in_at)
     VALUES (?, ?, ?, ?)`
  ).bind(student.id, student.student_id, reason, now).run();

  const visitId = Number(result.meta.last_row_id);
  const visit = await getVisitById(env, visitId);
  if (!visit) return json({ error: "Visit could not be created." }, 500);

  await queueSheetEvent(env, {
    event: "SIGN_IN",
    timestamp: now,
    visitId,
    studentId: student.student_id,
    firstName: student.first_name,
    lastName: student.last_name,
    grade: student.grade,
    reason,
    checkIn: now,
  });

  await syncSignageStatus(env, "Library check-in system");

  return json({ ok: true, visit: visitPayload(visit), state: await getCurrentState(env, true) });
}

async function handleCheckout(request: Request, env: LibraryEnv): Promise<Response> {
  const body = await readJsonBody(request);
  if (!isRecord(body)) return json({ error: "Invalid request body." }, 400);

  const checkoutMethod = body.method === "librarian" ? "librarian" : "scan_out";
  const actor = getActor(request);
  const now = new Date().toISOString();

  let visit: VisitRow | null = null;

  if (typeof body.visitId === "number") {
    visit = await getVisitById(env, body.visitId);
  } else {
    const barcode = normalizeBarcode(body.barcode);
    if (!barcode) return json({ error: "Scan a student ID or provide a visit ID." }, 400);
    const student = await findStudentByBarcode(env, barcode);
    if (!student) return json({ error: "Student was not found." }, 404);
    visit = await findActiveVisitForStudent(env, student.id);
  }

  if (!visit || visit.checked_out_at) {
    return json({ error: "No active visit was found." }, 404);
  }

  await checkoutVisit(env, visit.id, checkoutMethod, actor, now);
  const updatedVisit = await getVisitById(env, visit.id);
  await syncSignageStatus(env, actor);

  if (updatedVisit) {
    await queueSheetEvent(env, sheetCheckoutPayload("SIGN_OUT", updatedVisit, checkoutMethod, actor, now));
  }

  return json({ ok: true, visit: updatedVisit ? visitPayload(updatedVisit) : null, state: await getCurrentState(env, true) });
}

async function handleClear(request: Request, env: LibraryEnv): Promise<Response> {
  const body = await readJsonBody(request).catch(() => ({}));
  const actor = getActor(request);
  const now = new Date().toISOString();
  const method: CheckoutMethod = isRecord(body) && body.method === "auto_end_of_day" ? "auto_end_of_day" : "clear_all";

  const active = await getActiveVisits(env);
  await env.SIGNAGE_DB.prepare(
    `UPDATE library_visits
     SET checked_out_at = ?, checkout_method = ?, checked_out_by = ?
     WHERE checked_out_at IS NULL`
  ).bind(now, method, actor).run();

  for (const visit of active) {
    await queueSheetEvent(env, sheetCheckoutPayload(method === "auto_end_of_day" ? "AUTO_CLEAR" : "CLEAR_ALL", { ...visit, checked_out_at: now, checkout_method: method }, method, actor, now));
  }

  await syncSignageStatus(env, actor);
  return json({ ok: true, cleared: active.length, state: await getCurrentState(env, true) });
}

async function handleSettings(request: Request, env: LibraryEnv): Promise<Response> {
  const body = await readJsonBody(request);
  if (!isRecord(body)) return json({ error: "Invalid request body." }, 400);

  const current = await getSettings(env);
  const statusMode = body.statusMode === "manual" ? "manual" : body.statusMode === "auto" ? "auto" : current.status_mode;
  const manualStatus = isLibraryStatus(body.manualStatus) ? body.manualStatus : current.manual_status;
  const capacity = normalizeCapacity(body.capacity, current.capacity);
  const customMessage = typeof body.customMessage === "string" ? normalizeMessage(body.customMessage, 180) : current.custom_message ?? "";
  const showPublicCount = typeof body.showPublicCount === "boolean" ? (body.showPublicCount ? 1 : 0) : current.show_public_count;
  const autoCapacityEnabled = typeof body.autoCapacityEnabled === "boolean" ? (body.autoCapacityEnabled ? 1 : 0) : current.auto_capacity_enabled;
  const scheduledOpenTimeValue = body.scheduledOpenTime;
  const saveOpeningTime = body.saveOpeningTime === true;
  const nowDate = new Date();
  const now = nowDate.toISOString();
  const actor = getActor(request);

  if (
    scheduledOpenTimeValue !== undefined &&
    scheduledOpenTimeValue !== null &&
    typeof scheduledOpenTimeValue !== "string"
  ) {
    return json({ error: "Scheduled open time must be a time string." }, 400);
  }

  const scheduledOpen = scheduledOpenTimeValue
    ? resolveScheduledOpenTime(scheduledOpenTimeValue, nowDate)
    : null;

  if (scheduledOpenTimeValue && scheduledOpen === null) {
    return json({ error: "Choose a future opening time for today." }, 400);
  }

  if (saveOpeningTime && scheduledOpen === null) {
    return json({ error: "Choose an opening time before saving it." }, 400);
  }

  await env.SIGNAGE_DB.prepare(
    `UPDATE library_settings
     SET status_mode = ?, manual_status = ?, capacity = ?, custom_message = ?, show_public_count = ?, auto_capacity_enabled = ?, updated_at = ?, updated_by = ?
     WHERE id = 1`
  ).bind(statusMode, manualStatus, capacity, customMessage, showPublicCount, autoCapacityEnabled, now, actor).run();

  const scheduleStatements = [
    env.SIGNAGE_DB.prepare(
      `INSERT INTO library_open_schedule (id, opens_at, time_value, updated_at, updated_by)
       VALUES (1, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET opens_at = excluded.opens_at, time_value = excluded.time_value, updated_at = excluded.updated_at, updated_by = excluded.updated_by`
    ).bind(scheduledOpen?.opensAt ?? null, scheduledOpen?.timeValue ?? null, now, actor),
  ];

  if (saveOpeningTime && scheduledOpen !== null) {
    scheduleStatements.push(
      env.SIGNAGE_DB.prepare(
        `INSERT INTO library_opening_presets (time_value, label, created_at, created_by)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(time_value) DO UPDATE SET label = excluded.label`
      ).bind(scheduledOpen.timeValue, scheduledOpen.label, now, actor),
    );
  }

  await env.SIGNAGE_DB.batch(scheduleStatements);

  await queueSheetEvent(env, {
    event: "SETTINGS_CHANGED",
    timestamp: now,
    actor,
    reason: `mode=${statusMode}; manual=${manualStatus}; capacity=${capacity}; opens=${scheduledOpen?.label ?? "none"}`,
  });

  await syncSignageStatus(env, actor);
  return json({ ok: true, state: await getCurrentState(env, true) });
}

async function handleStudentImport(request: Request, env: LibraryEnv): Promise<Response> {
  const body = await readJsonBody(request);
  if (!isRecord(body) || !Array.isArray(body.students)) {
    return json({ error: "Expected { students: [...] }." }, 400);
  }

  const now = new Date().toISOString();
  let imported = 0;
  let skipped = 0;

  for (const item of body.students) {
    if (!isRecord(item)) {
      skipped += 1;
      continue;
    }

    const studentId = normalizeString(item.studentId ?? item.student_id, 64);
    const barcode = normalizeBarcode(item.barcode ?? item.barcodeValue ?? studentId);
    const firstName = normalizeString(item.firstName ?? item.first_name, 80);
    const lastName = normalizeString(item.lastName ?? item.last_name, 80);
    const grade = normalizeString(item.grade, 16);

    if (!studentId || !barcode || !firstName || !lastName) {
      skipped += 1;
      continue;
    }

    await env.SIGNAGE_DB.prepare(
      `INSERT INTO library_students (student_id, barcode, first_name, last_name, grade, active, updated_at)
       VALUES (?, ?, ?, ?, ?, 1, ?)
       ON CONFLICT(student_id) DO UPDATE SET
         barcode = excluded.barcode,
         first_name = excluded.first_name,
         last_name = excluded.last_name,
         grade = excluded.grade,
         active = 1,
         updated_at = excluded.updated_at`
    ).bind(studentId, barcode, firstName, lastName, grade || null, now).run();
    imported += 1;
  }

  return json({ ok: true, imported, skipped });
}

async function handleSheetRetry(_request: Request, env: LibraryEnv): Promise<Response> {
  const rows = await env.SIGNAGE_DB.prepare(
    `SELECT id, payload_json FROM library_sheet_events
     WHERE synced_at IS NULL AND attempts < 10
     ORDER BY id ASC
     LIMIT 25`
  ).all<{ id: number; payload_json: string }>();

  let synced = 0;
  let failed = 0;

  for (const row of rows.results) {
    const ok = await sendSheetEvent(env, row.id, row.payload_json);
    if (ok) synced += 1;
    else failed += 1;
  }

  return json({ ok: true, attempted: rows.results.length, synced, failed });
}

async function findStudentByBarcode(env: LibraryEnv, barcode: string): Promise<StudentRow | null> {
  const row = await env.SIGNAGE_DB.prepare(
    `SELECT id, student_id, barcode, first_name, last_name, grade, active
     FROM library_students
     WHERE barcode = ? AND active = 1`
  ).bind(barcode).first<StudentRow>();
  return row ?? null;
}

async function findActiveVisitForStudent(env: LibraryEnv, studentRowId: number): Promise<VisitRow | null> {
  const row = await env.SIGNAGE_DB.prepare(
    `${visitSelectSql()} WHERE v.student_row_id = ? AND v.checked_out_at IS NULL ORDER BY v.checked_in_at DESC LIMIT 1`
  ).bind(studentRowId).first<VisitRow>();
  return row ?? null;
}

async function getVisitById(env: LibraryEnv, visitId: number): Promise<VisitRow | null> {
  const row = await env.SIGNAGE_DB.prepare(`${visitSelectSql()} WHERE v.id = ?`).bind(visitId).first<VisitRow>();
  return row ?? null;
}

async function getActiveVisits(env: LibraryEnv): Promise<VisitRow[]> {
  const result = await env.SIGNAGE_DB.prepare(
    `${visitSelectSql()} WHERE v.checked_out_at IS NULL ORDER BY v.checked_in_at ASC`
  ).all<VisitRow>();
  return result.results;
}

function visitSelectSql(): string {
  return `SELECT
      v.id,
      v.student_row_id,
      v.student_id,
      s.first_name,
      s.last_name,
      s.grade,
      v.reason,
      v.checked_in_at,
      v.checked_out_at,
      v.checkout_method
    FROM library_visits v
    JOIN library_students s ON s.id = v.student_row_id`;
}

async function checkoutVisit(env: LibraryEnv, visitId: number, method: CheckoutMethod, actor: string, checkedOutAt: string): Promise<void> {
  await env.SIGNAGE_DB.prepare(
    `UPDATE library_visits
     SET checked_out_at = ?, checkout_method = ?, checked_out_by = ?
     WHERE id = ? AND checked_out_at IS NULL`
  ).bind(checkedOutAt, method, actor, visitId).run();
}

async function getCurrentState(env: LibraryEnv, includeStudents: boolean) {
  const settings = await getSettings(env);
  const currentCount = await getActiveCount(env);
  const status = resolveEffectiveLibraryStatus(settings, currentCount);
  const activeVisits = includeStudents ? await getActiveVisits(env) : [];
  const now = new Date();

  return {
    status,
    statusLabel: statusLabel(status),
    currentCount,
    capacity: settings.capacity,
    statusMode: settings.status_mode,
    manualStatus: settings.manual_status,
    customMessage: settings.custom_message ?? "",
    showPublicCount: Boolean(settings.show_public_count),
    autoCapacityEnabled: Boolean(settings.auto_capacity_enabled),
    scheduledOpen: await getScheduledOpen(env, now),
    openingTimePresets: await getOpeningTimePresets(env),
    updatedAt: settings.updated_at,
    updatedBy: settings.updated_by,
    timezone: TIMEZONE,
    generatedAt: now.toISOString(),
    students: activeVisits.map(visitPayload),
  };
}

async function getPublicSignageStatus(env: LibraryEnv) {
  const state = await getCurrentState(env, false);
  return {
    status: state.status,
    statusLabel: state.statusLabel,
    currentCount: state.showPublicCount ? state.currentCount : null,
    capacity: state.showPublicCount ? state.capacity : null,
    message: state.customMessage,
    scheduledOpen: state.scheduledOpen,
    timezone: TIMEZONE,
    generatedAt: state.generatedAt,
  };
}

async function syncSignageStatus(env: LibraryEnv, actor: string): Promise<void> {
  const settings = await getSettings(env);
  const count = await getActiveCount(env);
  const status = resolveEffectiveLibraryStatus(settings, count);
  const message = settings.custom_message ?? "";
  const updatedAt = new Date().toISOString();

  await env.SIGNAGE_DB.batch([
    env.SIGNAGE_DB.prepare(
      `INSERT INTO library_status (id, status, message, updated_at, updated_by)
       VALUES (1, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET status = excluded.status, message = excluded.message, updated_at = excluded.updated_at, updated_by = excluded.updated_by`
    ).bind(status, message, updatedAt, actor),
    env.SIGNAGE_DB.prepare(
      `INSERT INTO library_status_history (status, message, updated_at, updated_by)
       VALUES (?, ?, ?, ?)`
    ).bind(status, message, updatedAt, actor),
  ]);
}

function resolveEffectiveLibraryStatus(settings: SettingsRow, currentCount: number): LibraryStatus {
  if (settings.status_mode === "manual") {
    return isLibraryStatus(settings.manual_status) ? settings.manual_status : "closed";
  }

  if (!settings.auto_capacity_enabled) {
    return "open";
  }

  if (settings.capacity > 0 && currentCount >= settings.capacity) {
    return "capacity";
  }

  return "open";
}

async function getSettings(env: LibraryEnv): Promise<SettingsRow> {
  const row = await env.SIGNAGE_DB.prepare(
    `SELECT id, status_mode, manual_status, capacity, custom_message, show_public_count, auto_capacity_enabled, updated_at, updated_by
     FROM library_settings
     WHERE id = 1`
  ).first<SettingsRow>();

  if (row) return row;

  const now = new Date().toISOString();
  await env.SIGNAGE_DB.prepare(
    `INSERT INTO library_settings (id, status_mode, manual_status, capacity, custom_message, show_public_count, auto_capacity_enabled, updated_at, updated_by)
     VALUES (1, 'auto', 'open', 25, '', 1, 1, ?, 'Library staff')`
  ).bind(now).run();

  return {
    id: 1,
    status_mode: "auto",
    manual_status: "open",
    capacity: 25,
    custom_message: "",
    show_public_count: 1,
    auto_capacity_enabled: 1,
    updated_at: now,
    updated_by: "Library staff",
  };
}

async function getActiveCount(env: LibraryEnv): Promise<number> {
  const row = await env.SIGNAGE_DB.prepare(
    "SELECT COUNT(*) AS count FROM library_visits WHERE checked_out_at IS NULL"
  ).first<CountRow>();
  return row?.count ?? 0;
}

async function queueSheetEvent(env: LibraryEnv, payload: SheetEventPayload): Promise<void> {
  const payloadJson = JSON.stringify(payload);
  const result = await env.SIGNAGE_DB.prepare(
    `INSERT INTO library_sheet_events (event_type, payload_json, created_at)
     VALUES (?, ?, ?)`
  ).bind(payload.event, payloadJson, new Date().toISOString()).run();

  const eventId = Number(result.meta.last_row_id);
  await sendSheetEvent(env, eventId, payloadJson);
}

async function sendSheetEvent(env: LibraryEnv, eventId: number, payloadJson: string): Promise<boolean> {
  if (!env.SHEETS_WEBHOOK_URL || !env.SHEETS_WEBHOOK_SECRET) {
    return false;
  }

  try {
    const response = await fetch(env.SHEETS_WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Library-Sync-Secret": env.SHEETS_WEBHOOK_SECRET,
      },
      body: payloadJson,
    });

    if (!response.ok) {
      throw new Error(`Sheets webhook returned ${response.status}`);
    }

    await env.SIGNAGE_DB.prepare(
      "UPDATE library_sheet_events SET synced_at = ?, attempts = attempts + 1, last_error = NULL WHERE id = ?"
    ).bind(new Date().toISOString(), eventId).run();
    return true;
  } catch (error) {
    await env.SIGNAGE_DB.prepare(
      "UPDATE library_sheet_events SET attempts = attempts + 1, last_error = ? WHERE id = ?"
    ).bind(String(error), eventId).run();
    return false;
  }
}

function sheetCheckoutPayload(event: string, visit: VisitRow, method: string, actor: string, timestamp: string): SheetEventPayload {
  return {
    event,
    timestamp,
    visitId: visit.id,
    studentId: visit.student_id,
    firstName: visit.first_name,
    lastName: visit.last_name,
    grade: visit.grade,
    reason: visit.reason,
    checkIn: visit.checked_in_at,
    checkOut: visit.checked_out_at ?? timestamp,
    durationMinutes: durationMinutes(visit.checked_in_at, visit.checked_out_at ?? timestamp),
    checkoutMethod: method,
    actor,
  };
}

function publicStudent(student: StudentRow) {
  return {
    studentId: student.student_id,
    firstName: student.first_name,
    lastName: student.last_name,
    grade: student.grade,
  };
}

function visitPayload(visit: VisitRow) {
  return {
    visitId: visit.id,
    studentId: visit.student_id,
    firstName: visit.first_name,
    lastName: visit.last_name,
    grade: visit.grade,
    reason: visit.reason,
    checkedInAt: visit.checked_in_at,
    checkedOutAt: visit.checked_out_at,
    checkoutMethod: visit.checkout_method,
    durationMinutes: visit.checked_out_at ? durationMinutes(visit.checked_in_at, visit.checked_out_at) : null,
  };
}

function durationMinutes(startIso: string, endIso: string): number | null {
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return null;
  return Math.round((end - start) / 60000);
}

async function ensureLibraryTables(env: LibraryEnv): Promise<void> {
  const now = new Date().toISOString();
  await env.SIGNAGE_DB.batch([
    env.SIGNAGE_DB.prepare(
      `CREATE TABLE IF NOT EXISTS library_students (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id TEXT NOT NULL UNIQUE,
        barcode TEXT NOT NULL UNIQUE,
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL,
        grade TEXT,
        active INTEGER NOT NULL DEFAULT 1,
        updated_at TEXT NOT NULL
      )`
    ),
    env.SIGNAGE_DB.prepare(
      `CREATE TABLE IF NOT EXISTS library_visits (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_row_id INTEGER NOT NULL,
        student_id TEXT NOT NULL,
        reason TEXT NOT NULL,
        checked_in_at TEXT NOT NULL,
        checked_out_at TEXT,
        checkout_method TEXT,
        checked_out_by TEXT,
        FOREIGN KEY (student_row_id) REFERENCES library_students(id)
      )`
    ),
    env.SIGNAGE_DB.prepare(
      `CREATE INDEX IF NOT EXISTS idx_library_visits_active ON library_visits(checked_out_at, checked_in_at)`
    ),
    env.SIGNAGE_DB.prepare(
      `CREATE INDEX IF NOT EXISTS idx_library_visits_student_active ON library_visits(student_row_id, checked_out_at)`
    ),
    env.SIGNAGE_DB.prepare(
      `CREATE TABLE IF NOT EXISTS library_settings (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        status_mode TEXT NOT NULL DEFAULT 'auto' CHECK (status_mode IN ('auto', 'manual')),
        manual_status TEXT NOT NULL DEFAULT 'open' CHECK (manual_status IN ('open', 'capacity', 'closed')),
        capacity INTEGER NOT NULL DEFAULT 25,
        custom_message TEXT NOT NULL DEFAULT '',
        show_public_count INTEGER NOT NULL DEFAULT 1,
        auto_capacity_enabled INTEGER NOT NULL DEFAULT 1,
        updated_at TEXT NOT NULL,
        updated_by TEXT NOT NULL
      )`
    ),
    env.SIGNAGE_DB.prepare(
      `INSERT INTO library_settings (id, status_mode, manual_status, capacity, custom_message, show_public_count, auto_capacity_enabled, updated_at, updated_by)
       VALUES (1, 'auto', 'open', 25, '', 1, 1, ?, 'Library staff')
       ON CONFLICT(id) DO NOTHING`
    ).bind(now),
    env.SIGNAGE_DB.prepare(
      `CREATE TABLE IF NOT EXISTS library_app_migrations (
        name TEXT PRIMARY KEY,
        applied_at TEXT NOT NULL
      )`
    ),
    env.SIGNAGE_DB.prepare(
      `UPDATE library_settings
       SET show_public_count = 1
       WHERE id = 1
         AND NOT EXISTS (SELECT 1 FROM library_app_migrations WHERE name = 'default_tv_count_on_v17')`
    ),
    env.SIGNAGE_DB.prepare(
      `INSERT INTO library_app_migrations (name, applied_at)
       SELECT 'default_tv_count_on_v17', ?
       WHERE NOT EXISTS (SELECT 1 FROM library_app_migrations WHERE name = 'default_tv_count_on_v17')`
    ).bind(now),
    env.SIGNAGE_DB.prepare(
      `CREATE TABLE IF NOT EXISTS library_sheet_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_type TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        synced_at TEXT,
        attempts INTEGER NOT NULL DEFAULT 0,
        last_error TEXT
      )`
    ),
    env.SIGNAGE_DB.prepare(
      `CREATE TABLE IF NOT EXISTS library_status (
        id INTEGER PRIMARY KEY,
        status TEXT NOT NULL CHECK (status IN ('open', 'capacity', 'closed')),
        message TEXT NOT NULL DEFAULT '',
        updated_at TEXT NOT NULL,
        updated_by TEXT NOT NULL
      )`
    ),
    env.SIGNAGE_DB.prepare(
      `CREATE TABLE IF NOT EXISTS library_status_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        status TEXT NOT NULL CHECK (status IN ('open', 'capacity', 'closed')),
        message TEXT NOT NULL DEFAULT '',
        updated_at TEXT NOT NULL,
        updated_by TEXT NOT NULL
      )`
    ),
    env.SIGNAGE_DB.prepare(
      `CREATE TABLE IF NOT EXISTS library_open_schedule (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        opens_at TEXT,
        time_value TEXT,
        updated_at TEXT NOT NULL,
        updated_by TEXT NOT NULL
      )`
    ),
    env.SIGNAGE_DB.prepare(
      `CREATE TABLE IF NOT EXISTS library_opening_presets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        time_value TEXT NOT NULL UNIQUE,
        label TEXT NOT NULL,
        created_at TEXT NOT NULL,
        created_by TEXT NOT NULL
      )`
    ),
    env.SIGNAGE_DB.prepare(
      `INSERT INTO library_open_schedule (id, opens_at, time_value, updated_at, updated_by)
       VALUES (1, NULL, NULL, ?, 'Library staff')
       ON CONFLICT(id) DO NOTHING`
    ).bind(now),
  ]);
}

async function getScheduledOpen(env: LibraryEnv, now: Date): Promise<ScheduledOpen | null> {
  const row = await env.SIGNAGE_DB.prepare(
    "SELECT opens_at, time_value FROM library_open_schedule WHERE id = 1"
  ).first<ScheduleRow>();

  if (!row?.opens_at || !row.time_value) return null;

  const opensAtDate = new Date(row.opens_at);
  if (Number.isNaN(opensAtDate.getTime()) || opensAtDate.getTime() <= now.getTime()) {
    return null;
  }

  return {
    opensAt: opensAtDate.toISOString(),
    timeValue: row.time_value,
    label: formatTimeValue(row.time_value),
  };
}

async function getOpeningTimePresets(env: LibraryEnv): Promise<OpeningTimePreset[]> {
  const result = await env.SIGNAGE_DB.prepare(
    "SELECT id, time_value, label FROM library_opening_presets ORDER BY time_value ASC"
  ).all<OpeningTimePresetRow>();

  return result.results.map((row) => ({
    id: row.id,
    timeValue: row.time_value,
    label: row.label,
  }));
}

function resolveScheduledOpenTime(timeValue: string, now: Date): ScheduledOpen | null {
  const normalizedTime = normalizeTimeValue(timeValue);
  if (normalizedTime === null) return null;

  const opensAt = newYorkDateTimeToUtc(newYorkDateKey(now), normalizedTime);
  if (opensAt.getTime() <= now.getTime()) return null;

  return {
    opensAt: opensAt.toISOString(),
    timeValue: normalizedTime,
    label: formatTimeValue(normalizedTime),
  };
}

function normalizeTimeValue(timeValue: string): string | null {
  const match = /^(?:([01]\d|2[0-3]):([0-5]\d))$/.exec(timeValue.trim());
  return match ? `${match[1]}:${match[2]}` : null;
}

function formatTimeValue(timeValue: string): string {
  const normalizedTime = normalizeTimeValue(timeValue);
  if (normalizedTime === null) return timeValue;
  const [hourPart, minutePart] = normalizedTime.split(":");
  const hour = Number(hourPart);
  const suffix = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 || 12;
  return `${hour12}:${minutePart} ${suffix}`;
}

function newYorkDateTimeToUtc(dateKey: string, timeValue: string): Date {
  const [year, month, day] = dateKey.split("-").map(Number);
  const [hour, minute] = timeValue.split(":").map(Number);
  let utcMillis = Date.UTC(year, month - 1, day, hour, minute);

  for (let index = 0; index < 2; index += 1) {
    utcMillis = Date.UTC(year, month - 1, day, hour, minute) - getNewYorkOffsetMillis(new Date(utcMillis));
  }

  return new Date(utcMillis);
}

function getNewYorkOffsetMillis(date: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);

  const getPart = (type: string): number => Number(parts.find((part) => part.type === type)?.value ?? "0");
  const asUtcMillis = Date.UTC(
    getPart("year"),
    getPart("month") - 1,
    getPart("day"),
    getPart("hour"),
    getPart("minute"),
    getPart("second"),
  );

  return asUtcMillis - date.getTime();
}

function newYorkDateKey(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = parts.find((part) => part.type === "year")?.value ?? "0000";
  const month = parts.find((part) => part.type === "month")?.value ?? "00";
  const day = parts.find((part) => part.type === "day")?.value ?? "00";
  return `${year}-${month}-${day}`;
}

async function readJsonBody(request: Request): Promise<unknown> {
  const contentType = request.headers.get("Content-Type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return {};
  }

  try {
    return await request.json();
  } catch {
    return {};
  }
}

function normalizePath(pathname: string): string {
  return pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
}

function normalizeBarcode(value: unknown): string {
  return typeof value === "string" ? value.trim().replace(/\s+/g, "").slice(0, 80) : "";
}

function normalizeReason(value: unknown): string {
  if (typeof value !== "string") return "";
  const reason = normalizeMessage(value, 80);
  return reason.length > 0 ? reason : "";
}

function normalizeString(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function normalizeMessage(value: string, maxLength: number): string {
  return value.trim().replace(/\s+/g, " ").slice(0, maxLength);
}

function normalizeCapacity(value: unknown, fallback: number): number {
  const raw = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(raw)) return fallback;
  return Math.max(1, Math.min(500, Math.floor(raw)));
}

function isLibraryStatus(value: unknown): value is LibraryStatus {
  return value === "open" || value === "capacity" || value === "closed";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function statusLabel(status: LibraryStatus): string {
  if (status === "capacity") return "At Capacity";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function getActor(request: Request): string {
  return request.headers.get("CF-Access-Authenticated-User-Email")?.trim() || "Library staff";
}

function isStaffAuthorized(request: Request, env: LibraryEnv): boolean {
  const accessUser = request.headers.get("CF-Access-Authenticated-User-Email")?.trim();
  if (accessUser) return true;

  // Local/dev mode: before KIOSK_TOKEN is set, allow API calls so Wrangler dev works.
  return !env.KIOSK_TOKEN;
}

function isKioskOrStaffAuthorized(request: Request, env: LibraryEnv): boolean {
  if (isStaffAuthorized(request, env)) return true;
  const token = request.headers.get("X-Kiosk-Token")?.trim();
  return Boolean(env.KIOSK_TOKEN && token && token === env.KIOSK_TOKEN);
}

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: API_HEADERS });
}

function html(markup: string, status = 200): Response {
  return new Response(markup, { status, headers: HTML_HEADERS });
}

function methodNotAllowed(allowedMethods: string[]): Response {
  return json({ error: "Method not allowed.", allowedMethods }, 405);
}

function notFound(pathname: string): Response {
  return json({ error: "Not found.", path: pathname }, 404);
}

function securityHeaders(): Record<string, string> {
  return {
    "Content-Security-Policy": "default-src 'none'; base-uri 'none'; connect-src 'self'; form-action 'self'; img-src 'self' data:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; object-src 'none'",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
  };
}

function kioskHtml(): string {
  const reasons = REASONS.map((reason) => `<button type="button" class="reason" data-reason="${escapeAttr(reason)}"><span>${escapeHtml(reason)}</span></button>`).join("");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>Library Check-In</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f7f4ef;
      --surface: #ffffff;
      --ink: #15171a;
      --muted: #626b74;
      --line: #d9d3ca;
      --maroon: #741f27;
      --maroon-soft: #f3e7e8;
      --green: #106a43;
      --green-soft: #e8f5ee;
      --red: #9c2930;
      --red-soft: #fff0f1;
      --amber: #735600;
      --amber-soft: #fff6dc;
      --focus: #174ea6;
      --font-ui: "Google Sans", Roboto, "Helvetica Neue", Arial, system-ui, sans-serif;
      --font-display: "Google Sans", Roboto, "Helvetica Neue", Arial, system-ui, sans-serif;
    }

    * { box-sizing: border-box; }

    html,
    body {
      width: 100%;
      height: 100%;
      margin: 0;
      overflow: hidden;
    }

    body {
      background: var(--bg);
      color: var(--ink);
      font-family: var(--font-ui);
      -webkit-font-smoothing: antialiased;
      text-rendering: optimizeLegibility;
      font-synthesis: none;
      transition: background-color 180ms ease;
    }

    button,
    input { font: inherit; }

    .shell {
      width: 100vw;
      height: 100vh;
      height: 100dvh;
      max-height: 100vh;
      max-height: 100dvh;
      overflow: hidden;
      display: grid;
      grid-template-rows: 62px minmax(0, 1fr) 42px;
    }

    .topbar,
    .footer {
      min-width: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0 28px;
      background: rgba(255, 255, 255, 0.76);
      border-color: var(--line);
    }

    .topbar { border-bottom: 1px solid var(--line); }
    .footer { border-top: 1px solid var(--line); gap: 18px; }

    .brand {
      min-width: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 12px;
      color: var(--ink);
      font-size: clamp(17px, 1.6vw, 23px);
      line-height: 1;
      font-weight: 720;
      letter-spacing: -0.01em;
      white-space: nowrap;
    }

    .stage {
      min-height: 0;
      overflow: hidden;
      display: grid;
      place-items: center;
      padding: clamp(16px, 2.8vh, 28px) clamp(24px, 4vw, 54px);
    }

    .screen {
      width: min(920px, 100%);
      max-height: 100%;
      min-height: 0;
      display: grid;
      place-items: center;
      align-content: center;
      text-align: center;
    }

    .screen.fade-in {
      animation: screenFade 160ms ease-out both;
    }

    @keyframes screenFade {
      from { opacity: 0.82; transform: translateY(3px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .eyebrow {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      margin: 0 0 clamp(8px, 1.5vh, 14px);
      color: var(--maroon);
      font-size: clamp(11px, 1.25vw, 15px);
      line-height: 1;
      font-weight: 760;
      letter-spacing: 0.075em;
      text-transform: uppercase;
    }

    .eyebrow::before {
      content: "";
      width: 9px;
      height: 9px;
      border-radius: 999px;
      background: currentColor;
    }

    h1 {
      margin: 0;
      max-width: 880px;
      color: var(--ink);
      font-family: var(--font-display);
      font-size: clamp(38px, 5.7vw, 70px);
      line-height: 1.04;
      letter-spacing: -0.028em;
      font-weight: 720;
      text-align: center;
    }

    .lead {
      margin: clamp(10px, 1.8vh, 16px) 0 0;
      max-width: 640px;
      color: var(--muted);
      font-size: clamp(18px, 2.3vw, 30px);
      line-height: 1.12;
      letter-spacing: -0.012em;
      font-weight: 500;
      text-align: center;
    }

    .scan-status {
      margin-top: clamp(20px, 3.4vh, 34px);
      width: min(520px, 100%);
      border: 1px solid var(--line);
      border-radius: 22px;
      background: var(--surface);
      padding: clamp(16px, 2.6vh, 24px) clamp(18px, 3vw, 26px);
      display: grid;
      justify-items: center;
      gap: clamp(10px, 1.7vh, 16px);
      box-shadow: 0 18px 50px rgba(30, 24, 20, 0.07);
      transition: background-color 180ms ease, border-color 180ms ease, box-shadow 180ms ease;
    }

    .scan-symbol {
      width: clamp(46px, 7vh, 68px);
      height: clamp(46px, 7vh, 68px);
      border: 2px solid currentColor;
      border-radius: 16px;
      color: var(--maroon);
      display: grid;
      place-items: center;
      position: relative;
      overflow: hidden;
    }

    .scan-symbol svg {
      width: 55%;
      height: 55%;
      stroke-width: 2.2;
    }

    body[data-step="idle"][data-tone="idle"] .scan-symbol::after {
      content: "";
      position: absolute;
      left: 18%;
      right: 18%;
      height: 3px;
      border-radius: 999px;
      background: currentColor;
      animation: scanline 1.45s ease-in-out infinite;
    }

    @keyframes scanline {
      0%, 100% { transform: translateY(-22px); opacity: .22; }
      50% { transform: translateY(22px); opacity: .95; }
    }

    .status-title {
      font-family: var(--font-display);
      font-size: clamp(22px, 3vw, 34px);
      line-height: 1.05;
      letter-spacing: -0.02em;
      font-weight: 650;
      text-align: center;
    }

    .status-detail {
      margin-top: 6px;
      color: var(--muted);
      font-size: clamp(14px, 1.45vw, 19px);
      line-height: 1.25;
      font-weight: 450;
      text-align: center;
    }

    .reason-grid {
      display: none;
      width: min(720px, 100%);
      margin-top: clamp(20px, 3.2vh, 30px);
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: clamp(10px, 1.65vh, 14px);
    }

    body[data-step="reasons"] .scan-status { display: none; }
    body[data-step="reasons"] .reason-grid { display: grid; }

    .reason {
      min-height: clamp(62px, 10vh, 82px);
      border: 1px solid var(--line);
      border-radius: 18px;
      background: #fff;
      color: var(--ink);
      padding: 0 18px;
      text-align: center;
      cursor: pointer;
      display: grid;
      place-items: center;
      transition: transform 90ms ease, background 90ms ease, border-color 90ms ease;
      touch-action: manipulation;
    }

    .reason span {
      display: block;
      font-family: var(--font-display);
      font-size: clamp(21px, 2.55vw, 29px);
      line-height: 1.05;
      letter-spacing: -0.018em;
      font-weight: 650;
      text-align: center;
    }

    .reason:hover,
    .reason:focus-visible {
      outline: 4px solid var(--focus);
      outline-offset: 2px;
      background: #fffafa;
      transform: translateY(-1px);
    }

    .reason:active { transform: translateY(0); }

    .cancel {
      display: none;
      margin-top: clamp(12px, 2vh, 18px);
      min-height: 38px;
      border: 0;
      border-radius: 999px;
      background: var(--ink);
      color: #fff;
      padding: 0 18px;
      cursor: pointer;
      font-weight: 800;
      font-size: 15px;
      touch-action: manipulation;
    }

    body[data-step="reasons"] .cancel {
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }

    .footer {
      color: var(--muted);
      font-size: clamp(12px, 1.2vw, 15px);
      line-height: 1;
      font-weight: 500;
      white-space: nowrap;
    }

    .footer-status {
      border: 1px solid var(--line);
      border-radius: 999px;
      background: #fff;
      color: var(--ink);
      padding: 5px 10px;
      font-size: 11px;
      font-weight: 850;
      letter-spacing: .05em;
      text-transform: uppercase;
    }

    .scan-input {
      position: fixed;
      left: -20px;
      bottom: -20px;
      width: 1px;
      height: 1px;
      opacity: 0;
      border: 0;
      padding: 0;
    }

    .dev-tools {
      position: fixed;
      right: 14px;
      bottom: 52px;
      z-index: 4;
      display: none;
    }

    body[data-dev="true"] .dev-tools { display: block; }

    .dev-tools button {
      min-height: 34px;
      border: 1px solid var(--line);
      border-radius: 999px;
      background: #fff;
      color: var(--muted);
      padding: 0 12px;
      font-size: 12px;
      font-weight: 800;
      cursor: pointer;
    }

    body[data-tone="working"] { background: var(--amber-soft); }
    body[data-tone="working"] .eyebrow { color: var(--amber); }
    body[data-tone="working"] .scan-status { background: #fffaf0; }
    body[data-tone="working"] .scan-symbol { color: var(--amber); }

    body[data-tone="success"] { background: var(--green-soft); }
    body[data-tone="success"] .eyebrow { color: var(--green); }
    body[data-tone="success"] .scan-status { background: #f4fbf7; }
    body[data-tone="success"] .scan-symbol { color: var(--green); }
    body[data-tone="success"] h1 { color: var(--green); }

    body[data-tone="error"] { background: var(--red-soft); }
    body[data-tone="error"] .eyebrow { color: var(--red); }
    body[data-tone="error"] .scan-status { background: #fff8f8; }
    body[data-tone="error"] .scan-symbol { color: var(--red); }
    body[data-tone="error"] h1 { color: var(--red); }

    @media (max-height: 660px) {
      .shell { grid-template-rows: 54px minmax(0, 1fr) 36px; }
      .stage { padding-top: 10px; padding-bottom: 10px; }
      .brand { font-size: 16px; }
      h1 { font-size: clamp(32px, 5vw, 54px); }
      .lead { font-size: clamp(16px, 2vw, 23px); margin-top: 8px; }
      .eyebrow { margin-bottom: 7px; font-size: 11px; }
      .scan-status { margin-top: 14px; padding: 13px 16px; border-radius: 18px; gap: 8px; }
      .scan-symbol { width: 42px; height: 42px; border-radius: 12px; }
      .status-title { font-size: clamp(22px, 2.8vw, 31px); }
      .status-detail { font-size: 13px; margin-top: 4px; }
      .reason-grid { margin-top: 16px; gap: 9px; width: min(680px, 100%); }
      .reason { min-height: 54px; border-radius: 15px; }
      .reason span { font-size: clamp(19px, 2.35vw, 26px); }
      .cancel { min-height: 34px; margin-top: 10px; font-size: 14px; }
      .footer { font-size: 12px; }
    }

    @media (max-width: 760px) {
      .topbar, .footer { padding-left: 16px; padding-right: 16px; }
      .stage { padding-left: 16px; padding-right: 16px; }
      .brand { font-size: 15px; }
      .reason-grid { grid-template-columns: 1fr; width: min(420px, 100%); }
      .reason { min-height: 50px; }
      .reason span { font-size: 21px; }
    }

    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after { animation-duration: 0.001ms !important; transition-duration: 0.001ms !important; }
    }
  </style>
</head>
<body data-step="idle" data-tone="idle">
  <div class="shell">
    <header class="topbar">
      <div class="brand"><span>Ninety Six High School Library</span></div>
    </header>

    <main class="stage">
      <section class="screen" aria-live="polite">
        <div class="eyebrow" id="eyebrow">Library Check-In</div>
        <h1 id="headline">Welcome to the Library</h1>
        <p class="lead" id="lead">Scan your student ID.</p>

        <div class="scan-status" id="scan-status">
          <div class="scan-symbol" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
              <path d="M4 7V5a1 1 0 0 1 1-1h2"/><path d="M17 4h2a1 1 0 0 1 1 1v2"/>
              <path d="M20 17v2a1 1 0 0 1-1 1h-2"/><path d="M7 20H5a1 1 0 0 1-1-1v-2"/>
              <path d="M7 9h10"/><path d="M7 12h10"/><path d="M7 15h6"/>
            </svg>
          </div>
          <div>
            <div class="status-title" id="status-title">Waiting for scan</div>
            <div class="status-detail" id="status-detail">Hold the barcode under the scanner.</div>
          </div>
        </div>

        <div class="reason-grid" id="reasons">${reasons}</div>
        <button class="cancel" id="cancel" type="button">Cancel</button>
        <div class="dev-tools"><button type="button" id="test-scan">Test scan 12345</button></div>
      </section>
    </main>

    <footer class="footer">
      <div id="hint">Need help? See the librarian.</div>
      <div class="footer-status" id="footer-status">Ready</div>
    </footer>
  </div>

  <input class="scan-input" id="scan-input" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="Scanner input">

  <script>
    const eyebrow = document.getElementById('eyebrow');
    const headline = document.getElementById('headline');
    const lead = document.getElementById('lead');
    const statusTitle = document.getElementById('status-title');
    const statusDetail = document.getElementById('status-detail');
    const hint = document.getElementById('hint');
    const scanInput = document.getElementById('scan-input');
    const footerStatus = document.getElementById('footer-status');
    const screen = document.querySelector('.screen');

    let currentBarcode = '';
    let currentFirstName = '';
    let keyBuffer = '';
    let keyTimer = null;
    let resetTimer = null;
    let workingTimer = null;
    let reasonTimer = null;
    let busy = false;

    const providedToken = new URLSearchParams(location.search).get('token');
    if (providedToken) {
      localStorage.setItem('libraryKioskToken', providedToken);
      history.replaceState(null, '', location.pathname);
    }

    if (location.hostname === 'localhost' || location.search.includes('dev=1')) {
      document.body.dataset.dev = 'true';
    }

    function authHeaders() {
      const token = localStorage.getItem('libraryKioskToken');
      return token ? { 'X-Kiosk-Token': token } : {};
    }

    async function post(url, body) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders() },
          body: JSON.stringify(body),
          cache: 'no-store',
          signal: controller.signal,
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || 'Request failed');
        return data;
      } catch (error) {
        if (error && error.name === 'AbortError') throw new Error('Could not connect.');
        throw error;
      } finally {
        clearTimeout(timeout);
      }
    }

    function setTone(tone) { document.body.dataset.tone = tone; }
    function setStep(step) { document.body.dataset.step = step; }

    function clearTimers() {
      clearTimeout(keyTimer);
      clearTimeout(resetTimer);
      clearTimeout(workingTimer);
      clearTimeout(reasonTimer);
    }

    function setCopy(next) {
      eyebrow.textContent = next.eyebrow;
      headline.textContent = next.headline;
      lead.textContent = next.lead;
      statusTitle.textContent = next.statusTitle;
      statusDetail.textContent = next.statusDetail;
      hint.textContent = next.hint || 'Need help? See the librarian.';
      footerStatus.textContent = next.footerStatus;
      if (screen) {
        screen.classList.remove('fade-in');
        void screen.offsetWidth;
        screen.classList.add('fade-in');
      }
    }

    function showIdle() {
      clearTimers();
      busy = false;
      currentBarcode = '';
      currentFirstName = '';
      keyBuffer = '';
      scanInput.value = '';
      setStep('idle');
      setTone('idle');
      setCopy({
        eyebrow: 'Library Check-In',
        headline: 'Welcome to the Library',
        lead: 'Scan your student ID.',
        statusTitle: 'Waiting for scan',
        statusDetail: 'Hold the barcode under the scanner.',
        hint: 'Need help? See the librarian.',
        footerStatus: 'Ready',
      });
      focusScanner();
    }

    function showWorking() {
      setStep('idle');
      setTone('working');
      setCopy({
        eyebrow: 'Checking ID',
        headline: 'One moment',
        lead: 'Checking student record.',
        statusTitle: 'Reading ID',
        statusDetail: 'This should only take a moment.',
        hint: 'Need help? See the librarian.',
        footerStatus: 'Checking',
      });
    }

    function showSuccess(title, detail, ms) {
      clearTimers();
      busy = false;
      setStep('idle');
      setTone('success');
      setCopy({
        eyebrow: 'Done',
        headline: title,
        lead: detail,
        statusTitle: title,
        statusDetail: detail,
        hint: 'Ready for the next scan.',
        footerStatus: 'Ready',
      });
      resetTimer = setTimeout(showIdle, ms || 850);
    }

    function showError(title, detail, ms) {
      clearTimers();
      busy = false;
      setStep('idle');
      setTone('error');
      setCopy({
        eyebrow: 'Needs Help',
        headline: title,
        lead: 'Please see the librarian.',
        statusTitle: title,
        statusDetail: detail,
        hint: 'Please see the librarian.',
        footerStatus: 'Help',
      });
      resetTimer = setTimeout(showIdle, ms || 3000);
    }

    function showReasons(student) {
      clearTimeout(workingTimer);
      busy = false;
      currentFirstName = student && student.firstName ? student.firstName : 'there';
      setStep('reasons');
      setTone('idle');
      setCopy({
        eyebrow: 'Check-In',
        headline: 'Welcome, ' + currentFirstName,
        lead: 'What brings you in?',
        statusTitle: '',
        statusDetail: '',
        hint: 'Tap one reason.',
        footerStatus: 'Choose',
      });
      reasonTimer = setTimeout(showIdle, 20000);
      focusScanner();
    }

    function focusScanner() {
      if (document.activeElement && document.activeElement.closest && document.activeElement.closest('button')) return;
      requestAnimationFrame(() => scanInput.focus({ preventScroll: true }));
    }

    function finishBufferedScan() {
      const value = (scanInput.value || keyBuffer).trim();
      scanInput.value = '';
      keyBuffer = '';
      if (value) handleScan(value);
    }

    async function handleScan(value) {
      const scanned = String(value || '').trim();
      if (!scanned || busy) return;

      clearTimers();
      busy = true;
      currentBarcode = scanned;
      footerStatus.textContent = 'Reading';
      workingTimer = setTimeout(showWorking, 300);

      try {
        const data = await post('/api/library/scan', { barcode: scanned });
        clearTimeout(workingTimer);

        if (data.mode === 'checkout') {
          const firstName = data.student && data.student.firstName ? data.student.firstName : 'there';
          await post('/api/library/checkout', { barcode: scanned, method: 'scan_out' });
          showSuccess('Checked out, ' + firstName, 'See you next time.', 800);
          return;
        }

        if (data.mode === 'checkin') {
          showReasons(data.student);
          return;
        }

        showError('ID not found', 'Please see the librarian.');
      } catch (error) {
        clearTimeout(workingTimer);
        showError('Could not scan', error instanceof Error ? error.message : 'Try again or see the librarian.');
      } finally {
        focusScanner();
      }
    }

    document.addEventListener('keydown', (event) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.target && event.target.closest && event.target.closest('button')) return;

      if (event.key === 'Escape') {
        event.preventDefault();
        showIdle();
        return;
      }

      if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault();
        finishBufferedScan();
        return;
      }

      if (event.key && event.key.length === 1 && document.body.dataset.step !== 'reasons') {
        keyBuffer += event.key;
        footerStatus.textContent = 'Reading';
        clearTimeout(keyTimer);
        keyTimer = setTimeout(() => {
          if (keyBuffer.length >= 5) finishBufferedScan();
        }, 230);
      }
    }, true);

    scanInput.addEventListener('input', () => {
      if (document.body.dataset.step === 'reasons') {
        scanInput.value = '';
        return;
      }
      keyBuffer = scanInput.value;
      footerStatus.textContent = 'Reading';
    });

    scanInput.addEventListener('change', finishBufferedScan);

    document.getElementById('reasons').addEventListener('click', async (event) => {
      const button = event.target.closest('button[data-reason]');
      if (!button || busy || !currentBarcode) return;
      clearTimeout(reasonTimer);
      busy = true;
      footerStatus.textContent = 'Checking in';
      try {
        await post('/api/library/checkin', { barcode: currentBarcode, reason: button.dataset.reason });
        showSuccess('Checked in, ' + currentFirstName, 'You are all set.', 850);
      } catch (error) {
        showError('Could not check in', error instanceof Error ? error.message : 'Try again or see the librarian.');
      } finally {
        focusScanner();
      }
    });

    document.getElementById('cancel').addEventListener('click', showIdle);
    document.getElementById('test-scan').addEventListener('click', () => handleScan('12345'));

    document.addEventListener('pointerdown', (event) => {
      if (event.target && event.target.closest && event.target.closest('button')) return;
      setTimeout(focusScanner, 0);
    });

    window.addEventListener('focus', focusScanner);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) focusScanner(); });

    showIdle();
  </script>
</body>
</html>`;
}
function manageHtml(): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>Library Control</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f3f4f5;
      --surface: #ffffff;
      --surface-soft: #f7f8f9;
      --ink: #171a1f;
      --muted: #5d6773;
      --quiet: #858f9a;
      --line: #d9dee4;
      --line-strong: #c5ced8;
      --maroon: #741f27;
      --green: #116b43;
      --green-bg: #eaf6ef;
      --amber: #7a5a00;
      --amber-bg: #fff5d7;
      --red: #9d2932;
      --red-bg: #fff0f1;
      --blue: #1557d2;
      --shadow: 0 10px 28px rgba(23, 26, 31, 0.08);
      --font: "Google Sans", Roboto, "Helvetica Neue", Arial, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }

    * { box-sizing: border-box; }

    html,
    body {
      width: 100%;
      height: 100%;
      margin: 0;
      overflow: hidden;
    }

    body {
      background: var(--bg);
      color: var(--ink);
      font-family: var(--font);
      -webkit-font-smoothing: antialiased;
      text-rendering: optimizeLegibility;
    }

    button,
    input,
    select,
    textarea { font: inherit; }

    .app {
      width: min(1280px, 100vw);
      height: 100vh;
      height: 100dvh;
      margin: 0 auto;
      padding: 16px;
      display: grid;
      grid-template-rows: 54px 66px minmax(0, 1fr);
      gap: 12px;
      overflow: hidden;
    }

    .topbar,
    .statusbar,
    .panel {
      background: var(--surface);
      border: 1px solid var(--line);
      border-radius: 16px;
      box-shadow: var(--shadow);
    }

    .topbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      padding: 0 16px;
    }

    .title {
      display: flex;
      align-items: baseline;
      gap: 12px;
      min-width: 0;
    }

    h1 {
      margin: 0;
      font-size: 22px;
      line-height: 1;
      font-weight: 620;
      letter-spacing: -0.03em;
      white-space: nowrap;
    }

    .subtle {
      color: var(--muted);
      font-size: 14px;
      line-height: 1.1;
      font-weight: 450;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .top-actions {
      display: flex;
      gap: 9px;
      align-items: center;
      flex: 0 0 auto;
    }

    button {
      min-height: 36px;
      border: 0;
      border-radius: 11px;
      padding: 0 14px;
      background: var(--maroon);
      color: #fff;
      font-size: 13.5px;
      line-height: 1;
      font-weight: 610;
      cursor: pointer;
      transition: background-color 120ms ease, transform 120ms ease, opacity 120ms ease;
    }

    button:hover { transform: translateY(-1px); }
    button:active { transform: translateY(0); }
    button:disabled { opacity: .55; cursor: not-allowed; transform: none; }

    .secondary {
      background: #fff;
      color: var(--ink);
      border: 1px solid var(--line-strong);
    }

    .danger { background: var(--red); }
    .small { min-height: 32px; padding: 0 12px; font-size: 13px; }

    button:focus-visible,
    input:focus-visible,
    select:focus-visible,
    textarea:focus-visible,
    .seg input:focus-visible + span {
      outline: 3px solid var(--blue);
      outline-offset: 2px;
    }

    .statusbar {
      display: grid;
      grid-template-columns: 1.05fr 1fr .9fr 1.12fr;
      overflow: hidden;
    }

    .stat {
      min-width: 0;
      padding: 12px 16px;
      border-right: 1px solid var(--line);
      display: grid;
      gap: 6px;
      align-content: center;
    }

    .stat:last-child { border-right: 0; }

    .label {
      color: var(--muted);
      font-size: 11.5px;
      line-height: 1;
      font-weight: 700;
      letter-spacing: .045em;
      text-transform: uppercase;
    }

    .value {
      min-width: 0;
      font-size: 24px;
      line-height: .98;
      font-weight: 610;
      letter-spacing: -0.035em;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .status-inline {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      min-width: 0;
    }

    .dot {
      width: 10px;
      height: 10px;
      border-radius: 999px;
      background: var(--red);
      box-shadow: 0 0 0 4px var(--red-bg);
      flex: 0 0 auto;
    }

    .dot[data-status="open"] { background: var(--green); box-shadow: 0 0 0 4px var(--green-bg); }
    .dot[data-status="capacity"] { background: var(--amber); box-shadow: 0 0 0 4px var(--amber-bg); }
    .dot[data-status="closed"] { background: var(--red); box-shadow: 0 0 0 4px var(--red-bg); }

    .workspace {
      min-height: 0;
      display: grid;
      grid-template-columns: minmax(0, 1fr) 390px;
      gap: 12px;
      overflow: hidden;
    }

    .panel {
      min-height: 0;
      display: grid;
      grid-template-rows: 56px minmax(0, 1fr);
      overflow: hidden;
    }

    .panel-title {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 0 16px;
      border-bottom: 1px solid var(--line);
      background: linear-gradient(180deg, #fff, #fbfcfd);
    }

    h2,
    h3 {
      margin: 0;
      font-size: 16px;
      line-height: 1;
      font-weight: 620;
      letter-spacing: -0.018em;
    }

    .panel-note {
      margin-top: 5px;
      color: var(--muted);
      font-size: 13px;
      line-height: 1;
      font-weight: 430;
    }

    .table-head,
    .student-row {
      display: grid;
      grid-template-columns: minmax(230px, 1.6fr) 64px minmax(125px, .8fr) 86px 96px;
      gap: 12px;
      align-items: center;
    }

    .table-head {
      height: 36px;
      padding: 0 16px;
      background: var(--surface-soft);
      border-bottom: 1px solid var(--line);
      color: var(--muted);
      font-size: 11.5px;
      line-height: 1;
      font-weight: 720;
      letter-spacing: .045em;
      text-transform: uppercase;
    }

    .student-list {
      height: calc(100% - 36px);
      min-height: 0;
      overflow: auto;
      background: #fff;
    }

    .student-row {
      min-height: 58px;
      padding: 8px 16px;
      border-bottom: 1px solid var(--line);
      animation: fadeRow 120ms ease-out both;
    }

    @keyframes fadeRow {
      from { opacity: .7; transform: translateY(1px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .student-row:last-child { border-bottom: 0; }

    .student-name {
      font-size: 15px;
      line-height: 1.08;
      font-weight: 620;
      letter-spacing: -0.012em;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .student-id {
      margin-top: 4px;
      color: var(--muted);
      font-size: 12.5px;
      line-height: 1;
    }

    .cell {
      min-width: 0;
      font-size: 14px;
      line-height: 1.15;
      font-weight: 500;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .muted { color: var(--muted); }
    .row-label { display: none; }

    .empty {
      height: 100%;
      display: grid;
      place-items: center;
      color: var(--muted);
      font-size: 14.5px;
      background: var(--surface-soft);
    }

    .control-body {
      min-height: 0;
      padding: 13px;
      display: grid;
      grid-template-rows: auto auto auto auto 1fr;
      gap: 10px;
      overflow: hidden;
      align-content: start;
    }

    .group {
      border: 1px solid var(--line);
      border-radius: 14px;
      background: var(--surface-soft);
      padding: 12px;
      display: grid;
      gap: 10px;
    }

    .group-head {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 10px;
    }

    .hint {
      color: var(--muted);
      font-size: 12px;
      line-height: 1.15;
      font-weight: 430;
      white-space: nowrap;
    }

    .settings-panel {
      position: relative;
      z-index: 5;
      overflow: visible;
    }

    .settings-panel .control-body {
      overflow: visible;
    }

    .tip {
      position: relative;
      display: inline-grid;
      place-items: center;
      width: 16px;
      height: 16px;
      margin-left: 6px;
      border: 1px solid var(--line-strong);
      border-radius: 999px;
      color: var(--muted);
      background: #fff;
      font-size: 11px;
      line-height: 1;
      font-weight: 740;
      cursor: help;
      vertical-align: 1px;
      isolation: isolate;
    }

    .tip:hover,
    .tip:focus-visible {
      color: var(--ink);
      border-color: var(--muted);
      outline: none;
    }

    .tip::before,
    .tip::after {
      position: absolute;
      top: 50%;
      opacity: 0;
      visibility: hidden;
      pointer-events: none;
      transition: opacity 120ms ease, visibility 120ms ease, transform 120ms ease;
      z-index: 50;
    }

    .tip::before {
      content: "";
      right: calc(100% + 2px);
      width: 0;
      height: 0;
      border-top: 6px solid transparent;
      border-bottom: 6px solid transparent;
      border-left: 6px solid #171a1f;
      transform: translate(-2px, -50%);
    }

    .tip::after {
      content: attr(data-tooltip);
      right: calc(100% + 8px);
      width: max-content;
      max-width: 260px;
      padding: 9px 10px;
      border-radius: 10px;
      background: #171a1f;
      color: #fff;
      box-shadow: 0 12px 28px rgba(23, 26, 31, 0.22);
      font-size: 12.5px;
      line-height: 1.25;
      font-weight: 520;
      letter-spacing: 0;
      text-transform: none;
      white-space: normal;
      text-align: left;
      transform: translate(-2px, -50%);
    }

    .tip:hover::before,
    .tip:hover::after,
    .tip:focus-visible::before,
    .tip:focus-visible::after {
      opacity: 1;
      visibility: visible;
      transform: translate(0, -50%);
    }

    .field {
      display: grid;
      gap: 6px;
      min-width: 0;
    }

    .two { display: grid; grid-template-columns: .72fr 1fr; gap: 10px; align-items: end; }
    .two-even { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; align-items: end; }

    label,
    .fake-label {
      color: var(--muted);
      font-size: 11.5px;
      line-height: 1;
      font-weight: 700;
      letter-spacing: .045em;
      text-transform: uppercase;
    }

    input,
    select,
    textarea {
      width: 100%;
      min-height: 36px;
      border: 1px solid var(--line-strong);
      border-radius: 10px;
      background: #fff;
      color: var(--ink);
      padding: 7px 10px;
      font-size: 14px;
      line-height: 1.1;
      font-weight: 500;
    }

    textarea {
      min-height: 48px;
      max-height: 48px;
      resize: none;
      line-height: 1.3;
    }

    .seg {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 4px;
      padding: 4px;
      border: 1px solid var(--line);
      border-radius: 11px;
      background: #edf1f4;
    }

    .seg.three { grid-template-columns: repeat(3, minmax(0, 1fr)); }

    .seg label {
      display: block;
      color: inherit;
      font-size: inherit;
      font-weight: inherit;
      letter-spacing: inherit;
      text-transform: none;
    }

    .seg input {
      position: absolute;
      opacity: 0;
      pointer-events: none;
      width: 1px;
      height: 1px;
    }

    .seg span {
      min-height: 30px;
      display: grid;
      place-items: center;
      border-radius: 8px;
      color: var(--muted);
      font-size: 13px;
      font-weight: 610;
      cursor: pointer;
      user-select: none;
      transition: background-color 100ms ease, color 100ms ease, box-shadow 100ms ease;
    }

    .seg input:checked + span {
      background: #fff;
      color: var(--ink);
      box-shadow: 0 1px 4px rgba(21,24,28,.14);
    }

    .preset-row {
      display: grid;
      grid-template-columns: 1fr 112px;
      gap: 10px;
      align-items: end;
    }

    .checkline {
      display: flex;
      align-items: center;
      gap: 8px;
      color: var(--ink);
      font-size: 13px;
      line-height: 1.2;
      font-weight: 500;
      text-transform: none;
      letter-spacing: 0;
    }

    .checkline input { width: 16px; height: 16px; min-height: 0; padding: 0; }

    .notice {
      min-height: 20px;
      color: var(--muted);
      font-size: 13px;
      line-height: 1.2;
    }

    .notice[data-tone="success"] { color: var(--green); }
    .notice[data-tone="error"] { color: var(--red); }

    .savebar {
      align-self: end;
      display: grid;
      gap: 9px;
      padding: 12px;
      border: 1px solid var(--line);
      border-radius: 14px;
      background: #fff;
    }

    .save-buttons { display: grid; grid-template-columns: 1fr 1fr; gap: 9px; }

    @media (max-height: 740px) and (min-width: 981px) {
      .app { padding: 12px; grid-template-rows: 50px 60px minmax(0, 1fr); gap: 10px; }
      .panel { grid-template-rows: 50px minmax(0, 1fr); }
      .control-body { padding: 10px; gap: 8px; }
      .group { padding: 10px; gap: 8px; }
      input, select { min-height: 34px; }
      textarea { min-height: 42px; max-height: 42px; }
      .student-row { min-height: 54px; }
      .value { font-size: 22px; }
    }

    @media (max-width: 980px) {
      .app { height: auto; min-height: 100vh; overflow: auto; grid-template-rows: auto auto auto; }
      html, body { overflow: auto; }
      .title { display: block; }
      .subtle { margin-top: 5px; }
      .statusbar, .workspace { grid-template-columns: 1fr; }
      .workspace { overflow: visible; }
      .panel { min-height: 360px; }
      .table-head { display: none; }
      .student-list { height: 100%; }
      .student-row { grid-template-columns: 1fr; gap: 5px; padding: 12px 16px; }
      .row-label { display: block; color: var(--muted); font-size: 11px; font-weight: 700; text-transform: uppercase; margin-bottom: 2px; }
      .two, .two-even, .preset-row { grid-template-columns: 1fr; }
    }

    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after { animation-duration: 0.001ms !important; transition-duration: 0.001ms !important; }
    }
  </style>
</head>
<body>
  <div class="app">
    <header class="topbar">
      <div class="title">
        <h1>Library control</h1>
        <div class="subtle">Live roster, TV status, opening countdown.</div>
      </div>
      <div class="top-actions">
        <button class="secondary small" id="refresh" type="button" title="Reload the live roster and TV status without changing anything.">Refresh</button>
        <button class="danger small" id="clear-all" type="button" title="Check out every student currently shown in the library roster. Use this at lunch change or end of day.">Clear all</button>
      </div>
    </header>

    <section class="statusbar" aria-label="Current library status">
      <div class="stat">
        <div class="label">In library</div>
        <div class="value" id="current">0 / 25</div>
      </div>
      <div class="stat">
        <div class="label">TV status</div>
        <div class="value"><span class="status-inline"><span class="dot" id="status-dot" data-status="closed"></span><span id="status">Closed</span></span></div>
      </div>
      <div class="stat">
        <div class="label">Mode</div>
        <div class="value" id="mode">Auto</div>
      </div>
      <div class="stat">
        <div class="label">Scheduled open</div>
        <div class="value" id="scheduled-summary">None</div>
      </div>
    </section>

    <main class="workspace">
      <section class="panel">
        <div class="panel-title">
          <div>
            <h2>Current students</h2>
            <div class="panel-note" id="student-count-label">No students checked in</div>
          </div>
          <button class="secondary small" id="refresh-list" type="button" title="Refresh the current student list.">Update</button>
        </div>
        <div>
          <div class="table-head" aria-hidden="true">
            <div>Student</div>
            <div>Grade</div>
            <div>Reason</div>
            <div>In</div>
            <div>Action</div>
          </div>
          <div class="student-list" id="students"><div class="empty">Loading...</div></div>
        </div>
      </section>

      <aside class="panel settings-panel">
        <div class="panel-title">
          <div>
            <h2>Settings</h2>
            <div class="panel-note">Saved changes update the TV display.</div>
          </div>
        </div>
        <div class="control-body">
          <section class="group">
            <div class="group-head"><h3>Capacity <span class="tip" tabindex="0" role="note" aria-label="Sets the active-student limit. In Auto mode, reaching this number can put the TV display at capacity." data-tooltip="Sets the active-student limit. In Auto mode, reaching this number can put the TV display at capacity.">?</span></h3><span class="hint" id="capacity-hint">0 spots available</span></div>
            <div class="two">
              <div class="field">
                <label for="capacity">Cap <span class="tip" tabindex="0" role="note" aria-label="The maximum number of students allowed in the library at one time." data-tooltip="The maximum number of students allowed in the library at one time.">?</span></label>
                <input id="capacity" type="number" min="1" max="500" inputmode="numeric">
              </div>
              <div class="field">
                <div class="fake-label">Auto capacity <span class="tip" tabindex="0" role="note" aria-label="When on, the system changes the TV status to At Capacity when the live count reaches the cap." data-tooltip="When on, the system changes the TV status to At Capacity when the live count reaches the cap.">?</span></div>
                <div class="seg" role="radiogroup" aria-label="Auto capacity">
                  <label><input type="radio" name="auto-capacity" value="true"><span>On</span></label>
                  <label><input type="radio" name="auto-capacity" value="false"><span>Off</span></label>
                </div>
              </div>
            </div>
          </section>

          <section class="group">
            <div class="group-head"><h3>Status <span class="tip" tabindex="0" role="note" aria-label="Controls what the cafeteria TV says: Open, At Capacity, or Closed." data-tooltip="Controls what the cafeteria TV says: Open, At Capacity, or Closed.">?</span></h3><span class="hint" id="status-hint">Auto mode</span></div>
            <div class="field">
              <div class="fake-label">Mode <span class="tip" tabindex="0" role="note" aria-label="Auto follows the live count and capacity. Manual uses the status you choose below." data-tooltip="Auto follows the live count and capacity. Manual uses the status you choose below.">?</span></div>
              <div class="seg" role="radiogroup" aria-label="Status mode">
                <label><input type="radio" name="status-mode" value="auto"><span>Auto</span></label>
                <label><input type="radio" name="status-mode" value="manual"><span>Manual</span></label>
              </div>
            </div>
            <div class="field">
              <div class="fake-label">Manual status <span class="tip" tabindex="0" role="note" aria-label="The TV status used when Mode is set to Manual." data-tooltip="The TV status used when Mode is set to Manual.">?</span></div>
              <div class="seg three" role="radiogroup" aria-label="Manual status">
                <label><input type="radio" name="manual-status" value="open"><span>Open</span></label>
                <label><input type="radio" name="manual-status" value="capacity"><span>Full</span></label>
                <label><input type="radio" name="manual-status" value="closed"><span>Closed</span></label>
              </div>
            </div>
          </section>

          <section class="group">
            <div class="group-head"><h3>Opening countdown <span class="tip" tabindex="0" role="note" aria-label="Schedules a future opening time. The TV display can show a countdown until the library opens." data-tooltip="Schedules a future opening time. The TV display can show a countdown until the library opens.">?</span></h3><span class="hint" id="schedule-hint">No time set</span></div>
            <div class="preset-row">
              <div class="field">
                <label for="preset">Saved time <span class="tip" tabindex="0" role="note" aria-label="Pick a previously saved opening time." data-tooltip="Pick a previously saved opening time.">?</span></label>
                <select id="preset"><option value="">Choose saved time</option></select>
              </div>
              <div class="field">
                <label for="opening-time">Open at <span class="tip" tabindex="0" role="note" aria-label="Set the time the library should reopen today. Use this while the TV says Closed or At Capacity." data-tooltip="Set the time the library should reopen today. Use this while the TV says Closed or At Capacity.">?</span></label>
                <input id="opening-time" type="time">
              </div>
            </div>
            <label class="checkline" for="save-opening-time"><input id="save-opening-time" type="checkbox">Save this time for reuse <span class="tip" tabindex="0" role="note" aria-label="Adds the selected opening time to the saved-time list for future days." data-tooltip="Adds the selected opening time to the saved-time list for future days.">?</span></label>
          </section>

          <section class="group">
            <div class="two-even">
              <div class="field">
                <div class="fake-label">TV count <span class="tip" tabindex="0" role="note" aria-label="Shows or hides the current count on the public TV display. Student names are never shown on the TV." data-tooltip="Shows or hides the current count on the public TV display. Student names are never shown on the TV.">?</span></div>
                <div class="seg" role="radiogroup" aria-label="TV count">
                  <label><input type="radio" name="show-count" value="false"><span>Hide</span></label>
                  <label><input type="radio" name="show-count" value="true"><span>Show</span></label>
                </div>
              </div>
              <div class="field">
                <label for="message">TV message <span class="tip" tabindex="0" role="note" aria-label="Optional public note shown on the TV display, such as testing, lunch only, or see librarian." data-tooltip="Optional public note shown on the TV display, such as testing, lunch only, or see librarian.">?</span></label>
                <textarea id="message" maxlength="180" placeholder="Optional"></textarea>
              </div>
            </div>
          </section>

          <section class="savebar">
            <div class="save-buttons">
              <button id="save" type="button" title="Apply these settings and update the TV display.">Save changes</button>
              <button class="secondary" id="sync" type="button" title="Retry any queued Google Sheets archive events.">Sync Sheets</button>
            </div>
            <div class="notice" id="notice" role="status" aria-live="polite"></div>
          </section>
        </div>
      </aside>
    </main>
  </div>

  <script>
    const $ = (id) => document.getElementById(id);
    const timeFormatter = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' });

    async function api(url, options = {}) {
      const response = await fetch(url, { cache: 'no-store', ...options });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Request failed');
      return body;
    }

    async function post(url, body) {
      return api(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    }

    function checkedValue(name) {
      return document.querySelector('input[name="' + name + '"]:checked')?.value || '';
    }

    function setChecked(name, value) {
      const input = document.querySelector('input[name="' + name + '"][value="' + String(value) + '"]');
      if (input) input.checked = true;
    }

    function setNotice(text, tone = '') {
      $('notice').textContent = text;
      $('notice').dataset.tone = tone;
    }

    function renderPresets(presets, selectedTime) {
      $('preset').innerHTML = '<option value="">Choose saved time</option>' + (presets || [])
        .map((item) => '<option value="' + escapeHtml(item.timeValue) + '">' + escapeHtml(item.label) + '</option>')
        .join('');
      $('preset').value = selectedTime || '';
    }

    function formatScheduled(summary) {
      if (!summary) return 'None';
      return summary.label || 'Scheduled';
    }

    function render(state) {
      const count = Number(state.currentCount || 0);
      const cap = Number(state.capacity || 0);
      const available = Math.max(0, cap - count);
      const scheduledTime = state.scheduledOpen ? state.scheduledOpen.timeValue : '';

      $('current').textContent = count + ' / ' + cap;
      $('capacity-hint').textContent = available === 1 ? '1 spot available' : available + ' spots available';
      $('status').textContent = state.statusLabel;
      $('status-dot').dataset.status = state.status;
      $('mode').textContent = state.statusMode === 'manual' ? 'Manual' : 'Auto';
      $('status-hint').textContent = state.statusMode === 'manual' ? 'Manual override' : 'Auto mode';
      $('scheduled-summary').textContent = formatScheduled(state.scheduledOpen);
      $('schedule-hint').textContent = state.scheduledOpen ? 'TV countdown active' : 'No time set';

      $('capacity').value = state.capacity;
      setChecked('status-mode', state.statusMode);
      setChecked('manual-status', state.manualStatus);
      setChecked('show-count', String(state.showPublicCount !== false));
      setChecked('auto-capacity', String(state.autoCapacityEnabled));
      $('message').value = state.customMessage || '';
      $('opening-time').value = scheduledTime;
      $('save-opening-time').checked = false;
      renderPresets(state.openingTimePresets || [], scheduledTime);

      $('student-count-label').textContent = state.students.length === 1 ? '1 student checked in' : state.students.length + ' students checked in';

      if (!state.students.length) {
        $('students').innerHTML = '<div class="empty">No students are currently checked in.</div>';
        return;
      }

      $('students').innerHTML = state.students.map((item) => {
        const checkedIn = new Date(item.checkedInAt);
        const time = Number.isNaN(checkedIn.getTime()) ? 'Unknown' : timeFormatter.format(checkedIn);
        return '<div class="student-row">' +
          '<div><div class="row-label">Student</div><div class="student-name">' + escapeHtml(item.firstName + ' ' + item.lastName) + '</div><div class="student-id">' + escapeHtml(item.studentId) + '</div></div>' +
          '<div><div class="row-label">Grade</div><div class="cell">' + escapeHtml(item.grade || '') + '</div></div>' +
          '<div><div class="row-label">Reason</div><div class="cell">' + escapeHtml(item.reason) + '</div></div>' +
          '<div><div class="row-label">Time in</div><div class="cell muted">' + time + '</div></div>' +
          '<div><button class="danger small" data-visit="' + item.visitId + '" type="button">Check out</button></div>' +
        '</div>';
      }).join('');
    }

    function escapeHtml(text) {
      return String(text).replace(/[&<>\"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char]));
    }

    async function refresh() {
      try {
        render(await api('/api/library/current'));
      } catch (error) {
        setNotice(error instanceof Error ? error.message : 'Could not refresh.', 'error');
      }
    }

    $('students').addEventListener('click', async (event) => {
      const button = event.target.closest('button[data-visit]');
      if (!button) return;
      button.disabled = true;
      setNotice('Checking out...');
      try {
        await post('/api/library/checkout', { visitId: Number(button.dataset.visit), method: 'librarian' });
        setNotice('Student checked out.', 'success');
        await refresh();
      } catch (error) {
        setNotice(error instanceof Error ? error.message : 'Could not check out student.', 'error');
      } finally {
        button.disabled = false;
      }
    });

    $('clear-all').addEventListener('click', async () => {
      if (!confirm('Clear all current library check-ins?')) return;
      setNotice('Clearing...');
      try {
        const data = await post('/api/library/clear', { method: 'clear_all' });
        setNotice('Cleared ' + data.cleared + ' check-ins.', 'success');
        await refresh();
      } catch (error) {
        setNotice(error instanceof Error ? error.message : 'Could not clear students.', 'error');
      }
    });

    $('refresh').addEventListener('click', refresh);
    $('refresh-list').addEventListener('click', refresh);
    $('preset').addEventListener('change', () => {
      if ($('preset').value) $('opening-time').value = $('preset').value;
    });

    $('save').addEventListener('click', async () => {
      setNotice('Saving...');
      try {
        const data = await post('/api/library/settings', {
          capacity: Number($('capacity').value),
          statusMode: checkedValue('status-mode'),
          manualStatus: checkedValue('manual-status'),
          showPublicCount: checkedValue('show-count') === 'true',
          autoCapacityEnabled: checkedValue('auto-capacity') === 'true',
          customMessage: $('message').value,
          scheduledOpenTime: $('opening-time').value || null,
          saveOpeningTime: $('save-opening-time').checked,
        });
        render(data.state);
        setNotice('Saved. TV updated.', 'success');
      } catch (error) {
        setNotice(error instanceof Error ? error.message : 'Could not save settings.', 'error');
      }
    });

    $('sync').addEventListener('click', async () => {
      setNotice('Syncing...');
      try {
        const data = await post('/api/library/sync-sheets', {});
        setNotice('Sheets sync: ' + data.synced + ' synced, ' + data.failed + ' failed.', 'success');
      } catch (error) {
        setNotice(error instanceof Error ? error.message : 'Could not sync.', 'error');
      }
    });

    refresh();
    setInterval(refresh, 10000);
  </script>
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[char] ?? char));
}

function escapeAttr(value: string): string {
  return escapeHtml(value);
}
