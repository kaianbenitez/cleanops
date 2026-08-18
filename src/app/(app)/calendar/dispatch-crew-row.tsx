import Link from "next/link";
import { CalendarPlus } from "lucide-react";
import type { CalendarEmployee, CalendarJob } from "./page";
import JobCard from "./job-card";
import { employeeColor } from "./shared";

export function DispatchCrewRow({
  employees,
  crewNames,
  ptoNote,
  jobs,
  finishLabel,
  onOpenDetail,
  onMoveAssign,
}: {
  employees: CalendarEmployee[];
  crewNames: string[];
  ptoNote: string | null;
  jobs: CalendarJob[];
  finishLabel: string | null;
  onOpenDetail: (jobId: string) => void;
  onMoveAssign: (jobId: string) => void;
}) {
  return (
    <section className="co-card overflow-hidden">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--co-line-soft)] bg-[var(--co-surface-muted)]/60 px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex shrink-0 -space-x-1">
            {jobs[0]?.assignedUserIds.map((id) => (
              <span
                key={id}
                className="h-2.5 w-2.5 rounded-full ring-2 ring-[var(--co-surface)]"
                style={{ background: employees.find((employee) => employee.id === id)?.calendarColor ?? employeeColor(id) }}
              />
            ))}
          </span>
          <p className="truncate text-sm font-semibold text-[var(--co-ink)]">{crewNames.join(" & ")}</p>
        </div>
        <div className="flex shrink-0 items-center gap-3 text-xs text-[var(--co-muted)]">
          {ptoNote ? <span className="co-badge-warning rounded-full px-2 py-0.5 font-semibold">{ptoNote}</span> : null}
          <span>{jobs.length} {jobs.length === 1 ? "job" : "jobs"}</span>
          {finishLabel ? <span>Finish ~{finishLabel}</span> : null}
        </div>
      </header>
      <div className="grid gap-2 p-3 sm:grid-cols-2 xl:grid-cols-3">
        {jobs.map((job) => (
          <JobCard
            key={job.id}
            job={job}
            employees={employees}
            variant="list"
            onOpen={onOpenDetail}
            onMoveAssign={onMoveAssign}
          />
        ))}
      </div>
    </section>
  );
}

/** Rendered instead of a crew row when a window has zero scheduled jobs — the
 * empty-window "next action" the redesign requires, not a bare "No jobs". */
export function EmptyWindowTarget({ label }: { label: string }) {
  return (
    <section className="co-card flex flex-col items-center justify-center gap-2 border-dashed p-6 text-center">
      <p className="text-sm font-medium text-[var(--co-muted)]">{label}</p>
      <Link href="/jobs/new" className="co-button-secondary gap-2 min-h-11">
        <CalendarPlus className="h-4 w-4" aria-hidden />
        Schedule job
      </Link>
    </section>
  );
}
