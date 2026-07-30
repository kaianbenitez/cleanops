# Handoff → Codex: UI audit follow-up

Author: Claude Code. Date: 2026-07-26.
Supersedes `HANDOFF.ui-audit-cleanup.md`, which is now **complete** — see §1.
Source findings: `UI-AUDIT.md`.

Read `AGENTS.md` and `HANDOFF.md` first. This document does not supersede them.

**Worktree: `C:/Users/kbeni/Downloads/cleanops-codex`, branch `codex/work`.**
NOT `cleanops-v1` — a separate session works there and owns
`src/app/(app)/dashboard/**`, `src/app/(app)/reports/**`, `src/lib/dashboard/**`,
`src/lib/reports/**`, `src/components/charts/**`, `src/app/globals.css`, and
`src/components/ui/{kpi-tile,delta-chip,insight-card,segmented-control}.tsx`.
Do not touch any of those in any work package below.

---

## 1. Already done — do not redo

Five commits on `codex/work`, `npm run verify` green before each, **not yet
pushed and not yet verified at runtime**:

| Commit | Work |
|---|---|
| `36914df` | Calendar week view renders all 7 days |
| `4edabea` | Quote detail: unreachable convert button + duplicated view-count |
| `02770bb` | Dead UI removal (jobs sidebar, employee legacy block, customer PhotoTiles, calendar activity feed) |
| `717706a` | Shared `src/components/ui/status-pill.tsx`; 7 duplicate `STATUS_STYLES` maps removed |
| `bf2936e` | Customers table: one link per row instead of six |

Net −532 lines. `codex/work` was fast-forwarded to `main` before this work; it
had no commits of its own.

### Corrections to `UI-AUDIT.md` found while implementing

The audit was written against an older `main` and is wrong in three places.
Trust this section over it:

1. The calendar bug was **Tue–Sat**, not Mon–Fri. `startOfWeek()` returns Monday
   and the code did `addDays(weekStart, index + 1)`, so Monday *and* the weekend
   were missing — and because the query range derives from that day list, those
   rows were never fetched at all. Fixed.
2. `STATUS_STYLES` existed in **seven** files, not four, and the copies **did not
   disagree** — all seven mapped onto the same six-tone scale. WP-4 was pure
   de-duplication; nothing was re-coloured.
3. The `jobs/page.tsx` hidden sidebar was still present (an earlier grep of mine
   missed it). It is now gone.

---

## 2. Execution contract

**Goal.** Verify the shipped work against a running app, resolve one functional
gap the cleanup exposed, and finish two deduplication items that were
deliberately deferred.

**Hard constraints.**

1. **No `globals.css` edits.** Another session owns that file. WP-E is gated on
   it — do not start WP-E without confirming the gate in §7.
2. No new dependencies. No schema changes, no migrations, no `db:push`.
3. Company scoping preserved on every query touched: `eq(x.companyId, user.companyId)`.
4. Stage explicit paths only — never `git add -A` / `git add .`. One commit per
   work package. Re-check `git status` before each commit.
5. `npm run verify` must pass before every commit.
6. Per `AGENTS.md`: quote changes require checking **both** the internal builder
   and the unauthenticated public proposal at `/quote/[token]`.
7. **Do not delete code merely because lint calls it unused.** WP-B exists
   because that heuristic would have deleted a real feature. If something is
   unused but looks load-bearing, report it instead.

---

## 3. WP-A — Runtime verification of §1 (do this first)

Nothing in §1 has been exercised in a browser. It was verified by
build + typecheck + lint only.

**Blocked on the user** until `BROWSER_ADMIN_USERNAME` and
`BROWSER_ADMIN_PASSWORD` are set in `.env.local`. If they are absent, say so and
skip to WP-B rather than guessing at credentials.

