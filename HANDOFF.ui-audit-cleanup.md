# Handoff → Codex: UI audit cleanup (non-dashboard)

Author: Claude Code (planning only — no code written).
Date: 2026-07-26.
Source: `UI-AUDIT.md` (same directory). Read it for the reasoning behind each item.

Read `AGENTS.md` and `HANDOFF.md` first. This document does not supersede them.

**This runs in the `cleanops-codex` worktree (`C:/Users/kbeni/Downloads/cleanops-codex`,
branch `codex/work`) — NOT in `cleanops-v1`.** A separate Codex task is mid-flight in
the main tree on `HANDOFF.dashboard-reports-redesign.md` and has uncommitted changes
there. Do not touch the main tree.

---

## 0. Execution contract

**Goal.** Fix two real bugs, delete four blocks of dead UI, and land one shared
`<StatusPill>` that replaces four divergent copies of the same status-color map. No
new runtime dependencies, no schema changes, no visual redesign.

**In scope.** Only these files:

```
src/app/(app)/calendar/page.tsx
src/app/(app)/calendar/week-board.tsx        (WP-1 — hardcoded grid-cols-5)
src/app/(app)/calendar/staff-board.tsx       (WP-3d — owns the activities feed)
src/app/(app)/quotes/[quoteId]/page.tsx
src/app/(app)/quotes/page.tsx
src/app/(app)/jobs/page.tsx
src/app/(app)/customers/page.tsx
src/app/(app)/customers/[customerId]/page.tsx
src/app/(app)/employees/[employeeId]/page.tsx
src/components/ui/status-pill.tsx            (new)
```

**Out of scope — do not touch, another Codex task owns these right now:**

```
src/app/(app)/dashboard/**      src/app/(app)/reports/**
src/lib/dashboard/**            src/lib/reports/**
src/components/charts/**        src/app/globals.css
src/components/ui/{kpi-tile,delta-chip,insight-card,segmented-control}.tsx
```

Also out of scope: the Dashboard rebuild (owned by WP-4 of the dashboard/reports
handoff), schema migrations, Square/GHL work, and the `customers`/`invoices`/
`sync-issues` pagination rewrite tracked in `HANDOFF.md`.

**Hard constraints.**

1. **No `globals.css` edits.** The other task owns that file. If a change seems to
   need a CSS token, use Tailwind classes instead and note it in the commit body.
   The radius-scale unification from `UI-AUDIT.md` is deliberately **deferred** for
   this reason — do not attempt it.
2. **No new dependencies.**
3. **Company scoping preserved on every query** — `eq(x.companyId, user.companyId)`.
   `AGENTS.md` rule. Do not weaken any existing `where` clause while refactoring.
4. **Behaviour-preserving unless a WP says otherwise.** WP-1 and WP-2 change
   behaviour by design; WP-3 through WP-5 must not change what the user sees beyond
   the specific removals named.
5. **Shared worktree hygiene.** Stage explicit paths only, never `git add -A` /
   `git add .`. One work package per commit. Re-check `git status` before each commit.
6. **No fabricated data.** Where a block is deleted for having no backing data, delete
   it — do not substitute placeholder numbers.

**Verification (every work package).**

```
npm run verify          # check:env + lint + typecheck + build
```

Plus, per `AGENTS.md`: any quote change must be verified against **both** the internal
quote builder and the unauthenticated public proposal (`/quote/[token]`).

---

## 1. WP-1 — Calendar week view shows Mon–Fri only  (BUG)

`src/app/(app)/calendar/page.tsx:100`

```ts
const weekDays = Array.from({ length: 5 }, (_, index) => addDays(weekStart, index + 1));
```

Five days starting at `weekStart + 1`. Jobs scheduled Saturday or Sunday are silently
invisible in week view — the query range in `start`/`end` (lines 105-106) is derived
from `days`, so the rows are never fetched. For a cleaning business weekend work is
normal, so this is data loss at the UI layer, not a styling choice.

Change to a full 7-day week starting at `weekStart`. Check every downstream consumer:

