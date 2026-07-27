-- Catch-up migration: employee birthday / profile photo + job_photos.
--
-- WHY THIS FILE IS HAND-WRITTEN AND IDEMPOTENT
--
-- These three schema objects (users.birthday, users.profile_photo_url, and the
-- job_photos table) were added to src/db/schema.ts by the "Add employee birthday
-- and profile photo support" work and applied to the hosted database directly,
-- but no migration .sql file was ever committed for them. 0012 deliberately
-- excluded them as another agent's in-flight work.
--
-- The problem: drizzle's snapshot chain (drizzle/meta/0014_snapshot.json) already
-- records all three as if they had been migrated. That means `drizzle-kit
-- generate` reports "No schema changes, nothing to migrate" and will never
-- produce this file on its own -- the gap is invisible to drizzle-kit forever.
-- Rebuilding a database by replaying drizzle/*.sql would silently produce a
-- schema missing all three, and the employee-photo and job-photo API routes
-- would fail against it.
--
-- This file closes the replay gap. Every statement is guarded with IF NOT EXISTS
-- so it is a no-op against the hosted database (where these already exist) and
-- creates them correctly on a fresh rebuild. Verified 2026-07-27 against the
-- hosted DB: the live definitions match src/db/schema.ts exactly.
--
-- No accompanying meta/0015_snapshot.json is written, for the same reason
-- 0013_fluffy_price_duration.sql has none: the 0014 snapshot already describes
-- this end state. Do not "fix" that by regenerating snapshots.

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "birthday" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "profile_photo_url" text;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "job_photos" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "job_id" uuid NOT NULL,
  "company_id" uuid NOT NULL,
  "uploaded_by_user_id" uuid NOT NULL,
  "storage_path" text NOT NULL,
  "slot" text DEFAULT 'extra' NOT NULL,
  "caption" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "job_photos" ADD CONSTRAINT "job_photos_job_id_jobs_id_fk"
    FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "job_photos" ADD CONSTRAINT "job_photos_company_id_companies_id_fk"
    FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "job_photos" ADD CONSTRAINT "job_photos_uploaded_by_user_id_users_id_fk"
    FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "job_photos_job_created_idx" ON "job_photos" USING btree ("job_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "job_photos_company_idx" ON "job_photos" USING btree ("company_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "job_photos_storage_path_idx" ON "job_photos" USING btree ("storage_path");
