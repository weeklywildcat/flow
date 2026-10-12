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
  device_name: string;
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
  name_check_requested_at?: string | null;
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
  checked_out_by: string | null;
};

type CountRow = { count: number };

type StudentFunFactRow = {
  visits_this_month: number | null;
  minutes_this_year: number | null;
};

type StudentScanLookupRow = {
  id: number;
  student_id: string;
  barcode: string;
  first_name: string;
  last_name: string;
  grade: string | null;
  active: number;
  name_check_requested_at: string | null;
  visit_id: number | null;
  visit_student_row_id: number | null;
  visit_reason: string | null;
  visit_checked_in_at: string | null;
  visit_checked_out_at: string | null;
  visit_checkout_method: string | null;
  visit_checked_out_by: string | null;
};

type SheetEventPayload = {
  event: string;
  timestamp: string;
  sheetEventId?: number;
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

type SheetSyncSummary = {
  configured: boolean;
  pending: number;
  exhausted: number;
  lastQueuedAt: string | null;
  lastSyncedAt: string | null;
  lastError: string | null;
};

type SheetRetryResult = {
  configured: boolean;
  attempted: number;
  synced: number;
  failed: number;
};

const TIMEZONE = "America/New_York" as const;
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

export default {
  async fetch(request, env, ctx): Promise<Response> {
    const url = new URL(request.url);
    const pathname = normalizePath(url.pathname);

    try {
      if (pathname.startsWith("/api/library/")) {
        await ensureVisitArchiveColumns(env);
        const kioskAllowed = pathname === "/api/library/scan" || pathname === "/api/library/checkin" || pathname === "/api/library/checkout" || pathname === "/api/library/create-student" || pathname === "/api/library/confirm-name" || pathname === "/api/library/student-fun-facts" || pathname === "/api/library/kiosk-status";
        const pairingAllowed = pathname === "/api/library/kiosk-enroll";
        const authorized = pairingAllowed || (kioskAllowed ? await isKioskOrStaffAuthorized(request, env) : isStaffAuthorized(request));
        if (!authorized) {
          return json({ error: "Unauthorized." }, 401);
        }
      }

      if (pathname === "/" || pathname === "/library") {
        return Response.redirect(`${url.origin}/library/kiosk`, 302);
      }

      // Public, unauthenticated, minimal presence feed for signage: occupancy plus the first name
      // on the latest check-in, nothing more. It deliberately lives outside /api/library/* so the
      // staff and kiosk authorization above stays exactly as it is.
      if (pathname === "/library/presence.json") {
        return request.method === "GET" ? handlePublicPresence(env) : methodNotAllowed(["GET"]);
      }

      if (pathname === "/api/library/scan") {
        return request.method === "POST" ? handleScan(request, env, ctx) : methodNotAllowed(["POST"]);
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

      if (pathname === "/api/library/confirm-name") {
        return request.method === "POST" ? handleConfirmName(request, env, ctx) : methodNotAllowed(["POST"]);
      }

      if (pathname === "/api/library/student-fun-facts") {
        return request.method === "POST" ? handleStudentFunFacts(request, env) : methodNotAllowed(["POST"]);
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

      if (pathname === "/api/library/export-csv") {
        return request.method === "GET" ? handleExportCsv(request, env) : methodNotAllowed(["GET"]);
      }

      if (pathname === "/api/library/sheet-status") {
        return request.method === "GET" ? handleSheetStatus(env) : methodNotAllowed(["GET"]);
      }

      if (pathname === "/api/library/import-students") {
        return request.method === "POST" ? handleStudentImport(request, env) : methodNotAllowed(["POST"]);
      }

      if (pathname === "/api/library/sync-sheets") {
        return request.method === "POST" ? handleSheetRetry(request, env) : methodNotAllowed(["POST"]);
      }

      return notFound(pathname);
    } catch (error) {
      console.error(JSON.stringify({ message: "Unhandled library app error", error: String(error) }));
      return json({ error: "Something went wrong." }, 500);
    }
  },

  async scheduled(_controller, env, ctx): Promise<void> {
    ctx.waitUntil(
      retryPendingSheetEvents(env, 25)
        .then((result) => {
          if (result.attempted > 0 || result.failed > 0) {
            console.log(JSON.stringify({ event: "library_sheet_retry", ...result }));
          }
        })
        .catch((error) => {
          console.error(JSON.stringify({ event: "library_sheet_retry_failed", error: String(error) }));
        })
    );
  },
} satisfies ExportedHandler<LibraryEnv>;

async function handleScan(request: Request, env: LibraryEnv, ctx: ExecutionContext): Promise<Response> {
  const body = await readJsonBody(request);
  if (!isRecord(body)) return json({ error: "Invalid request body." }, 400);

  const barcode = normalizeBarcode(body.barcode);
  if (!barcode) return json({ error: "Scan a student ID." }, 400);

  const scanLookup = await findStudentAndActiveVisit(env, barcode);
  if (!scanLookup) {
    return json({ mode: "new_student", barcode, grades: GRADE_OPTIONS, reasons: REASONS });
  }

  const { student, activeVisit } = scanLookup;
  // Staff asked for this student to re-enter their name; the kiosk prompts before continuing.
  const nameCheck = Boolean(student.name_check_requested_at);

  if (activeVisit) {
    if (body.autoCheckout === true) {
      const checkedOutAt = new Date().toISOString();
      const updatedVisit = await completeCheckout(env, ctx, activeVisit, "scan_out", getActor(request), checkedOutAt);
      if (!updatedVisit) return json({ error: "The visit was already checked out." }, 409);
      return json({ mode: "checkout", student: publicStudent(student), visit: visitPayload(updatedVisit), nameCheck });
    }

    return json({ mode: "checkout", student: publicStudent(student), visit: visitPayload(activeVisit), nameCheck });
  }

  const recentlyCleared = await hasRecentDashboardClear(env, student.id);

  return json({
    mode: "checkin",
    student: publicStudent(student),
    recentlyCleared,
    nameCheck,
    reasons: REASONS,
  });
}

async function handleConfirmName(request: Request, env: LibraryEnv, ctx: ExecutionContext): Promise<Response> {
  const body = await readJsonBody(request);
  if (!isRecord(body)) return json({ error: "Invalid request body." }, 400);

  const barcode = normalizeBarcode(body.barcode);
  const firstName = normalizeString(body.firstName, 80);
  const lastName = normalizeString(body.lastName, 80);
  if (!barcode) return json({ error: "Scan a student ID first." }, 400);
  if (!firstName || !lastName) return json({ error: "Enter your first and last name." }, 400);

  const student = await findStudentByBarcode(env, barcode);
  if (!student) return json({ error: "Student was not found." }, 404);

  const now = new Date().toISOString();
  await env.SIGNAGE_DB.prepare(
    `UPDATE library_students
     SET first_name = ?, last_name = ?, name_check_requested_at = NULL, updated_at = ?
     WHERE id = ?`
  ).bind(firstName, lastName, now, student.id).run();

  const changed = firstName !== student.first_name || lastName !== student.last_name;
  await queueSheetEvent(env, ctx, {
    event: "STUDENT_NAME_CONFIRMED",
    timestamp: now,
    studentId: student.student_id,
    firstName,
    lastName,
    grade: student.grade,
    reason: changed ? `Re-entered at the kiosk; was ${student.first_name} ${student.last_name}` : "Confirmed at the kiosk",
    actor: getActor(request),
  });

  return json({ ok: true, changed, student: publicStudent({ ...student, first_name: firstName, last_name: lastName }) });
}

async function handleStudentFunFacts(request: Request, env: LibraryEnv): Promise<Response> {
  const body = await readJsonBody(request);
  if (!isRecord(body)) return json({ error: "Invalid request body." }, 400);

  const barcode = normalizeBarcode(body.barcode);
  if (!barcode) return json({ error: "Scan a student ID." }, 400);

  const student = await findStudentByBarcode(env, barcode);
  if (!student) return json({ error: "Student was not found." }, 404);

  return json({ funFacts: await getStudentFunFacts(env, student.id) });
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

  return json({
    ok: true,
    visit: visitPayload(visit),
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

  const updatedVisit = await completeCheckout(env, ctx, visit, checkoutMethod, actor, now);

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
     WHERE checked_out_at IS NULL AND archived_at IS NULL`
  ).bind(now, method, actor).run();

  for (const visit of active) {
    await queueSheetEvent(env, ctx, sheetCheckoutPayload(method === "auto_end_of_day" ? "AUTO_CLEAR" : "CLEAR_ALL", { ...visit, checked_out_at: now, checkout_method: method }, method, actor, now));
  }

  return json({ ok: true, cleared: active.length, state: await getCurrentState(env, true) });
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
  const body = await readJsonBody(request);
  const deviceName = isRecord(body) ? normalizeString(body.name, 80) : "";
  if (!deviceName) return json({ error: "Enter a Chromebook name." }, 400);
  return json(await createKioskPairing(request, env, deviceName));
}

async function createKioskPairing(request: Request, env: LibraryEnv, deviceName: string): Promise<{ pin: string; expiresAt: string; name: string }> {
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
      `INSERT INTO library_kiosk_pairing_codes (pin_hash, device_name, expires_at, created_at, created_by)
       VALUES (?, ?, ?, ?, ?)`
    ).bind(pinHash, deviceName, expiresAt, now.toISOString(), getActor(request)),
  ]);

  return { pin, expiresAt, name: deviceName };
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
  if (!/^\d{8}$/.test(pin)) return json({ error: "Enter the 8-digit pairing PIN." }, 400);

  const pinHash = await sha256Hex(pin);
  const now = new Date().toISOString();
  const pairing = await env.SIGNAGE_DB.prepare(
    `SELECT id, device_name, expires_at, used_at
     FROM library_kiosk_pairing_codes
     WHERE pin_hash = ? AND used_at IS NULL AND expires_at > ?`
  ).bind(pinHash, now).first<KioskPairingRow>();
  if (!pairing) return json({ error: "That pairing PIN is invalid or expired." }, 401);
  const name = pairing.device_name;

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
        device_name TEXT NOT NULL DEFAULT 'Unnamed Chromebook',
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

  const pairingColumns = await env.SIGNAGE_DB.prepare(
    "PRAGMA table_info(library_kiosk_pairing_codes)"
  ).all<{ name: string }>();
  if (!pairingColumns.results.some((column) => column.name === "device_name")) {
    await env.SIGNAGE_DB.prepare(
      "ALTER TABLE library_kiosk_pairing_codes ADD COLUMN device_name TEXT NOT NULL DEFAULT 'Unnamed Chromebook'"
    ).run();
  }
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

async function handleSheetStatus(env: LibraryEnv): Promise<Response> {
  return json({ ok: true, ...(await getSheetSyncSummary(env)) });
}

async function handleExportCsv(request: Request, env: LibraryEnv): Promise<Response> {
  const url = new URL(request.url);
  const today = dateInTimezone(new Date());
  const fromDate = parseDateOnly(url.searchParams.get("from") ?? today);
  const toDate = parseDateOnly(url.searchParams.get("to") ?? fromDate ?? today);

  if (!fromDate || !toDate) {
    return json({ error: "Use valid from and to dates in YYYY-MM-DD format." }, 400);
  }
  if (fromDate > toDate) {
    return json({ error: "The start date must be on or before the end date." }, 400);
  }
  if (daysBetween(fromDate, toDate) > 366) {
    return json({ error: "Choose a date range of one year or less." }, 400);
  }

  const rows = await env.SIGNAGE_DB.prepare(
    `${visitSelectSql()} WHERE v.checked_in_at >= ? AND v.checked_in_at < ? ORDER BY v.checked_in_at ASC`
  ).bind(localDateStartIso(fromDate), localDateStartIso(addDateOnly(toDate, 1))).all<VisitRow>();

  const csvRows = [
    [
      "Visit ID",
      "Student ID",
      "First Name",
      "Last Name",
      "Grade",
      "Reason",
      "Checked In (Eastern)",
      "Checked Out (Eastern)",
      "Duration Minutes",
      "Checkout Method",
      "Checked Out By",
    ],
    ...rows.results.map((visit) => [
      visit.id,
      visit.student_id,
      visit.first_name,
      visit.last_name,
      visit.grade ?? "",
      visit.reason,
      exportTimestamp(visit.checked_in_at),
      exportTimestamp(visit.checked_out_at),
      visit.checked_out_at ? durationMinutes(visit.checked_in_at, visit.checked_out_at) ?? "" : "",
      visit.checkout_method ?? "",
      visit.checked_out_by ?? "",
    ]),
  ];

  const csv = csvRows.map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
  return new Response(csv, {
    headers: {
      ...securityHeaders(),
      "Cache-Control": "no-store",
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="library-visits-${fromDate}-to-${toDate}.csv"`,
    },
  });
}

async function handleSheetRetry(_request: Request, env: LibraryEnv): Promise<Response> {
  const result = await retryPendingSheetEvents(env, 25, true);
  const summary = await getSheetSyncSummary(env);

  if (!result.configured) {
    return json({
      ok: false,
      error: "Google Sheets sync is not configured. Add SHEETS_WEBHOOK_URL and SHEETS_WEBHOOK_SECRET to the Worker.",
      ...result,
      ...summary,
    }, 503);
  }

  return json({ ok: true, ...result, ...summary });
}

async function retryPendingSheetEvents(env: LibraryEnv, limit: number, includeExhausted = false): Promise<SheetRetryResult> {
  if (!isSheetSyncConfigured(env)) {
    return { configured: false, attempted: 0, synced: 0, failed: 0 };
  }

  const rows = await env.SIGNAGE_DB.prepare(
    `SELECT id, payload_json FROM library_sheet_events
     WHERE synced_at IS NULL${includeExhausted ? "" : " AND attempts < 10"}
     ORDER BY id ASC
     LIMIT ?`
  ).bind(Math.max(1, Math.min(Math.floor(limit), 100))).all<{ id: number; payload_json: string }>();

  let synced = 0;
  let failed = 0;

  for (const row of rows.results) {
    const ok = await sendSheetEvent(env, row.id, row.payload_json);
    if (ok) synced += 1;
    else failed += 1;
  }

  return { configured: true, attempted: rows.results.length, synced, failed };
}

async function getSheetSyncSummary(env: LibraryEnv): Promise<SheetSyncSummary> {
  const row = await env.SIGNAGE_DB.prepare(
    `SELECT
       (SELECT COUNT(*) FROM library_sheet_events WHERE synced_at IS NULL AND attempts < 10) AS pending,
       (SELECT COUNT(*) FROM library_sheet_events WHERE synced_at IS NULL AND attempts >= 10) AS exhausted,
       (SELECT MAX(created_at) FROM library_sheet_events) AS last_queued_at,
       (SELECT MAX(synced_at) FROM library_sheet_events) AS last_synced_at,
       (SELECT last_error FROM library_sheet_events
        WHERE synced_at IS NULL AND last_error IS NOT NULL
        ORDER BY id DESC LIMIT 1) AS last_error`
  ).first<{
    pending: number;
    exhausted: number;
    last_queued_at: string | null;
    last_synced_at: string | null;
    last_error: string | null;
  }>();

  return {
    configured: isSheetSyncConfigured(env),
    pending: row?.pending ?? 0,
    exhausted: row?.exhausted ?? 0,
    lastQueuedAt: row?.last_queued_at ?? null,
    lastSyncedAt: row?.last_synced_at ?? null,
    lastError: row?.last_error ? row.last_error.slice(0, 240) : null,
  };
}

async function findStudentByBarcode(env: LibraryEnv, barcode: string): Promise<StudentRow | null> {
  const row = await env.SIGNAGE_DB.prepare(
    `SELECT id, student_id, barcode, first_name, last_name, grade, active
     FROM library_students
     WHERE barcode = ? AND active = 1`
  ).bind(barcode).first<StudentRow>();
  return row ?? null;
}

async function findStudentAndActiveVisit(env: LibraryEnv, barcode: string): Promise<{
  student: StudentRow;
  activeVisit: VisitRow | null;
} | null> {
  const row = await env.SIGNAGE_DB.prepare(
    `SELECT
       s.id,
       s.student_id,
       s.barcode,
       s.first_name,
       s.last_name,
       s.grade,
       s.active,
       s.name_check_requested_at,
       v.id AS visit_id,
       v.student_row_id AS visit_student_row_id,
       v.reason AS visit_reason,
       v.checked_in_at AS visit_checked_in_at,
       v.checked_out_at AS visit_checked_out_at,
       v.checkout_method AS visit_checkout_method,
       v.checked_out_by AS visit_checked_out_by
     FROM library_students s
     LEFT JOIN library_visits v
       ON v.student_row_id = s.id AND v.checked_out_at IS NULL AND v.archived_at IS NULL
     WHERE s.barcode = ? AND s.active = 1
     ORDER BY v.checked_in_at DESC
     LIMIT 1`
  ).bind(barcode).first<StudentScanLookupRow>();
  if (!row) return null;

  const student: StudentRow = {
    id: row.id,
    student_id: row.student_id,
    barcode: row.barcode,
    first_name: row.first_name,
    last_name: row.last_name,
    grade: row.grade,
    active: row.active,
    name_check_requested_at: row.name_check_requested_at,
  };

  if (row.visit_id === null || row.visit_student_row_id === null || row.visit_reason === null || row.visit_checked_in_at === null) {
    return { student, activeVisit: null };
  }

  return {
    student,
    activeVisit: {
      id: row.visit_id,
      student_row_id: row.visit_student_row_id,
      student_id: row.student_id,
      first_name: row.first_name,
      last_name: row.last_name,
      grade: row.grade,
      reason: row.visit_reason,
      checked_in_at: row.visit_checked_in_at,
      checked_out_at: row.visit_checked_out_at,
      checkout_method: row.visit_checkout_method,
      checked_out_by: row.visit_checked_out_by,
    },
  };
}

async function findActiveVisitForStudent(env: LibraryEnv, studentRowId: number): Promise<VisitRow | null> {
  const row = await env.SIGNAGE_DB.prepare(
    `${visitSelectSql()} WHERE v.student_row_id = ? AND v.checked_out_at IS NULL ORDER BY v.checked_in_at DESC LIMIT 1`
  ).bind(studentRowId).first<VisitRow>();
  return row ?? null;
}

async function getStudentFunFacts(env: LibraryEnv, studentRowId: number): Promise<{
  visitsThisMonth: number;
  minutesThisYear: number;
}> {
  const today = dateInTimezone(new Date());
  const monthStart = `${today.slice(0, 7)}-01`;
  const yearStart = `${today.slice(0, 4)}-01-01`;
  const row = await env.SIGNAGE_DB.prepare(
    `SELECT
       SUM(CASE WHEN checked_in_at >= ? THEN 1 ELSE 0 END) AS visits_this_month,
       COALESCE(SUM(
         CASE WHEN checked_out_at IS NULL THEN 0
         ELSE ROUND((julianday(checked_out_at) - julianday(checked_in_at)) * 24 * 60)
         END
       ), 0) AS minutes_this_year
     FROM library_visits
     WHERE student_row_id = ? AND checked_in_at >= ? AND archived_at IS NULL`
  ).bind(localDateStartIso(monthStart), studentRowId, localDateStartIso(yearStart)).first<StudentFunFactRow>();

  return {
    visitsThisMonth: Math.max(0, Number(row?.visits_this_month ?? 0)),
    minutesThisYear: Math.max(0, Number(row?.minutes_this_year ?? 0)),
  };
}

async function hasRecentDashboardClear(env: LibraryEnv, studentRowId: number): Promise<boolean> {
  const cutoff = new Date(Date.now() - 30 * 1000).toISOString();
  const row = await env.SIGNAGE_DB.prepare(
    `SELECT 1 AS found
     FROM library_visits
     WHERE student_row_id = ?
       AND checked_out_at >= ?
       AND archived_at IS NULL
       AND checkout_method IN ('librarian', 'clear_all')
     ORDER BY checked_out_at DESC
     LIMIT 1`
  ).bind(studentRowId, cutoff).first<{ found: number }>();
  return Boolean(row?.found);
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

// The archived filter lives in the JOIN so every caller inherits it: CSV export, the live
// occupancy list, single-visit lookups and the kiosk's open-visit check.
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
      v.checkout_method,
      v.checked_out_by
    FROM library_visits v
    JOIN library_students s ON s.id = v.student_row_id AND v.archived_at IS NULL`;
}

async function checkoutVisit(env: LibraryEnv, visitId: number, method: CheckoutMethod, actor: string, checkedOutAt: string): Promise<boolean> {
  const result = await env.SIGNAGE_DB.prepare(
    `UPDATE library_visits
     SET checked_out_at = ?, checkout_method = ?, checked_out_by = ?
     WHERE id = ? AND checked_out_at IS NULL`
  ).bind(checkedOutAt, method, actor, visitId).run();
  return Number(result.meta.changes ?? 0) > 0;
}

async function completeCheckout(
  env: LibraryEnv,
  ctx: ExecutionContext,
  visit: VisitRow,
  method: CheckoutMethod,
  actor: string,
  checkedOutAt: string,
): Promise<VisitRow | null> {
  const checkedOut = await checkoutVisit(env, visit.id, method, actor, checkedOutAt);
  if (!checkedOut) return null;

  const updatedVisit: VisitRow = {
    ...visit,
    checked_out_at: checkedOutAt,
    checkout_method: method,
    checked_out_by: actor,
  };
  ctx.waitUntil(queueSheetEvent(env, ctx, sheetCheckoutPayload("SIGN_OUT", updatedVisit, method, actor, checkedOutAt)));
  return updatedVisit;
}

/**
 * Closes an open visit at a chosen time through the normal checkout path, so the
 * Google Sheets archive records the corrected checkout rather than the current time.
 */
export async function closeVisitAt(
  env: LibraryEnv,
  ctx: ExecutionContext,
  visitId: number,
  checkedOutAt: string,
  actor: string,
): Promise<boolean> {
  const visit = await getVisitById(env, visitId);
  if (!visit || visit.checked_out_at) return false;
  return (await completeCheckout(env, ctx, visit, "librarian", actor, checkedOutAt)) !== null;
}

async function getCurrentState(env: LibraryEnv, includeStudents: boolean) {
  const currentCount = await getActiveCount(env);
  const activeVisits = includeStudents ? await getActiveVisits(env) : [];
  const generatedAt = new Date().toISOString();

  return {
    currentCount,
    inLibraryCount: currentCount,
    generatedAt,
    timezone: TIMEZONE,
    students: activeVisits.map(visitPayload),
  };
}

/**
 * The complete public presence contract. The only student information it may carry is the
 * first name attached to the latest check-in. Every field is a primitive built explicitly below,
 * and `satisfies` makes the type check reject any extra property, so no other student, visit,
 * roster or staff field can be added to this response by accident.
 */
type PublicPresence = {
  schemaVersion: 1;
  currentCount: number;
  generatedAt: string;
  latestCheckIn: { cursor: string; at: string; firstName: string | null } | null;
};

type LatestCheckInSignalRow = {
  id: number;
  checked_in_at: string;
  first_name: string | null;
};

/**
 * Newest non-archived check-in: its row id, time, and the student's first name. Selects nothing
 * else. The LEFT JOIN keeps the visit (the canonical arrival signal) even if its student row is
 * missing, in which case the name is simply null.
 */
async function getLatestCheckInSignal(env: LibraryEnv): Promise<LatestCheckInSignalRow | null> {
  const row = await env.SIGNAGE_DB.prepare(
    `SELECT v.id, v.checked_in_at, s.first_name
     FROM library_visits v
     LEFT JOIN library_students s ON s.id = v.student_row_id
     WHERE v.archived_at IS NULL
     ORDER BY v.checked_in_at DESC, v.id DESC
     LIMIT 1`
  ).first<LatestCheckInSignalRow>();
  return row ?? null;
}

async function handlePublicPresence(env: LibraryEnv): Promise<Response> {
  // This path is outside the /api/library/* block that normally runs the migration first.
  await ensureVisitArchiveColumns(env);

  const [currentCount, latest] = await Promise.all([getActiveCount(env), getLatestCheckInSignal(env)]);

  const presence = {
    schemaVersion: 1,
    currentCount,
    generatedAt: new Date().toISOString(),
    latestCheckIn: latest
      ? { cursor: String(latest.id), at: latest.checked_in_at, firstName: latest.first_name?.trim() || null }
      : null,
  } satisfies PublicPresence;

  return json(presence);
}

async function getActiveCount(env: LibraryEnv): Promise<number> {
  const row = await env.SIGNAGE_DB.prepare(
    "SELECT COUNT(*) AS count FROM library_visits WHERE checked_out_at IS NULL AND archived_at IS NULL"
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
  if (!isSheetSyncConfigured(env)) {
    return false;
  }

  try {
    const webhookUrl = new URL(env.SHEETS_WEBHOOK_URL!);
    webhookUrl.searchParams.set("secret", env.SHEETS_WEBHOOK_SECRET!);
    const payload = JSON.parse(payloadJson);
    if (!isRecord(payload)) throw new Error("Queued Sheets payload is not an object.");

    const response = await fetch(webhookUrl, {
      method: "POST",
      signal: AbortSignal.timeout(5000),
      headers: {
        "Content-Type": "application/json",
        "X-Library-Sync-Secret": env.SHEETS_WEBHOOK_SECRET!,
      },
      body: JSON.stringify({ ...payload, sheetEventId: eventId }),
    });

    const responseText = await response.text();
    let responseBody: unknown = null;
    try {
      responseBody = JSON.parse(responseText);
    } catch {
      // The receiver must return JSON so that a 200 response cannot mask a rejected event.
    }
    if (!response.ok) throw new Error(`Sheets webhook returned ${response.status}`);
    if (!isRecord(responseBody) || responseBody.ok !== true) {
      const detail = isRecord(responseBody) && typeof responseBody.error === "string"
        ? responseBody.error
        : "receiver returned an invalid response";
      throw new Error(`Sheets webhook rejected event: ${detail}`);
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

function isSheetSyncConfigured(env: LibraryEnv): boolean {
  return Boolean(env.SHEETS_WEBHOOK_URL?.trim() && env.SHEETS_WEBHOOK_SECRET?.trim());
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

function dateInTimezone(value: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const dateParts = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${dateParts.year}-${dateParts.month}-${dateParts.day}`;
}

function parseDateOnly(value: string | null): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return null;
  }
  return value;
}

