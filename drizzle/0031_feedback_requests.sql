CREATE TABLE IF NOT EXISTS "feedback_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "company_id" uuid NOT NULL REFERENCES "companies"("id"),
  "job_id" uuid NOT NULL REFERENCES "jobs"("id"),
  "customer_id" uuid NOT NULL REFERENCES "customers"("id"),
  "public_token" text NOT NULL,
  "status" text NOT NULL DEFAULT 'sent',
  "expires_at" timestamptz NOT NULL,
  "submitted_at" timestamptz,
  "quality_rating" integer,
  "quality_tags" text[] NOT NULL DEFAULT '{}',
  "quality_comment" text,
  "tip_cents" integer NOT NULL DEFAULT 0,
  "invoice_url" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "feedback_requests_status_check" CHECK (status IN ('sent', 'submitted', 'expired')),
  CONSTRAINT "feedback_requests_rating_check" CHECK (quality_rating IS NULL OR quality_rating BETWEEN 1 AND 5),
  CONSTRAINT "feedback_requests_tip_check" CHECK (tip_cents >= 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS "feedback_requests_public_token_idx" ON "feedback_requests" ("public_token");
CREATE UNIQUE INDEX IF NOT EXISTS "feedback_requests_job_idx" ON "feedback_requests" ("job_id");
CREATE INDEX IF NOT EXISTS "feedback_requests_company_status_idx" ON "feedback_requests" ("company_id", "status");
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "square_public_url" text;
