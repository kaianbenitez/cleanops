import postgres from "postgres";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
const sql = postgres(process.env.DATABASE_URL!, { prepare: false });

async function main() {
  await sql.begin(async (tx) => {
    await tx.unsafe(`
      ALTER TABLE customers
        ADD COLUMN IF NOT EXISTS customer_number text,
        ADD COLUMN IF NOT EXISTS salutation text,
        ADD COLUMN IF NOT EXISTS county text,
        ADD COLUMN IF NOT EXISTS subdivision text,
        ADD COLUMN IF NOT EXISTS preferred_communication text,
        ADD COLUMN IF NOT EXISTS preferred_day text,
        ADD COLUMN IF NOT EXISTS preferred_time text,
        ADD COLUMN IF NOT EXISTS service_type text,
        ADD COLUMN IF NOT EXISTS payment_method text,
        ADD COLUMN IF NOT EXISTS important_to_customer text,
        ADD COLUMN IF NOT EXISTS do_not_clean text,
        ADD COLUMN IF NOT EXISTS pet_notes text,
        ADD COLUMN IF NOT EXISTS home_details jsonb DEFAULT '{}'::jsonb NOT NULL,
        ADD COLUMN IF NOT EXISTS operational_notes text,
        ADD COLUMN IF NOT EXISTS tags jsonb DEFAULT '[]'::jsonb NOT NULL,
        ADD COLUMN IF NOT EXISTS text_messaging_allowed boolean DEFAULT false NOT NULL,
        ADD COLUMN IF NOT EXISTS archived_reason text
    `);
    await tx.unsafe(`
      CREATE TABLE IF NOT EXISTS customer_locations (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id uuid NOT NULL REFERENCES companies(id),
        customer_id uuid NOT NULL REFERENCES customers(id),
        label text DEFAULT 'Primary home' NOT NULL,
        address_line1 text NOT NULL,
        address_line2 text,
        city text,
        state text,
        zip text,
        county text,
        subdivision text,
        google_place_id text,
        is_primary boolean DEFAULT true NOT NULL,
        is_active boolean DEFAULT true NOT NULL,
        access_instructions text,
        key_number text,
        garage_code text,
        gate_code text,
        alarm_code text,
        vacuum_location text,
        mop_heads_needed text,
        trash_bags text,
        created_at timestamptz DEFAULT now() NOT NULL,
        updated_at timestamptz DEFAULT now() NOT NULL
      )
    `);
    await tx.unsafe(`CREATE INDEX IF NOT EXISTS customer_locations_customer_idx ON customer_locations(customer_id)`);
    await tx.unsafe(`CREATE INDEX IF NOT EXISTS customer_locations_company_idx ON customer_locations(company_id)`);
    await tx.unsafe(`ALTER TABLE payroll_lines ADD COLUMN IF NOT EXISTS team_lead_bonus_cents integer DEFAULT 0 NOT NULL, ADD COLUMN IF NOT EXISTS trainer_bonus_cents integer DEFAULT 0 NOT NULL, ADD COLUMN IF NOT EXISTS gusto_net_pay_cents integer`);
    await tx.unsafe(`ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS recorded_by_admin boolean DEFAULT false NOT NULL, ADD COLUMN IF NOT EXISTS notes text`);
    await tx.unsafe(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS subtotal_cents integer, ADD COLUMN IF NOT EXISTS discount_cents integer DEFAULT 0 NOT NULL, ADD COLUMN IF NOT EXISTS tip_cents integer DEFAULT 0 NOT NULL, ADD COLUMN IF NOT EXISTS amount_paid_cents integer DEFAULT 0 NOT NULL, ADD COLUMN IF NOT EXISTS payment_note text`);
    await tx.unsafe(`UPDATE invoices SET subtotal_cents = total_cents WHERE subtotal_cents IS NULL`);
  });
  console.log("Database repair completed.");
  await sql.end();
}

main();
