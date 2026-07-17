# Decisions log

Deviations from PLAN.md, and why. Add an entry whenever you deviate from §4 (schema) or
§6 (integration contracts) per PLAN.md §8 rule 10.

## 2026-07-13 — Phase 0 scaffold
- Used `create-next-app` defaults (App Router, TS, Tailwind v4, src/ dir) — matches plan.
- Drizzle + postgres-js + Supabase SSR helpers installed per plan's stack table.
- Auth: Supabase email/password via `@supabase/ssr`, cookie-based session, middleware
  redirects unauthenticated requests to `/login` except `/quote/*` (public quote pages) and
  `/api/webhooks/*` (external callers, verified by signature instead of session).
- Seed script creates `users` rows with **placeholder** ids (not real Supabase auth uids) —
  documented in the script's header. Before first login, create matching Supabase auth users
  (Dashboard > Authentication > Users, or `supabase.auth.admin.createUser`) and update the
  seeded `users.id` values to match, OR extend the seed script once
  `SUPABASE_SERVICE_ROLE_KEY` is available locally to create them programmatically.
- No RLS policies written yet — Phase 0 exit criteria doesn't require them (server-side auth
  checks via `requireAdmin`/`requireUser` are the enforcement point for now). RLS hardening
  is explicitly called out in Phase 6 (§7).
- Seed script now creates real Supabase auth accounts via `supabase.auth.admin.createUser`
  (service role key) instead of leaving placeholder UUIDs — removes the manual account-linking
  step. Fixed credentials for local dev only: admin/maria/chris/dana @example.com, password
  `password123` — must not ship to a real deployment with these defaults.
- `db/index.ts` conditionally requires `dotenv` when `DATABASE_URL` is unset, since Next.js
  auto-loads `.env.local` but `tsx`-run scripts (the seed script) don't. Guarded so it's a
  no-op under Next.js.

## 2026-07-13 — Phase 0 browser verification
- Verified end-to-end in a real browser: schema pushed to Supabase, seed run, admin login
  redirects to `/dashboard` with real seeded data rendering.
- Bug found + fixed: `/api/auth/logout` redirected to a hardcoded `localhost:3000` fallback
  instead of the actual request origin, breaking sign-out on any non-default port. Now uses
  `new URL("/login", request.url)`.

## 2026-07-13 — Phase 1: Jobs & scheduling
- Added `/api/jobs` (list by date range + create one-off), `/api/jobs/[jobId]` (get/update:
  reschedule, status, price, reassignment), `/api/recurring-series` (create + immediate
  8-week generation), `/api/cron/generate-jobs` (daily idempotent regeneration, protected by
  `CRON_SECRET` header rather than session auth since the caller is an external scheduler).
- Added minimal `/api/customers`, `/api/employees`, `/api/services` list endpoints — thin
  pickers only, not the full Customers management screen (that's a later phase per the
  screens table; PLAN.md's phase list didn't schedule it under Phase 1).
- Calendar: server-rendered week view at `/calendar?week=YYYY-MM-DD`, prev/next/today nav,
  jobs colored by status, links to job detail.
- Bug found + fixed (via a standalone sanity script before browser testing): monthly
  recurrence generation chained `addMonths` off the *previous computed occurrence* instead of
  the series' original start date. A start date of the 31st hit February's clamp to the 28th,
  and every subsequent month permanently drifted to the 28th instead of returning to the 31st
  in 31-day months. Fixed by computing every occurrence as `startDate + n months` independently.
- Employee assignment default role: first selected employee gets `lead`, rest get `helper` —
  simple ordering-based rule, no explicit lead-picker UI in v1.

## 2026-07-13 — Payroll model pivot (before Phase 2 build)
The user shared their real weekly payroll spreadsheet to inform Phase 2. It revealed the real
pay model is meaningfully different from PLAN.md §4's original `hourly` / `per_job_percent`
assumption, and that the sheet has a second table in the exact column shape Gusto's CSV
import expects — a bigger win than PLAN.md scoped (one-click import vs. copy-paste).

