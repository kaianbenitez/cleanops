"use client";

import { useState } from "react";
import { AlertTriangle, CalendarPlus, ChevronDown, UserPlus } from "lucide-react";
import type { CalendarEmployee, CalendarJob } from "./page";
import { displayCustomer, formatClockLabel, type AttentionCategory } from "./shared";

export type AttentionEntry = { job: CalendarJob; category: AttentionCategory };

const CATEGORY_LABEL: Record<AttentionCategory, string> = {
  unassigned: "No crew assigned",
  "no-time": "No arrival time",
  conflict: "PTO conflict",
};
const CATEGORY_ACTION: Record<AttentionCategory, string> = {
  unassigned: "Assign crew",
  "no-time": "Schedule",
  conflict: "Review conflict",
};
const CATEGORY_ICON: Record<AttentionCategory, typeof UserPlus> = {
  unassigned: UserPlus,
  "no-time": CalendarPlus,
  conflict: AlertTriangle,
};

function AttentionCard({ entry, employees, onSchedule }: { entry: AttentionEntry; employees: CalendarEmployee[]; onSchedule: (jobId: string) => void }) {
  const Icon = CATEGORY_ICON[entry.category];
  const crewNames = entry.job.assignedUserIds
    .map((id) => employees.find((employee) => employee.id === id))
    .filter((employee): employee is CalendarEmployee => Boolean(employee))
    .map((employee) => `${employee.firstName} ${employee.lastName}`);
  return (
    <div className="co-card flex items-center justify-between gap-3 p-3">
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-[var(--co-warning)]">
          <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
          {CATEGORY_LABEL[entry.category]}
        </p>
        <p className="mt-1 truncate text-sm font-semibold text-[var(--co-ink)]">{displayCustomer(entry.job)}</p>
        <p className="mt-0.5 truncate text-xs text-[var(--co-muted)]">
          {entry.job.scheduledStartTime ? formatClockLabel(entry.job.scheduledStartTime) : "No time set"}
          {crewNames.length ? ` · ${crewNames.join(", ")}` : ""}
          {entry.job.customerZip ? ` · ${entry.job.customerZip}` : ""}
        </p>
      </div>
      <button type="button" onClick={() => onSchedule(entry.job.id)} className="co-button-primary min-h-11 shrink-0">
        {CATEGORY_ACTION[entry.category]}
      </button>
    </div>
  );
}

export default function AttentionQueue({
  entries,
  cancelledJobs,
  employees,
  onSchedule,
}: {
  entries: AttentionEntry[];
  cancelledJobs: CalendarJob[];
  employees: CalendarEmployee[];
  onSchedule: (jobId: string) => void;
}) {
  const [showCancelled, setShowCancelled] = useState(false);
  if (entries.length === 0 && cancelledJobs.length === 0) return null;

  return (
    <section aria-label="Needs attention" className="co-card space-y-3 p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-[var(--co-ink)]">Needs attention</h2>
        <span className="co-badge-warning rounded-full px-2.5 py-0.5 text-xs font-semibold">{entries.length}</span>
      </div>
      {entries.length ? (
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {entries.map((entry) => (
            <AttentionCard key={entry.job.id} entry={entry} employees={employees} onSchedule={onSchedule} />
          ))}
        </div>
      ) : (
        <p className="text-sm text-[var(--co-muted)]">Nothing needs attention right now.</p>
      )}

      {cancelledJobs.length ? (
        <div className="border-t border-[var(--co-line-soft)] pt-3">
          <button
            type="button"
            onClick={() => setShowCancelled((current) => !current)}
            aria-expanded={showCancelled}
            className="flex min-h-11 items-center gap-1.5 text-xs font-semibold text-[var(--co-muted)]"
          >
            <ChevronDown className={`h-3.5 w-3.5 transition ${showCancelled ? "rotate-180" : ""}`} aria-hidden />
            {showCancelled ? "Hide" : "Show"} cancelled / no-show ({cancelledJobs.length})
          </button>
          {showCancelled ? (
            <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {cancelledJobs.map((job) => (
                <a
                  key={job.id}
                  href={`/jobs/${job.id}`}
                  className="co-card block p-3 text-left opacity-70 hover:opacity-100"
                >
                  <p className="text-sm font-semibold text-[var(--co-ink)]">{displayCustomer(job)}</p>
                  <p className="mt-0.5 text-xs text-[var(--co-muted)]">{job.status === "cancelled" ? "Cancelled" : "No show"}</p>
                </a>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
