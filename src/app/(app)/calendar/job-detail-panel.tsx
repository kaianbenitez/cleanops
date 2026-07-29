"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { formatEstimatedTime, TYPE_LABELS } from "./shared";
import { StatusPill } from "@/components/ui/status-pill";
import { commitJobPatch } from "./drag-commit";
import AssigneePicker from "./assignee-picker";
import ClientHomeSymbols from "./client-home-symbols";

type Employee = { id: string; firstName: string; lastName: string };

type JobDetail = {
  id: string;
  type: string;
  status: string;
  scheduledDate: string;
  scheduledStartTime: string | null;
  estimatedDurationMinutes: number | null;
  priceCents: number;
  customerId: string;
  customerFirstName: string;
  customerLastName: string;
  addressLine1: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  roomCounts: { name: string; count: number }[];
  customerNotes: string | null;
  gateCodeOrKeyNotes: string | null;
  petNotes: string | null;
  doNotClean: string | null;
};

const STATUS_OPTIONS = [
  { value: "scheduled", label: "Scheduled" },
  { value: "in_progress", label: "In progress" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
  { value: "no_show", label: "No show" },
] as const;

export default function JobDetailPanel({ jobId, employees, onClose }: { jobId: string | null; employees: Employee[]; onClose: () => void }) {
  const router = useRouter();
  const [job, setJob] = useState<JobDetail | null>(null);
  const [assignedUserIds, setAssignedUserIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function loadJob(id: string, isCancelled: () => boolean) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/jobs/${id}`);
      const data = await res.json();
      if (isCancelled()) return;
      setJob(data.job ?? null);
      // Postgres makes no row-order guarantee without ORDER BY; assignedUserIds[0] must be the lead, so sort explicitly.
      const sortedAssignments = [...(data.assignments ?? [])].sort((a: { role: string }, b: { role: string }) =>
        a.role === b.role ? 0 : a.role === "lead" ? -1 : 1
      );
      setAssignedUserIds(sortedAssignments.map((assignment: { userId: string }) => assignment.userId));
    } catch {
      if (!isCancelled()) setError("Couldn't load job details.");
    } finally {
      if (!isCancelled()) setLoading(false);
    }
  }

  useEffect(() => {
    if (!jobId) return;
    let cancelled = false;
    // Fetching job detail from the server when the panel opens — same pattern as /jobs/[jobId].
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadJob(jobId, () => cancelled);
    return () => {
      cancelled = true;
    };
  }, [jobId]);

  useEffect(() => {
    if (!jobId) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [jobId, onClose]);

  if (!jobId) return null;

  function patch(fields: Parameters<typeof commitJobPatch>[1]) {
    if (!job) return;
    commitJobPatch(job.id, fields, {
      onOptimistic: () => {
        setJob((current) => (current ? { ...current, ...fields } : current));
        if (fields.employeeIds) setAssignedUserIds(fields.employeeIds);
        setSaving(true);
        setError(null);
      },
      onSuccess: () => router.refresh(),
      onError: (message) => {
        setError(message);
        router.refresh();
      },
      onSettled: () => setSaving(false),
    });
  }

  function cancelJob() {
    const reason = window.prompt("Why is this job being cancelled?");
    if (reason === null) return;
    if (!reason.trim()) {
      setError("Enter a cancellation reason before cancelling this job.");
      return;
    }
    patch({ status: "cancelled", cancellationReason: reason.trim() });
  }

  const location = job ? [job.addressLine1, job.city, job.state, job.zip].filter(Boolean).join(", ") : "";

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <button type="button" aria-label="Close job details" onClick={onClose} className="absolute inset-0 bg-black/30" />
      <aside className="relative flex h-full w-full max-w-md flex-col overflow-y-auto border-l border-[var(--co-line)] bg-white shadow-[0_0_60px_rgba(15,23,20,0.25)]">
        <div className="flex items-start justify-between gap-3 border-b border-[var(--co-line-soft)] px-5 py-4">
          <div>
            <p className="eyebrow">Job details</p>
            {job ? <Link href={`/customers/${job.customerId}`} className="mt-1 block text-lg font-semibold hover:text-[var(--co-evergreen)] hover:underline">{job.customerFirstName} {job.customerLastName}</Link> : <h2 className="mt-1 text-lg font-semibold">Loading...</h2>}
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-1 text-[var(--co-muted)] hover:bg-[var(--co-surface-muted)]" aria-label="Close">
            ✕
          </button>
        </div>

        {loading && !job ? <div className="p-5 text-sm text-[var(--co-muted)]">Loading job...</div> : null}

        {job ? (
          <div className="flex-1 space-y-5 px-5 py-5">
            {error ? <p className="text-xs font-medium text-rose-600">{error}</p> : null}

            <div className="flex flex-wrap items-center gap-2">
              <StatusPill domain="job" status={job.status} />
              <span className="text-xs text-[var(--co-muted)]">{TYPE_LABELS[job.type] ?? job.type}</span>
              {saving ? <span className="text-xs text-[var(--co-muted)]">Saving...</span> : null}
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--co-muted)]">Location</p>
              <p className="mt-1 text-sm text-[var(--co-ink)]">{location || "No address recorded"}</p>
            </div>

            {(job.roomCounts.length || job.customerNotes || job.gateCodeOrKeyNotes || job.petNotes || job.doNotClean) ? <div className="border-t border-[var(--co-line-soft)] pt-4"><p className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--co-muted)]">House details</p><ClientHomeSymbols className="mt-2" roomCounts={job.roomCounts} gateCodeOrKeyNotes={job.gateCodeOrKeyNotes} petNotes={job.petNotes} />{job.customerNotes ? <p className="mt-3 whitespace-pre-wrap text-sm leading-5 text-[var(--co-ink)]">{job.customerNotes}</p> : null}</div> : null}

            <div className="grid grid-cols-2 gap-3">
              <label className="block text-xs font-semibold text-[var(--co-muted)]">
                Date
                <input
                  key={`date-${job.scheduledDate}`}
                  type="date"
                  defaultValue={job.scheduledDate}
                  onBlur={(event) => event.target.value && event.target.value !== job.scheduledDate && patch({ scheduledDate: event.target.value })}
                  className="co-input mt-1 w-full"
                />
              </label>
              <label className="block text-xs font-semibold text-[var(--co-muted)]">
                Time
                <input
                  key={`time-${job.scheduledStartTime}`}
                  type="time"
                  defaultValue={job.scheduledStartTime?.slice(0, 5) ?? ""}
                  onBlur={(event) => {
                    if (!event.target.value) return;
                    const withSeconds = `${event.target.value}:00`;
                    if (withSeconds !== job.scheduledStartTime) patch({ scheduledStartTime: withSeconds });
                  }}
                  className="co-input mt-1 w-full"
                />
              </label>
            </div>

            <div className="block text-xs font-semibold text-[var(--co-muted)]">
              Assigned to
              <div className="mt-1">
                <AssigneePicker
                  employees={employees}
                  assignedUserIds={assignedUserIds}
                  onChange={(ids) => patch({ employeeIds: ids })}
                  ariaLabel="Assign crew to this job"
                  className="w-full"
                />
              </div>
            </div>

            <label className="block text-xs font-semibold text-[var(--co-muted)]">
              Status
              <select
                key={`status-${job.status}`}
                defaultValue={job.status}
                onChange={(event) => event.target.value === "cancelled" ? cancelJob() : patch({ status: event.target.value })}
                className="co-input mt-1 w-full"
              >
                {STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--co-muted)]">Job value</p>
                <p className="mt-1 text-sm text-[var(--co-ink)]">${(job.priceCents / 100).toFixed(2)}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--co-muted)]">Job Ticket Hours</p>
                <p className="mt-1 text-sm text-[var(--co-ink)]">{formatEstimatedTime(job.estimatedDurationMinutes)}</p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 border-t border-[var(--co-line-soft)] pt-4">
              {job.status !== "cancelled" ? (
                <button type="button" onClick={cancelJob} className="co-button-secondary">
                  Cancel job
                </button>
              ) : null}
              <Link href={`/jobs/${job.id}`} className="co-button-secondary">
                Open full job page
              </Link>
            </div>
          </div>
        ) : null}
      </aside>
    </div>
  );
}
