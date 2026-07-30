# UI/UX Audit — 2026-07-26

> **Status: partly implemented and partly corrected.** Five findings were fixed on
> branch `codex/work` in the `cleanops-codex` worktree — see
> `HANDOFF.ui-audit-followup.md` §1 for the commits and for remaining work.
> Three claims below were **wrong** and are corrected inline, marked
> **CORRECTION**. This file was written against an older `main`.

Structural audit of the nine admin pages, done by reading page markup, component
usage, and hierarchy. **Not a visual audit** — could not log in to render
(no `BROWSER_ADMIN_USERNAME` / `BROWSER_ADMIN_PASSWORD` in `.env.local`, Chrome
extension offline). Spacing, color contrast, and alignment still need eyes on the
rendered pages. Every finding below is verifiable from code.

To re-run the visual half: set `BROWSER_ADMIN_USERNAME` / `BROWSER_ADMIN_PASSWORD`
in `.env.local`, then Playwright can drive `/login` and screenshot each route.

---

## Ratings

| Page | Score | Verdict |
|---|---|---|
| Proposal (`/quote/[token]`) | **8** | Best page. Real hierarchy, sticky summary, committed CTA. |
| Calendar | **7.5** | Strong IA (staff/week/month + persisted state). Two real bugs. |
| Customers list | **7.5** | Best list page. Good "needs attention" nudge, real pagination. |
| Quote detail | **7** | Solid tier grid, but one dead control and duplicated data. |
| Employees list | **7** | Clean and thin. Nothing wrong, nothing sharp. |
| Employee profile | **6.5** | Decent compact layout, ~360 lines of commented-out legacy below. |
| Jobs | **6** | Good table buried under three stacked headers + a hidden sidebar. |
| Customer profile | **5.5** | Two entirely different layouts for view vs edit. Placeholder UI shipping. |
| Dashboard | **4** | Half the page is unstyled placeholder markup. |

Payroll and invoices not audited — untouched pending Square/Gusto API approval.

---

## Top 3 findings

### 1. Dashboard is half-built and it's the landing page

`src/app/(app)/dashboard/pulse-tiles.tsx`, `todays-run.tsx`, and
`exception-strip.tsx` are one-line files rendering raw text:

```tsx
<div className="co-card p-4">Jobs today: {m.jobsToday.scheduled + m.jobsToday.completed}</div>
```

No number/label hierarchy, no type scale — "Jobs today: 7" as body copy in a box.
Meanwhile `revenue-vs-target.tsx`, `cash-to-collect.tsx`, and `crew-capacity.tsx`
in the same folder are properly built (headers, dividers, footer links). The page
contradicts itself visually top to bottom.

Ordering problem: `ExceptionStrip` — the only section listing things that need
action — renders **last** (`dashboard/page.tsx:32`), below six analytical sections.

**Fix:** style the three placeholder tiles to match the built ones; move
`ExceptionStrip` above `RevenueVsTarget`.

### 2. `jobs/page.tsx:448` renders a `hidden` sidebar  (FIXED, `02770bb`)

Four `SideCard`s (job detail, team availability, unassigned queue, weekly stats),
~115 lines, inside `<aside className="hidden">`. Never displays, but the page still
computes `selectedJob`, `selectedAssignments`, `selectedMinutes`, `selectedInvoice`,
and `availableToday` (`jobs/page.tsx:255-259`) to feed it.

**Fix:** restore it or delete it plus its dead computations.

### 3. `quotes/[quoteId]/page.tsx:212` is a permanently dead button  (FIXED, `4edabea`)

"Convert as job" renders when `status !== "accepted"` and is `disabled={!convertDate}`.
But the `convertDate` input only exists in the sidebar card at line 325, which only
renders when `status === "accepted"`. For every non-accepted quote the button is
visible, greyed, unclickable, unexplained.

Same page: "Viewed N times / Last viewed" appears **twice** — header chips
(lines 193-200) and the "Quote state" card (lines 355-364).

---

## Cross-cutting — why it reads as "assembled from mockups"

This is the real problem. It is not per-page.

- **Five card radii, no scale.** `co-card`, `rounded-2xl`, `rounded-[24px]`,
  `rounded-[28px]`, `rounded-[32px]` all coexist.
- **Three bespoke hardcoded gradients**, none from `DESIGN.md`:
  - `linear-gradient(135deg,#f5f7f1,#ffffff)` — `jobs/page.tsx:452`
  - `linear-gradient(135deg,#f8fbf5,#eef5eb)` — `customers/[customerId]/page.tsx:517`
  - `linear-gradient(135deg,#eef5eb,#f8faf5)` — `customers/[customerId]/page.tsx:634`

  This is the clearest fingerprint of pasted Stitch output.
