-- Public early-access requests for the ServiceSpark product itself.
-- This table intentionally has no company_id: it is not operational customer data.
CREATE TABLE IF NOT EXISTS "product_leads" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "business_name" text NOT NULL,
  "contact_name" text NOT NULL,
  "email" text NOT NULL,
  "phone" text NOT NULL,
  "crew_size" text,
  "message" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- Default-deny: the app writes through its privileged database connection;
-- prospects must never access submitted lead data through Supabase's REST API.
ALTER TABLE "product_leads" ENABLE ROW LEVEL SECURITY;
