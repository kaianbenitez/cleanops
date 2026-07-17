# CleanOps — v1 System Plan

> Working name "CleanOps" (rename freely). This document is the full build spec for an
> execution agent (Claude Sonnet). No code here — architecture, schemas, contracts, and
> phase-by-phase build order. Follow phases strictly; each phase ships something usable.

---

## 1. What this is

An operations backend for a US residential cleaning company that keeps **GoHighLevel (GHL)
as the marketing/comms brain** and replaces **TheCustomerFactor (TCF)** + a manual payroll
Google Sheet. Pipeline covered: **quote → schedule → clean → invoice → payroll draft**.

### Problems it solves
1. Zapier duct tape between GHL and TCF (failure-prone, costs money).
2. Manual double-entry: jobs booked in TCF must be manually mirrored into GHL so workflows fire.
3. Stale GHL tags → wrong communications to wrong contacts. System becomes the source of truth
   for job/client status and pushes tags to GHL via API on every state change.
4. Monday payroll ritual: TCF export → paste to Google Sheet → hand-calc per-employee job
   tables → manually retype into Gusto. Becomes a generated report.

### Explicit non-goals for v1
- No client self-booking portal.
- No native mobile apps (responsive web only; employees use their phone browser).
- No SMS/email sending — GHL does ALL customer comms. We only push data/tags to GHL.
- No payment processing of our own — Square API for cards, checks recorded manually.
- No QuickBooks sync in v1 (design invoice tables so it can be added later).
- No multi-tenancy in v1 — single company. BUT: every table gets a `company_id` column from
  day one, defaulted to the single company row, so multi-tenant SaaS is a migration not a rewrite.

---

## 2. Stack

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js (App Router, TypeScript) | One codebase for admin UI, employee view, API routes/webhooks |
| Database | Postgres via **Supabase** | Free tier, built-in auth, row-level security, hosted — nothing to run |
| ORM | Drizzle | Type-safe schema-as-code, clean migrations for an agent to execute |
| Auth | Supabase Auth (email+password) | Two roles: `admin`, `employee`. No self-signup — admin creates accounts |
| Hosting | Cloudflare Pages (via @opennext/cloudflare) or Vercel free tier | Client already has Cloudflare; either works, pick whichever deploys cleanest |
| Validation | Zod on every API boundary | Webhooks and forms both |
| UI | Tailwind + shadcn/ui | Fast, decent-looking, agent-friendly |
| Background jobs | Cloudflare Cron Triggers / Vercel Cron | Recurring-job generation, GHL sync retries |

Environment secrets (never in code): `DATABASE_URL`, `SUPABASE_*`, `GHL_API_KEY`,
`GHL_LOCATION_ID`, `SQUARE_ACCESS_TOKEN`, `WEBHOOK_SIGNING_SECRET`.

---

## 3. Architecture

```
                       ┌─────────────────────────────┐
  Google Ads / Local → │  GHL (marketing + comms)     │
  form or SMS lead     │  workflows, SMS, email       │
                       └──────┬───────────▲──────────┘
                    webhook in │           │ REST out (tags, dates, contact upsert)
                       ┌──────▼───────────┴──────────┐
                       │        CleanOps (Next.js)    │
                       │  ┌────────┐  ┌────────────┐  │
                       │  │ Admin  │  │ Employee   │  │
                       │  │ UI     │  │ mobile view│  │
                       │  └────────┘  └────────────┘  │
                       │  API routes / webhooks / cron │
                       └──────┬───────────┬──────────┘
                              │           │
                       ┌──────▼────┐ ┌────▼──────┐
                       │ Supabase  │ │ Square API │
                       │ Postgres  │ │ (invoices) │
                       └───────────┘ └───────────┘
```

**Sync philosophy:** CleanOps owns operational truth (jobs, statuses, assignments).
GHL owns communication truth (what gets sent). Every CleanOps state change that matters to
comms → an outbound GHL API call recorded in `ghl_sync_log`. All outbound syncs go through
one internal module (`lib/ghl/`) with retry + logging. Never call GHL ad hoc from UI code.

---

## 4. Data model (Drizzle/Postgres)