Real model, confirmed with the user: cleaning techs are paid **Job Ticket Hours (the job's
quoted/estimated duration, not actual clocked time) x hourly rate**, computed per completed
job and summed for the week — "even if they go under they get the JTH." Office/admin staff
are paid actual clocked hours x rate. On top of that, the sheet has mileage ($0.35/mi),
split paycheck/cash tips, bonus, training pay, and payroll-advance deductions, all currently
manual entries.

Schema changes applied (via manual `ALTER TABLE`, not `drizzle-kit push` — see below):
- `users.payType` enum changed from `hourly | per_job_percent` to `commission_jth |
  office_hourly`; dropped `perJobPercent`; added `title` and `gustoEmployeeId` (both needed
  for the Gusto CSV export column shape).
- `payrollLines` rebuilt with explicit columns instead of a generic gross/adjustment pair:
  `regularHours`, `commissionCents`, `officeHours`, `officePayCents`, `mileageMiles`,
  `mileageRateCents`, `mileageCents`, `tipsPaycheckCents`, `tipsCashCents`, `bonusCents`,
  `trainingCents`, `payrollAdvanceCents`. Dropped `totalMinutes`/`grossCents`. Kept
  `calculation` (jsonb per-job breakdown for the commission figure), `adjustmentCents` as a
  manual catch-all, and `finalCents`.

**Safety note**: the source spreadsheet contains real employees' names and Gusto IDs. None
of that was copied into the codebase — Claude Code's permission layer actually caught and
blocked a first draft that had copied real Gusto IDs into seed data, which was the right call.
Seed/demo data uses fictional employees and `demo-00N` placeholder IDs only. Per PLAN.md §10,
do not import real customer/employee data into this project until the "my side project"
conversation with the company owner has happened.

**Tooling note**: `drizzle-kit push` crashes with a `TypeError` while introspecting Supabase's
system check constraints (unrelated to our schema — reproduced twice, not transient). Applied
this migration via raw `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` through a one-off script
instead, and deleted the `drizzle/` folder `generate` had produced (it assumed an empty DB and
would have re-created already-existing tables). If `push` is still broken in a later phase,
keep using targeted raw SQL for the delta rather than `generate`+`migrate` from scratch.

## 2026-07-13 — Phase 2: Payroll
- Added `/api/payroll-periods` (create/list — get-or-create by date range), `/api/payroll-periods/[id]`
  (get with joined lines + status update), `/api/payroll-periods/[id]/generate` (recomputes
  commission/office-hours for every active employee, never touches manual fields on existing
  lines), `/api/payroll-periods/[id]/lines/[lineId]` (PATCH manual fields: mileage, tips,
  bonus, training, advance, ad-hoc adjustment), `/api/payroll-periods/[id]/export` (Gusto CSV).
- `/payroll` screen: week picker (defaults to the most recent Monday), editable table mirroring
  the company's real sheet, Generate/Refresh, Export CSV, Mark Reviewed.
- Verified end-to-end in the browser via direct `fetch()` calls (see below for why) against the
  real seeded data: Maria's commission line computed exactly 2.00 hours x $18.00/hr = $36.00,
  matching the 120-minute job from Phase 0/1 testing. Manual mileage/tips/bonus entry, the
  `finalCents` recomputation (3600 + 543 + 2000 + 5000 = 11143), and the Gusto CSV export were
  all confirmed correct against expected values, then reset back to zero afterward.
- Testing note: the browser tool's `form_input` sets input `.value` directly without
  dispatching real focus/blur events, so the payroll table's `onBlur`-triggered saves couldn't
  be exercised by clicking in the automated browser session — verified the same PATCH endpoints
  directly via `fetch()` from the page's console instead. This is a testing-tool limitation,
  not an app bug; a real user typing and tabbing away triggers `onBlur` normally.
