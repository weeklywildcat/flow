const SECRET = PropertiesService.getScriptProperties().getProperty('LIBRARY_SYNC_SECRET');

function doPost(e) {
  const incomingSecret = e.parameter.secret || '';
  if (!SECRET || incomingSecret !== SECRET) {
    return json_({ ok: false, error: 'Unauthorized' }, 403);
  }

  const payload = JSON.parse(e.postData.contents || '{}');
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  appendEvent_(ss, payload);

  if (payload.event === 'SIGN_IN') {
    appendVisit_(ss, payload);
  }

  if (
    payload.event === 'SIGN_OUT' ||
    payload.event === 'CLEAR_ALL' ||
    payload.event === 'AUTO_CLEAR'
  ) {
    updateVisit_(ss, payload);
  }

  return json_({ ok: true });
}

function appendEvent_(ss, payload) {
  const sheet = getSheet_(ss, 'Events', [
    'Timestamp',
    'Event',
    'Student ID',
    'Student Name',
    'Visit ID',
    'Reason',
    'Method',
    'Actor'
  ]);

  sheet.appendRow([
    payload.timestamp || new Date().toISOString(),
    payload.event || '',
    payload.studentId || '',
    [payload.firstName, payload.lastName].filter(Boolean).join(' '),
    payload.visitId || '',
    payload.reason || '',
    payload.checkoutMethod || '',
    payload.actor || ''
  ]);
}

function appendVisit_(ss, payload) {
  const sheet = getSheet_(ss, 'Visit Log', [
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
    'Checkout Method'
  ]);

  sheet.appendRow([
    payload.visitId || '',
    dateOnly_(payload.checkIn || payload.timestamp),
    payload.studentId || '',
    payload.firstName || '',
    payload.lastName || '',
    payload.grade || '',
    payload.reason || '',
    payload.checkIn || payload.timestamp || '',
    '',
    '',
    ''
  ]);
}

function updateVisit_(ss, payload) {
  const sheet = getSheet_(ss, 'Visit Log', []);
  const values = sheet.getDataRange().getValues();
  const visitId = String(payload.visitId || '');

  for (let row = values.length; row >= 2; row--) {
    if (String(values[row - 1][0]) === visitId) {
      sheet.getRange(row, 9).setValue(payload.checkOut || payload.timestamp || '');
      sheet.getRange(row, 10).setValue(payload.durationMinutes || '');
      sheet.getRange(row, 11).setValue(payload.checkoutMethod || payload.event || '');
      return;
    }
  }

  appendVisit_(ss, payload);
  updateVisit_(ss, payload);
}

function getSheet_(ss, name, headers) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
  }

  if (headers.length && sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
  }

  return sheet;
}

function dateOnly_(iso) {
  if (!iso) return '';
  return Utilities.formatDate(new Date(iso), 'America/New_York', 'yyyy-MM-dd');
}

function json_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