Conventions: `id` = uuid pk default `gen_random_uuid()`; timestamps `created_at`/`updated_at`
(timestamptz, default now); money as **integer cents**; soft-delete via `archived_at` on
customer-facing tables; every table has `company_id` (fk → companies).

### companies
- id, name, timezone (text, e.g. 'America/Chicago'), settings (jsonb)

### users  (Supabase auth mirror + app profile)
- id (matches supabase auth uid), company_id, role ('admin' | 'employee'),
  first_name, last_name, phone, email
- hourly_rate_cents (int, nullable — employees only)
- pay_type ('hourly' | 'per_job_percent') — company pays per job % or hourly; support both,
  percent stored in `per_job_percent` (numeric, nullable)
- is_active (bool)

### customers
- id, company_id, ghl_contact_id (text, unique, nullable — the linkage key)
- first_name, last_name, email, phone
- address_line1, address_line2, city, state, zip
- gate_code_or_key_notes (text) — access info shown to employees
- status ('lead' | 'quoted' | 'first_clean_booked' | 'client' | 'lost' | 'moved')
- recurrence ('none' | 'weekly' | 'biweekly' | 'every4weeks' | 'monthly', nullable)
- source (text — 'google_ads', 'sms', 'referral', etc.)
- notes (text)
- **Status transitions drive GHL tag sync — see §6 table.**

### services  (catalog)
- id, company_id, name, description, default_price_cents, default_duration_minutes, is_active

### quotes
- id, company_id, customer_id, status ('draft' | 'sent' | 'viewed' | 'accepted' | 'declined' | 'expired')
- public_token (text unique — for the shareable proposal URL, unguessable)
- total_cents (derived, stored), notes_to_customer, valid_until (date)
- sent_at, viewed_at (set when public page first loaded), accepted_at

### quote_line_items
- id, quote_id, service_id (nullable — allow custom lines), description, qty, unit_price_cents

### jobs
- id, company_id, customer_id, quote_id (nullable)
- type ('first_clean' | 'recurring' | 'one_time' | 'deep_clean' | 'move_out')
- status ('scheduled' | 'in_progress' | 'completed' | 'cancelled' | 'no_show')
- scheduled_date (date), scheduled_start_time (time), estimated_duration_minutes
- price_cents (what the customer pays for this job)
- recurring_series_id (fk → recurring_series, nullable)
- completion_notes, completed_at
- Index on (company_id, scheduled_date) — the calendar query.

### recurring_series
- id, company_id, customer_id, frequency ('weekly' | 'biweekly' | 'every4weeks' | 'monthly')
- day_of_week (int, nullable), start_date, end_date (nullable), price_cents,
  default_employee_ids (uuid[]), is_active
- A **cron job generates `jobs` rows 8 weeks ahead** from active series (idempotent: skip if a
  job for that series+date exists). Editing a single generated job does not alter the series.

### job_assignments
- id, job_id, user_id (employee), role ('lead' | 'helper')
- unique (job_id, user_id)

### time_entries
- id, job_id, user_id, clock_in (timestamptz), clock_out (timestamptz, nullable)
- minutes_worked (int, derived on clock_out; admin-editable with `edited_by_admin` bool)
- v1 keeps this simple: employee taps start/finish on the job card. No GPS.

### invoices
- id, company_id, customer_id, job_id (nullable — allow multi-job invoices later via join table if needed; v1: one job per invoice is fine)
- status ('draft' | 'sent' | 'paid' | 'void')
- method ('square' | 'check' | 'cash' | 'other')
- square_invoice_id (text, nullable), total_cents, paid_at, check_number (text, nullable)

### payroll_periods
- id, company_id, start_date, end_date, status ('open' | 'reviewed' | 'exported')
- exported_at

### payroll_lines  (generated, then admin-adjustable)
- id, payroll_period_id, user_id
- jobs_count, total_minutes, gross_cents
- calculation (jsonb — per-job breakdown: job_id, date, customer name, minutes, rate, amount)
- adjustment_cents (int, default 0), adjustment_note
- final_cents (gross + adjustment)
- **This table's on-screen layout must mirror the current Google Sheet payroll table** so the
  owner can copy numbers into Gusto without re-learning anything. Ask the user for a screenshot
  of the current sheet before building this screen.

