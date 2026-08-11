import adminApp from "./admin-v5";
import { ensureVisitArchiveColumns } from "./library";

type ActiveVisitRow = {
  id: number;
  checked_in_at: string;
};

type Adjustment = {
  visitId: number;
  durationMinutes: number;
};

const MAX_ADJUSTMENTS = 200;
const MAX_DURATION_MINUTES = 1440;

const API_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
};

export default {
  async fetch(request, env, ctx): Promise<Response> {
    const pathname = normalizePath(new URL(request.url).pathname);
    if (pathname !== "/api/library/admin-clear-with-durations") {
      return adminApp.fetch(request, env, ctx);
    }
    if (!isStaffAuthorized(request)) return json({ error: "Unauthorized." }, 401);
    if (request.method !== "POST") return json({ error: "Method not allowed.", allowedMethods: ["POST"] }, 405);

    try {
      await ensureVisitArchiveColumns(env);
      return await handleClearWithDurations(request, env, ctx);
    } catch (error) {
      console.error(JSON.stringify({ event: "library_clear_with_durations_error", error: String(error) }));
      return json({ error: "Could not check everyone out." }, 500);
    }
  },

  async scheduled(controller, env, ctx): Promise<void> {
    return adminApp.scheduled(controller, env, ctx);
  },
} satisfies ExportedHandler<Env>;

async function handleClearWithDurations(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const body = await readJsonBody(request);
  if (!isRecord(body)) return json({ error: "Invalid request body." }, 400);

  if (body.adjustments !== undefined && body.adjustments !== null && !Array.isArray(body.adjustments)) {
    return json({ error: "Invalid request body." }, 400);
  }

  const adjustments = parseAdjustments(body.adjustments);
  if (adjustments === null) {
    return json({ error: "Each corrected visit needs a whole number of minutes between 0 and " + MAX_DURATION_MINUTES + "." }, 400);
  }
  if (adjustments.length > MAX_ADJUSTMENTS) {
    return json({ error: "Too many visits were sent at once. Refresh and try again." }, 400);
  }

  const checkedInAt = await loadActiveCheckInTimes(env, adjustments.map((a) => a.visitId));
  const now = Date.now();
  const updates: { visitId: number; checkedOutAt: string }[] = [];

  for (const adjustment of adjustments) {
    const startedAt = checkedInAt.get(adjustment.visitId);
    // A visit that was checked out or archived while the librarian was reviewing
    // is simply skipped; the clear below still leaves the roster empty.
    if (!startedAt) continue;
    const startedMs = new Date(startedAt).getTime();
    if (!Number.isFinite(startedMs)) continue;
    const checkedOutMs = startedMs + adjustment.durationMinutes * 60_000;
    if (checkedOutMs > now) {
      return json({ error: "A corrected duration cannot put the checkout time in the future." }, 400);
    }
    updates.push({ visitId: adjustment.visitId, checkedOutAt: new Date(checkedOutMs).toISOString() });
  }

  // Clear first so the existing checkout path runs for everyone and each visit
  // gets its Google Sheets event, then move the checkout times that were corrected.
  const cleared = await adminApp.fetch(clearRequest(request), env, ctx);
  if (!cleared.ok) return cleared;
  const clearedBody = (await cleared.json().catch(() => ({}))) as Record<string, unknown>;

  if (updates.length > 0) {
    await env.SIGNAGE_DB.batch(
      updates.map((update) =>
        env.SIGNAGE_DB.prepare(
          `UPDATE library_visits
           SET checked_out_at = ?
           WHERE id = ? AND archived_at IS NULL AND checked_out_at IS NOT NULL`
        ).bind(update.checkedOutAt, update.visitId)
      )
    );
  }

  return json({ ...clearedBody, ok: true, adjusted: updates.length });
}

function parseAdjustments(value: unknown): Adjustment[] | null {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) return null;

  const byVisitId = new Map<number, Adjustment>();
  for (const entry of value) {
    if (!isRecord(entry)) return null;
    const visitId = Number(entry.visitId);
    const durationMinutes = Number(entry.durationMinutes);
    if (!Number.isInteger(visitId) || visitId < 1) return null;
    if (!Number.isInteger(durationMinutes) || durationMinutes < 0 || durationMinutes > MAX_DURATION_MINUTES) return null;
    byVisitId.set(visitId, { visitId, durationMinutes });
  }
  return [...byVisitId.values()];
}

async function loadActiveCheckInTimes(env: Env, visitIds: number[]): Promise<Map<number, string>> {
  const found = new Map<number, string>();
  if (visitIds.length === 0) return found;

  const placeholders = visitIds.map(() => "?").join(",");
  const rows = await env.SIGNAGE_DB.prepare(
    `SELECT id, checked_in_at FROM library_visits
     WHERE id IN (${placeholders}) AND checked_out_at IS NULL AND archived_at IS NULL`
  ).bind(...visitIds).all<ActiveVisitRow>();

  for (const row of rows.results ?? []) found.set(row.id, row.checked_in_at);
  return found;
}

type IncomingRequest = Parameters<NonNullable<(typeof adminApp)["fetch"]>>[0];

function clearRequest(request: Request): IncomingRequest {
  const target = new URL(request.url);
  target.pathname = "/api/library/clear";
  target.search = "";

  const headers = new Headers();
  headers.set("Content-Type", "application/json; charset=utf-8");
  for (const name of ["CF-Access-Authenticated-User-Email", "Cf-Access-Jwt-Assertion", "CF-Ray"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }

  return new Request(target.toString(), {
    method: "POST",
    headers,
    body: JSON.stringify({ method: "clear_all" }),
  }) as IncomingRequest;
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

function normalizePath(pathname: string): string {
  return pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
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
