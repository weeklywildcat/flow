interface Env {
  SIGNAGE_DB: D1Database;
  ASSETS: Fetcher;
  KIOSK_ENROLL_RATE_LIMITER: RateLimit;
  SHEETS_WEBHOOK_URL?: string;
  SHEETS_WEBHOOK_SECRET?: string;
}