- Fixed lint rule `react-hooks/set-state-in-effect` flagged the standard fetch-on-mount pattern
  in `/payroll`; suppressed with a targeted inline comment rather than restructuring — this is
  the documented, intended use of `useEffect` for syncing with an external system (the server).

## 2026-07-13 — Tiered pay rates + UI dark-mode contrast bug

**Tiered commission rates.** The user shared a second, richer payroll example (a per-employee
detail tab) that revealed the flat `hourlyRateCents` model was wrong: cleaning tech pay is
**tiered by total weekly Job Ticket Hours**, e.g. under 26 hrs = $16/hr, 26–29.99 = $16.50/hr,
30–33.99 = $17/hr, 34+ = $17.50/hr — one flat rate applied to every job that week (confirmed:
"Budgeted Hrs" in the example summed to exactly the total of that week's job durations, and
every job in the per-job breakdown used the same $/hr).
- Added `users.payTiers` (jsonb, commission_jth employees only): array of
  `{ minHours, maxHours: number|null, rateCents }`. `hourlyRateCents` is now only a fallback
  when `payTiers` is null/empty.
- **ASSUMPTION, unconfirmed with the owner**: tier schedules are per-employee, not one
  company-wide table — inferred because two employees in the source spreadsheet showed
  different tier numbers (one had round dollar tiers, another had different-looking values in
  the same columns). Modeling it per-employee is the safer default (a company-wide table that's
  actually per-employee would silently mispay people; the reverse just means entering the same
  numbers for everyone). **Verify this with the owner before a real payroll run.**
- `resolveTierRateCents()` added to `lib/payroll/calculate.ts`, unit-testable in isolation;
  `generateCommissionLine` now sums total weekly JTH first, resolves one rate from the tier
  table, then applies it to every job.
- Fixed a real bug the user's screenshot surfaced indirectly: `calculation` entries always had
  `customerName: ""` — never populated. Now joins through `customers` and fills it in. Also
  added an expand/collapse per-job breakdown row to the `/payroll` table (date, customer, hours,
  rate, amount) so this is visible in the UI, not just in the exported CSV.
- Verified end-to-end: regenerating Maria's line after adding her tier schedule changed her
  commission from $36.00 (old flat $18/hr) to $32.00 (2 hrs x new $16/hr bottom tier) — confirmed
  via direct API call and re-confirmed rendered correctly in the browser, including the
  expanded breakdown row showing "2026-07-13 | David Evans | 2.00 | $16.00/hr | $32.00".

**Dark-mode contrast bug.** The user reported unreadable (white-on-white) text throughout the
UI. Root cause: `create-next-app`'s default `globals.css` includes a
`@media (prefers-color-scheme: dark)` block that flips `--foreground` to near-white when the
OS/browser is in dark mode, but every page in this app uses explicit light backgrounds
(`bg-white`, `bg-gray-50`) with zero `dark:` variants — so text meant to sit on a light card
inherited near-white color instead. Removed the dark-mode media query entirely rather than
building out a parallel dark theme, since this is an internal ops tool with one deliberate
light design. Required clearing the Turbopack `.next/` build cache and a dev-server restart to
actually take effect — the running dev server kept serving a stale compiled CSS chunk (same
`Last-Modified` timestamp) even after a plain restart. Verified fixed by simulating a dark
`prefers-color-scheme` in the browser and confirming `document.body` computed style is
`background: white, color: near-black`.

**Testing note**: the browser tool's synthetic `click()` via `computer{action:"left_click"}`
intermittently failed to register on this page's buttons (Generate/Refresh, the row-expand
toggle) despite correct refs and coordinates — no console errors, no network request fired.
Worked reliably every time when dispatched via `element.click()` from `javascript_tool`
instead. Treated as a tool quirk in this session, not an app bug, since the underlying handlers
worked correctly once actually invoked.

