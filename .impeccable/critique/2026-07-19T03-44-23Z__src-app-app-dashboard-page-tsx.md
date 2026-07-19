---
target: dashboard
total_score: 20
p0_count: 0
p1_count: 4
timestamp: 2026-07-19T03-44-23Z
slug: src-app-app-dashboard-page-tsx
---
## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|---|---:|---|
| 1 | Visibility of System Status | 2/4 | No loading, stale-data, sync freshness, or action confirmation states. |
| 2 | Match System / Real World | 3/4 | Schedule, routes, invoices, and house notes fit the domain; technical phrases such as “KPI window” do not. |
| 3 | User Control and Freedom | 2/4 | Date reset and technician selection exist, but filter scope and recovery are unclear. |
| 4 | Consistency and Standards | 3/4 | Shared visual language is strong, but nested cards and status treatments add density. |
| 5 | Error Prevention | 2/4 | Date inputs help, but invalid ranges, stale data, missing addresses, and partial sync states lack guardrails. |
| 6 | Recognition Rather Than Recall | 3/4 | Labels are visible, but downstream links lack urgency and context. |
| 7 | Flexibility and Efficiency of Use | 1/4 | No keyboard shortcuts, bulk actions, quick assignment, or power-user path. |
| 8 | Aesthetic and Minimalist Design | 2/4 | Calm palette, but six KPIs plus schedule, attention, finance, inventory, routes, and notes create a long card-heavy surface. |
| 9 | Error Recognition and Recovery | 1/4 | Counts rarely explain causes, freshness, ownership, or the next corrective action. |
| 10 | Help and Documentation | 1/4 | No contextual help for resolving operational issues. |
| **Total** | | **20/40** | **Acceptable; significant UX prioritization is needed.** |

## Anti-Patterns Verdict

**LLM assessment:** Moderate AI-slop risk. The palette is calm and the dashboard avoids the loudest SaaS clichés, but six identical KPI cards, repeated rounded nested cards, decorative gradients, a patterned static-map fallback, and an overstuffed “dashboard completeness” surface still feel generated rather than intentionally operational. The “Operational notes” panel exposes implementation-stage commentary inside the product.

**Deterministic scan:** 12 advisory findings, 0 errors. Ten undocumented colors appear in `src/app/globals.css` at lines 154, 161–163, 167, 181, 185, 196, and 200; two undocumented `0.8rem` font sizes appear at lines 173 and 189. Most are intentional control-state ramps. The meaningful design issues are the gradient button stops, wide card shadows paired with borders, and the dashboard’s use of colored attention dots. The detector also found missing labels for the date inputs at `src/app/(app)/dashboard/page.tsx` lines 331–333.

Browser inspection was attempted in a fresh tab, but `localhost:3000/dashboard` timed out. No reliable user-visible overlay is available.

## Overall Impression

The dashboard has a solid operational information architecture and a credible CleanOps visual language, but it currently tries to be an executive dashboard, dispatch board, finance snapshot, inventory view, route preview, and product status page at once. The biggest opportunity is to make it a true control room: surface today’s risks first, provide enough context to resolve them, and move secondary business metrics below the operational work.

## What's Working

1. The information architecture reflects real cleaning-company operations: schedule, unassigned work, missing hours, invoicing, collections, sync failures, and supplies.
2. Text-based navigation, active states, `aria-current`, and responsive shell structure make the workspace discoverable.
3. The schedule table is semantically structured, horizontally scrollable, and links customer names directly to details.

## Priority Issues

### [P1] Operational priority is inverted

The page leads with six KPI cards before today’s schedule and attention items. Office staff need “What will break today?” before “How many leads and active clients do we have?” Reorder the dashboard around today’s exceptions and schedule, assignment risk, cash/collections, then secondary KPIs.

### [P1] Date filter scope is ambiguous

The copy says “Filter the board by date range,” but the range only affects some KPI queries. Schedule, route preview, overdue invoices, weekly revenue, sync issues, and inventory use different windows or no filter. Rename it to “KPI date range” or show each section’s date context and apply the filter consistently.

### [P1] Route preview is duplicated

The dashboard wraps a route preview that already contains a card, map/static preview, stats, and a second stop list. “Stops,” “First stop,” and “Last stop” repeat. Choose one compact representation: map plus stop list, or route list plus one summary row.

### [P1] Exceptions are counts, not recoverable queues

Unassigned jobs, missing hours, awaiting invoicing, and failed syncs show a number but not which record is urgent, when it occurred, who owns it, whether it is fresh, or what action resolves it. Convert the attention block into prioritized work queues with an owner, timestamp, and direct action.

### [P2] Mobile preserves desktop density

The schedule table uses a 760px minimum width and becomes a horizontal-scroll table on narrow screens. Keep the table for office desktop, but render mobile schedule rows as stacked job summaries with time, customer, assignment, status, and one primary action.

### [P2] Accessibility and semantic clarity need a dedicated pass

Attention indicators should state the condition in text, not rely on a dot. Revenue bars need day labels, values, and a text alternative. Date inputs need associated labels. Add loading, stale-data, and error states, and make route stop order explicit to assistive technology.

## Persona Red Flags

### Alex — impatient power user

No keyboard shortcuts, bulk assignment, bulk invoicing, multi-select, or “show unresolved only” path. Important remediation opens several separate screens.

### Sam — keyboard/screen-reader user

The attention grid uses a color dot and count without explicit health wording. The revenue visualization is not meaningfully explained non-visually. Loading, error, and stale-data announcements are missing. Small uppercase labels may become hard to read at zoom.

### CEO / office manager

KPIs are present but not tied to a decision. Conversion rate lacks denominator context. Weekly revenue is visually present but not trend-readable. The dashboard ends with internal beta/backend commentary rather than a concise executive summary or next-action queue.

## Minor Observations

- “Good morning” is static; it could surface urgency when exceptions exist.
- Status terminology should be standardized across jobs, invoices, payroll, and syncs.
- Overdue invoices need “3 of N” context.
- Inventory should indicate whether more items exist beyond the visible five.
- The static route fallback can look like a map without geographic meaning.
- App-wide reveal animation targets every eyebrow and card, reinforcing the repeated-card rhythm.

## Questions to Consider

- If the dashboard can answer one question in ten seconds, should it be “What needs intervention today?”
- Does “What this board is ready for” belong in a product roadmap rather than the operator dashboard?
- Are six KPI cards genuinely used daily, or are they here because dashboards conventionally start with metrics?
- Would an office manager trust a failed-sync count without a timestamp, affected records, owner, and recovery action?
