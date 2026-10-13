-- Capitalizes the first letter of any student first or last name that starts with a lowercase
-- letter. Only the first character changes ("mary ann" -> "Mary ann", "mcDonald" -> "McDonald").
-- Safe to run more than once: rows that already start with a capital are not touched.
--
-- SQLite's UPPER() only handles A-Z, so a name starting with an accented lowercase letter
-- (e.g. "émile") is left as is. GLOB is case-sensitive, which is what makes the filter work.
--
-- Run against production:
--   npx wrangler d1 execute wildcat-signage --remote --file=migrations/2026-10-13-capitalize-student-names.sql -c wrangler.library.jsonc

UPDATE library_students
SET
  first_name = UPPER(SUBSTR(first_name, 1, 1)) || SUBSTR(first_name, 2),
  last_name = UPPER(SUBSTR(last_name, 1, 1)) || SUBSTR(last_name, 2),
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE first_name GLOB '[a-z]*' OR last_name GLOB '[a-z]*';
