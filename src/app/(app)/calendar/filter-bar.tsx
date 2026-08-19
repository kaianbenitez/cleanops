"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { AlertCircle, SlidersHorizontal } from "lucide-react";
import CalendarFiltersPanel from "./calendar-filters-panel";

type Employee = { id: string; firstName: string; lastName: string; isActive?: boolean };

export default function FilterBar({
  employees,
  attentionCount,
}: {
  employees: Employee[];
  attentionCount: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const filtersTriggerRef = useRef<HTMLButtonElement>(null);

  function clearAll() {
    const params = new URLSearchParams();
    for (const key of ["view", "week", "day", "month"]) {
      const value = searchParams.get(key);
      if (value) params.set(key, value);
    }
    startTransition(() => router.push(`${pathname}?${params.toString()}`));
  }

  const employeeId = searchParams.get("employeeId") ?? "";
  const type = searchParams.get("type") ?? "";
  const recurrence = searchParams.get("recurrence") ?? "";
  const status = searchParams.get("status") ?? "";
  const assignment = searchParams.get("assignment") ?? "";
  const zip = searchParams.get("zip") ?? "";
  const activeFilterCount = [employeeId, type, recurrence, status, assignment, zip].filter(Boolean).length;
  const hasFilters = activeFilterCount > 0;

  // The old collapsible unassigned-queue panel (toggled via ?queue=unassigned)
  // is gone — board.tsx's Board now renders an always-visible attention rail
  // instead (id="calendar-attention-rail"), so there's nothing left to open.
  // This button now moves focus to that rail and scrolls it into view, which
  // works for both a mouse click and a keyboard activation (Enter/Space).
  // Board is the only view that renders the rail; on Day/Week/Month the
  // count is still shown but the click is a no-op since there's nothing to
  // jump to there.
  function focusAttentionRail() {
    const rail = document.getElementById("calendar-attention-rail");
    if (!rail) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    rail.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "nearest" });
    rail.focus({ preventScroll: true });
  }

  return (
    <div aria-busy={isPending} className="flex shrink-0 items-center gap-2">
      {attentionCount ? (
        <button
          type="button"
          onClick={focusAttentionRail}
          aria-controls="calendar-attention-rail"
          aria-label={`Needs attention · ${attentionCount}`}
          className="co-button-secondary flex h-9 items-center gap-1 px-2.5 text-xs font-semibold !text-[var(--co-warning)]"
        >
          <AlertCircle className="h-3.5 w-3.5" aria-hidden />
          {attentionCount}
        </button>
      ) : null}

      <div className="relative">
        <button
          ref={filtersTriggerRef}
          type="button"
          onClick={() => setFiltersOpen((current) => !current)}
          aria-expanded={filtersOpen}
          aria-haspopup="dialog"
          aria-label={hasFilters ? `Filters · ${activeFilterCount} active` : "Filters"}
          className={`co-button-secondary relative flex h-9 w-9 items-center justify-center !p-0 ${hasFilters ? "border-[var(--co-accent-text)] text-[var(--co-accent-text)]" : ""}`}
        >
          <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden />
          {hasFilters ? <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-[var(--co-accent-fill)]" aria-hidden /> : null}
        </button>
        <CalendarFiltersPanel
          employees={employees}
          open={filtersOpen}
          onClose={() => setFiltersOpen(false)}
          triggerRef={filtersTriggerRef}
        />
      </div>

      {hasFilters ? <button type="button" onClick={clearAll} className="whitespace-nowrap text-xs font-semibold text-[var(--co-accent-text)] hover:underline">Clear filters</button> : null}
      {isPending ? <span role="status" className="text-xs text-[var(--co-muted)]">Updating…</span> : null}
    </div>
  );
}
