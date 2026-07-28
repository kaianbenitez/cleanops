"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";

type Employee = { id: string; firstName: string; lastName: string };

const VIEWS = [
  { value: "week", label: "Week" },
  { value: "staff", label: "Staff" },
  { value: "month", label: "Month" },
  { value: "list", label: "List" },
] as const;

const TYPES = [
  { value: "first_clean", label: "First clean" },
  { value: "recurring", label: "Recurring" },
  { value: "one_time", label: "One-time" },
  { value: "deep_clean", label: "Deep clean" },
  { value: "move_out", label: "Move in/out" },
] as const;

const RECURRENCES = [
  { value: "weekly", label: "Weekly" },
  { value: "biweekly", label: "Biweekly" },
  { value: "every4weeks", label: "Every 4 weeks" },
  { value: "monthly", label: "Monthly" },
  { value: "none", label: "One-time" },
] as const;

const STATUSES = [
  { value: "scheduled", label: "Scheduled" },
  { value: "in_progress", label: "In progress" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
  { value: "no_show", label: "No show" },
] as const;

export default function FilterBar({
  employees,
  resolvedView,
}: {
  employees: Employee[];
  resolvedView: "staff" | "week" | "month" | "list";
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [zipDraft, setZipDraft] = useState(searchParams.get("zip") ?? "");
  const [isPending, startTransition] = useTransition();

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    startTransition(() => router.push(`${pathname}?${params.toString()}`));
  }

  function clearAll() {
    const params = new URLSearchParams();
    for (const key of ["view", "week", "day", "month"]) {
      const value = searchParams.get(key);
      if (value) params.set(key, value);
    }
    startTransition(() => router.push(`${pathname}?${params.toString()}`));
    setZipDraft("");
  }

  const view = searchParams.get("view") ?? resolvedView;
  const employeeId = searchParams.get("employeeId") ?? "";
  const type = searchParams.get("type") ?? "";
  const recurrence = searchParams.get("recurrence") ?? "";
  const status = searchParams.get("status") ?? "";
  const assignment = searchParams.get("assignment") ?? "";
  const hasFilters = employeeId || type || recurrence || status || assignment || searchParams.get("zip");

  return (
    <section aria-busy={isPending} className="border-y border-[var(--co-line-soft)] bg-[var(--co-surface)] px-3 py-3 sm:px-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex overflow-hidden rounded-lg border border-[var(--co-line)] bg-[var(--co-surface-muted)] p-0.5">
          {VIEWS.map((entry) => (
            <button
              key={entry.value}
              type="button"
              aria-pressed={view === entry.value}
              onClick={() => setParam("view", entry.value)}
              className={`px-3 py-1.5 text-xs font-semibold transition-colors ${view === entry.value ? "bg-[var(--co-evergreen)] text-white" : "text-[var(--co-muted)] hover:bg-white hover:text-[var(--co-ink)]"}`}
            >
              {entry.label}
            </button>
          ))}
        </div>

        <select value={employeeId} onChange={(event) => setParam("employeeId", event.target.value)} aria-label="Filter by employee" className="co-input min-w-[150px] py-2 text-xs">
          <option value="">All technicians</option>
          {employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.firstName} {employee.lastName}</option>)}
        </select>

        <select value={status} onChange={(event) => setParam("status", event.target.value)} aria-label="Filter by status" className="co-input min-w-[130px] py-2 text-xs">
          <option value="">All statuses</option>
          {STATUSES.map((entry) => <option key={entry.value} value={entry.value}>{entry.label}</option>)}
        </select>

        <button type="button" aria-pressed={assignment === "unassigned"} onClick={() => setParam("assignment", assignment === "unassigned" ? "" : "unassigned")} className={`co-button-secondary py-2 text-xs ${assignment === "unassigned" ? "border-[var(--co-evergreen)] text-[var(--co-evergreen)]" : ""}`}>
          Unassigned only
        </button>

        <button type="button" onClick={() => setAdvancedOpen((open) => !open)} aria-expanded={advancedOpen} className={`co-button-secondary py-2 text-xs ${advancedOpen ? "border-[var(--co-evergreen)] text-[var(--co-evergreen)]" : ""}`}>
          More filters{hasFilters ? ` (${[employeeId, type, recurrence, status, assignment, searchParams.get("zip")].filter(Boolean).length})` : ""}
        </button>

        {hasFilters ? <button type="button" onClick={clearAll} className="ml-auto text-xs font-semibold text-[var(--co-evergreen)] hover:underline">Clear filters</button> : null}
      </div>

      {isPending ? <p role="status" className="mt-2 text-xs text-[var(--co-muted)]">Updating calendar…</p> : null}

      {advancedOpen ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[var(--co-line-soft)] pt-3">
          <select value={recurrence} onChange={(event) => setParam("recurrence", event.target.value)} aria-label="Filter by recurrence" className="co-input min-w-[145px] py-2 text-xs">
            <option value="">All recurrence</option>
            {RECURRENCES.map((entry) => <option key={entry.value} value={entry.value}>{entry.label}</option>)}
          </select>
          <select value={type} onChange={(event) => setParam("type", event.target.value)} aria-label="Filter by cleaning type" className="co-input min-w-[145px] py-2 text-xs">
            <option value="">All service types</option>
            {TYPES.map((entry) => <option key={entry.value} value={entry.value}>{entry.label}</option>)}
          </select>
          <input value={zipDraft} onChange={(event) => setZipDraft(event.target.value)} onBlur={() => setParam("zip", zipDraft.trim())} onKeyDown={(event) => event.key === "Enter" && setParam("zip", zipDraft.trim())} placeholder="ZIP code" aria-label="Filter by ZIP code" className="co-input w-28 py-2 text-xs" />
        </div>
      ) : null}
    </section>
  );
}
