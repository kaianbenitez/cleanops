"use client";

import { StatusPill } from "@/components/ui/status-pill";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  TYPE_LABELS,
  hourLabel,
  minutesFromTime,
  employeeColor,
  jobDuration,
  formatClockLabel,
  STAFF_RANGE_START,
  STAFF_RANGE_MINUTES,
} from "./shared";
import { commitJobPatch } from "./drag-commit";
import { useUndoToast, UndoToast } from "./undo-toast";
import AssigneePicker from "./assignee-picker";

type Employee = { id: string; firstName: string; lastName: string };

type DayJob = {
  id: string;
  type: string;
  status: string;
  scheduledStartTime: string | null;
  estimatedDurationMinutes: number | null;
  priceCents: number;
  customerFirstName: string;
  customerLastName: string;
  customerZip: string | null;
  assignedUserIds: string[];
};

const LOCKED_STATUSES = ["completed", "cancelled", "no_show"];
const HOURS = 12;
const ROW_PX = 48;
const TOTAL_HEIGHT = HOURS * ROW_PX;

function formatTime(totalMinutes: number) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:00`;
}

function Pill({ status }: { status: string }) {
  return <StatusPill domain="job" status={status} />;
}

export default function DayBoard({ dayLabel, employees, jobs: initialJobs }: { dayLabel: string; employees: Employee[]; jobs: DayJob[] }) {
  const router = useRouter();
  const [jobs, setJobs] = useState(initialJobs);
  const [syncedJobs, setSyncedJobs] = useState(initialJobs);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [dragOverRail, setDragOverRail] = useState(false);
  const { toast, showUndo, dismiss } = useUndoToast();

  if (initialJobs !== syncedJobs) {
    setSyncedJobs(initialJobs);
    setJobs(initialJobs);
  }

  function commitTime(jobId: string, newTime: string) {
    const job = jobs.find((candidate) => candidate.id === jobId);
    if (!job) return;
    const previousTime = job.scheduledStartTime;
    commitJobPatch(
      jobId,
      { scheduledStartTime: newTime },
      {
        onOptimistic: () => {
          setJobs((prev) => prev.map((candidate) => (candidate.id === jobId ? { ...candidate, scheduledStartTime: newTime } : candidate)));
          setSavingId(jobId);
          setError(null);
          setWarning(null);
        },
        onSuccess: () => {
          router.refresh();
          showUndo(`Moved ${job.customerFirstName} ${job.customerLastName} to ${formatClockLabel(newTime)}`, () => {
            commitJobPatch(jobId, { scheduledStartTime: previousTime ?? undefined }, {
              onOptimistic: () => setJobs((prev) => prev.map((candidate) => (candidate.id === jobId ? { ...candidate, scheduledStartTime: previousTime } : candidate))),
              onSuccess: () => router.refresh(),
              onError: (message) => {
                setError(message);
                router.refresh();
              },
            });
          });
        },
        onWarning: setWarning,
        onError: (message) => {
          setError(message);
          router.refresh();
        },
        onSettled: () => setSavingId(null),
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

  function commitAssignee(jobId: string, newAssignees: string[]) {
    const job = jobs.find((candidate) => candidate.id === jobId);
    if (!job) return;
    const previousAssignees = job.assignedUserIds;
    const targetLabel = describeCrew(newAssignees);
    commitJobPatch(
      jobId,
      { employeeIds: newAssignees },
      {
        onOptimistic: () => {
          setJobs((prev) => prev.map((candidate) => (candidate.id === jobId ? { ...candidate, assignedUserIds: newAssignees } : candidate)));
          setSavingId(jobId);
          setError(null);
          setWarning(null);
        },
        onSuccess: () => {
          router.refresh();
          showUndo(`Reassigned ${job.customerFirstName} ${job.customerLastName} to ${targetLabel}`, () => {
            commitJobPatch(jobId, { employeeIds: previousAssignees }, {
              onOptimistic: () => setJobs((prev) => prev.map((candidate) => (candidate.id === jobId ? { ...candidate, assignedUserIds: previousAssignees } : candidate))),
              onSuccess: () => router.refresh(),
              onError: (message) => {
                setError(message);
                router.refresh();
              },
            });
          });
        },
        onWarning: setWarning,
        onError: (message) => {
          setError(message);
          router.refresh();
        },
        onSettled: () => setSavingId(null),
      }
    );
  }

  function handleRailDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragOverRail(false);
    const jobId = event.dataTransfer.getData("text/plain");
    if (!jobId) return;
    const job = jobs.find((candidate) => candidate.id === jobId);
    if (!job || LOCKED_STATUSES.includes(job.status)) return;

    const rect = event.currentTarget.getBoundingClientRect();
    const pct = Math.min(Math.max((event.clientY - rect.top) / rect.height, 0), 1);
    const rawMinutes = STAFF_RANGE_START + pct * STAFF_RANGE_MINUTES;
    const snapped = Math.round(rawMinutes / 15) * 15;
    const clampedStart = Math.min(Math.max(snapped, STAFF_RANGE_START), STAFF_RANGE_START + STAFF_RANGE_MINUTES);
    const newTime = formatTime(clampedStart);
    if (newTime === job.scheduledStartTime) return;
    commitTime(jobId, newTime);
  }

  const sorted = [...jobs].sort((a, b) => minutesFromTime(a.scheduledStartTime) - minutesFromTime(b.scheduledStartTime));

  return (
    <div className="co-card overflow-hidden">
      <div className="border-b border-[var(--co-line-soft)] px-5 py-4">
        <p className="eyebrow">Day view</p>
        <h2 className="mt-1 text-lg font-semibold">{dayLabel}</h2>
        <p className="mt-1 text-xs text-[var(--co-muted)]">Drag a job onto the time rail to reschedule it, or reassign it with the dropdown.</p>
        {error ? <p className="mt-2 text-xs font-medium text-[var(--co-danger)]">{error}</p> : null}
        {warning ? <p role="status" className="mt-2 co-badge-warning px-3 py-2 text-xs font-medium">Scheduling warning: {warning}</p> : null}
      </div>

      <div className="flex gap-4 p-4">
        <div
          className={`relative w-16 shrink-0 rounded-xl border border-[var(--co-line-soft)] transition-colors ${dragOverRail ? "bg-[var(--co-success)]/10" : "bg-[var(--co-surface-muted)]/30"}`}
          style={{ height: TOTAL_HEIGHT }}
          onDragOver={(event) => {
            event.preventDefault();
            setDragOverRail(true);
          }}
          onDragLeave={() => setDragOverRail(false)}
          onDrop={handleRailDrop}
        >
          {Array.from({ length: HOURS }, (_, index) => 7 + index).map((hour, index) => (
            <div key={hour} className="absolute left-0 right-0 border-t border-[var(--co-line-soft)] pl-1 text-[10px] font-medium text-[var(--co-muted)]" style={{ top: index * ROW_PX }}>
              {hourLabel(hour * 60)}
            </div>
          ))}
          {sorted.map((job) => {
            const duration = jobDuration(job);
            const startMinutes = minutesFromTime(job.scheduledStartTime);
            const top = ((startMinutes - STAFF_RANGE_START) / 60) * ROW_PX;
            const height = Math.max((duration / 60) * ROW_PX, 6);
            return (
              <div
                key={job.id}
                className="absolute left-1 right-1 rounded-md opacity-80"
                style={{ top: `${top}px`, height: `${height}px`, background: employeeColor(job.assignedUserIds[0] ?? null) }}
              />
            );
          })}
        </div>

        <div className="flex-1 divide-y divide-[var(--co-line-soft)]">
          {sorted.map((job) => {
            const locked = LOCKED_STATUSES.includes(job.status);
            const primaryAssignee = job.assignedUserIds[0] ?? "";
            return (
              <div
                key={job.id}
                draggable={!locked}
                onDragStart={(event) => {
                  if (locked) {
                    event.preventDefault();
                    return;
                  }
                  event.dataTransfer.setData("text/plain", job.id);
                  event.dataTransfer.effectAllowed = "move";
                }}
                className={`flex flex-wrap items-center gap-4 px-3 py-4 ${locked ? "" : "cursor-grab active:cursor-grabbing"} ${
                  savingId === job.id ? "opacity-50" : ""
                }`}
                style={{ borderLeft: `4px solid ${employeeColor(primaryAssignee || null)}` }}
              >
                <div className="w-16 font-medium text-[var(--co-ink)]">{job.scheduledStartTime?.slice(0, 5) ?? "No time"}</div>
                <Link
                  href={`/jobs/${job.id}`}
                  className="min-w-[180px] flex-1 hover:underline"
                >
                  <div className="font-medium text-[var(--co-ink)]">
                    {job.customerFirstName} {job.customerLastName}
                  </div>
                  <div className="text-xs text-[var(--co-muted)]">
                    {TYPE_LABELS[job.type] ?? job.type} · {job.customerZip ?? "No zip"}
                  </div>
                </Link>
                <AssigneePicker
                  employees={employees}
                  assignedUserIds={job.assignedUserIds}
                  onChange={(ids) => commitAssignee(job.id, ids)}
                  disabled={locked}
                  ariaLabel={`Reassign ${job.customerFirstName} ${job.customerLastName}`}
                />
                <div className="text-sm text-[var(--co-muted)]">${(job.priceCents / 100).toFixed(2)}</div>
                <Pill status={job.status} />
              </div>
            );
          })}
          {sorted.length === 0 ? <p className="px-3 py-6 text-sm text-[var(--co-muted)]">No jobs scheduled for this day.</p> : null}
        </div>
      </div>
      <UndoToast toast={toast} onDismiss={dismiss} />
    </div>
  );
}
