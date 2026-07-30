# Handoff — Calendar audit remediation (Phase 1)

Audit of `src/app/(app)/calendar/` completed 2026-07-27. This file contains the
**Phase 1** execution contracts only — the correctness bugs that block beta. Phase 2
and Phase 3 are listed at the bottom as backlog context; **do not start them**, they
carry unresolved product decisions.

Read `AGENTS.md` first. Its rules apply to every task here.

---

## Operating context (confirmed with the user, not derivable from code)

- **Company timezone is US Central (`America/Chicago`).** This matches the
  `companies.timezone` schema default at `src/db/schema.ts:26`.
- **The company cleans Monday–Friday only.** No weekend service. Holidays are
  non-working days. Neither of these facts is encoded anywhere in the codebase —
  grep confirms no working-day or holiday modeling exists outside a `holiday_hours`
  column in the Gusto payroll CSV export.

---

## Ordering and file-conflict warning

Tasks 2, 3, and 4b all edit `src/app/(app)/calendar/page.tsx`. **Do them sequentially
in a single branch.** Do not parallelize them across worktrees.

Per `AGENTS.md`: stage explicit paths only. Never `git add -A` or `git add .` in this
shared worktree.

---

## Task 1 — StaffBoard never reflects a completed assignment

### Problem

`staff-board.tsx:25` initializes `const [jobs, setJobs] = useState(initialJobs)` with no
prop-sync guard. `UnassignedPanel` calls `router.refresh()` on a successful save
(`unassigned-panel.tsx:107`), which re-renders the server component and passes fresh
props — but `jobs` is frozen client state and ignores them.

Observed result: you assign a cleaner from the unassigned queue, the queue card
disappears (because `unassignedJobs` is a raw prop, not state), and **the job never
appears in that technician's lane** until a full page reload. The job appears to
vanish.

The drag path has the same defect plus a second one: `dropOnEmployee`
(`staff-board.tsx:38-46`) never calls `router.refresh()` at all, so client and server
state diverge silently.

Both dead boards already contain the correct fix — `day-board.tsx:60-63` and
`list-board.tsx:47-50`. The pattern was written and simply not carried into the board
that shipped.

### Scope

`src/app/(app)/calendar/staff-board.tsx` only.

### Changes

1. Add the derived-state sync guard, mirroring `day-board.tsx:60-63` exactly:
   ```
   const [syncedJobs, setSyncedJobs] = useState(initialJobs);
   if (initialJobs !== syncedJobs) {
     setSyncedJobs(initialJobs);
     setJobs(initialJobs);
   }
   ```
2. In `dropOnEmployee`, call `router.refresh()` inside the `onSuccess` handler before
   `showUndo(...)` — same ordering as `day-board.tsx:78-80`. Import `useRouter` from
   `next/navigation`.

### Constraints

- Do not convert `jobs` to a `useEffect`-driven sync. The render-phase guard is the
  established pattern in this codebase and avoids a double render.
- The undo toast is `StaffBoard` client state and must survive `router.refresh()`.
  Verify it still appears and still works after the refresh lands.
- Do not change the optimistic-update or rollback logic.

### Acceptance criteria

- Open Staff view on a day with at least one unassigned job. Assign a cleaner via the
  queue panel. The card leaves the queue **and** the job appears in that technician's
  lane, with no manual reload.
- Drag a job onto a second technician's column. After the save resolves, the lane
  reflects server state, and the undo toast is present and functional.
- Undo from either path restores the previous assignment and the board reflects it.

---

## Task 2 — Calendar resolves "today" in UTC instead of company time

### Problem

`page.tsx:94` uses `new Date()`, then `toISODate()` (`src/lib/scheduling/dates.ts:17`),
which is `toISOString().slice(0,10)` — UTC. The rest of the app is timezone-aware:
`dashboard/page.tsx:28-30` and `reports/page.tsx:165` both use
`todayInTimeZone(now, company.timezone)`.

In Central Time the UTC date rolls over at **7:00 PM CDT** (summer) and **6:00 PM CST**
(winter). From that point every evening:

- `/calendar` defaults to **tomorrow's** dispatch board
- the "Today" button navigates to tomorrow
- the today-highlight in Week view sits on the wrong column
- Calendar and Dashboard disagree about what day it is

That window is exactly when a dispatcher closes out the day and preps tomorrow.

