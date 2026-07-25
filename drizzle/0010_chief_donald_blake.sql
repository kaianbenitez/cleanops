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
ALTER TABLE "customers" ADD CONSTRAINT "customers_preferred_cleaner_id_users_id_fk" FOREIGN KEY ("preferred_cleaner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
