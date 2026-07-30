# Handoff → Codex: Dashboard + Reports redesign

Author: Claude Code (planning only — no code written).
Date: 2026-07-26.
Target: bring `/dashboard` and `/reports` up to the approved mockup
(`Operations Dashboard (Redesigned)` + `Reports & Analytics Center`).

Read `AGENTS.md` and `HANDOFF.md` first. This document does not supersede them.

---

## 0. Execution contract

**Goal.** Rebuild the presentation layer of `/dashboard` and `/reports` to match the
approved mockup, fix six real data bugs found in `reports/page.tsx`, and extract a small
set of reusable server-rendered chart primitives. No new runtime dependencies.

**In scope.** Only the files listed in §7. Everything else is out of scope.

**Out of scope.** Schema migrations, Square/GHL integration work, the `customers` /
`invoices` / `sync-issues` pagination rewrite already tracked in `HANDOFF.md`, and the
`webhook_events` tenancy decision in §6.7 (that one is the user's call, not yours).

**Hard constraints.**

1. **One statement per line, normally formatted.** Several existing dashboard components
   (`pulse-tiles.tsx`, `todays-run.tsx`, `exception-strip.tsx`, `crew-capacity.tsx`,
   `date-range-controls.tsx`, `dashboard/page.tsx`) are collapsed onto a single line. Every
   file you touch must come out normally formatted — one JSX element per line, one
   statement per line. Do not preserve the existing style, and do not introduce it in new
   files. This is a correctness issue for review, not a preference.
2. **No new dependencies.** No `recharts`, no `d3`, no chart library. Charts are
   hand-rolled SVG in server components — the existing `dashboard/revenue-vs-target.tsx`
   is the reference implementation and it works well. Rationale in §3.
3. **Server components by default.** `"use client"` only for the four controls named in
   §3.2. Charts must not become client components.
4. **Company scoping on every query.** `eq(x.companyId, user.companyId)` — no exceptions.
   `AGENTS.md` rule; one existing query already violates it (§6.7).
5. **No fabricated data.** §2 is the authority on what may be rendered. If a mockup element
   has no backing data, build the substitute named in §2 or leave it out. Do not invent
   placeholder numbers, seed demo rows, or write narrative copy that reads as computed.
6. **Do not run migrations.** No `db:push`, no `db:migrate`. Nothing here needs a schema
   change.
7. **Shared worktree.** Stage explicit paths only, never `git add -A`/`git add .`. One work
   package per commit. Re-check `git status` before each commit.

**Verification (every work package).**

```
npm run verify                       # check:env + lint + typecheck + build
npx next start -p 3100               # then, in another terminal:
npm run smoke:routes -- http://localhost:3100
```

Both `/dashboard` and `/reports` must render with zero console errors at 1440px, 1024px,
and 390px widths. Report the commit SHA and files after each push.

---

## 1. Rating of the current state

| | Score | Summary |
|---|---|---|
| `/dashboard` vs mockup | **3 / 10** | Data layer is genuinely good. Presentation is placeholder-grade. |
| `/reports` vs mockup | **4 / 10** | Rich but the wrong shape — no builder, no charts, heavy duplication, six data bugs. |

**Dashboard.** The query layer (`src/lib/dashboard/queries.ts`) is the strongest code in
either page: real SQL aggregates, `count(*) filter (where ...)`, correct `AT TIME ZONE`
bucketing, `Promise.all` parallelism, and per-section `Suspense` streaming in
`page.tsx`. Keep all of it. The rendering is the problem — `pulse-tiles.tsx` emits
`<div className="co-card p-4">Jobs today: 5</div>`. There is no label/value hierarchy, no
icon chips, no deltas, no sparklines, no funnel, no conversion trends, no insight grid, no
footer. `revenue-vs-target.tsx` is the one exception and it is good work (legend, axis
labels, `sr-only` prose summary, empty state).

**Reports.** The opposite failure: 1,135 lines that render roughly thirty stat boxes and
three tables with almost no charts. Weekly revenue appears three times, open quotes three
times, overdue invoices three times, sync health four times. There is **no date-range
control at all** — the page is hardcoded to the current payroll week plus the current
month, so the entire report-builder card from the mockup is missing functionality, not just
styling. The nav-button row duplicates the sidebar. It blocks on ~16 sequential-awaited
queries with no `Suspense`, so TTFB is worse than the dashboard's.

---

## 2. Data-availability contract — read before writing any UI

The mockup was drawn against imaginary data. This table is binding.

### 2.1 Buildable from real data — build as drawn

| Mockup element | Source |
|---|---|
| Total Revenue + delta vs prior period | `getPulseMetrics().revenue` (`receivedCents`, `previousCents`) |
| Conversion Rate + target | `getPulseMetrics().conversion`; target from `companies.settings.revenueTargetCents` sibling — add `conversionTargetPct` if the user wants one, otherwise omit the target line |
| Active Jobs / in progress | `jobs.status` in `('scheduled','in_progress')` for the range |
| Weekly Revenue & Job Volume | extend `getRevenueSeries()` with a per-day job count |
| Quote Pipeline (Sent / Accepted / Booked) | `quotes.status`, plus `jobs` created from accepted quotes |
| Avg. Sales Cycle | `avg(quotes.acceptedAt - quotes.sentAt)` over the range |
| Conversion Trends (Direct Website / Google Ads / Referrals) | **`customers.source`** — free-text, real values include `google_ads`, `referral`, `sms`. Group-by, order desc, cap at top 5. Label via a lookup map with a `Other` fallback; never render the raw snake_case key. |
| Conversion Funnel donut + legend | `customers.status` enum: `lead → quoted → first_clean_booked → client`, with `lost`/`moved` as the churned bucket and `lead`+`quoted` as pending |
| Churn Rate | `customers.status in ('lost','moved')` transitioned within the period, over active clients at period start |
| Quotes Sent / Accepted Rate | `quotes.sentAt` / `quotes.acceptedAt` in range |
| Regional table rows | see 2.2 |

### 2.2 Substitute — mockup element has no backing data, build the named replacement

| Mockup element | Why | Build instead |
|---|---|---|
| "Avg Rating 4.85 / Based on 214 reviews" (4th KPI tile) | No reviews or ratings table exists anywhere in the schema | **Cash to Collect** — overdue dollars + count, from `getPulseMetrics().collections`. It is the actual fourth business vital and already computed. |
| "Cleaner Rating ★4.9" column in Regional Performance Data | same | **Drop the column entirely.** Do not substitute job-completion rate and label it a rating. |
| "Regions" filter / "All Regions" / "Hub #44 - Seattle" | No region, hub, or territory concept exists | **Area** = `customers.city`, with `customers.zip` as the second line where the mockup shows the hub ID. Rename the section "Performance by area". The filter select becomes **Area**, populated from distinct non-null cities. |
| "Status: Growth / Stable / Top Performer" pill | — | Derive honestly from period-over-period revenue delta for that area: `>= +10%` Growth, `<= -10%` Declining, else Stable. Do not emit "Top Performer". |
| "System Insights" 2×2 narrative cards (Revenue Peak, Staff Utilization, Auto-Sync Success, Sentiment Score) | These read as AI-generated prose. There is no model, no sentiment data, and no utilization model. | Repurpose the **layout** as an **Exceptions & Insights** grid fed by the existing `getExceptionCounts()`. Each card = one real blocker (unassigned jobs, jobs missing hours, awaiting invoicing, failed syncs), with the count, a one-line factual description, and a link to the pre-filtered list. Reuse the mockup's tinted-icon-square card styling exactly. |
| "Sentiment Score" card specifically | No data of any kind | Not built. |

### 2.3 Do not build

- Any KPI whose value would be a constant, a `Math.random()`, or seeded demo data.
- The floating action button (bottom-right green `+`). `CreateMenu` already sits in the
  topbar and does the same thing; on mobile the FAB would overlap the bottom nav. Skip it.
- "© 2023" in the footer — use the current year, computed server-side.

---

## 3. Architecture decisions

### 3.1 Charts stay hand-rolled SVG server components

Do not add a charting library. Reasons, in order: the mockup's chart set is simple (grouped
bars, a donut, a chevron funnel, horizontal progress rows); every chart library forces the
component to `"use client"`, which breaks the `Suspense` streaming the dashboard already
does correctly; and `revenue-vs-target.tsx` already proves the hand-rolled pattern reads
well and is accessible. Charts render zero client JS.

