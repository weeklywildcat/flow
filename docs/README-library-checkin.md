# Library Check-In / Check-Out

The library Worker is intentionally focused on one workflow: recording who is in the library.

## Student kiosk

- Open `/library/kiosk` on the paired Chromebook with the barcode scanner.
- A known student with no active visit is prompted for a reason and checked in.
- A known student with an active visit is checked out immediately when they scan again.
- A new barcode can be saved with the student’s name and grade, then checked in.

## Librarian dashboard

Open `/library/manage` behind Cloudflare Access. The dashboard shows:

- the current number of students in the library;
- the active student roster, reason, and check-in time;
- a checkout action for each student;
- a “Check everyone out” end-of-day action; and
- Chromebook pairing plus a Google Sheets event archive with automatic retry.

There are no status, capacity, opening-time, or schedule controls. A student can check in regardless of the current count.

## D1 and archive

Apply `library-schema.sql` to the `wildcat-signage` D1 database. Check-in, checkout, clear-all, and new-student events are written to `library_visits` or `library_sheet_events`; the Worker then delivers the queued events to Google Sheets.

## Google Sheets sync

The sync is a full-stack path:

1. The Worker writes each event to D1 before attempting delivery.
2. The Worker sends the event to the Apps Script web app with a shared secret and a D1 event ID.
3. Apps Script writes to the `Events` and `Visit Log` tabs and returns `{ "ok": true }` only after the write succeeds.
4. The Worker marks that D1 event as synced. Failed events stay queued for the five-minute cron retry or the dashboard’s **Sync now** button.

Configure the Apps Script project with these Script Properties:

| Property | Value |
| --- | --- |
| `LIBRARY_SPREADSHEET_ID` | ID from the Google Sheet URL |
| `LIBRARY_SYNC_SECRET` | Long random value shared with the Worker |
| `LIBRARY_TIME_ZONE` | Optional; defaults to `America/New_York` |

Deploy [`google/apps-script.gs`](../google/apps-script.gs) as a Web app that executes as the spreadsheet owner and is accessible to anyone with the link. Then set the Worker secrets:

```bash
npx wrangler secret put SHEETS_WEBHOOK_URL -c wrangler.library.jsonc
npx wrangler secret put SHEETS_WEBHOOK_SECRET -c wrangler.library.jsonc
```

The Apps Script receiver is idempotent by `sheetEventId`, supports events that arrive out of order, and migrates an older `Events` tab by adding its `Sync ID` column.

For local development:

```bash
npx wrangler d1 execute wildcat-signage --local --file=library-schema.sql -c wrangler.library.jsonc
npx wrangler dev -c wrangler.library.jsonc
```