Once available, drive the app (`npx next dev -p 3100`, or a production build per
`AGENTS.md`'s release sequence) and confirm:

- **Calendar week view**: a job scheduled on a Saturday *and* one on a Monday both
  appear. Seven columns render at 1440px without the page body scrolling
  sideways; the board itself scrolls horizontally at 390px. Week label reads the
  correct first→last date.
- **Quote detail**: on a `draft` quote, the convert card shows with a working date
  input and "Convert as job now" completes. On an `accepted` quote both convert
  paths still work. View count appears exactly once.
- **Public proposal** `/quote/[token]`: renders for a valid token, and still shows
  the expired/invalid message for a bad one.
- **Status badges**: jobs, quotes, customers, customer profile, invoices, calendar
  day board and job detail panel all render pills with readable labels — in
  particular calendar should now show "In progress", not "in_progress".
- **Customers table**: one link per row in the accessibility tree; whole row
  clickable by mouse; Tab reaches the row and shows a visible focus ring.

**Accept:** each bullet confirmed or a specific defect reported. Do not "fix"
anything from §1 without reporting what you saw first.

---

## 4. WP-B — Employee account management is not rendered  (INVESTIGATE, then fix)

`src/app/(app)/employees/[employeeId]/page.tsx`

`EmployeeAccountManagement` (~line 430) renders "Account access", change
password, and delete-employee. It is **defined but never rendered** —
`CompactProfile` is the live layout and does not include it. `TierRatesEditor`
(~line 615) is unused the same way, along with five props still threaded into
`CompactProfile` (`payTierBrackets`, `setPassword`, `deleteEmployee`,
`managementMessage`, `managementError`).

Lint reports all of these as unused. **They are not dead code.**
`tests/browser/employee-management.spec.ts:20-22` asserts those exact controls
are visible on the profile. So either the admin currently has no way to set an
employee password or delete an employee, or there is another surface providing
it.

**Do:**
1. Determine whether any route still exposes set-password and delete-employee.
   Check the API routes under `src/app/api/employees/` as well as the UI.
2. If nothing exposes them, restore `EmployeeAccountManagement` into
   `CompactProfile` — it is a real admin capability and there is a test for it.
   Place it visually separate from the day-to-day scheduling/PTO content, since
   it holds destructive actions.
3. Report on `TierRatesEditor` separately. Per `HANDOFF.md`, per-employee tiered
   rates are "optional polish, not a launch blocker" — so it may be genuinely
   unfinished rather than dropped. Do not delete it; say what you found.

**Accept:** the employee-management browser spec passes (with credentials set);
set-password and delete are reachable in the UI; no unused-var warnings remain
for props that are now genuinely used; a written answer on `TierRatesEditor`.

---

## 5. WP-C — One date formatter

`HANDOFF.md` declares the user-facing convention as **MM/DD/YY** via
`formatDisplayDate` from `src/lib/scheduling/dates.ts`. Several surfaces ignore it:

- `src/app/(app)/customers/page.tsx` — local `formatDate()` using its own `Intl`
  formatter (`month: "short", day: "numeric", year: "numeric"`).
- `src/app/(app)/quotes/[quoteId]/page.tsx` — raw `new Date(...).toLocaleString()`
  in the Quote state card.
- Sweep for other raw `toLocaleDateString` / `toLocaleString` calls on
  user-facing date-only values and convert them too.

Deliberately **not** in scope: `<input type="date">` values and anything sent to
or read from the API/database — those stay ISO `YYYY-MM-DD` per `HANDOFF.md`.
Timestamps that legitimately need a time component should use the shared
`LocalDateTime` component rather than a bare `toLocaleString()`.

This one changes text the user reads, so keep it a standalone commit.

**Accept:** no user-facing date-only string is produced by an ad-hoc formatter;
`formatDisplayDate` or `LocalDateTime` is used throughout; ISO values at
storage/API/input boundaries are untouched; `npm run verify` passes.

---

## 6. WP-D — Finish the status label dedup

`src/components/ui/status-pill.tsx` already owns label + tone per status for the
four domains. Two `STATUS_LABELS` maps survive because their filter dropdowns
need to enumerate every status:

- `src/app/(app)/quotes/page.tsx:10` (used at :116)
- `src/app/(app)/customers/page.tsx:14` (used at :300 and :363)

Add an exported enumerator to `status-pill.tsx` — e.g.
`statusOptions(domain): Array<{ value: string; label: string }>` — and use it to
build both dropdowns, plus `statusLabel("customer", row.status)` for the
`customers/page.tsx:300` call. Then delete both local maps.

Check whether `customers/[customerId]/shared.ts`'s `STATUS_OPTIONS` can also be
replaced; if it carries anything beyond value+label, leave it and say so.

**Accept:** `STATUS_LABELS` appears nowhere in `src/`; both dropdowns list the
same statuses as before in the same order; `npm run verify` passes.

---

## 7. WP-E — Radius scale and gradients  (GATED — check before starting)

Blocked on `src/app/globals.css`, which the dashboard/reports session owns.

**Gate:** only start this once that session's work is merged into `main` and no
uncommitted changes to `globals.css` exist in either worktree. Verify with
`git status` in both trees. If the gate is not clear, stop and report.

Then, per `UI-AUDIT.md`:

- **Five card radii** coexist (`co-card`, `rounded-2xl`, `rounded-[24px]`,
  `rounded-[28px]`, `rounded-[32px]`). Define a scale in `globals.css` and apply
  it. Do not invent new sizes; collapse onto the fewest that preserve the current
  look.
- **Three hardcoded gradients**, none from `DESIGN.md`:
  - `linear-gradient(135deg,#f5f7f1,#ffffff)` — `jobs/page.tsx` (in the block
    deleted by `02770bb`; confirm it is actually gone before hunting for it)
  - `linear-gradient(135deg,#f8fbf5,#eef5eb)` — `customers/[customerId]/page.tsx`
  - `linear-gradient(135deg,#eef5eb,#f8faf5)` — same file, ~100 lines later

  Replace with `DESIGN.md` tokens.

**Accept:** no hex literal gradients in `src/app/(app)/**`; one documented radius
scale; visual spot-check of jobs, customer profile, and quote detail before/after.

---

## 8. Out of scope — user decisions, not yours

Do not act on these. They are listed so you don't "helpfully" fix them:

- **Dashboard rebuild** — owned by the other session.
- **Customer profile view/edit divergence** (`mode === "edit"` renders ~400 lines
  inline; `mode === "view"` renders `CustomerViewCards`). A design decision.
- **The "Retention" metric** — `customers/page.tsx`, flagged in its own code
  comment as having no precedent in the app. Keep or cut is the user's call.
- **Square sandbox indicator.** `HANDOFF.md`: Square runs in silent mock mode in
  production and `src/lib/square/client.ts` returns fake invoice IDs when the
  token is unset. Any invoice UI needs a visible sandbox warning before a beta
  user sees it — but Square work is explicitly on hold until the client approves
  the current build.

---

## 9. Order, commits, reporting

1. WP-A verification (or report it is blocked on credentials)
2. WP-B employee account management
3. WP-C date formatter
4. WP-D label dedup
5. WP-E only if the §7 gate is clear

One commit per work package. Report per package: commit SHA, exact files staged,
and any decision the contract did not specify.

**Push nothing without asking.** The five commits in §1 are also unpushed. Per
`HANDOFF.md`'s commit/push workflow the default is to push verified work, but
nothing here has been runtime-verified yet, and the shared worktree makes a
premature push expensive to unwind.

If the contract turns out to be wrong about the code — as it was for
`week-board.tsx` last round — stop and report rather than expanding scope
silently. That was the right call then and it is the right call again.