**New primitives — `src/components/charts/`** (all server components, all pure props-in):

| File | Purpose | Key props |
|---|---|---|
| `bar-series.tsx` | Grouped/paired vertical bars — Weekly Revenue & Job Volume, Revenue vs Bookings | `series: {label, values, color}[]`, `categories: string[]`, `formatValue`, `height` |
| `donut.tsx` | Radial progress with a centred value + caption — Conversion Funnel `42% CLOSED` | `value`, `total`, `centerLabel`, `centerCaption`, `size`, `thickness` |
| `funnel.tsx` | Tapering chevron stages with a right-side % chip — Quote Pipeline | `stages: {label, value, pct}[]` |
| `progress-row.tsx` | Labelled horizontal bar — Conversion Trends, target progress under a KPI | `label`, `value`, `max`, `suffix`, `tone` |

Every primitive must:
- accept a `title`/`description` and render an `sr-only` prose summary of the data, the way
  `revenue-vs-target.tsx` does (`<p className="sr-only">{summary}</p>`), with the `<svg>`
  marked `aria-hidden="true"`;
- render a defined empty state when all values are zero — never a blank box;
- take colours from the `--co-*` custom properties in `globals.css`, never hex literals.
  (`revenue-vs-target.tsx` currently hardcodes `#006c49`/`#465a51`/`#704c00`; fix that while
  you are in there.)

