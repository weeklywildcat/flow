import adminApp from "./admin-v4";
import { ensureVisitArchiveColumns } from "./library";

type EditableVisitRow = {
  id: number;
  checked_in_at: string;
  checked_out_at: string | null;
  archived_at: string | null;
};

const API_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
};

export default {
  async fetch(request, env, ctx): Promise<Response> {
    const pathname = normalizePath(new URL(request.url).pathname);
    if (pathname !== "/api/library/admin-update-visit-duration") {
      return adminApp.fetch(request, env, ctx);
    }
    if (!isStaffAuthorized(request)) return json({ error: "Unauthorized." }, 401);
    if (request.method !== "POST") return json({ error: "Method not allowed.", allowedMethods: ["POST"] }, 405);

    try {
      await ensureVisitArchiveColumns(env);
      return await handleUpdateVisitDuration(request, env);
    } catch (error) {
      console.error(JSON.stringify({ event: "library_visit_duration_update_error", error: String(error) }));
      return json({ error: "Could not update that visit duration." }, 500);
    }
  },

  async scheduled(controller, env, ctx): Promise<void> {
    return adminApp.scheduled(controller, env, ctx);
  },
} satisfies ExportedHandler<Env>;

async function handleUpdateVisitDuration(request: Request, env: Env): Promise<Response> {
  const body = await readJsonBody(request);
  if (!isRecord(body)) return json({ error: "Invalid request body." }, 400);

  const visitId = Number(body.visitId);
  const durationMinutes = Number(body.durationMinutes);
  if (!Number.isInteger(visitId) || visitId < 1) return json({ error: "Invalid visit." }, 400);
  if (!Number.isInteger(durationMinutes) || durationMinutes < 0 || durationMinutes > 1440) {
    return json({ error: "Duration must be a whole number of minutes between 0 and 1440." }, 400);
  }

  const existing = await env.SIGNAGE_DB.prepare(
    "SELECT id, checked_in_at, checked_out_at, archived_at FROM library_visits WHERE id = ?"
  ).bind(visitId).first<EditableVisitRow>();
  if (!existing) return json({ error: "That visit was not found." }, 404);
  if (existing.archived_at !== null) return json({ error: "Restore this visit before editing its duration." }, 409);
  if (existing.checked_out_at === null) return json({ error: "Check this student out before editing the visit duration." }, 409);

  const checkedInMs = new Date(existing.checked_in_at).getTime();
  if (!Number.isFinite(checkedInMs)) throw new Error("Visit has an invalid check-in timestamp.");
  const checkedOutMs = checkedInMs + durationMinutes * 60_000;
  if (checkedOutMs > Date.now()) return json({ error: "Duration cannot put the checkout time in the future." }, 400);
  const checkedOutAt = new Date(checkedOutMs).toISOString();

  const result = await env.SIGNAGE_DB.prepare(
    `UPDATE library_visits
     SET checked_out_at = ?
     WHERE id = ? AND archived_at IS NULL AND checked_out_at IS NOT NULL`
  ).bind(checkedOutAt, visitId).run();
  if ((result.meta.changes ?? 0) !== 1) return json({ error: "That visit changed before it could be updated. Refresh and try again." }, 409);

  return json({ ok: true, visitId, durationMinutes, checkedOutAt });
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
