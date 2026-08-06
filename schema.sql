-- Library check-in/out schema. Keep this file aligned with library-schema.sql.

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

CREATE TABLE IF NOT EXISTS library_sheet_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  synced_at TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT
);

CREATE INDEX IF NOT EXISTS idx_library_sheet_events_pending
  ON library_sheet_events(synced_at, attempts, id);

CREATE TABLE IF NOT EXISTS library_kiosk_pairing_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pin_hash TEXT NOT NULL UNIQUE,
  device_name TEXT NOT NULL DEFAULT 'Unnamed Chromebook',
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
