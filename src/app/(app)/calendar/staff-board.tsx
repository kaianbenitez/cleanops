"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { CalendarEmployee, CalendarJob } from "./page";
import { commitJobPatch } from "./drag-commit";
import { UndoToast, useUndoToast } from "./undo-toast";
import JobCard from "./job-card";
import { assignDayLanes } from "./shared";
import UnassignedPanel from "./unassigned-panel";

const START = 9 * 60;
const TOTAL = 9 * 60;
const HOUR_HEIGHT = 104;
const RETAINED_STATUSES = ["cancelled", "no_show"];

function customerName(job: CalendarJob) {
  return job.companyName || `${job.customerFirstName} ${job.customerLastName}`;
}

function statusLabel(status: string) {
  return status === "cancelled" ? "Cancelled / on hold" : status === "no_show" ? "No show" : status === "in_progress" ? "In progress" : "Scheduled";
}

export default function StaffBoard({ dayIso, dayLabel, employees, laneEmployeeId, jobs: initialJobs, unassignedJobs }: { dayIso: string; dayLabel: string; employees: CalendarEmployee[]; laneEmployeeId?: string; jobs: CalendarJob[]; unassignedJobs: CalendarJob[] }) {
  const router = useRouter();
  const [jobs, setJobs] = useState(initialJobs);
  const [syncedJobs, setSyncedJobs] = useState(initialJobs);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [queueExpanded, setQueueExpanded] = useState(false);
  const [openJobId, setOpenJobId] = useState<string | null>(null);
  const { toast, showUndo, dismiss } = useUndoToast();
  const sortedEmployees = useMemo(() => laneEmployeeId ? employees.filter((employee) => employee.id === laneEmployeeId) : [...employees], [employees, laneEmployeeId]);
  const activeUnassignedJobs = useMemo(() => unassignedJobs.filter((job) => !RETAINED_STATUSES.includes(job.status) && job.status !== "completed"), [unassignedJobs]);
  const retainedUnassignedJobs = useMemo(() => unassignedJobs.filter((job) => RETAINED_STATUSES.includes(job.status)), [unassignedJobs]);
  const visibleActiveJobs = queueExpanded ? activeUnassignedJobs : activeUnassignedJobs.slice(0, 4);
  const visibleRetainedJobs = queueExpanded ? retainedUnassignedJobs : retainedUnassignedJobs.slice(0, 2);
  const hasMoreQueueJobs = activeUnassignedJobs.length > visibleActiveJobs.length || retainedUnassignedJobs.length > visibleRetainedJobs.length;

  if (initialJobs !== syncedJobs) {
    setSyncedJobs(initialJobs);
    setJobs(initialJobs);
  }

  function dropOnEmployee(event: React.DragEvent<HTMLDivElement>, employeeId: string) {
    event.preventDefault(); setDragOver(null);
    const jobId = event.dataTransfer.getData("text/plain"); const job = jobs.find((entry) => entry.id === jobId);
    if (!job || ["completed", "cancelled", "no_show"].includes(job.status)) return;
    const previous = job.assignedUserIds; const next = Array.from(new Set([...previous, employeeId]));
    if (JSON.stringify(previous) === JSON.stringify(next)) return;
    setJobs((current) => current.map((entry) => entry.id === job.id ? { ...entry, assignedUserIds: next } : entry));
    commitJobPatch(job.id, { employeeIds: next }, { onOptimistic: () => undefined, onSuccess: () => { router.refresh(); showUndo("Technician added to the crew", () => commitJobPatch(job.id, { employeeIds: previous }, { onOptimistic: () => setJobs((current) => current.map((entry) => entry.id === job.id ? { ...entry, assignedUserIds: previous } : entry)), onSuccess: () => undefined, onError: setError })); }, onError: (message) => { setError(message); setJobs((current) => current.map((entry) => entry.id === job.id ? { ...entry, assignedUserIds: previous } : entry)); } });
  }

  function jobStyle(job: CalendarJob, lane: number, laneCount: number) {
    const [hour, minute] = (job.scheduledStartTime ?? "09:00").slice(0, 5).split(":").map(Number);
    const top = Math.max(0, Math.min(((hour * 60 + minute - START) / TOTAL) * 100, 94));
    const height = Math.max(((job.estimatedDurationMinutes ?? 75) / TOTAL) * 100, 8);
    const width = 100 / laneCount;
    return {
      top: `${top}%`,
      height: `${height}%`,
      left: `calc(${lane * width}% + 0.25rem)`,
      width: `calc(${width}% - 0.5rem)`,
    };
  }

  function queueCard(job: CalendarJob, retained = false) {
    return <button key={job.id} type="button" data-testid="unassigned-job-card" onClick={() => setOpenJobId(job.id)} aria-label={`Assign a cleaner for ${customerName(job)}`} className={`block w-full rounded-lg border p-2.5 text-left transition hover:bg-[var(--co-accent-tint)] ${retained ? "border-[var(--co-line-soft)] bg-[var(--co-surface-muted)]" : "border-dashed border-[var(--co-line)]"}`}>
      <div className="flex items-start justify-between gap-2">
        <p className="truncate text-xs font-semibold">{customerName(job)}</p>
        <span className={`shrink-0 text-[10px] font-semibold ${retained ? "text-[var(--co-muted)]" : "text-[var(--co-evergreen)]"}`}>{job.estimatedDurationMinutes ? `${Math.round(job.estimatedDurationMinutes / 60 * 10) / 10} hrs` : "-"}</span>
      </div>
      <p className="mt-1 text-[11px] text-[var(--co-muted)]">{job.scheduledStartTime?.slice(0, 5) ?? "No time"} · {job.customerCity ?? "No city"}, {job.customerZip ?? "No ZIP"}</p>
      <div className="mt-1 flex items-center justify-between gap-2 text-[10px]">
        <span className="text-[var(--co-faint)]">{job.clientType === "commercial" ? "Commercial" : "Residential"}</span>
        <span className={retained ? "text-[var(--co-muted)]" : "text-amber-700"}>{statusLabel(job.status)}</span>
      </div>
    </button>;
  }

  return <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
    <section className="min-w-0 overflow-hidden border border-[var(--co-line)] bg-[var(--co-surface)]"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--co-line-soft)] px-4 py-3"><div><h2 className="text-base font-semibold">Dispatch board - {dayLabel}</h2><p className="mt-0.5 text-xs text-[var(--co-muted)]">Employees are lanes. Drag a job between columns to add a technician.</p></div><span className="text-xs font-medium text-[var(--co-muted)]">{jobs.length} jobs</span></div>{error ? <p role="alert" className="border-b border-rose-200 bg-rose-50 px-4 py-2 text-xs font-medium text-rose-700">{error}</p> : null}<div className="overflow-x-auto"><div style={{ minWidth: `${120 + Math.max(sortedEmployees.length, 1) * 180}px` }}><div className="grid divide-x divide-[var(--co-line-soft)] border-b border-[var(--co-line-soft)]" style={{ gridTemplateColumns: `120px repeat(${Math.max(sortedEmployees.length, 1)}, minmax(180px, 1fr))` }}><div className="bg-[var(--co-surface-muted)] px-3 py-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--co-faint)]">Time</div>{sortedEmployees.map((employee) => <div key={employee.id} className="bg-[var(--co-surface-muted)] px-2 py-3 text-center"><p className="truncate text-xs font-semibold">{employee.firstName} {employee.lastName.slice(0, 1)}.</p><p className="mt-1 text-[10px] text-[var(--co-faint)]">{jobs.filter((job) => job.assignedUserIds.includes(employee.id)).length} jobs</p></div>)}{sortedEmployees.length === 0 ? <div className="bg-[var(--co-surface-muted)] px-3 py-3 text-xs text-[var(--co-muted)]">No active technicians</div> : null}</div><div className="grid divide-x divide-[var(--co-line-soft)]" style={{ gridTemplateColumns: `120px repeat(${Math.max(sortedEmployees.length, 1)}, minmax(180px, 1fr))` }}><div className="relative bg-[var(--co-surface-muted)]" style={{ minHeight: `${HOUR_HEIGHT * 9}px` }}>{Array.from({ length: 10 }, (_, index) => <span key={index} className="absolute right-3 text-[11px] font-medium text-[var(--co-muted)]" style={{ top: `${index * HOUR_HEIGHT - 7}px` }}>{index === 9 ? "6 PM" : `${index + 9 > 12 ? index - 3 : index + 9}:00 ${index + 9 >= 12 ? "PM" : "AM"}`}</span>)}</div>{sortedEmployees.map((employee) => { const employeeJobs = jobs.filter((job) => job.assignedUserIds.includes(employee.id)).sort((a, b) => (a.scheduledStartTime ?? "99").localeCompare(b.scheduledStartTime ?? "99")); const lanes = assignDayLanes(employeeJobs); return <div key={employee.id} className={`relative border-t border-[var(--co-line-soft)] ${dragOver === employee.id ? "bg-[var(--co-accent-tint)]" : "bg-[var(--co-surface)]"}`} style={{ minHeight: `${HOUR_HEIGHT * 9}px` }} onDragOver={(event) => { event.preventDefault(); setDragOver(employee.id); }} onDragLeave={() => setDragOver(null)} onDrop={(event) => dropOnEmployee(event, employee.id)}>{Array.from({ length: 9 }, (_, index) => <div key={index} className="absolute inset-x-0 border-t border-[var(--co-line-soft)]" style={{ top: `${index * HOUR_HEIGHT}px` }} />)}{employeeJobs.map((job) => { const placement = lanes.get(job.id); if (!placement || placement.hidden) return null; return <div key={job.id} className="absolute z-10" style={jobStyle(job, placement.lane, placement.laneCount)}><JobCard job={job} employees={employees} draggable onDragStart={(event) => event.dataTransfer.setData("text/plain", job.id)} />{placement.overflowCount > 0 ? <span className="absolute bottom-1 right-1 rounded bg-[var(--co-ink)] px-1.5 py-0.5 text-[10px] font-semibold text-white">+{placement.overflowCount} overlapping</span> : null}</div>; })}{dragOver === employee.id ? <div className="absolute inset-x-2 top-2 z-20 rounded-lg border border-dashed border-[var(--co-evergreen)] bg-white/90 p-3 text-center text-xs font-semibold text-[var(--co-evergreen)]">Drop to assign</div> : null}</div>; })}{sortedEmployees.length === 0 ? <div className="flex items-start justify-center bg-[var(--co-surface)] px-4 py-10 text-center text-sm text-[var(--co-muted)]" style={{ minHeight: `${HOUR_HEIGHT * 9}px` }}>Create or activate a technician to use the dispatch board.</div> : null}</div></div></div></section>
    <aside className="space-y-4">
      <section className="border border-[var(--co-line)] bg-[var(--co-surface)] p-3">
        <div className="flex items-start justify-between gap-3"><div><h3 className="text-sm font-semibold">Unassigned queue</h3><p className="mt-0.5 text-[11px] text-[var(--co-muted)]">{dayLabel}</p></div><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${activeUnassignedJobs.length ? "bg-rose-100 text-rose-700" : "bg-[var(--co-surface-muted)] text-[var(--co-muted)]"}`}>{activeUnassignedJobs.length} to assign</span></div>
        <div className="mt-3 space-y-2">
          {activeUnassignedJobs.length ? <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-700">Needs assignment</p> : null}
          {visibleActiveJobs.map((job) => queueCard(job))}
          {!activeUnassignedJobs.length ? <p className="rounded-lg bg-[var(--co-accent-tint)] px-3 py-3 text-center text-xs text-[var(--co-evergreen)]">No jobs need assignment for this day.</p> : null}
          {retainedUnassignedJobs.length ? <div className="pt-2"><div className="flex items-center justify-between gap-2"><p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--co-muted)]">On hold / cancelled</p><span className="text-[10px] text-[var(--co-muted)]">{retainedUnassignedJobs.length}</span></div><div className="mt-2 space-y-2">{visibleRetainedJobs.map((job) => queueCard(job, true))}</div></div> : null}
          {unassignedJobs.length === 0 ? <p className="py-2 text-center text-xs text-[var(--co-muted)]">No unassigned jobs for this day.</p> : null}
        </div>
        {unassignedJobs.length > 0 ? <button data-testid="view-all-unassigned" data-day={dayIso} type="button" onClick={() => setQueueExpanded((expanded) => !expanded)} className="mt-3 block w-full border-t border-[var(--co-line-soft)] pt-3 text-center text-xs font-semibold text-[var(--co-evergreen)] hover:underline">{queueExpanded ? "Show less" : `View all unassigned (${unassignedJobs.length})`}</button> : null}
        {unassignedJobs.length > 0 && !queueExpanded && hasMoreQueueJobs ? <p className="mt-2 text-center text-[10px] text-[var(--co-muted)]">Open a job to review its details or assign cleaners.</p> : null}
      </section>
    </aside>
    <UndoToast toast={toast} onDismiss={dismiss} />
    <UnassignedPanel jobId={openJobId} employees={employees} onClose={() => setOpenJobId(null)} />
  </div>;
}
