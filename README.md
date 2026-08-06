# Weekly Wildcat Library Check-In

Cloudflare Worker and D1-backed check-in/out system for the Weekly Wildcat library.

The Chromebook kiosk lets students scan their ID to check in or check out. The librarian dashboard shows the live roster and count, supports librarian checkout, lets staff clear everyone out at the end of the day, and manages kiosk pairing.

## Routes

- `GET /library/kiosk` — scanner kiosk for student check-in/out.
- `GET /library/manage` — Cloudflare Access-protected librarian dashboard.
- `POST /api/library/scan` — resolve a scanned student ID.
- `POST /api/library/checkin` — record a visit.
- `POST /api/library/checkout` — close a visit.
- `GET /api/library/current` — staff-only live count and active roster.
- `GET /api/library/export-csv?from=YYYY-MM-DD&to=YYYY-MM-DD` — staff-only visit history export for an inclusive date range.
- `GET /api/library/sheet-status` — staff-only Google Sheets queue status.
- `POST /api/library/sync-sheets` — staff-only retry for queued archive events.

Cloudflare Access should protect `/library/manage` and staff API routes. Kiosk routes use the paired Chromebook token.

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

4. Build:

   ```sh
   npm run build
   ```

5. Deploy the library Worker:

   ```sh
   npx wrangler deploy -c wrangler.library.jsonc
   ```

The Worker does not maintain a separate open/closed or capacity page. Check-in/out and the live roster are the complete library workflow.
