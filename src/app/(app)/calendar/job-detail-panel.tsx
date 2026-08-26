"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { formatEstimatedTime, jobTypeLabel } from "./shared";
import { StatusPill } from "@/components/ui/status-pill";
import { DateInput } from "@/components/date-input";
import { TimeInput } from "@/components/time-input";
import { commitJobPatch } from "./drag-commit";
import AssigneePicker from "./assignee-picker";
import ClientHomeSymbols from "./client-home-symbols";
import { cleanNoteText } from "@/lib/format";
import { ExternalLink } from "lucide-react";
import { useDialogFocus } from "./dialog-focus";
import SlotFinder, { type SlotFinderSelection } from "@/components/scheduling/slot-finder";

type Employee = { id: string; firstName: string; lastName: string };

type JobDetail = {
  id: string;
  type: string;
  recurrenceFrequency: string | null;
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

function formatDurationInput(minutes: number | null | undefined) {
  if (minutes == null) return "";
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function parseDurationInput(value: string) {
  const match = /^(\d{1,2}):([0-5]\d)$/.exec(value.trim());
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

export default function JobDetailPanel({ jobId, employees, onClose }: { jobId: string | null; employees: Employee[]; onClose: () => void }) {
  const router = useRouter();
  const [job, setJob] = useState<JobDetail | null>(null);
  const [assignedUserIds, setAssignedUserIds] = useState<string[]>([]);
  const [draftDate, setDraftDate] = useState("");
  const [draftTime, setDraftTime] = useState("");
  const [draftStatus, setDraftStatus] = useState("");
  const [draftPrice, setDraftPrice] = useState("");
  const [draftDuration, setDraftDuration] = useState("");
  const [draftAssignedUserIds, setDraftAssignedUserIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [cancellationReason, setCancellationReason] = useState("");
  const [slotFinderOpen, setSlotFinderOpen] = useState(false);
  const dialogRef = useDialogFocus(Boolean(jobId));

  async function loadJob(id: string, isCancelled: () => boolean) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/jobs/${id}`);
      if (!res.ok) throw new Error("Job details could not be loaded.");
      const data = await res.json();
      if (isCancelled()) return;
      setJob(data.job ?? null);
      setConfirmingCancel(false);
      setCancellationReason("");
      setSlotFinderOpen(false);
      // Postgres makes no row-order guarantee without ORDER BY; assignedUserIds[0] must be the lead, so sort explicitly.
      const sortedAssignments = [...(data.assignments ?? [])].sort((a: { role: string }, b: { role: string }) =>
        a.role === b.role ? 0 : a.role === "lead" ? -1 : 1
      );
      const nextAssignedUserIds = sortedAssignments.map((assignment: { userId: string }) => assignment.userId);
      setAssignedUserIds(nextAssignedUserIds);
      setDraftAssignedUserIds(nextAssignedUserIds);
      setDraftDate(data.job?.scheduledDate ?? "");
      setDraftTime(data.job?.scheduledStartTime?.slice(0, 5) ?? "");
      setDraftStatus(data.job?.status ?? "");
      setDraftPrice(data.job?.priceCents == null ? "" : (data.job.priceCents / 100).toFixed(2));
      setDraftDuration(formatDurationInput(data.job?.estimatedDurationMinutes));
    } catch {
      if (!isCancelled()) setError("We couldn't load this job. Close the panel and try again.");
    } finally {
      if (!isCancelled()) setLoading(false);
    }
  }

  const isDirty = Boolean(job) && (
    draftDate !== job?.scheduledDate ||
    draftTime !== (job?.scheduledStartTime?.slice(0, 5) ?? "") ||
    draftStatus !== job?.status ||
    draftPrice !== (job ? (job.priceCents / 100).toFixed(2) : "") ||
    draftDuration !== formatDurationInput(job?.estimatedDurationMinutes) ||
    draftAssignedUserIds.join(",") !== assignedUserIds.join(",")
  );

  const requestClose = useCallback(() => {
    if (isDirty && !window.confirm("Discard unsaved changes?")) return;
    onClose();
  }, [isDirty, onClose]);

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
      if (event.key === "Escape") requestClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [jobId, requestClose]);

  if (!jobId) return null;

  function patch(fields: Parameters<typeof commitJobPatch>[1]) {
    if (!job) return;
    const previousJob = job;
    const previousAssignedUserIds = [...assignedUserIds];
    commitJobPatch(job.id, fields, {
      onOptimistic: () => {
        setJob((current) => (current ? { ...current, ...fields } : current));
        if (fields.employeeIds) setAssignedUserIds(fields.employeeIds);
        setSaving(true);
        setError(null);
        setWarning(null);
      },
      onSuccess: () => router.refresh(),
      onWarning: setWarning,
      onError: (message) => {
        setJob(previousJob);
        setAssignedUserIds(previousAssignedUserIds);
        setError(message);
        router.refresh();
      },
      onSettled: () => setSaving(false),
    });
  }

  function saveChanges() {
    if (!job || !isDirty) return;
    const fields: Parameters<typeof commitJobPatch>[1] = {};
    if (draftDate !== job.scheduledDate) fields.scheduledDate = draftDate;
    const currentTime = job.scheduledStartTime?.slice(0, 5) ?? "";
    if (draftTime !== currentTime) fields.scheduledStartTime = draftTime ? `${draftTime}:00` : null;
    if (draftStatus !== job.status) fields.status = draftStatus;
    const nextPriceCents = Math.round(Number(draftPrice) * 100);
    if (Number.isFinite(nextPriceCents) && nextPriceCents >= 0 && nextPriceCents !== job.priceCents) fields.priceCents = nextPriceCents;
    const nextDuration = parseDurationInput(draftDuration);
    if (nextDuration !== null && Number.isInteger(nextDuration) && nextDuration >= 15 && nextDuration <= 600 && nextDuration !== job.estimatedDurationMinutes) fields.estimatedDurationMinutes = nextDuration;
    if (draftAssignedUserIds.join(",") !== assignedUserIds.join(",")) fields.employeeIds = draftAssignedUserIds;
    patch(fields);
  }

  function confirmCancelJob() {
    if (!cancellationReason.trim()) {
      setError("Enter a cancellation reason before cancelling this job.");
      return;
    }
    setConfirmingCancel(false);
    setDraftStatus("cancelled");
    patch({ status: "cancelled", cancellationReason: cancellationReason.trim() });
  }

  function confirmSlot(selection: SlotFinderSelection) {
    setDraftDate(selection.date);
    setDraftTime(selection.startTime.slice(0, 5));
    setDraftAssignedUserIds(selection.employeeIds);
    setSlotFinderOpen(false);
  }

  function skipVisit(reason: string) {
    setSlotFinderOpen(false);
    // Same patch shape as the Calendar rail's own skip action, reached from
    // the scheduling assistant instead of the raw cancel form.
    setDraftStatus("cancelled");
    patch({ status: "cancelled", cancellationReason: reason, skipOccurrence: true });
  }

  const location = job ? [job.addressLine1, job.city, job.state, job.zip].filter(Boolean).join(", ") : "";
  // Never anchor the slot search before today, even if the job's current
  // date has slipped into the past (e.g. an overdue unscheduled visit).
  const todayIso = new Date().toISOString().slice(0, 10);
  const slotAnchorDate = job && job.scheduledDate > todayIso ? job.scheduledDate : todayIso;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4 sm:p-6">
      <button type="button" aria-label="Close job details" onClick={requestClose} className="absolute inset-0 bg-[var(--co-overlay)]" />
      <aside ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="calendar-job-detail-title" className="calendar-detail-panel relative flex h-[min(720px,calc(100dvh-2rem))] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-[var(--co-line)] bg-[var(--co-surface)] shadow-[var(--co-shadow-panel)] sm:h-[min(720px,calc(100dvh-3rem))]">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--co-line-soft)] px-5 py-4">
          <div className="min-w-0 flex-1">
            <p className="eyebrow">Job details</p>
            {job ? <Link id="calendar-job-detail-title" href={`/customers/${job.customerId}`} className="mt-1 block break-words text-lg font-semibold hover:text-[var(--co-accent-text)] hover:underline">{job.customerFirstName} {job.customerLastName}</Link> : <h2 id="calendar-job-detail-title" className="mt-1 text-lg font-semibold">Loading...</h2>}
          </div>
          <div className="flex max-w-full shrink-0 flex-wrap items-center justify-end gap-2">
            {job ? <button type="button" disabled={saving || !isDirty} onClick={saveChanges} className="co-button-primary px-3 py-2 text-xs disabled:opacity-50">{saving ? "Saving…" : "Save changes"}</button> : null}
            {job && job.status !== "cancelled" ? <button type="button" disabled={saving} onClick={() => setConfirmingCancel(true)} className="co-button-secondary px-3 py-2 text-xs text-[var(--co-danger)]">Cancel job</button> : null}
            {job ? <Link href={`/jobs/${job.id}`} target="_blank" rel="noreferrer" aria-label="Open full job page in a new tab" title="Open full job page in a new tab" className="co-button-secondary flex h-11 w-11 items-center justify-center !p-0"><ExternalLink className="h-4 w-4" aria-hidden /></Link> : null}
            <button type="button" onClick={requestClose} className="flex h-11 w-11 items-center justify-center rounded-full text-[var(--co-muted)] hover:bg-[var(--co-surface-muted)]" aria-label="Close">
              ✕
            </button>
          </div>
        </div>

        {job && job.status !== "cancelled" && confirmingCancel ? (
          <div className="shrink-0 border-b border-[var(--co-line-soft)] bg-[var(--co-surface-muted)] px-5 py-3">
            <div className="co-badge-danger rounded-lg p-3">
              <p className="text-sm font-semibold">Cancel this job?</p>
              <label className="mt-2 block text-xs font-semibold">
                Cancellation reason
                <textarea autoFocus value={cancellationReason} onChange={(event) => setCancellationReason(event.target.value)} rows={2} placeholder="Why is this job being cancelled?" className="co-input mt-1 w-full resize-none" />
              </label>
              <div className="mt-2 flex gap-2">
                <button type="button" disabled={saving} onClick={() => { setConfirmingCancel(false); setCancellationReason(""); }} className="co-button-secondary py-1 text-xs disabled:opacity-50">Keep job</button>
                <button type="button" disabled={saving || !cancellationReason.trim()} onClick={confirmCancelJob} className="rounded-lg border border-[var(--co-danger)]/30 bg-[var(--co-danger)]/10 px-3 py-1 text-xs font-semibold text-[var(--co-danger)] hover:bg-[var(--co-danger)]/20 disabled:opacity-50">Confirm cancel</button>
              </div>
            </div>
          </div>
        ) : null}

        {loading && !job ? <div className="p-5 text-sm text-[var(--co-muted)]">Loading job...</div> : null}
        {!job && error ? <p role="alert" aria-live="assertive" className="p-5 pt-0 text-xs font-medium text-[var(--co-danger)]">{error}</p> : null}

        {job ? (
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5">
            {error ? <p role="alert" aria-live="assertive" className="text-xs font-medium text-[var(--co-danger)]">{error}</p> : null}
            {warning ? <p role="status" className="co-badge-warning px-3 py-2 text-xs font-medium">Scheduling warning: {warning}</p> : null}

            <div className="flex flex-wrap items-center gap-2">
              <StatusPill domain="job" status={job.status} />
              <span className="text-xs text-[var(--co-muted)]">{jobTypeLabel(job)}</span>
              {saving ? <span className="text-xs text-[var(--co-muted)]">Saving changes…</span> : null}
            </div>

            <section className="rounded-xl border border-[var(--co-line-soft)] bg-[var(--co-surface-muted)]/35 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--co-muted)]">Schedule & status</p>
                <button type="button" disabled={saving} onClick={() => setSlotFinderOpen(true)} className="co-button-secondary py-1 text-xs disabled:opacity-50">
                  Find a time
                </button>
              </div>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <DateInput
                  key={`date-${job.scheduledDate}`}
                  label="Date"
                  value={draftDate}
                  onChange={setDraftDate}
                />
                <TimeInput
                  key={`time-${job.scheduledStartTime}`}
                  label="Start time"
                  value={draftTime}
                  onChange={setDraftTime}
                />
              </div>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="block text-xs font-semibold text-[var(--co-muted)]">
                  Crew
                  <div className="mt-1"><AssigneePicker employees={employees} assignedUserIds={draftAssignedUserIds} onChange={setDraftAssignedUserIds} ariaLabel="Assign crew to this job" className="w-full" /></div>
                </div>
                <label className="block text-xs font-semibold text-[var(--co-muted)]">
                  Status
                  <select value={draftStatus} onChange={(event) => { if (event.target.value === "cancelled") { event.target.value = job.status; setConfirmingCancel(true); return; } setDraftStatus(event.target.value); }} className="co-input mt-1 w-full">
                    {STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </label>
              </div>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="block text-xs font-semibold text-[var(--co-muted)]">Value<input type="number" min="0" step="0.01" value={draftPrice} onChange={(event) => setDraftPrice(event.target.value)} className="co-input mt-1 w-full" /></label>
                <label className="block text-xs font-semibold text-[var(--co-muted)]">Cleaning duration (hours:minutes)<input type="text" inputMode="numeric" pattern="[0-9]{1,2}:[0-5][0-9]" placeholder="03:01" aria-describedby="calendar-duration-help" value={draftDuration} onChange={(event) => setDraftDuration(event.target.value)} className="co-input mt-1 w-full" /></label>
              </div>
              <p id="calendar-duration-help" className="mt-2 text-[12px] leading-4 text-[var(--co-muted)]">Enter hours and minutes, such as 03:00. This sets the job block length on the calendar.</p>
            </section>

            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--co-muted)]">Location</p>
              <p className="mt-1 text-sm text-[var(--co-ink)]">{location || "No address recorded"}</p>
            </div>

            {(job.roomCounts.length || job.customerNotes || job.gateCodeOrKeyNotes || job.petNotes || job.doNotClean) ? <div className="border-t border-[var(--co-line-soft)] pt-4"><p className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--co-muted)]">House details</p><ClientHomeSymbols className="mt-2" roomCounts={job.roomCounts} gateCodeOrKeyNotes={job.gateCodeOrKeyNotes} petNotes={job.petNotes} />{job.doNotClean ? <p className="mt-3 text-sm leading-5 text-[var(--co-danger)]"><strong>Don&apos;t clean:</strong> {cleanNoteText(job.doNotClean)}</p> : null}{job.customerNotes ? <p className="mt-3 whitespace-pre-wrap text-sm leading-5 text-[var(--co-ink)]">{cleanNoteText(job.customerNotes)}</p> : null}</div> : null}

            <div className="text-sm text-[var(--co-muted)]">{formatEstimatedTime(job.estimatedDurationMinutes)}</div>

            <div className="flex flex-wrap gap-2 border-t border-[var(--co-line-soft)] pt-4">
              {isDirty ? <button type="button" disabled={saving} onClick={() => { setDraftDate(job.scheduledDate); setDraftTime(job.scheduledStartTime?.slice(0, 5) ?? ""); setDraftStatus(job.status); setDraftPrice((job.priceCents / 100).toFixed(2)); setDraftDuration(formatDurationInput(job.estimatedDurationMinutes)); setDraftAssignedUserIds(assignedUserIds); }} className="co-button-secondary disabled:opacity-50">Discard changes</button> : null}
            </div>
          </div>
        ) : null}
      </aside>
      {slotFinderOpen && job ? (
        <SlotFinder
          intent="reschedule"
          jobId={job.id}
          customerName={`${job.customerFirstName} ${job.customerLastName}`}
          anchorDate={slotAnchorDate}
          currentSchedule={{ date: job.scheduledDate, startTime: job.scheduledStartTime }}
          currentEmployeeIds={draftAssignedUserIds}
          employees={employees}
          onClose={() => setSlotFinderOpen(false)}
          onConfirm={confirmSlot}
          onSkip={skipVisit}
        />
      ) : null}
    </div>
  );
}
