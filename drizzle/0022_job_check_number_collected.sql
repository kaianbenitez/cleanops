-- Follow-up to 0021_job_payment_and_cleaner_notes.sql: capture the check
-- number when the cleaner reports "Check" as the payment method collected
-- on-site, so the office can reconcile it later from Job Detail.
--
-- IF NOT EXISTS makes this safe to re-run / a no-op if applied out of band.

ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "check_number_collected" text;