## 2026-07-14 — Phase 3: Pricing engine (reverse-engineered from the real Quote Form)

The user shared their actual quote-pricing spreadsheet (2 tabs: Bartlesville, Tulsa) — the
Phase 3 quote builder is built on this, not the generic per-service catalog PLAN.md originally
sketched. Confirmed model: for a given service tier (Supreme Deep / Deep / First Time /
Weekly / Biweekly / 4-Weeks / Move In-Out), each room type has an hours-weight; total labor
cost = SUM(weight[room][service] x hourlyRateCents x count[room]) across every room entered.
Add a flat travel-zone fee (by selected town/zip). Apply a dirty-code discount tier (-3% to 0%,
levels 1-4) to the combined total. **The user explicitly asked to auto-enforce the minimum as
a floor** (the source sheet computes the raw price but never applies its own "Minimum" row —
confirmed by reading the formula, not just the value): `final = MAX(round((rooms + travel) *
(1 + discount)), minimums[serviceType])`.

Schema added: `serviceLocations` (per-location hourly rate, minimums jsonb, dirty-code tiers
jsonb), `travelZones` (per-location, flat fee), `roomTypes` + `roomTypeServiceWeights`
(company-wide — confirmed identical weight tables between Bartlesville and Tulsa, so not
duplicated per location). Extended `quotes` with `serviceLocationId`, `requestedServiceType`,
`travelZoneId`, `dirtyCodeLevel`, `roomCounts` (jsonb), `pricingBreakdown` (jsonb, computed
detail for transparency/audit).

**Deliberately NOT modeled** (found in the sheet, out of the scope the user approved): a
"CC Fee" (~3.75%) surcharge applied when the customer pays by card. Flagging this now so it
isn't mistaken for an oversight later — it needs its own explicit go/no-go decision.

**Data import, and two real bugs it surfaced:**
1. Wrote `src/db/import-pricing.ts` to read the real spreadsheet directly via ExcelJS rather
   than hand-transcribing ~100+ numbers (weights x room types x services x 2 locations) —
   hand-transcription risk on numbers that directly become customer-facing prices was judged
   too high.
2. **Tulsa's travel-zone formulas are internally broken** in the source sheet — e.g. `AI30`
   references `B37` and `AG30` references `AF30*AG22`, rows that don't correspond to the
   visible zip-code list next to them. This looks like a leftover artifact from inserting rows
   during a copy without updating formula references. Did NOT import Tulsa travel zones as a
   result — importing broken formula output would have produced wrong travel fees on real
   quotes. Tulsa's `serviceLocations` row has hourly rate + minimums only (those cells were
   literal values, not formulas, and read correctly); its travel zones need to be entered
   manually (once a Settings screen exists) or the source sheet section rebuilt and re-imported.
3. **ExcelJS returns `{ formula, result }` objects for formula cells, not plain numbers** —
   the first version of the import script used `typeof cell.value === "number"`, which is
   false for every formula cell, silently reading 0 for all 14 Bartlesville travel-zone fees
   (room weights/minimums/hourly rates were unaffected — those particular source cells happen
   to be literal values, not formulas). Caught by spot-checking imported data against the
   original spreadsheet's known values (e.g. Nowata should be $24.00) rather than trusting a
   clean-looking console log. Fixed with a `readNumber()`/`readString()` helper that unwraps
   `.result` from formula-cell objects; rewrote the import script to use it everywhere numeric
   or string cell values are read, not just in the one spot that broke.

**IP/privacy note**: unlike the earlier employee-Gusto-ID incident, this data (room weights,
hourly rates, town/zip travel fees) is business pricing configuration, not personal data about
identifiable third parties — imported directly into the demo company's real tables since it's
the actual deliverable the user asked for. Still subject to PLAN.md §10's rule: this remains
local-only until the "my side project" conversation with the company owner has happened.

