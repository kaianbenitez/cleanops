ALTER TABLE "calendar_events"
  ADD COLUMN IF NOT EXISTS "time_off_type" text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'calendar_events_time_off_type_values') THEN
    ALTER TABLE "calendar_events"
      ADD CONSTRAINT "calendar_events_time_off_type_values"
      CHECK (time_off_type IS NULL OR time_off_type IN ('paid', 'unpaid'));
  END IF;
END $$;
