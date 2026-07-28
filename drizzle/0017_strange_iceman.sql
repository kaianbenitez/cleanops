-- Service catalog: split into "main" job presets and "add_on" extras, and let
-- jobs reference a chosen preset + selected add-ons directly. See the block
-- comment above `services` in schema.ts for the category split rationale.
-- This is a separate, job-scoped catalog from lib/pricing/add-ons.ts, which
-- remains the quote/proposal engine's own hardcoded add-on list, untouched.

ALTER TABLE "services" ALTER COLUMN "default_price_cents" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "services" ALTER COLUMN "default_duration_minutes" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN IF NOT EXISTS "category" text DEFAULT 'main' NOT NULL;--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN IF NOT EXISTS "price_label" text;--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN IF NOT EXISTS "available_add_on_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "service_id" uuid;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "add_on_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "jobs" ADD CONSTRAINT "jobs_service_id_services_id_fk"
    FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