### Scope

`src/app/(app)/calendar/page.tsx` only.

### Changes

1. Load the company timezone the same way `dashboard/page.tsx:28` does:
   ```
   db.select({ timezone: companies.timezone })
     .from(companies)
     .where(eq(companies.id, admin.companyId))
     .limit(1)
   ```
   Add it to the **existing** `Promise.all` at `page.tsx:149`. Do not introduce a
   fourth sequential round-trip. Import `companies` from `@/db/schema`.
2. Replace `const today = new Date()` (`:94`) with
   `todayInTimeZone(new Date(), company.timezone)` from `@/lib/dashboard/range`, which
   returns a `YYYY-MM-DD` string.
3. Derive `dayAnchor` (`:96`), `monthAnchor` (`:101`), and `todayIso` (`:106`) from that
   ISO string. Parse as ``new Date(`${iso}T00:00:00.000Z`)`` to match the existing
   convention in this file.
4. If the company row is missing, `redirect("/login")` — same as `dashboard/page.tsx:29`.

### Constraints

- **Do not** modify `formatDisplayDate`, `toISODate`, or `startOfWeek` in
  `src/lib/scheduling/dates.ts`. Parsing stored date-only strings as UTC is deliberate
  and correct (see the comment at `dates.ts:22-24`) — it keeps a scheduled visit from
  shifting a day in a viewer's local timezone. This bug is confined to *"what is
  today"*, not to how stored dates render.
- Preserve company-scoped authorization on the new query.

### Acceptance criteria

- With the server clock at `2026-07-27T23:30:00Z` (6:30 PM CDT), `/calendar` defaults to
  and highlights **2026-07-27**, and the "Today" link resolves to `day=2026-07-27`.
- Same assertion at `2026-01-27T23:30:00Z` (5:30 PM CST) → **2026-01-27**.
- Existing explicit `?day=`, `?week=`, `?month=` params and the saved-state cookie
  continue to override the default, unchanged.
- Query count for the page does not increase beyond the existing `Promise.all`.

---

## Task 3 — Filtering by technician empties the unassigned queue

### Problem

When `employeeId` is set, `page.tsx:146` switches the row query to an
`innerJoin(jobAssignments)`, so unassigned jobs cannot be in the result set by
construction. `page.tsx:180` then derives `unassignedJobs` from that same set, so it is
always `[]`.

Filtering to one technician therefore reports "No jobs need assignment for this day" —
which is false, and is exactly the wrong answer during dispatch. The board also
continues to render *every* technician's column while the filter is active, so it is
not visually obvious a filter is even applied.

### Scope

`src/app/(app)/calendar/page.tsx`, `src/app/(app)/calendar/staff-board.tsx`.

### Changes

**3a.** When `view === "staff"`, compute the unassigned queue from a query that applies
all of `conditions` **except** the employee join, plus a `notExists` subquery against
`jobAssignments` for that job id. Run it inside the existing `Promise.all`. Only issue
this query for the staff view — week and month views do not use `unassignedJobs`.

**3b.** When `employeeId` is set, `StaffBoard` should render only that technician's
lane rather than all active technicians. Filter the `employees` array passed to the
board, or filter inside the board — either is acceptable, pick the one that keeps
`AssigneePicker` able to still list the full roster for reassignment.

### Constraints

- Preserve company-scoped authorization on the new query.
- Do not switch the main row query away from its `innerJoin` — the employee filter on
  the board itself is correct as written.
- Do not fetch the full company job set and filter in memory.

### Acceptance criteria

- Select a single technician in the filter. The board shows only that technician's
  lane, **and** the unassigned queue still lists that day's unassigned jobs with an
  accurate count in the badge.
- Clearing the filter restores all lanes and an identical queue.
- Week and month views issue no additional queries.

---

## Task 4 — Backend: non-transactional assignment rewrite, `updated_at` never bumps

### Problem

**4a.** `api/jobs/[jobId]/route.ts:185-193` does `DELETE` then `INSERT` on
`job_assignments` outside a transaction, with the audit-log insert after it. A failure
between the two statements leaves the job unassigned with no record of who was on it.

**4b.** The shared `timestamps` helper (`src/db/schema.ts:17-20`) declares
`updatedAt` with `defaultNow()` but no `$onUpdate`, and `route.ts:160` does not set it.
`jobs.updatedAt` is therefore effectively a duplicate of `createdAt` — every job edit
is invisible in that column. Separately, `page.tsx:139` selects `updatedAt` into every
`CalendarJob` and **nothing renders it**, so a stale field is serialized into the client
payload for every job on the board.

