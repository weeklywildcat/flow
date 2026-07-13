import libraryApp, { getPublicSignageStatus } from "./library";

type Status = "open" | "capacity" | "closed";

type StoredStatusRow = {
  status: string;
  message: string | null;
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

type StatusCopy = {
  label: string;
  sentence: string;
  icon: string;
};

type ApiStatus = {
  status: Status;
  storedStatus: Status;
  label: string;
  sentence: string;
  icon: string;
  message: string;
  storedMessage: string;
  updatedAt: string;
  updatedBy: string;
  isStale: boolean;
  scheduledOpen: ScheduledOpen | null;
  openingTimePresets: OpeningTimePreset[];
  timezone: "America/New_York";
  generatedAt: string;
};

const STATUS_COPY: Record<Status, StatusCopy> = {
  open: {
    label: "OPEN",
    sentence: "Students may visit the library.",
    icon: "check",
  },
  capacity: {
    label: "AT CAPACITY",
    sentence: "Please wait before visiting the library.",
    icon: "pause",
  },
  closed: {
    label: "CLOSED",
    sentence: "The library is currently unavailable.",
    icon: "x",
  },
};

const VALID_STATUSES = new Set<Status>(["open", "capacity", "closed"]);
const PUBLIC_ORIGIN = "https://signage.weeklywildcat.com";
const TIMEZONE = "America/New_York" as const;

const MANAGE_LOGO_SVG = "<svg width=\"100%\" height=\"100%\" viewBox=\"0 0 1843 588\" version=\"1.1\" xmlns=\"http://www.w3.org/2000/svg\" xmlns:xlink=\"http://www.w3.org/1999/xlink\" xml:space=\"preserve\" xmlns:serif=\"http://www.serif.com/\" style=\"fill-rule:evenodd;clip-rule:evenodd;stroke-linejoin:round;stroke-miterlimit:2;\">\n    <g transform=\"matrix(1,0,0,1,0,0.000017)\">\n        <g transform=\"matrix(1,0,0,1,-347.369517,-225.594152)\">\n            <g transform=\"matrix(2.328755,0,0,2.328755,868.523408,203.17989)\">\n                <g>\n                    <g>\n                        <g>\n                            <g transform=\"matrix(1,0,0,1,0.080711,141.472876)\">\n                                <g>\n                                    <path d=\"M27.031,-105.562L38.922,-42.922L48.984,-105.562L78.188,-105.562L87.891,-46.875L96.906,-105.562L128.297,-105.562L108.094,-0.422L72.422,-0.422L63.688,-44.891L55.109,-0.422L19.141,-0.422L0,-105.562L27.031,-105.562Z\" style=\"fill-rule:nonzero;\"/>\n                                </g>\n                            </g>\n                        </g>\n                    </g>\n                    <g>\n                        <g transform=\"matrix(1,0,0,1,131.395108,141.472876)\">\n                            <g>\n                                <path d=\"M0,-105.562L69.531,-105.562L69.531,-79.234L26.672,-79.234L26.672,-65.938L47.5,-65.938L52.562,-39.688L26.672,-39.688L26.672,-26.672L69.531,-26.672L69.531,-0.422L0,-0.422L0,-105.562Z\" style=\"fill-rule:nonzero;\"/>\n                            </g>\n                        </g>\n                    </g>\n                    <g>\n                        <g transform=\"matrix(1,0,0,1,210.352625,141.472876)\">\n                            <g>\n                                <path d=\"M0,-105.562L69.531,-105.562L69.531,-79.234L26.672,-79.234L26.672,-65.938L47.5,-65.938L52.562,-39.688L26.672,-39.688L26.672,-26.672L69.531,-26.672L69.531,-0.422L0,-0.422L0,-105.562Z\" style=\"fill-rule:nonzero;\"/>\n                            </g>\n                        </g>\n                    </g>\n                    <g>\n                        <g transform=\"matrix(1,0,0,1,289.310173,141.472876)\">\n                            <g>\n                                <path d=\"M0,-105.562L26.672,-105.562L26.672,-52.984L52.922,-105.562L79.234,-105.562L52.922,-51.516L79.094,-0.422L50.031,-0.422L38.562,-22.938L27.031,-0.422L0,-0.422L0,-105.562Z\" style=\"fill-rule:nonzero;\"/>\n                            </g>\n                        </g>\n                    </g>\n                    <g>\n                        <g transform=\"matrix(1,0,0,1,370.941837,141.472876)\">\n                            <g>\n                                <path d=\"M0,-105.203L26.312,-105.203L26.312,-26.312L69.531,-26.312L69.531,-0.078L0,-0.078L0,-105.203Z\" style=\"fill-rule:nonzero;\"/>\n                            </g>\n                        </g>\n                    </g>\n                    <g>\n                        <g transform=\"matrix(1,0,0,1,426.043217,141.472876)\">\n                            <g>\n                                <path d=\"M0,-105.203L25.547,-105.203L39.125,-58.406L52.562,-105.203L78.75,-105.203L52.219,-24.562L52.219,-0.078L25.891,-0.078L25.891,-25.266L0,-105.203Z\" style=\"fill-rule:nonzero;\"/>\n                            </g>\n                        </g>\n                    </g>\n                    <g transform=\"matrix(1,0,0,1,-556.071146,120.374441)\">\n                        <g transform=\"matrix(1,0,0,1,558.20204,141.472876)\">\n                            <g>\n                                <path d=\"M27.031,-105.562L38.922,-42.922L48.984,-105.562L78.188,-105.562L87.891,-46.875L96.906,-105.562L128.297,-105.562L108.094,-0.422L72.422,-0.422L63.688,-44.891L55.109,-0.422L19.141,-0.422L0,-105.562L27.031,-105.562Z\" style=\"fill-rule:nonzero;\"/>\n                            </g>\n                        </g>\n                    </g>\n                    <g transform=\"matrix(1,0,0,1,-556.071146,120.374441)\">\n                        <g transform=\"matrix(1,0,0,1,689.516438,141.472876)\">\n                            <g>\n                                <rect x=\"0\" y=\"-105.562\" width=\"26.312\" height=\"105.141\"/>\n                            </g>\n                        </g>\n                    </g>\n                    <g transform=\"matrix(1,0,0,1,-556.071146,120.374441)\">\n                        <g transform=\"matrix(1,0,0,1,729.628548,141.472876)\">\n                            <g>\n                                <path d=\"M0,-105.203L26.312,-105.203L26.312,-26.312L69.531,-26.312L69.531,-0.078L0,-0.078L0,-105.203Z\" style=\"fill-rule:nonzero;\"/>\n                            </g>\n                        </g>\n                    </g>\n                    <g transform=\"matrix(1,0,0,1,-556.071146,120.374441)\">\n                        <g transform=\"matrix(1,0,0,1,806.123072,141.472876)\">\n                            <g>\n                                <path d=\"M0,-105.203L52.562,-105.203C69.457,-105.016 78.234,-96.266 78.891,-78.953L78.891,-26.312C78.648,-8.82 70.18,-0.078 53.484,-0.078L0,-0.078L0,-105.203ZM27.094,-79.031L27.031,-26.312L42.859,-26.312C49.098,-26.312 52.219,-29.316 52.219,-35.328L52.219,-69.953C52.07,-75.859 49.066,-78.859 43.203,-78.953L27.094,-79.031Z\" style=\"fill-rule:nonzero;\"/>\n                            </g>\n                        </g>\n                    </g>\n                    <g transform=\"matrix(1,0,0,1,-556.071146,120.374441)\">\n                        <g transform=\"matrix(1,0,0,1,894.862333,141.472876)\">\n                            <g>\n                                <path d=\"M28.781,-105.562L51.156,-105.562C69.875,-105.375 79.234,-94.441 79.234,-72.766L79.234,-64.531L52.219,-64.531L52.219,-71.359C51.414,-76.379 48.879,-78.891 44.609,-78.891L34.547,-78.891C29.535,-77.953 27.031,-75.555 27.031,-71.703L27.031,-33.922C27.031,-29.703 29.91,-27.285 35.672,-26.672L43.562,-26.672C49.332,-27.328 52.219,-29.859 52.219,-34.266L52.219,-38.219L79.234,-38.219L79.234,-32.094C79.047,-10.977 70.957,-0.422 54.969,-0.422L24.844,-0.422C15.32,-0.422 7.77,-5.816 2.188,-16.609C0.727,-19.754 0,-23.953 0,-29.203L0,-76.422C0,-89.461 5.395,-98.445 16.188,-103.375C19.562,-104.832 23.758,-105.562 28.781,-105.562Z\" style=\"fill-rule:nonzero;\"/>\n                            </g>\n                        </g>\n                    </g>\n                    <g transform=\"matrix(1,0,0,1,-556.071146,120.374441)\">\n                        <g transform=\"matrix(1,0,0,1,974.101357,141.472876)\">\n                            <g>\n                                <path d=\"M61.5,-105.562L81.422,-0.422L55.031,-0.422L52.844,-10.484L28.078,-10.844L25.547,-0.422L0,-0.422L20.906,-105.562L61.5,-105.562ZM41.734,-75.797L33.141,-34.625L48.562,-34.625L41.734,-75.797Z\" style=\"fill-rule:nonzero;\"/>\n                            </g>\n                        </g>\n                    </g>\n                    <g transform=\"matrix(1,0,0,1,-556.071146,120.374441)\">\n                        <g transform=\"matrix(1,0,0,1,1044.754958,141.472876)\">\n                            <g>\n                                <path d=\"M78.891,-105.562L78.891,-79.234L52.562,-79.234L52.562,-0.422L26.312,-0.422L26.312,-79.234L0,-79.234L0,-105.562L78.891,-105.562Z\" style=\"fill-rule:nonzero;\"/>\n                            </g>\n                        </g>\n                    </g>\n                </g>\n            </g>\n        </g>\n        <g transform=\"matrix(1,0,0,1,-347.369517,-225.594152)\">\n            <g transform=\"matrix(4.003688,0,0,4.003688,343.133285,66.947998)\">\n                <path d=\"M79.348,133.652C79.348,133.652 86.621,145.969 94.848,151.695C103.078,157.422 97.527,177.66 88.152,184.727C78.773,191.789 67.48,163.914 41.262,177.852C41.262,177.852 57.531,175.18 63.273,180.906C63.273,180.906 51.445,179.332 43.176,185.297C34.91,191.266 8.348,168.688 19.828,157.996C31.312,147.305 32.078,151.887 38.008,132.605C43.941,113.32 63.559,116.473 70.352,128.785C77.148,141.102 84.324,147.113 84.324,147.113C84.324,147.113 80.348,140.887 79.348,133.652ZM105.754,97.762C105.754,97.762 107.383,111.508 102.117,118.477C96.855,125.445 94.176,132.891 97.812,140.336C101.449,147.781 108.242,152.938 112.738,138.523C112.738,138.523 113.121,144.535 110.348,148.738C110.348,148.738 119.918,140.621 118.961,129.93C118.004,119.238 112.355,121.914 112.836,112.559C113.312,103.203 105.754,97.762 105.754,97.762ZM15.902,76.855C15.902,76.855 12.844,87.738 16.574,94.422C20.305,101.102 21.934,106.066 16.285,109.121C16.285,109.121 25.188,110.172 24.516,117.234C23.848,124.301 24.324,138.234 16.191,139.094C8.059,139.957 0.02,129.645 1.168,117.715C2.316,105.781 6.43,109.219 5.855,98.719C5.281,88.215 10.641,81.344 15.902,76.855ZM71.211,52.703C71.211,52.703 77.242,63.969 74.465,71.988C71.691,80.008 75.039,82.297 75.039,82.297C75.039,82.297 71.117,80.578 70.637,77.238C70.637,77.238 69.777,82.582 72.359,86.02C72.359,86.02 65.566,89.84 65.566,97.094C65.566,102.117 71.531,106.18 74.945,110.359C79.066,115.398 75.133,121.734 82.785,121.574C87.328,121.48 100.023,113.188 94.848,93.465C94.848,93.465 94.082,101.199 90.637,104.824C90.637,104.824 100.973,69.984 71.211,52.703ZM47.098,39.625C47.098,39.625 38.008,45.164 36.57,55.855C35.137,66.547 31.023,70.938 27.77,78.957C24.516,86.977 32.457,107.977 42.312,110.457C52.168,112.941 58.867,89.84 56.762,82.871C54.656,75.902 44.227,73.324 40.016,75.613C40.016,75.613 43.461,70.461 51.691,71.891C51.691,71.891 49.012,68.742 45.758,69.027C45.758,69.027 48.914,66.449 46.523,59.578C44.133,52.703 44.992,43.828 47.098,39.625Z\"/>\n            </g>\n        </g>\n    </g>\n</svg>";

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
    const pathname = normalizePath(url.pathname);

    try {
      if (
        pathname === "/library" ||
        pathname.startsWith("/library/") ||
        pathname.startsWith("/api/library/") ||
        pathname === "/api/signage/library"
      ) {
        return libraryApp.fetch(request, env, ctx);
      }

      if (pathname === "/view") {
        return request.method === "GET" ? html(viewHtml(), 200) : methodNotAllowed(["GET"]);
      }

      if (pathname === "/api/status") {
        return request.method === "GET"
          ? json(await getEffectiveStatus(env, false))
          : methodNotAllowed(["GET"]);
      }

      if (pathname === "/manage") {
        return request.method === "GET" ? html(manageHtml(), 200) : methodNotAllowed(["GET"]);
      }

      if (pathname === "/manage/api/status") {
        if (request.method === "GET") {
          return json(await getEffectiveStatus(env, true));
        }

        if (request.method === "POST") {
          return updateStatus(request, env);
        }

        return methodNotAllowed(["GET", "POST"]);
      }

      return notFound(pathname);
    } catch (error) {
      console.error(JSON.stringify({ message: "Unhandled request error", error: String(error) }));
      return json({ error: "Something went wrong." }, 500);
    }
  },
} satisfies ExportedHandler<Env>;