### ghl_sync_log
- id, company_id, direction ('inbound' | 'outbound')
- event_type (text — 'lead.created', 'tag.added', 'contact.upserted', 'custom_field.updated' …)
- customer_id (nullable), payload (jsonb), response (jsonb), status ('ok' | 'failed' | 'retrying')
- attempts (int), last_attempt_at
- Failed outbound syncs retried by cron with exponential backoff, max 5 attempts, then
  surfaced on an admin "sync issues" screen. **Never silently drop a sync.**

### webhook_events  (raw inbox)
- id, source ('ghl' | 'square'), payload (jsonb), signature_valid (bool),
  processed_at (nullable), error (text nullable)
- Store raw first, process after — makes debugging and replay possible.

### audit_log
- id, company_id, user_id, action (text), entity_type, entity_id, before (jsonb), after (jsonb)
- Write on: job status changes, payroll adjustments, invoice changes, customer status changes.

---

## 5. Screens

### Admin (desktop-first, responsive)
1. **Dashboard** — today's jobs, unassigned jobs, overdue invoices, failed syncs, week revenue.
2. **Calendar** — week view (default) + day view. Jobs colored by status. Click → job drawer
   (details, assignment, reschedule, cancel). Create job from any empty slot.
3. **Customers** — list w/ search + status filter; detail page shows quotes, jobs history,
   invoices, GHL link, status controls (status change = GHL sync trigger).
4. **Quotes** — list, builder (line items from service catalog + custom), preview,
   "mark sent" (copies public URL to clipboard for now — GHL sends the actual email/SMS).
5. **Public quote page** (no auth, token URL) — company branding, line items, policies text
   block, Accept button (→ status accepted, GHL sync fires, admin notified on dashboard).
6. **Payroll** — pick period (default: last Mon–Sun) → generated per-employee tables with
   per-job breakdown → inline adjustments → mark reviewed → **export CSV + copy-for-Gusto view**.
7. **Invoices** — list w/ status; create from completed job; "send via Square" or "record check".
8. **Settings** — services catalog, employees (add/deactivate, rates), company info, GHL
   connection status, sync-issues list.

### Employee (mobile-first, minimal)
1. **My day / my week** — job cards: time, customer name, address (tap → Google Maps),
   access notes, service notes.
2. **Job card actions** — Start (clock_in), Finish (clock_out + optional note).
3. Nothing else. No customer contact info beyond what's needed, no pricing visibility
   (hide `price_cents` from employee role — enforce in RLS/queries, not just UI).

---

## 6. Integrations

### GHL (inbound)
- One webhook endpoint `/api/webhooks/ghl`. GHL workflow "New Lead" adds a webhook action
  posting contact data → CleanOps upserts `customers` (match on ghl_contact_id, then phone,
  then email), status 'lead'. **This replaces the Zapier → TCF zap.**
- Validate a shared secret header; store raw in `webhook_events` before processing.

### GHL (outbound) — the tag/date sync table
Implemented in `lib/ghl/` using GHL API v2 (contacts endpoints). Every transition below fires
an outbound sync (upsert contact custom fields / add+remove tags):

| CleanOps event | GHL action |
|---|---|
| Quote sent | add tag `quote-given`, set custom field `quote_url` |
| Quote accepted | add tag `quote-accepted`, remove `quote-given` |
| First clean scheduled | set custom field `first_cleaning_date`, add tag `first-clean-booked` — **kills the manual date entry** |
| Job completed (first_clean) | add tag `first-clean-done` (GHL post-clean WF triggers off this) |
| Customer → client + recurrence set | add tags `client`, `recurrence-<freq>`; remove all sales-stage tags |
| Customer → lost/moved | add tag `lost` or `moved`, remove all others |

Tag names must be configurable in settings (jsonb map), not hardcoded, since GHL workflows
reference them.

### Square (outbound)
- Create Square Invoice from a CleanOps invoice (Customers API upsert → Invoices API create+publish).
- Webhook `/api/webhooks/square` for `invoice.payment_made` → mark paid. Verify signature.
- Sandbox credentials for all development; a settings toggle for sandbox/production.

