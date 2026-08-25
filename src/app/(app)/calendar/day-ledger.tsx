"use client";

import { FilterChips } from "./filter-bar";

type Employee = { id: string; firstName: string; lastName: string; isActive?: boolean };

function money(cents: number) {
  return `$${Math.round(Math.abs(cents) / 100).toLocaleString("en-US")}`;
}

/** Small inline capacity meter beside the working-crew figure — the ledger's
 * one piece of color. Same transform-based scaleX fill as board.tsx's
 * CapacityMeter (never an animated width; a logged perf finding on this
 * page), just sized for a glance-level status line rather than the board's
 * own per-lane labor-hours readout. */
function WorkingMeter({ working, total }: { working: number; total: number }) {
  const percent = total > 0 ? Math.min((working / total) * 100, 100) : 0;
  return (
    <span className="inline-block h-1 w-8 shrink-0 overflow-hidden rounded-full bg-[var(--co-surface-muted-2)]" aria-hidden>
      <span
        className="block h-full w-full origin-left rounded-full bg-[var(--co-accent-fill)] motion-reduce:transition-none"
        style={{ transform: `scaleX(${percent / 100})`, transition: "transform 550ms cubic-bezier(.16,1,.3,1)" }}
      />
    </span>
  );
}

/**
 * The calendar's day ledger: one dense status line reporting the focused
 * day's crew coverage, recurring-client count, revenue, and discounts —
 * deliberately a status line, not a KPI-card row (see the calendar layout
 * remodel brief). Active filter chips sit at the right end of this same
 * line: the figures are computed from the filtered job set, so the chips
 * are "what's being counted" and belong beside the numbers, not back in the
 * toolbar.
 *
 * Rendered only on the Day period (page.tsx). Every figure here describes a
 * single date, so showing it under a Week or Month grid would report one
 * day's revenue as if it were the whole period's.
 *
 * Responsive placement:
 * - Below md: not rendered at all (TodayListBoard's phone view has no room).
 * - md to just under xl: a static strip after the board.
 * - xl and up: sticky to the bottom of the viewport.
 *
 * app-nav.tsx's `fixed inset-x-0 bottom-0 z-30 xl:hidden` tab bar looks like
 * a collision below xl, but it renders only for non-admins, and /calendar is
 * admin-only — so it never coexists with this. The static-below-xl tier is
 * kept anyway as cheap insurance if that nav ever widens its audience.
 */
export default function DayLedger({
  employees,
  totalEmployees,
  workingEmployees,
  recurringClients,
  revenueCents,
  discountCents,
}: {
  employees: Employee[];
  totalEmployees: number;
  workingEmployees: number;
  recurringClients: number;
  revenueCents: number;
  discountCents: number;
}) {
  return (
    <div
      role="group"
      aria-label="Selected day summary and active filters"
      className="hidden min-h-11 w-full items-center justify-between gap-3 rounded-[var(--co-radius-control)] border border-[var(--co-line-soft)] bg-[var(--co-surface)]/95 px-3 py-2 text-xs backdrop-blur-xl md:flex xl:sticky xl:bottom-3 xl:z-20 xl:shadow-[var(--co-shadow-control)]"
    >
      <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto whitespace-nowrap">
        <span className="inline-flex items-center gap-1.5 text-[var(--co-muted)]">
          <span>
            <strong className="tabular-nums font-bold text-[var(--co-ink)]">
              {workingEmployees}
              <span className="sr-only"> of </span>
              <span aria-hidden>/</span>
              {totalEmployees}
            </strong>{" "}
            working
          </span>
          <WorkingMeter working={workingEmployees} total={totalEmployees} />
        </span>
        <span aria-hidden className="text-[var(--co-line)]">·</span>
        <span className="text-[var(--co-muted)]">
          <strong className="tabular-nums font-bold text-[var(--co-ink)]">{recurringClients}</strong> recurring
        </span>
        <span aria-hidden className="text-[var(--co-line)]">·</span>
        <span className="text-[var(--co-muted)]">
          <strong className="tabular-nums font-bold text-[var(--co-ink)]">{money(revenueCents)}</strong> revenue
        </span>
        <span aria-hidden className="text-[var(--co-line)]">·</span>
        <span className="text-[var(--co-muted)]">
          <strong className="tabular-nums font-bold text-[var(--co-ink)]">
            {discountCents > 0 ? <span aria-hidden>−</span> : null}
            {discountCents > 0 ? <span className="sr-only">minus </span> : null}
            {money(discountCents)}
          </strong>{" "}
          discounts
        </span>
      </div>
      <FilterChips employees={employees} />
    </div>
  );
}
