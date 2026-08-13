"use client";

import Link from "next/link";
import { displayCustomer, employeeCardStyle, employeeColor, formatClockLabel, formatEstimatedTime, isPlainClick, recurrenceLabel, TYPE_LABELS } from "./shared";
import { statusLabel } from "@/components/ui/status-pill";
import { cleanNoteText } from "@/lib/format";
import ClientHomeSymbols from "./client-home-symbols";

type Employee = { id: string; firstName: string; lastName: string; isActive?: boolean; calendarColor?: string };
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
  customerHomeDetails: Record<string, unknown>;
  roomCounts: { name: string; count: number }[];
  customerNotes: string | null;
  gateCodeOrKeyNotes: string | null;
  petNotes: string | null;
  doNotClean: string | null;
  assignedUserIds: string[];
  rotationalTaskReminder: {
    currentWeek: number;
    everyTime: string;
    weeks: readonly { week: number; label: string; weekly: string; biweekly: string; monthly: string }[];
  } | null;
};

// The card's own text (customer name, time, crew) uses --co-ink / --co-muted
// / --co-evergreen, which flip to near-white in dark mode. These tints did
// not flip, so a dark-mode card kept its pale light-blue/amber/emerald/rose
// background under near-white text — effectively unreadable (~1:1 contrast).
// The dark: variants mix each status color into --co-surface instead,
// matching the same tint recipe as .co-badge-* in globals.css.
const STATUS_TONES: Record<string, string> = {
  scheduled: "border-blue-200 bg-blue-50 dark:border-[color-mix(in_srgb,var(--co-accent)_24%,var(--co-surface))] dark:bg-[color-mix(in_srgb,var(--co-accent)_10%,var(--co-surface))]",
  in_progress: "border-amber-300 bg-amber-50 dark:border-[color-mix(in_srgb,var(--co-warning)_24%,var(--co-surface))] dark:bg-[color-mix(in_srgb,var(--co-warning)_10%,var(--co-surface))]",
  completed: "border-emerald-300 bg-emerald-50 dark:border-[color-mix(in_srgb,var(--co-success)_24%,var(--co-surface))] dark:bg-[color-mix(in_srgb,var(--co-success)_10%,var(--co-surface))]",
  cancelled: "border-[var(--co-line)] bg-[var(--co-surface-muted)] opacity-60",
  no_show: "border-rose-300 bg-rose-50 dark:border-[color-mix(in_srgb,var(--co-danger)_24%,var(--co-surface))] dark:bg-[color-mix(in_srgb,var(--co-danger)_10%,var(--co-surface))]",
};

export default function JobCard({ job, employees, draggable = false, onDragStart, onOpen }: { job: CardJob; employees: Employee[]; draggable?: boolean; onDragStart?: (event: React.DragEvent<HTMLAnchorElement>) => void; onOpen?: (jobId: string) => void }) {
  const crewIds = job.assignedUserIds;
  const crew = crewIds
    .map((id) => employees.find((employee) => employee.id === id))
    .filter(Boolean)
    .map((employee) => `${employee!.firstName} ${employee!.lastName}${employee!.isActive === false ? " (Inactive)" : ""}`);
  const label = displayCustomer(job);
  const isLocked = ["completed", "cancelled", "no_show"].includes(job.status);
  const leadColor = employees.find((employee) => employee.id === crewIds[0])?.calendarColor ?? crewIds[0];

  return (
    <>
      <Link
        href={`/jobs/${job.id}`}
        draggable={draggable && !isLocked}
        onDragStart={onDragStart}
        onClick={(event) => {
          if (!onOpen || !isPlainClick(event)) return;
          event.preventDefault();
          onOpen(job.id);
        }}
        style={employeeCardStyle(leadColor)}
        className={`group block h-full overflow-hidden rounded-lg border px-2.5 py-2 text-left transition hover:-translate-y-px hover:border-[var(--co-evergreen)] hover:shadow-[0_4px_12px_rgba(0,108,73,0.1)] ${STATUS_TONES[job.status] ?? STATUS_TONES.scheduled}`}
      >
        <div className="flex items-center justify-between gap-2 text-[11px] font-semibold text-[var(--co-muted)]"><span>{formatClockLabel(job.scheduledStartTime)}</span><span className="flex items-center gap-1.5"><ClientHomeSymbols roomCounts={job.roomCounts} gateCodeOrKeyNotes={job.gateCodeOrKeyNotes} petNotes={job.petNotes} /><span className="rounded bg-white/60 px-1.5 py-0.5 text-[10px]">{job.clientType === "commercial" ? "Commercial" : "Residential"}</span></span></div>
        <p className="mt-1 truncate text-[13px] font-semibold text-[var(--co-ink)]">{label}</p>
        <p className="mt-0.5 truncate text-[11px] text-[var(--co-muted)]">{TYPE_LABELS[job.type] ?? job.type} · {job.customerZip ?? "No ZIP"} · {formatEstimatedTime(job.estimatedDurationMinutes)}</p>
        <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px]">
          <span className="flex min-w-0 items-center gap-1 truncate text-[var(--co-muted)]">
            {crewIds.length ? (
              <span className="flex shrink-0 items-center gap-0.5">
                {crewIds.map((id) => (
                  <span key={id} className="h-1.5 w-1.5 rounded-full" style={{ background: employees.find((employee) => employee.id === id)?.calendarColor ?? employeeColor(id) }} />
                ))}
              </span>
            ) : null}
            <span className="truncate">{crew.length ? crew.join(", ") : "Unassigned"}</span>
          </span>
          <span className="shrink-0 font-medium text-[var(--co-evergreen)]">{statusLabel("job", job.status)}</span>
        </div>
        {job.customerNotes ? <p className="mt-1 truncate text-[10px] leading-4 text-[var(--co-muted)]" title={cleanNoteText(job.customerNotes)}>Note: {cleanNoteText(job.customerNotes)}</p> : null}
        {job.recurringSeriesId ? <p className="mt-1 text-[10px] font-medium text-[var(--co-faint)]">↻ {recurrenceLabel(job.recurrenceFrequency)}</p> : null}
        {job.rotationalTaskReminder ? (
          <p className="mt-2 rounded-md border border-violet-200 bg-violet-50/80 px-2 py-1.5 text-[10px] font-semibold text-violet-950">
            All-day rotation · Week {job.rotationalTaskReminder.currentWeek}
          </p>
        ) : null}
      </Link>
    </>
  );
}
