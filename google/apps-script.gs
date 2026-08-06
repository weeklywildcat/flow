// Google Apps Script web-app receiver for the library check-in/out archive.
//
// Required Script Properties:
//   LIBRARY_SPREADSHEET_ID - the destination spreadsheet ID
//   LIBRARY_SYNC_SECRET    - the same value as the Worker secret
//
// Optional Script Property:
//   LIBRARY_TIME_ZONE      - defaults to America/New_York

const SCRIPT_PROPERTIES = PropertiesService.getScriptProperties();
const EVENTS_SHEET_NAME = 'Events';
const VISITS_SHEET_NAME = 'Visit Log';

function doGet() {
  return json_({ ok: true, service: 'library-sheets-sync' });
}

function doPost(e) {
  let lock = null;

  try {
    const expectedSecret = SCRIPT_PROPERTIES.getProperty('LIBRARY_SYNC_SECRET') || '';
    const incomingSecret = e && e.parameter && e.parameter.secret ? e.parameter.secret : '';
    if (!expectedSecret || incomingSecret !== expectedSecret) {
      return json_({ ok: false, error: 'Unauthorized' });
    }

    const payload = parsePayload_(e);
    const syncId = syncId_(payload);
    if (!syncId) {
      return json_({ ok: false, error: 'Missing sheetEventId' });
    }

    lock = LockService.getScriptLock();
    lock.waitLock(20000);

    const spreadsheet = getSpreadsheet_();
    const eventsSheet = getEventsSheet_(spreadsheet);
    if (hasEvent_(eventsSheet, payload, syncId)) {
      return json_({ ok: true, duplicate: true, sheetEventId: syncId });
    }

    if (payload.event === 'SIGN_IN') {
      upsertVisit_(spreadsheet, payload);
    } else if (isCheckoutEvent_(payload.event)) {
      upsertVisit_(spreadsheet, payload);
    }

    // Append the idempotency record only after the visit operation succeeds.
    // If a request fails midway, the retry can safely finish the visit update.
    appendEvent_(eventsSheet, payload, syncId);
    return json_({ ok: true, duplicate: false, sheetEventId: syncId });
  } catch (error) {
    console.error(JSON.stringify({
      event: 'library_sheets_receiver_error',
      error: error && error.message ? error.message : String(error),
    }));
    return json_({ ok: false, error: error && error.message ? error.message : String(error) });
  } finally {
    if (lock) {
      lock.releaseLock();
    }
  }
}

function parsePayload_(e) {
  const contents = e && e.postData && e.postData.contents ? e.postData.contents : '';
  const payload = JSON.parse(contents || '{}');
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Request body must be a JSON object');
  }
  return payload;
}

function getSpreadsheet_() {
  const spreadsheetId = SCRIPT_PROPERTIES.getProperty('LIBRARY_SPREADSHEET_ID') || '';
  if (!spreadsheetId) {
    throw new Error('LIBRARY_SPREADSHEET_ID is not configured');
  }
  return SpreadsheetApp.openById(spreadsheetId);
}

function getEventsSheet_(spreadsheet) {
  return getSheet_(spreadsheet, EVENTS_SHEET_NAME, [
    'Sync ID',
    'Timestamp',
    'Event',
    'Student ID',
    'Student Name',
    'Visit ID',
    'Reason',
    'Method',
    'Actor',
  ]);
}

function appendEvent_(sheet, payload, syncId) {
  sheet.appendRow([
    syncId,
    payload.timestamp || new Date().toISOString(),
    payload.event || '',
    payload.studentId || '',
    [payload.firstName, payload.lastName].filter(Boolean).join(' '),
    payload.visitId || '',
    payload.reason || '',
    payload.checkoutMethod || '',
    payload.actor || '',
  ]);
}

