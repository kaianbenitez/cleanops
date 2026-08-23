"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { AlertCircle, SlidersHorizontal, X } from "lucide-react";
import CalendarFiltersPanel from "./calendar-filters-panel";
import { ATTENTION_RAIL_TOGGLE_EVENT } from "./shared";

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
  const employeeLabel = employees.find((employee) => employee.id === employeeId);
  const typeLabels: Record<string, string> = { first_clean: "First clean", recurring: "Recurring", one_time: "One-time", deep_clean: "Deep clean", move_out: "Move in/out" };
  const recurrenceLabels: Record<string, string> = { recurring: "Recurring", weekly: "Weekly", biweekly: "Biweekly", every4weeks: "Every 4 weeks", monthly: "Monthly", custom: "Custom recurring", none: "One-time" };
  const statusLabels: Record<string, string> = { scheduled: "Scheduled", in_progress: "In progress", completed: "Completed", cancelled: "Cancelled", no_show: "No show" };
  const activeFilters = [
    employeeId ? { key: "employeeId", label: employeeLabel?.firstName ?? "Crew member" } : null,
    type ? { key: "type", label: typeLabels[type] ?? type } : null,
    recurrence ? { key: "recurrence", label: recurrenceLabels[recurrence] ?? recurrence } : null,
    status ? { key: "status", label: statusLabels[status] ?? status } : null,
    assignment ? { key: "assignment", label: assignment === "unassigned" ? "Jobs without a crew" : assignment } : null,
    zip ? { key: "zip", label: `ZIP ${zip}` } : null,
  ].filter((filter): filter is { key: string; label: string } => Boolean(filter));

  function removeFilter(key: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.delete(key);
    startTransition(() => router.push(`${pathname}?${params.toString()}`));
  }

  return (
    <div aria-busy={isPending} className="flex min-w-0 shrink-0 flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => window.dispatchEvent(new Event(ATTENTION_RAIL_TOGGLE_EVENT))}
        aria-controls="calendar-attention-rail"
        aria-label={attentionCount ? `Show needs attention · ${attentionCount} item${attentionCount === 1 ? "" : "s"}` : "Show needs attention"}
        title="Show needs attention"
        className="co-button-secondary flex h-11 items-center gap-1 px-2.5 text-xs font-semibold !text-[var(--co-warning)]"
      >
        <AlertCircle className="h-3.5 w-3.5" aria-hidden />
        {attentionCount ? `Needs attention · ${attentionCount}` : <span className="sr-only">Needs attention</span>}
      </button>

      <div className="relative">
        <button
          ref={filtersTriggerRef}
          type="button"
          onClick={() => setFiltersOpen((current) => !current)}
          aria-expanded={filtersOpen}
          aria-haspopup="dialog"
          aria-label={hasFilters ? `Open filters · ${activeFilterCount} active` : "Open calendar filters"}
          className={`co-button-secondary relative flex h-11 w-11 items-center justify-center !p-0 ${hasFilters ? "border-[var(--co-accent-text)] text-[var(--co-accent-text)]" : ""}`}
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

      {hasFilters ? <button type="button" onClick={clearAll} className="min-h-11 whitespace-nowrap px-2 text-xs font-semibold text-[var(--co-accent-text)] hover:underline">Clear filters</button> : null}
      {activeFilters.map((filter) => (
        <button
          key={filter.key}
          type="button"
          onClick={() => removeFilter(filter.key)}
          aria-label={`Remove ${filter.label} filter`}
          className="inline-flex min-h-11 max-w-[12rem] items-center gap-1 rounded-full border border-[var(--co-accent-text)]/30 bg-[var(--co-accent-tint)] px-2.5 py-1 text-xs font-semibold text-[var(--co-accent-text)] hover:border-[var(--co-accent-text)]"
        >
          <span className="truncate">{filter.label}</span>
          <X className="h-3 w-3 shrink-0" aria-hidden strokeWidth={1.75} />
        </button>
      ))}
      {isPending ? <span role="status" className="text-xs text-[var(--co-muted)]">Updating calendar…</span> : null}
    </div>
  );
}
