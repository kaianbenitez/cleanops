-- `drizzle-kit generate` diffed schema.ts against the last-recorded migration (0011) and
-- also picked up Codex's in-progress job_photos table + users.birthday/profile_photo_url
-- changes, which were applied to schema.ts without ever generating a migration for them.
-- Those are Codex's uncommitted/in-flight work (see HANDOFF.md), not reviewed or owned by
-- this change, and profile_photo_url already exists on the hosted DB — applying it here
-- would error. Trimmed down to only the customers-archive statements this feature owns.
ALTER TABLE "customers" ADD COLUMN "is_archived" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "archived_reason" text;--> statement-breakpoint
CREATE INDEX "customers_archived_idx" ON "customers" USING btree ("company_id","is_archived");