**API/UI built**: `/api/service-locations`, `/api/room-types` (pickers), `/api/quotes/calculate`
(live preview, no save), `/api/quotes` (list/create), `/api/quotes/[id]` (detail),
`/api/quotes/[id]/send` (marks sent, returns the public URL — comms stay in GHL per PLAN.md,
this app doesn't send anything), `/api/quotes/[id]/convert` (accepted quote -> job or recurring
series; weekly/biweekly/four_weeks become a `recurringSeries` via Phase 1's
`generateJobsForSeries`, everything else a single job), `/api/public/quotes/[token]` +
`/accept` (unauthenticated, added `/api/public/` to the middleware's public-route allowlist
alongside `/quote/` and `/api/webhooks/`). UI: `/quotes` list, `/quotes/new` builder with a
live price sidebar, `/quotes/[id]` detail (send/convert), `/quote/[token]` public accept page.

Job Ticket Hours on a converted job are computed from the quote's own `pricingBreakdown`
(sum of weightHours x count), not guessed — this feeds directly into Phase 2's `commission_jth`
payroll calculation. The recurring-series conversion path still inherits Phase 1's hardcoded
120-minute-per-job default (recurring series don't yet store their own duration) — flagged as a
known gap, not silently left looking finished.

Nearly repeated the exact hardcoded-`localhost:3000`-fallback bug from Phase 0's logout route
in `/api/quotes/[id]/send` (first draft used a `req_origin()` helper defaulting to
`http://localhost:3000` instead of the actual request). Caught it myself before running
anything — fixed to `new URL(path, req.url)`, the same pattern used in the earlier fix.

**Verified end-to-end in the browser**, full pipeline: created a quote via the real API with
the exact room counts from the source spreadsheet's example (3 bedrooms, 2 full baths, 1
living room, 1 small kitchen, Nowata zone, Supreme Deep) — got **$507.00**, byte-for-byte
matching the spreadsheet. Confirmed the quote detail page and the public `/quote/[token]` page
both render that breakdown correctly (including a genuinely unauthenticated fetch — confirms
the middleware change works). Accepted the quote via the public endpoint, converted it to a
job, and confirmed `estimatedDurationMinutes: 690` (3x1.25 + 2x2.0 + 1x1.25 + 1x2.5 = 11.5
hours x 60), `priceCents: 50700`, correctly linked to the quote, and visible on the calendar.

## 2026-07-14 — Multi-tier pricing + basic proposal wrapper

The user pointed at a live real quote link (thecustomerfactor.com/.../view_proposal.php) to show
what a real proposal actually looks like: the customer sees **every service tier priced
simultaneously with checkboxes/radio selection and a recalculating total**, wrapped in a
multi-section sales document (intro letter, before/after photos, testimonials, FAQ,
insurance/W9, terms, e-signature) — not a single admin-preselected price. This is a materially
different shape than what was built earlier in this phase (admin picks one tier before sending).

**Scope confirmed with the user**: (1) show all 7 tiers, let the customer pick — yes; (2) add a
basic proposal wrapper now (intro letter, terms, typed-name e-signature) — yes, but explicitly
skip photos/testimonials/W9/insurance for v1.

