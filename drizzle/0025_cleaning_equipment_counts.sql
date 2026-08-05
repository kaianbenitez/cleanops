-- Per-customer confirmed cleaning-equipment counts. NULL intentionally means
-- "not set"; estimates are computed in the application and are never stored.
-- IF NOT EXISTS keeps this safe if it was applied manually before this file is replayed.

ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "mop_head_count" integer;
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "rag_count" integer;
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "vacuum_count" integer;
