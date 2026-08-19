"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState, useTransition } from "react";
import { CircleUserRound, Mail, MapPin, Pencil, Phone, Send, XCircle } from "lucide-react";
import { statusOptions } from "@/components/ui/status-pill";
import { formatDisplayDate } from "@/lib/scheduling/dates";
import HandoffPanel from "./handoff-panel";
import JobPhotos from "./job-photos";
import TeamPanel from "./team-panel";
import TimeEntriesPanel from "./time-entries-panel";
import {
  CARD_CLASS,
  PAYMENT_METHOD_LABELS,
  TYPE_LABELS,
  formatDateTime,
  formatEstimatedTime,
  money,
  readableError,
  type Assignment,
  type AuditEntry,
  type Employee,
  type JobDetail,
  type TimeEntry,
} from "./types";

/**
 * Interactive shell for the job detail (dispatch) screen. All data arrives as
 * props from the server component; mutations go through the API routes and then
 * `router.refresh()` re-runs the server query, so the server stays the single
 * source of truth and there is no client-side copy of the job to keep in sync.
 */
export default function JobDetailClient({
  job,
  employees,
  assignments,
  timeEntries,
  auditLogs,
}: {
  job: JobDetail;
  employees: Employee[];
  assignments: Assignment[];
  timeEntries: TimeEntry[];
  auditLogs: AuditEntry[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [isRefreshing, startTransition] = useTransition();
  const saving = busy || isRefreshing;
  const [paymentMethodCollected, setPaymentMethodCollected] = useState(job.paymentMethodCollected ?? "");
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [cancellationReason, setCancellationReason] = useState("");
  const [editingPrice, setEditingPrice] = useState(false);
  const [priceInput, setPriceInput] = useState("");
  const [priceEditError, setPriceEditError] = useState<string | null>(null);
  const [editingJth, setEditingJth] = useState(false);
  const [jthInput, setJthInput] = useState("");
  const [jthEditError, setJthEditError] = useState<string | null>(null);
  const [feedbackBusy, setFeedbackBusy] = useState(false);
  const [feedbackLink, setFeedbackLink] = useState<string | null>(null);
  const [scheduleDate, setScheduleDate] = useState(job.scheduledDate);
  const [scheduleTime, setScheduleTime] = useState(job.scheduledStartTime?.slice(0, 5) ?? "");
  const [scheduleStatus, setScheduleStatus] = useState(job.status);
  const [draftAssignedIds, setDraftAssignedIds] = useState(() => assignments.map((assignment) => assignment.userId));
  const [draftTrainerId, setDraftTrainerId] = useState<string | null>(() => assignments.find((assignment) => assignment.role === "trainer")?.userId ?? null);

  const refresh = useCallback(() => {
    startTransition(() => router.refresh());
  }, [router]);

  const assignedEmployees = useMemo(() => {
    const assignedIds = new Set(assignments.map((assignment) => assignment.userId));
    return employees.filter((employee) => assignedIds.has(employee.id));
  }, [employees, assignments]);

  const recordedHours = useMemo(
    () => timeEntries.reduce((total, entry) => total + (entry.minutesWorked ?? 0), 0) / 60,
    [timeEntries]
  );
  const openEntries = useMemo(() => timeEntries.filter((entry) => !entry.clockOut).length, [timeEntries]);

  async function sendFeedbackLink() {
    setFeedbackBusy(true);
    setError(null);
    const response = await fetch(`/api/jobs/${job.id}/feedback-link`, { method: "POST" });
    const body = await response.json().catch(() => ({}));
    setFeedbackBusy(false);
    if (!response.ok) {
      setError(typeof body.error === "string" ? body.error : "Could not send the feedback link.");
      return;
    }
    setFeedbackLink(body.feedbackUrl ?? null);
    refresh();
  }

  // Time entries that carry an audit trail, so the table can mark them as touched.
  const editedEntryIds = useMemo(
    () => auditLogs.filter((log) => log.entityType === "time_entry").map((log) => log.entityId),
    [auditLogs]
  );

  const jobLocation = [job.addressLine1, job.city, job.state, job.zip].filter(Boolean).join(", ");

  const save = useCallback(
    async (fields: Record<string, unknown>) => {
      setBusy(true);
      setError(null);
      setWarning(null);
      const response = await fetch(`/api/jobs/${job.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fields),
      });
      const body = await response.json().catch(() => ({}));
      setBusy(false);
      if (!response.ok) {
        setError(readableError(body));
        return false;
      }
      if (Array.isArray(body?.warnings) && body.warnings.length) setWarning(body.warnings.join(" "));
      refresh();
      return true;
    },
    [job.id, refresh]
  );

  const createInvoice = useCallback(async () => {
    setBusy(true);
    setError(null);
    const response = await fetch("/api/invoices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customerId: job.customerId, jobId: job.id, totalCents: job.priceCents }),
    });
    const body = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) {
      setError(readableError(body));
      return;
    }
    router.push(`/invoices/${body.invoice.id}`);
  }, [job.customerId, job.id, job.priceCents, router]);

  const cancelJob = useCallback(() => {
    if (!cancellationReason.trim()) {
      setError("Enter a cancellation reason before cancelling this job.");
      return;
    }
    setConfirmingCancel(false);
    setScheduleStatus("cancelled");
    void save({ status: "cancelled", cancellationReason: cancellationReason.trim() });
  }, [cancellationReason, save]);

  const beginPriceEdit = useCallback(() => {
    setPriceInput((job.priceCents / 100).toFixed(2));
    setPriceEditError(null);
    setEditingJth(false);
    setEditingPrice(true);
  }, [job.priceCents]);

  const validatePriceDraft = useCallback(() => {
    const dollars = Number(priceInput);
    if (!Number.isFinite(dollars) || dollars < 0) {
      setPriceEditError("Enter a non-negative dollar amount.");
      return null;
    }
    setPriceEditError(null);
    return Math.round(dollars * 100);
  }, [priceInput]);

  const finishPriceEdit = useCallback(() => {
    if (validatePriceDraft() !== null) setEditingPrice(false);
  }, [validatePriceDraft]);

  const beginJthEdit = useCallback(() => {
    const minutes = job.estimatedDurationMinutes ?? 0;
    setJthInput(`${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}`);
    setJthEditError(null);
    setEditingPrice(false);
    setEditingJth(true);
  }, [job.estimatedDurationMinutes]);

  const validateJthDraft = useCallback(() => {
    const match = /^(\d+):([0-5]\d)$/.exec(jthInput.trim());
    const minutes = match ? Number(match[1]) * 60 + Number(match[2]) : Number.NaN;
    if (!Number.isInteger(minutes) || minutes < 15 || minutes > 600) {
      setJthEditError("Enter a duration from 0:15 to 10:00 (HH:MM).");
      return null;
    }
    setJthEditError(null);
    return minutes;
  }, [jthInput]);

  const finishJthEdit = useCallback(() => {
    if (validateJthDraft() !== null) setEditingJth(false);
  }, [validateJthDraft]);

  const savedAssignedIds = assignments.map((assignment) => assignment.userId);
  const savedTrainerId = assignments.find((assignment) => assignment.role === "trainer")?.userId ?? null;
  const scheduleDirty = scheduleDate !== job.scheduledDate || scheduleTime !== (job.scheduledStartTime?.slice(0, 5) ?? "") || scheduleStatus !== job.status;
  const assignmentDirty = draftAssignedIds.join(",") !== savedAssignedIds.join(",") || draftTrainerId !== savedTrainerId;
  const draftPriceCents = Number.isFinite(Number(priceInput)) ? Math.round(Number(priceInput) * 100) : null;
  const jthMatch = /^(\d+):([0-5]\d)$/.exec(jthInput.trim());
  const parsedJthMinutes = jthMatch ? Number(jthMatch[1]) * 60 + Number(jthMatch[2]) : Number.NaN;
  const draftJthMinutes = Number.isInteger(parsedJthMinutes) && parsedJthMinutes >= 15 && parsedJthMinutes <= 600 ? parsedJthMinutes : null;
  const priceDirty = draftPriceCents !== null && draftPriceCents !== job.priceCents;
  const jthDirty = draftJthMinutes !== null && draftJthMinutes !== (job.estimatedDurationMinutes ?? 0);
  const jobDetailsDirty = scheduleDirty || assignmentDirty || priceDirty || jthDirty;
  const saveJobDetails = useCallback(async () => {
    if (!jobDetailsDirty) return;
    const fields: Record<string, unknown> = {};
    if (scheduleDate !== job.scheduledDate) fields.scheduledDate = scheduleDate;
    if (scheduleTime !== (job.scheduledStartTime?.slice(0, 5) ?? "")) fields.scheduledStartTime = scheduleTime ? `${scheduleTime}:00` : null;
    if (scheduleStatus !== job.status) fields.status = scheduleStatus;
    if (assignmentDirty) {
      fields.employeeIds = draftAssignedIds;
      fields.trainerId = draftTrainerId;
    }
    if (priceDirty && draftPriceCents !== null) fields.priceCents = draftPriceCents;
    if (jthDirty && draftJthMinutes !== null) fields.estimatedDurationMinutes = draftJthMinutes;
    const saved = await save(fields);
    if (saved) {
      setEditingPrice(false);
      setEditingJth(false);
    }
  }, [assignmentDirty, draftAssignedIds, draftJthMinutes, draftPriceCents, draftTrainerId, job.scheduledDate, job.scheduledStartTime, job.status, jobDetailsDirty, jthDirty, priceDirty, save, scheduleDate, scheduleStatus, scheduleTime]);

  return (
    <div className="-mx-4 -mt-6 min-h-[100dvh] bg-[var(--co-bg)] pb-10 sm:-mx-6 lg:-mx-8">
      <div className="mx-auto flex max-w-[1500px] flex-wrap items-center justify-between gap-3 px-5 pb-1 pt-5 sm:px-8">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--co-muted)]">Job details</p>
          <h1 className="mt-1 text-xl font-bold">{job.customerFirstName} {job.customerLastName}</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={saving} onClick={createInvoice} className="co-button-secondary">Create invoice</button>
          <button type="button" disabled={saving || !jobDetailsDirty} onClick={() => void saveJobDetails()} className="co-button-primary disabled:opacity-50">{saving ? "Saving…" : "Save changes"}</button>
          {job.status === "cancelled" ? null : <button type="button" disabled={saving} onClick={() => setConfirmingCancel(true)} className="co-button-secondary !border-[var(--co-danger)]/30 !text-[var(--co-danger)] hover:!bg-[var(--co-danger)]/10"><XCircle className="h-4 w-4" /> Cancel job</button>}
        </div>
      </div>

      <main className="mx-auto grid max-w-[1500px] gap-6 px-5 py-7 xl:grid-cols-[290px_minmax(0,1fr)_280px] sm:px-8">
        <aside className="space-y-6">
          <section className={CARD_CLASS}>
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-semibold">Customer info</h2>
              <Link href={`/customers/${job.customerId}`} className="text-xs font-semibold text-[var(--co-accent-text)] hover:underline">
                Edit details
              </Link>
            </div>
            <div className="mt-5 flex items-center gap-3">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--co-surface-muted)] text-sm font-bold text-[var(--co-accent-text)]">
                <CircleUserRound className="h-7 w-7" />
              </span>
              <div>
                <Link href={`/customers/${job.customerId}`} className="font-bold hover:text-[var(--co-accent-text)] hover:underline">{job.customerFirstName} {job.customerLastName}</Link>
                <p className="text-xs text-[var(--co-muted)]">Customer record</p>
              </div>
            </div>
            <div className="mt-6 space-y-4 text-sm">
              <div className="flex gap-3">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[var(--co-accent-text)]" />
                <div>
                  <p className="font-semibold">{job.addressLine1 ?? "Address not recorded"}</p>
                  <p className="text-[var(--co-muted)]">{[job.city, job.state, job.zip].filter(Boolean).join(", ")}</p>
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(jobLocation)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 inline-block text-xs font-semibold text-[var(--co-accent-text)] hover:underline"
                  >
                    View on map
                  </a>
                </div>
              </div>
              {job.customerPhone ? (
                <a href={`tel:${job.customerPhone}`} className="flex gap-3 font-semibold hover:text-[var(--co-accent-text)]">
                  <Phone className="h-4 w-4 shrink-0 text-[var(--co-accent-text)]" />
                  {job.customerPhone}
                </a>
              ) : null}
              {job.customerEmail ? (
                <a href={`mailto:${job.customerEmail}`} className="flex gap-3 break-all text-[var(--co-muted)] hover:text-[var(--co-accent-text)]">
                  <Mail className="h-4 w-4 shrink-0 text-[var(--co-accent-text)]" />
                  {job.customerEmail}
                </a>
              ) : null}
            </div>
          </section>

          <section className={CARD_CLASS}>
            <h2 className="font-semibold">Service package</h2>
            <div className="mt-5 rounded-xl border border-[var(--co-line-soft)] bg-[var(--co-surface-muted)] p-4">
              <div className="flex items-start justify-between gap-2">
                <p className="font-bold text-[var(--co-accent-text)]">{job.serviceName ?? TYPE_LABELS[job.type] ?? job.type}</p>
                {editingPrice ? (
                  <form
                    className="flex flex-col items-end gap-1"
                    onSubmit={(event) => { event.preventDefault(); finishPriceEdit(); }}
                  >
                    <label className="text-xs text-[var(--co-muted)]" htmlFor="job-price">Price charged</label>
                    <div className="flex items-center gap-1">
                      <span className="text-sm font-semibold text-[var(--co-accent-text)]">$</span>
                      <input id="job-price" aria-invalid={Boolean(priceEditError)} type="number" min="0" step="0.01" value={priceInput} onChange={(event) => setPriceInput(event.target.value)} onFocus={(event) => event.target.select()} className="co-input w-24 py-1 text-sm" autoFocus disabled={saving} />
                      <button type="submit" disabled={saving} className="co-button-secondary px-2 py-1 text-xs disabled:opacity-50">Done</button>
                      <button type="button" disabled={saving} onClick={() => { setEditingPrice(false); setPriceEditError(null); }} className="co-button-secondary px-2 py-1 text-xs disabled:opacity-50">Cancel</button>
                    </div>
                    {priceEditError ? <p role="alert" className="max-w-48 text-right text-xs text-[var(--co-danger)]">{priceEditError}</p> : null}
                  </form>
                ) : (
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-[var(--co-muted)]">Price charged</span>
                    <span className="text-sm font-bold text-[var(--co-accent-text)]">{money(job.priceCents)}</span>
                    <button type="button" aria-label="Edit price charged" disabled={saving} onClick={beginPriceEdit} className="rounded p-1 text-[var(--co-accent-text)] hover:bg-[var(--co-surface-muted)] disabled:opacity-50">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>
              <p className="mt-1 text-xs text-[var(--co-muted)]">One-time appointment</p>
              {job.addOnNames.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {job.addOnNames.map((name) => (
                    <span key={name} className="rounded-full border border-[var(--co-line-soft)] bg-[var(--co-surface)] px-2.5 py-1 text-xs font-medium text-[var(--co-accent-text)]">
                      {name}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-[var(--co-line-soft)] bg-[var(--co-surface-muted)] p-3">
                <p className="text-xs text-[var(--co-muted)]">Scheduled</p>
                <p className="mt-1 font-semibold">{formatDisplayDate(job.scheduledDate)}</p>
              </div>
              <div className="rounded-xl border border-[var(--co-line-soft)] bg-[var(--co-surface-muted)] p-3">
                <p className="text-xs text-[var(--co-muted)]">Start time</p>
                <p className="mt-1 font-semibold">{job.scheduledStartTime?.slice(0, 5) ?? "Unscheduled"}</p>
              </div>
              <div className="col-span-2 rounded-xl border border-[var(--co-line-soft)] bg-[var(--co-surface-muted)] p-3">
                <p className="text-xs text-[var(--co-muted)]">Duration</p>
                {editingJth ? (
                  <form className="mt-1" onSubmit={(event) => { event.preventDefault(); finishJthEdit(); }}>
                    <label className="sr-only" htmlFor="job-ticket-hours">Duration in hours and minutes</label>
                    <div className="flex flex-wrap items-center gap-2">
                      <input id="job-ticket-hours" aria-invalid={Boolean(jthEditError)} aria-describedby={jthEditError ? "job-ticket-hours-error" : undefined} type="text" inputMode="numeric" pattern="\\d+:\\d{2}" value={jthInput} onChange={(event) => setJthInput(event.target.value)} placeholder="HH:MM" className="co-input w-24 py-1 text-sm" autoFocus disabled={saving} />
                      <button type="submit" disabled={saving} className="co-button-secondary px-2 py-1 text-xs disabled:opacity-50">Done</button>
                      <button type="button" disabled={saving} onClick={() => { setEditingJth(false); setJthEditError(null); }} className="co-button-secondary px-2 py-1 text-xs disabled:opacity-50">Cancel</button>
                    </div>
                    {jthEditError ? <p id="job-ticket-hours-error" role="alert" className="mt-1 text-xs text-[var(--co-danger)]">{jthEditError}</p> : <p className="mt-1 text-xs text-[var(--co-muted)]">Use HH:MM, from 0:15 to 10:00.</p>}
                  </form>
                ) : (
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <p className="font-semibold">{formatEstimatedTime(job.estimatedDurationMinutes)}</p>
                    {job.jthManualOverride ? <span className="rounded border border-[var(--co-line)] px-1.5 py-0.5 text-xs text-[var(--co-muted)]">Manually set</span> : null}
                    <button type="button" aria-label="Edit duration" disabled={saving} onClick={beginJthEdit} className="rounded p-1 text-[var(--co-accent-text)] hover:bg-[var(--co-surface-muted)] disabled:opacity-50">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>
            </div>
            {job.customerNotes ? (
              <div className="mt-4 rounded-xl border border-[var(--co-line-soft)] bg-[var(--co-surface-muted)] p-3">
                <p className="text-xs font-semibold text-[var(--co-muted)]">Special instructions</p>
                <p className="mt-2 whitespace-pre-line text-sm italic leading-5">{job.customerNotes}</p>
              </div>
            ) : null}
          </section>
        </aside>

        <section className="space-y-6">
          <TeamPanel
            // Remounting on a membership change resets the picker's draft selection
            // to whatever the server just saved. Sorted so row order can't churn it.
            key={assignments.map((assignment) => `${assignment.userId}:${assignment.role}`).sort().join("|")}
            employees={employees}
            assignments={assignments}
            assignedEmployees={assignedEmployees}
            selectedIds={draftAssignedIds}
            trainerId={draftTrainerId}
            onDraftChange={(employeeIds, trainerId) => {
              setDraftAssignedIds(employeeIds);
              setDraftTrainerId(trainerId);
            }}
          />

          <section className={CARD_CLASS}>
            <details className="mt-5 rounded-xl border border-[var(--co-line-soft)] p-3">
              <summary className="cursor-pointer text-sm font-semibold text-[var(--co-accent-text)]">Add close-out notes</summary>
              <textarea
                defaultValue={job.completionNotes ?? ""}
                onBlur={(event) => save({ completionNotes: event.target.value })}
                rows={4}
                className="co-input mt-3 w-full resize-none"
                placeholder="Notes save when you leave this field."
              />
            </details>
            <div className="mt-5 rounded-xl border border-[var(--co-line-soft)] p-3">
              <p className="text-sm font-semibold text-[var(--co-accent-text)]">Reported from the field</p>
              {job.feedbackStatus ? (
                <div className="mt-3 rounded-xl bg-[var(--co-surface-muted)] p-3">
                  <p className="text-xs font-bold uppercase tracking-[0.1em] text-[var(--co-muted)]">Customer check-out</p>
                  {job.feedbackExpired ? <p className="mt-1 text-xs font-semibold text-[var(--co-warning)]">Link expired — activate a new link to resend.</p> : null}
                  <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm">
                    {job.feedbackQualityRating ? <span className="font-semibold text-[var(--co-warning)]">{job.feedbackQualityRating}/5 quality</span> : <span className="text-[var(--co-muted)]">Awaiting response</span>}
                    {job.feedbackTipCents && job.feedbackTipCents > 0 ? <span className="font-semibold text-[var(--co-accent-text)]">{money(job.feedbackTipCents)} tip</span> : null}
                  </div>
                  {job.feedbackQualityComment ? <p className="mt-2 text-sm text-[var(--co-ink)]">“{job.feedbackQualityComment}”</p> : null}
                  {job.feedbackStatus !== "submitted" ? <div className="mt-3 flex flex-wrap items-center gap-2"><button type="button" onClick={sendFeedbackLink} disabled={feedbackBusy} className="co-button-secondary"><Send className="h-3.5 w-3.5" />{feedbackBusy ? "Sending…" : job.feedbackExpired ? "Activate & send new link" : "Send link again"}</button>{feedbackLink ? <input readOnly value={feedbackLink} className="co-input min-w-[220px] flex-1 text-xs" onFocus={(event) => event.currentTarget.select()} /> : null}</div> : null}
                </div>
              ) : <div className="mt-3 rounded-xl border border-dashed border-[var(--co-line-soft)] p-3"><p className="text-sm text-[var(--co-muted)]">No customer feedback link has been sent yet.</p><button type="button" onClick={sendFeedbackLink} disabled={feedbackBusy || job.status !== "completed"} className="co-button-secondary mt-3"><Send className="h-3.5 w-3.5" />{feedbackBusy ? "Sending…" : "Activate & send feedback link"}</button>{job.status !== "completed" ? <p className="mt-2 text-xs text-[var(--co-faint)]">Available after the job is completed.</p> : null}{feedbackLink ? <input readOnly value={feedbackLink} className="co-input mt-3 w-full text-xs" onFocus={(event) => event.currentTarget.select()} /> : null}</div>}
              <label className="mt-3 block">
                <span className="mb-1 block text-xs text-[var(--co-muted)]">Payment collected on-site</span>
                <select
                  value={paymentMethodCollected}
                  onChange={(event) => {
                    const value = event.target.value;
                    setPaymentMethodCollected(value);
                    save({ paymentMethodCollected: value || null });
                  }}
                  className="co-input w-full"
                >
                  <option value="">Not set</option>
                  {Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              {paymentMethodCollected === "check" ? (
                <label className="mt-3 block">
                  <span className="mb-1 block text-xs text-[var(--co-muted)]">Check number</span>
                  <input
                    type="text"
                    defaultValue={job.checkNumberCollected ?? ""}
                    onBlur={(event) => save({ checkNumberCollected: event.target.value })}
                    className="co-input w-full"
                    placeholder="Not reported"
                  />
                </label>
              ) : null}
              <label className="mt-3 block">
                <span className="mb-1 block text-xs text-[var(--co-muted)]">Damages / notes from the cleaner</span>
                <textarea
                  defaultValue={job.cleanerNotes ?? ""}
                  onBlur={(event) => save({ cleanerNotes: event.target.value })}
                  rows={3}
                  className="co-input w-full resize-none"
                  placeholder="Nothing reported."
                />
              </label>
            </div>
          </section>

          <section id="schedule" className={CARD_CLASS}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold">Schedule & status</h2>
                <p className="mt-1 text-sm text-[var(--co-muted)]">Update the visit without leaving the dispatch view.</p>
              </div>
              <Link href="/calendar" className="text-sm font-semibold text-[var(--co-accent-text)] hover:underline">
                Open calendar
              </Link>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <input
                aria-label="Scheduled date"
                type="date"
                value={scheduleDate}
                onChange={(event) => setScheduleDate(event.target.value)}
                className="co-input"
              />
              <input
                aria-label="Start time"
                type="time"
                value={scheduleTime}
                onChange={(event) => setScheduleTime(event.target.value)}
                className="co-input"
              />
              <select
                aria-label="Job status"
                value={scheduleStatus}
                onChange={(event) => {
                  if (event.target.value === "cancelled") {
                    setScheduleStatus(job.status);
                    setConfirmingCancel(true);
                    return;
                  }
                  setScheduleStatus(event.target.value);
                }}
                className="co-input"
              >
                {statusOptions("job").map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="mt-3">
              {jobDetailsDirty ? <button type="button" disabled={saving} onClick={() => { setScheduleDate(job.scheduledDate); setScheduleTime(job.scheduledStartTime?.slice(0, 5) ?? ""); setScheduleStatus(job.status); setDraftAssignedIds(savedAssignedIds); setDraftTrainerId(savedTrainerId); setPriceInput((job.priceCents / 100).toFixed(2)); setJthInput(`${Math.floor((job.estimatedDurationMinutes ?? 0) / 60)}:${String((job.estimatedDurationMinutes ?? 0) % 60).padStart(2, "0")}`); setPriceEditError(null); setJthEditError(null); setEditingPrice(false); setEditingJth(false); }} className="co-button-secondary disabled:opacity-50">Discard changes</button> : null}
            </div>
          </section>

          <TimeEntriesPanel
            jobId={job.id}
            scheduledDate={job.scheduledDate}
            scheduledStartTime={job.scheduledStartTime}
            assignedEmployees={assignedEmployees}
            timeEntries={timeEntries}
            editedEntryIds={editedEntryIds}
            onSaved={refresh}
            onError={setError}
          />
        </section>

        <aside className="space-y-6">
          <section className={CARD_CLASS}>
            <h2 className="font-semibold">Activity timeline</h2>
            <div className="mt-5 space-y-5 border-l-2 border-[var(--co-line-soft)] pl-5">
              {auditLogs.length ? (
                auditLogs.slice(0, 5).map((log, index) => (
                  <div key={log.id} className="relative">
                    <span
                      className={`absolute -left-[1.72rem] top-1 h-3 w-3 rounded-full border-2 border-white ${
                        index === 0 ? "bg-[var(--co-accent-fill)]" : "bg-[var(--co-line)]"
                      }`}
                    />
                    <p className="text-sm font-semibold">{log.action.replaceAll(".", " ")}</p>
                    <p className="mt-0.5 text-xs text-[var(--co-muted)]">
                      {formatDateTime(log.createdAt)} · {log.editorFirstName ?? "System"}
                    </p>
                  </div>
                ))
              ) : (
                <div className="relative">
                  <span className="absolute -left-[1.72rem] top-1 h-3 w-3 rounded-full border-2 border-white bg-[var(--co-accent-fill)]" />
                  <p className="text-sm font-semibold">Job scheduled</p>
                  <p className="mt-0.5 text-xs text-[var(--co-muted)]">No activity has been logged yet.</p>
                </div>
              )}
            </div>
          </section>

          <JobPhotos jobId={job.id} />

          <HandoffPanel
            status={job.status}
            recordedHours={recordedHours}
            openEntries={openEntries}
            saving={saving}
            onComplete={() => save({ status: "completed" })}
            onCreateInvoice={createInvoice}
          />
        </aside>
      </main>

      {warning ? (
        <div
          role="status"
          className="co-badge-warning fixed bottom-5 left-1/2 z-30 w-[min(92vw,600px)] -translate-x-1/2 rounded-xl px-4 py-3 text-sm shadow-lg"
        >
          <div className="flex items-start justify-between gap-3">
            <span>Scheduling warning: {warning}</span>
            <button type="button" onClick={() => setWarning(null)} className="shrink-0 font-semibold hover:underline">
              Dismiss
            </button>
          </div>
        </div>
      ) : null}

      {error ? (
        <div
          role="alert"
          className="co-badge-danger fixed bottom-5 left-1/2 z-30 w-[min(92vw,600px)] -translate-x-1/2 rounded-xl px-4 py-3 text-sm shadow-lg"
        >
          <div className="flex items-start justify-between gap-3">
            <span>{error}</span>
            <button type="button" onClick={() => setError(null)} className="shrink-0 font-semibold hover:underline">
              Dismiss
            </button>
          </div>
        </div>
      ) : null}

      {confirmingCancel ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" role="dialog" aria-modal="true" aria-labelledby="cancel-job-title">
          <div className="w-full max-w-md rounded-2xl border border-[var(--co-line)] bg-[var(--co-surface)] p-5 shadow-[0_20px_70px_rgba(15,23,20,0.25)]">
            <h2 id="cancel-job-title" className="text-lg font-semibold">Cancel this job?</h2>
            <p className="mt-1 text-sm text-[var(--co-muted)]">Add a reason so the team knows why this job was cancelled.</p>
            <label className="mt-4 block text-xs font-semibold text-[var(--co-muted)]">
              Cancellation reason
              <textarea autoFocus value={cancellationReason} onChange={(event) => setCancellationReason(event.target.value)} rows={3} placeholder="Why is this job being cancelled?" className="co-input mt-1 w-full resize-none" />
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" disabled={saving} onClick={() => { setConfirmingCancel(false); setCancellationReason(""); }} className="co-button-secondary">Keep job</button>
              <button type="button" disabled={saving || !cancellationReason.trim()} onClick={cancelJob} className="rounded-lg border border-[var(--co-danger)]/30 bg-[var(--co-danger)]/10 px-3 py-2 text-xs font-semibold text-[var(--co-danger)] hover:bg-[var(--co-danger)]/20 disabled:opacity-50">Confirm cancel</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
