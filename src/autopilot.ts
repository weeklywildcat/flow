export type AutopilotWindow = { start: string; end: string };
export type AutopilotPreset = { id: number; name: string; windows: AutopilotWindow[] };
export type AutopilotRunState = "active" | "paused" | "stopped";

type PresetRow = { id: number; name: string };
type WindowRow = { preset_id: number; start_time: string; end_time: string };
type RunRow = {
  run_date: string;
  preset_id: number | null;
  preset_name: string;
  windows_json: string;
  state: AutopilotRunState;
  activated_at: string;
  activated_by: string;
  paused_at: string | null;
  paused_by: string | null;
};

export type AutopilotEvaluation = {
  status: "off" | "running" | "paused" | "finished";
  presetName: string | null;
  runDate: string | null;
  windows: AutopilotWindow[];
  currentWindow: AutopilotWindow | null;
  nextWindow: AutopilotWindow | null;
  nextOpenAt: string | null;
  effectiveStatus: "open" | "capacity" | "closed" | null;
};

const TIMEZONE = "America/New_York";
const MIGRATION = "autopilot_v1";
const TIME_RE = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export async function ensureAutopilotSchema(env: Env): Promise<void> {
  const ready = await env.SIGNAGE_DB.prepare(
    "SELECT 1 AS ready FROM library_app_migrations WHERE name = ?"
  ).bind(MIGRATION).first();
  if (ready) return;

  await env.SIGNAGE_DB.batch([
    env.SIGNAGE_DB.prepare(
      `CREATE TABLE IF NOT EXISTS library_autopilot_presets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL COLLATE NOCASE UNIQUE,
        created_at TEXT NOT NULL,
        created_by TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        updated_by TEXT NOT NULL
      )`
    ),
    env.SIGNAGE_DB.prepare(
      `CREATE TABLE IF NOT EXISTS library_autopilot_windows (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        preset_id INTEGER NOT NULL,
        start_time TEXT NOT NULL,
        end_time TEXT NOT NULL,
        sort_order INTEGER NOT NULL,
        FOREIGN KEY (preset_id) REFERENCES library_autopilot_presets(id) ON DELETE CASCADE
      )`
    ),
    env.SIGNAGE_DB.prepare(
      "CREATE INDEX IF NOT EXISTS idx_library_autopilot_windows_preset ON library_autopilot_windows(preset_id, sort_order)"
    ),
    env.SIGNAGE_DB.prepare(
      `CREATE TABLE IF NOT EXISTS library_autopilot_runs (
        run_date TEXT PRIMARY KEY,
        preset_id INTEGER,
        preset_name TEXT NOT NULL,
        windows_json TEXT NOT NULL,
        state TEXT NOT NULL CHECK (state IN ('active', 'paused', 'stopped')),
        activated_at TEXT NOT NULL,
        activated_by TEXT NOT NULL,
        paused_at TEXT,
        paused_by TEXT
      )`
    ),
    env.SIGNAGE_DB.prepare(
      "INSERT OR IGNORE INTO library_app_migrations (name, applied_at) VALUES (?, ?)"
    ).bind(MIGRATION, new Date().toISOString()),
  ]);
}

export function validateWindows(value: unknown): AutopilotWindow[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 12) {
    throw new Error("Add between 1 and 12 opening windows.");
  }
  const windows = value.map((item) => {
    if (!item || typeof item !== "object") throw new Error("Invalid opening window.");
    const record = item as Record<string, unknown>;
    const start = typeof record.start === "string" ? record.start : "";
    const end = typeof record.end === "string" ? record.end : "";
    if (!TIME_RE.test(start) || !TIME_RE.test(end)) throw new Error("Use valid start and end times.");
    if (start >= end) throw new Error("Each opening window must end after it starts.");
    return { start, end };
  }).sort((a, b) => a.start.localeCompare(b.start));
  for (let i = 1; i < windows.length; i += 1) {
    if (windows[i].start < windows[i - 1].end) throw new Error("Opening windows cannot overlap.");
  }
  return windows;
}

export async function listAutopilotPresets(env: Env): Promise<AutopilotPreset[]> {
  const [presetsResult, windowsResult] = await Promise.all([
    env.SIGNAGE_DB.prepare("SELECT id, name FROM library_autopilot_presets ORDER BY name COLLATE NOCASE").all<PresetRow>(),
    env.SIGNAGE_DB.prepare("SELECT preset_id, start_time, end_time FROM library_autopilot_windows ORDER BY preset_id, sort_order").all<WindowRow>(),
  ]);
  return presetsResult.results.map((preset) => ({
    id: preset.id,
    name: preset.name,
    windows: windowsResult.results
      .filter((window) => window.preset_id === preset.id)
      .map((window) => ({ start: window.start_time, end: window.end_time })),
  }));
}

