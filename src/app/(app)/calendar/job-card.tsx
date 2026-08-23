"use client";

import Link from "next/link";
import { displayCustomer, employeeCardStyle, employeeColor, formatClockLabel, formatCustomerAddress, formatEstimatedTime, isPlainClick, jobTypeLabel, readinessAction, readinessReason, readinessTone } from "./shared";
import type { CalendarReadiness } from "./page";
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
  customerCity: string | null;
  customerState: string | null;
  customerAddress: string | null;
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
  readiness?: CalendarReadiness;
};

// The card's own text (customer name, time, crew) uses --co-ink / --co-muted
// / --co-accent-text, which flip to near-white in dark mode. A pale hardcoded
// light-blue/amber/emerald/rose background wouldn't flip with it, so a
// dark-mode card would keep a near-white background under near-white text —
// effectively unreadable (~1:1 contrast). Mixing each status color into
// --co-surface instead (matching the same tint recipe as .co-badge-* in
// globals.css) makes the tone theme-aware automatically, since --co-surface
// and each --co-* status color are themselves redefined under .dark — no
// separate dark: variant needed.
const STATUS_TONES: Record<string, string> = {
  scheduled: "border-[color-mix(in_srgb,var(--co-accent)_24%,var(--co-surface))] bg-[color-mix(in_srgb,var(--co-accent)_10%,var(--co-surface))]",
  in_progress: "border-[color-mix(in_srgb,var(--co-warning)_24%,var(--co-surface))] bg-[color-mix(in_srgb,var(--co-warning)_10%,var(--co-surface))]",
  completed: "border-[color-mix(in_srgb,var(--co-success)_24%,var(--co-surface))] bg-[color-mix(in_srgb,var(--co-success)_10%,var(--co-surface))]",
  cancelled: "border-[var(--co-line)] bg-[var(--co-surface-muted)] opacity-60",
  no_show: "border-[color-mix(in_srgb,var(--co-danger)_24%,var(--co-surface))] bg-[color-mix(in_srgb,var(--co-danger)_10%,var(--co-surface))]",
};

export default function JobCard({ job, employees, draggable = false, onDragStart, onOpen, variant = "timeline", ordinalLabel }: { job: CardJob; employees: Employee[]; draggable?: boolean; onDragStart?: (event: React.DragEvent<HTMLAnchorElement>) => void; onOpen?: (jobId: string) => void; variant?: "timeline" | "list"; ordinalLabel?: string }) {
  const crewIds = job.assignedUserIds;
  const crew = crewIds
    .map((id) => employees.find((employee) => employee.id === id))
    .filter(Boolean)
    .map((employee) => `${employee!.firstName} ${employee!.lastName}${employee!.isActive === false ? " (Inactive)" : ""}`);
  const label = displayCustomer(job);
  const isLocked = ["completed", "cancelled", "no_show"].includes(job.status);
  const leadColor = employees.find((employee) => employee.id === crewIds[0])?.calendarColor ?? crewIds[0];
  const isList = variant === "list";
  const readinessDescription = job.readiness
    ? `${job.readiness.primary}: ${readinessReason(job.readiness)}. Next action: ${readinessAction(job.readiness)}.${job.readiness.reasons.length ? ` Details: ${job.readiness.reasons.join("; ")}.` : ""}`
    : undefined;

  return (
    <>
      <Link
        href={`/jobs/${job.id}`}
        aria-describedby={readinessDescription ? `job-readiness-${job.id}` : undefined}
        draggable={draggable && !isLocked}
        onDragStart={onDragStart}
        onClick={(event) => {
          if (!onOpen || !isPlainClick(event)) return;
          event.preventDefault();
          onOpen(job.id);
        }}
        style={employeeCardStyle(leadColor)}
        className={`block h-full overflow-hidden rounded-lg border text-left transition hover:-translate-y-px hover:border-[var(--co-accent-text)] hover:shadow-[0_4px_12px_rgba(15,23,42,0.1)] ${isList ? "px-3 py-2.5" : "px-2.5 py-2"} ${STATUS_TONES[job.status] ?? STATUS_TONES.scheduled}`}
      >
        <div className="flex items-center justify-between gap-2 text-xs text-[var(--co-muted)]"><span className="flex items-center gap-1 text-sm font-bold tracking-[-0.01em] text-[var(--co-ink)]">{formatClockLabel(job.scheduledStartTime)}{ordinalLabel ? <span className="rounded bg-[var(--co-accent-tint)] px-1 py-0.5 text-[10px] font-semibold tracking-normal text-[var(--co-accent-text)]">{ordinalLabel}</span> : null}</span><span className="flex items-center gap-1.5 text-[var(--co-faint)]"><ClientHomeSymbols roomCounts={job.roomCounts} gateCodeOrKeyNotes={job.gateCodeOrKeyNotes} petNotes={job.petNotes} /><span className="rounded bg-[var(--co-surface)]/60 px-1.5 py-0.5 text-[10px]">{job.clientType === "commercial" ? "Commercial" : "Residential"}</span></span></div>
        <p className={`mt-1 truncate font-bold leading-5 text-[var(--co-ink)] ${isList ? "text-base" : "text-sm"}`}>{label}</p>
        <p className="mt-1 break-words text-xs leading-4 text-[var(--co-faint)]" title={formatCustomerAddress(job)}>{job.recurringSeriesId ? "↻ " : ""}{jobTypeLabel(job)} · {formatCustomerAddress(job)} · {formatEstimatedTime(job.estimatedDurationMinutes)}</p>
        {job.readiness && job.readiness.primary !== "Ready" ? <p className="mt-1 truncate text-xs font-semibold text-[var(--co-accent-text)]">{readinessReason(job.readiness)} · {readinessAction(job.readiness)}</p> : null}
        <div className="mt-2 flex items-center justify-between gap-2 text-xs">
          <span className="flex min-w-0 items-center gap-1 truncate font-medium text-[var(--co-body)]">
            {crewIds.length ? (
              <span className="flex shrink-0 items-center gap-0.5">
                {crewIds.map((id) => (
                  <span key={id} className="h-1.5 w-1.5 rounded-full" style={{ background: employees.find((employee) => employee.id === id)?.calendarColor ?? employeeColor(id) }} />
                ))}
              </span>
            ) : null}
            <span className="truncate">{crew.length ? crew.join(", ") : "Crew not assigned"}</span>
          </span>
          <span className="flex shrink-0 items-center gap-1.5">
            {job.readiness ? <span className={`${readinessTone(job.readiness.primary)} rounded px-1.5 py-0.5 text-[10px] font-bold`} title={`${readinessReason(job.readiness)} · ${readinessAction(job.readiness)}${job.readiness.reasons.length ? ` · ${job.readiness.reasons.join("; ")}` : ""}`}>{job.readiness.primary}</span> : null}
            <span className="font-semibold text-[var(--co-accent-text)]">{statusLabel("job", job.status)}</span>
          </span>
        </div>
        {readinessDescription ? <span id={`job-readiness-${job.id}`} className="sr-only">{readinessDescription}</span> : null}
        {job.customerNotes ? <p className="mt-1 truncate text-xs leading-4 text-[var(--co-muted)]" title={cleanNoteText(job.customerNotes)}>Note: {cleanNoteText(job.customerNotes)}</p> : null}
        {job.rotationalTaskReminder ? (
          <p className="co-badge-spark mt-2 rounded-md px-2 py-1.5 text-xs font-semibold">
            All-day rotation · Week {job.rotationalTaskReminder.currentWeek}
          </p>
        ) : null}
      </Link>
    </>
  );
}
