ALTER TABLE "payroll_lines"
  ADD COLUMN IF NOT EXISTS "manual_office_hours" numeric(6, 2) NOT NULL DEFAULT '0';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'payroll_lines_manual_office_hours_nonnegative'
  ) THEN
    ALTER TABLE "payroll_lines"
      ADD CONSTRAINT "payroll_lines_manual_office_hours_nonnegative"
      CHECK (manual_office_hours >= 0);
  END IF;
END $$;