**New primitives — `src/components/ui/`:**

| File | Purpose |
|---|---|
| `kpi-tile.tsx` | The mockup KPI tile: tinted icon square (top-left), delta chip (top-right), uppercase label, large value, sub-note, optional footer slot for a `progress-row` or segment bar. **New component — do not modify `stat-tile.tsx`**, Reports still uses it during the transition; delete `stat-tile.tsx` only in WP-6 once nothing imports it. |
| `delta-chip.tsx` | `↗ +12.4%` / `↘ -3%` / `Steady`. Direction must be conveyed by the arrow glyph **and** the text, not colour alone (`globals.css` comment already states this rule). |
| `insight-card.tsx` | Tinted icon square + bold title + body copy, as a `Link`. Used by the Exceptions & Insights grid. |
| `segmented-control.tsx` | Days/Weeks toggle. `"use client"`, writes to a URL search param and lets the server re-render. Do not fetch client-side. |

### 3.2 The only four client components

`range-toolbar.tsx`, `report-builder.tsx`, `segmented-control.tsx`, and the existing
`create-menu.tsx`/`global-search.tsx`. All of them work by mutating URL search params and
letting the server component tree re-render — no client data fetching, no `useEffect`
fetches, no state mirroring of server data.

### 3.3 Range semantics are shared

`/reports` currently has no range control. Do not invent a second range system. Import
`resolveRange`, `addDaysIso`, `startOfWeekIso`, `todayInTimeZone` from
`src/lib/dashboard/range.ts` and give Reports the same `?preset=&from=&to=` contract the
dashboard uses. Add `last_90_days` and `this_month` presets to `resolveRange` (both pages
benefit). Keep the existing default of `last_30_days`.

### 3.4 Reports gets its own query module

Create `src/lib/reports/queries.ts` + `types.ts` mirroring the shape and quality of
`src/lib/dashboard/queries.ts`. Move every query currently inline in `reports/page.tsx` into
it. Rules, matching the dashboard module:

- SQL aggregates (`count(*) filter (where ...)`, `sum(...)`) — never "select all rows then
  `.filter()` in JS".
