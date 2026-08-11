import adminApp from "./admin-v6";
import { ensureVisitArchiveColumns } from "./library";

type EditableVisitRow = {
  id: number;
  checked_in_at: string;
  checked_out_at: string | null;
  archived_at: string | null;
};

type Update = {
  visitId: number;
  durationMinutes: number;
};

const MAX_UPDATES = 200;
const MAX_DURATION_MINUTES = 1440;

const API_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
};

export default {
  async fetch(request, env, ctx): Promise<Response> {
    const pathname = normalizePath(new URL(request.url).pathname);
    if (pathname !== "/api/library/admin-update-visit-durations") {
      return adminApp.fetch(request, env, ctx);
    }
    if (!isStaffAuthorized(request)) return json({ error: "Unauthorized." }, 401);
    if (request.method !== "POST") return json({ error: "Method not allowed.", allowedMethods: ["POST"] }, 405);

    try {
      await ensureVisitArchiveColumns(env);
      return await handleUpdateVisitDurations(request, env);
    } catch (error) {
      console.error(JSON.stringify({ event: "library_visit_durations_update_error", error: String(error) }));
      return json({ error: "Could not update those visit durations." }, 500);
    }
  },

  async scheduled(controller, env, ctx): Promise<void> {
    return adminApp.scheduled(controller, env, ctx);
  },
} satisfies ExportedHandler<Env>;

async function handleUpdateVisitDurations(request: Request, env: Env): Promise<Response> {
  const body = await readJsonBody(request);
  if (!isRecord(body) || !Array.isArray(body.updates)) return json({ error: "Invalid request body." }, 400);

  const updates = parseUpdates(body.updates);
  if (updates === null) {
    return json({ error: "Each duration must be a whole number of minutes between 0 and " + MAX_DURATION_MINUTES + "." }, 400);
  }
  if (updates.length === 0) return json({ error: "Select at least one visit to update." }, 400);
  if (updates.length > MAX_UPDATES) return json({ error: "Select " + MAX_UPDATES + " visits or fewer at a time." }, 400);

  const existing = await loadVisits(env, updates.map((update) => update.visitId));
  const now = Date.now();
  const statements: D1PreparedStatement[] = [];

  // Everything is checked before anything is written, so a stale row in the
  // selection cannot leave the rest of the batch half applied.
  for (const update of updates) {
    const visit = existing.get(update.visitId);
    if (!visit) return json({ error: "One of those visits was not found. Refresh and try again." }, 404);
    if (visit.archived_at !== null) return json({ error: "Restore archived visits before editing their duration." }, 409);
    if (visit.checked_out_at === null) return json({ error: "Check these students out before editing their visit duration." }, 409);

    const checkedInMs = new Date(visit.checked_in_at).getTime();
    if (!Number.isFinite(checkedInMs)) throw new Error("Visit has an invalid check-in timestamp.");
    const checkedOutMs = checkedInMs + update.durationMinutes * 60_000;
    if (checkedOutMs > now) return json({ error: "A duration cannot put the checkout time in the future." }, 400);

    statements.push(
      env.SIGNAGE_DB.prepare(
        `UPDATE library_visits
         SET checked_out_at = ?
         WHERE id = ? AND archived_at IS NULL AND checked_out_at IS NOT NULL`
      ).bind(new Date(checkedOutMs).toISOString(), update.visitId)
    );
  }

  const results = await env.SIGNAGE_DB.batch(statements);
  const updated = results.reduce((total, result) => total + (result.meta.changes ?? 0), 0);
  if (updated !== updates.length) {
    return json({ error: "Some of those visits changed before they could be updated. Refresh and try again." }, 409);
  }

  return json({ ok: true, updated });
}

function parseUpdates(value: unknown[]): Update[] | null {
  const byVisitId = new Map<number, Update>();
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

async function loadVisits(env: Env, visitIds: number[]): Promise<Map<number, EditableVisitRow>> {
  const placeholders = visitIds.map(() => "?").join(",");
  const rows = await env.SIGNAGE_DB.prepare(
    `SELECT id, checked_in_at, checked_out_at, archived_at FROM library_visits WHERE id IN (${placeholders})`
  ).bind(...visitIds).all<EditableVisitRow>();

  const found = new Map<number, EditableVisitRow>();
  for (const row of rows.results ?? []) found.set(row.id, row);
  return found;
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
