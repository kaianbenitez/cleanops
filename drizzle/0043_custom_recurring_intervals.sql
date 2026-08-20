ALTER TABLE "recurring_series" ADD COLUMN "interval_weeks" integer;
ALTER TABLE "recurring_series" ADD CONSTRAINT "recurring_series_custom_interval_weeks_check"
  CHECK ("frequency" <> 'custom' OR ("interval_weeks" IS NOT NULL AND "interval_weeks" BETWEEN 1 AND 52));
