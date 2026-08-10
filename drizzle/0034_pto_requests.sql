CREATE TABLE IF NOT EXISTS "pto_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL REFERENCES "companies"("id"),
  "user_id" uuid NOT NULL REFERENCES "users"("id"),
  "start_date" date NOT NULL,
  "end_date" date NOT NULL,
  "start_period" text DEFAULT 'full' NOT NULL,
  "end_period" text DEFAULT 'full' NOT NULL,
  "note" text,
  "status" text DEFAULT 'pending' NOT NULL,
  "decided_at" timestamptz,
  "decided_by" uuid REFERENCES "users"("id"),
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "pto_requests_user_created_idx" ON "pto_requests" ("user_id", "created_at");
CREATE INDEX IF NOT EXISTS "pto_requests_company_status_idx" ON "pto_requests" ("company_id", "status");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pto_requests_period_values') THEN
    ALTER TABLE "pto_requests"
      ADD CONSTRAINT "pto_requests_period_values"
      CHECK (start_period IN ('full', 'morning', 'afternoon') AND end_period IN ('full', 'morning', 'afternoon'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pto_requests_status_values') THEN
    ALTER TABLE "pto_requests"
      ADD CONSTRAINT "pto_requests_status_values"
      CHECK (status IN ('pending', 'approved', 'denied', 'cancelled'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pto_requests_date_order') THEN
    ALTER TABLE "pto_requests"
      ADD CONSTRAINT "pto_requests_date_order"
      CHECK (end_date >= start_date);
  END IF;
END $$;
