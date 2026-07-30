-- My Day: let the cleaner mark what payment method (if any) they collected
-- on-site at clock-out, plus a free-text field for damages/notes to the
-- office. Both are nullable and set from src/app/api/jobs/[jobId]/clock-out;
-- also admin-editable/viewable from Job Detail.
--
-- IF NOT EXISTS makes this safe to re-run / a no-op if applied out of band.

ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "payment_method_collected" text;
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "cleaner_notes" text;