function hasEvent_(sheet, payload, syncId) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return false;

  const values = sheet.getRange(2, 1, lastRow - 1, Math.max(sheet.getLastColumn(), 9)).getValues();
  const timestamp = String(payload.timestamp || '');
  const event = String(payload.event || '');
  const visitId = String(payload.visitId || '');
  const studentId = String(payload.studentId || '');

  return values.some((row) => {
    if (String(row[0] || '') === syncId) return true;

    // The first version of this receiver did not write Sync ID. This fallback
    // prevents those already-archived events from being replayed as duplicates
    // when the new idempotent receiver is installed.
    return String(row[1] || '') === timestamp &&
      String(row[2] || '') === event &&
      String(row[5] || '') === visitId &&
      String(row[3] || '') === studentId;
  });
}

function isCheckoutEvent_(event) {
  return event === 'SIGN_OUT' || event === 'CLEAR_ALL' || event === 'AUTO_CLEAR';
}

function upsertVisit_(spreadsheet, payload) {
  const visitId = String(payload.visitId || '');
  if (!visitId) throw new Error('Visit event is missing visitId');

  const sheet = getSheet_(spreadsheet, VISITS_SHEET_NAME, [
    'Visit ID',
    'Date',
    'Student ID',
    'First Name',
    'Last Name',
    'Grade',
    'Reason',
    'Check In',
    'Check Out',
    'Duration Minutes',
    'Checkout Method',
  ]);

  const row = [
    payload.visitId || '',
    dateOnly_(payload.checkIn || payload.timestamp),
    payload.studentId || '',
    payload.firstName || '',
    payload.lastName || '',
    payload.grade || '',
    payload.reason || '',
    payload.checkIn || payload.timestamp || '',
    payload.checkOut || '',
    payload.durationMinutes === undefined || payload.durationMinutes === null ? '' : payload.durationMinutes,
    payload.checkoutMethod || '',
  ];

  const rowNumber = findVisitRow_(sheet, visitId);
  if (!rowNumber) {
    sheet.appendRow(row);
    return;
  }

  const existing = sheet.getRange(rowNumber, 1, 1, row.length).getValues()[0];
  const merged = row.map((value, index) => hasValue_(value) ? value : existing[index]);
  sheet.getRange(rowNumber, 1, 1, merged.length).setValues([merged]);
}

function findVisitRow_(sheet, visitId) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;

  const values = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (let index = values.length - 1; index >= 0; index -= 1) {
    if (String(values[index][0] || '') === visitId) return index + 2;
  }
  return 0;
}

function hasValue_(value) {
  return value !== '' && value !== null && value !== undefined;
}

function syncId_(payload) {
  return payload.sheetEventId === undefined || payload.sheetEventId === null || payload.sheetEventId === ''
    ? ''
    : String(payload.sheetEventId);
}

function getSheet_(spreadsheet, name, headers) {
  let sheet = spreadsheet.getSheetByName(name);
  if (!sheet) sheet = spreadsheet.insertSheet(name);
  ensureHeaders_(sheet, name, headers);
  return sheet;
}

function ensureHeaders_(sheet, name, headers) {
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    return;
  }

  const currentWidth = Math.max(sheet.getLastColumn(), 1);
  const current = sheet.getRange(1, 1, 1, currentWidth).getValues()[0].map(String);

  // Migrate the original Events layout by adding the idempotency column at
  // the front; all original columns retain their meaning after the insert.
  if (name === EVENTS_SHEET_NAME && current[0] !== headers[0]) {
    sheet.insertColumnBefore(1);
    sheet.getRange(1, 1).setValue(headers[0]);
    return;
  }

  if (headers.length > currentWidth) {
    sheet.getRange(1, currentWidth + 1, 1, headers.length - currentWidth)
      .setValues([headers.slice(currentWidth)]);
  }
}

function dateOnly_(iso) {
  if (!iso) return '';
  return Utilities.formatDate(new Date(iso), timeZone_(), 'yyyy-MM-dd');
}

function timeZone_() {
  return SCRIPT_PROPERTIES.getProperty('LIBRARY_TIME_ZONE') || 'America/New_York';
}

function json_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
