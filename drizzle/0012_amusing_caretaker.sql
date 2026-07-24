-- Combined catch-up migration. `drizzle-kit generate` diffed schema.ts against the
-- last-recorded migration (0011) and picked up several outstanding gaps:
--
-- 1. Codex's in-progress job_photos table + users.birthday/profile_photo_url changes,
--    already in schema.ts but never migrated. Those are Codex's in-flight work (see
--    HANDOFF.md), not owned by this change, and profile_photo_url already exists on the
--    hosted DB — applying it here would error. Excluded entirely.
-- 2. Seven customers columns (client_type, company_name, preferred_days,
--    preferred_cleaner_id, preferred_time_of_day, payment_methods, general_notes) that
--    already had complete migration files committed in this repo — 0008_wild_riptide.sql,
--    0009_sleepy_maverick.sql, and 0010_chief_donald_blake.sql — but were apparently never
--    actually applied to the hosted DB, discovered while verifying this feature (confirmed
--    via direct query: these columns don't exist live, even though the app code using them
--    has been marked "Done"/shipped in HANDOFF.md). Folded in here since they block the
--    customer pages generally, not just this feature.
-- 3. This feature's own 3 new customers columns (is_archived, archived_at, archived_reason)
--    + a supporting index.
--
-- Order matters: general_notes' backfill (step 2) reads the legacy notes/operational_notes/
-- important_to_customer/do_not_clean/pet_notes columns, all of which already exist live.

-- --- from 0008_wild_riptide.sql ---
ALTER TABLE "customers" ADD COLUMN "client_type" text DEFAULT 'residential' NOT NULL;--> statement-breakpoint

-- --- from 0009_sleepy_maverick.sql ---
ALTER TABLE "customers" ADD COLUMN "company_name" text;--> statement-breakpoint

-- --- from 0010_chief_donald_blake.sql ---
ALTER TABLE "customers" ADD COLUMN "preferred_days" text[];--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "preferred_cleaner_id" uuid;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "preferred_time_of_day" text;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "payment_methods" text[];--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "general_notes" text;--> statement-breakpoint
UPDATE "customers"
SET
  "preferred_days" = CASE lower(trim("preferred_day"))
    WHEN 'monday' THEN ARRAY['monday']::text[]
    WHEN 'tuesday' THEN ARRAY['tuesday']::text[]
    WHEN 'wednesday' THEN ARRAY['wednesday']::text[]
    WHEN 'thursday' THEN ARRAY['thursday']::text[]
    WHEN 'friday' THEN ARRAY['friday']::text[]
    ELSE NULL
  END,
  "preferred_time_of_day" = CASE upper(trim("preferred_time"))
    WHEN 'AM' THEN 'AM'
    WHEN 'PM' THEN 'PM'
    ELSE NULL
  END,
  "payment_methods" = CASE WHEN "payment_method" IS NULL OR trim("payment_method") = '' THEN NULL ELSE ARRAY["payment_method"]::text[] END,
  "general_notes" = NULLIF(trim(concat_ws(E'\n\n',
    NULLIF(trim("notes"), ''),
    NULLIF(trim("operational_notes"), ''),
    NULLIF(trim("important_to_customer"), ''),
    NULLIF(trim("do_not_clean"), ''),
    NULLIF(trim("pet_notes"), '')
  )), '')
WHERE "general_notes" IS NULL;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_preferred_cleaner_id_users_id_fk" FOREIGN KEY ("preferred_cleaner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

-- --- this feature: archive support ---
ALTER TABLE "customers" ADD COLUMN "is_archived" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "archived_reason" text;--> statement-breakpoint
CREATE INDEX "customers_archived_idx" ON "customers" USING btree ("company_id","is_archived");
