# Handoff — current status

Living status doc, updated at the end of each work session. Read this first in any new
session before starting work. Stable working rules live in `AGENTS.md`; historical
schema/architecture deviations live in `DECISIONS.md`. This file is just "where things
stand right now."

Last updated: 2026-08-13 (job PATCH scheduling warnings surfaced in the UI — see the entry right below).

## Done

- **`PATCH /api/jobs/[jobId]`'s double-booking `warnings` array is now surfaced in the UI instead of being silently discarded (2026-08-13, Help Center v0.2.46).** From the "Still open" backlog: the route has computed a `warnings` array since the overlap check was added (an employee getting double-booked when a job's date/time/duration/crew changes), but only `staff-board.tsx` and `unassigned-panel.tsx` ever read `body.warnings` from the response — every other caller either used the shared `commitJobPatch` helper without passing `onWarning`, or (the full Job Detail page at `/jobs/[jobId]`) called the API directly and never looked at `body.warnings` at all.
  Added the same `warning` state + amber "Scheduling warning: …" banner (`role="status"`, matching the existing `staff-board.tsx` styling) to the five remaining callers: `calendar/day-board.tsx`, `calendar/list-board.tsx`, `calendar/today-list-board.tsx`, `calendar/job-detail-panel.tsx` (all via `onWarning: setWarning` on `commitJobPatch`), and `jobs/[jobId]/job-detail-client.tsx` (reads `body.warnings` directly since it doesn't go through `commitJobPatch`, shown as a dismissible toast like its existing error toast). No API or schema changes — the warnings were already being computed and returned, just dropped on the floor client-side.
  Verified: `npm run lint` and `npm run typecheck` both clean (0 errors; the lint warnings present are pre-existing and unrelated to these files). Did not run `npm run build`/smoke tests or click-through test in a browser — this Mac clone still has no `.env.local` (same longstanding `BROWSER_ADMIN_PASSWORD` gap as most other entries in this doc).
  PTO conflicts are a separate, harder block (409 on save, not part of `warnings`) and were already surfaced via each caller's existing `onError` handling — untouched here.

- **Rebuilt the public ServiceSpark landing page around real product screens and made early-access requests lower-friction (2026-08-07).** The original public page described the shipped operations features only as six text cards, making it harder for a prospective cleaning-business owner to assess whether the product is real and relevant. Replaced that grid with an alternating, responsive text-and-screenshot sequence for Scheduling, My Day, Customers, Quotes, Invoicing, and payroll-related team tracking, plus the real dashboard screen immediately below the hero. Added the approved trust line: “Not a concept — this is the same system a real cleaning business runs its day-to-day operations on.” All seven images are from the safe fictional Demo Cleaning Co. account; the payroll image deliberately uses the team directory rather than the known-broken demo Payroll screen. Each Next Image now uses the source file's real dimensions, including the taller 1568×778 invoicing screen, so screenshots retain their native aspect ratios.
  The early-access form now requires only business name and email; name, phone, crew size, and message remain available but optional. Updated client normalization, API validation, and the Drizzle schema together, and added `drizzle/0029_product_leads_optional_contact.sql` to drop the live table's `contact_name` and `phone` NOT NULL constraints. Help Center v0.2.9 records the public-facing change.
  Verified in this worktree: `npm run check:env`, `npm run check:drift`, and `npm run verify` all passed (the existing lint warnings remain warnings only); a built production server returned 200 for anonymous `/`, `smoke:routes` passed 6/6, and `smoke:auth` passed 22/22. Confirmed the output contains the dashboard, feature screenshots, and trust copy. **Hosted migration and acceptance test completed:** after explicit approval, applied `drizzle/0029_product_leads_optional_contact.sql` directly to the hosted database in one transaction, then re-ran `check:drift` clean. A real `POST /api/leads` body containing only business name and email returned 201; its single inserted row had null `contact_name` and `phone`. That exact disposable row was deleted immediately and a follow-up query confirmed zero rows remain, so no test lead data was left behind.

- **Job Detail's "Add time manually" form now supports total-hours entry and drops the date
  picker entirely, merged to `main` at `31e4e9a` (2026-08-07).** #2-ranked item from the
  2026-08-07 client feedback backlog, surfaced while the user was doing last week's payroll by
  hand: the only way to log a technician's time was two `datetime-local` inputs (clock-in,
  clock-out), forcing a full date-and-time pick twice for every entry, with no way to just type
  a number of hours.
  Added a mode toggle on the **add-new-entry form only**: "Total hours" (a single decimal
  input, 0.01–16, validated) or "Time in / time out" (two `type="time"` inputs — still no date
  picker). Both modes compute the actual `clockIn`/`clockOut` client-side using the job's own
  `scheduledDate` (falling back to `scheduledStartTime`, or this codebase's existing 9:00 AM
  default when a job has no start time set, matching the convention already used in
  `api/jobs/[jobId]/route.ts`'s overlap check) — the admin never picks a date. A shift crossing
  midnight (e.g. 11:30 PM → 12:15 AM) correctly rolls the end time to the next calendar day
  instead of erroring. Neither time-entry API route nor the database schema changed at all —
  the client still POSTs the identical `{ userId, clockIn, clockOut, notes }` shape as before,
  just computed differently.
  **Deliberately excluded, by design, not an oversight:** the separate "Edit time entry"
  correction form (for fixing an already-logged entry) was left completely untouched, still
  using full date-and-time pickers — a correction may legitimately need to fix the actual date
  a job was worked on (e.g. a cleaner who didn't clock out until after midnight), so
  auto-locking the date there would trade one annoyance for a real regression. Only the
  add-new-entry flow got the redesign.
  Built by Codex in a dedicated worktree (`cleanops-manual-time-entry`,
  `codex/manual-time-entry-redesign`) off a structured contract that included the exact
  existing-convention fallback (9:00 AM) to reuse and the scope decision on the Edit form up
  front. Diff reviewed line-by-line before integrating — confirmed the date-math (local time
  construction via the same semantics the old `datetime-local` inputs already used, then
  `.toISOString()`) is correct by hand-tracing both the total-hours and midnight-rollover
  cases, and confirmed via `git status` that only the two intended files changed, with the Edit
  form's block byte-for-byte untouched.
  Verified independently, not just Codex's own report (its sandbox had no `.env.local`):
  copied real credentials into the feature worktree, then `check:env`, `check:drift` (clean, no
  schema touched), `npm run verify` (0 errors, same 26 pre-existing warnings, build compiled),
  `smoke:routes` (6/6) and `smoke:auth` (22/22) against a local production server — repeated a
  second time on the integrated `main` after merging, both clean. Because the time-entry API
  routes are provably unchanged (confirmed via diff, not assumption) and the only new logic is
  client-side date arithmetic already hand-verified, a live database round-trip test was judged
  unnecessary for this change, unlike the higher-risk payroll JTH-override fix shipped earlier
  the same day.
  **Not click-through-tested in a real browser** — same longstanding `.env.local`
  `BROWSER_ADMIN_PASSWORD` gap as most other entries in this doc. Worth an actual look next
  time someone's logged in: open a job, try logging time both as total hours and as a
  time-in/time-out pair (including one that crosses midnight), and confirm the correction
  ("Edit") form still looks and works exactly as before.

- **Backfilled real historical `customers.created_at` for 217 imported customers, using a
  source-system export, run directly against the hosted DB (2026-08-07, data-only — no code
  changed, no commit).** Follow-up to the Sales report shipped earlier the same day: while
  investigating why "Acquired recurring"/"New leads" looked inflated for recent date ranges, the
  user pointed me at `C:\Users\kbeni\Downloads\customers-2026-08-06.csv`, a real export from
  their old system ("TheCustomerFactor"). Cross-checking it against the live DB (read-only,
  by me directly) proved that the 2026-07-22 bulk import had stamped every migrated customer's
  `created_at` with the import timestamp instead of their real historical signup date — e.g. Mary
  Anderson's real add date was 2018-01-23, but the app showed 2026-07-22. `customers.customer_number`
  turned out to be an exact carryover of the old system's row `Id`, giving a reliable join key.
  With explicit user approval, had Codex write a throwaway single-transaction script (deleted
  after running, nothing committed) that matched CSV `Id` → `customer_number` **and** required
  the customer's name to also match before touching anything; anything ambiguous was left alone
  and reported instead of guessed. Result: 217 of 221 CSV rows matched and were corrected to
  their real `Date Added` (set to noon UTC on that date, to avoid day-boundary drift in report
  bucketing); 4 were skipped and are still on the import-date stamp — 2 name mismatches (`1024`
  CSV "David Eastin" vs live "Becky Eastin"; `1244` CSV blank name vs live "PDG (no last name)")
  and 2 with no matching `customer_number` live at all (`1486` "Lori Malone", `1488` "Quentin
  Turner") — worth a manual look if those 4 matter, otherwise harmless as-is. Independently
  verified by me afterward: live customers went from ~230 stuck on 2026-07-22 down to 13, real
  `created_at` values now span 2016-06-27 through today.
  **Updates the caveat in the Sales report entry below:** "New leads" is now accurate for these
  217 customers for any date range. The `recurring_series.start_date`/`end_date` clustering
  issue (used by "Acquired recurring"/"Lost recurring") is **not** fixed by this — the source CSV
  only had a customer-level add date, not per-service-cycle recurring dates, so that caveat still
  stands.
  Also shipped in the same session, now that the underlying data is accurate: a small "Added on
  [date]" / "Customer since [date]" display on the customer list and profile page respectively,
  merged to `main` at `192159d` — built and reviewed *before* the backfill was approved,
  deliberately held back from merging until the data itself was correct, since showing the old
  import-date stamp would have been actively misleading. `check:drift` and `npm run verify`
  both re-run clean after merging with the concurrently-shipped payroll JTH feature (one
  Help Center changelog conflict, resolved by keeping both entries and renumbering this one to
  `v0.2.7` to avoid a duplicate version number with the payroll entry's `v0.2.6`).
  Not applied: `customers.status`/`recurrence`-derived history, and the CSV's own "Date Canceled
  Service" column, which could similarly improve "Lost recurring" accuracy — flagged as a
  possible future follow-up, not requested or built.

- **Admins can now edit the price charged and Job Ticket Hours (JTH) on an individual job
  occurrence, merged to `main` at `1922d62` (2026-08-07).** Highest-priority item from the
  2026-08-07 client feedback backlog: while mimicking last week's payroll, the user found no
  way to correct a recurring job's hours or charge for one specific visit when actual work
  differed from the template (extra room cleaned, or a room skipped) — a pay-correctness gap,
  not just UX.
  Root cause was two-fold, both found before writing code: (1) `PATCH /api/jobs/[jobId]`
  already accepted `priceCents`/`estimatedDurationMinutes` for a single job, but Job Detail had
  no UI exposing either as editable — both only ever rendered as static text; (2) even a manual
  edit (via that API, or the calendar's existing resize handle) would have been **silently
  reverted** the next time payroll was generated or refreshed for that period —
  `refreshJobTicketHours()` unconditionally recomputed every completed job's JTH from
  price ÷ branch rate with no memory of a deliberate override.
  Fixed with a new `jobs.jth_manual_override` boolean (migration
  `drizzle/0028_job_jth_manual_override.sql`, additive, applied to the hosted DB and confirmed
  via `check:drift`). `PATCH /api/jobs/[jobId]` now sets it whenever `estimatedDurationMinutes`
  is set explicitly, and skips its own price-triggered auto-recalculation once a job carries the
  flag (so a later price-only edit can't quietly discard a manual JTH either).
  `refreshJobTicketHours()` skips any job with the flag entirely — never recomputes it, never
  reports it as unresolved. Job Detail's "Service package" card gained two independent inline
  editors (price, JTH — each its own save call, matching the server's per-field semantics) with
  a small "Manually set" badge when JTH is overridden. The recurring series template itself
  (`recurringSeries.priceCents`/`estimatedDurationMinutes`) is never touched by any of this —
  only the one occurrence.
  Built by Codex in a dedicated worktree (`cleanops-payroll-jth`, `codex/payroll-jth-edit`) off
  a structured contract citing the exact root-cause files/lines up front. Diff reviewed
  line-by-line before integrating — scope matched the contract exactly (8 files, no stray
  changes). Verified independently, not just Codex's own report (its sandbox had no
  `.env.local`): copied real credentials into the feature worktree, then `check:env`,
  `check:drift` (correctly flagged only the new column before the migration was applied),
  `npm run verify` (0 errors, same 26 pre-existing warnings, build compiled), `smoke:routes`
  (6/6) and `smoke:auth` (21/22 — the one expected failure was `GET /api/jobs/[jobId]` 500ing
  on the not-yet-applied column). After user approval, had Codex (not Claude directly, since
  applying hosted-DB migrations and running data-mutating verification scripts is Codex's job
  per this project's collaboration rules) apply the migration for real in a single transaction,
  then re-ran `check:drift` (clean) and `smoke:auth` (22/22, job route now 200). Codex also ran
  a disposable-job round-trip proof against the hosted DB with real before/after values: a
  manually-set JTH (315 min) survived both a `refreshJobTicketHours` call and a subsequent
  price-only edit unchanged, while a second, never-overridden job's JTH still auto-recalculated
  normally (180 min) on the same refresh call — proving the exact bug is fixed, not just that
  the code compiles. All disposable test rows and the throwaway script were confirmed deleted
  afterward (0 remaining).
  Merged onto `main` with one real conflict, resolved by hand: this feature and the
  concurrently-shipped Sales Reports feature (see the entry above/below) both independently
  claimed Help Center changelog version `v0.2.5` off the same base commit — renumbered this
  feature's entry to `v0.2.6`, kept both entries, no content lost. Re-verified the full sequence
  a second time on the integrated `main` (not just the feature branch) before pushing:
  `check:drift` clean, `verify` clean, `smoke:routes` (6/6) and `smoke:auth` (22/22, including
  the previously-failing job route) both against a fresh local production server.
  **Not click-through-tested in a real browser** — same longstanding `.env.local`
  `BROWSER_ADMIN_PASSWORD` gap as most other entries in this doc; the disposable-job round trip
  and authenticated HTTP checks above are the closest available substitute. Worth an actual
  look next time someone's logged in: open a job's detail page, edit the price and separately
  the Job Ticket Hours, confirm both save and the "Manually set" badge appears, and confirm a
  price-only edit afterward doesn't reset the hours back.

- **Reports & Exports Center: added a Sales report and fixed a flickering preview, merged to
  `main` at `bbc3659` (2026-08-07).** Follow-up to the Reports & Exports Center rebuild directly
  below. Two user-reported items: (1) the Preview button's popup modal was glitching/flickering
  in the browser — replaced entirely with an inline expand inside the report card (table grows
  the card downward, no `fixed`/backdrop/portal), which is also just a simpler pattern; (2) added
  a new **Sales Reports** section with one card covering the funnel the user asked for by name:
  new leads, quotes sent, quotes accepted, recurring clients acquired, and recurring clients
  lost. Metric definitions (grounded in the real schema, no leads/CRM table exists separately
  from `customers`): New leads = `customers` rows created in the range; Quote sent/accepted =
  `quotes.sentAt`/`acceptedAt` in the range; Acquired recurring = `recurring_series.startDate` in
  the range; Lost recurring = `recurring_series.endDate` in the range. Same date-range and Area
  filtering as the other report cards; CSV export is a row-level activity log (`Type, Customer,
  Area, Date`), not just the 5 headline numbers, and those numbers also appear in the card's
  summary line. No schema change needed — reused the existing `report_exports` tracking table
  (`reportKey: "sales"`).
  **Data caveat worth knowing, not a bug:** I independently queried the live database before
  shipping and found all 213 `recurring_series` rows have a `start_date` between 2026-07-09 and
  2026-09-02 — a ~2-month window centered on today, with 209 of those 213 rows actually created
  in the database on 2026-07-22 (the bulk data-import date). That means "Acquired recurring" for
  any date range that overlaps this window will look artificially high — it's mostly reflecting
  the one-time import backfilling real clients' service-start dates, not genuine new sales
  happening right now. The same is true of "New leads" for ranges touching 2026-07-22 (230 of the
  customers in the system were created that same day). This will self-correct as real time passes
  and the import date rolls out of whatever range someone selects; until then, treat 30-day/month
  ranges that include late July 2026 with that in mind. Not something to fix in code — it's a
  property of the imported data, and the report is counting it correctly.
  Verified: `check:drift` clean (no schema change), `npm run verify` clean, both re-run
  independently by me in addition to Codex's own run of the full release sequence
  (`check:env`, `check:drift`, `verify`, `smoke:routes`, `smoke:auth`, plus an authenticated
  `/reports` check across presets/areas and a real Sales CSV download). Same "not click-through-
  tested live in a browser myself" caveat as the entry below, for the same reason (would require
  typing a login password).

- **`/reports` completely rebuilt into a "Reports & Exports Center," merged to `main` at
  `6ad69a6` (2026-08-07).** User request: scan an approved Stitch mockup ("Reports & Exports
  Center," project `6245096507068354660`) and rebuild the Reports page around it — a catalog
  of report cards grouped by category, each with a real CSV export — replacing the old page's
  entire KPI-dashboard-shaped layout (hero stat tiles, executive summary, sales funnel,
  duplicated numbers). This supersedes `HANDOFF.dashboard-reports-redesign.md`'s §5 "Reports
  target structure" for `/reports` specifically (that doc's dashboard-only content is
  unrelated). There is also an old, unmerged, abandoned attempt at a *different* KPI-tile
  redesign of this same page sitting in a leftover worktree (`codex/dashboard-reports-dataviz`)
  — never referenced, never merged, left alone.
  The mockup's colors were **not** copied — it used a generic green, but this app's real live
  brand color is blue (`--co-accent` `#2457ff`); rebuilt in the app's actual palette.
  Layout: page header (title + subtitle, an Area filter, and the same `resolveRange`
  `?preset=&from=&to=` date-range contract the dashboard already uses) above two sections —
  **Financial Reports** (Payroll, Tips, Accounts Receivable) and **Operations Reports** (Jobs,
  plus a disabled "Quality & Inspections — Coming soon" placeholder). Each real card shows a
  "Last exported" timestamp, a **Preview** button (real data in a pop-up table, capped at 50
  rows with a total count), and a **CSV** button (full, uncapped download).
  Three scope decisions made with the user up front rather than guessed, following a
  data-availability check of the real schema first: (1) a 5th "Quality & Inspections" card
  from the mockup has zero backing data anywhere in this schema (no inspection/rating table
  exists) — shown as a disabled "Coming soon" card, nothing fabricated; (2) the mockup's
  "Schedule Auto-Export" button was left out entirely — this app has no recurring-export/email
  infrastructure, and building one is a separate project; (3) "Last exported" memory and a real
  Preview (not just working downloads) were both built, which required one small new table.
  Payroll's card deliberately does not mention "overtime" — `gusto-csv.ts` already hardcodes
  overtime to 0 (not tracked in this schema), so the report only describes what's real: hours,
  tips, and gross pay. Tips reports stay employee-level only (no per-job breakdown attempted —
  the data isn't cleanly pre-aggregated for that). Accounts Receivable adds real aging buckets
  (0-30/31-60/61-90+ days) on top of the existing `overdueSqlCondition()`/cash-to-collect logic.
  Area filtering (the "Area = customers.city" substitution already established for this app's
  dashboard work — there is no region/hub concept anywhere in the schema) applies only to
  Accounts Receivable and Jobs, the two report types with a customer relationship; Payroll and
  Tips are employee/pay-period based and ignore it, by design.
  New `report_exports` table (companyId, reportKey, exportedByUserId, exportedAt) tracks every
  successful CSV download so the "Last exported" timestamp is real, not guessed — migration
  `drizzle/0027_report_exports.sql`, **applied to the hosted DB and confirmed via
  `check:drift`** (approved by the user first). Caught on review before integrating: Codex's
  first pass created the table without enabling Row Level Security, which every other table in
  this app has had since the 2026-08-04 RLS sweep (`HANDOFF.md`'s own documented rule for any
  *new* table going forward) — sent back and fixed with the same default-deny,
  no-`CREATE POLICY` pattern as `drizzle/0023_enable_rls.sql`, confirmed in the final diff
  before merging. Also caught: `getLastExports`' TypeScript return type claimed a real `Date`
  object from a raw SQL `max(...)` aggregate without actually coercing it — fixed to explicitly
  `new Date(...)` the value so the type isn't lying about what the driver returns.
  Built by Codex in a dedicated fresh worktree (`cleanops-reports-exports-center`,
  `codex/reports-exports-center`) off a structured contract that included the schema
  data-availability findings up front (what's real per report type, what's a substitute, what
  to omit) so Codex wasn't left guessing mid-build. Independently reviewed file-by-file before
  integrating — confirmed scope stayed to the 7 intended files (`git diff --stat`), the Area
  filter really is scoped to just AR/Jobs in the query layer, and every card's copy matches
  what its query can actually prove.
  Verified for real, not just Codex's own report (its sandbox had no `.env.local` and couldn't
  run past `check:env`): copied this checkout's `.env.local` into the feature worktree, applied
  the migration, then ran the full sequence twice — once in the feature worktree, once again on
  this integration checkout after the fast-forward merge (no conflicts): `npm run check:env`,
  `check:drift` (clean both times), `npm run verify` (0 errors, same 26 pre-existing warnings,
  build compiled including `/reports` itself against live data), `smoke:routes` (6/6) and
  `smoke:auth` (22/22) against a local production server, both times. Additionally ran a
  throwaway authenticated script (magic-link bypass, same pattern as `smoke-test.mjs`) that hit
  `/reports` directly and confirmed every section/card renders, then called all four CSV export
  routes directly: Payroll, Tips, and Jobs all returned real multi-row CSVs; Accounts
  Receivable correctly returned header-only — checked directly against the DB and confirmed
  honest, not a bug: this company has exactly one invoice on record company-wide (already
  paid), the same known Square-invoicing-mock-mode gap already tracked elsewhere in this doc.
  Also confirmed the new `report_exports` table was actually being written to (4 real rows
  after the test exports). Script and the copied `.env.local` both deleted after.
  **Not click-through-tested in a real browser** — the login form requires typing a password,
  which is outside what this session does directly; the direct authenticated HTTP checks above
  (real session, real cookies, real database) are the closest available substitute. Worth an
  actual visual pass next time someone's logged in: open `/reports`, try the Area and date
  filters, open a Preview pop-up, and download a real CSV.



- **Three quote-related bugs fixed and merged to `main` at `576e697` (2026-08-07).** User
  reported via three items in one message: (1) room/house details entered while creating a
  quote weren't showing up on the customer's profile afterward, especially for new customers
  created inline from the quote builder; (2) the dashboard's Sales summary showed only 1
  accepted quote when the user had 2 accepted; (3) quotes could get scheduled/booked without
  the customer ever explicitly accepting.
  Root cause of (1): `quotes.roomCounts` and `customers.homeDetails.roomCounts` are separate
  storage locations in different shapes (array on the quote, keyed record on the customer) and
  nothing copied one into the other — not just for new customers, existing-customer corrections
  made on a quote were lost too. Fix: `POST /api/quotes` now upserts the customer's
  `homeDetails.roomCounts` from the quote's room counts on every quote creation.
  Root cause of (2): the dashboard's accepted/booked quote counts filtered the whole query by
  `quotes.createdAt` falling in the selected date range before checking `status = 'accepted'`,
  so a quote created outside the range but accepted inside it (or vice versa) was invisible —
  inconsistent with the Reports page, which already filters accepted quotes by `acceptedAt`.
  Fix: `getOperationsDashboard` and `getPulseMetrics` in `src/lib/dashboard/queries.ts` now
  filter accepted/booked counts by `quotes.acceptedAt`, leaving `sent` on `createdAt`.
  Root cause of (3): no code path silently flips `quotes.status` to accepted — the actual issue
  was the "Schedule without acceptance" button (a legitimate internal override for
  phone/verbal approvals) being a single click with no confirmation, no recorded reason, and
  styled as the primary button on the page. Per the user's decision, kept the override but made
  it safe: it now requires a typed reason via a confirmation dialog, records it in `audit_log`
  (no new schema/migration — reused the existing table), is restyled as secondary, and the
  quote detail page shows a persistent "Staff override — customer did not sign" badge with the
  reason once used.
  Built by Codex in a dedicated worktree (`cleanops-quote-bugfixes`, `codex/quote-bugfixes-aug7`),
  delegated with a structured contract after Claude Code investigated and cited exact files/
  lines for all three root causes up front. Independently reviewed diff-by-diff before
  integrating. Verified in the feature worktree with real env vars: `npm run typecheck` (clean),
  `npm run build` (clean), `npm run check:env` (11/16 configured, passed), `npm run check:drift`
  (OK, no drift), and both `npm run smoke:routes` and `npm run smoke:auth` against a local
  `next start` server (all checks passed, including the quote detail page's new
  `bookingOverride` field). Fast-forward merged into `main` and pushed — no rebase needed.


- **Desktop sidebar's account card was getting cropped on shorter browser windows, and five
  Calendar render sites were missing the entity-decoding fix — both fixed, merged to `main`
  at `fecda7c` (2026-08-07).** User reported via two screenshots: the "Elaine Gascon" account
  card at the bottom of the sidebar was cut off, and job notes in the Calendar List view were
  showing raw HTML entity codes (`&#39;`) instead of apostrophes.
  Root cause of the first bug: the desktop `<aside>` in `app-nav.tsx` is `fixed inset-y-0`
  (pinned to full viewport height), `flex-col`, with no `overflow-y-auto`/`min-h-0` anywhere
  in the column — so on a window shorter than the combined height of the logo, nav links, and
  account card, the flex children didn't shrink and the account card silently rendered past
  the visible viewport edge with no way to scroll to it. Fixed by making just the middle
  `<nav>` section `flex-1 min-h-0 overflow-y-auto`, so only the link list scrolls when it
  doesn't fit — logo and account card stay pinned top/bottom and always fully visible. Same
  `min-h-0` precaution applied to the mobile drawer nav.
  Root cause of the second bug: this is the same legacy-CSV-import entity problem already
  fixed once (see the 2026-07-30 "My Day / customer profile notes were showing garbled text"
  entry below, which added `cleanNoteText()` in `src/lib/format.ts`) — it just was never
  applied to Calendar. Codex grepped the calendar directory for every render site touching
  the four legacy note fields (`customerNotes`, `gateCodeOrKeyNotes`, `petNotes`,
  `doNotClean`) and found five spots missing the fix, not just the one the user saw:
  `today-list-board.tsx` (List view's expanded notes row), `client-home-symbols.tsx` (the
  pet/entry icon tooltips shared across Calendar), `job-card.tsx` (the truncated note preview
  on Staff-board job cards), `job-detail-panel.tsx` (the drag-and-drop detail popup), and
  `staff-vertical-board.tsx` (Staff Vertical view). All five now decode through the same
  existing `cleanNoteText()` helper — no new decoding logic added.
  Built by Codex in a dedicated worktree (`cleanops-sidebar-notes-fixes`,
  `codex/sidebar-notes-fixes`), delegated with a structured contract specifying the exact
  files, line numbers, and root cause up front. Independently reviewed line-by-line before
  integrating — confirmed via `git diff --ignore-space-at-eol` (the worktree had LF/CRLF
  noise from line-ending config) that every changed file's diff was exactly the intended
  scoped fix, nothing else touched. A required Help Center changelog entry (`v0.2.2`) was
  added in the same handoff, per this repo's own working rule.
  Verified independently, not just Codex's own report (whose sandbox had no `.env.local` or
  installed dependencies and couldn't run its own verification): copied `.env.local` into the
  feature worktree, ran `npm install`, then a clean `npx tsc --noEmit` and `npm run verify`
  (0 errors, same 26 pre-existing warnings) — in the feature worktree, then again after the
  cherry-pick onto this integration checkout, plus `npm run check:drift` (clean, no schema
  touched).
  **Not click-through-tested in a real browser** — the Chrome extension and the alternate
  browser-automation tool were both unavailable this session. User explicitly chose to ship
  on the strength of the code review + build/type/lint verification rather than wait. Worth
  an actual look next time someone's logged in: check the sidebar at a short window height
  (e.g. ~700px) and confirm the account card is reachable, and open Calendar's List/Staff
  Vertical views on a customer with legacy notes containing apostrophes and confirm they read
  as normal punctuation, not `&#39;`.

- **Dashboard header + date filter corrected to a real one-line layout, merged to `main` at
  `d5e3147` (2026-08-06).** Same-day follow-up after the user reviewed the polish pass right
  below and it didn't match what they'd asked for: the title and the filter were still in two
  stacked rows, and the "Custom" option hid plain date inputs behind a dropdown selection
  rather than showing an actual visible date picker. Confirmed the intended layout with the
  user via a mockup before rebuilding (`AskUserQuestion`, since a second wrong guess would
  have meant a third expensive round-trip): title on the left, preset dropdown + a persistent
  date-range button on the right, all one row on desktop.
  Built by Codex as a follow-up on the same thread (`codex/dashboard-refine`, `41a5487`),
  cherry-picked here cleanly as `d5e3147`. `page.tsx`'s `<header>` and `<DateRangeControls>`
  now share one flex row (wraps only at narrow/mobile widths). The preset dropdown lost its
  "Custom" entry (7 items: Yesterday/This week/Last week/This month/Last month/This year/Last
  year) since a new always-visible button next to it now shows the actual resolved date range
  as text (e.g. "Aug 1 – 6, 2026") and opens a popover with From/Through date inputs + Apply —
  reusing the trigger-button/outside-click/Escape-to-close interaction pattern already
  established in `src/app/(app)/calendar/date-picker.tsx` (not its calendar-grid rendering,
  just the popover mechanics). Added one line to the existing `v0.2.1` Help Center changelog
  entry rather than bumping the version again, since this corrects the same-day release.
  Verified the same way as the polish pass below: diff read line-by-line against the
  corrected spec, then a full `check:env`/`verify`/local-prod-server/`smoke:routes`(6/6)/
  `smoke:auth`(22/22) pass in the feature worktree and again on this integration checkout
  after the cherry-pick — both clean.
  **Not click-through-tested in a real browser** — same longstanding `.env.local`
  `BROWSER_ADMIN_PASSWORD` gap as the rest of this doc. Worth a visual check next time
  someone's logged in, particularly the date-range popover's position/closing behavior on a
  phone screen.

- **Dashboard polish pass: compact single-row date filter, new date presets, removed
  duplicate controls/numbers, and a real schedule table — merged to `main` at `93114b5`
  (2026-08-06).** Direct user follow-up to the same-day Performance overview rebuild (entry
  right below). Built by Codex on `codex/dashboard-refine` (`17a7fcc`), delegated with a
  structured six-item contract, cherry-picked here cleanly (no conflicts) as `93114b5`.
  1. `DateRangeControls` (`src/app/(app)/dashboard/date-range-controls.tsx`) rebuilt as a
     single-row control: one preset `<select>` (Yesterday / This week / Last week / This
     month / Last month / This year / Last year / Custom) instead of a wrapped row of pill
     buttons plus a permanently-visible second row of date inputs. Custom date inputs now
     only appear inline when "Custom" is selected. The quarter preset and its region-picker
     equivalent (never existed in code, confirmed before starting — not added) are both gone.
  2. `src/lib/dashboard/range.ts` gained `yesterday`/`this_week`/`last_week`/`this_year`/
     `last_year` preset resolution + labels; `quarterRangeFor` and the `quarter` preset were
     removed (grepped first — only `page.tsx` referenced it, updated in the same commit). The
     default preset when no query param is present changed from `last_30_days` to
     `this_month`, since Last 30 days is no longer a selectable option in the new dropdown
     (the old preset values still resolve correctly if reached by URL, just aren't offered in
     the UI — harmless).
  3. Removed the redundant "New job"/"New quote" buttons from the Dashboard header
     (`page.tsx`) — the app's global "Create new" menu already covers both from anywhere.
  4. Removed the "Quote pipeline" card from `operations-overview.tsx` — it duplicated the
     Sent/Accepted/win-rate numbers already shown in "Sales summary". Weekly revenue now
     takes the full row width on its own; Sales summary + System insights keep their existing
     two-column row below.
  5. `todays-run.tsx`'s bare list of customer names is now a real table — Time, Customer,
     Cleaning type, Location, Cleaner(s), Status — using the existing shared `StatusPill`
     component (`src/components/ui/status-pill.tsx`) for the status column rather than
     inventing a new badge style. No query changes needed; `getTodaysRun` already returned
     every field the table needed. Wrapped in `overflow-x-auto` so it doesn't break layout on
     a phone; each row keeps one focusable link to `/jobs/{id}` for accessibility.
  6. Added a `v0.2.1` Help Center changelog entry describing all of the above in plain
     language.
  Verified independently before integrating, not just Codex's report: read every changed
  file's diff line-by-line against the six-item spec (all six confirmed correctly scoped, no
  unrelated files touched, `StatusPill` reused rather than reinvented). Then ran the full
  release sequence for real, twice — once in the feature worktree, once again on this
  integration checkout after the cherry-pick: `npm run check:env`, `npm run verify` (build
  succeeded against live data both times), a local production server, `npm run smoke:routes`
  (6/6 both times) and `npm run smoke:auth` (22/22 both times, including a live authenticated
  `200` on `/dashboard` itself).
  **Not click-through-tested in a real browser** — same longstanding `.env.local`
  `BROWSER_ADMIN_PASSWORD` gap as other entries in this doc. Worth an actual look next time
  someone's logged in, especially the new preset dropdown and the schedule table at mobile
  width.

- **Dashboard rebuilt with a client/revenue/quote "Performance overview" section, on top of
  (not replacing) the existing operational widgets, merged to `main` at `6551560`
  (2026-08-06).** Source: a design exported from the team's Stitch account ("Operations
  Dashboard: Overhauled Layout" project) — the raw Stitch mockup (static HTML, Tailwind CDN,
  fake numbers) was used only as a visual/structural reference and was never committed. Built
  by Codex on `codex/dashboard-overhaul-layout` across three rounds (delegated with a
  structured contract; the layout scope changed twice mid-flight based on live user feedback,
  see below), cherry-picked here as three commits (`ba0cdcc`/`125a97d`/`71f1a8e` →
  `7d6ed27`/`c2b21cf`/`6551560`).
  Final layout, top to bottom: a new **"Performance overview"** section (client
  total/gained/lost, quote conversion rate, a real weekly-paid-revenue bar chart, a quote
  pipeline funnel Sent→Accepted→Booked, a sales summary, and a short auto-generated insights
  list — conversion trend vs. the prior period, progress toward the configured revenue
  target, and quotes that have sat unanswered 7+ days), then an **"Operations today"**
  section carrying over three of the prior dashboard's widgets unchanged: `TodaysRun`
  (today's schedule), `TechnicianRoutes` (cleaner routes), `CashToCollect` (overdue/uncollected
  invoices). `PulseTiles`, `RevenueVsTarget`, `CrewCapacity`, and `ExceptionStrip` were
  deliberately deleted (confirmed unused anywhere else in `src/` first) — the new Performance
  overview section supersedes what `RevenueVsTarget`/`PulseTiles` showed; crew coverage and
  the unassigned/missing-hours exception strip were dropped from this page rather than kept,
  the user's explicit call after seeing the merged layout.
  New `getOperationsDashboard()` query (`src/lib/dashboard/queries.ts`) — company-scoped SQL
  aggregates, `Promise.all`'d, no client-side full-table scans, matching this repo's existing
  dashboard-query conventions. No hardcoded numbers survived from the Stitch mockup. The
  **region filter shown in the Stitch design was deliberately omitted** — Codex checked and
  found no durable region field spanning customers/jobs/invoices (only service-area/travel-zone
  data, which doesn't map cleanly), and building it would have produced misleading metrics.
  `DateRangeControls` now offers Today / Last 7 days / Last 30 days / This month / Last month /
  current quarter / Custom — the first three preserved from before, the rest new for
  Performance overview's month/quarter views. The schedule/routes/invoices section stays
  today-anchored regardless of this control, same as before, and the page still says so.
  Added a `v0.2.0` Help Center changelog entry.
  Verified independently before pushing, not just Codex's own reports across the three rounds:
  read every file in the diff line-by-line (`git diff main origin/codex/dashboard-overhaul-layout`),
  confirmed via `git grep` that the four deleted widget files had zero references anywhere
  outside the dashboard folder before trusting the deletion. Then, since Codex's own worktree
  had no `DATABASE_URL` configured and could only get a clean typecheck/lint (build failed at
  the page-data-collection step for that reason), copied this checkout's own `.env.local` into
  the Codex worktree and **independently re-ran everything against the real hosted DB**: `npm
  run check:env` (11/16 configured, passed), `npm run check:drift` (clean — only the
  known pre-existing `quote_line_items` live-but-unused note), a full `npm run verify`
  (build succeeded, including `/dashboard` itself compiling against live data), `npm run
  smoke:routes` (6/6) and `npm run smoke:auth` (22/22, including a live authenticated `200` on
  `/dashboard` itself) against a real local production server. All of that was then repeated a
  second time on this integration checkout after the cherry-pick, before pushing — identical
  results (`check:drift` clean, `verify` clean, `smoke:routes` 6/6, `smoke:auth` 22/22).
  **Not click-through-tested in a real browser** — same longstanding `.env.local` gap as
  most other entries in this doc (`BROWSER_ADMIN_PASSWORD` still isn't set, so Chrome/Playwright
  can't log in interactively; the smoke script itself uses separate hardcoded fallback
  credentials that don't unlock a real browser session). Worth an actual visual pass next time
  someone's logged in: confirm the weekly revenue bar chart, quote pipeline bars, and the three
  restored operational cards all render and look right together on one page, especially at
  mobile width.
  **One open question surfaced during the build, not yet decided:** the Stitch reference's
  weekly revenue chart shows all 7 days (Mon–Sun), but this business's real job/invoice
  activity is concentrated Monday–Friday. Codex could not check actual weekend revenue
  levels from its own worktree (no DB access at the time) and shipped 7 bars as designed.
  Worth pulling real numbers next session and deciding whether Saturday/Sunday should collapse
  out of the chart if they're consistently at or near zero.

- **Isolated demo/test company created for an outside reviewer (the founder's CEO), plus a
  latent multi-tenant safety gap fixed and old test-account clutter removed, merged to `main`
  at `8d6e9fe` (2026-08-06).** User request: a separate test account an outside client/CEO
  could try without seeing real Simply Maid customer data. Investigation found this app has
  only ever run one real company row ("Simply Maid") despite every operational table already
  being `companyId`-scoped — so a second, fully isolated company was architecturally safe to
  add, with one real exception found first: the inbound GoHighLevel lead webhook
  (`processLead` in `src/app/api/webhooks/ghl/route.ts`) resolved "the company" with an
  unscoped `db.select().from(companies).limit(1)` — harmless with one company row, a real risk
  of misattributing a live lead once a second row existed. Fixed by adding a required
  `GHL_PRIMARY_COMPANY_ID` env var (Simply Maid's id) that the webhook now looks up explicitly,
  throwing a clear error instead of guessing if it's unset or doesn't match — set in Vercel
  (Production + Preview) and in local `.env.local`/`.env.local.example`/`scripts/check-env.mjs`.
  Built by Codex on `codex/ghl-webhook-company-scope`, delegated with a structured contract;
  independently reviewed (3-file diff, `npx tsc --noEmit` and `npm run check:env` both clean).
  The new company ("Demo Cleaning Co. — Fictional Training Tenant") was created via a new
  one-time script, `work/seed-demo-company.ts` (dry-run by default, `--apply` required to
  write, matching this repo's existing one-off-script convention) — 1 admin + 2 employee
  logins created the same secure way every real account is created (`generateTemporaryPassword()`,
  `<username>@cleanops.local`, `mustChangePassword: true`), NOT the old hardcoded-password
  pattern in `src/db/seed.ts`. Seeded: a 5-service catalog (3 main, 2 add-on), 14 customers
  spanning every pipeline status with fake room counts/notes/access codes/mop-rag-vacuum
  equipment counts, 2 recurring series, 18 jobs (past-completed, upcoming, one cancelled), one
  sent and one accepted quote, one invoice, and one payroll period with real (non-zero) lines —
  enough to exercise every major screen. No Square/GHL/Maps credentials configured on the new
  company, so it stays in the app's existing safe mock mode for those integrations. Before
  trusting `--apply` against the hosted DB, added a third `--verify-sql` mode that runs the
  exact same insert transaction for real (using throwaway random ids, no real Supabase Auth
  accounts created) and then deliberately rolls back — this is what actually proved the raw-SQL
  column names/enum values/JSON shapes were correct against the live schema, since the script
  uses untyped `postgres` tagged-SQL, not Drizzle's typed query builder, so `tsc` passing alone
  didn't prove it. Ran clean with zero trace left in the DB before the real `--apply`.
  Separately, `work/cleanup-legacy-test-accounts.ts` removed three leftover test/demo user rows
  (QA Tester, Test Cleaner, Maria Gomez) that had been sitting inside the *real* Simply Maid
  company since an earlier session (flagged in this doc's own history) — dynamically discovers
  every foreign key to `users.id` and aborts if any of the three has an unexpected reference;
  the only real references found were 8 `payroll_lines` rows, all confirmed `$0`/open-period
  auto-generated placeholders before deleting. None of the three had a live Supabase Auth
  account at all (confirmed independently before running), so the script was corrected to treat
  0-or-1 Auth matches as valid rather than requiring exactly one.
  Verified independently after both `--apply` runs, not just the scripts' own success output:
  direct DB query confirmed exactly two companies exist, the demo company has its 14 customers
  cleanly separated from Simply Maid's (240), the three legacy accounts are fully gone, and no
  demo customer has a real-looking (non-fictional) address. The demo admin login was confirmed
  genuinely reachable via `auth.admin.generateLink` (a scripted plain password sign-in
  correctly failed on Cloudflare Turnstile/CAPTCHA — expected, since that protects real sign-in
  — not evidence of a broken account). `npm run verify` and a fresh Vercel production build
  both passed after merging.
  **Mid-session note:** this integration checkout briefly had unrelated, unpushed work in
  progress from a concurrent Codex session (the public landing page entry above) — merging was
  intentionally paused and the user was asked before pushing anything, rather than pushing over
  work I hadn't reviewed. Resolved once that session pushed its own work first.
  **Demo login, for reference:** username `drewdemoadmin` (admin), one-time password already
  handed to the founder directly — not repeated here since it's a live credential.
  **Update 2026-08-06, same day:** the founder logged in as `drewdemoadmin` in a real browser
  and confirmed the login works and the app renders correctly — closes the "no live browser
  check yet" gap for the login/general-rendering path. Not yet individually confirmed by that
  pass: the two quotes' public unauthenticated proposal links specifically (this repo's own
  working rules call out that quote changes need both the internal builder and the public
  proposal page checked) — worth a specific look at those two links, plus the invoice and
  Payroll screens, next time someone's in there.

- **Public ServiceSpark landing page and early-access lead capture shipped, merged to `main`
  at `d9637a9` then corrected before push at `a94d6a3` (2026-08-06).** Built by Codex across
  two passes: logged-out visitors to `/` now see a public marketing page pitching ServiceSpark
  to cleaning-business owners as operations software, with a “Request early access” form.
  The page deliberately showcases only real, already-shipped product features; it includes no
  invented capabilities, pricing, or fake testimonials. Logged-in routing remains exactly as
  before: admins redirect from `/` to `/dashboard`, employees to `/my-day`. Early-access
  submissions write to the new `product_leads` table via `POST /api/leads`; this table
  intentionally has **no `company_id`** because it holds product-marketing leads, not
  operational customer data. Migration `drizzle/0026_product_leads.sql` was applied to the
  hosted DB and confirmed with `check:drift`.
  The review pass caught two real pre-merge bugs worth retaining: first, the root
  `middleware.ts`/`updateSession()` gate still redirected anonymous `/` requests to `/login`,
  so the new page could never render; fixed with an exact `pathname === "/"` match and by
  adding `/api/leads` to the public allowlist so the logged-out form can submit. Second, the
  first migration draft left `product_leads` without RLS, which would have exposed submitted
  names, emails, and phone numbers through Supabase's anon-key REST API; corrected before the
  migration was applied with `ALTER TABLE product_leads ENABLE ROW LEVEL SECURITY`, using the
  repo's established default-deny/no-policies pattern from `drizzle/0023_enable_rls.sql`.
  On integrated `main` (not just the feature branch), `npm run check:env`, `npm run
  check:drift`, `npm run verify`, `npm run smoke:routes`, and `npm run smoke:auth` all passed
  before push. Direct anonymous/no-cookie requests against a local production server also
  confirmed that `/` returns 200 with the landing page rather than redirecting, `/dashboard`
  still redirects anonymous visitors, and a honeypot-triggered `POST /api/leads` succeeds
  without inserting a row — checked directly, not inferred from code review.
  **Deliberately not built yet:** no admin UI for viewing submitted leads (query
  `product_leads` directly when needed for now), no pricing anywhere on the landing page, and
  no email/notification on a new lead because this project has no SMTP configured. This shipped
  after production-build and direct HTTP/curl-level verification, **not a live browser
  click-through**; an actual-browser pass is worth doing next time someone is looking.

- **Login screen simplified to a single centered card, and the "CO" text badge replaced
  with a new sparkle logo mark, merged to `main` at `8f5cbc6` (2026-08-06).** User request,
  built through several rounds of design iteration in-conversation (not delegated blind):
  the login page's old two-column layout (dark marketing panel + stat tiles + two "Internal
  use"/"Customer quotes" info tiles) is now one centered card with a soft gradient
  background — logo, "Welcome back," username/password, error message, Turnstile, submit
  button, nothing else. Separately, the app's logo badge (previously plain white "CO" text
  on a solid evergreen square, in the nav sidebar/mobile drawer and login screen) is now a
  small two-tone sparkle mark in blue-grey and white — named "Pure Spark," designed around
  the user's actual pet rabbit Spark's real coloring (confirmed against two photos of Spark:
  the mark's blue-grey/white ratio was corrected mid-session after the first draft had the
  ratio backwards). Several literal "bunny face" directions (ears, whiskers, blaze marking)
  were explored and shown as an Artifact before the user converged on the abstract sparkle
  shape in Spark's colors, deliberately without literal bunny features. New `--spark-mark`
  (`#707C8D`) / `--spark-mark-facet` (`#FCFCFA`) tokens added to `globals.css` alongside the
  existing `--co-*` tokens — no existing token renamed or changed, so buttons/links/active
  states are unaffected; this was a scoped swap of one badge, not a rebrand. The browser
  favicon (`src/app/icon.svg`, new Next.js 16 file-convention icon) now uses the same mark
  on a small cream rounded-square backing so it stays visible regardless of browser theme.
  **Deliberately excluded, on purpose — these still show the customer's own company
  identity, not ServiceSpark's**: the invoice preview's "CO" badge
  (`invoices/[invoiceId]/page.tsx`), the branding settings "Proposal preview" badge
  (`settings/branding/page.tsx`), the public quote/proposal page
  (`quote/[token]/page.tsx`), and the employee-browser's `(company?.name ?? "CO")` avatar
  fallback (a generic two-letter company-initials avatar, unrelated to ServiceSpark's own
  logo) — none of these were touched.
  Built by Codex on `codex/servicespark-logo-mark` off a structured contract with the exact
  approved SVG markup and hex values specified up front (no design decisions left to
  Codex). Independently reviewed line-by-line before integration, not just Codex's
  summary: caught and reverted one out-of-scope edit Codex made to an unrelated My Day
  label (`my-day-client.tsx`) that had nothing to do with this task — confirmed via `git
  diff` that the final integrated commit doesn't touch that file at all, and confirmed the
  four excluded customer-facing files are byte-identical to before. Also had to reconcile
  this branch with an earlier, separately-approved login-layout redesign
  (`codex/login-page-minimal-redesign`) that was cut from an older `main` and hadn't merged
  yet — combined by hand (the approved single-card layout, with its one badge recolored to
  the new mark) since both pieces were already independently reviewed. The Help Center
  changelog entry (`v0.1.7`) was also written by Codex, not edited directly, per this
  project's Claude-plans/Codex-implements convention.
  Verified independently at each stage, not just Codex's reports: live-viewed both the
  login page and `/icon.svg` via the Chrome extension against a local production build
  (screenshot-checked the mark renders correctly at real size), `npm run check:drift` clean
  (no schema touched), `npm run verify` clean (0 errors, same 26 pre-existing warnings) —
  run once in the Codex worktree, then re-run in full on integrated `main` before pushing.
  **Not click-through-tested for the nav-sidebar/mobile-drawer badge specifically** — that
  needs an authenticated session (`.env.local` still has no `BROWSER_ADMIN_PASSWORD`, the
  same longstanding gap noted throughout this doc), so only the login page and favicon were
  visually confirmed live; the nav badges use the identical SVG markup/tokens already
  confirmed working on the login page, just at different container sizes (28/32/40px),
  which is a reasonable but unverified inference. Worth an actual look next time someone's
  logged in: check the sidebar (collapsed and expanded), the mobile drawer, and confirm the
  mark isn't clipped or misaligned at the smallest 28px size.

- **Cleaning equipment counts (mop heads, rags, vacuum) added to customer profile and My
  Day, merged to `main` at `68ab0c7` (2026-08-06).** User request: an icon+number indicator
  so a cleaner can see what to bring before driving to a house. Built by Codex on
  `codex/equipment-indicators` (`68ab0c7`), delegated with a structured contract, in a
  dedicated new worktree (`cleanops-equipment`) rather than the usual `cleanops-codex`
  because that worktree was mid-use by a concurrent session on
  `codex/login-page-minimal-redesign` — see `feedback_cleanops_codex_worktree_collision`
  memory for the pattern going forward.
  New nullable `customers.mop_head_count`/`rag_count`/`vacuum_count` columns (migration
  `drizzle/0025_cleaning_equipment_counts.sql`, additive/idempotent). `null` means "not
  set" — never defaulted to 0 or an invented number. The mop-head estimate shown when no
  real count is set is computed at render time, never stored: sum of "hard-floor" room
  counts (bathrooms/kitchens/laundry/hallway, from `homeDetails.roomCounts` joined against
  `room_types.name`) plus 3, rendered with a muted "~" prefix so it's never confused with a
  confirmed number. This formula was deliberately chosen despite weak accuracy (~18%
  correlation against real historical data, mean absolute error ~2) — user's explicit call
  after being shown the numbers, on the condition that it's always visually marked as a
  guess. Rags and vacuum have no estimate logic at all (no historical data ever existed for
  them) — always "Not set" until an admin enters a real number.
  Before writing any formula, checked what data already existed rather than guessing cold:
  the legacy TheCustomerFactor import left a real historical mop-head count buried in
  free-text `notes`/`operationalNotes` for 102 of 239 active customers (formats like "Mop
  heads: 5", "10 mops", "Mopheads - 7" — regex patterns and a 0–50 garbage guard documented
  in `work/backfill-mop-head-counts.ts`'s header). A one-time idempotent import script
  (dry-run by default, `--apply` required for writes, only ever sets `mop_head_count` where
  currently null, never touches `rag_count`/`vacuum_count`/the source note fields) backfilled
  those 102 real counts into the new column — **run for real against the hosted DB** after
  explicit user approval, confirmed via a direct read-only spot check (Mary Anderson=5,
  Billie Austin=11, Gary and Linda Collins=7 all correct; 102 non-null total; rag/vacuum
  confirmed still 0 non-null everywhere).
  UI: customer profile has an editable "Cleaning equipment" card (three number inputs,
  blank persists as `null`); My Day's home-screen stop list shows the same three as a
  compact icon row, visible pre-clock-in, same place the job type badge/entry codes already
  render. Reuses existing `lucide-react` icons only (no new dependency) — `WashingMachine`
  for mop, `Shirt` for rags, `Wind` for vacuum; these are approximations (no literal
  mop/vacuum icon exists in the set) worth a glance next time someone's looking at the
  screen, purely cosmetic.
  Verified independently before merging, not just Codex's report: read every changed file's
  diff line-by-line against the original spec (schema, migration SQL, API zod schema, both
  UI files, the My Day server query for N+1 safety, the import script's regex/guard/dry-run
  logic), confirmed `git diff --stat` touched only the intended files. `check:drift` clean
  after the migration was applied, `npm run verify` clean (0 errors, same 26 pre-existing
  warnings) re-run independently on the integrated `main` after merging, not just on the
  feature branch.
  **Not click-through-tested in a real browser** — same `.env.local`
  `BROWSER_ADMIN_PASSWORD` gap as other recent features, build/type/lint/`check:drift`-
  verified only. Worth an actual pass next time someone's logged in: open a customer profile,
  set/clear each of the three fields and confirm it saves and reloads correctly; open My Day
  and confirm the icon row renders on a real stop, and that a customer with a real imported
  mop-head count shows it in the bolder/confirmed style rather than the muted estimate style.

- **Admins can now securely save Square and Google Maps API keys under Settings → Square &
  Google Maps (2026-08-06, merged to `main` at `a53e745`).** Built by Codex on
  `codex/encrypted-api-keys` (`c80d82b`), delegated with a structured contract per this
  repo's Claude-plans/Codex-implements workflow. New encrypted columns on `companies`
  (`squareAccessTokenEncrypted`, `squareEnvironment`, `squareWebhookSignatureKeyEncrypted`,
  `googleMapsApiKeyEncrypted`) plus two geocode-cache columns on `customers`
  (`geocodedLatitude`/`geocodedLongitude`) — migration `drizzle/0024_warm_landau.sql`
  (renumbered from an auto-generated `0023_warm_landau.sql`, which collided with the
  already-live `0023_enable_rls.sql`; same journal-fixup pattern as the earlier 0015/0016
  collision, `prevId` chain confirmed intact). **Applied to the hosted DB and confirmed via
  `check:drift` before any code was merged.**
  Independently reviewed line-by-line before integration, not just Codex's summary:
  `src/lib/settings/encryption.ts` uses AES-256-GCM with a random IV per value and an auth
  tag, keyed off `SETTINGS_ENCRYPTION_KEY` (fails closed — throws if unset/wrong length
  rather than storing plaintext); `GET /api/settings` and the settings audit-log entries
  only ever expose a `configured: true/false` boolean, never the raw or encrypted value;
  `PATCH /api/settings` encrypts on the way in and the row returned to the client never
  includes the encrypted columns. The one intentional exception is `GET
  /api/integrations/maps-key`, which does return the real decrypted Maps key to an
  authenticated admin's browser — necessary because Google Maps JS keys must run
  client-side; the UI itself warns to lock it down with HTTP-referrer restrictions in
  Google Cloud. Settings → Square & Google Maps uses password-style inputs, clears them
  after save, and only ever shows "Configured"/"Not configured".
  Also fixes the previously-flagged geocoding cost gap (see the old Blocked entry, now
  resolved below): `calendar/route-preview.tsx` and the two dashboard technician-route
  files now call the new `POST /api/maps/geocode-cache` to persist a customer's lat/lng
  after the first lookup (scoped to the admin's own company, only writes when not already
  cached) instead of re-geocoding on every render.
  Verified independently (not just Codex's report) at every stage: `check:drift` clean
  after the migration, `npm run verify` clean (0 errors, same 26 pre-existing warnings),
  both `smoke:routes` (5/5) and `smoke:auth` (22/22) against a local production build —
  run once on the feature branch, then re-run in full on the integrated `main` after
  merging. Added a `v0.1.4` Help Center changelog entry.
  **Confirmed nothing changes in production today**: no real Square or Maps keys are
  configured yet, so Square stays in its existing test/mock mode and Maps behavior is
  unchanged — this only adds somewhere safe to put real keys once obtained.
  **One small known side effect**: the address-autocomplete widget on `/customers/new`
  will only work for users logged in as an admin once a real Maps key is added (the new
  `maps-key` route is admin-gated) — low-risk since that screen is already mainly used by
  admins, but worth knowing before it comes up as a surprise.
  **Not click-through-tested in a real browser** — build/type/lint/smoke-verified only,
  same `.env.local` `BROWSER_ADMIN_PASSWORD` gap as other recent features. Worth an actual
  pass next time someone's logged in: open Settings → Square & Google Maps, save a
  throwaway value, confirm it shows "Configured" and the field stays blank on reload.

- **CleanOps renamed to ServiceSpark (user-facing branding only) + real Privacy Policy
  published (2026-08-04).** User's call: rename the product, but scope deliberately limited
  to what a logged-in admin/employee sees — nav, page titles, Help Center, footer, user-facing
  error messages (28 spots across 17 files, delegated to Codex, each one individually
  specified and diffed rather than a blind find-replace). Explicitly **not** renamed, by the
  user's own choice: the GitHub repo (`kaianbenitez/cleanops`), local worktree folders
  (`cleanops-v1`/`cleanops-claude`/`cleanops-codex`), the Supabase project name, or any
  project docs (`AGENTS.md`/`HANDOFF.md`/`CLAUDE.md`/`DECISIONS.md`/`TESTING.md`,
  `package.json`) — those still say CleanOps on purpose, see
  [[project_servicespark_rename]] memory. Also left alone: code comments (grepped and
  confirmed after the fact — every remaining "CleanOps" hit in `src/` is a comment or the
  seed script's console output), the `@cleanops.local` synthetic auth email domain (backend
  identifier, not user-visible, renaming it is a separate decision), and the "CO" two-letter
  logo monogram (a visual-identity call, not a text swap — still says "CO", not "SS").
  Same session, replaced `/privacy-policy`'s long-standing placeholder (flagged in this doc's
  own history as a real pre-launch gap) with an actual policy — sourced from Simply Maid
  LLC's real website privacy policy for entity/legal boilerplate, but substantively rewritten
  since that policy is for the public ecommerce website (purchases, sweepstakes, GA cookies)
  and this page is for the internal, auth-gated ops tool with entirely different data (customer
  gate/alarm codes, job photos, employee payroll). Names actual subprocessors: Supabase,
  Vercel, Square, Google, Sentry, GoHighLevel. Deliberately did **not** invent a specific
  numeric retention period or a mailing address — used defensible general retention language
  instead, since HANDOFF previously flagged both as open gaps and fabricating either would be
  worse than the honest general version. **Not a lawyer-reviewed document** — worth flagging
  before treating this as final.
  Added a `v0.1.2` Help Center changelog entry announcing both. **Caught and fixed a real bug
  before it shipped**: Codex's first draft of that changelog entry had `&apos;` baked into a
  plain JS string in the `changes` array — that array is rendered via `{change}` interpolation
  (a JS string child), not JSX text, so React would have displayed the literal characters
  `&apos;` on the page instead of an apostrophe. This is the exact bug class already fixed
  once in this codebase (see the entity-decoding entry further down this doc, from the
  TheCustomerFactor CSV import) — caught on review, sent back to Codex, fixed
  (`2fbeaa9`/`3970494`), independently re-scanned the whole `RELEASES` array afterward for
  any other stray entities (none found).
  Every commit here independently re-verified before integration: diffs read line-by-line
  against the exact spec given to Codex (not just Codex's own summary), a fresh `grep -rn
  "CleanOps" src/` run myself post-change, and `npm run verify` re-run in both the Codex
  worktree and again on integrated `main`. All clean. On `main`:
  `6b3c4c8`/`19f280a`/`9170842`/`3970494`.
  **Not click-through-tested in a real browser** — build/type/grep-verified only. Worth a
  visual pass next time someone's logged in: confirm the new privacy policy page reads well
  and the ServiceSpark branding shows correctly on the login screen and nav.

- **Hosted DB was openly readable by anyone with the public anon key — found and fixed
  2026-08-04.** A prior side-finding (2026-07-28, see the old Blocked entry this replaces)
  had logged "RLS disabled on every public table" as a WARN-level advisory note, reasoned to
  probably be theoretical since this app enforces authorization at the Next.js/Drizzle layer,
  not via Postgres RLS. That reasoning was wrong, confirmed by directly testing it rather than
  just reading the code: Supabase auto-exposes every `public` table via a REST API (PostgREST)
  at `<project>.supabase.co/rest/v1/<table>`, reachable with `NEXT_PUBLIC_SUPABASE_ANON_KEY` —
  a key that ships inside the app's own browser bundle by design. A direct, unauthenticated
  request against that endpoint (count-only, `Prefer: count=exact`, no row data pulled) returned
  real totals with zero login: 239 `customers`, 21 `users`, 704 `jobs`, 46 `payroll_lines`. Also
  confirmed the app's own code never uses the anon key for data (grep across `src/`: it's only
  used for Supabase Auth sign-in/session, never a `.from("<table>")` data query) — the exposure
  was 100% via the public REST endpoint itself, not anything CleanOps' own pages do.
  User approved enabling RLS with a **default-deny** policy (no `CREATE POLICY` statements at
  all) rather than writing per-table policies, since nothing legitimate needs the anon key for
  data. Before applying, confirmed via `pg_roles` that this is safe: the app's own DB
  connection (`DATABASE_URL`, user `postgres.dxkirahuqbgvlfyldzqc`) maps to the Postgres
  `postgres` role, which has `rolbypassrls = true` — RLS never applies to it, so Drizzle
  queries are completely unaffected. `anon`/`authenticated` (the PostgREST-facing roles) do
  **not** have that flag, so enabling RLS with zero grants fully blocks them.
  Delegated to Codex (`drizzle/0023_enable_rls.sql`, `ALTER TABLE ... ENABLE ROW LEVEL
  SECURITY` on all 27 flagged tables, no policies) — applied by hand to the hosted DB per the
  usual Supabase-safety workflow, then integrated onto `main` (`08f35d5`). Independently
  re-verified after the fact, not just taking Codex's report at face value: queried
  `pg_class.relrowsecurity` directly — `true` on all 27; re-ran `mcp__supabase__get_advisors` —
  the 27 `rls_disabled_in_public` ERRORs are gone, replaced by 27 informational
  `rls_enabled_no_policy` notices (expected — that's what default-deny looks like, not a
  problem); re-ran the same anon-key REST probe myself against `customers`, `users`, `jobs`,
  `payroll_lines`, `companies`, `audit_log` — every one now returns `Content-Range: */0`
  (zero rows visible) instead of a real count. `npm run check:drift`, `npm run verify`,
  `smoke:routes` (5/5), and `smoke:auth` (22/22) all stayed green against a local production
  build, plus an authenticated Playwright click-through (Dashboard, Customers, Jobs) — all via
  Codex's own run, reviewed but not independently re-executed by hand.
  `auth_leaked_password_protection` (WARN) is a separate, smaller Supabase Auth dashboard
  toggle, not touched — still open, see Blocked below.
  **Worth remembering:** any *new* table added to `schema.ts` going forward needs its own
  `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` — Supabase does not inherit this from existing
  tables, and `check:drift` does not check RLS status, so a new unprotected table would ship
  silently. Grep `mcp__supabase__get_advisors` (security type) for `rls_disabled_in_public`
  periodically, especially after adding a table.

- **Full 9-item customer/quote backlog now on `main` (2026-08-04) — items #7, #8, #9
  integrated together.** Each was built independently on its own branch, off `main`,
  by Codex (delegated from Claude Code, own isolated worktree per item), reviewed
  (full diff read, `npm run verify` re-run independently) and hosted-DB-verified before
  integration; items #1–#6 of this same backlog already landed on `main` in earlier
  sessions.
  - **#7 — plain-English errors on `/customers/new`** (`82ebd11` on `claude/work`).
    Failed validation used to show the raw zod error object as text; now it's a
    readable sentence plus the specific bad field outlined in red with its own message.
  - **#8 — inline "New customer" option on the New Quote screen**
    (`e7ce607`/`fdc44cc` on `codex/quote-new-customer`). The "Who is this for?" card on
    `/quotes/new` now has an Existing/New customer toggle; picking New customer swaps
    the search box for an inline create-customer form, and saving the quote creates the
    customer and quote together. Cherry-picked onto `main` cleanly — `quotes/new/page.tsx`
    wasn't touched by #7 or #9.
  - **#9 — room counts/notes/access codes at customer creation**
    (`38c70f4`/`bacc960` on `codex/customer-creation-preferences`). `/customers/new` gained
    an optional second panel: room-count grid, the same four house-notes fields the
    customer profile has, and address-gated entry/garage/gate codes — all prefilled the
    first time anyone opens that customer's profile or builds them a quote. Cherry-picked
    cleanly (`POST /api/customers`'s new optional fields).
  - **Merge conflict, resolved by hand**: #7 and #9 both modified
    `customers/new/page.tsx`'s error-display code — #9 was built off `main` before #7
    landed, so it independently reimplemented a similar-but-different version. #9's
    cherry-pick was taken as the base (it's the superset — includes the full #7-equivalent
    error parsing plus the new room/notes/access panel); #7's two improvements that #9's
    version had NOT picked up were folded in by hand on top: (1) per-field
    `fieldErrors` set immediately on a missing first/last name, before any network
    round-trip, not just a generic banner message; (2) red border + `aria-invalid` on
    the flagged input itself, not just red text underneath. No functionality from
    either branch was dropped.
  Verified on the integrated result (all three combined) before pushing: `npm run
  check:env`, `check:drift` (clean — only the known pre-existing `quote_line_items`
  live-but-unused-table note, unrelated to this change), `verify` (0 errors, same 26
  pre-existing warnings), a full production build, and both `smoke:routes` (5/5) and
  `smoke:auth` (22/22) against a local production server on a free port. Each item was
  also independently verified against the hosted DB before integration (see each
  branch's own now-superseded HANDOFF entries for that detail); all throwaway test
  records created during those checks were found, confirmed as test data by fingerprint,
  and deleted with user approval before this integration.
  **Not click-through-tested live by a human in a browser** — `.env.local` is still
  missing `BROWSER_ADMIN_PASSWORD`. Worth an actual pass next time someone's logged in:
  open `/customers/new`, fill in the optional home-profile panel, save, and confirm the
  profile page shows it; open `/quotes/new`, toggle to "New customer," and confirm the
  create-then-quote flow lands on the new quote.
  Advanced search/filtering on the Customers list (a related but separate item from an
  earlier session, also still on `claude/work`) was deliberately **not** included in
  this integration — user asked specifically for #7/#8/#9.

- **Unassigned-queue quick-cancel now asks for a cancellation reason (2026-08-04,
  cherry-picked from `claude/work`'s `553df69`, cleanly — `unassigned-panel.tsx` was
  byte-identical between the two branches beforehand).** Part of the same 9-item backlog as
  the two Customers-list entries below. The server has required a reason for cancelling a
  job for a while (rejects with "Enter a cancellation reason before cancelling this job."
  otherwise), and every other cancel entry point in the app (calendar job panel, the
  day-list Cancel button, full Job Detail) already prompted for one — this was the one spot
  that didn't: the "Confirm cancel" button in the quick-assign panel opened from the Staff
  Board's unassigned queue sent a bare cancel with no reason, so it always failed silently
  against the server's own validation. Now it prompts first, same as the other three places.
  Single-file, 4-line change (`src/app/(app)/calendar/unassigned-panel.tsx`).
  Build/type-verified only (`tsc --noEmit` clean on both `claude/work` and again after this
  cherry-pick onto `main`) — not click-through-tested in a real browser, same constraint as
  the two entries below (`.env.local` has no `BROWSER_ADMIN_PASSWORD`). Worth confirming
  next time someone's logged in: open the Staff Board, quick-assign an unassigned job, hit
  Cancel, and confirm the reason prompt now appears before it submits.

- **Customers list: advanced search/filtering added (2026-08-04, cherry-picked from
  `claude/work`'s `2ae9a2b`, cleanly — `page.tsx` was byte-identical between the two
  branches beforehand since it descends from the same `dd12208`/`5f39143` sort commit).**
  Direct follow-up to the sort feature right below, same backlog. User pointed at
  screenshots of TheCustomerFactor's old "Customers Search" screen and asked to adapt
  whatever translates usefully to CleanOps' own data — most of that legacy screen (county,
  subdivision, star rating, email bounces, call-back scheduling) doesn't map to anything
  CleanOps tracks, so only these pieces were built:
  - Free-text search now also matches phone number (previously name/email/company/address
    only — a real gap, not just an addition).
  - New "Service history" dropdown: Never serviced / Not serviced in 30, 60, or 90+ days /
    Has an upcoming job / No upcoming job — for spotting who needs a re-engagement call.
  - New "Cancelled job" and "Repeat customer" (2+ completed jobs) toggle pills, matching the
    existing Recurring/Needs attention/Leads pill pattern.
  - New "Highest revenue" sort option (sums each customer's non-void invoices).
  All four are SQL conditions/order-by added directly to the existing filtered query in
  `src/app/(app)/customers/page.tsx`, using the same correlated-EXISTS-subquery style the
  file's own `archiveEligible` block already used — no schema change.
  Verified on `claude/work` before integration: `tsc --noEmit`, `npm run verify` (clean, 0
  errors), both smoke scripts (5/5, 22/22) against a local production build, and a
  throwaway script that hit that server with all 12 filter/sort combinations (individually
  and combined) while authenticated against the real hosted DB — all 200, no errors. A
  second throwaway script independently cross-checked counts against live data: 217 of 238
  active customers have never had a completed job, 8 have a cancelled job, 0 are repeat
  customers yet — plausible for where the business is right now. Re-ran `tsc --noEmit`
  clean on `main` after this cherry-pick (full `verify`/smoke re-run skipped on integration
  per explicit user instruction, since the file content is identical to what was already
  verified on `claude/work`).
  **"Highest revenue" sort is logically correct but currently a no-op in production**:
  confirmed directly that `invoices` has zero non-void rows company-wide, so every customer
  ties at $0 — this is the already-known Square-invoicing-in-mock-mode gap (see Blocked
  below), not a bug in this change. **Not click-through-tested in a real browser** —
  `.env.local` has no `BROWSER_ADMIN_PASSWORD` set, so neither Playwright nor a Chrome
  session could log in. Worth an actual pass next time someone's logged in: try each
  Service history option and the two new pills on `/customers`.

- **Customers list: sort options added (2026-08-03, `dd12208` on `main`, cherry-picked
  from `claude/work`'s `5f39143`).** User request via the shared task backlog: "Add sort
  options to customers list." A fresh agent working in the `cleanops-claude` worktree
  found no existing sort-dropdown pattern anywhere in the app (every list page — jobs,
  invoices, quotes, employees — has a hardcoded `orderBy`), so this establishes the
  pattern rather than copying one. Landed on four options: Name (A–Z, unchanged default),
  Name (Z–A), Newest added, Oldest added — deliberately skipped sorting by next/last
  service date since those are computed in JS after the paginated SQL query runs, not
  SQL-orderable columns. New `sort` search param on `src/app/(app)/customers/page.tsx`,
  gated off in the `?eligible=archive` view (no filter form there, original hardcoded
  order kept). Fully verified on `claude/work` before merging: `npm run verify` clean (0
  errors, same 26 pre-existing warnings), `smoke:routes`/`smoke:auth` clean, and a real
  Playwright click-through signed in via the `signInAsAdmin` magic-link bypass — confirmed
  the customer order actually changes for each of the four options (not just that the
  control renders), and screenshotted the filter bar to confirm the new select doesn't
  break the existing wrapped layout.
  **Bringing it from `claude/work` to `main` itself was explicitly done without re-running
  `verify` or a live check on `main` — user asked to skip that step for this one push.**
  The code was fully proven on `claude/work` moments earlier and the cherry-pick applied
  clean with no conflicts, but nobody has loaded `/customers` on `main`'s own build since.
  Worth a quick look next time someone's on the live site.
- **Small-screen nav fixed on `main` (2026-08-03, `a30dbd9`, cherry-picked from
  `claude/work`'s `be091c2`).** User reported three related bugs: page content not
  centered on small screens, the phone drawer listing different nav items than the
  desktop sidebar, and the search bar disappearing entirely below desktop width. Root
  cause was one breakpoint mismatch: `layout.tsx` reserved 260px of left padding for the
  sidebar starting at the `lg` breakpoint (1024px), but `app-nav.tsx`'s actual sidebar and
  mobile-menu toggle didn't switch until `xl` (1280px) — so anything in that 1024–1280px
  range got a blank left gutter with no sidebar to justify it, and the header row holding
  search/notifications/"Create new" was hidden entirely below `xl` with no phone
  equivalent. The fix already existed (done earlier the same day on `claude/work`, only
  build/type-verified, never clicked through) — brought over as-is rather than
  re-implemented, then live-verified before pushing: signed in via the same magic-link
  bypass and screenshotted `/dashboard` at 390px (phone), 1100px (the broken range), and
  1440px (desktop). Confirmed phone now gets a working search bar plus a menu that lists
  Sync issues/Settings/Support the same way the desktop sidebar does, the 1024–1280px gap
  no longer reserves dead space, and desktop is unchanged. `npm run verify` and
  `check:drift` both ran clean first (no schema touched).
- **Vercel Preview deployments were never actually working for any feature branch —
  fixed 2026-07-30.** Found while investigating why `claude/work`'s Vercel build failed
  with `Error: DATABASE_URL is not set` at `/api/account/password`. Checked
  `vercel env ls`: `DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` were all scoped
  **Production only** (only `SENTRY_DSN` and `NEXT_PUBLIC_TURNSTILE_SITE_KEY` had
  Preview too). Since `src/db/index.ts` throws synchronously at module load if
  `DATABASE_URL` is unset, and nearly every API route imports it, this meant **every**
  non-`main` branch push has always failed to build on Vercel, regardless of what the
  branch actually changed — confirmed via deployment history: `codex/my-day-discard-undo`
  and `codex/calendar-drag-scroll` both failed with the identical error. This was
  initially misread as "Codex's branches preview fine, only mine doesn't" — checked and
  that's not true either; Codex's deployment history is almost entirely direct commits to
  `main` (which deploys as Production and has real credentials), not feature branches, so
  it wasn't actually exercising Preview any more than this session was. Fixed by adding
  the four missing vars to the Preview scope via `vercel env add <name> preview` (values
  piped from `.env.local`, never printed). Verified with `npx vercel deploy
  --target=preview` from a clean checkout — came back `readyState: READY`. Going forward,
  a red Preview build on any branch is a real signal again. Trade-off worth knowing:
  Preview deployments for any pushed branch now run against the **live production
  database**, same as local dev already does — not new exposure (the login wall still
  applies) but more surface area than "only `main` can reach prod." User approved this
  explicitly after that trade-off was laid out.

- **Admin bell notifications now fire on My Day job updates (2026-07-30, commits
  `9f66ccd`/`5409f58` on `main`, cherry-picked cleanly from `claude/work`'s `1587f87`/
  `51c35fb` with no conflicts).** User request:
  "a way for admins to track" job updates — on the way, completed, note added, payment
  method added, before/after photos added. Extends the existing `appNotifications` bell
  (previously only fired on "quote accepted") to five new trigger points, all inside
  existing My Day endpoints — no new UI, no schema change:
  - **On the way** — `POST /api/jobs/[jobId]/clock-in` (My Day's "On my way" button already
    calls this).
  - **Completed** — `POST /api/jobs/[jobId]/clock-out`, only when the job's status actually
    transitions to `completed` (all assigned employees clocked out).
  - **Note added** / **Payment method added** — same clock-out call, gated on the
    cleaner-reported `cleanerNotes` / `paymentMethodCollected` fields from the payment-method
    + damage-notes feature two entries below. Deliberately does **not** fire on the separate
    admin-side `completionNotes` edit on Job Detail (`PATCH /api/jobs/[jobId]`) — that's an
    admin's own edit, not a field update worth notifying admins about.
  - **Before/after photos** — `POST /api/jobs/[jobId]/photos`, only for `slot: "before"` /
    `"after"` (not the generic "extra" evidence photos).
  New shared helper `src/lib/notifications/create.ts` (`notifyAdmins`) wraps the insert so
  the five call sites share one shape instead of repeating the pattern the quote-accept route
  already used inline. Verified with `verify` (clean), `check:drift` (clean, no schema
  touched), `smoke:routes` (5/5) and `smoke:auth` (22/22) against a local production build,
  and a throwaway script (`postgres` client + `DATABASE_URL`, deleted after) that ran the
  exact job+customer join query added to each route against a real job and round-tripped a
  test insert/read/delete on `app_notifications` — confirmed the join resolves correctly and
  the insert satisfies the table's constraints. **Not click-through-tested in a real
  browser** — no admin/field session available this session, so the bell rendering these new
  entries and the My Day buttons that trigger them were not visually confirmed. Worth an
  actual pass next time someone's logged in: clock in/out of a real job, add close-out notes
  and a payment method, upload a before/after photo, and confirm all four show up in the
  bell with working links to Job Detail. Integrated onto `main` the same session via a
  clean cherry-pick (no conflicts) after re-running `check:env`, `check:drift`, `verify`,
  and both smoke scripts against the integration worktree.

- **My Day payment method: added a check-number field, shown when "Check" is selected
  (2026-07-30).** Direct follow-up to the payment-method/damage-notes feature below, same
  session: user asked that selecting "Check" also ask for the check number, and that it show
  up on admin Job Detail so the office can reconcile which check a job's payment refers to.
  New nullable `jobs.check_number_collected` column, migration
  `drizzle/0022_job_check_number_collected.sql`, **applied to the hosted DB and confirmed via
  `check:drift`** (approved by the user first). My Day's "Close out" card now conditionally
  renders a check-number text input right under the payment-method select when
  `paymentMethod === "check"`; `completeJob()` only sends it in that case. The clock-out route
  only persists `checkNumberCollected` when `paymentMethodCollected === "check"` in the same
  request, so a stray typed value can't survive a method switch. Admin Job Detail's "Reported
  from the field" card had to become a controlled `<select>` (was `defaultValue`) so the new
  check-number input can show/hide reactively off local state, same conditional pattern as My
  Day; it saves through the existing `save()` → `PATCH /api/jobs/[jobId]` path like the other
  two field-reported values.
  Verified: `npm run verify` clean (0 errors, 26 pre-existing warnings), `check:drift` clean
  after applying the migration, `smoke:routes` (5/5) and `smoke:auth` (22/22) against a local
  production build. **Not click-through-tested live** — same constraint as the parent feature
  below (no in-progress job available to open without a real clock-in/payroll side effect on
  production data); build- and type-verified only.

- **My Day: cleaners can now mark the payment method collected on-site and log
  damages/notes at job close-out (2026-07-30).** User request: "have ability to mark which
  payment method the client is using for the specific job + any damages / notes from the
  cleaner." This is intentionally separate from the real invoice/Square payment flow
  (`invoices/[invoiceId]`, `invoiceMethodEnum`) — most customers are on card-on-file
  recurring billing, so this is a lightweight field-report, not a financial transaction.
  Added `jobs.payment_method_collected` (`jobPaymentMethodEnum`: cash / check / credit_card /
  not_collected / other) and `jobs.cleaner_notes` (free text), both nullable — migration
  `drizzle/0021_job_payment_and_cleaner_notes.sql`, **applied to the hosted DB and confirmed
  via `check:drift`** (approved by the user before applying, since every job-related page
  reads from `jobs` and would otherwise 500 the moment this shipped). `POST
  /api/jobs/[jobId]/clock-out` now accepts an optional `{ paymentMethodCollected, cleanerNotes }`
  body (zod-validated) and writes it onto the job row inside the existing clock-out
  transaction; both are folded into that endpoint's audit log entry too. My Day's job screen
  (`job-execution-client.tsx`) has a new "Close out" card (payment method select + damages
  textarea) shown once clocked in, sent along with the "Complete job" request. Admin Job
  Detail (`job-detail-client.tsx`) shows a "Reported from the field" card with the same two
  controls, editable via the existing `save()` → `PATCH /api/jobs/[jobId]` path, so the office
  can see or correct what the cleaner reported — `loadJobDetail` and `updateJobSchema` both
  updated to carry the two fields end to end.
  Verified: `npm run verify` clean (0 errors, 26 pre-existing warnings, untouched by this
  change), `check:drift` clean after applying the migration, `smoke:routes` (5/5) and
  `smoke:auth` (22/22) against a local production build. Live-checked the admin Job Detail
  card via the Chrome extension against the hosted DB — the "Reported from the field" select
  and textarea render with the correct five payment-method options and the right placeholder
  text on a real job — **read-only**, never selected an option (would have written to that
  real job). **The My Day close-out form itself was not live-clicked-through**: the admin
  test account had no job assigned/in-progress today to open without creating a real
  clock-in/time-entry/payroll-recalc side effect on production data, and TESTING.md rules out
  submitting writes to the hosted DB in a throwaway check. Build- and type-verified only for
  that half; worth an actual clock-in on a real (or newly created) job next time someone's
  using My Day, to confirm the "Close out" card renders correctly at the started-not-completed
  state and that "Complete job" round-trips the two fields.

- **`main` was broken — commit `ffe77f5` ("Keep staff calendar visible during queue scroll",
  Codex) shipped a literal backtick-r-backtick-n sequence mangled into one import line in
  `job-execution-client.tsx` (invalid syntax: `...from "@/lib/my-day/job-format";`r`nimport
  {...}`). Confirmed via Vercel's deployment list that this exact commit's production build
  had already failed (`state: "ERROR"`) — the site kept serving the prior good deploy
  (`02957e5`), so nothing was down, but `main` could not build and nothing on top of it could
  deploy until this was fixed. Fixed 2026-07-30 as a side effect of editing that same import
  line for the notes work below; confirmed via `git stash` that `tsc --noEmit` fails against
  `ffe77f5` and passes clean once the line is split back into two real imports. If a Vercel
  production deployment shows `ERROR` again, check the deployment list (`mcp__vercel__list_deployments`)
  for the failing commit before assuming it's something else — this is the second time a
  parallel-session artifact (`` `r`n `` as literal text, not an actual newline) has silently
  landed in this exact file; grep for stray literal backtick sequences if it happens again.
- **My Day / customer profile notes were showing garbled text (`&rsquo;`, `&amp;`, `&#39;`,
  `&ldquo;`, etc.) — root cause: the TheCustomerFactor CSV backfill imported customer notes
  straight from an HTML source without decoding entities, confirmed by querying
  `customers.general_notes`/`do_not_clean`/`pet_notes`/`important_to_customer` directly on the
  hosted DB (e.g. one row literally reads `Don&rsquo;t adjust the bed`).** Added
  `cleanNoteText()` (`src/lib/format.ts`) — decodes named + numeric HTML entities and
  normalizes CRLF/tab clutter into real line breaks — applied everywhere these fields render:
  My Day job detail (`job-execution-client.tsx`), the customer profile view (`view-cards.tsx`)
  and its edit form (`page.tsx`). Also deduped My Day's notes grid: `generalNotes` and the
  key/garage/gate/alarm codes were each being shown twice (once in their own dedicated spot,
  again as plain boxes in the generic notes list via `groupNotes()` in
  `src/lib/my-day/job-format.ts`) — removed the duplicates.
  Extended the Do Not Clean (rose) / Pets (amber) / Important to customer (violet) icon-card
  treatment that already existed in My Day to the customer profile's "Service notes &
  preferences" card, and added those three as real editable `Field`s in the customer edit form
  plus the matching zod fields in `PATCH /api/customers/[customerId]` — previously these three
  columns existed in the schema and were populated only by the CSV import / GHL webhook, with
  no way for an admin to set them by hand for a new customer.
  Garage/gate/alarm/key codes are now masked behind a tap-to-reveal control (new
  `src/components/ui/masked-code.tsx`) in both My Day's Access row and the customer profile's
  entrance/access card, instead of sitting in plain text — user's explicit call after asking
  which of three options (always plain, tap-to-reveal, or split by screen) they wanted.
  Verified with `npm run verify` (typecheck/lint/build all clean; the 26 lint warnings are
  pre-existing and untouched by this change). **Not click-through-tested in a real browser**
  — no admin/employee session available this session; the fix is TypeScript- and
  build-verified only. Worth an actual pass next time someone's logged in: open a My Day job
  with real customer notes and confirm the entities are gone and the reveal button works.
  **Known, deliberately out of scope:** many legacy `general_notes` blobs already contain the
  same text that also lives in the discrete `do_not_clean`/`pet_notes`/`important_to_customer`
  columns (the original import copied fragments into both) — this shows up as the same
  sentence appearing once in the free-text "General notes" card and again in its own colored
  card. Surgically stripping the duplicated fragment out of hundreds of freeform legacy blobs
  without risking mangling the rest of the note is its own project, not attempted here; new
  customers won't have this problem since they'll only ever get entered through the new
  manual fields, not a bulk import.

- **Every new account gets a random one-time password instead of the old hardcoded
  `password123`, and must set their own before using the app (originally 2026-07-27,
  reconciled onto `main` 2026-07-29).** Account creation and admin password resets
  (`src/app/api/employees/route.ts`, `.../employees/[employeeId]/route.ts`) now issue
  `generateTemporaryPassword()` (`src/lib/auth/username.ts`) and set the new
  `users.mustChangePassword`, enforced in `requireUser`/`requireAdmin`
  (`src/lib/auth/current-user.ts`) and gated in `(app)/layout.tsx` via the new
  `must-change-password.tsx` screen until cleared through `POST /api/account/password`. New
  rows default `mustChangePassword` to `true`; the column defaults `false` so existing users
  weren't retroactively locked out. Same fix applied to `work/create-admin.ts`.
  **This work and its migration were done in a session whose local `main` was 50 commits
  behind `origin/main` and never pushed** — reconciled onto the real history 2026-07-29 by
  resetting to `origin/main` and replaying this feature's uncommitted changes on top (3
  conflicts: `AGENTS.md`, `(app)/layout.tsx`, `api/employees/route.ts` — resolved by keeping
  both sides' intent, e.g. `layout.tsx` now gates on `mustChangePassword` *and* still passes
  `isFieldStaff` to `AppNav`). The migration itself (`drizzle/0019_must_change_password_column.sql`)
  had to be regenerated from scratch since the original was only ever in the discarded local
  commit — see the Blocked item below, it still needs to be applied/confirmed against the
  hosted DB.

- **Admins can now also be field staff — assignable to jobs, clocked in/out, and
  included in payroll (2026-07-29).** User report: "employee is admin + cleaner as
  well, she should be assigned jobs and included in the payroll." Root cause:
  `users.role` is a strict `admin`/`employee` enum, and every job-assignment picker,
  the payroll generator, employee-browser clock-in/out, technician routes, the
  preferred-cleaner picker, and global search all filtered on
  `eq(users.role, "employee")` directly — an admin was structurally invisible to all
  of it, with no way to be both. Checked the hosted DB and found the actual case:
  **Brittney Riggs** (`role: admin`, title "Shine Coordinator - Sales", hired 2018)
  already had `payType: commission_jth` and a full 4-tier commission schedule
  configured — someone had already set her up to be paid like a cleaner — but she
  had **zero job assignments ever**, invisible to both the assignment picker and
  payroll generation.
  Fixed with a new `users.is_field_staff` boolean (admin-only meaning; default
  `false`; migration `drizzle/0018_wealthy_hammerhead.sql`, additive/idempotent,
  applied to the hosted DB same session) decoupled from `role`, plus a single
  shared predicate `isFieldEligible` in `src/lib/auth/field-staff.ts`
  (`role = 'employee' OR (role = 'admin' AND is_field_staff)`) swapped into every
  site that previously checked `eq(users.role, "employee")` directly: job
  assignment pickers (`job-detail.ts`, calendar, jobs list, `/api/employees`),
  payroll generation (`payroll/calculate.ts`), employee-browser (list + clock-in +
  clock-out + mileage), dashboard technician routes and crew coverage, reports,
  global search, and the customer preferred-cleaner picker. `role` itself is
  untouched and still the only thing `requireAdmin`/`requireUser` and every
  `role !== "admin"` page redirect check — admin access is unaffected either way.
  UI: Settings → Administrators now has an inline "Also a field cleaner" checkbox
  per admin row (PATCHes `/api/employees/[id]`, which already had no role
  restriction — it's the same profile endpoint the Employees directory uses) with
  a link to that admin's `/employees/[id]` profile page for pay type/rate setup
  once toggled on; the "New admin" creation form got the same checkbox, revealing
  the same title/pay-type/rate fields the employee flow already has. Since admins
  have no "My Day" nav link by default (they land on `/dashboard`, not `/my-day` —
  confirmed with the user this is the desired self-clock-in path for a field-staff
  admin), `app-nav.tsx` now appends a "My day" link to the admin nav when
  `isFieldStaff` is true, alongside their full admin link set; `/my-day` itself
  already queries by `user.id` with no role gate, so no change was needed there.
  Applied `is_field_staff = true` to Brittney's row on the hosted DB.
  Verified: `check:drift` clean after the migration, `verify` clean (0 errors, only
  pre-existing warnings in files this change didn't touch), `smoke:routes` (5/5)
  and `smoke:auth` (22/22) against a local production build, and a throwaway
  authenticated API check confirming `GET /api/employees` now includes Brittney
  (assignment-picker shape) and `GET /api/admins` shows `isFieldStaff: true` with
  her existing `payType`/`hourlyRateCents` — both against the hosted DB, script
  deleted after. **Not click-through-tested in a real browser** — no admin login
  credentials available in this session; the API-level check plus a clean
  typecheck/lint/build was the verification path instead. Worth an actual
  browser pass (toggle the checkbox, confirm she shows up in the New Job crew
  picker and on the Staff calendar board, generate a payroll period and confirm a
  commission line appears for her) next time someone's logged in as an admin.
  **Not done / deliberately out of scope:** she does not appear in the `/employees`
  directory list's *filters* differently from a real employee (she does now show
  up in that list itself, since it uses `isFieldEligible` too) — no other UI
  distinction was added between her and a `role: employee` row on that page. The
  `DELETE /api/employees/[id]` endpoint still explicitly blocks non-employee roles
  ("Only employees can be deleted here.") — left as-is on purpose, so this feature
  doesn't accidentally make an admin account deletable from that screen.

- **Calendar: new "List" view for a single day's jobs — customer info, assigned crew,
  status, per-employee clock status, inline reschedule, guarded cancel (2026-07-28).**
  User request: a list view of today showing brief customer info, assigned employee,
  status, the assigned employee's clock-in/tracker status, and the ability to cancel and
  reschedule right from the list. Added as a fourth view (`?view=list`) alongside
  Staff/Week/Month, day-anchored the same way Staff is (`day` query param, Previous/Today/
  Next navigation, remembered via the `co_calendar_state` cookie) rather than a fixed
  today-only page, so an admin can still flip to yesterday/tomorrow from the same screen.
  New `src/app/(app)/calendar/today-list-board.tsx`; `page.tsx` now also queries
  `time_entries` for the day's jobs (only when `view === "list"`) and passes them down.
  Per assigned employee the Clock column reads: no entries → "Not started"; an entry with
  `clockOut IS NULL` → "Clocked in · <live elapsed>" (ticks client-side, matches My Day's
  `formatElapsed`); otherwise → "Clocked out · <summed minutesWorked>m". Reschedule reuses
  the same inline date/time-input-with-onBlur pattern as the (previously unwired) generic
  `list-board.tsx`; Cancel is a dedicated guarded action (button → inline "Keep job /
  Confirm cancel" → `commitStatus(job, "cancelled")`), mirroring the pattern the unassigned
  queue panel shipped 2026-07-28 earlier the same day, rather than relying solely on the
  status `<select>` (which still exists and still offers Cancelled, for parity/un-cancelling).
  **Found and fixed while wiring this up**: adding "list" as a new view value initially only
  updated the view-resolution ternary and the day/week/month row-query branch — the
  Previous/Today/Next header links, `DatePicker`, and `CalendarStateSync` each had their own
  separate `view === "staff" ? ... : ...` ternary that silently fell through to the *week*
  branch for any unrecognized view value. Caught live in the browser: clicking "Today" from
  the new List view was rewriting the URL to `?view=list&week=2026-07-27` instead of
  `&day=<today>`, so the page never actually landed on today. Fixed all four ternaries
  (`page.tsx`'s prev/next/today/currentDate/dateLabel/stateAnchor block, `date-picker.tsx`'s
  `selectDay`, `state-sync.tsx`) to treat `list` as day-anchored like `staff`. Worth
  remembering: any *future* new calendar view value needs the same audit — grep
  `view === "staff"` in the calendar directory before assuming a new view "just works" off
  the existing day/week/month plumbing.
  Verified: `tsc --noEmit` clean, `npm run verify` clean (0 errors), `smoke:routes` (5/5),
  `smoke:auth` (22/22) against a local production build, and a live click-through via the
  Chrome extension against the hosted DB — confirmed the List tab renders, Previous/Today/
  Next correctly jump the day-anchor (including the today-nav bug above, before and after
  the fix), assigned/unassigned/multi-employee rows all render correctly, an already-
  cancelled job shows the `StatusPill` with no Cancel control, and the Cancel button's
  confirm step (Keep job / Confirm cancel) works — **never clicked "Confirm cancel" on a
  real job**, so no hosted data was mutated. Reschedule's date/time inputs and the status
  `<select>` reuse `commitJobPatch` verbatim from the already-shipped `list-board.tsx` /
  `unassigned-panel.tsx` / staff-board resize code, so those write paths were not
  separately live-tested against the hosted DB this session — only the read-only and
  local-state-only interactions (Cancel's confirm/keep, view navigation) were exercised live.
  **Not done**: no touch/keyboard-specific affordance beyond what the existing inline
  inputs and buttons already provide (same baseline as the rest of Calendar); the generic,
  still-unwired `list-board.tsx` (arbitrary date-range list, no clock column) was left as-is
  rather than merged into this — they serve different purposes and neither reads the other's
  props today.

- **Service catalog split into Main jobs / Add-ons; New Job can now use custom presets
  (2026-07-28).** User request: "settings page should let you create presets other than
  move-out/deep-clean/first-time; catalog should have a main job category and an add-on
  category to customize." Investigation found the catalog (`services` table, Settings →
  Service catalog) already allowed arbitrary named presets — it was just a disconnected
  "price prefill" list. The actual fixed list was the New Job form's own hardcoded Job type
  dropdown (`first_clean/one_time/deep_clean/move_out`), which the user was really reacting
  to. Also found `job.type === "first_clean"` is load-bearing for GHL sync (tags
  `first-clean-done`, sets `first_cleaning_date`, fires `first_clean.completed`/
  `first_clean.scheduled` events — see `api/jobs/[jobId]/clock-out/route.ts` and
  `api/quotes/[quoteId]/convert/route.ts`), and the Calendar filter bar and 14 other files
  read `jobs.type` directly for display labels. Fully replacing the fixed enum with
  free-form types would have risked breaking GHL automation and required touching all 14 —
  disproportionate for this request. Shipped instead:
  - `services.category` (`main` | `add_on`), nullable `defaultPriceCents`/
    `defaultDurationMinutes` (add-ons can have variable/no price, shown via new
    `priceLabel` instead — e.g. "$10–$20 per window"), and `availableAddOnIds` (which
    add-ons a main preset offers). Migration `drizzle/0017_strange_iceman.sql`, applied to
    the hosted DB the same session (idempotent, additive only — no drops). **Note for
    whoever applies migrations from a checklist next**: the first attempt at applying it
    via a throwaway script silently dropped the two `ALTER COLUMN ... DROP NOT NULL`
    statements because they shared a line with the file's leading comment block and a naive
    "skip lines starting with `--`" filter discarded the whole chunk — caught immediately by
    a functional test (`23502 null value in column "default_price_cents"` on add-on create),
    fixed, and confirmed via `check:drift` + a full functional round-trip before moving on.
    Worth remembering if a future migration file starts with a multi-line comment.
  - `jobs.serviceId` (which main preset, if any) and `jobs.addOnIds` (jsonb array), both
    nullable/optional — a job can still just use one of the four built-in types with no
    catalog preset at all.
  - Settings → Service catalog (`settings/services/page.tsx`) now has two sections: Add-ons
    (name, optional flat price, optional price note for variable pricing) and Main jobs
    (unchanged fields plus a checkbox list to pick which add-ons that preset offers).
  - New Job form's Job type `<select>` now has an "Built-in" optgroup (the original 4) and a
    "Custom presets" optgroup pulling from `services` where `category = "main"`. Picking a
    preset prefills price/duration and unlocks an add-ons picker (filtered to that preset's
    `availableAddOnIds`, or all active add-ons if none configured); selected add-ons sum into
    the invoiced price live.
  - Job Detail now resolves and shows the real preset name (instead of a generic
    "One-time") and the selected add-ons as chips, via `loadJobDetail` joining `services` on
    `serviceId`/`addOnIds`.
  **Deliberately not touched, so scope this correctly next time it comes up:**
  - The quote/proposal pricing engine's own add-ons (`lib/pricing/add-ons.ts`, the
    hardcoded `ADD_ONS` list used on Move In/Out quotes) — untouched and unrelated to this
    catalog on purpose. Two separate add-on concepts now exist by design: quote add-ons
    (fixed list, quote pricing engine) and catalog add-ons (admin-editable, one-off Jobs).
  - Custom presets are NOT reflected in: the Jobs list, Calendar day/week/month boards,
    customer profile job history, or employee profile job history — all of these still show
    a custom-preset job as generic "One-time" (its underlying `jobs.type` really is
    `"one_time"`). Only Job Detail (`/jobs/[jobId]`) was wired to resolve the real preset
    name, since that's the primary place an admin would check what was actually sold. Fixing
    the other ~13 call sites means adding a `serviceName` join to each of their own separate
    queries — a real but purely cosmetic gap, do this if it comes up as a complaint, not
    preemptively.
  - The Calendar filter bar's "cleaning type" filter still only offers the 4 built-in types;
    filtering by a specific custom preset isn't possible yet (filtering by "One-time" does
    surface all custom-preset jobs together, just not split out by preset).
  Verified: `verify` (clean), `check:drift` (clean after the migration was applied),
  `smoke:routes` (5/5), `smoke:auth` (22/22) against a local production build, and a
  throwaway end-to-end script (create add-on → create main preset referencing it → create a
  job with both → confirm Job Detail resolves the real names) — passed, then all test rows
  deleted.

- **Staff board: drop-to-exact-time and drag-bottom-edge-to-resize shipped (2026-07-28).**
  This was the product decision `HANDOFF.calendar-audit.md`'s "Out of scope" section had
  flagged as pending ("today a drop appends an assignee... this is a pending product
  decision, not a bug to fix unilaterally") — the user has now made that call explicitly.
  Two changes to `src/app/(app)/calendar/staff-board.tsx`:
  1. **Drop-to-time fix.** `dropOnEmployee` previously only recalculated
     `scheduledStartTime` from the drop's vertical position when dropping onto a lane the
     job was *already* assigned to (`isExistingLane`); dropping onto a *new* technician's
     lane silently kept the old time, so the card appeared to land wherever you dropped it
     but the server disagreed. Now every drop — same lane or new lane, assigned or from the
     unassigned queue — always snaps to the dropped Y position (15-min increments, clamped
     to the 9am–5pm board).
  2. **New: resize-to-extend-duration.** A pointer-events-based handle (not HTML5 drag, so
     it doesn't fight the existing move-a-job dnd) sits on the bottom 12px of each job block,
     visible on hover via a `group-hover` affordance. Dragging it live-previews the new
     height, snaps to 15-min increments on release, clamps between 15 min and the board's
     5pm edge, and commits via the same optimistic-update-then-`router.refresh()`-then-undo
     pattern every other board mutation uses. `estimatedDurationMinutes` had to be added to
     `updateJobSchema` in `api/jobs/[jobId]/route.ts` (was write-only via nothing — the field
     existed on the row but no endpoint could set it) and to `JobPatch` in `drag-commit.ts`.
     Also fixed the overlap-warning calculation in that same route: it gated on
     `scheduledDate`/`scheduledStartTime`/`employeeIds` changing but not on duration, and used
     `existing.estimatedDurationMinutes` even when the request was actively changing it — so
     extending a job into a collision would previously return no warning at all.
  Verified with `verify` (clean, 0 errors), `smoke:routes` (5/5), `smoke:auth` (22/22), the
  full Playwright suite (4/4), and a throwaway Playwright spec driving the resize handle with
  real synthetic pointer-move sequences (multi-jump drags, not a single coordinate jump, since
  React's `onPointerMove` needs to see the drag) — confirmed the block's rendered height grows
  during resize, the "Job duration updated" toast appears, and Undo restores the exact original
  height. An earlier manual verification pass via the Chrome extension had also confirmed the
  drop-to-time fix (dragging a job mid-card moved it to the dropped time, 10:45 AM) but left
  that real job rescheduled on the hosted DB as a side effect — reverted via a second throwaway
  spec calling `PATCH /api/jobs/[jobId]` directly before cleanup. Both throwaway specs were
  deleted after use, per `TESTING.md`.
  **Known gaps intentionally left for later, not blocking:** no touch/keyboard equivalent for
  resize (same gap the existing move-drag already has, tracked in `HANDOFF.calendar-audit.md`
  Phase 3); resizing does not re-run the PTO conflict check (only the double-booking warning),
  though duration alone can't create a new PTO conflict since PTO is date/period-based, not
  duration-based; `day-board.tsx` (dead code) was intentionally left untouched.

- **Three missing indexes added for pasted design-review finding, applied to hosted DB
  (2026-07-28).** A design review of query/indexing patterns flagged three list-page sorts/filters
  with no matching index: `GET /api/customers` orders by `lastName, firstName`
  (`src/app/api/customers/route.ts:23`) with only `companyIdx`/`ghlContactIdx`/`archivedIdx` on
  `customers` (schema.ts); `GET /api/quotes` orders by `desc(createdAt)`
  (`src/app/api/quotes/route.ts:44`) with only a bare `companyIdx` on `quotes`; and
  `payrollLines` had no index usable by a userId-only filter (confirmed real usage at
  `src/app/api/employees/[employeeId]/route.ts:101` and `:372`, cross-period per-employee
  lookups) — the existing `periodUserIdx` is `(payrollPeriodId, userId)`, useless when userId
  isn't the leading column. Added `customers_company_name_idx (company_id, last_name,
  first_name)`, `quotes_company_created_idx (company_id, created_at)`, and
  `payroll_lines_user_idx (user_id)` to `src/db/schema.ts` and generated
  `drizzle/0016_query_performance_indexes.sql` via `drizzle-kit generate` (renamed from the
  auto-assigned `0015` to `0016` to avoid colliding with `0015_employee_photos_catchup.sql`,
  which deliberately has no journal entry — fixed up `drizzle/meta/_journal.json`'s idx/tag to
  match; `prevId` chain confirmed intact). Made the generated `CREATE INDEX` statements
  `IF NOT EXISTS` to match this repo's idempotent-migration convention. `verify` and
  `check:drift` both pass — `check:drift` only compares tables/columns, not indexes, so it
  never flagged this migration either way. User approved applying it to the hosted DB; the
  Supabase MCP connection is read-only (`apply_migration`/`execute_sql` both refused DDL with
  "cannot execute CREATE INDEX in a read-only transaction"), so applied it the sanctioned way
  per this doc's existing guidance — a throwaway node script using the app's own `postgres`
  client and `DATABASE_URL`, run in a single transaction, then deleted. Confirmed live via
  `pg_indexes` query (all three present) immediately after.
- **Admin-to-admin password reset added; login rate-limiting gap identified (2026-07-28).**
  A pasted design review of `/login` (4/5) flagged two items: no visible rate-limiting/lockout,
  and no forgot-password path. Investigation found both real but not what they first looked
  like:
  - **Forgot-password**: login emails are synthetic (`<username>@cleanops.local`, see
    `src/lib/auth/username.ts`) and there is no SMTP configured, so a standard "email me a
    reset link" flow cannot deliver mail — confirmed via `mcp__supabase__search_docs`, Supabase
    Auth's password-sign-in endpoint isn't even in the rate-limited/email-triggered endpoint
    list. The admin-sets-password flow for *employees* already existed
    (`POST /api/employees/[employeeId]`, driven from the employee profile page), but that
    endpoint explicitly rejected non-employee roles, and admin accounts have no profile page of
    their own (the `/employees` directory query filters `role = 'employee'`) — so if an admin
    forgot their password, there was no recovery path at all, even with 5 active admins on the
    company. Fixed by dropping the role restriction on that endpoint (all roles in this schema
    are `admin`/`employee`, both already full-trust once authenticated, so this adds no new
    privilege) and adding a "Reset password" action per row in the existing (previously
    read-only) Settings → Administrators panel. Verified with `verify`, `smoke:routes`,
    `smoke:auth` (22/22), the full Playwright suite (5/5), and a throwaway authenticated spec
    that expanded the form and asserted the fields/button render — **never submitted it**,
    since that would overwrite a real admin's password on the hosted DB.
  - **Rate-limiting**: confirmed via Supabase's security advisors + docs that
    `/auth/v1/token?grant_type=password` has no built-in attempt-lockout, and this app had no
    CAPTCHA wired in (`captcha`/`turnstile`/`recaptcha` didn't appear anywhere in `src/`).
    User chose Cloudflare Turnstile. **Widget added to `/login`** (`@marsidev/react-turnstile`,
    site key in `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `.env.local` + `.env.local.example` +
    `scripts/check-env.mjs` updated). First pass disabled the Sign In button until the widget
    resolved — reverted that: Turnstile does not auto-resolve for headless/automated Chromium,
    which hung the login-driven Playwright spec (`employee-management.spec.ts`) until its
    45s timeout, and worse, it meant **any Turnstile load failure — ad-blocker, network blip,
    a Cloudflare outage — would have permanently locked every admin and employee out of
    CleanOps**, a single point of failure this app cannot afford (no other way in once locked
    out). The button now stays enabled regardless of `captchaToken`; the token is passed to
    `signInWithPassword` when present, so enforcement happens server-side once CAPTCHA
    protection is turned on in Supabase (see Blocked below) rather than client-side. Verified
    the widget itself renders correctly (visible "Verify you are human" Cloudflare checkbox,
    screenshot-checked). **User enabled CAPTCHA protection in Supabase's dashboard the same
    day** (Authentication → Attack Protection — renamed from "Bot and Abuse Protection" in the
    docs; secret key pasted directly into Supabase, never into a file or chat). Confirmed live:
    `npm run smoke:auth` immediately started failing with `captcha protection: request
    disallowed (no captcha_token found)` — the correct, expected rejection, since that script
    signs in programmatically with no solved challenge, same as a bot would. Real password
    sign-in without CAPTCHA is now genuinely blocked.
    That predictably broke two of this repo's own test tools the same way (neither solves the
    widget): `smoke-test.mjs` and the login step of `employee-management.spec.ts`. Fixed both
    by bypassing the public password+CAPTCHA endpoint entirely, the way a trusted server-side
    script should: `auth.admin.generateLink({ type: "magiclink" })` (service-role key) mints a
    one-time token, then `auth.verifyOtp()` redeems it — neither endpoint is CAPTCHA-gated (only
    sign-in/sign-up/password-reset are), and `generateLink` never sends an email, it just returns
    the token. `smoke-test.mjs` uses this directly; the Playwright spec gets it via new
    `tests/browser/helpers/admin-session.ts`, which does the same exchange and injects the
    resulting cookies into the browser context with `context.addCookies()` — skipping the login
    form, not weakening what it protects. Both required the service role key, which only trusted
    server-side code has. Re-verified after the fix: `smoke:auth` 22/22, full Playwright suite
    4/4, `verify` clean.
  - Side finding while checking the advisors, unrelated to this task: **every public table has
    Row Level Security disabled** (`customers`, `users`, `jobs`, `invoices`, `payroll_lines`,
    20+ tables) and **leaked-password protection is off** on the hosted project. Flagged for the
    user, not acted on — see Blocked below.
- **Settings → GHL integration: de-duped save code, blocked ambiguous tag reuse
  (2026-07-28, `fd49f7a`).** Audit of the page found the tag/workflow save handlers were
  copy-pasted PATCH boilerplate and nothing stopped two different CleanOps statuses from
  being mapped to the same GHL tag — since GHL just sees "tag applied," a duplicate makes
  the two statuses indistinguishable to any automation filtering on it. `saveTags`/
  `saveWorkflows` now share one `saveMap` helper; the tag map computes duplicate values
  live, highlights the conflicting fields, and disables Save until they're fixed (workflows
  weren't restricted — reusing one workflow across statuses is a legitimate choice). Also
  moved the existing `/api/integrations/ghl/test` smoke test inline onto this page (it
  previously only lived on the parent `/settings` page), with a note that it only checks
  the API connection, not that the specific tag/workflow IDs exist in GHL. Verified with
  `verify`, both smoke scripts, and a throwaway authenticated Playwright spec — never
  clicked Save.
- **Quote-template uploads moved off base64-in-JSONB (2026-07-28, `f62834a`).** Logo,
  before/after photos, insurance certificate, and W-9 on Settings → Quote page content were
  read client-side as base64 and saved straight into `companies.settings`, so `GET
  /api/settings` — called across the whole app — fetched a row that could balloon to tens of
  MB, and there was no server-side check that an uploaded "insurance PDF" was actually a PDF
  (only the `accept` attribute, client-side and trivially bypassed). New `POST
  /api/settings/quote-assets` follows the same Supabase Storage pattern already used for
  employee/job photos: admin-gated, magic-byte-sniffed against the declared MIME type, 5 MB
  cap, uploads to a new **public** `quote-assets` bucket (public because these assets render
  on the unauthenticated `/quote/[token]` proposal page) and returns a public URL — only that
  URL is saved to `settings` now. Tightened the `quoteTemplate` URL fields in the
  `/api/settings` zod schema from 50000 chars (sized for base64) to 2000 (real URLs);
  confirmed via a read-only query against the hosted DB that the one existing company had no
  base64 data in these fields, so this was not a breaking change. Verified with `verify` and
  a throwaway authenticated Playwright spec that uploaded a real file (asserted the value
  input fills with a `supabase.co/storage/v1/object/public/quote-assets/...` URL) and a
  mislabeled fake PDF (asserted the server rejects it) — both against a local production
  build, without touching the `companies` row (never clicked Save).
- **Settings → Payroll Tiers restyled and given real bracket validation (2026-07-28).** It was
  the only Settings page still on raw `bg-white`/`text-gray-500`/`bg-blue-600` instead of
  `co-card`/`co-input`/`co-button-primary`; now matches its siblings. More importantly the
  bracket ladder had **no validation anywhere** — `resolveTierRateCents` sorts by `minHours`,
  returns the first match, and falls back to the *highest* bracket's rate when nothing
  matches, so an overlapping, backwards, or gapped ladder never errors, it just quietly pays
  the wrong rate. New `src/lib/payroll/brackets.ts` holds the shape, the defaults, and
  `validatePayTierBrackets`; it is imported by both the page (blocks Save, lists what to fix)
  and `PATCH /api/settings` (`superRefine`, so the API is the authority, not just the form).
  `calculate.ts` now re-exports the type/defaults from there instead of defining them.
  Also: Remove is a two-step inline confirm rather than an unguarded click (inline, not
  `window.confirm`, which freezes the Chrome extension), and a warning fires when the bracket
  *count* changes because per-employee tier rates zip against brackets **by position**.
  **Found and fixed a real pre-existing bug while testing:** `addBracket` computed the next
  bracket start as `(last.maxHours ?? last.minHours) + 1`, so adding a bracket to the default
  ladder capped tier 4 at `34–34` (max equal to min) and left an uncovered 34–35 hr band.
  Cutovers now use the ladder's `.01` convention, and the capped tier gets a range label
  instead of a stale `34+ hrs`. Verified with `verify`, both smoke scripts, the full
  Playwright suite (5/5), and a throwaway authenticated spec that exercised overlap, the
  removal confirm, and add/remove round-tripping — **without ever clicking Save**, since that
  writes `companies.settings` on the hosted DB. No schema change.
- **`TESTING.md` added and the browser suite actually works now (2026-07-27).** The one
  authenticated Playwright spec had been **silently skipping** since it was written:
  it reads `BROWSER_ADMIN_USERNAME`/`BROWSER_ADMIN_PASSWORD`, those were never set, and
  `test.skip` means the run still printed `3 passed`. Once the credentials were supplied it
  failed on three stale selectors that had drifted through UI redesigns (`View details` →
  `View profile`; the Account access heading needing a 20s timeout because
  `/employees/[employeeId]` is a 695-line client component that fetches on mount; and
  `Archive employee` being descriptive text, with the real control labelled just
  `Archive`/`Restore` in the header). All three fixed — the suite is genuinely 4/4 green.
  `playwright.config.ts` now loads `.env.local`, and setting `BROWSER_BASE_URL` makes it use
  your server instead of starting/reusing one on 3100 (`reuseExistingServer` was silently
  attaching to whatever stale server happened to be on that port).
  **Action for the user:** add `BROWSER_ADMIN_USERNAME` / `BROWSER_ADMIN_PASSWORD` to
  `.env.local`, or the authenticated spec goes back to skipping. Also note
  `scripts/smoke-test.mjs` hardcodes a fallback admin username/password as defaults that
  authenticate against the **hosted** Supabase project — that should become env-only.
- **`/recurring/new` converted to a server component with searchable pickers (2026-07-27,
  commit `38eab42`).** Was a 23-line client file fetching customers/employees/services on
  mount and rendering all 231 customers into a `<select>`. Now server-rendered in one
  company-scoped query (`src/lib/recurring/new-series-data.ts`) with `loading.tsx`, split
  into page/form/cadence/visit-details/team/summary, and using a new
  `CustomerSearchPicker` plus the existing `TeamSearchPicker`. That last swap exposed real
  behaviour: `generateJobsForSeries` treats `defaultEmployeeIds[0]` as the **lead**, which
  the old checkbox grid set invisibly. Also added the admin gate the page was missing.
  Verified with `verify`, both smoke scripts, and a throwaway Playwright click-through.
  **`/jobs/new` still has the identical pattern** (same three-fetch mount, same full-list
  select, same checkbox grid) — both components now exist to convert it cheaply.
- **Job Detail converted to a server component and split up (2026-07-27, commit `7a92fcf`).**
  It was the last operational screen still doing `useEffect` + `fetch` on mount, at 829 lines
  in one client file. Now: `page.tsx` is an async server component (auth + direct DB read,
  non-admins redirect to My Day), the query lives in `src/lib/jobs/job-detail.ts` shared with
  `GET /api/jobs/[jobId]` (the calendar's job panel still fetches it, so they must not drift),
  mutations `PATCH` then `router.refresh()` like the calendar does, and the interactive parts
  are `job-detail-client.tsx` + `team-panel` / `time-entries-panel` / `handoff-panel`. The
  `loaded` flag became a real route-level `loading.tsx`.
  Two things to know: (1) the pre-redesign layout behind `?legacyJobLayout` was deleted, and
  it held the *only* UI for editing an already-logged time entry — manual time entry and
  time-entry editing were moved into the live layout rather than lost, so a
  previously-hidden feature is now reachable; (2) **this was pushed without an authenticated
  click-through** — no admin credentials in that session, so `verify` + `smoke:routes` +
  the Playwright suite all passed but nobody rendered the page logged in. Open one job and
  check the crew picker, schedule fields, time entries, and Mark completed.
- User-facing date convention is now **MM/DD/YY**. Use
  `formatDisplayDate` from `src/lib/scheduling/dates.ts` for date-only text;
  database/API values and native `<input type="date">` controls deliberately
  remain ISO `YYYY-MM-DD` for unambiguous storage and scheduling. The shared
  `LocalDateTime` default now uses numeric U.S. dates. Jobs and customer
  surfaces have been converted; replace legacy direct date rendering as those
  screens are next touched.
- Job Detail was rebuilt around the approved dispatch mockup (customer and
  service context, team, progress, activity, and photos). Its current
  checklist is a non-persistent progress display derived from status/time;
  it is **not** yet a task checklist synchronized to My Day. Job Detail also
  does not yet link to My Day; My Day is the assigned technician's workflow.
- Customer-profile layout repair: the summary cards now remain a readable two-column grid
  in the narrow profile column, and General Notes are visible in the normal House Notes card.

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
- ~~Migration `drizzle/0011_plain_freak.sql` **applied to the hosted DB** (2026-07-24)~~
  **This claim was wrong — corrected 2026-07-27.** Verified directly against the hosted DB:
  `quote_line_items` still existed and *none* of 0011's six indexes had been created, so 0011
  had never been applied at all. Its index statements were applied 2026-07-27 (see the
  schema-drift entry below). Its `DROP` statements were deliberately **not** replayed:
  dropping `quote_line_items` was not approved, and the `customers.archived_reason` /
  `archived_at` drops were reversed by 0012 anyway (those columns are in `schema.ts` today).
  `quote_line_items` remains live-but-unused — dropping it is a separate decision.

- **Schema drift found and fixed 2026-07-27 — production was broken.** Migrations 0013 and
  0014 were committed and their dependent code shipped, but neither was ever applied to the
  hosted DB. Live impact while it lasted:
  - `quotes.accepted_recurring_service_type` missing — `acceptedRecurringServiceType` is set
    *unconditionally* in `api/public/quotes/[token]/accept/route.ts`, so **every** public
    quote acceptance 500'd, not just recurring ones.
  - `recurring_series.estimated_duration_minutes` missing — `generateJobsForSeries` does a
    `select()` over the whole row, so creating a recurring series, converting a quote to a
    series, and the nightly `/api/cron/generate-jobs` run all failed with Postgres `42703`.

  Both columns plus 0011's six missing indexes were applied in one transaction (approved by
  user) and verified with `npm run check:drift`, which now passes.
- **`npm run check:drift` added** (`scripts/check-schema-drift.ts`) — compares `src/db/schema.ts`
  against whatever `DATABASE_URL` points at and exits non-zero when the DB is missing a table
  or column the app expects. It is read-only. Note that `drizzle-kit generate` is **not** a
  substitute: it diffs `schema.ts` against `drizzle/meta/*_snapshot.json`, not the database, and
  it reported "nothing to migrate" while production was actively broken.
- **`npm run db:migrate` now prints the explanation and exits 1** instead of running the
  drizzle-kit command that cannot work here (`scripts/db-migrate-guard.mjs`).
- **CI added: `.github/workflows/schema-drift.yml`** — runs `check:drift` on every push to
  `main`, daily at 13:00 UTC, and on demand. This is the repo's only workflow (the old
  `db-backup.yml` was removed 2026-07-24). It reads the `DATABASE_URL` repository secret, which
  the old `db-backup.yml` also used and which is very likely still present — confirm via the
  Actions tab, see Blocked below.
- **`drizzle/0015_employee_photos_catchup.sql` added.** `users.birthday`,
  `users.profile_photo_url` and `job_photos` existed live and in `schema.ts` but had no
  migration file, and `drizzle/meta/0014_snapshot.json` already recorded them as migrated —
  so `drizzle-kit generate` would never emit one and a rebuild-from-SQL would silently omit
  all three. The new file is fully idempotent (`IF NOT EXISTS` / duplicate-object guards), so
  it is a no-op against the hosted DB. Verified the live definitions match `schema.ts` exactly.
  Like `0013`, it has no snapshot on purpose — the 0014 snapshot already describes this state.

## Blocked / needs a human

- **`drizzle/0019_must_change_password_column.sql` (`users.must_change_password`) needs to be
  applied and confirmed against the hosted DB.** Written `IF NOT EXISTS` since a prior
  (uncommitted, now-discarded) local session's user reportedly applied this same column
  directly on 2026-07-27 — but that was never confirmed on this branch's history, so treat it
  as unverified. Run `npm run check:drift` once real DB credentials are available; if it
  flags this column missing, apply the migration (Supabase SQL Editor or a single transaction,
  per `AGENTS.md`) and re-run `check:drift` clean.
- **`auth_leaked_password_protection` still off** (Supabase Auth → Attack Protection, WARN
  level). Separate, smaller finding than the RLS item resolved below — a dashboard toggle,
  not a schema change. Not touched.
- **Confirm the Schema drift workflow is green — the `DATABASE_URL` secret is probably already
  there.** The removed `.github/workflows/db-backup.yml` in this repo used
  `${{ secrets.DATABASE_URL }}`, and its runs failed on a `pg_dump` server-version mismatch,
  which only occurs *after* a successful connection — so that secret existed and worked from a
  GitHub runner. Deleting a workflow does not delete repo secrets, so `schema-drift.yml` should
  pick it up with no action needed. Just check the Actions tab: green means nothing to do; a
  failure on the "Require DATABASE_URL secret" step means it really is absent, and it should be
  added as the Supabase **Session pooler** string (GitHub runners are IPv4-only; Supabase direct
  connections are IPv6 — the trap that broke `BACKUP_DATABASE_URL` in the other repo).
  The check is read-only (`information_schema` only), but the secret grants full DB access, so
  it is deliberately never exposed to `pull_request` runs.

- **Square invoicing is running in silent mock mode in production.**
  `SQUARE_ACCESS_TOKEN` / `SQUARE_ENVIRONMENT` / `SQUARE_WEBHOOK_SIGNATURE_KEY` are not set
  in Vercel (`src/lib/square/client.ts` falls back to fake invoice IDs/URLs with zero
  warning anywhere in the admin UI when the token is unset). **Explicitly on hold** until the
  client approves the current build — do not chase this until told to.
- A real Google Maps API key still isn't configured (user is obtaining one) — but there is
  now somewhere secure to put it, see the top "Done" entry (2026-08-06). Once a real key is
  saved under Settings → Square & Google Maps: the legacy `Autocomplete` widget in
  `customers/address-autocomplete.tsx` already qualifies for Google's cheaper per-session
  billing (Basic Data fields only) — no change needed there. **The re-geocode-on-every-render
  cost gap this bullet used to flag is resolved** — `calendar/route-preview.tsx` and the
  dashboard technician-route views now cache each customer's lat/lng after the first lookup
  via `POST /api/maps/geocode-cache` instead of re-geocoding every render.
- **Correction 2026-07-24**: the note below (Codex's calendar overflow-cap fix +
  employee-photo-upload feature) described *uncommitted* work when it was first written, but
  a prior session staged and pushed most of it anyway (commits `fb311bc`, `d3a2553`,
  `6eb3c19`) without reviewing it or disclosing in the commit messages that it was Codex's
  code — see the "Correction" entry in `DECISIONS.md` 2026-07-24 for the full writeup and why
  it wasn't reverted. **Update 2026-07-29: the migration gap this bullet originally warned
  about is resolved** — `drizzle/0015_employee_photos_catchup.sql` now covers `users.birthday`,
  `users.profile_photo_url`, and `job_photos`, verified against the hosted DB (see that file's
  own header comment). The original warning is left below for the remaining pieces (if any)
  that weren't swept in.
- Codex is actively working in this repo in parallel — this list of "do not touch" files is a
  snapshot and goes stale fast. **Before staging anything (`git add`), diff every changed file
  individually against this list and against what you actually intended to change this
  session — do not run a broad `git add -A`/`git add .` and trust it.** Re-check `git status`
  at the start of every session.

## Resolved — don't re-investigate

- **Nightly DB backup workflow (`kaianbenitez/cleanops-backup`) fixed and confirmed green
  2026-07-23.** Was blocked on three stacked issues, resolved in order: (1) user switched
  `BACKUP_DATABASE_URL` to the Supabase Session pooler connection string and reset the DB
  password, fixing the original IPv6/auth failures; (2) Supabase project runs Postgres 17.6,
  but `backup.yml` pinned the dump container to `postgres:16` — `pg_dump` requires client
  version ≥ server major version, so it aborted with a version-mismatch error; bumped the
  image to `postgres:17` (commit `73d43ef`); (3) the workflow has no `actions/checkout` step,
  so `gh release create/list/delete` had no git remote to infer the repo from and failed with
  "not a git repository" — fixed by passing `-R kaianbenitez/cleanops-backup` explicitly to
  all three calls instead of adding an unneeded checkout (commit `c88c28c`). Also required
  granting the local `gh` CLI auth the `workflow` scope (`gh auth refresh -s workflow`) to
  push changes to a workflow file at all. Manually triggered run confirmed all steps (dump,
  upload, prune) succeed.
- **This repo's own `.github/workflows/db-backup.yml` removed 2026-07-24.** A second, older,
  fully independent nightly-backup pipeline (apt-installs `postgresql-client` v16, dumps via
  the `DATABASE_URL` secret, pushes the dump as a git commit into `secrets.BACKUP_REPO`) had
  been failing every single scheduled run since at least 2026-07-19 with the identical
  `pg_dump`/server-version-mismatch error already fixed above — it never once got far enough
  to actually write a backup (`cleanops-backup` has no committed `.dump` files, only the
  releases from its own `backup.yml`). Confirmed redundant with the already-working
  `cleanops-backup` pipeline above and removed rather than re-fixed, per user decision, since
  keeping two pipelines writing backups of the same DB into the same target repo via two
  different mechanisms (git commits vs. GitHub Releases) added confusion for no benefit. If
  a "database backup workflow failing" report comes up again, check which repo/workflow it's
  actually referring to before assuming it's this one — it's gone now.
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

- ~~`/privacy-policy` placeholder~~ **Resolved 2026-08-04** — real policy published, see the
  top "Done" entry. Not lawyer-reviewed, and no specific numeric retention period or mailing
  address was set (deliberately used general language instead of inventing either) — worth a
  legal pass before treating this as final, but no longer a blank stub.
- Delete test/demo accounts (QA Tester, Test Cleaner, Maria Gomez — from `src/db/seed.ts`)?
- Create real pilot cleaner accounts (only admin/test accounts exist today).
- Test the My Day workflow on an actual phone.
- Run `npm run smoke:routes` against a local production build this cycle.
- ~~`PATCH /api/jobs/[jobId]` returns a `warnings` array when an assignment double-books a
  technician, and every caller discards it silently~~ **Resolved 2026-08-13** — surfaced in
  all six UI callers, see the top "Done" entry. (PTO collisions were never part of this array —
  they're a hard 409 block, already surfaced via each caller's existing error handling.)
- ~~Full pagination + SQL-aggregate rewrite for the `customers`, `invoices`, and
  `sync-issues` list pages~~ **Correction 2026-07-29**: this was stale. Checked all three
  directly — each already does SQL-aggregate `count(*) filter (...)` stat queries plus
  `limit`/`offset` pagination, run in parallel via `Promise.all` (`customers/page.tsx:163`,
  `invoices/page.tsx:59`, `sync-issues/page.tsx:21`). No stat card reads the full row set
  client-side. Found via a pasted design review of `/employees`, `/invoices`, and
  `/quotes/new`; also confirmed `invoices/page.tsx` and `quotes/page.tsx` both already carry
  the identical `id::text ilike` fix (with matching comments) for searching a uuid column by
  ILIKE — no outstanding bug there either. Nothing left to do on this bullet.
- Dashboard exception counts use SQL aggregates. The Jobs page still applies `unassigned` and
  `missingHours` filters after pagination, so its displayed count can temporarily disagree with
  the dashboard. Fix the Jobs-page filter/pagination order separately; do not make the dashboard
  mirror that incorrect count.
- **Settings → GHL still has no validation that a tag or workflow ID actually exists in
  GHL.** A typo silently breaks an automation until a customer notices a missed step. The
  2026-07-28 fix above stops the case where two CleanOps statuses collide on the same tag,
  but doesn't check any value against the real GHL account. Would need a new GHL API call
  (list tags / list workflows for the location) — `src/lib/ghl/client.ts` has no such
  method today, only contact-level operations and the location health check. Not attempted
  since it's a real integration addition, not a UI fix.

## Parallel-work note

Codex works on this same repo in parallel and can commit/push directly mid-session. If
`git status` shows an unexpected mid-merge state or files modified that you didn't touch, do
not touch them destructively — `git fetch` and check `origin/main` and the latest Vercel
deployment first.

### Commit / push workflow (user decision, 2026-07-25)

- Commit and push each completed, verified feature by default.
- Before staging, inspect `git status` plus every intended file's diff. Stage exact paths
  only; never use `git add -A` or `git add .` in this shared worktree.
- Stop and ask instead of pushing if the scan finds unrelated/shared changes, a merge state,
  or an unapproved production migration. Report the commit SHA and files after a successful push.