- Day bucketing via `to_char(x AT TIME ZONE ${timeZone}, 'YYYY-MM-DD')` — never
  `new Date(x).toISOString().slice(0,10)`.
- `Promise.all` for independent queries.
- One exported function per page section so each can sit behind its own `Suspense`.

### 3.5 Motion

GSAP 3.15 is already a dependency and `AppSurfaceMotion` (in `(app)/layout.tsx`) already
runs a page-level entrance reveal on every route.

- **Delete `reports/reports-motion.tsx`.** It runs a *second* full-page GSAP reveal on top
  of `AppSurfaceMotion`, so Reports currently double-animates (elements fade in, then fade
  in again). Remove the file and its wrapper, and drop the `data-report-reveal` attributes.
- **Chart draw-in uses CSS keyframes, not GSAP.** Add to `globals.css`: `co-bar-grow`
  (scaleY 0→1, `transform-origin: bottom`), `co-arc-draw` (`stroke-dashoffset` → 0),
  `co-fade-rise` (opacity + 6px translate). CSS keeps the charts as server components with
  zero JS. Stagger with an inline `animation-delay` computed from the item index — cap the
  total stagger at 400ms so a 30-bar chart does not crawl.
- Durations: 320ms bars, 600ms donut arc, 180ms fades. Easing `cubic-bezier(0.22, 1, 0.36, 1)`.
- **`prefers-reduced-motion` is mandatory.** The global rule in `globals.css` clamps
  `animation-duration`, but it must not leave an element stuck at its initial keyframe —
  verify every new animation ends in the visible state when motion is reduced. Test with
  the emulation flag on.
- Animate on mount only. Never re-animate when the range changes — that would flash the
  whole page on every filter click.
- Do not animate `width`/`height`/`top`/`left`. `transform` and `opacity` only.

---

## 4. `/dashboard` — target structure

Top to bottom, replacing the current layout in `dashboard/page.tsx`:

1. **Page header** — `Operations Dashboard` (h1) + `Monitor your cleaning business vitals
   for {formatted range}`. Right side: `Filters` and `Custom Range` buttons with Lucide
   icons (`SlidersHorizontal`, `CalendarRange`). Drop the current `New job`/`New quote`
   buttons — `CreateMenu` in the topbar covers this.
2. **Range toolbar** (`range-toolbar.tsx`, replaces `date-range-controls.tsx`) — presets as
   a compact segmented row, custom range collapsed behind the `Custom Range` button rather
   than always-visible date inputs. Keep the existing explanatory line: reporting metrics
   follow the range, today's run and exceptions stay anchored to today. Keep 44px minimum
   touch targets.
3. **KPI row — 4 × `kpi-tile`** in `pulse-tiles.tsx`: Total Revenue, Conversion Rate,
   Active Jobs, Cash to Collect (see §2.2). Each: icon chip, delta chip, label, value,
   sub-note. `grid gap-3 sm:grid-cols-2 xl:grid-cols-4`.
4. **Row: Weekly Revenue & Job Volume (≈1.6fr) + Quote Pipeline (≈1fr)** — new files
   `revenue-job-volume.tsx` and `quote-pipeline.tsx`. The revenue chart supersedes
   `revenue-vs-target.tsx` as the primary chart; fold the target line into it as a dashed
   overlay and keep the "Set a monthly revenue target" empty-state link. Quote Pipeline uses
   `funnel.tsx` with the `Avg. Sales Cycle` footer row.
5. **Row: Conversion Trends (≈1fr) + Exceptions & Insights (≈2fr)** — new files
   `conversion-trends.tsx` (three to five `progress-row`s from `customers.source`) and
   `insights-grid.tsx` (2×2 `insight-card`s from `getExceptionCounts()`, plus a
   `View all alerts` link to `/sync-issues`).
6. **Today's Run + Crew Coverage** — keep both, reformatted. These are not in the mockup but
   they are the operationally most-used blocks on the page; do not delete them. Place them
   below the insight grid.
