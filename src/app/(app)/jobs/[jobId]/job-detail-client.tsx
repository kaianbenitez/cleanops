"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState, useTransition } from "react";
import { ArrowLeft, CalendarClock, Check, CircleUserRound, Mail, MapPin, Pencil, Phone, Send, UserPlus, XCircle } from "lucide-react";
import { StatusPill, statusOptions } from "@/components/ui/status-pill";
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
    void save({ status: "cancelled", cancellationReason: cancellationReason.trim() });
  }, [cancellationReason, save]);

  const beginPriceEdit = useCallback(() => {
    setPriceInput((job.priceCents / 100).toFixed(2));
    setPriceEditError(null);
    setEditingJth(false);
    setEditingPrice(true);
  }, [job.priceCents]);

  const savePrice = useCallback(async () => {
    const dollars = Number(priceInput);
    if (!Number.isFinite(dollars) || dollars < 0) {
      setPriceEditError("Enter a non-negative dollar amount.");
      return;
    }
    const saved = await save({ priceCents: Math.round(dollars * 100) });
    if (saved) setEditingPrice(false);
  }, [priceInput, save]);

  const beginJthEdit = useCallback(() => {
    const minutes = job.estimatedDurationMinutes ?? 0;
    setJthInput(`${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}`);
    setJthEditError(null);
    setEditingPrice(false);
    setEditingJth(true);
  }, [job.estimatedDurationMinutes]);

  const saveJth = useCallback(async () => {
    const match = /^(\d+):([0-5]\d)$/.exec(jthInput.trim());
    const minutes = match ? Number(match[1]) * 60 + Number(match[2]) : Number.NaN;
    if (!Number.isInteger(minutes) || minutes < 15 || minutes > 600) {
      setJthEditError("Enter a duration from 0:15 to 10:00 (HH:MM).");
      return;
    }
    const saved = await save({ estimatedDurationMinutes: minutes });
    if (saved) setEditingJth(false);
  }, [jthInput, save]);

  const serviceProgress = job.status === "completed" ? 100 : job.status === "in_progress" ? 62 : timeEntries.length > 0 ? 35 : 0;
  const serviceSteps = [
    { label: "Arrival & access", detail: "Confirm arrival, access, and home notes.", done: job.status !== "scheduled" },
    { label: `${job.serviceName ?? TYPE_LABELS[job.type] ?? job.type} service`, detail: "Complete the quoted cleaning scope.", done: job.status === "completed" },
    { label: "Close-out & photos", detail: "Add service notes and photos before handoff.", done: job.status === "completed" && Boolean(job.completionNotes) },
  ];

  function scrollTo(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  return (
    <div className="-mx-4 -mt-6 min-h-[100dvh] bg-[#f7f9f6] pb-10 sm:-mx-6 lg:-mx-8">
      <header className="sticky top-0 z-20 border-b border-[#d7e0d7] bg-[#fbfdf9]/95 px-5 py-3 backdrop-blur sm:px-8">
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <Link href="/jobs" aria-label="Back to jobs" className="rounded-lg p-2 text-[var(--co-ink)] transition hover:bg-[#edf3eb]">
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <span className="text-lg font-bold tracking-[-0.03em]">Job #{job.id.slice(0, 8).toUpperCase()}</span>
            <StatusPill domain="job" status={job.status} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => scrollTo("assignment")} className="co-button-secondary">
              <UserPlus className="h-4 w-4" /> Reassign
            </button>
            <button type="button" onClick={() => scrollTo("schedule")} className="co-button-secondary">
              <CalendarClock className="h-4 w-4" /> Reschedule
            </button>
            {job.status === "cancelled" ? null : (
              <button type="button" disabled={saving} onClick={createInvoice} className="co-button-secondary">
                Create draft invoice
              </button>
            )}
            {job.status === "cancelled" ? null : confirmingCancel ? (
              <div className="co-badge-danger w-full space-y-2 rounded-lg p-3 sm:w-[22rem]">
                <label className="block text-xs font-semibold">
                  Cancellation reason
                  <textarea value={cancellationReason} onChange={(event) => setCancellationReason(event.target.value)} rows={2} placeholder="Why is this job being cancelled?" className="co-input mt-1 w-full resize-none" />
                </label>
                <div className="flex gap-2">
                  <button type="button" disabled={saving} onClick={() => { setConfirmingCancel(false); setCancellationReason(""); }} className="co-button-secondary py-1 text-xs disabled:opacity-50">Keep job</button>
                  <button type="button" disabled={saving || !cancellationReason.trim()} onClick={cancelJob} className="rounded-lg border border-[var(--co-danger)]/30 bg-[var(--co-danger)]/10 px-3 py-1 text-xs font-semibold text-[var(--co-danger)] hover:bg-[var(--co-danger)]/20 disabled:opacity-50">Confirm cancel</button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                disabled={saving}
                onClick={() => setConfirmingCancel(true)}
                className="co-button-secondary !border-[var(--co-danger)]/30 !text-[var(--co-danger)] hover:!bg-[var(--co-danger)]/10"
              >
                <XCircle className="h-4 w-4" /> Cancel
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-[1500px] gap-6 px-5 py-7 xl:grid-cols-[290px_minmax(0,1fr)_280px] sm:px-8">
        <aside className="space-y-6">
          <section className={CARD_CLASS}>
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-semibold">Customer info</h2>
              <Link href={`/customers/${job.customerId}`} className="text-xs font-semibold text-[var(--co-evergreen)] hover:underline">
                Edit details
              </Link>
            </div>
            <div className="mt-5 flex items-center gap-3">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#e4eee2] text-sm font-bold text-[var(--co-evergreen)]">
                <CircleUserRound className="h-7 w-7" />
              </span>
              <div>
                <Link href={`/customers/${job.customerId}`} className="font-bold hover:text-[var(--co-evergreen)] hover:underline">{job.customerFirstName} {job.customerLastName}</Link>
                <p className="text-xs text-[var(--co-muted)]">Customer record</p>
              </div>
            </div>
            <div className="mt-6 space-y-4 text-sm">
              <div className="flex gap-3">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[var(--co-evergreen)]" />
                <div>
                  <p className="font-semibold">{job.addressLine1 ?? "Address not recorded"}</p>
                  <p className="text-[var(--co-muted)]">{[job.city, job.state, job.zip].filter(Boolean).join(", ")}</p>
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(jobLocation)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 inline-block text-xs font-semibold text-[var(--co-evergreen)] hover:underline"
                  >
                    View on map
                  </a>
                </div>
              </div>
              {job.customerPhone ? (
                <a href={`tel:${job.customerPhone}`} className="flex gap-3 font-semibold hover:text-[var(--co-evergreen)]">
                  <Phone className="h-4 w-4 shrink-0 text-[var(--co-evergreen)]" />
                  {job.customerPhone}
                </a>
              ) : null}
              {job.customerEmail ? (
                <a href={`mailto:${job.customerEmail}`} className="flex gap-3 break-all text-[var(--co-muted)] hover:text-[var(--co-evergreen)]">
                  <Mail className="h-4 w-4 shrink-0 text-[var(--co-evergreen)]" />
                  {job.customerEmail}
                </a>
              ) : null}
            </div>
          </section>

          <section className={CARD_CLASS}>
            <h2 className="font-semibold">Service package</h2>
            <div className="mt-5 rounded-xl border border-[#d3e0d2] bg-[#f1f7ef] p-4">
              <div className="flex items-start justify-between gap-2">
                <p className="font-bold text-[var(--co-evergreen)]">{job.serviceName ?? TYPE_LABELS[job.type] ?? job.type}</p>
                {editingPrice ? (
                  <form
                    className="flex flex-col items-end gap-1"
                    onSubmit={(event) => { event.preventDefault(); void savePrice(); }}
                  >
                    <label className="text-xs text-[var(--co-muted)]" htmlFor="job-price">Price charged</label>
                    <div className="flex items-center gap-1">
                      <span className="text-sm font-semibold text-[var(--co-evergreen)]">$</span>
                      <input id="job-price" aria-invalid={Boolean(priceEditError)} type="number" min="0" step="0.01" value={priceInput} onChange={(event) => setPriceInput(event.target.value)} onFocus={(event) => event.target.select()} className="co-input w-24 py-1 text-sm" autoFocus disabled={saving} />
                      <button type="submit" disabled={saving} className="co-button-secondary px-2 py-1 text-xs disabled:opacity-50">Save</button>
                      <button type="button" disabled={saving} onClick={() => { setEditingPrice(false); setPriceEditError(null); }} className="co-button-secondary px-2 py-1 text-xs disabled:opacity-50">Cancel</button>
                    </div>
                    {priceEditError ? <p role="alert" className="max-w-48 text-right text-xs text-[var(--co-danger)]">{priceEditError}</p> : null}
                  </form>
                ) : (
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-[var(--co-muted)]">Price charged</span>
                    <span className="text-sm font-bold text-[var(--co-evergreen)]">{money(job.priceCents)}</span>
                    <button type="button" aria-label="Edit price charged" disabled={saving} onClick={beginPriceEdit} className="rounded p-1 text-[var(--co-evergreen)] hover:bg-white disabled:opacity-50">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>
              <p className="mt-1 text-xs text-[var(--co-muted)]">One-time appointment</p>
              {job.addOnNames.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {job.addOnNames.map((name) => (
                    <span key={name} className="rounded-full border border-[#d3e0d2] bg-white px-2.5 py-1 text-xs font-medium text-[var(--co-evergreen)]">
                      {name}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-[#d3e0d2] bg-[#f7fbf5] p-3">
                <p className="text-xs text-[var(--co-muted)]">Scheduled</p>
                <p className="mt-1 font-semibold">{formatDisplayDate(job.scheduledDate)}</p>
              </div>
              <div className="rounded-xl border border-[#d3e0d2] bg-[#f7fbf5] p-3">
                <p className="text-xs text-[var(--co-muted)]">Start time</p>
                <p className="mt-1 font-semibold">{job.scheduledStartTime?.slice(0, 5) ?? "Unscheduled"}</p>
              </div>
              <div className="col-span-2 rounded-xl border border-[#d3e0d2] bg-[#f7fbf5] p-3">
                <p className="text-xs text-[var(--co-muted)]">Job Ticket Hours</p>
                {editingJth ? (
                  <form className="mt-1" onSubmit={(event) => { event.preventDefault(); void saveJth(); }}>
                    <label className="sr-only" htmlFor="job-ticket-hours">Job Ticket Hours in hours and minutes</label>
                    <div className="flex flex-wrap items-center gap-2">
                      <input id="job-ticket-hours" aria-invalid={Boolean(jthEditError)} aria-describedby={jthEditError ? "job-ticket-hours-error" : undefined} type="text" inputMode="numeric" pattern="\\d+:\\d{2}" value={jthInput} onChange={(event) => setJthInput(event.target.value)} placeholder="HH:MM" className="co-input w-24 py-1 text-sm" autoFocus disabled={saving} />
                      <button type="submit" disabled={saving} className="co-button-secondary px-2 py-1 text-xs disabled:opacity-50">Save</button>
                      <button type="button" disabled={saving} onClick={() => { setEditingJth(false); setJthEditError(null); }} className="co-button-secondary px-2 py-1 text-xs disabled:opacity-50">Cancel</button>
                    </div>
                    {jthEditError ? <p id="job-ticket-hours-error" role="alert" className="mt-1 text-xs text-[var(--co-danger)]">{jthEditError}</p> : <p className="mt-1 text-xs text-[var(--co-muted)]">Use HH:MM, from 0:15 to 10:00.</p>}
                  </form>
                ) : (
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <p className="font-semibold">{formatEstimatedTime(job.estimatedDurationMinutes)}</p>
                    {job.jthManualOverride ? <span className="rounded border border-[#b8c6b8] px-1.5 py-0.5 text-xs text-[var(--co-muted)]">Manually set</span> : null}
                    <button type="button" aria-label="Edit Job Ticket Hours" disabled={saving} onClick={beginJthEdit} className="rounded p-1 text-[var(--co-evergreen)] hover:bg-white disabled:opacity-50">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>
            </div>
            {job.customerNotes ? (
              <div className="mt-4 rounded-xl border border-[#d3e0d2] bg-[#f7fbf5] p-3">
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
            saving={saving}
            onSave={(employeeIds, trainerId) => save({ employeeIds, trainerId })}
          />

          <section className={CARD_CLASS}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold">Cleaning checklist</h2>
                <p className="mt-1 text-xs text-[var(--co-muted)]">Live job progress from the service status.</p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-[var(--co-evergreen)]">{serviceProgress}%</p>
                <p className="text-xs text-[var(--co-muted)]">Complete</p>
              </div>
            </div>
            <div className="mt-5 h-2 overflow-hidden rounded-full bg-[#dfe6df]">
              <div className="h-full bg-[var(--co-evergreen)] transition-all" style={{ width: `${serviceProgress}%` }} />
            </div>
            <div className="mt-5 space-y-4">
              {serviceSteps.map((step) => (
                <div key={step.label} className={`flex gap-3 rounded-xl p-3 ${step.done ? "bg-[#f4f8f3]" : ""}`}>
                  <span
                    className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded ${
                      step.done ? "bg-[var(--co-evergreen)] text-white" : "border border-[#b8c6b8] bg-white"
                    }`}
                  >
                    {step.done ? <Check className="h-3.5 w-3.5" /> : null}
                  </span>
                  <div>
                    <p className={`font-semibold ${step.done ? "line-through decoration-[#8da28e]" : ""}`}>{step.label}</p>
                    <p className="mt-0.5 text-sm text-[var(--co-muted)]">{step.detail}</p>
                  </div>
                </div>
              ))}
            </div>
            <details className="mt-5 rounded-xl border border-[#d5ded5] p-3">
              <summary className="cursor-pointer text-sm font-semibold text-[var(--co-evergreen)]">Add close-out notes</summary>
              <textarea
                defaultValue={job.completionNotes ?? ""}
                onBlur={(event) => save({ completionNotes: event.target.value })}
                rows={4}
                className="co-input mt-3 w-full resize-none"
                placeholder="Notes save when you leave this field."
              />
            </details>
            <div className="mt-5 rounded-xl border border-[#d5ded5] p-3">
              <p className="text-sm font-semibold text-[var(--co-evergreen)]">Reported from the field</p>
              {job.feedbackStatus ? (
                <div className="mt-3 rounded-xl bg-[#f4f8f3] p-3">
                  <p className="text-xs font-bold uppercase tracking-[0.1em] text-[var(--co-muted)]">Customer check-out</p>
                  {job.feedbackExpired ? <p className="mt-1 text-xs font-semibold text-[var(--co-warning)]">Link expired — activate a new link to resend.</p> : null}
                  <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm">
                    {job.feedbackQualityRating ? <span className="font-semibold text-[var(--co-warning)]">{job.feedbackQualityRating}/5 quality</span> : <span className="text-[var(--co-muted)]">Awaiting response</span>}
                    {job.feedbackTipCents && job.feedbackTipCents > 0 ? <span className="font-semibold text-[var(--co-evergreen)]">{money(job.feedbackTipCents)} tip</span> : null}
                  </div>
                  {job.feedbackQualityComment ? <p className="mt-2 text-sm text-[var(--co-ink)]">“{job.feedbackQualityComment}”</p> : null}
                  {job.feedbackStatus !== "submitted" ? <div className="mt-3 flex flex-wrap items-center gap-2"><button type="button" onClick={sendFeedbackLink} disabled={feedbackBusy} className="co-button-secondary"><Send className="h-3.5 w-3.5" />{feedbackBusy ? "Sending…" : job.feedbackExpired ? "Activate & send new link" : "Send link again"}</button>{feedbackLink ? <input readOnly value={feedbackLink} className="co-input min-w-[220px] flex-1 text-xs" onFocus={(event) => event.currentTarget.select()} /> : null}</div> : null}
                </div>
              ) : <div className="mt-3 rounded-xl border border-dashed border-[#d5ded5] p-3"><p className="text-sm text-[var(--co-muted)]">No customer feedback link has been sent yet.</p><button type="button" onClick={sendFeedbackLink} disabled={feedbackBusy || job.status !== "completed"} className="co-button-secondary mt-3"><Send className="h-3.5 w-3.5" />{feedbackBusy ? "Sending…" : "Activate & send feedback link"}</button>{job.status !== "completed" ? <p className="mt-2 text-xs text-[var(--co-faint)]">Available after the job is completed.</p> : null}{feedbackLink ? <input readOnly value={feedbackLink} className="co-input mt-3 w-full text-xs" onFocus={(event) => event.currentTarget.select()} /> : null}</div>}
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
              <Link href="/calendar" className="text-sm font-semibold text-[var(--co-evergreen)] hover:underline">
                Open calendar
              </Link>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <input
                aria-label="Scheduled date"
                type="date"
                defaultValue={job.scheduledDate}
                onBlur={(event) => save({ scheduledDate: event.target.value })}
                className="co-input"
              />
              <input
                aria-label="Start time"
                type="time"
                defaultValue={job.scheduledStartTime?.slice(0, 5) ?? ""}
                onBlur={(event) => event.target.value && save({ scheduledStartTime: `${event.target.value}:00` })}
                className="co-input"
              />
              <select
                aria-label="Job status"
                value={job.status}
                onChange={(event) => save({ status: event.target.value })}
                className="co-input"
              >
                {statusOptions("job").map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
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
            <div className="mt-5 space-y-5 border-l-2 border-[#c8d7c8] pl-5">
              {auditLogs.length ? (
                auditLogs.slice(0, 5).map((log, index) => (
                  <div key={log.id} className="relative">
                    <span
                      className={`absolute -left-[1.72rem] top-1 h-3 w-3 rounded-full border-2 border-white ${
                        index === 0 ? "bg-[var(--co-evergreen)]" : "bg-[#b7c7b8]"
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
                  <span className="absolute -left-[1.72rem] top-1 h-3 w-3 rounded-full border-2 border-white bg-[var(--co-evergreen)]" />
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
    </div>
  );
}
