"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { formatEstimatedTime, TYPE_LABELS } from "./shared";
import { StatusPill } from "@/components/ui/status-pill";
import { DateInput } from "@/components/date-input";
import { TimeInput } from "@/components/time-input";
import { commitJobPatch } from "./drag-commit";
import AssigneePicker from "./assignee-picker";
import ClientHomeSymbols from "./client-home-symbols";
import { cleanNoteText } from "@/lib/format";

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
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [cancellationReason, setCancellationReason] = useState("");

  async function loadJob(id: string, isCancelled: () => boolean) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/jobs/${id}`);
      const data = await res.json();
      if (isCancelled()) return;
      setJob(data.job ?? null);
      setConfirmingCancel(false);
      setCancellationReason("");
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

  function confirmCancelJob() {
    if (!cancellationReason.trim()) {
      setError("Enter a cancellation reason before cancelling this job.");
      return;
    }
    setConfirmingCancel(false);
    patch({ status: "cancelled", cancellationReason: cancellationReason.trim() });
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

            {(job.roomCounts.length || job.customerNotes || job.gateCodeOrKeyNotes || job.petNotes || job.doNotClean) ? <div className="border-t border-[var(--co-line-soft)] pt-4"><p className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--co-muted)]">House details</p><ClientHomeSymbols className="mt-2" roomCounts={job.roomCounts} gateCodeOrKeyNotes={job.gateCodeOrKeyNotes} petNotes={job.petNotes} />{job.customerNotes ? <p className="mt-3 whitespace-pre-wrap text-sm leading-5 text-[var(--co-ink)]">{cleanNoteText(job.customerNotes)}</p> : null}</div> : null}

            <div className="grid grid-cols-2 gap-3">
              <DateInput
                key={`date-${job.scheduledDate}`}
                label="Date"
                defaultValue={job.scheduledDate}
                onChange={(newValue) => newValue && newValue !== job.scheduledDate && patch({ scheduledDate: newValue })}
              />
              <TimeInput
                key={`time-${job.scheduledStartTime}`}
                label="Time"
                defaultValue={job.scheduledStartTime?.slice(0, 5) ?? ""}
                onChange={(newValue) => {
                  if (!newValue) return;
                  const withSeconds = `${newValue}:00`;
                  if (withSeconds !== job.scheduledStartTime) patch({ scheduledStartTime: withSeconds });
                }}
              />
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
                onChange={(event) => {
                  if (event.target.value === "cancelled") {
                    event.target.value = job.status;
                    setConfirmingCancel(true);
                    return;
                  }
                  patch({ status: event.target.value });
                }}
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
              {job.status !== "cancelled" ? confirmingCancel ? (
                <div className="w-full space-y-2 rounded-lg border border-rose-200 bg-rose-50 p-3">
                  <label className="block text-xs font-semibold text-rose-800">
                    Cancellation reason
                    <textarea value={cancellationReason} onChange={(event) => setCancellationReason(event.target.value)} rows={2} placeholder="Why is this job being cancelled?" className="co-input mt-1 w-full resize-none" />
                  </label>
                  <div className="flex gap-2">
                    <button type="button" disabled={saving} onClick={() => { setConfirmingCancel(false); setCancellationReason(""); }} className="co-button-secondary py-1 text-xs disabled:opacity-50">Keep job</button>
                    <button type="button" disabled={saving || !cancellationReason.trim()} onClick={confirmCancelJob} className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-50">Confirm cancel</button>
                  </div>
                </div>
              ) : (
                <button type="button" onClick={() => setConfirmingCancel(true)} className="co-button-secondary">Cancel job</button>
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
