-- Library check-in tables for the Weekly Wildcat signage D1 database.
-- Apply with:
-- npx wrangler d1 execute wildcat-signage --remote --file=library-schema.sql

CREATE TABLE IF NOT EXISTS library_students (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id TEXT NOT NULL UNIQUE,
  barcode TEXT NOT NULL UNIQUE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  grade TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS library_visits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_row_id INTEGER NOT NULL,
  student_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  checked_in_at TEXT NOT NULL,
  checked_out_at TEXT,
  checkout_method TEXT,
  checked_out_by TEXT,
  FOREIGN KEY (student_row_id) REFERENCES library_students(id)
);

CREATE INDEX IF NOT EXISTS idx_library_visits_active
  ON library_visits(checked_out_at, checked_in_at);

CREATE INDEX IF NOT EXISTS idx_library_visits_student_active
  ON library_visits(student_row_id, checked_out_at);

CREATE TABLE IF NOT EXISTS library_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  status_mode TEXT NOT NULL DEFAULT 'auto' CHECK (status_mode IN ('auto', 'manual')),
  manual_status TEXT NOT NULL DEFAULT 'open' CHECK (manual_status IN ('open', 'capacity', 'closed')),
  capacity INTEGER NOT NULL DEFAULT 25,
  custom_message TEXT NOT NULL DEFAULT '',
  show_public_count INTEGER NOT NULL DEFAULT 1,
  auto_capacity_enabled INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL
);

INSERT INTO library_settings (
  id,
  status_mode,
  manual_status,
  capacity,
  custom_message,
  show_public_count,
  auto_capacity_enabled,
  updated_at,
  updated_by
)
VALUES (
  1,
  'auto',
  'open',
  25,
  '',
  1,
  1,
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
  'Library staff'
)
ON CONFLICT(id) DO NOTHING;

CREATE TABLE IF NOT EXISTS library_app_migrations (
  name TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL
);

UPDATE library_settings
SET show_public_count = 1
WHERE id = 1
  AND NOT EXISTS (
    SELECT 1 FROM library_app_migrations WHERE name = 'default_tv_count_on_v17'
  );

INSERT INTO library_app_migrations (name, applied_at)
SELECT 'default_tv_count_on_v17', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE NOT EXISTS (
  SELECT 1 FROM library_app_migrations WHERE name = 'default_tv_count_on_v17'
);

CREATE TABLE IF NOT EXISTS library_sheet_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  synced_at TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT
);

CREATE TABLE IF NOT EXISTS library_status (
  id INTEGER PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('open', 'capacity', 'closed')),
  message TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS library_status_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  status TEXT NOT NULL CHECK (status IN ('open', 'capacity', 'closed')),
  message TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS library_open_schedule (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  opens_at TEXT,
  time_value TEXT,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS library_opening_presets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  time_value TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS library_kiosk_pairing_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pin_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_library_kiosk_pairing_active
  ON library_kiosk_pairing_codes(expires_at, used_at);

CREATE TABLE IF NOT EXISTS library_kiosk_devices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  last_seen_at TEXT,
  revoked_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_library_kiosk_devices_active
  ON library_kiosk_devices(revoked_at, last_seen_at);

INSERT INTO library_open_schedule (id, opens_at, time_value, updated_at, updated_by)
VALUES (1, NULL, NULL, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 'Library staff')
ON CONFLICT(id) DO NOTHING;