7. **Footer** — new `(app)/app-footer.tsx`, mounted in `(app)/layout.tsx` so every page gets
   it: `© {currentYear} CleanOps Operations Desk.` + Privacy Policy / Terms of Service /
   Support links. `privacy-policy` and `help-center` routes already exist; point Support at
   `/help-center`. Do **not** render "All systems operational" as static text — either wire
   it to the real sync-health count or omit the phrase.

Keep every existing `<Suspense>` boundary and add one per new section.

---

## 5. `/reports` — target structure

`reports/page.tsx` is rewritten. Target roughly 200 lines of composition plus the extracted
section components; all queries move to `src/lib/reports/queries.ts`.

1. **Report builder card** (`report-builder.tsx`, `"use client"`) — the biggest functional
   gap. Date Range select, Area select (§2.2), removable metric chips with `+ Add Metric`,
   `Generate Report` primary button, and a download icon button. All state lives in URL
   search params. Metric chips control which sections render; persist the selection in the
   URL so a report view is shareable.
2. **KPI row — 4 × `kpi-tile`**: Weekly Revenue (with a `progress-row` footer showing % of
   monthly target reached — `companies.settings.revenueTargetCents` already exists), Quotes
   Sent (segmented bar footer), Accepted Rate, Churn Rate. **This replaces all three of the
   current duplicate revenue displays.** The hero card, the "What needs attention first"
   right rail, and the "Executive summary" panel all collapse into this single row plus item 3.
3. **Row: Revenue vs Bookings Trend (≈2fr) + Conversion Funnel (≈1fr)** —
   `revenue-vs-bookings.tsx` (`bar-series` + `segmented-control` Days/Weeks) and
   `conversion-funnel.tsx` (`donut` + a dotted legend list: Converted Clients / Lost-Churned
   / Pending Response, from `customers.status`).
4. **Performance by area** (`area-performance.tsx`) — the mockup's Regional Performance Data
   table, per §2.2. Columns: Area / Revenue / Invoices / Avg job size / Status. Filter icon
   button + `View Full Log` → `/invoices`.
5. **Labor & payroll** and **Integration health** — keep, as single non-duplicated sections
   below the fold. Strip the repeated counts; each number appears exactly once on the page.
6. **Delete outright:** the `Dashboard / Quotes / Jobs / Payroll / Sync issues` button row
   (duplicates the sidebar), the six-anchor card nav (replace with plain in-page anchors or
   drop), the "Attention required" list that restates the four numbers directly above it,
   and the **raw webhook inbox** (see §6.7).
7. **Wrap each section in `Suspense`** with the `cardSkeleton` pattern from
   `dashboard/page.tsx`. Reports currently blocks on every query before first byte.
8. **Export** — new `src/app/api/reports/export/route.ts`, `GET`, admin-only via
   `requireAdmin()`, accepting the same `?preset=&from=&to=&area=` params and returning
   `text/csv` with `Content-Disposition: attachment`. Follow the existing pattern in
   `src/app/api/payroll-periods/[periodId]/export/route.ts` exactly — same auth call, same
   header shape. CSV only; do not pull in `exceljs` for this.

---

## 6. Bugs found in the current `reports/page.tsx` — fix these

These are real defects, not style. Each is independently verifiable; WP-1 covers them.

**6.1 — Revenue is bucketed by day in UTC, not company time.**
`page.tsx:382` buckets with `new Date(row.paidAt).toISOString().slice(0, 10)`. The dashboard
does this correctly with `to_char(... AT TIME ZONE ${range.timeZone}, 'YYYY-MM-DD')`
(`queries.ts` `getRevenueSeries`). Evening payments land on the wrong day in Reports. This
is the same class of bug as commit `4b1eb72` "Fix dashboard revenue series grouping".
→ Move to a SQL aggregate with `AT TIME ZONE`.

