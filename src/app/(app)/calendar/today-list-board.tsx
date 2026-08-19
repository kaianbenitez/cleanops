"use client";

import { Fragment, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { APPOINTMENT_COLOR, APPOINTMENT_COLOR_CANCELLED, displayCustomer, formatAppointmentTime, formatClockLabel, formatEstimatedTime, jobTypeLabel, ordinalLabel, stopOrdinals } from "./shared";
import { commitJobPatch } from "./drag-commit";
import { useUndoToast, UndoToast } from "./undo-toast";
import AssigneePicker from "./assignee-picker";
import JobDetailPanel from "./job-detail-panel";
import AppointmentPanel from "./appointment-panel";
import { StatusPill } from "@/components/ui/status-pill";
import { formatElapsed } from "@/lib/my-day/job-format";
import { cleanNoteText } from "@/lib/format";
import ClientHomeSymbols from "./client-home-symbols";
import type { CalendarAppointment, StaffRosterMember } from "./page";

type Employee = { id: string; firstName: string; lastName: string; isActive?: boolean };

type ListJob = {
  id: string;
  type: string;
  recurrenceFrequency: string | null;
  status: string;
  scheduledDate: string;
  scheduledStartTime: string | null;
  companyName: string | null;
  clientType: string;
  customerFirstName: string;
  customerLastName: string;
  customerZip: string | null;
  customerCity: string | null;
  customerAddress: string | null;
  customerHomeDetails: Record<string, unknown>;
  roomCounts: { name: string; count: number }[];
  estimatedDurationMinutes: number | null;
  priceCents: number;
  serviceName: string | null;
  addOnNames: string[];
  customerNotes: string | null;
  gateCodeOrKeyNotes: string | null;
  doNotClean: string | null;
  petNotes: string | null;
  assignedUserIds: string[];
};

type TimeEntryRow = {
  id: string;
  jobId: string;
  userId: string;
  clockIn: string;
  clockOut: string | null;
  minutesWorked: number | null;
};

const STATUS_OPTIONS = [
  { value: "scheduled", label: "Scheduled" },
  { value: "in_progress", label: "In progress" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
  { value: "no_show", label: "No show" },
] as const;

function clockStatus(entries: TimeEntryRow[], now: number) {
  const open = entries.find((entry) => !entry.clockOut);
  if (open) return { label: `Cleaning · ${formatElapsed(open.clockIn, now)}`, className: "co-badge-success" };
  if (entries.length) {
    const totalMinutes = entries.reduce((sum, entry) => sum + (entry.minutesWorked ?? 0), 0);
    const hours = Math.floor(totalMinutes / 60);
    const duration = hours ? `${hours}h ${totalMinutes % 60}m` : `${totalMinutes}m`;
    return { label: `Cleaned · ${duration}`, className: "co-badge-neutral" };
  }
  return { label: "Not started", className: "co-badge-muted" };
}

export default function TodayListBoard({
  dayLabel,
  isToday,
  employees,
  jobs: initialJobs,
  timeEntries,
  appointments = [],
  staffRoster = [],
}: {
  dayLabel: string;
  isToday: boolean;
  employees: Employee[];
  jobs: ListJob[];
  timeEntries: TimeEntryRow[];
  appointments?: CalendarAppointment[];
  staffRoster?: StaffRosterMember[];
}) {
  const router = useRouter();
  const [jobs, setJobs] = useState(initialJobs);
  const [syncedJobs, setSyncedJobs] = useState(initialJobs);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [confirmingCancelId, setConfirmingCancelId] = useState<string | null>(null);
  const [cancellationReasons, setCancellationReasons] = useState<Record<string, string>>({});
  const [detailJobId, setDetailJobId] = useState<string | null>(null);
  const [editingAppointmentId, setEditingAppointmentId] = useState<string | null>(null);
  const [now, setNow] = useState(0);
  const sortedAppointments = [...appointments].sort((a, b) => (a.startTime ?? "99").localeCompare(b.startTime ?? "99"));
  const { toast, showUndo, dismiss } = useUndoToast();
  const ordinalByJobId = stopOrdinals(jobs);

  if (initialJobs !== syncedJobs) {
    setSyncedJobs(initialJobs);
    setJobs(initialJobs);
  }

  useEffect(() => {
    // Initialize the client-only clock after hydration, then keep the "clocked in" durations current.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  function entriesFor(jobId: string, userId: string) {
    return timeEntries.filter((entry) => entry.jobId === jobId && entry.userId === userId);
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
        setWarning(null);
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
      onWarning: setWarning,
      onError: (message) => {
        setError(message);
        router.refresh();
      },
      onSettled: () => setSavingId(null),
    });
  }

  function commitDate(job: ListJob, newDate: string) {
    if (!newDate || newDate === job.scheduledDate) return;
    const previousDate = job.scheduledDate;
    commit(
      job.id,
      { scheduledDate: newDate },
      (candidate) => ({ ...candidate, scheduledDate: newDate }),
      {
        message: `Rescheduled ${job.customerFirstName} ${job.customerLastName} to ${newDate}`,
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
        message: `Rescheduled ${job.customerFirstName} ${job.customerLastName} to ${formatClockLabel(withSeconds)}`,
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

  function commitStatus(job: ListJob, status: string, cancellationReason?: string) {
    if (status === job.status) return;
    const previousStatus = job.status;
    commit(
      job.id,
      { status, ...(cancellationReason ? { cancellationReason } : {}) },
      (candidate) => ({ ...candidate, status }),
      {
        message: `Changed ${job.customerFirstName} ${job.customerLastName} to ${status.replaceAll("_", " ")}`,
        patch: { status: previousStatus },
        apply: (candidate) => ({ ...candidate, status: previousStatus }),
      }
    );
  }

  function cancelJob(job: ListJob) {
    const reason = cancellationReasons[job.id]?.trim();
    if (!reason) {
      setError("Enter a cancellation reason before cancelling this job.");
      return;
    }
    setConfirmingCancelId(null);
    setCancellationReasons((current) => ({ ...current, [job.id]: "" }));
    commitStatus(job, "cancelled", reason);
  }

  function changeStatus(job: ListJob, status: string, select: HTMLSelectElement) {
    if (status === "cancelled") {
      select.value = job.status;
      setConfirmingCancelId(job.id);
      return;
    }
    commitStatus(job, status);
  }

  return (
    <div className="co-card overflow-hidden">
      <div className="border-b border-[var(--co-line-soft)] px-5 py-4">
        <p className="eyebrow">List view</p>
        <h2 className="mt-1 text-lg font-semibold">{isToday ? "Today" : dayLabel}&apos;s jobs</h2>
        <p className="mt-1 text-xs text-[var(--co-muted)]">Edit date, time, or crew directly — changes save as soon as you leave the field.</p>
        {error ? <p className="mt-2 text-xs font-medium text-[var(--co-danger)]">{error}</p> : null}
        {warning ? <p role="status" className="co-badge-warning mt-2 px-3 py-2 text-xs font-medium">Scheduling warning: {warning}</p> : null}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1240px] text-left text-base">
          <thead className="bg-[var(--co-surface-muted)] text-sm uppercase tracking-[0.08em] text-[var(--co-muted)]">
            <tr>
              <th className="px-5 py-3">Time</th>
              <th className="px-5 py-3">Customer</th>
              <th className="px-5 py-3">Assigned</th>
              <th className="px-5 py-3">Status</th>
              <th className="px-5 py-3">Cleaning time</th>
              <th className="px-5 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--co-line-soft)]">
            {sortedAppointments.map((appointment) => (
              <tr key={appointment.id} className={appointment.status === "cancelled" ? "bg-[var(--co-surface-muted)]" : "bg-[var(--co-spark-tint)]/40"}>
                <td className="px-5 py-3 font-medium">{formatAppointmentTime(appointment.startTime, appointment.durationMinutes)}</td>
                <td className="px-5 py-3 font-medium" colSpan={4}>
                  <button type="button" onClick={() => setEditingAppointmentId(appointment.id)} className="text-base text-[var(--co-accent-text)] hover:underline">
                    📅 {appointment.title}
                  </button>
                  <span className={`ml-2 inline-block rounded-full px-2.5 py-1 text-xs font-semibold ${appointment.status === "cancelled" ? APPOINTMENT_COLOR_CANCELLED : APPOINTMENT_COLOR}`}>
                    {appointment.status === "cancelled" ? "Cancelled meeting" : "Meeting"}
                  </span>
                  <span className="ml-2 text-sm text-[var(--co-muted)]">{appointment.attendeeUserIds.length} attendee{appointment.attendeeUserIds.length === 1 ? "" : "s"}</span>
                </td>
                <td className="px-5 py-3">
                  <button type="button" onClick={() => setEditingAppointmentId(appointment.id)} className="text-xs font-semibold text-[var(--co-accent-text)] hover:underline">
                    Edit
                  </button>
                </td>
              </tr>
            ))}
            {jobs.map((job) => {
              const assignedEmployees = job.assignedUserIds
                .map((id) => employees.find((employee) => employee.id === id))
                .filter((employee): employee is Employee => Boolean(employee));
              const cancellable = job.status !== "cancelled" && job.status !== "completed";
              const hasNotes = Boolean(job.gateCodeOrKeyNotes || job.petNotes || job.doNotClean || job.customerNotes);
              return (
                <Fragment key={job.id}>
                <tr className={`align-top hover:bg-[var(--co-surface-muted)]/50 ${savingId === job.id ? "opacity-50" : ""}`}>
                  <td className="px-5 py-3">
                    <input
                      key={`date-${job.scheduledDate}`}
                      type="date"
                      defaultValue={job.scheduledDate}
                      onBlur={(event) => commitDate(job, event.target.value)}
                      className="co-input py-1.5 text-sm"
                      aria-label={`Date for ${job.customerFirstName} ${job.customerLastName}`}
                    />
                    <input
                      key={`time-${job.scheduledStartTime}`}
                      type="time"
                      defaultValue={job.scheduledStartTime?.slice(0, 5) ?? ""}
                      onBlur={(event) => commitTime(job, event.target.value)}
                      className="co-input mt-1.5 py-1.5 text-sm"
                      aria-label={`Time for ${job.customerFirstName} ${job.customerLastName}`}
                    />
                    <p className="mt-1.5 text-sm text-[var(--co-muted)]">{formatEstimatedTime(job.estimatedDurationMinutes)}</p>
                  </td>
                  <td className="px-5 py-3 font-medium">
                    <button
                      type="button"
                      onClick={() => setDetailJobId(job.id)}
                      className="text-base text-[var(--co-accent-text)] hover:underline"
                    >
                      {displayCustomer(job)}
                    </button>
                    {ordinalByJobId.get(job.id) ? (
                      <span className="ml-2 rounded bg-[var(--co-accent-tint)] px-1.5 py-0.5 text-xs font-semibold text-[var(--co-accent-text)]">
                        {ordinalLabel(ordinalByJobId.get(job.id)!)}
                      </span>
                    ) : null}
                    <ClientHomeSymbols className="mt-1" roomCounts={job.roomCounts} gateCodeOrKeyNotes={job.gateCodeOrKeyNotes} petNotes={job.petNotes} />
                    <p className="mt-1 text-sm text-[var(--co-muted)]">
                      {job.customerAddress ?? "No address"}
                      {job.customerCity ? `, ${job.customerCity}` : ""} {job.customerZip ?? ""}
                    </p>
                    <p className="mt-1 text-xs uppercase tracking-[0.08em] text-[var(--co-faint)]">
                      {job.clientType === "commercial" ? "Commercial" : "Residential"}
                    </p>
                    <p className="mt-1.5 text-sm text-[var(--co-ink)]">
                      {job.serviceName ?? jobTypeLabel(job)}
                      {job.addOnNames.length ? ` + ${job.addOnNames.join(", ")}` : ""}
                      <span className="ml-1.5 font-medium text-[var(--co-muted)]">${(job.priceCents / 100).toFixed(2)}</span>
                    </p>
                  </td>
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
                      onChange={(event) => changeStatus(job, event.target.value, event.currentTarget)}
                      className="co-input py-1.5 text-sm"
                      aria-label={`Status for ${job.customerFirstName} ${job.customerLastName}`}
                    >
                      {STATUS_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-5 py-3">
                    {assignedEmployees.length === 0 ? (
                      <span className="text-xs text-[var(--co-faint)]">—</span>
                    ) : (
                      <ul className="space-y-1">
                        {assignedEmployees.map((employee) => {
                          const state = clockStatus(entriesFor(job.id, employee.id), now);
                          return (
                            <li key={employee.id} className="text-sm">
                              <span className="text-[var(--co-muted)]">
                                {employee.firstName} {employee.lastName}
                                {employee.isActive === false ? " (Inactive): " : ": "}
                              </span>
                              <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-1 font-semibold ${state.className}`}>{state.label}</span>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <button type="button" disabled title="Invoice action coming soon" className="mb-3 rounded-lg border border-[var(--co-line)] bg-[var(--co-surface-muted)] px-3 py-1.5 text-sm font-semibold text-[var(--co-muted)] disabled:cursor-not-allowed">
                      Invoice — coming soon
                    </button>
                    {job.status === "cancelled" ? (
                      <StatusPill domain="job" status="cancelled" />
                    ) : confirmingCancelId === job.id ? (
                      <div className="flex flex-col items-start gap-1.5">
                        <p className="text-xs font-medium text-[var(--co-danger)]">Cancel this appointment?</p>
                        <textarea value={cancellationReasons[job.id] ?? ""} onChange={(event) => setCancellationReasons((current) => ({ ...current, [job.id]: event.target.value }))} rows={2} placeholder="Why is this job being cancelled?" className="co-input w-full resize-none text-xs" />
                        <div className="flex gap-1.5">
                          <button type="button" disabled={savingId === job.id} onClick={() => { setConfirmingCancelId(null); setCancellationReasons((current) => ({ ...current, [job.id]: "" })); }} className="co-button-secondary py-1 text-xs disabled:opacity-50">
                            Keep job
                          </button>
                          <button
                            type="button"
                            disabled={savingId === job.id || !cancellationReasons[job.id]?.trim()}
                            onClick={() => cancelJob(job)}
                            className="rounded-lg border border-[var(--co-danger)]/30 bg-[var(--co-danger)]/10 px-3 py-1 text-xs font-semibold text-[var(--co-danger)] hover:bg-[var(--co-danger)]/20 disabled:opacity-50"
                          >
                            Confirm cancel
                          </button>
                        </div>
                      </div>
                    ) : cancellable ? (
                      <button type="button" disabled={savingId === job.id} onClick={() => setConfirmingCancelId(job.id)} className="text-xs font-semibold text-[var(--co-danger)] hover:underline disabled:opacity-50">
                        Cancel
                      </button>
                    ) : (
                      <span className="text-xs text-[var(--co-faint)]">—</span>
                    )}
                  </td>
                </tr>
                {hasNotes ? (
                  <tr className={savingId === job.id ? "opacity-50" : ""}>
                    <td colSpan={6} className="border-t border-[var(--co-line-soft)] bg-[var(--co-surface-muted)]/40 px-5 py-3 text-sm text-[var(--co-muted)]">
                      <div className="grid gap-3 sm:grid-cols-2">
                        {job.gateCodeOrKeyNotes ? (
                          <p className="whitespace-pre-wrap break-words">
                            <span className="font-semibold text-[var(--co-ink)]">Access: </span>
                            {cleanNoteText(job.gateCodeOrKeyNotes)}
                          </p>
                        ) : null}
                        {job.petNotes ? (
                          <p className="whitespace-pre-wrap break-words">
                            <span className="font-semibold text-[var(--co-ink)]">Pets: </span>
                            {cleanNoteText(job.petNotes)}
                          </p>
                        ) : null}
                        {job.doNotClean ? (
                          <p className="whitespace-pre-wrap break-words">
                            <span className="font-semibold text-[var(--co-danger)]">Don&apos;t clean: </span>
                            {cleanNoteText(job.doNotClean)}
                          </p>
                        ) : null}
                        {job.customerNotes ? (
                          <p className="whitespace-pre-wrap break-words sm:col-span-2">
                            <span className="font-semibold text-[var(--co-ink)]">Notes: </span>
                            {cleanNoteText(job.customerNotes)}
                          </p>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ) : null}
                </Fragment>
              );
            })}
            {jobs.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-5 py-6 text-sm text-[var(--co-muted)]">
                  No jobs scheduled for this day.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <UndoToast toast={toast} onDismiss={dismiss} />
      <JobDetailPanel
        jobId={detailJobId}
        employees={employees}
        onClose={() => setDetailJobId(null)}
      />
      {editingAppointmentId ? (
        <AppointmentPanel
          mode="edit"
          eventId={editingAppointmentId}
          staffRoster={staffRoster}
          defaultDate={appointments.find((appointment) => appointment.id === editingAppointmentId)?.scheduledDate ?? ""}
          onClose={() => setEditingAppointmentId(null)}
        />
      ) : null}
    </div>
  );
}
