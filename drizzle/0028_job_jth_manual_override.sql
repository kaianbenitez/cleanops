-- Per-occurrence Job Ticket Hours edits must not be recomputed from the
-- recurring template price or branch rate. Safe to run if applied manually.
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "jth_manual_override" boolean NOT NULL DEFAULT false;
