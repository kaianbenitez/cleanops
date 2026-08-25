-- Follow-up to 0023_enable_rls.sql: these 4 tables were added to schema.ts
-- after the 2026-08-04 RLS sweep and never got the same treatment, leaving
-- them readable/writable by anyone with the public anon key via Supabase's
-- auto-exposed PostgREST API. Same default-deny pattern as 0023 — no
-- CREATE POLICY statements, since nothing legitimate needs the anon key for
-- data. The app's own DB role (postgres) has rolbypassrls = true, so Drizzle
-- queries are unaffected.
ALTER TABLE public.pto_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_service_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_job_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feedback_requests ENABLE ROW LEVEL SECURITY;