Schema: `quotes.requestedServiceType` is now just the admin's suggested/default tier (no longer
"the" service). Added `acceptedServiceType` (set on accept), `allTierPricing` (jsonb, every
tier's full breakdown computed at creation), `signatureName` + `signatureAt`. Dropped the old
single-tier `pricingBreakdown` column.

`lib/pricing/calculate.ts`: added `calculateAllTierPrices()`, which fetches location/travel-zone/
weights once and computes all 7 tiers in-memory (not 7 separate DB round-trips). Removed the old
single-tier `calculateQuotePrice()` entirely once nothing called it anymore — two implementations
of the same formula was a real risk of them drifting apart, not a hedge worth keeping.

API: `/api/quotes` now stores `allTierPricing` for every tier at creation; `/api/quotes/calculate`
returns both the admin's currently-selected tier's detail AND the full comparison table (so the
builder can show a live 7-row price comparison, not just one number) — this reuses
`calculateAllTierPrices()` rather than adding a second calculation path.
`/api/public/quotes/[token]/accept` now takes `{ serviceType, signatureName }` — the customer's
own choice, validated against the quote's own `allTierPricing` keys (can't accept a tier that
wasn't priced on this quote). `/api/quotes/[id]/convert` reads `acceptedServiceType` and derives
Job Ticket Hours from `allTierPricing[acceptedServiceType]`, not the admin's original suggestion
— matters because the customer's actual pick can differ (verified below).

UI: `/quotes/new` builder now shows a live 7-row "all tiers" comparison table alongside the
detailed breakdown for the admin's suggested tier. `/quote/[token]` public page rewritten:
intro letter (placeholder text, not Simply Maid's real copy — same reasoning as the Phase 0
open question about swapping in real content later), radio-selectable pricing for all 7 tiers
with the room-line detail updating per selection, collapsible Terms &amp; Conditions
(placeholder), typed-name signature field required to accept. Admin's `/quotes/[id]` detail page
shows the full tier comparison table with the accepted tier highlighted and the signature name.

**Verified end-to-end**: created a quote (2 bedrooms, 1 full bath, no travel/dirty-code,
suggested tier "First Time"). Confirmed all 7 tiers computed and several hit their configured
minimum floor exactly (Deep $250, Weekly $90, Biweekly $100, First Time $150, 4 Weeks $120,
Move In/Out $250, Supreme Deep $300 — all match the imported spreadsheet minimums). On the
public page, accepted a **different** tier than the admin's suggestion (Weekly $90, not First
Time $150) with a typed signature — confirmed the public page, admin detail page, and the
converted recurring series (`priceCents: 9000`, 5 jobs auto-generated) all correctly used the
customer's actual choice, not the admin's original suggestion. This specifically exercises and
confirms the bug this whole feature was meant to prevent: silently billing/scheduling off the
admin's pre-pick instead of what the customer actually agreed to.

## 2026-07-14 — Phase 4: GHL sync

Built per PLAN.md §6/§7: `lib/ghl/client.ts` (thin wrapper over GHL API v2 contacts endpoints,
**mock mode** when `GHL_API_KEY` is unset — every call succeeds with a synthetic response
instead of hitting the network, since no real GHL account is wired up yet). `lib/ghl/sync.ts`
is the single outbound orchestrator: every event writes a `ghl_sync_log` row, resolves/creates
the customer's GHL contact, applies tag/field changes from `companies.settings.ghlTagMap`
(never hardcoded — GHL workflows reference these exact strings), and never throws (failures
become `retrying`, so a GHL outage never blocks the CleanOps action that triggered it).
Refactored once already to pull contact-resolution and the actual sync-and-log logic into
shared helpers (`resolveGhlContactId`, `runSync`) used by both the immediate path and the
retry cron — the first draft had that logic duplicated between them, same drift risk as the
earlier pricing-calc dedup.

Wired into every transition PLAN.md's §6 table specifies: quote sent/accepted, first-clean
scheduled (fires on quote conversion) and completed (fires from **both** the admin job-PATCH
route and the employee clock-out route — a job can be completed either way), and
customer -> client+recurrence / lost / moved. Added `PATCH /api/customers/[id]` for the
lost/moved transitions specifically, since there's no full Customers management screen yet —
minimal, status-only, enough to exercise the GHL event without building UI ahead of need.

Inbound: `/api/webhooks/ghl` stores the raw payload in `webhook_events` before processing (so a
handler bug never loses the underlying event), verifies a shared-secret header with
`timingSafeEqual`, and upserts a `customers` row matched by ghl_contact_id, then phone, then
email — replacing the Zapier -> TCF zap per PLAN.md.

