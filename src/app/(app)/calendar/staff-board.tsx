"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  TYPE_LABELS,
  TYPE_COLORS,
  STAFF_RANGE_START,
  STAFF_RANGE_MINUTES,
  hourLabel,
  minutesFromTime,
  employeeColor,
  jobDuration,
  jobsOverlap,
  formatClockLabel,
  isPlainClick,
} from "./shared";
import { commitJobPatch } from "./drag-commit";
import { useUndoToast, UndoToast } from "./undo-toast";
import JobDetailPanel from "./job-detail-panel";

type Employee = { id: string; firstName: string; lastName: string };

type StaffJob = {
  id: string;
  type: string;
  status: string;
  scheduledStartTime: string | null;
  estimatedDurationMinutes: number | null;
  customerFirstName: string;
  customerLastName: string;
  customerZip: string | null;
  assignedUserIds: string[];
};

const LOCKED_STATUSES = ["completed", "cancelled", "no_show"];
const UNASSIGNED_ROW = "__unassigned__";

function formatTime(totalMinutes: number) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:00`;
}

export default function StaffBoard({ dayLabel, employees, jobs: initialJobs }: { dayLabel: string; employees: Employee[]; jobs: StaffJob[] }) {
  const router = useRouter();
  const [jobs, setJobs] = useState(initialJobs);
  const [syncedJobs, setSyncedJobs] = useState(initialJobs);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOverRow, setDragOverRow] = useState<string | null>(null);
  const [detailJobId, setDetailJobId] = useState<string | null>(null);
  const { toast, showUndo, dismiss } = useUndoToast();

  if (initialJobs !== syncedJobs) {
    setSyncedJobs(initialJobs);
    setJobs(initialJobs);
  }

  function handleDrop(event: React.DragEvent<HTMLDivElement>, employeeId: string | null) {
    event.preventDefault();
    setDragOverRow(null);
    const jobId = event.dataTransfer.getData("text/plain");
    if (!jobId) return;
    const job = jobs.find((candidate) => candidate.id === jobId);
    if (!job || LOCKED_STATUSES.includes(job.status)) return;

    const rect = event.currentTarget.getBoundingClientRect();
    const pct = Math.min(Math.max((event.clientX - rect.left) / rect.width, 0), 1);
    const rawMinutes = STAFF_RANGE_START + pct * STAFF_RANGE_MINUTES;
    const snapped = Math.round(rawMinutes / 15) * 15;
    const clampedStart = Math.min(Math.max(snapped, STAFF_RANGE_START), STAFF_RANGE_START + STAFF_RANGE_MINUTES);
    const newTime = formatTime(clampedStart);
    const previousTime = job.scheduledStartTime;
    const previousAssignees = job.assignedUserIds;
    const targetEmployee = employeeId ? employees.find((employee) => employee.id === employeeId) : null;
    // Dropping on an employee's row ADDS them to the existing crew (someone jumping in to help);
    // dropping on the Unassigned row is the explicit gesture to clear the whole crew.
    const newAssignees = employeeId ? Array.from(new Set([...job.assignedUserIds, employeeId])) : [];
    const toastMessage = employeeId
      ? `Added ${targetEmployee ? `${targetEmployee.firstName} ${targetEmployee.lastName}` : "employee"} to ${job.customerFirstName} ${job.customerLastName}'s crew at ${formatClockLabel(newTime)}`
      : `Unassigned ${job.customerFirstName} ${job.customerLastName}`;

    commitJobPatch(
      jobId,
      { scheduledStartTime: newTime, employeeIds: newAssignees },
      {
        onOptimistic: () => {
          setJobs((prev) => prev.map((candidate) => (candidate.id === jobId ? { ...candidate, scheduledStartTime: newTime, assignedUserIds: newAssignees } : candidate)));
          setSavingId(jobId);
          setError(null);
        },
        onSuccess: () => {
          router.refresh();
          showUndo(toastMessage, () => {
            commitJobPatch(jobId, { scheduledStartTime: previousTime ?? undefined, employeeIds: previousAssignees }, {
              onOptimistic: () => setJobs((prev) => prev.map((candidate) => (candidate.id === jobId ? { ...candidate, scheduledStartTime: previousTime, assignedUserIds: previousAssignees } : candidate))),
              onSuccess: () => router.refresh(),
              onError: (message) => {
                setError(message);
                router.refresh();
              },
            });
          });
        },
        onError: (message) => {
          setError(message);
          router.refresh();
        },
        onSettled: () => setSavingId(null),
      }
    );
  }

  const rowsData: { id: string; label: string; color: string; jobsForRow: StaffJob[] }[] = [
    ...employees.map((employee) => ({
      id: employee.id,
      label: `${employee.firstName} ${employee.lastName}`,
      color: employeeColor(employee.id),
      jobsForRow: jobs.filter((job) => job.assignedUserIds.includes(employee.id)),
    })),
    {
      id: UNASSIGNED_ROW,
      label: "Unassigned",
      color: "#94a3b8",
      jobsForRow: jobs.filter((job) => job.assignedUserIds.length === 0),
    },
  ];

  return (
    <div className="co-card overflow-hidden">
      <div className="border-b border-[var(--co-line-soft)] px-5 py-4">
        <p className="eyebrow">Staff view</p>
        <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="mt-1 text-lg font-semibold">{dayLabel}</h2>
            <p className="mt-1 text-xs text-[var(--co-muted)]">
              Drag a job to reschedule it or move it to another technician. A dashed outline means that person is double-booked.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {Object.entries(TYPE_LABELS).map(([value, label]) => (
              <span key={value} className="flex items-center gap-1.5 text-[10px] font-medium text-[var(--co-muted)]">
                <span className={`h-2.5 w-2.5 rounded-full border ${TYPE_COLORS[value] ?? "border-slate-300 bg-slate-50"}`} />
                {label}
              </span>
            ))}
          </div>
        </div>
        {error ? <p className="mt-2 text-xs font-medium text-rose-600">{error}</p> : null}
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[1100px] p-4">
          <div className="grid" style={{ gridTemplateColumns: "180px repeat(12, minmax(0, 1fr))" }}>
            <div />
            {Array.from({ length: 12 }, (_, index) => 7 + index).map((hour) => (
              <div key={hour} className="border-b border-[var(--co-line-soft)] pb-2 text-center text-[11px] font-medium text-[var(--co-muted)]">
                {hourLabel(hour * 60)}
              </div>
            ))}
          </div>

          {rowsData.map((row) => {
            const isUnassignedRow = row.id === UNASSIGNED_ROW;
            return (
              <div key={row.id} className="grid items-stretch" style={{ gridTemplateColumns: "180px 1fr" }}>
                <div className={`flex items-center gap-2 border-b border-r border-[var(--co-line-soft)] px-3 py-2 ${isUnassignedRow ? "bg-[var(--co-surface-muted)]/40" : ""}`}>
                  <span className={`h-2 w-2 shrink-0 rounded-full ${isUnassignedRow ? "border border-dashed border-slate-400" : ""}`} style={{ background: isUnassignedRow ? "transparent" : row.color }} />
                  <div>
                    <p className="text-sm font-medium text-[var(--co-ink)]">{row.label}</p>
                    <p className="text-[10px] text-[var(--co-muted)]">
                      {row.jobsForRow.length} job{row.jobsForRow.length === 1 ? "" : "s"}
                    </p>
                  </div>
                </div>
                <div
                  className={`relative h-16 border-b border-[var(--co-line-soft)] transition-colors ${
                    dragOverRow === row.id ? "bg-emerald-50" : isUnassignedRow ? "bg-[var(--co-surface-muted)]/20" : "bg-white"
                  }`}
                  onDragOver={(event) => {
                    event.preventDefault();
                    if (dragOverRow !== row.id) setDragOverRow(row.id);
                  }}
                  onDragLeave={() => setDragOverRow((current) => (current === row.id ? null : current))}
                  onDrop={(event) => handleDrop(event, isUnassignedRow ? null : row.id)}
                >
                  {Array.from({ length: 11 }, (_, index) => index + 1).map((line) => (
                    <div key={line} className="absolute top-0 bottom-0 w-px bg-[var(--co-line-soft)]/60" style={{ left: `${(line / 12) * 100}%` }} />
                  ))}
                  {row.jobsForRow.map((job) => {
                    const duration = jobDuration(job);
                    const startMinutes = minutesFromTime(job.scheduledStartTime);
                    const left = Math.min(Math.max(((startMinutes - STAFF_RANGE_START) / STAFF_RANGE_MINUTES) * 100, 0), 100);
                    const width = Math.min(Math.max((duration / STAFF_RANGE_MINUTES) * 100, 4), 100 - left);
                    const conflict = !isUnassignedRow && row.jobsForRow.some((other) => other.id !== job.id && jobsOverlap(job, duration, other, jobDuration(other)));
                    const locked = LOCKED_STATUSES.includes(job.status);
                    return (
                      <Link
                        key={job.id}
                        href={`/jobs/${job.id}`}
                        onClick={(event) => {
                          if (!isPlainClick(event)) return;
                          event.preventDefault();
                          setDetailJobId(job.id);
                        }}
                        draggable={!locked}
                        onDragStart={(event) => {
                          if (locked) {
                            event.preventDefault();
                            return;
                          }
                          event.dataTransfer.setData("text/plain", job.id);
                          event.dataTransfer.effectAllowed = "move";
                        }}
                        className={`absolute top-1.5 bottom-1.5 overflow-hidden rounded-lg border px-2 py-1 text-[10px] leading-tight shadow-sm transition-transform ${
                          locked ? "cursor-default opacity-70" : "cursor-grab hover:-translate-y-0.5 active:cursor-grabbing"
                        } ${TYPE_COLORS[job.type] ?? "border-slate-300 bg-slate-50 text-slate-700"} ${conflict ? "border-2 border-dashed border-rose-500" : ""} ${
                          savingId === job.id ? "opacity-50" : ""
                        }`}
                        style={{ left: `${left}%`, width: `${width}%` }}
                      >
                        <div className="flex items-center gap-1 truncate font-semibold">
                          {job.status === "in_progress" ? <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" /> : null}
                          <span className="truncate">
                            {job.scheduledStartTime?.slice(0, 5)} {job.customerFirstName} {job.customerLastName}
                          </span>
                        </div>
                        <div className="truncate opacity-75">{job.customerZip ?? "No zip"}</div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <UndoToast toast={toast} onDismiss={dismiss} />
      <JobDetailPanel jobId={detailJobId} employees={employees} onClose={() => setDetailJobId(null)} />
    </div>
  );
}