function normalizePath(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith("/")) {
    return pathname.slice(0, -1);
  }

  return pathname;
}

async function updateStatus(request: Request, env: Env): Promise<Response> {
  const origin = request.headers.get("Origin");
  if (origin !== null && origin !== PUBLIC_ORIGIN) {
    return json({ error: "Invalid request origin." }, 403);
  }

  const contentType = request.headers.get("Content-Type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return json({ error: "Expected application/json." }, 415);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body." }, 400);
  }

  if (!isRecord(body)) {
    return json({ error: "Invalid request body." }, 400);
  }

  const status = body.status;
  if (typeof status !== "string" || !isStatus(status)) {
    return json({ error: "Status must be open, capacity, or closed." }, 400);
  }

  const messageValue = body.message;
  if (messageValue !== undefined && typeof messageValue !== "string") {
    return json({ error: "Message must be a string." }, 400);
  }

  const message = normalizeMessage(messageValue ?? "");
  const updatedAt = new Date().toISOString();
  const updatedBy =
    request.headers.get("CF-Access-Authenticated-User-Email")?.trim() || "Library staff";
  const scheduledOpenTimeValue = body.scheduledOpenTime;
  const saveOpeningTimeValue = body.saveOpeningTime;

  if (
    scheduledOpenTimeValue !== undefined &&
    scheduledOpenTimeValue !== null &&
    typeof scheduledOpenTimeValue !== "string"
  ) {
    return json({ error: "Scheduled open time must be a time string." }, 400);
  }

  if (saveOpeningTimeValue !== undefined && typeof saveOpeningTimeValue !== "boolean") {
    return json({ error: "Save opening time must be true or false." }, 400);
  }

  const saveOpeningTime = saveOpeningTimeValue === true;
  const scheduledOpen =
    status === "open" || !scheduledOpenTimeValue
      ? null
      : resolveScheduledOpenTime(scheduledOpenTimeValue, new Date());

  if (scheduledOpenTimeValue && scheduledOpen === null) {
    return json({ error: "Scheduled open time must be later today." }, 400);
  }

  if (saveOpeningTime && scheduledOpen === null) {
    return json({ error: "Choose a scheduled open time before saving it." }, 400);
  }

  await ensureScheduleTables(env);

  const statements = [
    env.SIGNAGE_DB.prepare(
      "UPDATE library_status SET status = ?, message = ?, updated_at = ?, updated_by = ? WHERE id = 1",
    ).bind(status, message, updatedAt, updatedBy),
    env.SIGNAGE_DB.prepare(
      "INSERT INTO library_status_history (status, message, updated_at, updated_by) VALUES (?, ?, ?, ?)",
    ).bind(status, message, updatedAt, updatedBy),
    env.SIGNAGE_DB.prepare(
      "INSERT INTO library_open_schedule (id, opens_at, time_value, updated_at, updated_by) VALUES (1, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET opens_at = excluded.opens_at, time_value = excluded.time_value, updated_at = excluded.updated_at, updated_by = excluded.updated_by",
    ).bind(scheduledOpen?.opensAt ?? null, scheduledOpen?.timeValue ?? null, updatedAt, updatedBy),
  ];

  if (saveOpeningTime && scheduledOpen !== null) {
    statements.push(
      env.SIGNAGE_DB.prepare(
        "INSERT INTO library_opening_presets (time_value, label, created_at, created_by) VALUES (?, ?, ?, ?) ON CONFLICT(time_value) DO UPDATE SET label = excluded.label",
      ).bind(scheduledOpen.timeValue, scheduledOpen.label, updatedAt, updatedBy),
    );
  }

  await env.SIGNAGE_DB.batch(statements);

  return json({
    ok: true,
    status: await getEffectiveStatus(env, true),
  });
}