### Scope

`src/app/api/jobs/[jobId]/route.ts`, `src/db/schema.ts`,
`src/app/(app)/calendar/page.tsx`.

### Changes

1. Wrap the assignment delete + insert + audit-log insert (`route.ts:184-204`) in a
   single `db.transaction(...)`.
2. Add `.$onUpdate(() => new Date())` to `updatedAt` in the `timestamps` helper
   (`schema.ts:19`).
3. Remove `updatedAt` from the `CalendarJob` type (`page.tsx:67`) and from the select
   (`page.tsx:139`).

### Constraints

- **No migration is required or permitted for this task.** `$onUpdate` is a
  Drizzle-side behavior that adds `updated_at` to the emitted `SET` clause; it does not
  alter the schema. Do not generate or run a migration. Per `AGENTS.md`, production
  migrations require explicit user approval, and per `HANDOFF.md`, `npm run db:migrate`
  does not work against this database at all.
- `timestamps` is spread into **every** table. Confirm the change compiles cleanly
  across all of them and note any table where an automatic `updated_at` bump would be
  undesirable before proceeding.
- Do not change the audit-log payload shape — it is read by the job detail UI.

### Acceptance criteria

- `PATCH /api/jobs/[id]` with `employeeIds` succeeds as before; assignments and the
  audit row are written atomically.
- After any `PATCH` that changes a job field, `jobs.updated_at` is strictly greater than
  `jobs.created_at`.
- The calendar renders identically and the RSC payload no longer carries `updatedAt`.
- `npm run verify` passes with no type errors in any table using `timestamps`.

---

## Task 5 — UnassignedPanel triggers five queries to render a name and address

### Problem

`unassigned-panel.tsx:58` calls `GET /api/jobs/[id]` to populate the quick-assign panel.
That endpoint (`api/jobs/[jobId]/route.ts:26-102`) runs **five** queries: job +
assignments + time entries + time-entry audit logs + job audit logs. The panel renders
only the customer name, scheduled date/time, and address. Everything else is discarded.

### Scope

New `src/app/api/jobs/[jobId]/summary/route.ts`,
`src/app/(app)/calendar/unassigned-panel.tsx`.

### Changes

1. Add `GET /api/jobs/[jobId]/summary` returning exactly the fields the panel consumes:
   `id`, `scheduledDate`, `scheduledStartTime`, `customerFirstName`, `customerLastName`,
   `addressLine1`, `city`, `state`, `zip`. Single query with the existing
   `innerJoin(customers)`. Use `requireAdmin()` and scope on `companyId`, matching the
   existing route's pattern. Return 404 on miss.
2. Point the panel's first fetch at the new endpoint. The `/history` fetch alongside it
   is already lean — leave it unchanged.

### Constraints

- Do not modify or narrow the existing `GET /api/jobs/[jobId]` — the job detail page
  depends on its full payload.
- Preserve company-scoped authorization.

### Acceptance criteria

- The panel renders identically to before.
- Opening it issues one lightweight request; the server executes one query for the
  summary instead of five.
- A job id from another company returns 404.

---

## Verification (all tasks)

Per `AGENTS.md`:

1. `npm run verify` — required before presenting any task as ready.
2. `npm run smoke:routes -- http://localhost:3100` against a local production build if
   one is available.
3. Manually exercise Staff view: assign from the queue, drag to a second technician,
   undo both, apply and clear the technician filter.

There are currently **zero tests covering the calendar**. `staff-board.tsx` already
carries `data-testid="unassigned-job-card"` and `data-testid="view-all-unassigned"` that
nothing uses. Adding Playwright coverage for the assign → appears-in-lane flow (Task 1)
would be welcome but is not required to close these tasks.

---

## Out of scope — do not touch

- **`day-board.tsx`, `list-board.tsx`, `job-detail-panel.tsx`** (~640 lines, currently
  unreferenced). These are **harvest sources**, not garbage: `day-board` contains the
  drag-to-reschedule logic and `list-board` contains inline date/time/status editing,
  both of which Phase 2 needs. Do not delete them yet.
