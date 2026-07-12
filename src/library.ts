type LibraryStatus = "open" | "capacity" | "closed";
type StatusMode = "auto" | "manual";
type CheckoutMethod = "scan_out" | "librarian" | "clear_all" | "auto_end_of_day";

type LibraryEnv = Env & {
  SHEETS_WEBHOOK_URL?: string;
  SHEETS_WEBHOOK_SECRET?: string;
};

type KioskDeviceRow = {
  id: number;
  name: string;
  created_at: string;
  last_seen_at: string | null;
  revoked_at: string | null;
};

type KioskPairingRow = {
  id: number;
  expires_at: string;
  used_at: string | null;
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
const GRADE_OPTIONS = ["9", "10", "11", "12"];

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
  async fetch(request, env, ctx): Promise<Response> {
    const url = new URL(request.url);
    let pathname = normalizePath(url.pathname);

    const manageApi = pathname === "/library/manage" ? url.searchParams.get("api") : null;
    if (manageApi && /^[a-z0-9-]+$/.test(manageApi)) {
      pathname = `/api/library/${manageApi}`;
    } else if (pathname.startsWith("/library/manage/api/")) {
      pathname = `/api/library/${pathname.slice("/library/manage/api/".length)}`;
    }

    try {
      if (pathname.startsWith("/api/library/")) {
        const kioskAllowed = pathname === "/api/library/scan" || pathname === "/api/library/checkin" || pathname === "/api/library/checkout" || pathname === "/api/library/create-student" || pathname === "/api/library/kiosk-status";
        const pairingAllowed = pathname === "/api/library/kiosk-enroll";
        const authorized = pairingAllowed || (kioskAllowed ? await isKioskOrStaffAuthorized(request, env) : isStaffAuthorized(request));
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
        if (request.method !== "GET") return methodNotAllowed(["GET"]);
        if (url.searchParams.get("pair") === "1" && !isStaffAuthorized(request)) {
          return json({ error: "Unauthorized." }, 401);
        }
        const pairing = url.searchParams.get("pair") === "1"
          ? await createKioskPairing(request, env)
          : undefined;
        return html(manageHtml(pairing));
      }

      if (pathname === "/api/library/scan") {
        return request.method === "POST" ? handleScan(request, env) : methodNotAllowed(["POST"]);
      }

      if (pathname === "/api/library/checkin") {
        return request.method === "POST" ? handleCheckin(request, env, ctx) : methodNotAllowed(["POST"]);
      }

      if (pathname === "/api/library/checkout") {
        return request.method === "POST" ? handleCheckout(request, env, ctx) : methodNotAllowed(["POST"]);
      }

      if (pathname === "/api/library/create-student") {
        return request.method === "POST" ? handleCreateStudent(request, env, ctx) : methodNotAllowed(["POST"]);
      }

      if (pathname === "/api/library/kiosk-status") {
        return request.method === "GET" ? json({ ok: true, generatedAt: new Date().toISOString() }) : methodNotAllowed(["GET"]);
      }

      if (pathname === "/api/library/kiosk-enroll") {
        return request.method === "POST" ? handleKioskEnrollment(request, env) : methodNotAllowed(["POST"]);
      }

      if (pathname === "/api/library/kiosk-pairing") {
        return request.method === "POST" ? handleCreateKioskPairing(request, env) : methodNotAllowed(["POST"]);
      }

      if (pathname === "/api/library/kiosk-devices") {
        return request.method === "GET" ? handleKioskDevices(env) : methodNotAllowed(["GET"]);
      }

      if (pathname === "/api/library/kiosk-revoke") {
        return request.method === "POST" ? handleKioskRevoke(request, env) : methodNotAllowed(["POST"]);
      }

      if (pathname === "/api/library/clear") {
        return request.method === "POST" ? handleClear(request, env, ctx) : methodNotAllowed(["POST"]);
      }

      if (pathname === "/api/library/current") {
        return request.method === "GET" ? json(await getCurrentState(env, true)) : methodNotAllowed(["GET"]);
      }

      if (pathname === "/api/library/settings") {
        if (request.method === "GET") {
          return json(await getCurrentState(env, true));
        }
        if (request.method === "POST") {
          return handleSettings(request, env, ctx);
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
    return json({ mode: "new_student", barcode, grades: GRADE_OPTIONS, reasons: REASONS, state: await getCurrentState(env, false) });
  }

  const activeVisit = await findActiveVisitForStudent(env, student.id);
  const state = await getCurrentState(env, false);
  const warning = state.status === "closed"
    ? "The library is marked closed. Your visit can still be recorded."
    : undefined;

  if (activeVisit) {
    return json({ mode: "checkout", student: publicStudent(student), visit: visitPayload(activeVisit), state, warning });
  }

  if (state.status === "capacity") {
    return json({
      mode: "capacity",
      student: publicStudent(student),
      state,
      error: "The library is currently at capacity.",
    }, 409);
  }

  return json({ mode: "checkin", student: publicStudent(student), reasons: REASONS, state, warning });
}

async function handleCheckin(request: Request, env: LibraryEnv, ctx: ExecutionContext): Promise<Response> {
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

  await queueSheetEvent(env, ctx, {
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

  await safeSyncSignageStatus(env, "Library check-in system");

  return json({
    ok: true,
    visit: visitPayload(visit),
    warning: stateBefore.status === "closed"
      ? "The library is marked closed. Your check-in was still recorded."
      : undefined,
    state: await getCurrentState(env, true),
  });
}

async function handleCheckout(request: Request, env: LibraryEnv, ctx: ExecutionContext): Promise<Response> {
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
  await safeSyncSignageStatus(env, actor);

  if (updatedVisit) {
    await queueSheetEvent(env, ctx, sheetCheckoutPayload("SIGN_OUT", updatedVisit, checkoutMethod, actor, now));
  }

  return json({ ok: true, visit: updatedVisit ? visitPayload(updatedVisit) : null, state: await getCurrentState(env, true) });
}

async function handleClear(request: Request, env: LibraryEnv, ctx: ExecutionContext): Promise<Response> {
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
    await queueSheetEvent(env, ctx, sheetCheckoutPayload(method === "auto_end_of_day" ? "AUTO_CLEAR" : "CLEAR_ALL", { ...visit, checked_out_at: now, checkout_method: method }, method, actor, now));
  }

  await safeSyncSignageStatus(env, actor);
  return json({ ok: true, cleared: active.length, state: await getCurrentState(env, true) });
}

async function handleSettings(request: Request, env: LibraryEnv, ctx: ExecutionContext): Promise<Response> {
  const body = await readJsonBody(request);
  if (!isRecord(body)) return json({ error: "Invalid request body." }, 400);

  const current = await getSettings(env);
  const statusMode = body.statusMode === "manual" ? "manual" : body.statusMode === "auto" ? "auto" : current.status_mode;
  const manualStatus = isLibraryStatus(body.manualStatus) ? body.manualStatus : current.manual_status;
  const capacity = normalizeCapacity(body.capacity, current.capacity);
  const customMessage = typeof body.customMessage === "string" ? normalizeMessage(body.customMessage, 180) : current.custom_message ?? "";
  // v29: TV count is always shown and automatic capacity behavior is always enabled.
  // Keep the database fields for compatibility, but stop exposing them as settings.
  const showPublicCount = 1;
  const autoCapacityEnabled = 1;
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

  await queueSheetEvent(env, ctx, {
    event: "SETTINGS_CHANGED",
    timestamp: now,
    actor,
    reason: `mode=${statusMode}; manual=${manualStatus}; capacity=${capacity}; opens=${scheduledOpen?.label ?? "none"}`,
  });

  await safeSyncSignageStatus(env, actor);
  return json({ ok: true, state: await getCurrentState(env, true) });
}

async function handleCreateStudent(request: Request, env: LibraryEnv, ctx: ExecutionContext): Promise<Response> {
  const body = await readJsonBody(request);
  if (!isRecord(body)) return json({ error: "Invalid request body." }, 400);

  const barcode = normalizeBarcode(body.barcode);
  const firstName = normalizeString(body.firstName ?? body.first_name, 80);
  const lastName = normalizeString(body.lastName ?? body.last_name, 80);
  const grade = normalizeString(body.grade, 16);

  if (!barcode) return json({ error: "Scan a student ID first." }, 400);
  if (!firstName || !lastName) return json({ error: "Enter first and last name." }, 400);
  if (!GRADE_OPTIONS.includes(grade)) return json({ error: "Choose a grade." }, 400);

  const now = new Date().toISOString();
  const actor = getActor(request);

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
  ).bind(barcode, barcode, firstName, lastName, grade, now).run();

  const student = await findStudentByBarcode(env, barcode);
  if (!student) return json({ error: "Student could not be saved." }, 500);

  await queueSheetEvent(env, ctx, {
    event: "STUDENT_CREATED",
    timestamp: now,
    studentId: student.student_id,
    firstName: student.first_name,
    lastName: student.last_name,
    grade: student.grade,
    reason: "Created from kiosk after unknown barcode scan",
    actor,
  });

  return json({ ok: true, mode: "checkin", student: publicStudent(student), reasons: REASONS, state: await getCurrentState(env, false) });
}

async function handleCreateKioskPairing(request: Request, env: LibraryEnv): Promise<Response> {
  return json(await createKioskPairing(request, env));
}

async function createKioskPairing(request: Request, env: LibraryEnv): Promise<{ pin: string; expiresAt: string }> {
  await ensureKioskPairingTables(env);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 10 * 60 * 1000).toISOString();
  const pin = randomDigits(8);
  const pinHash = await sha256Hex(pin);

  await env.SIGNAGE_DB.batch([
    env.SIGNAGE_DB.prepare(
      "UPDATE library_kiosk_pairing_codes SET used_at = ? WHERE used_at IS NULL"
    ).bind(now.toISOString()),
    env.SIGNAGE_DB.prepare(
      `INSERT INTO library_kiosk_pairing_codes (pin_hash, expires_at, created_at, created_by)
       VALUES (?, ?, ?, ?)`
    ).bind(pinHash, expiresAt, now.toISOString(), getActor(request)),
  ]);

  return { pin, expiresAt };
}

async function handleKioskEnrollment(request: Request, env: LibraryEnv): Promise<Response> {
  await ensureKioskPairingTables(env);
  const rateLimitKey = request.headers.get("CF-Connecting-IP")?.trim() || "unknown";
  if (env.KIOSK_ENROLL_RATE_LIMITER) {
    const result = await env.KIOSK_ENROLL_RATE_LIMITER.limit({ key: `kiosk-enroll:${rateLimitKey}` });
    if (!result.success) return json({ error: "Too many pairing attempts. Wait a minute and try again." }, 429);
  }

  const body = await readJsonBody(request);
  if (!isRecord(body)) return json({ error: "Invalid request body." }, 400);

  const pin = typeof body.pin === "string" ? body.pin.replace(/\D/g, "").slice(0, 8) : "";
  const name = normalizeString(body.name, 80) || "Library Chromebook";
  if (!/^\d{8}$/.test(pin)) return json({ error: "Enter the 8-digit pairing PIN." }, 400);

  const pinHash = await sha256Hex(pin);
  const now = new Date().toISOString();
  const pairing = await env.SIGNAGE_DB.prepare(
    `SELECT id, expires_at, used_at
     FROM library_kiosk_pairing_codes
     WHERE pin_hash = ? AND used_at IS NULL AND expires_at > ?`
  ).bind(pinHash, now).first<KioskPairingRow>();
  if (!pairing) return json({ error: "That pairing PIN is invalid or expired." }, 401);

  const claimed = await env.SIGNAGE_DB.prepare(
    "UPDATE library_kiosk_pairing_codes SET used_at = ? WHERE id = ? AND used_at IS NULL"
  ).bind(now, pairing.id).run();
  if ((claimed.meta.changes ?? 0) !== 1) return json({ error: "That pairing PIN has already been used." }, 409);

  const token = randomToken(32);
  const tokenHash = await sha256Hex(token);
  const inserted = await env.SIGNAGE_DB.prepare(
    `INSERT INTO library_kiosk_devices (name, token_hash, created_at, last_seen_at)
     VALUES (?, ?, ?, ?)`
  ).bind(name, tokenHash, now, now).run();

  return json({
    token,
    device: { id: Number(inserted.meta.last_row_id), name },
  });
}

async function ensureKioskPairingTables(env: LibraryEnv): Promise<void> {
  await env.SIGNAGE_DB.batch([
    env.SIGNAGE_DB.prepare(
      `CREATE TABLE IF NOT EXISTS library_kiosk_pairing_codes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pin_hash TEXT NOT NULL UNIQUE,
        expires_at TEXT NOT NULL,
        used_at TEXT,
        created_at TEXT NOT NULL,
        created_by TEXT NOT NULL
      )`
    ),
    env.SIGNAGE_DB.prepare(
      "CREATE INDEX IF NOT EXISTS idx_library_kiosk_pairing_active ON library_kiosk_pairing_codes(expires_at, used_at)"
    ),
    env.SIGNAGE_DB.prepare(
      `CREATE TABLE IF NOT EXISTS library_kiosk_devices (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        token_hash TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL,
        last_seen_at TEXT,
        revoked_at TEXT
      )`
    ),
    env.SIGNAGE_DB.prepare(
      "CREATE INDEX IF NOT EXISTS idx_library_kiosk_devices_active ON library_kiosk_devices(revoked_at, last_seen_at)"
    ),
  ]);
}

async function handleKioskDevices(env: LibraryEnv): Promise<Response> {
  const result = await env.SIGNAGE_DB.prepare(
    `SELECT id, name, created_at, last_seen_at, revoked_at
     FROM library_kiosk_devices
     ORDER BY created_at DESC`
  ).all<KioskDeviceRow>();
  return json({ devices: result.results.map(publicKioskDevice) });
}

async function handleKioskRevoke(request: Request, env: LibraryEnv): Promise<Response> {
  const body = await readJsonBody(request);
  if (!isRecord(body)) return json({ error: "Invalid request body." }, 400);
  const deviceId = Number(body.deviceId);
  if (!Number.isInteger(deviceId) || deviceId < 1) return json({ error: "Invalid kiosk device." }, 400);

  const result = await env.SIGNAGE_DB.prepare(
    "UPDATE library_kiosk_devices SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL"
  ).bind(new Date().toISOString(), deviceId).run();
  if ((result.meta.changes ?? 0) !== 1) return json({ error: "Kiosk device was not found or is already revoked." }, 404);
  return json({ ok: true });
}

function publicKioskDevice(row: KioskDeviceRow) {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    lastSeenAt: row.last_seen_at,
    revokedAt: row.revoked_at,
  };
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
    showPublicCount: true,
    autoCapacityEnabled: true,
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
    currentCount: state.currentCount,
    capacity: state.capacity,
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

async function safeSyncSignageStatus(env: LibraryEnv, actor: string): Promise<void> {
  try {
    await syncSignageStatus(env, actor);
  } catch (error) {
    console.error(JSON.stringify({
      event: "library_signage_sync_failed",
      actor,
      error: error instanceof Error ? error.message : String(error),
    }));
  }
}

function resolveEffectiveLibraryStatus(settings: SettingsRow, currentCount: number): LibraryStatus {
  if (settings.status_mode === "manual") {
    return isLibraryStatus(settings.manual_status) ? settings.manual_status : "closed";
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

async function queueSheetEvent(env: LibraryEnv, ctx: ExecutionContext, payload: SheetEventPayload): Promise<void> {
  const payloadJson = JSON.stringify(payload);
  try {
    const result = await env.SIGNAGE_DB.prepare(
      `INSERT INTO library_sheet_events (event_type, payload_json, created_at)
       VALUES (?, ?, ?)`
    ).bind(payload.event, payloadJson, new Date().toISOString()).run();

    const eventId = Number(result.meta.last_row_id);
    ctx.waitUntil(sendSheetEvent(env, eventId, payloadJson));
  } catch (error) {
    console.error(JSON.stringify({
      event: "library_sheet_queue_failed",
      eventType: payload.event,
      error: error instanceof Error ? error.message : String(error),
    }));
  }
}

async function sendSheetEvent(env: LibraryEnv, eventId: number, payloadJson: string): Promise<boolean> {
  if (!env.SHEETS_WEBHOOK_URL || !env.SHEETS_WEBHOOK_SECRET) {
    return false;
  }

  try {
    const response = await fetch(env.SHEETS_WEBHOOK_URL, {
      method: "POST",
      signal: AbortSignal.timeout(5000),
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
    console.error(JSON.stringify({
      event: "library_sheet_sync_failed",
      eventId,
      error: error instanceof Error ? error.message : String(error),
    }));
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
      `CREATE TABLE IF NOT EXISTS library_kiosk_pairing_codes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pin_hash TEXT NOT NULL UNIQUE,
        expires_at TEXT NOT NULL,
        used_at TEXT,
        created_at TEXT NOT NULL,
        created_by TEXT NOT NULL
      )`
    ),
    env.SIGNAGE_DB.prepare(
      `CREATE INDEX IF NOT EXISTS idx_library_kiosk_pairing_active
       ON library_kiosk_pairing_codes(expires_at, used_at)`
    ),
    env.SIGNAGE_DB.prepare(
      `CREATE TABLE IF NOT EXISTS library_kiosk_devices (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        token_hash TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL,
        last_seen_at TEXT,
        revoked_at TEXT
      )`
    ),
    env.SIGNAGE_DB.prepare(
      `CREATE INDEX IF NOT EXISTS idx_library_kiosk_devices_active
       ON library_kiosk_devices(revoked_at, last_seen_at)`
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

function isStaffAuthorized(request: Request): boolean {
  if (isLocalRequest(request)) return true;
  const accessUser = request.headers.get("CF-Access-Authenticated-User-Email")?.trim();
  const accessJwt = request.headers.get("Cf-Access-Jwt-Assertion")?.trim();
  return Boolean(accessUser && accessJwt);
}

async function isKioskOrStaffAuthorized(request: Request, env: LibraryEnv): Promise<boolean> {
  const token = request.headers.get("X-Kiosk-Token")?.trim();
  if (!token) return isStaffAuthorized(request);

  const tokenHash = await sha256Hex(token);
  const device = await env.SIGNAGE_DB.prepare(
    `SELECT id, name, created_at, last_seen_at, revoked_at
     FROM library_kiosk_devices
     WHERE token_hash = ? AND revoked_at IS NULL`
  ).bind(tokenHash).first<KioskDeviceRow>();
  if (!device) return false;

  const now = new Date();
  const lastSeen = device.last_seen_at ? new Date(device.last_seen_at).getTime() : 0;
  if (!lastSeen || now.getTime() - lastSeen > 5 * 60 * 1000) {
    await env.SIGNAGE_DB.prepare(
      "UPDATE library_kiosk_devices SET last_seen_at = ? WHERE id = ?"
    ).bind(now.toISOString(), device.id).run();
  }
  return true;
}

function isLocalRequest(request: Request): boolean {
  const hostname = new URL(request.url).hostname;
  return !request.headers.get("CF-Ray") || hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function randomDigits(length: number): string {
  const values = new Uint32Array(length);
  crypto.getRandomValues(values);
  return Array.from(values, (value) => String(value % 10)).join("");
}

function randomToken(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
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
      transition: background-color 260ms ease, color 260ms ease;
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

    body[data-step="success"] .scan-status {
      width: clamp(78px, 11vh, 108px);
      min-height: clamp(78px, 11vh, 108px);
      margin-top: clamp(18px, 3vh, 28px);
      padding: 0;
      border-radius: 999px;
      background: #fff;
      border-color: rgba(17, 107, 67, 0.22);
      box-shadow: 0 22px 64px rgba(17, 107, 67, 0.16);
      display: grid;
      place-items: center;
      align-content: center;
      justify-content: center;
      gap: 0;
      animation: successPop 380ms cubic-bezier(.2, .9, .2, 1.18) both;
    }

    body[data-step="success"] .scan-status > div:last-child {
      display: none;
    }

    body[data-step="success"] .scan-symbol {
      width: clamp(50px, 7vh, 68px);
      height: clamp(50px, 7vh, 68px);
      margin: 0;
      border-radius: 999px;
      background: currentColor;
      color: var(--green);
      border: 0;
      display: grid;
      place-items: center;
      transform-origin: center;
      animation: checkLift 520ms ease-out both;
    }

    body[data-step="success"] .scan-symbol svg {
      display: block;
      color: #fff;
      width: 58%;
      height: 58%;
      transform-origin: center;
      transform-box: fill-box;
      animation: checkMark 460ms ease-out 80ms both;
    }

    body[data-step="success"] h1,
    body[data-step="success"] .lead {
      animation: successText 260ms ease-out both;
    }

    @keyframes successPop {
      0% { opacity: 0; transform: scale(.82) translateY(5px); }
      70% { opacity: 1; transform: scale(1.05) translateY(0); }
      100% { opacity: 1; transform: scale(1) translateY(0); }
    }

    @keyframes checkLift {
      0% { transform: scale(.86); }
      60% { transform: scale(1.08); }
      100% { transform: scale(1); }
    }

    @keyframes checkMark {
      0% { opacity: 0; transform: scale(.72) rotate(-6deg); }
      100% { opacity: 1; transform: scale(1) rotate(0); }
    }

    @keyframes successText {
      from { opacity: 0; transform: translateY(4px); }
      to { opacity: 1; transform: translateY(0); }
    }

    /* v26 kiosk motion polish */
    body[data-step="idle"][data-tone="idle"] .scan-status {
      animation: idleBreath 3.8s ease-in-out infinite;
    }

    body[data-step="idle"][data-tone="idle"] .scan-symbol {
      animation: idleIconBreath 3.8s ease-in-out infinite;
    }

    body[data-scan-flash="true"] .scan-status {
      border-color: rgba(116, 31, 39, 0.42);
      box-shadow: 0 20px 58px rgba(116, 31, 39, 0.16);
      animation: scanCapture 280ms ease-out both;
    }

    body[data-scan-flash="true"] .scan-symbol {
      background: rgba(116, 31, 39, 0.08);
      animation: scanIconCapture 300ms ease-out both;
    }

    body[data-scan-flash="true"] .scan-symbol::before {
      content: "";
      position: absolute;
      inset: -20%;
      background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,.2) 42%, rgba(116,31,39,.22) 50%, rgba(255,255,255,.2) 58%, transparent 100%);
      transform: translateX(-80%);
      animation: captureSweep 280ms ease-out both;
      pointer-events: none;
    }

    body[data-step="reasons"] .reason {
      position: relative;
      overflow: hidden;
      animation: reasonIn 280ms cubic-bezier(.2, .85, .25, 1) both;
      transition: transform 120ms ease, background 140ms ease, border-color 140ms ease, color 140ms ease, opacity 140ms ease, box-shadow 140ms ease;
    }

    body[data-step="reasons"] .reason:nth-child(1) { animation-delay: 0ms; }
    body[data-step="reasons"] .reason:nth-child(2) { animation-delay: 38ms; }
    body[data-step="reasons"] .reason:nth-child(3) { animation-delay: 76ms; }
    body[data-step="reasons"] .reason:nth-child(4) { animation-delay: 114ms; }
    body[data-step="reasons"] .reason:nth-child(5) { animation-delay: 152ms; }
    body[data-step="reasons"] .reason:nth-child(6) { animation-delay: 190ms; }

    .reason.selected {
      background: var(--green-soft);
      border-color: rgba(17, 107, 67, 0.38);
      color: var(--green);
      box-shadow: 0 14px 34px rgba(17, 107, 67, 0.13);
      transform: scale(.985);
    }

    .reason.selected::after {
      content: "✓";
      position: absolute;
      right: 18px;
      top: 50%;
      width: 30px;
      height: 30px;
      margin-top: -15px;
      border-radius: 999px;
      background: var(--green);
      color: #fff;
      display: grid;
      place-items: center;
      font: 850 17px/1 var(--font-display);
      animation: selectedCheck 180ms ease-out both;
    }

    .reason-grid[data-selecting="true"] .reason:not(.selected) {
      opacity: .48;
      transform: scale(.985);
    }

    body[data-step="new-student"] .student-form {
      animation: formRise 260ms cubic-bezier(.2, .85, .25, 1) both;
    }

    body[data-step="new-student"] .student-form-field,
    body[data-step="new-student"] .student-form-actions {
      animation: fieldIn 240ms ease-out both;
    }

    body[data-step="new-student"] .student-form-field:nth-child(1) { animation-delay: 40ms; }
    body[data-step="new-student"] .student-form-field:nth-child(2) { animation-delay: 75ms; }
    body[data-step="new-student"] .student-form-field:nth-child(3) { animation-delay: 110ms; }
    body[data-step="new-student"] .student-form-actions { animation-delay: 145ms; }

    .student-form-field {
      transition: transform 140ms ease;
    }

    .student-form-field:focus-within {
      transform: translateY(-1px);
    }

    .student-form-field:focus-within label {
      color: var(--maroon);
    }

    .student-form input,
    .student-form select {
      transition: border-color 140ms ease, box-shadow 140ms ease, transform 140ms ease, background-color 140ms ease;
    }

    .student-form input:focus,
    .student-form select:focus {
      box-shadow: 0 12px 32px rgba(116, 31, 39, 0.10);
      background: #fffafa;
    }

    .student-form button[type="submit"] {
      transition: transform 110ms ease, box-shadow 140ms ease, background-color 140ms ease;
      box-shadow: 0 14px 34px rgba(116, 31, 39, 0.16);
    }

    .student-form button[type="submit"]:active {
      transform: scale(.99);
    }

    body[data-step="success"] h1 {
      animation: successText 260ms ease-out 80ms both;
    }

    body[data-step="success"] .lead {
      animation: successText 260ms ease-out 150ms both;
    }

    body[data-success-type="checkout"] .scan-status {
      animation: checkoutPop 420ms cubic-bezier(.2, .86, .18, 1.16) both;
    }

    body[data-success-type="checkout"] .scan-symbol {
      animation: checkoutLift 520ms ease-out both;
    }

    @keyframes idleBreath {
      0%, 100% { transform: translateY(0); box-shadow: 0 18px 50px rgba(30, 24, 20, 0.07); }
      50% { transform: translateY(-1px); box-shadow: 0 22px 56px rgba(116, 31, 39, 0.10); }
    }

    @keyframes idleIconBreath {
      0%, 100% { transform: scale(1); opacity: 1; }
      50% { transform: scale(1.025); opacity: .96; }
    }

    @keyframes scanCapture {
      0% { transform: scale(1); }
      45% { transform: scale(.985); }
      100% { transform: scale(1); }
    }

    @keyframes scanIconCapture {
      0% { transform: scale(1); }
      55% { transform: scale(1.08); }
      100% { transform: scale(1); }
    }

    @keyframes captureSweep {
      from { transform: translateX(-80%); opacity: 0; }
      28% { opacity: 1; }
      to { transform: translateX(80%); opacity: 0; }
    }

    @keyframes reasonIn {
      from { opacity: 0; transform: translateY(9px) scale(.985); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }

    @keyframes selectedCheck {
      from { opacity: 0; transform: scale(.72); }
      to { opacity: 1; transform: scale(1); }
    }

    @keyframes formRise {
      from { opacity: 0; transform: translateY(10px) scale(.99); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }

    @keyframes fieldIn {
      from { opacity: 0; transform: translateY(6px); }
      to { opacity: 1; transform: translateY(0); }
    }

    @keyframes checkoutPop {
      0% { opacity: 0; transform: translateY(-4px) scale(.84); }
      70% { opacity: 1; transform: translateY(1px) scale(1.04); }
      100% { opacity: 1; transform: translateY(0) scale(1); }
    }

    @keyframes checkoutLift {
      0% { transform: translateY(4px) scale(.86); }
      60% { transform: translateY(-2px) scale(1.07); }
      100% { transform: translateY(0) scale(1); }
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

    body[data-step="reasons"] .scan-status,
    body[data-step="new-student"] .scan-status,
    body[data-step="pairing"] .scan-status {
      display: none;
    }

    body[data-step="reasons"] .reason-grid { display: grid; }

    .student-form {
      display: none;
      width: min(640px, 100%);
      margin-top: clamp(18px, 3vh, 28px);
      gap: clamp(12px, 2vh, 16px);
      text-align: left;
    }

    body[data-step="new-student"] .student-form { display: grid; }

    .pairing-form {
      display: none;
      width: min(520px, 100%);
      margin-top: clamp(18px, 3vh, 28px);
      gap: 14px;
      text-align: left;
    }

    body[data-step="pairing"] .pairing-form { display: grid; }

    .pairing-form label {
      color: var(--muted);
      font-size: 13px;
      font-weight: 760;
      letter-spacing: .055em;
      text-transform: uppercase;
    }

    .pairing-form input {
      width: 100%;
      min-height: 64px;
      border: 1px solid var(--line);
      border-radius: 16px;
      background: #fff;
      color: var(--ink);
      padding: 0 16px;
      font: 750 30px/1 var(--font-display);
      letter-spacing: .16em;
      text-align: center;
    }

    .pairing-form input:focus-visible {
      outline: 4px solid var(--focus);
      outline-offset: 2px;
      border-color: transparent;
    }

    .pairing-form button {
      min-height: 58px;
      border: 0;
      border-radius: 18px;
      background: var(--maroon);
      color: #fff;
      font: 750 21px/1 var(--font-display);
      cursor: pointer;
    }

    .pairing-error {
      min-height: 20px;
      color: var(--red);
      font-size: 15px;
      font-weight: 650;
      text-align: center;
    }

    .student-form-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
    }

    .student-form-field {
      display: grid;
      gap: 7px;
    }

    .student-form-field.full { grid-column: 1 / -1; }

    .student-form label {
      color: var(--muted);
      font-size: 13px;
      font-weight: 760;
      letter-spacing: .055em;
      text-transform: uppercase;
    }

    .student-form input,
    .student-form select {
      width: 100%;
      min-height: 54px;
      border: 1px solid var(--line);
      border-radius: 16px;
      background: #fff;
      color: var(--ink);
      padding: 0 16px;
      font: 650 22px/1 var(--font-display);
      letter-spacing: -0.015em;
    }

    .student-form input:focus-visible,
    .student-form select:focus-visible {
      outline: 4px solid var(--focus);
      outline-offset: 2px;
      border-color: transparent;
    }

    .student-form-actions {
      display: grid;
      grid-template-columns: 1fr;
      gap: 10px;
    }

    .student-form button[type="submit"] {
      min-height: 58px;
      border: 0;
      border-radius: 18px;
      background: var(--maroon);
      color: #fff;
      font: 750 21px/1 var(--font-display);
      letter-spacing: -0.012em;
      cursor: pointer;
      touch-action: manipulation;
    }

    .student-form button[type="submit"]:focus-visible {
      outline: 4px solid var(--focus);
      outline-offset: 2px;
    }

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

    body[data-step="reasons"] .cancel,
    body[data-step="new-student"] .cancel {
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
      .student-form-grid { grid-template-columns: 1fr; }
      .student-form input,
      .student-form select { min-height: 48px; font-size: 19px; }
    }







    /* Keep the status cards and roster together in the full-height left column. */
    .app {
      height: 100vh;
      height: 100dvh;
      min-height: 0;
      grid-template-rows: 58px minmax(0, 1fr);
      overflow: hidden;
    }

    .workspace {
      min-height: 0;
      height: 100%;
      display: grid;
      grid-template-columns: minmax(0, 1fr) 390px;
      gap: 14px;
      align-items: stretch;
      overflow: hidden;
    }

    .roster-stack {
      min-height: 0;
      height: 100%;
      display: grid;
      grid-template-rows: auto minmax(0, 1fr);
      gap: 14px;
      overflow: hidden;
    }

    .roster-stack > .statusbar {
      width: 100%;
      min-height: 98px;
      height: auto;
      max-height: none;
      display: grid;
      grid-template-columns: minmax(0, 1.14fr) minmax(0, 1fr) minmax(0, 1.04fr);
      overflow: visible;
    }

    .roster-stack > .statusbar .stat {
      min-height: 0;
      padding: 16px 18px 15px;
      gap: 8px;
      align-content: center;
      overflow: visible;
    }

    .roster-stack > .statusbar .value,
    .roster-stack > .statusbar .primary-stat .value {
      line-height: 1.15;
      overflow: visible;
    }

    .roster-stack > .statusbar .capacity-meter {
      margin-top: 4px;
    }

    .roster-panel {
      min-height: 0;
      height: 100%;
      overflow: hidden;
    }

    .roster-panel > div:last-child {
      min-height: 0;
      overflow: hidden;
    }

    .roster-panel .student-list {
      min-height: 0;
      height: calc(100% - 36px);
      overflow: auto;
    }

    .settings-panel {
      min-height: 0;
      height: 100%;
      align-self: stretch;
      overflow: hidden;
    }

    .settings-panel .control-body {
      min-height: 0;
      overflow-y: auto;
      overflow-x: hidden;
      padding-bottom: 18px;
    }

    .settings-panel .savebar {
      flex: 0 0 auto;
    }

    @media (max-height: 740px) and (min-width: 981px) {
      .app {
        grid-template-rows: 52px minmax(0, 1fr);
        gap: 12px;
      }

      .workspace,
      .roster-stack {
        gap: 12px;
      }

      .roster-stack > .statusbar {
        min-height: 88px;
      }

      .roster-stack > .statusbar .stat {
        padding: 13px 16px 12px;
        gap: 6px;
      }

      .roster-stack > .statusbar .value {
        font-size: clamp(19px, 1.8vw, 24px);
        line-height: 1.14;
      }

      .roster-stack > .statusbar .primary-stat .value {
        font-size: clamp(23px, 2.15vw, 28px);
      }
    }

    @media (max-width: 980px) {
      .app {
        height: auto;
        min-height: 100vh;
        overflow: auto;
        grid-template-rows: auto auto;
      }

      .workspace {
        height: auto;
        overflow: visible;
        grid-template-columns: 1fr;
      }

      .roster-stack {
        height: auto;
        overflow: visible;
        grid-template-rows: auto auto;
      }

      .roster-stack > .statusbar {
        grid-template-columns: 1fr;
        min-height: 0;
      }

      .settings-panel {
        height: auto;
        overflow: visible;
      }
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
        <h1 id="headline">Scan your student ID.</h1>
        <p class="lead" id="lead">Check in or check out.</p>

        <div class="scan-status" id="scan-status">
          <div class="scan-symbol" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
              <path d="M4 7V5a1 1 0 0 1 1-1h2"/><path d="M17 4h2a1 1 0 0 1 1 1v2"/>
              <path d="M20 17v2a1 1 0 0 1-1 1h-2"/><path d="M7 20H5a1 1 0 0 1-1-1v-2"/>
              <path d="M7 9h10"/><path d="M7 12h10"/><path d="M7 15h6"/>
            </svg>
          </div>
          <div>
            <div class="status-title" id="status-title">Ready to scan</div>
            <div class="status-detail" id="status-detail">Hold the barcode up to the scanner.</div>
          </div>
        </div>

        <div class="reason-grid" id="reasons">${reasons}</div>
        <form class="student-form" id="student-form">
          <div class="student-form-grid">
            <div class="student-form-field">
              <label for="new-first-name">First name</label>
              <input id="new-first-name" name="firstName" autocomplete="given-name" required>
            </div>
            <div class="student-form-field">
              <label for="new-last-name">Last name</label>
              <input id="new-last-name" name="lastName" autocomplete="family-name" required>
            </div>
            <div class="student-form-field full">
              <label for="new-grade">Grade</label>
              <select id="new-grade" name="grade" required>
                <option value="">Choose grade</option>
                <option value="9">9th grade</option>
                <option value="10">10th grade</option>
                <option value="11">11th grade</option>
                <option value="12">12th grade</option>
              </select>
            </div>
          </div>
          <div class="student-form-actions">
            <button type="submit">Continue</button>
          </div>
        </form>
        <form class="pairing-form" id="pairing-form">
          <label for="pairing-pin">Pairing PIN</label>
          <input id="pairing-pin" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{8}" maxlength="8" placeholder="00000000" required>
          <button type="submit">Pair this Chromebook</button>
          <div class="pairing-error" id="pairing-error" role="alert"></div>
        </form>
        <button class="cancel" id="cancel" type="button">Cancel</button>
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
    const studentForm = document.getElementById('student-form');
    const pairingForm = document.getElementById('pairing-form');
    const pairingPin = document.getElementById('pairing-pin');
    const pairingError = document.getElementById('pairing-error');
    const newFirstName = document.getElementById('new-first-name');
    const newLastName = document.getElementById('new-last-name');
    const newGrade = document.getElementById('new-grade');

    let currentBarcode = '';
    let currentFirstName = '';
    let currentCheckinWarning = '';
    let keyBuffer = '';
    let keyTimer = null;
    let resetTimer = null;
    let workingTimer = null;
    let reasonTimer = null;
    let connectivityTimer = null;
    let busy = false;
    let checkingConnection = false;

    if (location.hostname === 'localhost' || location.search.includes('dev=1')) {
      document.body.dataset.dev = 'true';
    }

    function authHeaders() {
      const token = localStorage.getItem('libraryKioskToken');
      return token ? { 'X-Kiosk-Token': token } : {};
    }

    async function post(url, body) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders() },
          body: JSON.stringify(body),
          cache: 'no-store',
          signal: controller.signal,
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          if (response.status === 401 && url !== '/api/library/kiosk-enroll') {
            localStorage.removeItem('libraryKioskToken');
          }
          throw new Error(data.error || 'Request failed');
        }
        return data;
      } catch (error) {
        if (!navigator.onLine) throw new Error('Network connection lost.');
        if (error && error.name === 'AbortError') throw new Error('The request timed out. Try again.');
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
      clearTimeout(connectivityTimer);
    }

    function sleep(ms) {
      return new Promise((resolve) => setTimeout(resolve, ms));
    }

    function resetReasonButtons() {
      const grid = document.getElementById('reasons');
      if (grid) delete grid.dataset.selecting;
      document.querySelectorAll('.reason.selected').forEach((button) => button.classList.remove('selected'));
    }

    function markReasonSelected(button) {
      resetReasonButtons();
      const grid = document.getElementById('reasons');
      if (grid) grid.dataset.selecting = 'true';
      button.classList.add('selected');
    }

    function flashScanAccepted() {
      delete document.body.dataset.scanFlash;
      void document.body.offsetWidth;
      document.body.dataset.scanFlash = 'true';
      setTimeout(() => {
        if (document.body.dataset.scanFlash === 'true') delete document.body.dataset.scanFlash;
      }, 340);
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
      if (!localStorage.getItem('libraryKioskToken') && location.hostname !== 'localhost') {
        showPairing();
        return;
      }
      clearTimers();
      busy = false;
      currentBarcode = '';
      currentFirstName = '';
      keyBuffer = '';
      scanInput.value = '';
      if (studentForm) studentForm.reset();
      delete document.body.dataset.successType;
      delete document.body.dataset.scanFlash;
      resetReasonButtons();
      setStep('idle');
      setTone('idle');
      setCopy({
        eyebrow: 'Library Check-In',
        headline: 'Scan your student ID.',
        lead: 'Check in or check out.',
        statusTitle: 'Ready to scan',
        statusDetail: 'Hold the barcode up to the scanner.',
        hint: 'Need help? See the librarian.',
        footerStatus: 'Ready',
      });
      focusScanner();
    }

    function showPairing(message = '') {
      clearTimers();
      busy = false;
      setStep('pairing');
      setTone('idle');
      pairingError.textContent = message;
      setCopy({
        eyebrow: 'Kiosk Setup',
        headline: 'Pair this Chromebook',
        lead: 'Ask the librarian for a pairing PIN.',
        statusTitle: '',
        statusDetail: '',
        hint: 'The PIN expires after 10 minutes.',
        footerStatus: 'Setup',
      });
      requestAnimationFrame(() => pairingPin.focus({ preventScroll: true }));
    }

    function showOffline(message = 'Check the Chromebook Wi-Fi connection.') {
      clearTimers();
      busy = true;
      setStep('idle');
      setTone('error');
      setCopy({
        eyebrow: 'Connection Problem',
        headline: 'Kiosk offline',
        lead: message,
        statusTitle: 'Trying again',
        statusDetail: 'The kiosk will reconnect automatically.',
        hint: 'Check Wi-Fi if this message does not clear.',
        footerStatus: 'Offline',
      });
      connectivityTimer = setTimeout(verifyKioskConnection, 5000);
    }

    async function verifyKioskConnection() {
      if (checkingConnection) return;
      if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
        showIdle();
        return;
      }
      if (!localStorage.getItem('libraryKioskToken')) {
        showPairing();
        return;
      }

      checkingConnection = true;
      busy = true;
      footerStatus.textContent = 'Connecting';
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      try {
        const response = await fetch('/api/library/kiosk-status', {
          cache: 'no-store',
          headers: authHeaders(),
          signal: controller.signal,
        });
        if (response.status === 401) {
          localStorage.removeItem('libraryKioskToken');
          showPairing('This Chromebook needs to be paired again.');
          return;
        }
        if (!response.ok) throw new Error('Kiosk service is unavailable.');
        const data = await response.json().catch(() => null);
        if (!data || data.ok !== true) throw new Error('Kiosk authentication could not be verified.');
        showIdle();
      } catch (error) {
        showOffline(!navigator.onLine ? 'Check the Chromebook Wi-Fi connection.' : 'The library service is temporarily unavailable.');
      } finally {
        clearTimeout(timeout);
        checkingConnection = false;
      }
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

    function showSuccess(title, detail, ms, hintText, successType) {
      clearTimers();
      busy = false;
      document.body.dataset.successType = successType || 'checkin';
      delete document.body.dataset.scanFlash;
      setStep('success');
      setTone('success');
      setCopy({
        eyebrow: 'Done',
        headline: title,
        lead: detail,
        statusTitle: '',
        statusDetail: '',
        hint: hintText || 'Ready for the next scan.',
        footerStatus: 'Ready',
      });
      resetTimer = setTimeout(showIdle, ms || 900);
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

    function showNewStudent(barcode) {
      clearTimeout(workingTimer);
      busy = false;
      resetReasonButtons();
      delete document.body.dataset.successType;
      currentBarcode = String(barcode || currentBarcode || '').trim();
      setStep('new-student');
      setTone('idle');
      setCopy({
        eyebrow: 'ID not found',
        headline: 'Enter your information',
        lead: 'This ID is not in the system yet.',
        statusTitle: '',
        statusDetail: '',
        hint: 'This saves your ID for future visits.',
        footerStatus: 'Continue',
      });
      reasonTimer = setTimeout(showIdle, 60000);
      requestAnimationFrame(() => newFirstName && newFirstName.focus({ preventScroll: true }));
    }

    function showReasons(student, warning) {
      clearTimeout(workingTimer);
      busy = false;
      resetReasonButtons();
      currentFirstName = student && student.firstName ? student.firstName : 'there';
      currentCheckinWarning = warning || '';
      setStep('reasons');
      setTone(currentCheckinWarning ? 'error' : 'idle');
      setCopy({
        eyebrow: 'Check-In',
        headline: 'Welcome, ' + currentFirstName,
        lead: currentCheckinWarning || 'What brings you in?',
        statusTitle: '',
        statusDetail: '',
        hint: currentCheckinWarning ? 'You can still check in. Choose a reason.' : 'Tap one reason.',
        footerStatus: currentCheckinWarning ? 'Closed — check-in allowed' : 'Choose',
      });
      reasonTimer = setTimeout(showIdle, 20000);
      focusScanner();
    }

    function focusScanner() {
      if (document.body.dataset.step === 'new-student' || document.body.dataset.step === 'pairing') return;
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
      flashScanAccepted();
      workingTimer = setTimeout(showWorking, 240);

      try {
        const data = await post('/api/library/scan', { barcode: scanned });
        clearTimeout(workingTimer);

        if (data.mode === 'checkout') {
          const firstName = data.student && data.student.firstName ? data.student.firstName : 'there';
          await post('/api/library/checkout', { barcode: scanned, method: 'scan_out' });
          showSuccess(
            'Checked out, ' + firstName,
            data.warning ? 'The library is marked closed. Your checkout was recorded.' : 'See you next time.',
            data.warning ? 2600 : 850,
            'Ready for the next scan.',
            'checkout'
          );
          return;
        }

        if (data.mode === 'checkin') {
          showReasons(data.student, data.warning);
          return;
        }

        if (data.mode === 'new_student') {
          showNewStudent(data.barcode || scanned);
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
      if (event.target && event.target.closest) {
        if (event.target.closest('.pairing-form')) return;
        if (event.target.closest('.student-form input, .student-form select, .student-form button')) return;
        if (event.target.closest('button')) return;
      }

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

      if (event.key && event.key.length === 1 && document.body.dataset.step === 'idle') {
        keyBuffer += event.key;
        footerStatus.textContent = 'Reading';
        clearTimeout(keyTimer);
        keyTimer = setTimeout(() => {
          if (keyBuffer.length >= 5) finishBufferedScan();
        }, 230);
      }
    }, true);

    scanInput.addEventListener('input', () => {
      if (document.body.dataset.step === 'reasons' || document.body.dataset.step === 'new-student') {
        scanInput.value = '';
        return;
      }
      keyBuffer = scanInput.value;
      footerStatus.textContent = 'Reading';
    });

    scanInput.addEventListener('change', finishBufferedScan);

    pairingForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const pin = pairingPin.value.replace(/\D/g, '').slice(0, 8);
      if (pin.length !== 8 || busy) return;
      busy = true;
      pairingError.textContent = '';
      footerStatus.textContent = 'Pairing';
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      try {
        const response = await fetch('/api/library/kiosk-enroll', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pin, name: 'Library Chromebook' }),
          cache: 'no-store',
          signal: controller.signal,
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || 'Could not pair this Chromebook.');
        localStorage.setItem('libraryKioskToken', data.token);
        pairingForm.reset();
        showSuccess('Chromebook paired', 'The kiosk is ready to use.', 1400, 'Ready for the first scan.', 'checkin');
      } catch (error) {
        busy = false;
        pairingError.textContent = !navigator.onLine
          ? 'Network connection lost.'
          : error && error.name === 'AbortError'
            ? 'Pairing timed out. Try again.'
            : error instanceof Error ? error.message : 'Could not pair this Chromebook.';
        footerStatus.textContent = 'Setup';
        pairingPin.select();
      } finally {
        clearTimeout(timeout);
      }
    });

    studentForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (busy || !currentBarcode) return;
      clearTimeout(reasonTimer);
      busy = true;
      footerStatus.textContent = 'Saving';
      try {
        const data = await post('/api/library/create-student', {
          barcode: currentBarcode,
          firstName: newFirstName.value,
          lastName: newLastName.value,
          grade: newGrade.value,
        });
        showReasons(data.student, data.state && data.state.status === 'closed'
          ? 'The library is marked closed. Your visit can still be recorded.'
          : '');
      } catch (error) {
        busy = false;
        showError('Could not save', error instanceof Error ? error.message : 'Try again or see the librarian.', 3500);
      }
    });

    document.getElementById('reasons').addEventListener('click', async (event) => {
      const button = event.target.closest('button[data-reason]');
      if (!button || busy || !currentBarcode) return;
      clearTimeout(reasonTimer);
      busy = true;
      footerStatus.textContent = 'Checking in';
      try {
        const reason = button.dataset.reason || '';
        markReasonSelected(button);
        await sleep(120);
        const result = await post('/api/library/checkin', { barcode: currentBarcode, reason });
        if (result.warning) {
          showSuccess('Checked in, ' + currentFirstName, result.warning, 2800, 'Please check with the librarian.', 'checkin');
          return;
        }
        if (reason === 'Lunch') {
          showSuccess('Checked in, ' + currentFirstName, 'You are all set.', 900, 'Ready for the next scan.', 'checkin');
        } else {
          showSuccess('Checked in, ' + currentFirstName, 'Scan out when you leave.', 2300, 'Use the same ID to check out.', 'checkin');
        }
      } catch (error) {
        showError('Could not check in', error instanceof Error ? error.message : 'Try again or see the librarian.');
      } finally {
        focusScanner();
      }
    });

    document.getElementById('cancel').addEventListener('click', showIdle);

    document.addEventListener('pointerdown', (event) => {
      if (event.target && event.target.closest) {
        if (event.target.closest('.pairing-form')) return;
        if (event.target.closest('.student-form input, .student-form select, .student-form button')) return;
        if (event.target.closest('button')) return;
      }
      setTimeout(focusScanner, 0);
    });

    window.addEventListener('focus', () => {
      if (document.body.dataset.step === 'idle' || document.body.dataset.step === 'pairing') verifyKioskConnection();
      else focusScanner();
    });
    window.addEventListener('online', verifyKioskConnection);
    window.addEventListener('offline', () => showOffline());
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        if (document.body.dataset.step === 'idle' || document.body.dataset.step === 'pairing') verifyKioskConnection();
        else focusScanner();
      }
    });

    verifyKioskConnection();
  </script>
</body>
</html>`;
}
function manageHtml(pairing?: { pin: string; expiresAt: string }): string {
  const pairingCode = pairing ? `${pairing.pin.slice(0, 4)} ${pairing.pin.slice(4)}` : "";
  const pairingExpiry = pairing ? new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(pairing.expiresAt)) : "";
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
      grid-template-rows: 54px minmax(82px, 8.6vh) minmax(0, 1fr);
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
      min-height: 82px;
      overflow: hidden;
    }

    .stat {
      min-width: 0;
      padding: 14px 16px 13px;
      border-right: 1px solid var(--line);
      display: grid;
      gap: 8px;
      align-content: center;
    }

    .stat:last-child { border-right: 0; }

    .label {
      color: var(--muted);
      font-size: 11.5px;
      line-height: 1.08;
      font-weight: 700;
      letter-spacing: .045em;
      text-transform: uppercase;
    }

    .value {
      min-width: 0;
      font-size: clamp(20px, 2.05vw, 26px);
      line-height: 1.08;
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

    .kiosk-actions {
      display: grid;
      gap: 10px;
    }

    .pairing-card {
      display: grid;
      gap: 5px;
      padding: 12px;
      border: 1px solid rgba(17, 107, 67, .24);
      border-radius: 12px;
      background: var(--green-bg);
      text-align: center;
    }

    .pairing-code {
      color: var(--green);
      font-size: 28px;
      line-height: 1;
      font-weight: 780;
      letter-spacing: .12em;
    }

    .pairing-expiry,
    .device-meta {
      color: var(--muted);
      font-size: 12px;
      line-height: 1.25;
    }

    .device-list {
      display: grid;
      gap: 7px;
    }

    .device-row {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: center;
      gap: 10px;
      padding-top: 8px;
      border-top: 1px solid var(--line);
    }

    .device-name {
      font-size: 13px;
      font-weight: 650;
    }

    .device-row[data-revoked="true"] { opacity: .58; }

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

    /* v27 librarian dashboard polish */
    .primary-stat {
      background: linear-gradient(180deg, #fff, #fffafa);
      border-left: 3px solid var(--maroon);
    }

    .primary-stat .value {
      font-size: 27px;
      font-weight: 720;
      letter-spacing: -0.04em;
    }

    .capacity-meter {
      width: 100%;
      height: 6px;
      overflow: hidden;
      border-radius: 999px;
      background: #eceff2;
    }

    .capacity-meter span {
      display: block;
      width: 0%;
      height: 100%;
      border-radius: inherit;
      background: var(--maroon);
      transition: width 180ms ease;
    }

    .live-pill {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 26px;
      padding: 0 10px;
      border: 1px solid var(--line);
      border-radius: 999px;
      background: #fff;
      color: var(--muted);
      font-size: 12px;
      line-height: 1;
      font-weight: 650;
    }

    .roster-table {
      min-height: 0;
      display: grid;
      grid-template-rows: 36px minmax(0, 1fr);
    }

    .student-list {
      height: auto;
      min-height: 0;
    }

    .student-row {
      min-height: 62px;
      border-bottom-color: #edf0f3;
    }

    .student-name {
      font-weight: 720;
      font-size: 15.5px;
    }

    .student-id {
      font-size: 12px;
      color: var(--quiet);
    }

    .cell {
      font-size: 13.5px;
      font-weight: 560;
    }

    .student-row button.danger {
      justify-self: end;
      background: var(--red);
    }

    .empty {
      height: 100%;
      min-height: 260px;
      display: grid;
      place-items: end center;
      padding: 0 24px 52px;
      text-align: center;
      background: linear-gradient(180deg, #fff, #fbfcfd);
    }

    .empty strong {
      display: block;
      color: var(--ink);
      font-size: 15px;
      line-height: 1.1;
      font-weight: 650;
      margin-bottom: 6px;
    }

    .empty span {
      display: block;
      color: var(--muted);
      font-size: 13.5px;
      line-height: 1.25;
      font-weight: 450;
    }

    .settings-panel {
      overflow: hidden;
    }

    .settings-panel .control-body {
      overflow: auto;
      grid-template-rows: none;
      align-content: start;
      padding: 12px;
      gap: 11px;
      background: #fbfcfd;
    }

    .settings-panel .group {
      border: 0;
      border-radius: 14px;
      background: #fff;
      box-shadow: 0 0 0 1px rgba(217, 222, 228, 0.7);
      padding: 13px;
      gap: 11px;
    }

    .settings-panel label,
    .settings-panel .fake-label {
      color: var(--muted);
      font-size: 12.5px;
      line-height: 1.1;
      font-weight: 630;
      letter-spacing: 0;
      text-transform: none;
    }

    .settings-panel h3 {
      font-size: 15.5px;
    }

    .settings-panel .hint {
      font-size: 12px;
    }

    .manual-status-control[data-disabled="true"] {
      opacity: .56;
    }

    .manual-status-control[data-disabled="true"] .seg span {
      cursor: not-allowed;
    }

    .mode-helper {
      color: var(--muted);
      font-size: 12.5px;
      line-height: 1.25;
      font-weight: 450;
    }

    .manual-status-control[data-disabled="false"] .mode-helper {
      display: none;
    }

    .savebar {
      position: sticky;
      bottom: 0;
      z-index: 6;
      margin: 2px -4px -4px;
      border-color: var(--line-strong);
      background: rgba(255, 255, 255, 0.96);
      box-shadow: 0 -12px 28px rgba(23, 26, 31, 0.08);
      backdrop-filter: blur(8px);
    }

    .save-meta {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: center;
      gap: 8px;
    }

    .tertiary {
      min-height: 28px;
      padding: 0 9px;
      border: 0;
      background: transparent;
      color: var(--muted);
      font-size: 12px;
      font-weight: 650;
    }

    .tertiary:hover {
      background: var(--surface-soft);
    }

    /* v28 final Library Control polish */
    .statusbar .stat {
      padding-top: 14px;
      padding-bottom: 14px;
      gap: 8px;
    }

    .statusbar .value {
      line-height: 1.08;
    }

    .primary-stat {
      border-left: 0;
      background: #fff;
    }

    .capacity-meter {
      height: 5px;
      background: #eef1f4;
    }

    .capacity-meter span {
      background: #9aa3ad;
    }

    .capacity-meter span[data-empty="true"] {
      opacity: 0;
    }

    .empty {
      place-items: center;
      padding: 24px;
      min-height: 220px;
    }

    .save-meta {
      grid-template-columns: 1fr;
      align-items: start;
      gap: 6px;
    }

    .tertiary {
      justify-self: start;
      min-height: 30px;
      padding: 0 10px;
      border: 1px solid var(--line);
      border-radius: 10px;
      background: #fff;
      color: var(--muted);
    }

    .tertiary:hover {
      background: var(--surface-soft);
      transform: none;
    }

    /* v29 settings simplification and fit fixes */
    .settings-panel {
      min-height: 0;
    }

    .settings-panel .control-body {
      grid-auto-rows: max-content;
      padding: 12px 12px 0;
      gap: 10px;
      overflow-y: auto;
      overflow-x: hidden;
      scrollbar-gutter: stable;
    }

    .settings-panel .group {
      padding: 12px;
      gap: 10px;
    }

    .capacity-group .field {
      max-width: 150px;
    }

    .setting-helper {
      color: var(--muted);
      font-size: 12.5px;
      line-height: 1.3;
      font-weight: 450;
    }

    .status-control {
      grid-template-columns: minmax(0, 1fr) minmax(0, 1.25fr);
    }

    .status-control span {
      padding-left: 8px;
      padding-right: 8px;
      white-space: nowrap;
    }

    .manual-status-control[data-disabled="true"] .seg {
      background: #f2f4f6;
      box-shadow: inset 0 0 0 1px rgba(217, 222, 228, .65);
    }

    .manual-status-control[data-disabled="true"] .seg span {
      color: var(--quiet);
      background: transparent;
      box-shadow: none;
    }

    .manual-status-control[data-disabled="true"] .seg input:checked + span {
      background: #eef1f4;
      color: var(--muted);
    }

    .tv-message-group textarea {
      min-height: 54px;
      max-height: 68px;
    }

    .savebar {
      margin-top: 0;
      margin-bottom: 0;
      padding: 11px 12px calc(11px + env(safe-area-inset-bottom));
      border-radius: 14px 14px 0 0;
    }

    .save-buttons {
      grid-template-columns: minmax(0, 1fr) 92px;
    }

    .save-meta {
      gap: 7px;
    }

    #sync.tertiary {
      width: 100%;
      justify-self: stretch;
      min-height: 32px;
    }



    /* v30 status row fit */
    .statusbar .value {
      padding: 1px 0 2px;
    }

    .statusbar .stat {
      overflow: hidden;
    }

    #mode,
    #scheduled-summary,
    #status {
      line-height: 1.1;
    }

    .capacity-bar,
    .capacity-progress,
    .capacity-track {
      margin-top: 2px;
      flex: 0 0 auto;
    }


    /* v31 Library Control Apple-style polish */
    .app {
      padding: 18px;
      gap: 14px;
      grid-template-rows: 58px minmax(112px, 12vh) minmax(0, 1fr);
    }

    .topbar,
    .statusbar,
    .panel {
      border-color: rgba(217, 222, 228, 0.78);
      border-radius: 18px;
      box-shadow: 0 12px 34px rgba(23, 26, 31, 0.07);
    }

    .topbar {
      padding: 0 18px;
    }

    h1 {
      font-size: 23px;
      line-height: 1.08;
      font-weight: 680;
      letter-spacing: -0.035em;
    }

    .subtle {
      font-size: 14px;
      line-height: 1.25;
    }

    .danger:disabled,
    #clear-all:disabled {
      background: #eef1f4;
      color: var(--quiet);
      border: 1px solid var(--line);
      box-shadow: none;
      opacity: 1;
    }

    .statusbar {
      min-height: 112px;
      border-radius: 18px;
      background: rgba(255, 255, 255, 0.96);
      overflow: visible;
    }

    .statusbar .stat {
      min-height: 0;
      padding: 18px 18px 16px;
      gap: 9px;
      align-content: center;
      overflow: visible;
      border-right-color: rgba(217, 222, 228, 0.72);
    }

    .statusbar .label {
      color: var(--quiet);
      font-size: 11px;
      line-height: 1.18;
      font-weight: 760;
      letter-spacing: .055em;
      text-transform: uppercase;
    }

    .statusbar .value {
      display: block;
      min-height: 0;
      padding: 0;
      overflow: visible;
      font-size: clamp(22px, 2.1vw, 28px);
      line-height: 1.18;
      font-weight: 690;
      letter-spacing: -0.035em;
    }

    .primary-stat .value {
      font-size: clamp(27px, 2.65vw, 33px);
      line-height: 1.14;
      font-weight: 750;
    }

    .status-inline {
      align-items: center;
      gap: 11px;
      line-height: 1.18;
    }

    .dot {
      width: 10px;
      height: 10px;
    }

    .capacity-meter {
      width: 100%;
      height: 5px;
      margin-top: 1px;
      background: #edf0f3;
      border-radius: 999px;
      overflow: hidden;
    }

    .capacity-meter span {
      background: #8f98a3;
    }

    .capacity-meter span[data-empty="true"] {
      opacity: 0;
    }

    .workspace {
      gap: 14px;
    }

    .panel {
      grid-template-rows: 58px minmax(0, 1fr);
      background: rgba(255, 255, 255, 0.96);
    }

    .panel-title {
      padding: 0 18px;
      border-bottom-color: rgba(217, 222, 228, 0.66);
      background: linear-gradient(180deg, rgba(255,255,255,.98), rgba(250,251,252,.94));
    }

    h2 {
      font-size: 16.5px;
      line-height: 1.05;
      font-weight: 670;
      letter-spacing: -0.02em;
    }

    h3 {
      font-size: 15.5px;
      line-height: 1.1;
      font-weight: 660;
      letter-spacing: -0.012em;
    }

    .panel-note,
    .hint,
    .setting-helper,
    .mode-helper {
      color: var(--muted);
      font-weight: 440;
    }

    .empty {
      min-height: 100%;
      place-items: center;
      padding: 32px 24px;
      background:
        radial-gradient(circle at 50% 42%, rgba(116,31,39,.045), transparent 34%),
        linear-gradient(180deg, #fff, #fbfcfd);
    }

    .empty > div {
      display: grid;
      justify-items: center;
      gap: 5px;
      text-align: center;
    }

    .empty > div::before {
      content: "";
      width: 44px;
      height: 44px;
      margin-bottom: 8px;
      border-radius: 15px;
      background: linear-gradient(180deg, #fff, #f2f4f6);
      box-shadow: inset 0 0 0 1px rgba(197, 206, 216, .85), 0 10px 24px rgba(23, 26, 31, .06);
    }

    .empty strong {
      font-size: 15.5px;
      line-height: 1.15;
      font-weight: 680;
    }

    .empty span {
      max-width: 280px;
      font-size: 13.5px;
      line-height: 1.35;
    }

    .settings-panel {
      display: grid;
      grid-template-rows: 58px minmax(0, 1fr) auto;
      overflow: hidden;
      background: rgba(248, 249, 251, 0.98);
    }

    .settings-panel .control-body {
      min-height: 0;
      padding: 14px 14px 16px;
      gap: 12px;
      overflow-y: auto;
      overflow-x: hidden;
      align-content: start;
      background: transparent;
      scrollbar-gutter: stable;
    }

    .settings-panel .group {
      border: 0;
      border-radius: 17px;
      background: rgba(255, 255, 255, 0.96);
      box-shadow: inset 0 0 0 1px rgba(217, 222, 228, 0.68), 0 1px 2px rgba(23, 26, 31, 0.025);
      padding: 16px;
      gap: 12px;
    }

    .group-head {
      align-items: center;
    }

    .settings-panel label,
    .settings-panel .fake-label {
      color: var(--muted);
      font-size: 12.5px;
      line-height: 1.18;
      font-weight: 560;
      letter-spacing: 0;
      text-transform: none;
    }

    input,
    select,
    textarea {
      min-height: 38px;
      border-color: rgba(197, 206, 216, 0.9);
      border-radius: 12px;
      background: rgba(255, 255, 255, .98);
    }

    .seg {
      border: 0;
      border-radius: 13px;
      background: #eef1f5;
      padding: 3px;
    }

    .seg span {
      min-height: 34px;
      border-radius: 10px;
      font-size: 13px;
      font-weight: 610;
    }

    .seg input:checked + span {
      background: #fff;
      box-shadow: 0 1px 5px rgba(23, 26, 31, .14);
    }

    .preset-row {
      grid-template-columns: minmax(0, 1fr) 122px;
      gap: 12px;
    }

    .tv-message-group textarea {
      min-height: 60px;
      max-height: 80px;
    }

    .savebar {
      position: relative;
      bottom: auto;
      z-index: 6;
      display: grid;
      gap: 10px;
      margin: 0;
      padding: 14px;
      border: 0;
      border-top: 1px solid rgba(217, 222, 228, 0.85);
      border-radius: 0 0 18px 18px;
      background: rgba(255, 255, 255, 0.92);
      box-shadow: 0 -10px 24px rgba(23, 26, 31, 0.06);
      backdrop-filter: blur(14px);
    }

    .save-buttons {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 96px;
      gap: 10px;
    }

    .save-meta {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: 7px;
      align-items: start;
    }

    #sync.tertiary {
      width: 100%;
      min-height: 32px;
      justify-self: stretch;
      border: 1px solid rgba(217, 222, 228, 0.9);
      border-radius: 11px;
      background: rgba(255,255,255,.82);
      color: var(--muted);
      font-size: 12.5px;
      font-weight: 610;
    }

    #sync.tertiary:hover {
      background: #f6f7f8;
      transform: none;
    }


    /* v32 quieter Sheets sync and capacity polish */
    .capacity-group {
      gap: 12px;
    }

    .capacity-group .field {
      max-width: 170px;
    }

    .savebar {
      gap: 8px;
      padding: 13px 14px calc(13px + env(safe-area-inset-bottom));
    }

    .save-meta {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      min-height: 24px;
    }

    .save-meta .notice {
      flex: 1 1 auto;
      min-width: 0;
      min-height: 18px;
      font-size: 12.5px;
      line-height: 1.25;
    }

    #sync.tertiary {
      width: auto;
      min-height: 28px;
      justify-self: end;
      flex: 0 0 auto;
      padding: 0 6px;
      border: 0;
      border-radius: 8px;
      background: transparent;
      color: var(--muted);
      font-size: 12px;
      line-height: 1;
      font-weight: 560;
      box-shadow: none;
    }

    #sync.tertiary:hover,
    #sync.tertiary:focus-visible {
      background: rgba(23, 26, 31, 0.045);
      color: var(--ink);
      transform: none;
    }

    #sync.tertiary:active {
      transform: none;
    }

    /* v33 three-card status row */
    .app {
      grid-template-rows: 58px minmax(92px, 10vh) minmax(0, 1fr);
    }

    .statusbar {
      grid-template-columns: minmax(0, 1.12fr) minmax(0, 1fr) minmax(0, 1.02fr);
      min-height: 92px;
    }

    .statusbar .stat {
      padding-top: 15px;
      padding-bottom: 14px;
      gap: 7px;
    }

    .tv-display-stack {
      display: grid;
      gap: 3px;
      min-width: 0;
    }

    .status-subline {
      margin-left: 21px;
      color: var(--muted);
      font-size: 12.5px;
      line-height: 1.2;
      font-weight: 560;
      letter-spacing: -0.005em;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .tv-display-stat .value {
      line-height: 1.12;
    }

    @media (max-height: 740px) and (min-width: 981px) {
      .app { padding: 14px; grid-template-rows: 54px minmax(84px, 10vh) minmax(0, 1fr); gap: 12px; }
      .topbar { min-height: 54px; }
      .statusbar { min-height: 84px; }
      .statusbar .stat { padding: 12px 16px; gap: 6px; }
      .statusbar .value { font-size: clamp(19px, 1.85vw, 24px); line-height: 1.14; }
      .primary-stat .value { font-size: clamp(23px, 2.2vw, 28px); }
      .capacity-meter { height: 4px; }
      .panel { grid-template-rows: 52px minmax(0, 1fr); }
      .settings-panel { grid-template-rows: 52px minmax(0, 1fr) auto; }
      .settings-panel .control-body { padding: 12px; gap: 10px; }
      .settings-panel .group { padding: 13px; gap: 10px; }
      input, select { min-height: 34px; }
      textarea { min-height: 44px; max-height: 58px; }
      .student-row { min-height: 56px; }
      .savebar { padding: 12px; }
    }

    @media (max-width: 980px) {
      .app { height: auto; min-height: 100vh; overflow: auto; grid-template-rows: auto auto auto; }
      html, body { overflow: auto; }
      .title { display: block; }
      .subtle { margin-top: 5px; }
      .statusbar, .workspace { grid-template-columns: 1fr; }
      .status-subline { margin-left: 21px; }
      .workspace { overflow: visible; }
      .panel { min-height: 360px; }
      .table-head { display: none; }
      .student-list { height: 100%; }
      .student-row { grid-template-columns: 1fr; gap: 5px; padding: 12px 16px; }
      .row-label { display: block; color: var(--muted); font-size: 11px; font-weight: 700; text-transform: uppercase; margin-bottom: 2px; }
      .two, .two-even, .preset-row { grid-template-columns: 1fr; }
    }

    /* The status bar now lives inside the roster column, so the app has two rows. */
    .app {
      height: 100vh;
      height: 100dvh;
      min-height: 0;
      grid-template-rows: 58px minmax(0, 1fr);
      overflow: hidden;
    }

    .workspace {
      min-height: 0;
      height: 100%;
      align-items: stretch;
    }

    .roster-stack {
      min-height: 0;
      height: 100%;
      display: grid;
      grid-template-rows: auto minmax(0, 1fr);
      gap: 14px;
      overflow: hidden;
    }

    .roster-stack > .statusbar {
      min-height: 98px;
    }

    .roster-panel,
    .settings-panel {
      min-height: 0;
      height: 100%;
      overflow: hidden;
    }

    /* Apple-inspired librarian control center */
    :root {
      --bg: #f5f5f7;
      --surface: rgba(255, 255, 255, .88);
      --surface-soft: #f5f5f7;
      --ink: #1d1d1f;
      --muted: #6e6e73;
      --quiet: #86868b;
      --line: rgba(0, 0, 0, .08);
      --line-strong: rgba(0, 0, 0, .14);
      --blue: #007aff;
      --maroon: #007aff;
      --red: #ff3b30;
      --green: #248a3d;
      --amber: #b25000;
      --shadow: 0 1px 2px rgba(0, 0, 0, .03), 0 14px 40px rgba(0, 0, 0, .07);
      --font: -apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Helvetica Neue", Arial, sans-serif;
    }

    body {
      background:
        radial-gradient(circle at 16% -10%, rgba(0, 122, 255, .08), transparent 28%),
        radial-gradient(circle at 96% 0%, rgba(175, 82, 222, .05), transparent 25%),
        var(--bg);
    }

    .app {
      width: min(1440px, 100vw);
      padding: 20px 22px 22px;
      grid-template-rows: 64px minmax(0, 1fr);
      gap: 16px;
    }

    .topbar {
      padding: 0 4px;
      border: 0;
      border-radius: 0;
      box-shadow: none;
      background: transparent;
    }

    .title {
      display: grid;
      gap: 5px;
      align-items: center;
    }

    h1 {
      font-size: 30px;
      line-height: 1;
      font-weight: 700;
      letter-spacing: -.035em;
    }

    .subtle {
      font-size: 13px;
      font-weight: 500;
      color: var(--quiet);
    }

    button {
      min-height: 40px;
      padding: 0 16px;
      border-radius: 12px;
      background: var(--blue);
      font-size: 14px;
      font-weight: 600;
      box-shadow: 0 1px 2px rgba(0, 0, 0, .05);
      transition: transform 160ms ease, filter 160ms ease, opacity 160ms ease;
    }

    button:hover { transform: scale(1.015); filter: brightness(.98); }
    button:active { transform: scale(.98); }
    button.small { min-height: 36px; padding: 0 14px; }
    button.secondary {
      background: rgba(255, 255, 255, .72);
      color: var(--blue);
      border: 1px solid rgba(0, 0, 0, .09);
      box-shadow: 0 1px 3px rgba(0, 0, 0, .04);
      backdrop-filter: blur(18px) saturate(150%);
    }
    button.danger { background: rgba(255, 59, 48, .1); color: #d70015; box-shadow: none; }

    .workspace { grid-template-columns: minmax(0, 1fr) 420px; gap: 16px; }
    .roster-stack { gap: 16px; }

    .topbar,
    .statusbar,
    .panel {
      border-color: var(--line);
    }

    .statusbar,
    .panel {
      border-radius: 22px;
      background: var(--surface);
      box-shadow: var(--shadow);
      backdrop-filter: blur(24px) saturate(160%);
    }

    .statusbar {
      grid-template-columns: repeat(3, minmax(0, 1fr));
      min-height: 110px;
      padding: 8px;
      gap: 6px;
    }

    .stat,
    .primary-stat {
      padding: 17px 18px;
      border: 0;
      border-radius: 16px;
      background: transparent;
      gap: 9px;
    }

    .primary-stat { background: rgba(0, 122, 255, .075); }
    .primary-stat .value,
    .value { font-size: 27px; font-weight: 700; letter-spacing: -.04em; }
    .label { font-size: 12px; font-weight: 600; letter-spacing: 0; text-transform: none; }
    .capacity-meter { height: 5px; background: rgba(0, 122, 255, .12); }
    .capacity-meter span { background: var(--blue); }

    .panel { grid-template-rows: 72px minmax(0, 1fr); }
    .settings-panel { grid-template-rows: 72px minmax(0, 1fr) auto; }
    .panel-title {
      padding: 0 20px;
      border-bottom-color: var(--line);
      background: transparent;
    }
    h2 { font-size: 19px; font-weight: 700; letter-spacing: -.025em; }
    h3 { font-size: 15px; font-weight: 650; letter-spacing: -.015em; }
    .panel-note { margin-top: 6px; color: var(--quiet); }
    .live-pill { border: 0; background: rgba(52, 199, 89, .11); color: #1c7c36; }

    .table-head {
      height: 40px;
      padding: 0 20px;
      background: rgba(245, 245, 247, .8);
      border-bottom-color: var(--line);
      font-size: 11px;
      letter-spacing: .02em;
    }
    .roster-table { grid-template-rows: 40px minmax(0, 1fr); }
    .student-row { min-height: 66px; padding: 10px 20px; border-bottom-color: rgba(0, 0, 0, .055); }
    .student-row:hover { background: rgba(0, 122, 255, .035); }
    .student-name { font-size: 15px; font-weight: 650; }
    .empty > div::before {
      content: "✓";
      display: grid;
      place-items: center;
      color: var(--blue);
      font-size: 20px;
      font-weight: 650;
    }

    .settings-panel .control-body {
      padding: 14px;
      gap: 12px;
      background: transparent;
      scrollbar-width: thin;
    }

    .settings-panel .group {
      padding: 15px;
      gap: 12px;
      border: 0;
      border-radius: 16px;
      background: rgba(245, 245, 247, .9);
      box-shadow: none;
    }

    .hint { color: var(--quiet); font-size: 12px; }
    label,
    .fake-label { color: var(--muted); font-size: 12px; font-weight: 600; letter-spacing: 0; text-transform: none; }
    input,
    select,
    textarea {
      min-height: 42px;
      border-color: rgba(0, 0, 0, .1);
      border-radius: 11px;
      background: rgba(255, 255, 255, .94);
      font-size: 15px;
      box-shadow: inset 0 1px 1px rgba(0, 0, 0, .025);
    }
    textarea { min-height: 64px; max-height: 64px; }
    .seg { padding: 3px; gap: 2px; border: 0; border-radius: 11px; background: #e9e9ec; }
    .seg span { min-height: 34px; border-radius: 9px; font-size: 13px; }
    .seg input:checked + span { box-shadow: 0 1px 4px rgba(0, 0, 0, .14), 0 0 0 .5px rgba(0, 0, 0, .08); }
    .checkline input { accent-color: var(--blue); }
    .pairing-card { border: 0; border-radius: 14px; background: rgba(52, 199, 89, .11); }
    .pairing-code { color: #1c7c36; font-variant-numeric: tabular-nums; }

    .savebar {
      margin: 0;
      padding: 13px 14px 14px;
      border: 0;
      border-top: 1px solid var(--line);
      border-radius: 0;
      background: rgba(255, 255, 255, .82);
      backdrop-filter: blur(22px) saturate(160%);
    }
    .save-buttons { grid-template-columns: 1.25fr .75fr; }
    #save { min-height: 44px; }
    #reset { color: var(--muted); }

    @media (max-height: 740px) and (min-width: 981px) {
      .app { grid-template-rows: 52px minmax(0, 1fr); }
      .roster-stack { gap: 12px; }
      .roster-stack > .statusbar { min-height: 88px; }
    }

    @media (max-width: 980px) {
      .app {
        height: auto;
        min-height: 100vh;
        overflow: auto;
        grid-template-rows: auto auto;
      }

      .workspace,
      .roster-stack,
      .settings-panel {
        height: auto;
        overflow: visible;
      }

      .roster-stack { grid-template-rows: auto auto; }
      .roster-stack > .statusbar { min-height: 0; }
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
        <h1>Library</h1>
        <div class="subtle">Control Center</div>
      </div>
      <div class="top-actions">
        <button class="secondary small" id="refresh" type="button" title="Reload the live roster and TV status without changing anything.">Refresh</button>
        <button class="danger small" id="clear-all" type="button" title="Check out every student currently in the library. This cannot be undone." disabled>Check everyone out</button>
      </div>
    </header>

    <main class="workspace">
      <div class="roster-stack">
  <section class="statusbar" aria-label="Current library status">
        <div class="stat primary-stat">
          <div class="label">In library</div>
          <div class="value" id="current">0 / 25</div>
          <div class="capacity-meter" aria-hidden="true"><span id="capacity-meter-fill"></span></div>
        </div>
        <div class="stat tv-display-stat">
          <div class="label">TV display</div>
          <div class="tv-display-stack">
            <div class="value"><span class="status-inline"><span class="dot" id="status-dot" data-status="closed"></span><span id="status">Closed</span></span></div>
            <div class="status-subline" id="mode">Automatic</div>
          </div>
        </div>
        <div class="stat">
          <div class="label">Scheduled open</div>
          <div class="value" id="scheduled-summary">Not scheduled</div>
        </div>
      </section>

      <section class="panel roster-panel">
        <div class="panel-title">
          <div>
            <h2>Current students</h2>
            <div class="panel-note" id="student-count-label">No students checked in</div>
          </div>
          <span class="live-pill" title="The roster refreshes automatically.">Updates live</span>
        </div>
        <div class="roster-table">
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
      </div>

      <aside class="panel settings-panel">
        <div class="panel-title">
          <div>
            <h2>Controls</h2>
            <div class="panel-note">Changes apply when you save.</div>
          </div>
        </div>
        <div class="control-body">
          <section class="group capacity-group">
            <div class="group-head"><h3>Capacity</h3><span class="hint" id="capacity-hint">0 spots available</span></div>
            <div class="field">
              <label for="capacity">Limit</label>
              <input id="capacity" type="number" min="1" max="500" inputmode="numeric">
            </div>
          </section>

          <section class="group tv-display-group">
            <div class="group-head"><h3>Library status</h3><span class="hint" id="status-hint">Automatic status control</span></div>
            <div class="field">
              <div class="fake-label">Status control</div>
              <div class="seg status-control" role="radiogroup" aria-label="Status control">
                <label><input type="radio" name="status-mode" value="auto"><span>Automatic</span></label>
                <label><input type="radio" name="status-mode" value="manual"><span>Manual override</span></label>
              </div>
              <div class="setting-helper" id="status-mode-helper">The system shows Open, Full, or Closed based on the library rules.</div>
            </div>
            <div class="field manual-status-control" id="manual-status-field" data-disabled="false">
              <div class="fake-label">TV status</div>
              <div class="seg three" role="radiogroup" aria-label="TV status">
                <label><input type="radio" name="manual-status" value="open"><span>Open</span></label>
                <label><input type="radio" name="manual-status" value="capacity"><span>Full</span></label>
                <label><input type="radio" name="manual-status" value="closed"><span>Closed</span></label>
              </div>
              <div class="mode-helper" id="manual-status-helper">Manual TV status is disabled while Automatic mode is on.</div>
            </div>
          </section>

          <section class="group">
            <div class="group-head"><h3>Opening time</h3><span class="hint" id="schedule-hint">No time set</span></div>
            <div class="preset-row">
              <div class="field">
                <label for="preset">Saved time</label>
                <select id="preset"><option value="">Choose saved time</option></select>
              </div>
              <div class="field">
                <label for="opening-time">Open at</label>
                <input id="opening-time" type="time">
              </div>
            </div>
            <label class="checkline" for="save-opening-time"><input id="save-opening-time" type="checkbox">Save this time for reuse</label>
          </section>

          <section class="group tv-message-group">
            <div class="field">
              <label for="message">TV message</label>
              <textarea id="message" maxlength="180" placeholder="Optional"></textarea>
            </div>
          </section>

          <section class="group kiosk-group">
            <div class="group-head"><h3>Chromebook kiosk</h3><span class="hint">One-time pairing</span></div>
            <div class="setting-helper">Generate a PIN, then enter it once on the kiosk. The PIN expires after 10 minutes.</div>
            <div class="kiosk-actions">
              <button class="secondary" id="generate-kiosk-pin" type="button">Generate pairing PIN</button>
              <div class="pairing-card" id="pairing-card"${pairing ? "" : " hidden"}>
                <div class="pairing-code" id="pairing-code">${escapeHtml(pairingCode)}</div>
                <div class="pairing-expiry" id="pairing-expiry">${pairing ? `Expires ${escapeHtml(pairingExpiry)}` : ""}</div>
              </div>
              <div class="device-list" id="kiosk-devices"><div class="device-meta">Loading paired devices…</div></div>
            </div>
          </section>

        </div>
        <section class="savebar">
            <div class="save-buttons">
              <button id="save" type="button" title="Apply these settings and update the TV display.">Apply changes</button>
              <button class="secondary" id="reset" type="button" title="Discard unsaved changes and reload the current settings.">Reset</button>
            </div>
            <div class="save-meta">
              <div class="notice" id="notice" role="status" aria-live="polite"></div>
              <button class="tertiary" id="sync" type="button" title="Retry any queued Google Sheets archive events.">Sync Google Sheets</button>
            </div>
        </section>
      </aside>
    </main>
  </div>

  <script>
    const $ = (id) => document.getElementById(id);
    const timeFormatter = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' });
    const dateTimeFormatter = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    const manualRefreshCooldownMs = 5000;
    let latestState = null;
    let latestStudentCount = 0;
    let refreshPromise = null;
    let lastRefreshStartedAt = 0;

    async function api(url, options = {}) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      try {
        const response = await fetch(url, { cache: 'no-store', credentials: 'same-origin', ...options, signal: controller.signal });
        const contentType = response.headers.get('content-type') || '';
        const body = contentType.includes('application/json') ? await response.json() : {};
        if (!response.ok) {
          if (!contentType.includes('application/json')) throw new Error('Cloudflare Access session expired. Refresh and sign in again.');
          throw new Error(body.error || 'Request failed');
        }
        return body;
      } catch (error) {
        if (!navigator.onLine) throw new Error('Network connection lost.');
        if (error && error.name === 'AbortError') throw new Error('The request timed out. Try again.');
        throw error;
      } finally {
        clearTimeout(timeout);
      }
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

    function updateManualStatusAvailability(mode) {
      const isManual = mode === 'manual';
      const field = $('manual-status-field');
      if (!field) return;
      field.dataset.disabled = isManual ? 'false' : 'true';
      document.querySelectorAll('input[name="manual-status"]').forEach((input) => {
        input.disabled = !isManual;
      });
      const helper = $('status-mode-helper');
      if (helper) {
        helper.textContent = isManual
          ? 'The librarian chooses what the TV shows.'
          : 'The system shows Open, Full, or Closed based on the library rules.';
      }
    }

    function renderPresets(presets, selectedTime) {
      $('preset').innerHTML = '<option value="">Choose saved time</option>' + (presets || [])
        .map((item) => '<option value="' + escapeHtml(item.timeValue) + '">' + escapeHtml(item.label) + '</option>')
        .join('');
      $('preset').value = selectedTime || '';
    }

    function formatScheduled(summary) {
      if (!summary) return 'Not scheduled';
      return summary.label || 'Scheduled';
    }

    function render(state) {
      const count = Number(state.currentCount || 0);
      const cap = Number(state.capacity || 0);
      const available = Math.max(0, cap - count);
      const scheduledTime = state.scheduledOpen ? state.scheduledOpen.timeValue : '';
      const progress = cap > 0 ? Math.min(100, Math.max(0, (count / cap) * 100)) : 0;
      latestState = state;
      latestStudentCount = Array.isArray(state.students) ? state.students.length : count;
      $('clear-all').disabled = latestStudentCount < 1;

      $('current').textContent = count + ' / ' + cap;
      $('capacity-meter-fill').style.width = progress + '%';
      $('capacity-meter-fill').dataset.empty = progress <= 0 ? 'true' : 'false';
      $('capacity-hint').textContent = available === 1 ? '1 spot available' : available + ' spots available';
      $('status').textContent = state.statusLabel;
      $('status-dot').dataset.status = state.status;
      $('mode').textContent = state.statusMode === 'manual' ? 'Manual override' : 'Automatic';
      $('status-hint').textContent = state.statusMode === 'manual' ? 'Manual override' : 'Automatic status control';
      $('scheduled-summary').textContent = formatScheduled(state.scheduledOpen);
      $('schedule-hint').textContent = state.scheduledOpen ? 'TV countdown active' : 'No time set';

      $('capacity').value = state.capacity;
      setChecked('status-mode', state.statusMode);
      setChecked('manual-status', state.manualStatus);
      $('message').value = state.customMessage || '';
      updateManualStatusAvailability(state.statusMode);
      $('opening-time').value = scheduledTime;
      $('save-opening-time').checked = false;
      renderPresets(state.openingTimePresets || [], scheduledTime);

      $('student-count-label').textContent = state.students.length === 1 ? '1 student checked in' : state.students.length + ' students checked in';

      if (!state.students.length) {
        $('students').innerHTML = '<div class="empty"><div><strong>No students checked in</strong><span>Students will appear here as they scan in.</span></div></div>';
        return;
      }

      $('students').innerHTML = state.students.map((item) => {
        const checkedIn = new Date(item.checkedInAt);
        const time = Number.isNaN(checkedIn.getTime()) ? 'Unknown' : timeFormatter.format(checkedIn);
        return '<div class="student-row">' +
          '<div><div class="row-label">Student</div><div class="student-name">' + escapeHtml(item.firstName + ' ' + item.lastName) + '</div><div class="student-id">ID ' + escapeHtml(item.studentId) + '</div></div>' +
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

    async function loadKioskDevices() {
      try {
        const data = await api('/library/manage?api=kiosk-devices');
        const devices = Array.isArray(data.devices) ? data.devices : [];
        if (!devices.length) {
          $('kiosk-devices').innerHTML = '<div class="device-meta">No Chromebooks paired yet.</div>';
          return;
        }
        $('kiosk-devices').innerHTML = devices.map((device) => {
          const lastSeen = device.lastSeenAt ? dateTimeFormatter.format(new Date(device.lastSeenAt)) : 'Never';
          const revoked = Boolean(device.revokedAt);
          return '<div class="device-row" data-revoked="' + String(revoked) + '">' +
            '<div><div class="device-name">' + escapeHtml(device.name) + '</div><div class="device-meta">' + (revoked ? 'Revoked' : 'Last seen ' + escapeHtml(lastSeen)) + '</div></div>' +
            (revoked ? '' : '<button class="danger small" type="button" data-revoke-device="' + device.id + '">Revoke</button>') +
          '</div>';
        }).join('');
      } catch (error) {
        $('kiosk-devices').innerHTML = '<div class="device-meta">Could not load paired devices.</div>';
      }
    }

    function refresh(options = {}) {
      const manual = options.manual === true;
      const now = Date.now();

      if (refreshPromise) return refreshPromise;
      if (manual && now - lastRefreshStartedAt < manualRefreshCooldownMs) {
        setNotice('Already up to date. Try again in a few seconds.');
        return Promise.resolve();
      }

      lastRefreshStartedAt = now;
      if (manual) $('refresh').disabled = true;
      refreshPromise = (async () => {
        try {
          render(await api('/library/manage?api=current'));
          if (manual) await loadKioskDevices();
          if (manual) setNotice('Dashboard refreshed.', 'success');
        } catch (error) {
          setNotice(error instanceof Error ? error.message : 'Could not refresh.', 'error');
        } finally {
          if (manual) $('refresh').disabled = false;
          refreshPromise = null;
        }
      })();
      return refreshPromise;
    }

    $('students').addEventListener('click', async (event) => {
      const button = event.target.closest('button[data-visit]');
      if (!button) return;
      button.disabled = true;
      setNotice('Checking out...');
      try {
        await post('/library/manage?api=checkout', { visitId: Number(button.dataset.visit), method: 'librarian' });
        setNotice('Student checked out.', 'success');
        await refresh();
      } catch (error) {
        setNotice(error instanceof Error ? error.message : 'Could not check out student.', 'error');
      } finally {
        button.disabled = false;
      }
    });

    $('clear-all').addEventListener('click', async () => {
      const count = latestStudentCount || 0;
      if (count < 1) return;
      const message = count === 1 ? 'Check out this student?' : 'Check out all ' + count + ' students?';
      if (!confirm(message)) return;
      setNotice(count === 1 ? 'Checking out student...' : 'Checking everyone out...');
      try {
        const data = await post('/library/manage?api=clear', { method: 'clear_all' });
        setNotice(data.cleared === 1 ? 'Checked out 1 student.' : 'Checked out ' + data.cleared + ' students.', 'success');
        await refresh();
      } catch (error) {
        setNotice(error instanceof Error ? error.message : 'Could not check everyone out.', 'error');
      }
    });

    $('refresh').addEventListener('click', () => refresh({ manual: true }));

    $('generate-kiosk-pin').addEventListener('click', () => {
      const button = $('generate-kiosk-pin');
      button.disabled = true;
      setNotice('Generating pairing PIN...');
      window.location.assign('/library/manage?pair=1&t=' + Date.now());
    });

    $('kiosk-devices').addEventListener('click', async (event) => {
      const button = event.target.closest('button[data-revoke-device]');
      if (!button) return;
      if (!confirm('Revoke this Chromebook? It will need to be paired again.')) return;
      button.disabled = true;
      try {
        await post('/library/manage?api=kiosk-revoke', { deviceId: Number(button.dataset.revokeDevice) });
        $('pairing-card').hidden = true;
        await loadKioskDevices();
        setNotice('Chromebook revoked.', 'success');
      } catch (error) {
        setNotice(error instanceof Error ? error.message : 'Could not revoke Chromebook.', 'error');
        button.disabled = false;
      }
    });
    $('preset').addEventListener('change', () => {
      if ($('preset').value) $('opening-time').value = $('preset').value;
    });

    document.querySelectorAll('input[name="status-mode"]').forEach((input) => {
      input.addEventListener('change', () => updateManualStatusAvailability(checkedValue('status-mode')));
    });

    $('reset').addEventListener('click', () => {
      if (latestState) {
        render(latestState);
        setNotice('Unsaved changes reset.');
      } else {
        refresh();
      }
    });

    $('save').addEventListener('click', async () => {
      setNotice('Saving...');
      try {
        const data = await post('/library/manage?api=settings', {
          capacity: Number($('capacity').value),
          statusMode: checkedValue('status-mode'),
          manualStatus: checkedValue('manual-status'),
          showPublicCount: true,
          autoCapacityEnabled: true,
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
        const data = await post('/library/manage?api=sync-sheets', {});
        setNotice('Sheets sync: ' + data.synced + ' synced, ' + data.failed + ' failed.', 'success');
      } catch (error) {
        setNotice(error instanceof Error ? error.message : 'Could not sync.', 'error');
      }
    });

    refresh();
    loadKioskDevices();
    setInterval(() => { if (!document.hidden) refresh(); }, 15000);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) refresh();
    });
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
