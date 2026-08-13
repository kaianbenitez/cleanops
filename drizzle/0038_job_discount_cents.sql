-- Vault backlog item "add discounts total alongside projected revenue" (calendar
-- toolbar). Snapshots, at quote-conversion time, how much of the dirty-code-tier
-- discount was baked into a job/series's priceCents (list price minus final
-- price, floored at 0). Defaults to 0 for existing rows and for jobs/series
-- created without a quote — nothing to backfill, no list price to discount off.
ALTER TABLE "jobs" ADD COLUMN "discount_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "recurring_series" ADD COLUMN "discount_cents" integer DEFAULT 0 NOT NULL;
