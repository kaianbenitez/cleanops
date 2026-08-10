ALTER TABLE "calendar_events" ADD COLUMN IF NOT EXISTS "category" text DEFAULT 'reminder' NOT NULL;
ALTER TABLE "calendar_events" ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'scheduled' NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'calendar_events_category_values') THEN
    ALTER TABLE "calendar_events"
      ADD CONSTRAINT "calendar_events_category_values"
      CHECK (category IN ('meeting', 'reminder', 'training'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'calendar_events_status_values') THEN
    ALTER TABLE "calendar_events"
      ADD CONSTRAINT "calendar_events_status_values"
      CHECK (status IN ('scheduled', 'cancelled'));
  END IF;
END $$;
