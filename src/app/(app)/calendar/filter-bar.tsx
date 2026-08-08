"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { Inbox, SlidersHorizontal } from "lucide-react";

type Employee = { id: string; firstName: string; lastName: string; isActive?: boolean };

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
  totalJobs,
  unassignedJobs,
  projectedRevenueCents,
}: {
  employees: Employee[];
  totalJobs: number;
  unassignedJobs: number;
  projectedRevenueCents: number;
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

  const employeeId = searchParams.get("employeeId") ?? "";
  const type = searchParams.get("type") ?? "";
  const recurrence = searchParams.get("recurrence") ?? "";
  const status = searchParams.get("status") ?? "";
  const assignment = searchParams.get("assignment") ?? "";
  const queueOpen = searchParams.get("queue") === "unassigned";
  const unassignedOnlyParams = new URLSearchParams(searchParams.toString());
  if (assignment === "unassigned") {
    unassignedOnlyParams.delete("assignment");
    unassignedOnlyParams.delete("queue");
  } else {
    unassignedOnlyParams.set("assignment", "unassigned");
    // In Staff view, the unassigned cards live in their own queue above the
    // technician lanes. Opening it here makes the filter's result visible.
    unassignedOnlyParams.set("queue", "unassigned");
  }
  const unassignedOnlyHref = `${pathname}?${unassignedOnlyParams.toString()}`;
  const hasFilters = employeeId || type || recurrence || status || assignment || searchParams.get("zip");
  const projectedRevenue = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(projectedRevenueCents / 100);

  return (
    <section aria-busy={isPending} className="bg-[var(--co-surface)] px-3 py-3 sm:px-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex overflow-hidden rounded-lg border border-[var(--co-line-soft)] bg-[var(--co-surface-muted)]">
          <p aria-live="polite" className="px-3 py-1.5 text-xs leading-tight">
            <span className="block text-[10px] font-medium text-[var(--co-muted)]">Total jobs</span>
            <span className="font-semibold text-[var(--co-ink)]">{totalJobs} {totalJobs === 1 ? "job" : "jobs"}</span>
          </p>
          <p className="border-l border-[var(--co-line-soft)] px-3 py-1.5 text-xs leading-tight">
            <span className="block text-[10px] font-medium text-[var(--co-muted)]">Projected revenue</span>
            <span className="font-semibold text-[var(--co-evergreen)]">{projectedRevenue}</span>
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
        <select value={employeeId} onChange={(event) => setParam("employeeId", event.target.value)} aria-label="Filter by employee" className="co-input min-w-[150px] py-2 text-xs">
          <option value="">All technicians</option>
          {employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.firstName} {employee.lastName}{employee.isActive === false ? " (Inactive)" : ""}</option>)}
        </select>

        <select value={status} onChange={(event) => setParam("status", event.target.value)} aria-label="Filter by status" className="co-input min-w-[130px] py-2 text-xs">
          <option value="">All statuses</option>
          {STATUSES.map((entry) => <option key={entry.value} value={entry.value}>{entry.label}</option>)}
        </select>

        <Link href={unassignedOnlyHref} aria-pressed={assignment === "unassigned"} className={`co-button-secondary py-2 text-xs ${assignment === "unassigned" ? "border-[var(--co-evergreen)] text-[var(--co-evergreen)]" : ""}`}>
          Unassigned only
        </Link>

        <button type="button" onClick={() => setAdvancedOpen((open) => !open)} aria-expanded={advancedOpen} className={`co-button-secondary gap-2 py-2 text-xs ${advancedOpen ? "border-[var(--co-evergreen)] text-[var(--co-evergreen)]" : ""}`}>
          <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden />
          More filters{hasFilters ? ` (${[employeeId, type, recurrence, status, assignment, searchParams.get("zip")].filter(Boolean).length})` : ""}
        </button>

        {unassignedJobs ? <button type="button" onClick={() => setParam("queue", queueOpen ? "" : "unassigned")} aria-controls="unassigned-queue-list" aria-expanded={queueOpen} className={`co-button-secondary gap-2 py-2 text-xs ${queueOpen ? "border-[var(--co-evergreen)] text-[var(--co-evergreen)]" : ""}`}>
          <Inbox className="h-3.5 w-3.5" aria-hidden />
          {queueOpen ? "Hide unassigned jobs" : `Unassigned jobs (${unassignedJobs})`}
        </button> : null}

        {hasFilters ? <button type="button" onClick={clearAll} className="text-xs font-semibold text-[var(--co-evergreen)] hover:underline">Clear filters</button> : null}
        </div>
      </div>

      {isPending ? <p role="status" className="mt-2 text-xs text-[var(--co-muted)]">Updating calendar…</p> : null}

      {advancedOpen ? (
        <div className="mt-3 flex flex-wrap items-center justify-end gap-2 border-t border-[var(--co-line-soft)] pt-3">
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