async function getEffectiveStatus(env: Env, includePresets: boolean): Promise<ApiStatus> {
  await ensureScheduleTables(env);
  const now = new Date();
  const state = await getPublicSignageStatus(env);
  const effectiveStatus: Status = isStatus(state.status) ? state.status : "closed";
  const storedStatus = effectiveStatus;
  const storedMessage = normalizeMessage(state.message ?? "");
  const updatedAt = state.updatedAt ?? now.toISOString();
  const updatedBy = state.updatedBy?.trim() || "Library staff";
  const isStale = false;
  const copy = STATUS_COPY[effectiveStatus];
  const scheduledOpen = state.scheduledOpen;
  const openingTimePresets = includePresets ? await getOpeningTimePresets(env) : [];

  return {
    status: effectiveStatus,
    storedStatus,
    label: copy.label,
    sentence: copy.sentence,
    icon: copy.icon,
    message: storedMessage,
    storedMessage,
    updatedAt,
    updatedBy,
    isStale,
    scheduledOpen,
    openingTimePresets,
    timezone: TIMEZONE,
    generatedAt: now.toISOString(),
  };
}

async function ensureScheduleTables(env: Env): Promise<void> {
  await env.SIGNAGE_DB.batch([
    env.SIGNAGE_DB.prepare(
      "CREATE TABLE IF NOT EXISTS library_open_schedule (id INTEGER PRIMARY KEY CHECK (id = 1), opens_at TEXT, time_value TEXT, updated_at TEXT NOT NULL, updated_by TEXT NOT NULL)",
    ),
    env.SIGNAGE_DB.prepare(
      "CREATE TABLE IF NOT EXISTS library_opening_presets (id INTEGER PRIMARY KEY AUTOINCREMENT, time_value TEXT NOT NULL UNIQUE, label TEXT NOT NULL, created_at TEXT NOT NULL, created_by TEXT NOT NULL)",
    ),
    env.SIGNAGE_DB.prepare(
      "INSERT INTO library_open_schedule (id, opens_at, time_value, updated_at, updated_by) VALUES (1, NULL, NULL, ?, 'Library staff') ON CONFLICT(id) DO NOTHING",
    ).bind(new Date().toISOString()),
  ]);
}

