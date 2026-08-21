---
target: Quotes page
total_score: 26
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
timestamp: 2026-08-21T08-11-57Z
slug: src-app-app-quotes-page-tsx
---
# Quotes page critique

## Heuristic scores

| Heuristic | Score | Key issue |
|---|---:|---|
| Visibility of system status | 3/4 | Status pills and KPI counts are visible, but active filter state is understated. |
| Match system / real world | 3/4 | Sales workflow is recognizable; raw service keys and GHL jargon leak into the UI. |
| User control and freedom | 3/4 | Search, status filtering, and clear are present; no pagination or bulk controls. |
| Consistency and standards | 3/4 | Shared tokens are used well, but row action styling is bespoke. |
| Error prevention | 2/4 | Large unpaginated result sets and ambiguous status filtering can cause missed records. |
| Recognition rather than recall | 3/4 | KPI tiles and status pills help scanning; service labels remain cryptic. |
| Flexibility and efficiency | 2/4 | No pagination, saved views, bulk send/archive, or keyboard-efficient row actions. |
| Aesthetic and minimalist design | 3/4 | Calm and legible, but the eight-column table is dense and horizontally dependent. |
| Error recovery | 2/4 | Empty state exists, but loading/failure and operational next steps are thin. |
| Help and documentation | 2/4 | “GHL prospect” assumes internal knowledge and offers no contextual explanation. |

Total: 26/40.

## Priority issues

1. **[P1] The table does not scale operationally.** It renders every matching quote into an 1080px minimum-width table, creating horizontal scrolling and no pagination. Add server-side pagination, a compact responsive row/card mode, and preserve the most important columns on narrow screens.
2. **[P1] Quote status is visible but not actionable enough.** “Accepted — needs scheduling” is useful, but there is no prominent next-step treatment in the row beyond a button label. Add a clear “Next action” column or status-specific primary action and visually mark the active KPI filter.
3. **[P2] Service names are raw database values.** `first_time`, `move_in_out`, and similar strings reduce scan speed. Use the same human-readable service-label map as the proposal and quote detail page.
4. **[P2] Row actions compete equally.** “Open,” “Proposal,” and “Call and schedule” sit together as similarly weighted bordered buttons. Give one contextual primary action and move secondary actions into a compact menu.
5. **[P2] The KPI icon logic is broken.** The accepted tile checks `label === "Accepted"`, but its actual label is “Accepted — needs scheduling,” so every tile renders the generic icon. Use an explicit icon/value mapping.

## Personas

- **Alex, power user:** no pagination, bulk actions, saved filters, or keyboard path; reviewing a sales queue becomes repetitive row-by-row work.
- **Sam, accessibility-dependent user:** the table has no explicit caption/summary and the search field relies on placeholder text as its primary cue; responsive horizontal scrolling will be difficult at zoom.
- **Riley, stress tester:** long customer names, service labels, and large quote volumes are likely to expose row overflow and slow the unpaginated page.

## Minor observations

- “Showing N quotes” is a count of loaded rows, not the total result count.
- Search only documents “customer or quote,” while the implementation also searches the UUID; expose a readable quote number instead.
- The empty state copy is internal (“GHL prospect”) and does not tell staff what to do next beyond creating a quote.

## Questions

- Is the primary job of this page triage, or is it a searchable archive? The layout currently tries to be both.
- Should every quote have one explicit next action: send, follow up, schedule, or view?