export async function saveAutopilotPreset(env: Env, id: number | null, name: string, windows: AutopilotWindow[], actor: string): Promise<number> {
  const now = new Date().toISOString();
  let presetId = id;
  if (presetId) {
    const result = await env.SIGNAGE_DB.prepare(
      "UPDATE library_autopilot_presets SET name = ?, updated_at = ?, updated_by = ? WHERE id = ?"
    ).bind(name, now, actor, presetId).run();
    if ((result.meta.changes ?? 0) !== 1) throw new Error("Autopilot preset was not found.");
    await env.SIGNAGE_DB.prepare("DELETE FROM library_autopilot_windows WHERE preset_id = ?").bind(presetId).run();
  } else {
    const result = await env.SIGNAGE_DB.prepare(
      "INSERT INTO library_autopilot_presets (name, created_at, created_by, updated_at, updated_by) VALUES (?, ?, ?, ?, ?)"
    ).bind(name, now, actor, now, actor).run();
    presetId = Number(result.meta.last_row_id);
  }
  await env.SIGNAGE_DB.batch(windows.map((window, index) => env.SIGNAGE_DB.prepare(
    "INSERT INTO library_autopilot_windows (preset_id, start_time, end_time, sort_order) VALUES (?, ?, ?, ?)"
  ).bind(presetId, window.start, window.end, index)));
  return presetId;
}

export async function deleteAutopilotPreset(env: Env, presetId: number): Promise<void> {
  await env.SIGNAGE_DB.batch([
    env.SIGNAGE_DB.prepare("DELETE FROM library_autopilot_windows WHERE preset_id = ?").bind(presetId),
    env.SIGNAGE_DB.prepare("DELETE FROM library_autopilot_presets WHERE id = ?").bind(presetId),
  ]);
}

export async function startAutopilot(env: Env, presetId: number, actor: string, now = new Date()): Promise<void> {
  const preset = (await listAutopilotPresets(env)).find((item) => item.id === presetId);
  if (!preset) throw new Error("Choose an Autopilot preset.");
  const runDate = newYorkParts(now).date;
  await env.SIGNAGE_DB.prepare(
    `INSERT INTO library_autopilot_runs (run_date, preset_id, preset_name, windows_json, state, activated_at, activated_by, paused_at, paused_by)
     VALUES (?, ?, ?, ?, 'active', ?, ?, NULL, NULL)
     ON CONFLICT(run_date) DO UPDATE SET preset_id = excluded.preset_id, preset_name = excluded.preset_name,
       windows_json = excluded.windows_json, state = 'active', activated_at = excluded.activated_at,
       activated_by = excluded.activated_by, paused_at = NULL, paused_by = NULL`
  ).bind(runDate, preset.id, preset.name, JSON.stringify(preset.windows), now.toISOString(), actor).run();
}

export async function setAutopilotRunState(env: Env, state: "active" | "paused" | "stopped", actor: string, now = new Date()): Promise<void> {
  const runDate = newYorkParts(now).date;
  const result = await env.SIGNAGE_DB.prepare(
    `UPDATE library_autopilot_runs SET state = ?, paused_at = ?, paused_by = ? WHERE run_date = ?`
  ).bind(state, state === "active" ? null : now.toISOString(), state === "active" ? null : actor, runDate).run();
  if ((result.meta.changes ?? 0) !== 1) throw new Error("No Autopilot schedule is active today.");
}

export async function evaluateAutopilot(env: Env, now: Date, currentCount: number, capacity: number): Promise<AutopilotEvaluation> {
  try {
    const migration = await env.SIGNAGE_DB.prepare(
      "SELECT 1 AS ready FROM library_app_migrations WHERE name = ?"
    ).bind(MIGRATION).first();
    if (!migration) return offEvaluation();
    const parts = newYorkParts(now);
    const run = await env.SIGNAGE_DB.prepare(
      "SELECT run_date, preset_id, preset_name, windows_json, state, activated_at, activated_by, paused_at, paused_by FROM library_autopilot_runs WHERE run_date = ?"
    ).bind(parts.date).first<RunRow>();
    if (!run || run.state === "stopped") return offEvaluation();
    const windows = validateWindows(JSON.parse(run.windows_json));
    if (run.state === "paused") return { ...offEvaluation(), status: "paused", presetName: run.preset_name, runDate: run.run_date, windows };
    const currentWindow = windows.find((window) => parts.time >= window.start && parts.time < window.end) ?? null;
    const nextWindow = windows.find((window) => parts.time < window.start) ?? null;
    const finished = !currentWindow && !nextWindow;
    return {
      status: finished ? "finished" : "running",
      presetName: run.preset_name,
      runDate: run.run_date,
      windows,
      currentWindow,
      nextWindow,
      nextOpenAt: nextWindow ? zonedLocalToIso(parts.date, nextWindow.start) : null,
      effectiveStatus: currentWindow
        ? (capacity > 0 && currentCount >= capacity ? "capacity" : "open")
        : "closed",
    };
  } catch (error) {
    console.error(JSON.stringify({ event: "autopilot_evaluation_failed", error: error instanceof Error ? error.message : String(error) }));
    return offEvaluation();
  }
}

function offEvaluation(): AutopilotEvaluation {
  return { status: "off", presetName: null, runDate: null, windows: [], currentWindow: null, nextWindow: null, nextOpenAt: null, effectiveStatus: null };
}

function newYorkParts(date: Date): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "00";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${get("hour")}:${get("minute")}` };
}

function zonedLocalToIso(date: string, time: string): string {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const desired = Date.UTC(year, month - 1, day, hour, minute);
  let candidate = desired;
  for (let i = 0; i < 2; i += 1) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).formatToParts(new Date(candidate));
    const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
    const represented = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
    candidate += desired - represented;
  }
  return new Date(candidate).toISOString();
}
