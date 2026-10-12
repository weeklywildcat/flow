# Weekly Wildcat Library Check-In

Cloudflare Worker and D1-backed check-in/out system for the Weekly Wildcat library.

The Chromebook kiosk lets students scan their ID to check in or check out. The librarian dashboard shows the live roster and count, supports librarian checkout, lets staff clear everyone out at the end of the day, and manages kiosk pairing.

## Routes

- `GET /library/kiosk` — scanner kiosk for student check-in/out (the React app in `web/src/kiosk`).
- `GET /library/manage` — Cloudflare Access-protected librarian dashboard (the React app in `web/src`).
- `GET /library/presence.json` — public aggregate library occupancy feed for signage; contains no student information.
- `POST /api/library/scan` — resolve a scanned student ID.
- `POST /api/library/checkin` — record a visit.
- `POST /api/library/checkout` — close a visit.
- `GET /api/library/current` — staff-only live count and active roster.
- `GET /api/library/export-csv?from=YYYY-MM-DD&to=YYYY-MM-DD` — staff-only visit history export for an inclusive date range.
- `GET /api/library/sheet-status` — staff-only Google Sheets queue status.
- `POST /api/library/sync-sheets` — staff-only retry for queued archive events.

Cloudflare Access should protect `/library/manage` and staff API routes. Kiosk routes use the paired Chromebook token. `/library/kiosk`, `/library/assets/*` and `/library/presence.json` must stay outside any Access application.

### Public presence feed

`GET /library/presence.json` is intentionally unauthenticated and aggregate-only, for signage such as Tilecast:

```json
{
  "schemaVersion": 1,
  "currentCount": 12,
  "generatedAt": "2026-10-12T17:55:34.123Z",
  "latestCheckIn": { "cursor": "2451", "at": "2026-10-12T17:55:31.402Z" }
}
```

- `currentCount` uses the same definition as the live roster: visits with no checkout that are not archived.
- `latestCheckIn` describes the newest non-archived check-in by time (row id breaks ties). `cursor` changes whenever a newer check-in exists, so a poller can tell that someone arrived even if the count did not change. It is `null` when there are no visits. Checkouts never change it.
- Nothing else is returned: no names, student IDs, grades, reasons, roster, or checkout details. Other methods return `405`. Responses are `no-store`.

`GET /api/library/current` is the opposite: it returns the active roster and stays staff-only.

## Setup

1. Install dependencies:

   ```sh
   npm install
   ```

2. Apply the D1 schema:

   ```sh
   npx wrangler d1 execute wildcat-signage --remote --file=library-schema.sql -c wrangler.library.jsonc
   ```

3. Configure the Google Sheets archive:

   - Create or open the destination Google Sheet.
   - Open **Extensions → Apps Script**, replace the editor contents with [`google/apps-script.gs`](google/apps-script.gs), and save it.
   - In Apps Script **Project Settings → Script properties**, add `LIBRARY_SPREADSHEET_ID` with the spreadsheet ID and `LIBRARY_SYNC_SECRET` with a long random value.
   - Deploy the script as a **Web app**, executing as the owner and allowing anyone with the link to access it. Copy the deployment URL.
   - Store the deployment URL and the same secret in the Worker:

     ```sh
     npx wrangler secret put SHEETS_WEBHOOK_URL -c wrangler.library.jsonc
     npx wrangler secret put SHEETS_WEBHOOK_SECRET -c wrangler.library.jsonc
     ```

   The receiver creates `Events` and `Visit Log` tabs automatically. Each D1 event has a sync ID, so Worker retries do not duplicate rows. The Worker attempts delivery immediately, retries pending events every five minutes, and the librarian dashboard also provides a manual **Sync now** action.

4. Build. This type-checks the Worker and builds the kiosk and librarian dashboard into `dist/client`, which the Worker serves as static assets, so run it before every deploy:

   ```sh
   npm run build
   ```

   For local work, `npm run dev` builds both pages and starts `wrangler dev`; open `http://localhost:8787/library/manage` or `/library/kiosk`. Requests from localhost skip the Cloudflare Access check and the kiosk pairing step.

5. Deploy the library Worker:

   ```sh
   npx wrangler deploy -c wrangler.library.jsonc
   ```

The Worker does not maintain a separate open/closed or capacity page. Check-in/out and the live roster are the complete library workflow.