Retry: `/api/cron/retry-ghl-syncs` (same shared-secret pattern as the Phase 1 jobs cron),
gives up and marks `failed` after 5 attempts. Admin-facing `/sync-issues` screen lists
everything not `ok`; the dashboard's sync-count tile now links there and counts `retrying` +
`failed` together (it previously only counted `failed`, which would have shown 0 for most of a
sync's actual lifetime — retrying isn't a non-issue, it's a thing actively needing attention).

## 2026-07-14 — Employee Directory

Not explicitly a numbered PLAN.md phase — added per direct request (profile fields + stats,
the kind of thing PLAN.md's Settings screen gestured at under "employees (add/deactivate,
rates)" without designing). Added `users.birthday` and `users.hiredDate` (date columns).

`/employees` (directory list), `/employees/new` (create — provisions a real Supabase auth
account via a new `lib/supabase/admin.ts` service-role client, generates a random temp
password shown once in the response, mirrors the seed script's account-creation pattern but
usable from the running app instead of only at seed time), `/employees/[id]` (profile: inline
editable fields, pay type/rate, deactivate toggle, plus a stats panel — jobs completed
lifetime, hours worked lifetime, this month's pay).

Stats are computed correctly per pay type, not just summed blindly: `commission_jth` employees'
"hours worked" comes from completed jobs' `estimatedDurationMinutes` (Job Ticket Hours, matching
how they're actually paid); `office_hourly` employees' comes from `time_entries.minutesWorked`
(actual clocked time). Caught and fixed one bug before it shipped: "this month's pay" first
implementation filtered on `payrollLines.createdAt`, which is when the row was *generated*, not
the pay period it covers — switched to joining `payrollPeriods` and filtering on
`startDate` instead.

Kept the existing `GET /api/employees` (minimal fields, used by job/series assignment pickers
elsewhere) untouched rather than changing its shape — the richer directory list queries the DB
directly from the page instead, consistent with how `/quotes` and `/dashboard` already do
their own listing queries rather than going through a shared API route.

**Verified in the browser**: directory lists all 3 seeded employees correctly; Maria's profile
shows real stats (2 jobs completed, 4.0 hours, $32.00 this month) matching earlier Phase 1/2
test data; a PATCH to birthday/hiredDate persisted and read back correctly; creating a new
employee via the real API produced both a working Supabase auth account and a temp password.

## 2026-07-14 — Per-employee tier-rate editor (competitor product shown as reference)

The user shared screenshots of a competitor product ("The Cleaning Software") they'd trialed
and abandoned — employees hated its time-tracking/scheduling UX, but the owner (Stephanie)
specifically liked its Reports/Dashboard/KPI screens. Worth remembering when eventually
demoing CleanOps to her — lead with dashboard/reporting, not scheduling, if that's what
already won her over once.

Confirmed with the user: the 4 hour brackets (`<26`, `26-29.99`, `30-33.99`, `34+`) are fixed
company-wide, but the **dollar rate per bracket is different per employee** — this matches
what Phase 2's payroll engine already modeled (`users.payTiers`), it just had no UI. Added
`PAY_TIER_BRACKETS` (the fixed 4 brackets, single source of truth) and `buildPayTiers()` to
`lib/payroll/calculate.ts` so the employee-profile editor and the payroll calculation agree by
construction, not by convention. `PATCH /api/employees/[id]` now accepts `tierRatesCents: [4
numbers]` and converts to the full `PayTier[]` shape server-side — the UI only ever edits 4
dollar amounts, never the bracket boundaries themselves.

`/employees/[id]` profile: `commission_jth` employees see a 4-input tier-rate editor
(pre-filled from their existing schedule, or the flat fallback rate if none set yet) instead of
a single rate field; `office_hourly` employees still see the single hourly-rate field, since
tiering was only ever confirmed for commission techs.

**Verified end-to-end**: Maria's profile correctly pre-filled her real tier schedule
($16/$16.50/$17/$17.50). Changed it to $20/$20.50/$21/$21.50 via the real API, re-ran payroll
generation, and confirmed her commission recalculated to $40.00 (2 hrs x new $20 bottom-tier
rate, up from $32.00) — proving the profile editor and payroll engine are actually wired
together, not just visually similar. Reset back to the original demo values afterward.

## 2026-07-14 — Phase 4 exit test (completed, was deferred mid-build)

Ran PLAN.md §7's Phase 4 exit test for real, which had gotten skipped when the user's messages
moved the session on to other things before I got to it: POSTed a fake GHL webhook payload to
`/api/webhooks/ghl` with the correct `x-webhook-secret` header — created a real `customers` row
(status `lead`), confirmed via `/api/customers`. Then marked an existing `first_clean`-type job
completed via `PATCH /api/jobs/[id]` and queried `ghl_sync_log` directly — found the
`first_clean.completed` event logged with `status: "ok"`, mocked response showing the tag call
hit `/contacts/demo-ghl-3/tags` (reused the seeded customer's existing `ghlContactId` correctly
rather than minting a new mock contact). Both halves of the exit test pass. Phase 4 is done.

## 2026-07-14 — Phase 5: Invoicing (Square, mock mode)

Built while the user was away, autonomously, continuing straight from Phase 4 per PLAN.md's
strict phase order. Same mock-mode pattern as `lib/ghl/client.ts`: `lib/square/client.ts` calls
succeed with a synthetic response whenever `SQUARE_ACCESS_TOKEN` is unset, so the whole flow
(customer upsert -> invoice create+publish -> payment webhook) is buildable and testable now,
and will start hitting the real Square sandbox the moment credentials are added — no code
changes needed then, matching how GHL was handled.

Added `customers.squareCustomerId` (mirrors `ghlContactId` — resolved once per customer,
persisted, reused on subsequent invoices rather than re-created every send).
`lib/square/invoicing.ts` is the orchestrator: resolve-or-create the Square customer, then
create+publish the invoice, then update our `invoices` row with the resulting
`squareInvoiceId` and `status: "sent"`.

API: `POST /api/invoices` (draft, typically from a completed job's price),
`POST /api/invoices/[id]/send` (Square create+publish), `POST /api/invoices/[id]/record-check`
(manual, per PLAN.md's "no payment processing of our own" — checks are just recorded, not
processed), `/api/webhooks/square` (verifies signature, mocked-true in mock mode since there's
no real signing key to check yet; matches on `squareInvoiceId`, marks paid on the
`invoice.payment_made` / `status: PAID` transition).

UI: `/invoices` list (with a same-heuristic overdue badge as the dashboard tile below),
`/invoices/[id]` detail (send via Square or record a check), and a "Create Invoice" button
added to the existing job detail page — shows only once a job is `completed`, the natural
trigger point.

Dashboard: added the "Overdue invoices" tile PLAN.md §5 originally specified but Phase 0 never
built (only today's-jobs/upcoming/sync-issues existed). No formal due-date field exists yet, so
overdue is a simple v1 heuristic — a `sent` invoice older than 14 days — applied identically on
both the dashboard tile and the invoices list so the two numbers can't disagree with each other.

**Verified end-to-end, the actual Phase 5 exit test** (PLAN.md: "full loop in Square sandbox —
create, publish, simulate payment, see it marked paid" — mock mode standing in for real sandbox
since no credentials exist yet): created a draft invoice from a real completed job ($250.00),
sent it via Square (mock-published, got back `squareInvoiceId: "mock-inv-ba80dcb9"`), POSTed a
simulated `invoice.payment_made` webhook referencing that id, and confirmed the invoice flipped
to `status: "paid"` with a real `paidAt` timestamp. Separately verified the record-check path
on a second invoice (instant paid, no Square involved). Confirmed both render correctly on
`/invoices` and that the dashboard's new overdue tile shows 0 (correct — both test invoices are
already paid, not overdue-sent).