- Unused exports in `shared.ts` (`TYPE_COLORS`, `EMPLOYEE_PALETTE`, `isPlainClick`,
  `jobsOverlap`). `jobsOverlap` is wanted for Phase 2 conflict detection.
- **Drag semantics.** Today a drop *appends* an assignee and never removes from the
  source lane, and queue cards are not draggable at all. This is a pending product
  decision, not a bug to fix unilaterally.
- `route-preview.tsx` geocoding cache — tracked separately in `HANDOFF.md`, gated on the
  Google Maps API key.

---

## Backlog — Phase 2 (blocked on product decisions)

- Drag from the unassigned queue onto a lane; move-vs-add semantics; unassign from the
  board
- Drag-to-reschedule in Staff view (port from `day-board.tsx:145-161`)
- Configurable day window — the board is hardcoded to 9 AM–6 PM (`staff-board.tsx:11-12`)
  and clamps `top` to `[0, 94]` (`:50`), so a 6 AM job renders stacked on the 9 AM row.
  Jobs with a null `scheduledStartTime` default to `09:00` (`shared.ts:23`) and are
  indistinguishable from real 9 AM bookings — they need an explicit "no time set" tray.
- PTO painted as blocked lanes. `employeePto` exists and `findPtoConflicts` already 409s
  server-side (`route.ts:147`), so today you drag, wait, then get a red error bar.
- Double-booking detection. The API validates PTO but never checks for overlapping jobs
  on the same technician. `shared.ts:71` exports `jobsOverlap()`, used by nothing.

## Backlog — Phase 3 (low risk, do after Phase 1)

- **Week view → Mon–Fri.** `page.tsx:99` builds 7 days and `week-board.tsx:18` renders
  `repeat(7, minmax(200px, 1fr))`; two columns are permanently empty. Dropping to 5
  takes the min grid width from 1400px to 1000px, which removes forced horizontal scroll
  on a laptop. Narrow the week query range to Mon–Fri at the same time.
- **Weekend-orphan guard.** Month view already drops weekends
  (`month-board.tsx:15`), so once Week view follows, no view renders a Saturday or
  Sunday job. 692 jobs were imported from the TheCustomerFactor CSV; any that landed on
  a weekend are billable and unreachable. Add a dismissible banner — *"N jobs scheduled
  on a weekend — view"* — linking to Staff view for that date.
- **Working days + holidays in `companies.settings`.** That column is free-form `jsonb`
  (`schema.ts:27`) and `dashboard/page.tsx:30` already reads `revenueTargetCents` out of
  it, so `workingDays: [1,2,3,4,5]` and `holidays: [...]` need **no migration**.
  Excluding holidays from capacity denominators matters more than greying the cell —
  today a holiday shows as 0% capacity and drags week averages down.
- `useTransition` on `filter-bar.tsx:49` and `date-picker.tsx:31` — every filter change
  and date jump is a full RSC round-trip with zero visual feedback. Add `loading.tsx`.
- Touch and keyboard paths for assignment. HTML5 drag events do not fire on iOS/Android,
  so the dispatch board's primary interaction is unusable on a tablet. Lanes are plain
  `<div>`s with no `role` or focus target.
- `DatePicker` closes only on selection — no click-outside, no Escape, no focus trap.
  `AssigneePicker` handles click-outside (`assignee-picker.tsx:25-32`) but not Escape.
- Unassigned queue is `xl:` only (`staff-board.tsx:75`), so below 1280px it sits below a
  ~936px-tall board and is effectively invisible.
- Month view fetches full job rows with the customer join to render four counts per day;
  should be a `GROUP BY scheduled_date` aggregate.
- `status` and `recurrence` search params are cast without validation
  (`page.tsx:116,119`) while `type` is checked against `jobTypeEnum` (`:115`). Not
  injectable, but inconsistent.
- `history/route.ts:41-50` previous-visit query is not company-scoped. Safe in practice
  because `customerId` came from a company-verified job, but it violates the standing
  rule in `AGENTS.md`.
- `assignment=unassigned` is handled at `page.tsx:157` but no `FilterBar` control sets
  it. Expose it as an "Unassigned only" toggle or remove it.
- Split the mega-JSX lines. `staff-board.tsx:76` and `week-board.tsx:18` are each a
  single line over 3,000 characters — the direct reason Task 1 and the 9 AM–6 PM
  clamping went unnoticed in review.
