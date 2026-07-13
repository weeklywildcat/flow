# Library Check-In Starter v6

This adds a separate Cloudflare Worker for the library check-in system while keeping the current `signage` Worker untouched.

## What v6 changes

- Redesigns the Chromebook kiosk as a real check-in terminal instead of a demo-style card app.
- Uses a plain institutional layout: maroon accent, off-white surface, large readable type, and minimal copy.
- Uses four kiosk states only: waiting, reason selection, success, and error/help.
- Keeps checkout fast: already-checked-in students scan once and get checked out immediately.
- Cuts the reason list down to high-value options: Class work, Printing, Book checkout, Lunch, Meeting, Other.
- Delays the loading state slightly so fast scans do not flash a spinner/loading screen.
- Keeps the whole page scanner-ready with a hidden focused input and global keyboard capture.
- Reworks the librarian dashboard as an operations dashboard: current count, TV status, mode, active students, then settings.

## What it adds

- `/library/kiosk` for the Chromebook + barcode scanner station
- `/library/manage` for the librarian dashboard
- D1 tables for students, visits, settings, and Google Sheets sync events
- Capacity logic that writes into the existing `library_status` table used by the current TV signage
- Optional Google Sheets archive through Apps Script

## Files

- `src/library.ts` — new Worker app
- `wrangler.library.jsonc` — deploy config for the library Worker
- `library-schema.sql` — D1 schema additions
- `google/apps-script.gs` — Apps Script receiver for Google Sheets archive
- `students-template.csv` — roster import template
- `students-template.json` — API import example

## Local setup

Copy these files into the existing `weeklywildcat/signage` repo.

Apply the database schema locally while testing:

```bash
npx wrangler d1 execute wildcat-signage --local --file=library-schema.sql -c wrangler.library.jsonc
```

Apply the database schema remotely before deploying:

```bash
npx wrangler d1 execute wildcat-signage --remote --file=library-schema.sql -c wrangler.library.jsonc
```

Run locally:

```bash
npx wrangler dev -c wrangler.library.jsonc
```

Deploy the library Worker:

```bash
npx wrangler deploy -c wrangler.library.jsonc
```

Suggested custom domain:

```txt
library.weeklywildcat.com
```

## Local testing

Start Wrangler:

```bash
npx wrangler dev -c wrangler.library.jsonc
```

In another Terminal window, import the test student:

```bash
curl -X POST http://localhost:8787/api/library/import-students \
  -H "Content-Type: application/json" \
  --data @students-template.json
```

Open:

```txt
http://localhost:8787/library/kiosk
```

Type `12345` and press Enter anywhere on the page. In local dev, the kiosk also shows a small `Test scan 12345` button.

## Chromebook pairing

Keep the Chromebook on a persistent Chrome profile and open:

```txt
https://signage.weeklywildcat.com/library/kiosk
```

The first launch shows a pairing screen. From the Access-protected manage dashboard, name the Chromebook and choose **Generate pairing PIN**, then enter that 8-digit PIN on the Chromebook. The PIN expires after 10 minutes and can only be used once. The browser stores the resulting device credential in local storage, so normal restarts do not require another setup step.

The manage dashboard lists paired Chromebooks and can revoke one at any time. A revoked Chromebook returns to the pairing screen.

Use Cloudflare Access for `/library/manage` and the staff API routes. Keep `/api/library/kiosk-enroll`, `/api/library/kiosk-status`, `/api/library/scan`, `/api/library/checkin`, `/api/library/checkout`, and `/api/library/create-student` outside interactive Access login; the Worker requires a valid one-time PIN or paired-device credential for those routes.

## Autopilot

The manage dashboard can save named day presets containing multiple non-overlapping opening windows. Select a preset and choose **Turn on Autopilot** each morning. Autopilot is active for the current New York calendar day only, closes the library between windows, keeps automatic capacity behavior during open windows, and gives the TV a countdown to the next opening.

Preset windows are snapshotted when Autopilot starts, so editing the reusable preset does not change the schedule already running today. A manual status change or use of the quick one-time scheduler pauses Autopilot; capacity and custom-message edits do not. The librarian can resume or turn off the current run from the same card.

## Student roster import

The starter Worker includes a JSON import endpoint:

```bash
curl -X POST https://library.weeklywildcat.com/api/library/import-students \
  -H "Content-Type: application/json" \
  --data @students-template.json
```

The barcode value should match what the USB scanner types from the student ID card.

## Signage behavior

The library check-in Worker writes the effective status into the existing `library_status` table:

- under capacity → `open`
- at/above capacity → `capacity`
- manual override → whatever the librarian chooses

That means the current TV display can keep reading the same `/api/status` endpoint from the existing signage Worker.

## Google Sheets archive

The Worker queues every sign-in/sign-out event in D1 first. If Sheets fails, the live check-in system still works.

Use the Apps Script file in a Sheet owned by the librarian.

Set an Apps Script property:

```txt
LIBRARY_SYNC_SECRET = some-long-random-secret
```

Deploy the script as a web app. Then set Cloudflare secrets:

```bash
npx wrangler secret put SHEETS_WEBHOOK_URL -c wrangler.library.jsonc
npx wrangler secret put SHEETS_WEBHOOK_SECRET -c wrangler.library.jsonc
```

For the URL, use the Apps Script web app URL with the secret query string appended:

```txt
https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec?secret=some-long-random-secret
```

Then the librarian dashboard can use “Retry Sheets Sync” if any events were queued while Google was unavailable.

## v8 scanner check

The kiosk page should show a small `v8 scanner` pill in the top-right corner. If you do not see that, the browser or Wrangler is still serving an older file.

Use `Command + Shift + R` after restarting Wrangler.


## Kiosk design v8

The kiosk is intentionally reduced to four states: waiting for scan, reason selection, success, and error. It uses system sans-serif fonts only, very large touch targets, short plain-language copy, and instant scan-out for students already checked in. Look for the `UX v8` marker in the top-right corner to verify the newest screen is loaded.

## v16 manage sizing update

The manage screen was adjusted to a normal staff-app scale: larger readable type, stronger row spacing, and the same fixed one-screen layout on desktop without switching to oversized child-style controls.
