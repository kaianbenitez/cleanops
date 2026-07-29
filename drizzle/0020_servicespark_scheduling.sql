ALTER TABLE "customer_locations" ADD COLUMN IF NOT EXISTS "entry_code" text;
ALTER TABLE "quotes" ADD COLUMN IF NOT EXISTS "dirt_score" integer;
ALTER TABLE "quotes" ADD COLUMN IF NOT EXISTS "clutter_score" integer;

CREATE TABLE IF NOT EXISTS "calendar_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL REFERENCES "companies"("id"),
  "title" text NOT NULL,
  "note" text,
  "scheduled_date" date NOT NULL,
  "start_time" time,
  "duration_minutes" integer,
  "is_all_day" boolean DEFAULT false NOT NULL,
  "created_by_user_id" uuid NOT NULL REFERENCES "users"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "calendar_events_company_date_idx" ON "calendar_events" ("company_id", "scheduled_date");

CREATE TABLE IF NOT EXISTS "calendar_event_assignments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "event_id" uuid NOT NULL REFERENCES "calendar_events"("id"),
  "user_id" uuid NOT NULL REFERENCES "users"("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "calendar_event_assignments_event_user_idx" ON "calendar_event_assignments" ("event_id", "user_id");
CREATE INDEX IF NOT EXISTS "calendar_event_assignments_user_idx" ON "calendar_event_assignments" ("user_id");

CREATE TABLE IF NOT EXISTS "employee_report_notes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL REFERENCES "companies"("id"),
  "employee_id" uuid NOT NULL REFERENCES "users"("id"),
  "author_user_id" uuid NOT NULL REFERENCES "users"("id"),
  "note" text NOT NULL,
  "report_date" date NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "employee_report_notes_employee_date_idx" ON "employee_report_notes" ("employee_id", "report_date");

CREATE TABLE IF NOT EXISTS "app_notifications" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL REFERENCES "companies"("id"),
  "type" text NOT NULL,
  "title" text NOT NULL,
  "body" text,
  "href" text,
  "quote_id" uuid REFERENCES "quotes"("id"),
  "customer_id" uuid REFERENCES "customers"("id"),
  "read_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "app_notifications_company_created_idx" ON "app_notifications" ("company_id", "created_at");
CREATE UNIQUE INDEX IF NOT EXISTS "app_notifications_quote_idx" ON "app_notifications" ("quote_id");