### Gusto — NOT integrated in v1
Payroll screen exports CSV and a formatted copy-paste view. API integration is a later phase.

---

## 7. Build phases (strict order — each phase is shippable)

### Phase 0 — Foundation (no features)
Repo, Next.js + TS + Tailwind + shadcn, Drizzle + full schema above, Supabase project, auth
with roles, seed script (1 company, 1 admin, 3 employees, 10 customers, services catalog,
2 weeks of fake jobs). CI: typecheck + lint. Deploy the skeleton so deployment problems
surface on day one, not day thirty.

### Phase 1 — Jobs & scheduling ⭐ core
Calendar (week/day), job CRUD, recurring series + 8-week generation cron, assignments,
employee mobile view with clock in/out. **Exit test: schedule a biweekly series, see it on
the calendar 8 weeks out, employee can clock a job on a phone.**

### Phase 2 — Payroll ⭐ the wedge
Period generation from time_entries + rates (support both hourly and per-job-percent),
per-employee tables mirroring the current Google Sheet, adjustments, CSV export, Gusto
copy view. **Exit test: enter a realistic week of jobs/hours, output matches a hand-calculated
sheet to the cent.** This is the first thing demoed to the owner — polish this screen most.

### Phase 3 — Quotes
Builder, public token page with accept flow, view tracking, quote→job conversion.
**Exit test: build quote, open public link on a phone, accept, convert to scheduled job.**

### Phase 4 — GHL sync
Inbound webhook (lead intake), outbound sync module + all §6 transitions, sync log +
retry cron + admin sync-issues screen. **Exit test: fake GHL webhook creates a customer;
completing a first_clean job produces a logged outbound tag call (mock GHL in dev).**

### Phase 5 — Invoicing
Invoice CRUD, Square sandbox integration, payment webhook, record-check flow, dashboard
overdue list. **Exit test: full loop in Square sandbox — create, publish, simulate payment,
see it marked paid.**

### Phase 6 — Hardening
Audit log wiring, RLS review (employee can ONLY see own assigned jobs and never prices),
empty/error states on every screen, timezone correctness pass (company timezone everywhere,
never server-local), backup/restore documentation, parallel-run checklist vs TCF.

---

## 8. Rules for the execution agent (Sonnet)

1. Build phases in order. Do not start a phase before the previous phase's exit test passes.
2. Money is integer cents everywhere. No floats. Display formatting only at the UI edge.
3. All dates/times computed in the company's timezone (`companies.timezone`), stored UTC.
4. Every API route validates input with Zod and checks role.
5. Employee role must never receive price data in any payload — enforce at query layer.
6. All GHL/Square calls behind their `lib/` modules, mockable, logged.
7. Webhooks: store raw event, verify signature, then process. Idempotent processing
   (dedupe on source event id).
8. Recurring job generation must be idempotent — re-running the cron never duplicates jobs.
9. Seed data must be realistic enough to demo every screen without manual data entry.
10. Write a short `DECISIONS.md` entry whenever deviating from this plan, and ask the user
    before deviating on anything in §4 (schema) or §6 (integration contracts).

---

## 9. Open questions to resolve with the owner/user before Phase 2–5

1. **Pay structure**: are employees paid hourly, per-job percentage, or mixed? (Determines
   which payroll path gets polish.)
2. Screenshot of the current payroll Google Sheet (layout to mirror).
3. Current TCF proposal content (services/policy text) for the public quote page.
4. QuickBooks Online or Desktop? (Affects future invoicing sync design only.)
5. Exact GHL tag names currently used by the live workflows (for the settings tag map).
6. Square account: standard account with API access enabled?

---

## 10. Ownership & deployment notes (for the user, not the agent)

- Code lives in **your personal GitHub**. Deploy target can be a Cloudflare/Vercel account
  you control; the company subdomain (e.g. `ops.company.com`) can be pointed at it later
  via their Cloudflare DNS with the owner's blessing.
- Build with seed/dummy data until you've had the "my side project, we can use it free"
  conversation. Do not import real customer data before that conversation.
- Total expected run cost: $0–25/month (Supabase free tier, hosting free tier, Square is
  per-transaction to the company as it already is).
