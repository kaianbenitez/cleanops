"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { AlertCircle, SlidersHorizontal } from "lucide-react";
import CalendarFiltersPanel from "./calendar-filters-panel";

type Employee = { id: string; firstName: string; lastName: string; isActive?: boolean };

export default function FilterBar({
  employees,
  totalJobs,
  unassignedJobs,
}: {
  employees: Employee[];
  totalJobs: number;
  unassignedJobs: number;
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
  const queueOpen = searchParams.get("queue") === "unassigned";
  const activeFilterCount = [employeeId, type, recurrence, status, assignment, zip].filter(Boolean).length;
  const hasFilters = activeFilterCount > 0;

  function toggleQueue() {
    const params = new URLSearchParams(searchParams.toString());
    if (queueOpen) params.delete("queue");
    else params.set("queue", "unassigned");
    startTransition(() => router.push(`${pathname}?${params.toString()}`));
  }

  return (
    <section aria-busy={isPending} className="bg-[var(--co-surface)] px-3 py-3 sm:px-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p aria-live="polite" className="text-xs font-medium text-[var(--co-muted)]">
          {totalJobs} {totalJobs === 1 ? "job" : "jobs"}
        </p>

        <div className="flex flex-wrap items-center gap-2">
          {unassignedJobs ? (
            <button
              type="button"
              onClick={toggleQueue}
              aria-controls="unassigned-queue-list"
              aria-expanded={queueOpen}
              className={`co-button-secondary gap-2 py-2 text-xs ${queueOpen ? "border-[var(--co-warning)] !text-[var(--co-warning)]" : "!text-[var(--co-warning)]"}`}
            >
              <AlertCircle className="h-3.5 w-3.5" aria-hidden />
              Needs attention · {unassignedJobs}
            </button>
          ) : null}

          <div className="relative">
            <button
              ref={filtersTriggerRef}
              type="button"
              onClick={() => setFiltersOpen((current) => !current)}
              aria-expanded={filtersOpen}
              aria-haspopup="dialog"
              className={`co-button-secondary gap-2 py-2 text-xs ${hasFilters ? "border-[var(--co-accent-text)] text-[var(--co-accent-text)]" : ""}`}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden />
              Filters{hasFilters ? ` · ${activeFilterCount}` : ""}
            </button>
            <CalendarFiltersPanel
              employees={employees}
              open={filtersOpen}
              onClose={() => setFiltersOpen(false)}
              triggerRef={filtersTriggerRef}
            />
          </div>

          {hasFilters ? <button type="button" onClick={clearAll} className="text-xs font-semibold text-[var(--co-accent-text)] hover:underline">Clear filters</button> : null}
        </div>
      </div>

      {isPending ? <p role="status" className="mt-2 text-xs text-[var(--co-muted)]">Updating calendar…</p> : null}
    </section>
  );
}
