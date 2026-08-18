ALTER TABLE "quotes" ADD COLUMN "booked_at" timestamptz;
ALTER TABLE "jobs" ADD COLUMN "arrival_window_end_time" time;
ALTER TABLE "recurring_series" ADD COLUMN "source_quote_id" uuid REFERENCES "quotes"("id");
ALTER TABLE "recurring_series" ADD COLUMN "service_location_id" uuid REFERENCES "service_locations"("id");
ALTER TABLE "recurring_series" ADD COLUMN "default_scheduled_start_time" time;
ALTER TABLE "recurring_series" ADD COLUMN "default_arrival_window_end_time" time;

CREATE TABLE "employee_service_locations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL REFERENCES "companies"("id"),
  "user_id" uuid NOT NULL REFERENCES "users"("id"),
  "service_location_id" uuid NOT NULL REFERENCES "service_locations"("id"),
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX "employee_service_locations_company_user_location_idx" ON "employee_service_locations" USING btree ("company_id", "user_id", "service_location_id");
CREATE INDEX "employee_service_locations_company_location_idx" ON "employee_service_locations" USING btree ("company_id", "service_location_id");
CREATE INDEX "employee_service_locations_user_idx" ON "employee_service_locations" USING btree ("user_id");
CREATE INDEX "quotes_company_accepted_unbooked_idx" ON "quotes" USING btree ("company_id", "status", "booked_at");

-- Preserve every existing primary/home branch as an explicit eligibility row.
INSERT INTO "employee_service_locations" ("company_id", "user_id", "service_location_id")
SELECT "company_id", "id", "service_location_id"
FROM "users"
WHERE "service_location_id" IS NOT NULL
ON CONFLICT ("company_id", "user_id", "service_location_id") DO NOTHING;
