"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { TYPE_LABELS, displayCustomer, formatClockLabel, recurrenceLabel } from "./shared";
import { commitJobPatch } from "./drag-commit";
import { useUndoToast, UndoToast } from "./undo-toast";
import AssigneePicker from "./assignee-picker";

type Employee = { id: string; firstName: string; lastName: string };

type ListJob = {
  id: string;
  type: string;
  status: string;
  scheduledDate: string;
  scheduledStartTime: string | null;
  recurringSeriesId: string | null;
  recurrenceFrequency: string | null;
  companyName: string | null;
  clientType: string;
  customerFirstName: string;
  customerLastName: string;
  customerZip: string | null;
  customerCity: string | null;
  customerAddress: string | null;
  assignedUserIds: string[];
};

const STATUS_OPTIONS = [
  { value: "scheduled", label: "Scheduled" },
  { value: "in_progress", label: "In progress" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
  { value: "no_show", label: "No show" },
] as const;

export default function ListBoard({ employees, jobs: initialJobs }: { employees: Employee[]; jobs: ListJob[] }) {
  const router = useRouter();
  const [jobs, setJobs] = useState(initialJobs);
  const [syncedJobs, setSyncedJobs] = useState(initialJobs);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { toast, showUndo, dismiss } = useUndoToast();

  if (initialJobs !== syncedJobs) {
    setSyncedJobs(initialJobs);
    setJobs(initialJobs);
  }

  function commit(
    jobId: string,
    patch: Parameters<typeof commitJobPatch>[1],
    apply: (job: ListJob) => ListJob,
    undo?: { message: string; patch: Parameters<typeof commitJobPatch>[1]; apply: (job: ListJob) => ListJob }
  ) {
    commitJobPatch(jobId, patch, {
      onOptimistic: () => {
        setJobs((prev) => prev.map((candidate) => (candidate.id === jobId ? apply(candidate) : candidate)));
        setSavingId(jobId);
        setError(null);
      },
      onSuccess: () => {
        router.refresh();
        if (undo) {
          showUndo(undo.message, () => {
            commitJobPatch(jobId, undo.patch, {
              onOptimistic: () => setJobs((prev) => prev.map((candidate) => (candidate.id === jobId ? undo.apply(candidate) : candidate))),
              onSuccess: () => router.refresh(),
              onError: (message) => {
                setError(message);
                router.refresh();
              },
            });
          });
        }
      },
      onError: (message) => {
        setError(message);
        router.refresh();
      },
      onSettled: () => setSavingId(null),
    });
  }

  function commitDate(job: ListJob, newDate: string) {
    if (!newDate || newDate === job.scheduledDate) return;
    if (job.recurringSeriesId) {
      const conflict = jobs.some((candidate) => candidate.id !== job.id && candidate.recurringSeriesId === job.recurringSeriesId && candidate.scheduledDate === newDate);
      if (conflict) {
        setError("This recurring series already has a job scheduled on that date.");
        return;
      }
    }
    const previousDate = job.scheduledDate;
    commit(
      job.id,
      { scheduledDate: newDate },
      (candidate) => ({ ...candidate, scheduledDate: newDate }),
      {
        message: `Moved ${job.customerFirstName} ${job.customerLastName} to ${newDate}`,
        patch: { scheduledDate: previousDate },
        apply: (candidate) => ({ ...candidate, scheduledDate: previousDate }),
      }
    );
  }

  function commitTime(job: ListJob, newTime: string) {
    if (!newTime) return;
    const withSeconds = newTime.length === 5 ? `${newTime}:00` : newTime;
    if (withSeconds === job.scheduledStartTime) return;
    const previousTime = job.scheduledStartTime;
    commit(
      job.id,
      { scheduledStartTime: withSeconds },
      (candidate) => ({ ...candidate, scheduledStartTime: withSeconds }),
      {
        message: `Moved ${job.customerFirstName} ${job.customerLastName} to ${formatClockLabel(withSeconds)}`,
        patch: { scheduledStartTime: previousTime ?? undefined },
        apply: (candidate) => ({ ...candidate, scheduledStartTime: previousTime }),
      }
    );
  }

  function describeCrew(ids: string[]) {
    if (ids.length === 0) return "Unassigned";
    if (ids.length === 1) {
      const employee = employees.find((candidate) => candidate.id === ids[0]);
      return employee ? `${employee.firstName} ${employee.lastName}` : "Unassigned";
    }
    return `${ids.length} employees`;
  }

  function commitAssignee(job: ListJob, newAssignees: string[]) {
    const previousAssignees = job.assignedUserIds;
    const targetLabel = describeCrew(newAssignees);
    commit(
      job.id,
      { employeeIds: newAssignees },
      (candidate) => ({ ...candidate, assignedUserIds: newAssignees }),
      {
        message: `Reassigned ${job.customerFirstName} ${job.customerLastName} to ${targetLabel}`,
        patch: { employeeIds: previousAssignees },
        apply: (candidate) => ({ ...candidate, assignedUserIds: previousAssignees }),
      }
    );
  }

  function commitStatus(job: ListJob, status: string) {
    if (status === job.status) return;
    const previousStatus = job.status;
    commit(
      job.id,
      { status },
      (candidate) => ({ ...candidate, status }),
      {
        message: `Changed ${job.customerFirstName} ${job.customerLastName} to ${status.replaceAll("_", " ")}`,
        patch: { status: previousStatus },
        apply: (candidate) => ({ ...candidate, status: previousStatus }),
      }
    );
  }

  return (
    <div className="co-card overflow-hidden">
      <div className="border-b border-[var(--co-line-soft)] px-5 py-4">
        <p className="eyebrow">List view</p>
        <h2 className="mt-1 text-lg font-semibold">All scheduled jobs</h2>
        <p className="mt-1 text-xs text-[var(--co-muted)]">Edit any cell directly — changes save as soon as you leave the field.</p>
        {error ? <p className="mt-2 text-xs font-medium text-rose-600">{error}</p> : null}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[960px] text-left text-sm">
          <thead className="bg-[var(--co-surface-muted)] text-xs uppercase tracking-[0.1em] text-[var(--co-muted)]">
            <tr>
              <th className="px-5 py-3">Date</th>
              <th className="px-5 py-3">Time</th>
              <th className="px-5 py-3">Customer</th>
              <th className="px-5 py-3">Address</th>
                <th className="px-5 py-3">Client</th>
                <th className="px-5 py-3">Type</th>
              <th className="px-5 py-3">Assigned</th>
              <th className="px-5 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--co-line-soft)]">
            {jobs.map((job) => (
              <tr key={job.id} className={`hover:bg-[var(--co-surface-muted)]/50 ${savingId === job.id ? "opacity-50" : ""}`}>
                <td className="px-5 py-3">
                  <input
                    key={`date-${job.scheduledDate}`}
                    type="date"
                    defaultValue={job.scheduledDate}
                    onBlur={(event) => commitDate(job, event.target.value)}
                    className="co-input py-1.5 text-xs"
                    aria-label={`Date for ${job.customerFirstName} ${job.customerLastName}`}
                  />
                </td>
                <td className="px-5 py-3">
                  <input
                    key={`time-${job.scheduledStartTime}`}
                    type="time"
                    defaultValue={job.scheduledStartTime?.slice(0, 5) ?? ""}
                    onBlur={(event) => commitTime(job, event.target.value)}
                    className="co-input py-1.5 text-xs"
                    aria-label={`Time for ${job.customerFirstName} ${job.customerLastName}`}
                  />
                </td>
                <td className="px-5 py-3 font-medium">
                  <Link
                    href={`/jobs/${job.id}`}
                    className="-mx-5 -my-3 block px-5 py-3 text-[var(--co-evergreen)] hover:underline"
                  >
                    {displayCustomer(job)}
                  </Link>
                </td>
                <td className="px-5 py-3 text-xs text-[var(--co-muted)]">
                  {job.customerAddress ?? "No address"}
                  <span className="block">
                    {job.customerCity ?? ""} {job.customerZip ?? ""}
                  </span>
                </td>
                <td className="px-5 py-3 text-xs text-[var(--co-muted)]">
                  {job.clientType === "commercial" ? "Commercial" : "Residential"}
                  <span className="mt-0.5 block text-[var(--co-faint)]">{job.recurringSeriesId ? recurrenceLabel(job.recurrenceFrequency) : "One-time"}</span>
                </td>
                <td className="px-5 py-3 text-[var(--co-muted)]">{TYPE_LABELS[job.type] ?? job.type}</td>
                <td className="px-5 py-3">
                  <AssigneePicker
                    employees={employees}
                    assignedUserIds={job.assignedUserIds}
                    onChange={(ids) => commitAssignee(job, ids)}
                    ariaLabel={`Reassign ${job.customerFirstName} ${job.customerLastName}`}
                  />
                </td>
                <td className="px-5 py-3">
                  <select
                    key={`status-${job.status}`}
                    defaultValue={job.status}
                    onChange={(event) => commitStatus(job, event.target.value)}
                    className="co-input py-1.5 text-xs"
                    aria-label={`Status for ${job.customerFirstName} ${job.customerLastName}`}
                  >
                    {STATUS_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
            {jobs.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-5 py-6 text-sm text-[var(--co-muted)]">
                  No jobs scheduled in this window.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <UndoToast toast={toast} onDismiss={dismiss} />
    </div>
  );
}
