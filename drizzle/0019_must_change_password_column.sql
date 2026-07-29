-- Catch-up migration, same reason as 0015_employee_photos_catchup.sql: this
-- column was added to src/db/schema.ts and applied directly to the hosted DB
-- (2026-07-27, one-time-password / forced-password-change feature) but no
-- migration file was ever committed for it, and no local session had it on
-- origin/main until now.
--
-- IF NOT EXISTS makes this a no-op against a hosted DB where the column
-- already exists, and creates it correctly on a fresh rebuild. Not verified
-- against the live DB this session (DATABASE_URL is redacted here — see
-- HANDOFF.md / DECISIONS.md) — run `npm run check:drift` once real
-- credentials are available to confirm.

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "must_change_password" boolean DEFAULT false NOT NULL;