function addDateOnly(value: string, days: number): string {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function daysBetween(fromDate: string, toDate: string): number {
  const [fromYear, fromMonth, fromDay] = fromDate.split("-").map(Number);
  const [toYear, toMonth, toDay] = toDate.split("-").map(Number);
  return Math.floor(
    (Date.UTC(toYear, toMonth - 1, toDay) - Date.UTC(fromYear, fromMonth - 1, fromDay)) / 86400000
  );
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

function exportTimestamp(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZoneName: "short",
  }).format(date);
}

function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

// library_visits predates archiving, so CREATE TABLE IF NOT EXISTS cannot add the columns to a
// database that already has the table. Run the ALTERs once per isolate, before anything reads
// or writes archived_at. A fresh database is left alone: the table is created with the columns.
let visitArchiveMigration: Promise<void> | null = null;

export function ensureVisitArchiveColumns(env: LibraryEnv): Promise<void> {
  if (!visitArchiveMigration) {
    visitArchiveMigration = migrateVisitArchiveColumns(env).catch((error) => {
      visitArchiveMigration = null;
      throw error;
    });
  }
  return visitArchiveMigration;
}

async function migrateVisitArchiveColumns(env: LibraryEnv): Promise<void> {
  const columns = await env.SIGNAGE_DB.prepare("PRAGMA table_info(library_visits)").all<{ name: string }>();
  if (columns.results.length === 0) return;

  const existing = new Set(columns.results.map((column) => column.name));
  const statements = [];
  if (!existing.has("archived_at")) {
    statements.push(env.SIGNAGE_DB.prepare("ALTER TABLE library_visits ADD COLUMN archived_at TEXT"));
  }
  if (!existing.has("archived_by")) {
    statements.push(env.SIGNAGE_DB.prepare("ALTER TABLE library_visits ADD COLUMN archived_by TEXT"));
  }
  if (statements.length > 0) {
    statements.push(env.SIGNAGE_DB.prepare(
      "CREATE INDEX IF NOT EXISTS idx_library_visits_archived ON library_visits(archived_at, checked_in_at)"
    ));
  }
  // Set when a librarian reviews a flagged visit, so it stops showing up as a likely missed checkout.
  if (!existing.has("flag_reviewed_at")) {
    statements.push(env.SIGNAGE_DB.prepare("ALTER TABLE library_visits ADD COLUMN flag_reviewed_at TEXT"));
  }
  // Set when a librarian asks a student to re-enter their name at their next scan.
  const studentColumns = await env.SIGNAGE_DB.prepare("PRAGMA table_info(library_students)").all<{ name: string }>();
  if (studentColumns.results.length > 0 && !studentColumns.results.some((column) => column.name === "name_check_requested_at")) {
    statements.push(env.SIGNAGE_DB.prepare("ALTER TABLE library_students ADD COLUMN name_check_requested_at TEXT"));
  }
  if (statements.length === 0) return;
  await env.SIGNAGE_DB.batch(statements);
}

async function ensureLibraryTables(env: LibraryEnv): Promise<void> {
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
        name_check_requested_at TEXT,
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
        archived_at TEXT,
        archived_by TEXT,
        flag_reviewed_at TEXT,
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
      `CREATE INDEX IF NOT EXISTS idx_library_visits_archived ON library_visits(archived_at, checked_in_at)`
    ),
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
      "CREATE INDEX IF NOT EXISTS idx_library_sheet_events_pending ON library_sheet_events(synced_at, attempts, id)"
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
  ]);
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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