- **`STATUS_STYLES` redefined 4×** with different palettes.
  **CORRECTION (FIXED, `717706a`):** there were **seven** copies — jobs, jobs/[jobId],
  quotes, customers, customers/[customerId], invoices, calendar — and they did
  **not** disagree; all seven mapped onto the same six-tone scale. So this was
  pure duplication, not divergence, and consolidating into
  `src/components/ui/status-pill.tsx` re-coloured nothing.
- **Date formatting inconsistent** despite `HANDOFF.md` declaring MM/DD/YY via
  `formatDisplayDate`: `customers/page.tsx:107` has its own `Intl` formatter,
  quote detail uses raw `toLocaleString()`, the jobs sidebar prints raw ISO.
- **Empty states** use three paddings: `p-12`, `px-6 py-16`, `py-4`.

---

## Per-page notes

### Dashboard — 4
See finding #1. Eight stacked sections with no priority signal.

### Calendar — 7.5
Genuinely good: staff/day/week/month views, cookie-persisted view state
(`CALENDAR_STATE_COOKIE`), filter bar, prev/today/next.

- **Bug (FIXED, `36914df`):** week view is hardcoded to 5 days — `calendar/page.tsx:100`
  (`Array.from({length: 5})`, `addDays(weekStart, index + 1)`).
  **CORRECTION:** this rendered **Tue–Sat**, not Mon–Fri. `startOfWeek()` returns
  Monday, so the `+ 1` offset dropped Monday as well as the weekend — and since
  the query range derives from the day list, those rows were never fetched at all.
- **Vanity pattern:** the `activities` feed (`calendar/page.tsx:167`) is derived from
  `updatedAt` and produces "Schedule updated — X". Tells nobody anything, no action
  attached. Candidate for deletion.

### Jobs — 6
Strong table, tabs (Active/Pending/History), real pagination, good filter pills
with counts.

- Hidden sidebar — see finding #2.
- **Three stacked headers before the table:** page header with "Operations Hub" +
  2 `MetricCard`s (line 263), then a nav bar with more controls (line 275), then a
  card header with a *third* title "Service operations" and *another* description
  (line 296).
- `MetricCard` uses `text-4xl` for two low-value numbers while the table is
  `text-sm` — visual weight is inverted vs. importance.
- Known: `unassigned` / `missingHours` filters apply *after* pagination
  (lines 252-254), so counts can disagree with the dashboard. Already tracked in
  `HANDOFF.md`.

### Customers list — 7.5
Best-structured list page. Archive-eligible nudge banner (line 316) is a genuine
"needs attention" pattern. Real SQL pagination.

- **Accessibility:** each row wraps *six separate `<Link>`s* to the same URL, one
  per cell (lines 442-495). A screen reader announces 6 identical links per row;
  25 rows = 150 links. Make the row clickable once.
- **Vanity metric:** "Retention" (line 300). The code comment itself says *"No
  precedent for this metric exists anywhere else in the app"* and flags it as most
  likely to need revision. Cut or define it.
- Filter form has 6 controls in one wrap-row with no grouping (lines 367-403).

### Customer profile — 5.5
- **Two entirely different layouts**: `mode === "edit"` renders ~400 lines inline
  (line 486); `mode === "view"` renders `<CustomerViewCards>` (line 898). Divergent
  by construction.
- Edit mode **duplicates the identity block** — avatar + name in `<header>`
  (line 387) and again in the first edit card (line 491).
- Edit mode has **two save buttons** — header (line 441) and bottom (line 891).
- **Placeholder UI shipping to beta:** three `<PhotoTile>`s captioned *"Photo upload
  and storage can be connected later. This block is here so the UI already tells the
  story."* (line 828). Cut until upload exists.

### Quote detail — 7
Good tier-comparison grid. See finding #3 for the dead button and duplicated
view-count. Map uses the keyless `maps.google.com/maps?output=embed` (line 373) —
works, but fragile.

### Proposal (public) — 8
The strongest page, and notably the only customer-facing one. Sticky sidebar
(line 675), real hierarchy, committed evergreen CTA block (line 750). Only note:
786 lines in one file.

### Employees list — 7
Clean, delegates to `EmployeeDirectory`. Fine but thin — status is only
"Scheduled"/"Available" derived from today's job count (`employees/page.tsx:109`).

### Employee profile — 6.5
`CompactProfile` (rendered at line 264) is decent.

- ~360 lines of **commented-out legacy layout** below it (lines 287-630), labelled
  *"Legacy expanded profile retained below while the compact read-first profile is
  active."* Intentional, but it's dead weight — delete it or move it out.
- Destructive admin actions (set password, delete employee) share the page with
  day-to-day scheduling/PTO info. Consider separating.