- `weekDays[0]` / `weekDays[4]` in the `dateLabel` ternary (line 169) — the `[4]` is
  now the wrong end-of-week index.
- `<WeekBoard days={...}>` (line 181) and the `WeekBoard` component's column layout.
- `src/app/(app)/calendar/week-board.tsx:18` hardcodes `grid-cols-5` **and**
  `min-w-[1180px]`. Both need to change together — seven columns at the current
  min-width will crush each column to ~168px. Widen proportionally (or move to an
  explicit per-column min-width) so a day column stays readable, and keep the
  container horizontally scrollable rather than letting the page body scroll.

**Accept:** a job scheduled on a Saturday appears in week view; the week label reads
the correct first→last date; `WeekBoard` renders 7 columns without overflow at 1440px
and remains scrollable at 390px; `npm run verify` passes.

---

## 2. WP-2 — Quote detail: dead button + duplicated data  (BUG)

`src/app/(app)/quotes/[quoteId]/page.tsx`

**2a. Permanently-disabled "Convert as job" button (line 212).**
It renders when `status !== "accepted"` and is `disabled={!convertDate}`. But the
`convertDate` input only exists inside the sidebar card at line 325, which renders
only when `status === "accepted"`. The two conditions are mutually exclusive, so on
every non-accepted quote the button is visible, greyed, and impossible to enable.

Pick one and say which in the commit body:
- **(preferred)** move the start-date input out of the `accepted`-only card so it is
  available whenever a convert action is offered; or
- remove the header button for non-accepted quotes entirely.

Do not just hide the disabled state — the underlying contradiction has to go.

**2b. View-count rendered twice.** Header chips at lines 193-200 ("Viewed N times",
"Last viewed …") duplicate the "Quote state" card fields at lines 355-364. Keep one.
The card is the better home; the header chips are the ones to delete.

**Accept:** on a `draft` / `sent` / `viewed` quote there is no disabled-with-no-path
control; converting still works end-to-end from an accepted quote; view count and last
viewed each appear exactly once; the public proposal at `/quote/[token]` is unchanged
and still renders for a valid and an invalid token.

---

## 3. WP-3 — Delete dead UI

Four independent removals. One commit is fine; keep them as separate hunks.

**3a. Hidden jobs sidebar.** `src/app/(app)/jobs/page.tsx:448` —
`<aside className="hidden">` wrapping four `SideCard`s (~115 lines). It never renders.
Delete the `<aside>` and then the now-unused computations that only fed it:
`selectedJob`, `selectedAssignments`, `selectedMinutes`, `selectedInvoice`,
`availableToday` (lines 255-259), plus `SideCard` / `StatRow` (lines 108-135) and the
`jobId` search param if nothing else reads it. Verify `unassignedRows` and
`missingHoursCount` are still used by the filter pills before removing anything they
touch.

**3b. Commented-out legacy employee profile.**
`src/app/(app)/employees/[employeeId]/page.tsx` lines ~287-630 — a block comment
labelled *"Legacy expanded profile retained below while the compact read-first profile
is active."* `CompactProfile` (returned at line 264) is the live layout. Delete the
commented block. Then remove any imports/helpers left unused by its removal.

**3c. Customer-profile placeholder photo section.**
`src/app/(app)/customers/[customerId]/page.tsx:821-833` — three `<PhotoTile>`s with the
caption *"Photo upload and storage can be connected later. This block is here so the UI
already tells the story."* There is no upload backend. Delete the section, the
`PhotoTile` component, and the dead "View all photos" button.

**3d. Calendar activity feed.** `src/app/(app)/calendar/page.tsx:167` — `activities` is
derived from `updatedAt` and produces strings like "Schedule updated — X". No action
hangs off it. Delete the `activities` computation, the `CalendarActivity` type
(line 70), and the `activities` prop on `<StaffBoard>` (line 182) plus its handling
inside `StaffBoard`.

