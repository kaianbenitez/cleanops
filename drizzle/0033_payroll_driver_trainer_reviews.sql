ALTER TABLE "job_assignments"
  ADD COLUMN IF NOT EXISTS "mileage_miles" numeric(8, 2) NOT NULL DEFAULT '0';

ALTER TABLE "payroll_lines"
  ADD COLUMN IF NOT EXISTS "client_tips_cents" integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS "payroll_job_reviews" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "payroll_period_id" uuid NOT NULL REFERENCES "payroll_periods"("id"),
  "job_id" uuid NOT NULL REFERENCES "jobs"("id"),
  "user_id" uuid NOT NULL REFERENCES "users"("id"),
  "jth_minutes" integer NOT NULL,
  "logged_minutes" integer NOT NULL,
  "approved_minutes" integer,
  "status" text NOT NULL DEFAULT 'pending',
  "reviewed_by" uuid REFERENCES "users"("id"),
  "reviewed_at" timestamptz,
  "note" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "payroll_job_reviews_period_job_user_idx" UNIQUE ("payroll_period_id", "job_id", "user_id")
);