async function getScheduledOpen(env: Env, now: Date): Promise<ScheduledOpen | null> {
  const row = await env.SIGNAGE_DB.prepare(
    "SELECT opens_at, time_value FROM library_open_schedule WHERE id = 1",
  ).first<ScheduleRow>();

  if (!row?.opens_at || !row.time_value) {
    return null;
  }

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

async function getOpeningTimePresets(env: Env): Promise<OpeningTimePreset[]> {
  const result = await env.SIGNAGE_DB.prepare(
    "SELECT id, time_value, label FROM library_opening_presets ORDER BY time_value ASC",
  ).all<OpeningTimePresetRow>();

  return result.results.map((row) => ({
    id: row.id,
    timeValue: row.time_value,
    label: row.label,
  }));
}

function isSameNewYorkDate(isoTimestamp: string, now: Date): boolean {
  const updated = new Date(isoTimestamp);
  if (Number.isNaN(updated.getTime())) {
    return false;
  }

  return newYorkDateKey(updated) === newYorkDateKey(now);
}

function resolveScheduledOpenTime(timeValue: string, now: Date): ScheduledOpen | null {
  const normalizedTime = normalizeTimeValue(timeValue);
  if (normalizedTime === null) {
    return null;
  }

  const opensAt = newYorkDateTimeToUtc(newYorkDateKey(now), normalizedTime);
  if (opensAt.getTime() <= now.getTime()) {
    return null;
  }

  return {
    opensAt: opensAt.toISOString(),
    timeValue: normalizedTime,
    label: formatTimeValue(normalizedTime),
  };
}

function normalizeTimeValue(timeValue: string): string | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(timeValue.trim());
  if (match === null) {
    return null;
  }

  return `${match[1]}:${match[2]}`;
}

function formatTimeValue(timeValue: string): string {
  const normalizedTime = normalizeTimeValue(timeValue);
  if (normalizedTime === null) {
    return timeValue;
  }

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

function normalizeMessage(message: string): string {
  return message.trim().slice(0, 180);
}

function isStatus(status: string): status is Status {
  return VALID_STATUSES.has(status as Status);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: API_HEADERS,
  });
}

function html(markup: string, status = 200): Response {
  return new Response(markup, {
    status,
    headers: HTML_HEADERS,
  });
}

function methodNotAllowed(allowedMethods: string[]): Response {
  return json(
    {
      error: "Method not allowed.",
      allowedMethods,
    },
    405,
  );
}

function notFound(pathname: string): Response {
  return json(
    {
      error: "Not found.",
      path: pathname,
    },
    404,
  );
}

function securityHeaders(): Record<string, string> {
  return {
    "Content-Security-Policy":
      "default-src 'none'; base-uri 'none'; connect-src 'self'; form-action 'self'; img-src 'self' data:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; object-src 'none'; upgrade-insecure-requests",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
  };
}

