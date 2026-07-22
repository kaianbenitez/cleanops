"use client";

import Link from "next/link";
import { useState } from "react";
import { displayCustomer, formatClockLabel, recurrenceLabel, TYPE_LABELS } from "./shared";
import JobDetailPanel from "./job-detail-panel";

type Employee = { id: string; firstName: string; lastName: string };
export type CardJob = {
  id: string;
  type: string;
  status: string;
  scheduledDate: string;
  scheduledStartTime: string | null;
  estimatedDurationMinutes: number | null;
  recurringSeriesId: string | null;
  recurrenceFrequency: string | null;
  customerFirstName: string;
  customerLastName: string;
  companyName: string | null;
  clientType: string;
  customerZip: string | null;
  assignedUserIds: string[];
};

const STATUS_LABELS: Record<string, string> = { scheduled: "Scheduled", in_progress: "In progress", completed: "Completed", cancelled: "Cancelled", no_show: "No show" };
const STATUS_TONES: Record<string, string> = {
  scheduled: "border-[var(--co-line)] bg-white",
  in_progress: "border-amber-300 bg-amber-50/60",
  completed: "border-emerald-300 bg-emerald-50/60",
  cancelled: "border-[var(--co-line)] bg-[var(--co-surface-muted)] opacity-60",
  no_show: "border-rose-300 bg-rose-50/60",
};

export default function JobCard({ job, employees, draggable = false, onDragStart }: { job: CardJob; employees: Employee[]; draggable?: boolean; onDragStart?: (event: React.DragEvent<HTMLAnchorElement>) => void }) {
  const [detailOpen, setDetailOpen] = useState(false);
  const crew = job.assignedUserIds.map((id) => employees.find((employee) => employee.id === id)).filter(Boolean).map((employee) => `${employee!.firstName} ${employee!.lastName}`);
  const label = displayCustomer(job);
  const isLocked = ["completed", "cancelled", "no_show"].includes(job.status);

  return (
    <>
      <Link
        href={`/jobs/${job.id}`}
        draggable={draggable && !isLocked}
        onDragStart={onDragStart}
        onClick={(event) => { if (event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) { event.preventDefault(); setDetailOpen(true); } }}
        className={`group block rounded-lg border px-2.5 py-2 text-left transition hover:-translate-y-px hover:border-[var(--co-evergreen)] hover:shadow-[0_4px_12px_rgba(0,108,73,0.1)] ${STATUS_TONES[job.status] ?? STATUS_TONES.scheduled}`}
      >
        <div className="flex items-center justify-between gap-2 text-[11px] font-semibold text-[var(--co-muted)]"><span>{formatClockLabel(job.scheduledStartTime)}</span><span className="rounded bg-[var(--co-surface-muted)] px-1.5 py-0.5 text-[10px]">{job.clientType === "commercial" ? "Commercial" : "Residential"}</span></div>
        <p className="mt-1 truncate text-[13px] font-semibold text-[var(--co-ink)]">{label}</p>
        <p className="mt-0.5 truncate text-[11px] text-[var(--co-muted)]">{TYPE_LABELS[job.type] ?? job.type} · {job.customerZip ?? "No ZIP"}</p>
        <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px]"><span className="truncate text-[var(--co-muted)]">{crew.length ? crew.join(", ") : "Unassigned"}</span><span className="shrink-0 font-medium text-[var(--co-evergreen)]">{STATUS_LABELS[job.status] ?? job.status}</span></div>
        {job.recurringSeriesId ? <p className="mt-1 text-[10px] font-medium text-[var(--co-faint)]">↻ {recurrenceLabel(job.recurrenceFrequency)}</p> : null}
      </Link>
      <JobDetailPanel jobId={detailOpen ? job.id : null} employees={employees} onClose={() => setDetailOpen(false)} />
    </>
  );
}