**6.2 — The headline overdue balance is capped at 8 invoices.**
`overdueInvoiceRows` is `.limit(8)` (`page.tsx:304`), and `overdueInvoiceTotal`
(`page.tsx:392`) sums that limited list. `Balance due {money(overdueInvoiceTotal)}` therefore
understates the real figure whenever more than eight invoices are overdue. The dashboard's
`getCashToCollect` does this right — a separate `sum(greatest(total - paid, 0))` aggregate
alongside the limited display list.
→ Add a separate SUM query; keep `.limit()` for the display rows only. Also reuse
`overdueSqlCondition()` from `src/lib/invoices/overdue.ts` instead of the page's inline
14-day date arithmetic, so both pages define "overdue" identically.

**6.3 — `jobsAwaitingInvoicingCount` measures the wrong thing.**
`page.tsx:397` counts completed jobs where the *customer* does not appear in
`overdueInvoiceRows` — a list that is both capped at 8 and restricted to `status='sent'`
invoices older than 14 days. A completed job whose customer happens to have one overdue
invoice is counted as invoiced; a job invoiced yesterday is counted as awaiting invoicing.
The dashboard has the correct predicate already:
`not exists (select 1 from invoices i where i.job_id = jobs.id and i.company_id = ...)`.
→ Reuse the dashboard's predicate. Note this is a *third* source of the count disagreement
`HANDOFF.md` already tracks between the dashboard and the Jobs page.

**6.4 — `declinedCardCount` can effectively never fire.**
`page.tsx:414-420` substring-matches `customers.paymentMethods` for `declin`/`fail`/
`invalid`. `paymentMethods` is `text[]` holding method labels (`card`, `cash`, …), not a
processor status. The metric renders 0 permanently and implies a card-health signal the app
does not have.
→ Delete the metric and its "Declined cards" tile. Do not replace it with a guess.

**6.5 — "Recent reschedules" is really "recently edited".**
`page.tsx:404` flags any scheduled job where `updatedAt - createdAt > 60_000`. Changing a
note re-flags the customer as rescheduled.
→ Either rename the label to "Recently edited jobs", or drop it. Prefer dropping — an
inaccurate retention signal is worse than no signal. Flag your choice in the commit message.

**6.6 — Full customer-table scan filtered in JS.**
`page.tsx:276-288` selects every non-archived customer with no limit, then computes five
separate counts client-side (`missingPaymentCount`, `incompleteNotesCount`, …) and slices to
8 for display. `HANDOFF.md` already flags this pattern for the `customers`/`invoices`/
`sync-issues` list pages; Reports has the same shape.
→ Replace with `count(*) filter (where ...)` aggregates plus one `.limit(8)` display query,
mirroring `getExceptionCounts`.

**6.7 — `webhook_events` is queried with no company scope. User decision required — do not
"fix" this yourself.**
`page.tsx:319-331` runs `db.select().from(webhookEvents).orderBy(...).limit(8)` with **no
`where` clause**, violating the `AGENTS.md` rule that every query preserve company scoping.
It is not fixable by adding a filter: `webhook_events` (`schema.ts:519`) has **no
`company_id` column at all** — it is a global table. Practical impact today is nil because
the database holds one company, but it is a latent multi-tenant leak.

The redesign removes the raw webhook inbox from Reports (§5.6), which resolves it for this
page without touching the schema — **do that, and stop there.** Whether `webhook_events`
should gain a `company_id` (and how existing rows would be backfilled from their payloads)
is a schema decision for the user. Leave a note in `DECISIONS.md`; do not open a migration.

---

## 7. Work packages

Each is one commit. Do them in order — WP-1 through WP-3 are prerequisites for the UI work,
and WP-2's primitives are what WP-4 and WP-5 consume.

### WP-0 — Range presets
`src/lib/dashboard/range.ts`
Add `last_90_days` and `this_month` to `resolveRange` (+ labels). Pure addition; existing
callers unaffected.
**Accept:** `resolveRange({preset:'this_month'}, tz)` returns month-start → today with the
correct `prevFrom`/`prevTo`; existing presets unchanged.