function viewHtml(): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Library Status</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f7f4ea;
      --ink: #17212b;
      --muted: #536170;
      --panel: #ffffff;
      --line: rgba(23, 33, 43, 0.18);
      --open: #1f7a4d;
      --capacity: #956700;
      --closed: #9f2d32;
      --accent: var(--closed);
    }

    * {
      box-sizing: border-box;
    }

    html,
    body {
      width: 100%;
      height: 100%;
      margin: 0;
    }

    body {
      min-height: 100vh;
      background:
        linear-gradient(90deg, rgba(23, 33, 43, 0.06) 1px, transparent 1px),
        linear-gradient(180deg, rgba(23, 33, 43, 0.04) 1px, transparent 1px),
        var(--bg);
      background-size: 72px 72px;
      color: var(--ink);
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      overflow: hidden;
    }

    .screen {
      width: 100vw;
      height: 100vh;
      display: grid;
      grid-template-rows: auto 1fr auto;
      padding: clamp(28px, 3.2vw, 62px);
      gap: clamp(14px, 2vw, 32px);
      border-top: clamp(10px, 1vw, 18px) solid var(--accent);
    }

    header,
    footer {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 32px;
      color: var(--muted);
      font-weight: 800;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }

    .school {
      font-size: clamp(20px, 1.7vw, 34px);
    }

    .time {
      font-size: clamp(18px, 1.4vw, 28px);
      text-align: center;
    }

    main {
      display: grid;
      place-items: center;
      min-height: 0;
      text-align: center;
    }

    main > section {
      min-width: 0;
    }

    h1 {
      margin: 0;
      color: var(--ink);
      font-size: clamp(92px, 13vw, 230px);
      line-height: 0.86;
      letter-spacing: 0;
      font-weight: 950;
    }

    .status {
      margin-top: clamp(18px, 2.3vw, 42px);
      color: var(--accent);
      font-size: clamp(96px, 13.5vw, 242px);
      line-height: 0.88;
      letter-spacing: 0;
      font-weight: 950;
      text-transform: uppercase;
    }

    [data-status="capacity"] .status {
      font-size: clamp(88px, 10.5vw, 188px);
    }

    .sentence {
      display: none;
      max-width: 1200px;
      margin-top: clamp(18px, 2.2vw, 38px);
      font-size: clamp(30px, 3.4vw, 62px);
      line-height: 1.08;
      font-weight: 800;
    }

    .message {
      display: none;
      max-width: min(1120px, 86vw);
      margin: clamp(18px, 2vw, 34px) auto 0;
      padding: clamp(16px, 1.8vw, 28px) clamp(22px, 2.2vw, 40px);
      border-top: clamp(8px, 0.7vw, 14px) solid var(--accent);
      border-left: 0;
      background: rgba(255, 255, 255, 0.76);
      font-size: clamp(34px, 3.3vw, 62px);
      line-height: 1.16;
      font-weight: 750;
    }

    .message[data-visible="true"] {
      display: block;
    }

    .countdown {
      display: none;
      margin-top: clamp(20px, 2.4vw, 40px);
      color: var(--accent);
      text-align: center;
    }

    .countdown[data-visible="true"] {
      display: block;
    }

    .countdown-label {
      color: var(--muted);
      font-size: clamp(24px, 2.2vw, 44px);
      font-weight: 850;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }

    .countdown-value {
      margin-top: clamp(4px, 0.7vw, 12px);
      font-size: clamp(64px, 7vw, 132px);
      line-height: 0.95;
      font-weight: 950;
      letter-spacing: 0;
    }

    .countdown-time {
      margin-top: clamp(6px, 0.8vw, 14px);
      color: var(--muted);
      font-size: clamp(20px, 1.8vw, 34px);
      font-weight: 800;
    }

    [data-countdown="true"] h1 {
      font-size: clamp(84px, 10vw, 180px);
    }

    [data-countdown="true"] .status {
      font-size: clamp(92px, 11vw, 198px);
    }

    [data-countdown="true"] .message {
      font-size: clamp(30px, 2.8vw, 52px);
      margin-top: clamp(14px, 1.6vw, 26px);
    }

    [data-countdown="true"] .countdown {
      margin-top: clamp(14px, 1.8vw, 30px);
    }

    [data-countdown="true"] .countdown-value {
      font-size: clamp(58px, 5.8vw, 110px);
    }

    [data-countdown="true"] .countdown-time {
      font-size: clamp(18px, 1.5vw, 28px);
    }

    [data-countdown="true"] .updated {
      font-size: clamp(16px, 1.4vw, 26px);
    }

    .symbol {
      display: none;
    }

    .symbol svg {
      width: 62%;
      height: 62%;
      color: var(--accent);
      stroke-width: 2.4;
    }

    .updated {
      font-size: clamp(18px, 1.7vw, 32px);
      letter-spacing: 0.02em;
      text-transform: none;
      font-weight: 750;
    }

    .stale {
      color: var(--closed);
    }

    [data-status="open"] {
      --accent: var(--open);
    }

    [data-status="capacity"] {
      --accent: var(--capacity);
    }

    [data-status="closed"] {
      --accent: var(--closed);
    }

    /* Full-screen TV signage */
    :root {
      --ink: #171a1f;
      --muted: #5f6770;
      --open: #147a43;
      --capacity: #9a6400;
      --closed: #a52832;
      --wash: #f7f4ea;
    }

    [data-status="open"] { --wash: #edf7f1; }
    [data-status="capacity"] { --wash: #fff7df; }
    [data-status="closed"] { --wash: #fbefef; }

    body {
      background: var(--wash);
      background-image: none;
      font-family: -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif;
    }

    .screen {
      padding: clamp(30px, 3.2vw, 62px) clamp(38px, 4.2vw, 82px);
      gap: clamp(16px, 1.6vw, 30px);
      border: 0;
      border-top: clamp(20px, 1.6vw, 32px) solid var(--accent);
    }

    header,
    footer {
      letter-spacing: 0;
      text-transform: none;
    }

    header { justify-content: flex-end; }
    footer { justify-content: flex-start; }

    .time {
      color: var(--muted);
      font-size: clamp(20px, 1.5vw, 30px);
      font-weight: 700;
    }

    main > section { width: 100%; }

    h1 {
      color: var(--muted);
      font-size: clamp(42px, 4vw, 76px);
      line-height: 1;
      letter-spacing: .16em;
      font-weight: 800;
    }

    .status {
      margin-top: clamp(16px, 1.8vw, 32px);
      font-size: clamp(150px, 17vw, 310px);
      line-height: .8;
      letter-spacing: -.065em;
      font-weight: 950;
    }

    [data-status="capacity"] .status {
      font-size: clamp(116px, 13vw, 238px);
    }

    .sentence {
      display: none;
      max-width: 1400px;
      margin: clamp(28px, 3vw, 54px) auto 0;
      color: var(--ink);
      font-size: clamp(34px, 3.2vw, 62px);
      line-height: 1.08;
      font-weight: 750;
      letter-spacing: -.025em;
    }

    .message {
      max-width: min(1480px, 94vw);
      margin-top: clamp(26px, 2.6vw, 46px);
      padding: clamp(18px, 1.6vw, 30px) clamp(28px, 2.6vw, 50px);
      border: 0;
      border-radius: 18px;
      background: rgba(255, 255, 255, .72);
      box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--accent) 16%, transparent);
      font-size: clamp(30px, 2.8vw, 54px);
      line-height: 1.12;
      font-weight: 750;
    }

    .countdown {
      margin-top: clamp(24px, 2.4vw, 42px);
    }

    .countdown-label { font-size: clamp(22px, 1.9vw, 38px); letter-spacing: .06em; }
    .countdown-value { font-size: clamp(76px, 7.5vw, 142px); }
    .countdown-time { font-size: clamp(22px, 1.8vw, 36px); }

    [data-countdown="true"] h1 { font-size: clamp(34px, 3vw, 58px); }
    [data-countdown="true"] .status { font-size: clamp(108px, 11vw, 204px); }
    [data-countdown="true"][data-status="capacity"] .status { font-size: clamp(86px, 9vw, 168px); }
    [data-countdown="true"] .sentence { font-size: clamp(28px, 2.5vw, 48px); margin-top: clamp(18px, 1.8vw, 30px); }

    .updated {
      color: var(--muted);
      font-size: clamp(16px, 1.3vw, 25px);
      font-weight: 650;
      letter-spacing: 0;
    }

    @media (max-aspect-ratio: 4 / 3) {
      body {
        overflow: auto;
      }

      .screen {
        min-height: 100vh;
        height: auto;
      }

      main {
        place-items: center;
      }

      .symbol {
        display: none;
      }
    }
  </style>
</head>
<body data-status="closed">
  <div class="screen" aria-live="polite">
    <header>
      <div class="time" id="clock"></div>
    </header>
    <main>
      <section>
        <h1>LIBRARY</h1>
        <div class="status" id="status-label">CLOSED</div>
        <div class="sentence" id="sentence">The library is currently unavailable.</div>
        <div class="message" id="message"></div>
        <div class="countdown" id="countdown">
          <div class="countdown-label">Opening In</div>
          <div class="countdown-value" id="countdown-value"></div>
          <div class="countdown-time" id="countdown-time"></div>
        </div>
      </section>
      <div class="symbol" id="symbol" aria-hidden="true"></div>
    </main>
    <footer>
      <div class="updated" id="updated">Last updated unavailable</div>
      <div class="updated stale" id="stale-note" hidden>Showing closed until staff updates today</div>
    </footer>
  </div>
  <script>
    let countdownTarget = null;
    let countdownLabel = '';

    const iconMap = {
      check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
      pause: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M6 5v14"/><path d="M18 5v14"/></svg>',
      x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>',
    };

    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      weekday: 'short',
      hour: 'numeric',
      minute: '2-digit',
    });

    const updatedFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });

    function updateClock() {
      document.getElementById('clock').textContent = formatter.format(new Date());
    }

    function render(data) {
      document.body.dataset.status = data.status;
      document.getElementById('status-label').textContent = data.label;
      document.getElementById('sentence').textContent = data.sentence;
      document.getElementById('symbol').innerHTML = iconMap[data.icon] || iconMap.x;
      document.getElementById('stale-note').hidden = !data.isStale;

      const message = document.getElementById('message');
      message.textContent = data.message || '';
      message.dataset.visible = data.message ? 'true' : 'false';

      countdownTarget = data.scheduledOpen ? new Date(data.scheduledOpen.opensAt) : null;
      countdownLabel = data.scheduledOpen ? data.scheduledOpen.label : '';
      updateCountdown();

      const updated = new Date(data.updatedAt);
      const updatedText = Number.isNaN(updated.getTime())
        ? 'Last updated unavailable'
        : 'Last updated ' + updatedFormatter.format(updated);
      document.getElementById('updated').textContent = updatedText;
    }

    async function refresh() {
      try {
        const response = await fetch('/api/status', { cache: 'no-store' });
        if (!response.ok) throw new Error('Status request failed');
        render(await response.json());
      } catch {
        render({
          status: 'closed',
          label: 'CLOSED',
          sentence: 'The library is currently unavailable.',
          icon: 'x',
          message: '',
          scheduledOpen: null,
          updatedAt: '',
          isStale: false,
        });
        document.getElementById('updated').textContent = 'Unable to refresh status';
      }
    }

    function updateCountdown() {
      const countdown = document.getElementById('countdown');
      const value = document.getElementById('countdown-value');
      const time = document.getElementById('countdown-time');

      if (!(countdownTarget instanceof Date) || Number.isNaN(countdownTarget.getTime())) {
        document.body.dataset.countdown = 'false';
        countdown.dataset.visible = 'false';
        value.textContent = '';
        time.textContent = '';
        return;
      }

      const remainingMs = countdownTarget.getTime() - Date.now();
      if (remainingMs <= 0) {
        document.body.dataset.countdown = 'false';
        countdown.dataset.visible = 'false';
        value.textContent = '';
        time.textContent = '';
        return;
      }

      const totalSeconds = Math.ceil(remainingMs / 1000);
      const hours = Math.floor(totalSeconds / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      const seconds = totalSeconds % 60;

      document.body.dataset.countdown = 'true';
      countdown.dataset.visible = 'true';
      if (hours > 0) {
        value.textContent = hours + 'h ' + String(minutes).padStart(2, '0') + 'm';
      } else if (minutes > 0) {
        value.textContent = minutes + ' min';
      } else {
        value.textContent = seconds + ' sec';
      }
      time.textContent = 'Scheduled for ' + countdownLabel;
    }

    updateClock();
    refresh();
    setInterval(updateClock, 15000);
    setInterval(updateCountdown, 1000);
    setInterval(refresh, 20000);
  </script>
</body>
</html>`;
}

function manageHtml(): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Library Signage Dashboard</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #eef2f5;
      --ink: #17212b;
      --muted: #5a6775;
      --panel: #ffffff;
      --line: #d5dde5;
      --open: #1f7a4d;
      --capacity: #956700;
      --closed: #9f2d32;
      --focus: #1f5eff;
    }

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      min-height: 100vh;
      background: var(--bg);
      color: var(--ink);
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }

    .wrap {
      width: min(1040px, 100%);
      margin: 0 auto;
      padding: 24px;
    }

    header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 20px;
      margin: 10px 0 24px;
    }

    h1 {
      margin: 0;
      font-size: clamp(32px, 5vw, 54px);
      line-height: 1;
      letter-spacing: 0;
    }

    .subhead {
      margin-top: 10px;
      color: var(--muted);
      font-size: 17px;
      font-weight: 650;
    }

    .layout {
      display: grid;
      grid-template-columns: minmax(0, 1.35fr) minmax(280px, 0.65fr);
      gap: 18px;
      align-items: start;
    }

    .panel {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      box-shadow: 0 12px 34px rgba(23, 33, 43, 0.08);
    }

    .panel-inner {
      padding: 20px;
    }

    h2 {
      margin: 0 0 16px;
      font-size: 21px;
      letter-spacing: 0;
    }

    .status-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 12px;
    }

    .status-button {
      min-height: 132px;
      border: 2px solid var(--line);
      border-radius: 8px;
      background: #f9fbfc;
      color: var(--ink);
      cursor: pointer;
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      justify-content: space-between;
      padding: 18px;
      text-align: left;
      transition: border-color 140ms ease, box-shadow 140ms ease, transform 140ms ease;
    }

    .status-button:hover {
      transform: translateY(-1px);
      box-shadow: 0 10px 22px rgba(23, 33, 43, 0.12);
    }

    .status-button:focus-visible,
    textarea:focus-visible {
      outline: 3px solid var(--focus);
      outline-offset: 2px;
    }

    .status-button[aria-pressed="true"] {
      border-color: var(--button-color);
      box-shadow: inset 0 0 0 2px var(--button-color);
      background: #ffffff;
    }

    .button-icon {
      width: 44px;
      height: 44px;
      display: grid;
      place-items: center;
      border-radius: 50%;
      color: #ffffff;
      background: var(--button-color);
      font-size: 26px;
      font-weight: 950;
    }

    .button-label {
      font-size: clamp(20px, 2.2vw, 28px);
      line-height: 1;
      font-weight: 900;
    }

    .open {
      --button-color: var(--open);
    }

    .capacity {
      --button-color: var(--capacity);
    }

    .closed {
      --button-color: var(--closed);
    }

    label {
      display: block;
      margin-top: 20px;
      color: var(--ink);
      font-size: 16px;
      font-weight: 800;
    }

    textarea {
      width: 100%;
      min-height: 118px;
      margin-top: 8px;
      padding: 14px;
      resize: vertical;
      border: 1px solid var(--line);
      border-radius: 8px;
      color: var(--ink);
      font: inherit;
      line-height: 1.4;
    }

    select,
    input[type="time"] {
      width: 100%;
      min-height: 48px;
      margin-top: 8px;
      padding: 0 12px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #ffffff;
      color: var(--ink);
      font: inherit;
      font-weight: 700;
    }

    select:focus-visible,
    input[type="time"]:focus-visible {
      outline: 3px solid var(--focus);
      outline-offset: 2px;
    }

    .schedule-grid {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(150px, 0.5fr);
      gap: 12px;
      align-items: end;
    }

    .check-row {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-top: 12px;
      color: var(--muted);
      font-size: 14px;
      font-weight: 750;
    }

    .check-row input {
      width: 18px;
      height: 18px;
      accent-color: var(--ink);
    }

    .field-row {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      margin-top: 8px;
      color: var(--muted);
      font-size: 14px;
      font-weight: 650;
    }

    .save {
      width: 100%;
      min-height: 56px;
      margin-top: 18px;
      border: 0;
      border-radius: 8px;
      background: var(--ink);
      color: #ffffff;
      cursor: pointer;
      font-size: 18px;
      font-weight: 900;
    }

    .save:disabled {
      cursor: wait;
      opacity: 0.65;
    }

    .notice {
      min-height: 24px;
      margin-top: 14px;
      color: var(--open);
      font-weight: 800;
    }

    .notice.error {
      color: var(--closed);
    }

    .current {
      display: grid;
      gap: 14px;
    }

    .current-status {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 16px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #f9fbfc;
    }

    .dot {
      width: 18px;
      height: 18px;
      flex: 0 0 auto;
      border-radius: 50%;
      background: var(--closed);
    }

    .dot[data-status="open"] {
      background: var(--open);
    }

    .dot[data-status="capacity"] {
      background: var(--capacity);
    }

    .dot[data-status="closed"] {
      background: var(--closed);
    }

    .current-label {
      font-size: 25px;
      font-weight: 950;
    }

    .detail {
      padding-top: 14px;
      border-top: 1px solid var(--line);
    }

    .detail-title {
      color: var(--muted);
      font-size: 12px;
      font-weight: 850;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }

    .detail-value {
      margin-top: 5px;
      font-size: 16px;
      font-weight: 750;
      overflow-wrap: anywhere;
    }

    .stale {
      display: none;
      padding: 12px 14px;
      border: 1px solid rgba(159, 45, 50, 0.25);
      border-radius: 8px;
      background: rgba(159, 45, 50, 0.08);
      color: var(--closed);
      font-weight: 800;
    }

    .stale[data-visible="true"] {
      display: block;
    }

    .brand-footer {
      display: flex;
      justify-content: center;
      margin: 28px 0 4px;
      color: #89939f;
    }

    .brand-footer svg {
      display: block;
      width: min(280px, 58vw);
      height: auto;
    }

    .brand-footer svg,
    .brand-footer svg * {
      fill: currentColor !important;
    }

    @media (max-width: 820px) {
      .wrap {
        padding: 16px;
      }

      header,
      .layout {
        grid-template-columns: 1fr;
      }

      header {
        display: grid;
      }

      .status-grid {
        grid-template-columns: 1fr;
      }

      .schedule-grid {
        grid-template-columns: 1fr;
      }

      .status-button {
        min-height: 96px;
        flex-direction: row;
        align-items: center;
      }
    }
  </style>
</head>
<body>
  <div class="wrap">
    <header>
      <div>
        <h1>Library Signage</h1>
        <div class="subhead">Lunch status controls</div>
      </div>
    </header>

    <main class="layout">
      <section class="panel">
        <div class="panel-inner">
          <h2>Set Status</h2>
          <div class="status-grid" role="group" aria-label="Library status">
            <button class="status-button open" type="button" data-value="open" aria-pressed="false">
              <span class="button-icon" aria-hidden="true">✓</span>
              <span class="button-label">Open</span>
            </button>
            <button class="status-button capacity" type="button" data-value="capacity" aria-pressed="false">
              <span class="button-icon" aria-hidden="true">II</span>
              <span class="button-label">At Capacity</span>
            </button>
            <button class="status-button closed" type="button" data-value="closed" aria-pressed="true">
              <span class="button-icon" aria-hidden="true">×</span>
              <span class="button-label">Closed</span>
            </button>
          </div>

          <label for="message">Optional message</label>
          <textarea id="message" maxlength="180" placeholder="Example: Book club is meeting today."></textarea>
          <div class="field-row">
            <span>Shown on the cafeteria display when status is current.</span>
            <span id="count">0/180</span>
          </div>

          <div class="schedule-grid">
            <div>
              <label for="preset">Saved opening times</label>
              <select id="preset">
                <option value="">Choose a saved time</option>
              </select>
            </div>
            <div>
              <label for="opening-time">Scheduled open</label>
              <input id="opening-time" type="time">
            </div>
          </div>
          <label class="check-row" for="save-opening-time">
            <input id="save-opening-time" type="checkbox">
            <span>Save this opening time</span>
          </label>

          <button class="save" id="save" type="button">Update Display</button>
          <div class="notice" id="notice" role="status" aria-live="polite"></div>
        </div>
      </section>

      <aside class="panel">
        <div class="panel-inner current">
          <h2>Current Display</h2>
          <div class="current-status">
            <span class="dot" id="dot" data-status="closed"></span>
            <span class="current-label" id="current-label">Closed</span>
          </div>
          <div class="stale" id="stale">The last saved status is from a previous New York date, so the public display is showing Closed.</div>
          <div class="detail">
            <div class="detail-title">Message</div>
            <div class="detail-value" id="current-message">No message</div>
          </div>
          <div class="detail">
            <div class="detail-title">Scheduled Open</div>
            <div class="detail-value" id="current-scheduled-open">Not scheduled</div>
          </div>
          <div class="detail">
            <div class="detail-title">Last Updated</div>
            <div class="detail-value" id="updated">Loading</div>
          </div>
          <div class="detail">
            <div class="detail-title">Updated By</div>
            <div class="detail-value" id="updated-by">Library staff</div>
          </div>
        </div>
      </aside>
    </main>

    <footer class="brand-footer" aria-label="Weekly Wildcat">
      ${MANAGE_LOGO_SVG}
    </footer>
  </div>

  <script>
    const buttons = [...document.querySelectorAll('.status-button')];
    const message = document.getElementById('message');
    const count = document.getElementById('count');
    const save = document.getElementById('save');
    const notice = document.getElementById('notice');
    const preset = document.getElementById('preset');
    const openingTime = document.getElementById('opening-time');
    const saveOpeningTime = document.getElementById('save-opening-time');
    const updatedFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
    let selected = 'closed';

    function titleFor(status) {
      return status === 'capacity' ? 'At Capacity' : status.charAt(0).toUpperCase() + status.slice(1);
    }

    function renderPresets(presets, selectedTime) {
      const placeholder = '<option value="">Choose a saved time</option>';
      preset.innerHTML = placeholder + (presets || [])
        .map((item) => '<option value="' + item.timeValue + '">' + item.label + '</option>')
        .join('');
      preset.value = selectedTime || '';
    }

    function select(status) {
      selected = status;
      for (const button of buttons) {
        button.setAttribute('aria-pressed', String(button.dataset.value === status));
      }
    }

    function setNotice(text, isError = false) {
      notice.textContent = text;
      notice.classList.toggle('error', isError);
    }

    function updateCount() {
      count.textContent = message.value.length + '/180';
    }

    function render(data) {
      select(data.storedStatus || data.status);
      message.value = data.storedMessage || '';
      updateCount();
      const scheduledTimeValue = data.scheduledOpen ? data.scheduledOpen.timeValue : '';
      openingTime.value = scheduledTimeValue;
      saveOpeningTime.checked = false;
      renderPresets(data.openingTimePresets || [], scheduledTimeValue);

      document.getElementById('dot').dataset.status = data.status;
      document.getElementById('current-label').textContent = data.label || titleFor(data.status);
      document.getElementById('current-message').textContent = data.storedMessage || 'No message';
      document.getElementById('current-scheduled-open').textContent = data.scheduledOpen
        ? data.scheduledOpen.label
        : 'Not scheduled';
      document.getElementById('updated-by').textContent = data.updatedBy || 'Library staff';
      document.getElementById('stale').dataset.visible = data.isStale ? 'true' : 'false';

      const updated = new Date(data.updatedAt);
      document.getElementById('updated').textContent = Number.isNaN(updated.getTime())
        ? 'Unavailable'
        : updatedFormatter.format(updated);
    }

    async function refresh() {
      const response = await fetch('/manage/api/status', { cache: 'no-store' });
      if (!response.ok) throw new Error('Could not load status');
      render(await response.json());
    }

    async function submit() {
      save.disabled = true;
      setNotice('Updating display...');
      try {
        const response = await fetch('/manage/api/status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            status: selected,
            message: message.value,
            scheduledOpenTime: openingTime.value || null,
            saveOpeningTime: saveOpeningTime.checked,
          }),
        });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || 'Update failed');
        setNotice('Display updated.');
        await refresh();
      } catch (error) {
        setNotice(error instanceof Error ? error.message : 'Update failed', true);
      } finally {
        save.disabled = false;
      }
    }

    for (const button of buttons) {
      button.addEventListener('click', () => select(button.dataset.value));
    }
    message.addEventListener('input', updateCount);
    preset.addEventListener('change', () => {
      if (preset.value) {
        openingTime.value = preset.value;
      }
    });
    save.addEventListener('click', submit);

    refresh().catch((error) => setNotice(error instanceof Error ? error.message : 'Could not load status', true));
  </script>
</body>
</html>`;
}