**Accept:** no `hidden` wrapper remains in `jobs/page.tsx`; `employees/[employeeId]/page.tsx`
drops ~340 lines; no reference to `PhotoTile`, `CalendarActivity`, or `activities`
survives; lint reports no unused vars; every affected page renders with real data;
`npm run verify` passes.

---

## 4. WP-4 — Shared `<StatusPill>`

`STATUS_STYLES` is defined four times with **different palettes** for overlapping
states:

| File | Line |
|---|---|
| `src/app/(app)/jobs/page.tsx` | 26 |
| `src/app/(app)/quotes/page.tsx` | 18 |
| `src/app/(app)/customers/page.tsx` | 22 |
| `src/app/(app)/customers/[customerId]/page.tsx` | (`STATUS_STYLES` + `STATUS_OPTIONS`) |

Create `src/components/ui/status-pill.tsx` exporting a single component that takes a
domain and a status:

```tsx
<StatusPill domain="job" status={row.status} />
<StatusPill domain="quote" status={quote.status} />
<StatusPill domain="customer" status={row.status} />
```

Keep the three label maps and one shared tone scale (neutral / info / warning /
success / danger / muted). Reconcile the palettes onto that scale — where two files
currently disagree for the same semantic tone, pick one and apply it everywhere.
Replace all four call sites, including the local `Pill` in `jobs/page.tsx:104`.

Do **not** put tones in `globals.css` (constraint 1) — Tailwind classes inside the
component.

**Accept:** `STATUS_STYLES` appears exactly once in the codebase; every status badge
across jobs / quotes / customers / customer profile renders with the same tone for the
same semantic state; no visual regression in the four pages beyond intentional palette
reconciliation; `npm run verify` passes.

---

## 5. WP-5 — Customers table row links (a11y)

`src/app/(app)/customers/page.tsx:442-495` — each row wraps **six separate `<Link>`s**
pointing at the same `/customers/{id}`, one per `<td>`. A screen reader announces six
identical links per row; at `PAGE_SIZE = 25` that's 150 links on a page.

Collapse to one accessible target per row. Either one `<Link>` per row with the cells
inside it, or a row-level click handler plus a single visible link in the name cell.
Keep the full row clickable and keep keyboard focus working — do not regress to
"only the name is clickable" without a focus ring on the row.

**Accept:** one link per row in the accessibility tree; the whole row is still
clickable by mouse; the row is reachable and activatable by keyboard with a visible
focus indicator; `npm run verify` passes.

---

## 6. Not in this handoff — deliberately

- **Dashboard rebuild.** Owned by WP-4 of `HANDOFF.dashboard-reports-redesign.md`.
  `UI-AUDIT.md`'s Dashboard finding (unstyled `pulse-tiles` / `todays-run` /
  `exception-strip`, and `ExceptionStrip` rendering last) is already covered there.
- **Radius scale unification** (5 coexisting radii) — blocked on `globals.css`, which
  the other task owns. Revisit after it lands.
- **Hardcoded gradients** — `jobs/page.tsx:452`,
  `customers/[customerId]/page.tsx:517` and `:634`. Left alone for now: they should be
  replaced with `DESIGN.md` tokens, which likely means a `globals.css` edit. Revisit
  with the radius work.
- **Date-formatter unification** — `customers/page.tsx:107` has its own `Intl`
  formatter instead of `formatDisplayDate`; quote detail uses raw `toLocaleString()`.
  Deferred to keep this package behaviour-preserving; it changes what users read.
- **Customer profile view/edit divergence** and the **"Retention" metric**
  (`customers/page.tsx:300`, flagged as invented in its own code comment). Both are
  product decisions for the user, not mechanical fixes.

---

## 7. Order and commits

Run in order; each is one commit, each passes `npm run verify` before the next:

1. WP-1 calendar week (bug)
2. WP-2 quote detail (bug)
3. WP-3 dead UI removal
4. WP-4 StatusPill
5. WP-5 customers row links

Report back per work package: the commit SHA, the files staged, and anything you had
to decide that this document did not specify. If a WP turns out to conflict with the
main tree's in-flight work, stop and say so rather than working around it.