---

## Recommended next work, in order

1. **Consistency pass** (mechanical, well-scoped, lifts every page):
   one `<StatusPill>`, one radius scale, one date formatter, delete the three
   hardcoded gradients in favour of `DESIGN.md` tokens.
2. **Dashboard rebuild** — style the three placeholder tiles, move `ExceptionStrip`
   to the top.
3. **Delete dead UI** — hidden jobs sidebar, commented legacy employee profile,
   customer-profile PhotoTiles, calendar activity feed.
4. **Fix the two real bugs** — calendar Mon–Fri week, quote-detail dead button.
5. Customers-list row link consolidation (a11y).

Before designing payroll/invoices: `HANDOFF.md` notes Square runs in **silent mock
mode in production** — `src/lib/square/client.ts` returns fake invoice IDs with zero
UI warning when the token is unset. Any invoice UI needs a visible sandbox indicator
before a beta user sees it.

---

## Working with Google Stitch

### Filter for judging Stitch output

> **Who is looking at this, and what do they do differently because of it?**

If you can't name the person *and* the action, it's decoration.

**Reject on sight:** vanity metrics (revenue YTD, totals with no threshold), charts
whose shape never changes, activity feeds, progress rings/streaks/gamification,
anything needing data you don't reliably capture, AI-insight cards with no defined
input.

**Take these — this is what Stitch is genuinely good for:** empty-state copy you
hadn't written; *states you hadn't modelled* (if Stitch renders a "Needs attention"
group and the schema has no such concept, that's a missing product concept, not a UI
idea — highest-value hits); grouping/ordering ideas; inline actions you forgot;
where secondary info lives.

### Prompt template

```
Screen: <name> — <who uses it, in what context>
Viewport: <mobile 390 / desktop 1440>, density: <compact/comfortable>
Design system: CleanOps (already applied)
Priority order: 1) ... 2) ... 3) ...
Data (real): <5-8 literal rows with real names/times/amounts>
States to show: <default | empty | overloaded | error>
Do NOT include: <hero banner, large timer, activity feed, ...>
Components: shadcn-style Card / Table / Badge / Sheet
```

Key techniques:
- **Load `DESIGN.md` once** via the Stitch MCP `upload_design_md` +
  `apply_design_system`, don't re-describe colors per prompt (causes drift).
- **Feed real data**, not abstract schemas — long names and a $120 next to a $285
  are what expose layout failures.
- **Ban-lists beat adjectives.** "no hero banner" works; "clean, minimal" doesn't.
- **Prompt with a situation, not a screen**: *"It's 6:45am, a cleaner just called in
  sick and she has 4 jobs today. Design the screen he opens first."*
- **One screen per prompt.** `generate_variants` for divergence, `edit_screens` for
  convergence — re-prompting from scratch re-rolls the design system.
- Treat generated code as throwaway; take the layout/IA decisions, not the CSS.

### Worked example — Dashboard

```
Screen: Admin Dashboard — first screen the owner opens at ~6:45am
Viewport: desktop 1440px, density: compact. Secondary: 390px mobile.
Design system: CleanOps (already applied)

Priority order:
1) Blockers needing action right now — unassigned jobs, jobs missing hours,
   completed-but-uninvoiced, customers missing a payment method, failed syncs
2) Today's run — the job list with assigned cleaner
3) Everything analytical (revenue vs target, crew coverage) — reference only,
   below the fold

Real data:
- Exceptions: 4 unassigned, 11 jobs without hours, 7 awaiting invoicing,
  3 payment method missing, 2 failed GHL syncs
- Today: 7 scheduled, 2 completed, 1 at risk
- Jobs: "Sarah Mitchell — 9:00, A. Nguyen-Patterson" / "Priya Raghunathan —
  12:30, unassigned" / "Bondi Junction Strata — 14:00, M. Gomez + 1"
- Cash to collect: $2,840 across 6 overdue invoices, oldest 23 days past grace

States to show: default, and a second variant with zero exceptions
Do NOT include: hero banner, gradient header, activity feed, progress rings,
  revenue-YTD tile, any card without a link to a filtered list
Components: shadcn-style Card / Table / Badge. Numbers get a type scale —
  value large, label small-caps, never "Label: value" as body text.
```

### Stitch vs. Claude

Different jobs. **Stitch is better at divergence** — surfacing a card or grouping
you wouldn't have thought of. **Claude is better at coherence** — working in the
real codebase with real tokens, enforcing one decision across all nine pages at
once. Stitch generates each screen in isolation, which is exactly why there are now
five border radii and three gradients.

Current bottleneck is coherence, not ideas. More mockups won't fix it; the
consistency pass will.
