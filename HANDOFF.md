# Handoff — current status

Living status doc, updated at the end of each work session. Read this first in any new
session before starting work. Stable working rules live in `AGENTS.md`; historical
schema/architecture deviations live in `DECISIONS.md`. This file is just "where things
stand right now."

Last updated: 2026-07-24 (post-migration).

## Done

- Sentry DSN configured in Vercel (`SENTRY_DSN`, Preview + Production); wired in
  `src/instrumentation.ts`.
- 209 recurring series and 692 jobs backfilled from the TheCustomerFactor CSV export.
- Jobs list/detail redesign shipped: Active/Pending/History tabs, pagination, filters,
  operational metrics, audit history, manual time entry. Checklist and fake route/timeline
  UI removed.
- Customer operations UI redesigned (residential/commercial client type, company name field,
  notes/room-counts/access-code gaps fixed).
- Calendar redesign shipped: staff/day/week/month views, multi-employee assignment.
- `nightly DB backup` GitHub Action exists in `kaianbenitez/cleanops-backup` but is currently
  failing — see Blocked below.
- Next.js patched 16.2.10 → 16.2.11 (latest stable). The actual CVE fixes (SSRF in Server
  Actions/rewrites, unauthenticated Server Function disclosure) only exist in unreleased
  `16.3.0` canary/preview builds — didn't force an unstable build onto a pre-launch app.
  Watch for a stable `16.3.0` release and take it when it lands.
- Dead code removed: orphaned `scripts/seed-sample-jobs.mjs`; empty `quote_line_items` table
  + relations; empty `customers.archivedReason`/`archivedAt` columns (verified 0 rows / 0
  non-null in prod before dropping); ~10 unused vars/types across dashboard, invoices,
  employees, jobs, and reports pages. See `DECISIONS.md` 2026-07-24 entry for the schema
  deviation writeup.
- Backend query efficiency pass: parallelized independent queries with `Promise.all` in
  `customers/page.tsx`, `dashboard/page.tsx` (x2), `calendar/page.tsx`; replaced a
  full company-wide customer table scan with two SQL `COUNT` queries for the dashboard's
  "needs attention" cards.
- Migration `drizzle/0011_plain_freak.sql` **applied to the hosted DB** (2026-07-24, approved
  by user): dropped `quote_line_items` table and `customers.archived_reason`/`archived_at`
  columns, added indexes `invoices(company_id, status)`, `invoices(job_id)`,
  `webhook_events(source, processed_at)`, `audit_log(company_id, created_at)`,
  `ghl_sync_log(company_id, status)`, `job_assignments(user_id)`. Applied as a direct SQL
  transaction, **not** via `npm run db:migrate` — see the `db:migrate` caveat below, this
  matters for every future migration on this DB, not just this one.

## Blocked / needs a human

- **Square invoicing is running in silent mock mode in production.**
  `SQUARE_ACCESS_TOKEN` / `SQUARE_ENVIRONMENT` / `SQUARE_WEBHOOK_SIGNATURE_KEY` are not set
  in Vercel (`src/lib/square/client.ts` falls back to fake invoice IDs/URLs with zero
  warning anywhere in the admin UI when the token is unset). **Explicitly on hold** until the
  client approves the current build — do not chase this until told to.
- **Nightly DB backup workflow is failing** (`kaianbenitez/cleanops-backup` repo, most recent
  run failed). Supabase's direct connection (port 5432) is IPv6-only; GitHub Actions runners
  can't reach it. Fix: Supabase dashboard → Project Settings → Database → Connection string →
  switch to **Session pooler** mode → copy that URL into the `BACKUP_DATABASE_URL` secret in
  `cleanops-backup` → re-run the workflow manually from the Actions tab to confirm green.
  Needs dashboard/GitHub-secrets access only the user has.
- `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` not yet set (user is obtaining one). Once added: the
  legacy `Autocomplete` widget in `customers/address-autocomplete.tsx` already qualifies for
  Google's cheaper per-session billing (Basic Data fields only) — no change needed there. But
  `calendar/route-preview.tsx` re-geocodes every job's address on every render with no
  caching — cache the resulting lat/lng on the customer/location record after first lookup
  before this goes live, or it'll scale linearly with usage on the metered Geocoding API.
- Codex is actively working in this repo in parallel — as of this writing, uncommitted
  changes span `calendar/shared.ts`, `calendar/month-board.tsx`, `calendar/staff-board.tsx`
  (overflow-cap for `assignDayLanes()`), plus a new employee-photo-upload feature
  (`employees/directory-client.tsx`, `employees/page.tsx`, `employees/new/page.tsx`,
  `api/employees/[employeeId]/photo/`, `src/lib/employees/`, and two more generated
  migrations `0012`/`0013` changing `users.birthday` to `text` and adding a photo column).
  **Do not touch any of those files or apply those migrations** — not reviewed, not
  committed, not yours to finish. Re-check `git status` at the start of every session; this
  list will be stale by the time you read it.

## Resolved — don't re-investigate

- **`npm run db:migrate` does not work on this hosted database — don't try it.** This DB has
  never been tracked by drizzle-kit's migration system; schema here has always been applied
  via `db:push` or manual `ALTER TABLE` (per `DECISIONS.md`'s earlier entries). Running
  `db:migrate` makes drizzle-kit try to replay the *entire* migration history from `0000`
  onward against a DB where those tables already exist — confirmed on 2026-07-24 that it
  fails safely (rolls back, `drizzle.__drizzle_migrations` ends up created but empty, no
  schema change, no data loss) but accomplishes nothing. To apply a specific migration file,
  extract its SQL and run it directly in a single transaction (psql, a short node/postgres
  script, or the Supabase SQL editor) instead of through the npm script.
- Payroll tier rates: safe by default. Company bracket *boundaries* fall back to a hardcoded
  4-tier default; every employee requires a flat `hourlyRateCents` at creation
  (`POST /api/employees`), so payroll never silently computes $0. Per-employee tiered rates
  are optional polish, not a launch blocker.
- The two Calendar bugs from the prior handoff — the `Unassigned` stat card querying the
  wrong unfiltered month-wide dataset, and `assignDayLanes()` having no overflow cap — are
  both resolved by the Calendar redesign / Codex's in-progress overflow-cap work
  respectively. No duplicate work needed here.
- `npm audit`: Next.js/sharp/postcss CVEs remain after the 16.2.11 patch (see Done above) —
  known, tracked, not actionable until Next.js ships a stable release with the fix.

## Still open (decisions for the user)

- Delete test/demo accounts (QA Tester, Test Cleaner, Maria Gomez — from `src/db/seed.ts`)?
- Create real pilot cleaner accounts (only admin/test accounts exist today).
- Test the My Day workflow on an actual phone.
- Run `npm run smoke:routes` against a local production build this cycle.
- Full pagination + SQL-aggregate rewrite for the `customers`, `invoices`, and `sync-issues`
  list pages — currently flagged, not implemented. Their stat cards read the entire filtered
  row set client-side, so real pagination means moving those into SQL aggregates first. Low
  urgency at current data volume; will matter as customer/invoice counts grow.

## Parallel-work note

Codex works on this same repo in parallel and can commit/push directly mid-session. If
`git status` shows an unexpected mid-merge state or files modified that you didn't touch, do
not touch them destructively — `git fetch` and check `origin/main` and the latest Vercel
deployment first.
