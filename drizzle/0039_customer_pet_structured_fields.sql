-- SF-4 follow-up: Stephanie wants pets tracked as structured data, not just free
-- text — a 1-5 pet hair rating (shedding severity, informational only, no pricing
-- effect), dog/cat counts, and dog/cat names. The existing free-text "pet_notes"
-- column stays as-is (renders as "Other pet notes") for anything that doesn't fit
-- those fields, e.g. "do not give her treats".
ALTER TABLE "customers" ADD COLUMN "pet_hair_rating" integer;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "dog_count" integer;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "cat_count" integer;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "dog_names" text;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "cat_names" text;