### WP-1 — Reports query module + the six bug fixes
`src/lib/reports/queries.ts` (new), `src/lib/reports/types.ts` (new),
`src/app/(app)/reports/page.tsx` (edit)
Move every inline query out of the page. Fix §6.1–§6.6. Remove the raw webhook inbox per
§6.7. **Do not restyle anything in this package** — the page should look nearly identical
and behave correctly, so the data fix is reviewable on its own.
**Accept:** `reports/page.tsx` contains no `db.select(` calls; the overdue balance matches
the dashboard's Cash-to-Collect total for the same company; daily revenue buckets match
`getRevenueSeries` for an overlapping range; `npm run verify` passes.

### WP-2 — Chart + UI primitives
`src/components/charts/{bar-series,donut,funnel,progress-row}.tsx` (new),
`src/components/ui/{kpi-tile,delta-chip,insight-card,segmented-control}.tsx` (new),
`src/app/globals.css` (edit — keyframes per §3.5)
Nothing imports these yet.
**Accept:** every primitive renders standalone with an empty dataset without throwing;
`sr-only` summary present on each chart; no hex literals; only `segmented-control.tsx`
carries `"use client"`.

### WP-3 — Motion cleanup
`src/app/(app)/reports/reports-motion.tsx` (delete),
`src/app/(app)/reports/page.tsx` (edit — remove the wrapper and `data-report-reveal`)
**Accept:** Reports animates in exactly once; reduced-motion emulation shows all content
immediately with no stuck-invisible elements.

### WP-4 — Dashboard redesign
`src/app/(app)/dashboard/page.tsx`, `pulse-tiles.tsx`, `todays-run.tsx`,
`exception-strip.tsx`, `cash-to-collect.tsx`, `crew-capacity.tsx` (all edit + reformat),
`revenue-job-volume.tsx`, `quote-pipeline.tsx`, `conversion-trends.tsx`,
`insights-grid.tsx`, `range-toolbar.tsx` (new),
`date-range-controls.tsx`, `revenue-vs-target.tsx` (delete once superseded),
`src/lib/dashboard/queries.ts` + `types.ts` (extend: per-day job counts, quote-pipeline
stages, avg sales cycle, `customers.source` breakdown)
Structure per §4.
**Accept:** matches §4 top-to-bottom; every file reformatted per constraint 1; all sections
stream behind `Suspense`; no fabricated metrics; keyboard-navigable at 390px.

### WP-5 — Reports redesign
`src/app/(app)/reports/page.tsx` (rewrite), `report-builder.tsx`, `kpi-row.tsx`,
`revenue-vs-bookings.tsx`, `conversion-funnel.tsx`, `area-performance.tsx` (new),
`src/lib/reports/queries.ts` (extend)
Structure per §5.
**Accept:** every number appears exactly once on the page; date range and area filters drive
the whole page via URL params; each section streams behind `Suspense`; deletions in §5.6
done.

### WP-6 — Export route, footer, cleanup
`src/app/api/reports/export/route.ts` (new), `src/app/(app)/app-footer.tsx` (new),
`src/app/(app)/layout.tsx` (edit), `src/components/ui/stat-tile.tsx` (delete if unreferenced)
**Accept:** export returns a valid CSV honouring the current filters, `requireAdmin()`
enforced, non-admin gets 401/403; footer renders the current year on every `(app)` route;
`grep -rn "stat-tile"` returns nothing before deleting it.

---

## 8. Things to check with the user rather than guess

1. **Conversion-rate target.** The mockup shows `Target: 70.0%`. Only
   `revenueTargetCents` exists in `companies.settings`. Add a `conversionTargetPct` setting,
   or omit the target line? Omit by default until answered.
2. **`webhook_events` tenancy** (§6.7) — schema decision, user's call.
3. **Reschedule metric** (§6.5) — rename or drop.
4. **Ratings.** The 4th dashboard KPI and the Cleaner Rating column both assume a review
   system that does not exist. Substitutions are specified in §2.2; if the user actually
   wants ratings, that is a separate feature with its own schema, not part of this redesign.

---

## 9. Note for whoever reviews the diff

The pre-existing single-line formatting means `git diff` on WP-4 will show whole-file
replacements for six dashboard files. That is expected and is the point — review those
files by reading the new version rather than the diff hunks.
