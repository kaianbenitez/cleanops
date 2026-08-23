"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useDialogFocus } from "./dialog-focus";
import { commitJobPatch } from "./drag-commit";
import TeamSearchPicker from "@/components/team-search-picker";
import { formatDisplayDate } from "@/lib/scheduling/dates";
import { StatusPill } from "@/components/ui/status-pill";

type Employee = { id: string; firstName: string; lastName: string };

type JobDetail = {
  id: string;
  status: string;
  scheduledDate: string;
  scheduledStartTime: string | null;
  priceCents: number;
  customerFirstName: string;
  customerLastName: string;
  addressLine1: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
};

type History = {
  preferredCleaner: Employee | null;
  previousVisit: { scheduledDate: string; scheduledStartTime: string | null; employees: Employee[] } | null;
};

function formatVisitDate(iso: string) {
  return formatDisplayDate(iso);
}

function names(people: Employee[]) {
  return people.map((person) => `${person.firstName} ${person.lastName}`).join(", ");
}

/** Quick-assign panel opened from the Staff Board's unassigned queue. Lets an
 * admin assign a crew right from the queue card instead of navigating to the
 * full job page, and surfaces the two signals that actually inform who to
 * pick: the customer's preferred cleaner and who cleaned for them last time. */
export default function UnassignedPanel({ jobId, employees, onClose }: { jobId: string | null; employees: Employee[]; onClose: () => void }) {
  const router = useRouter();
  const [job, setJob] = useState<JobDetail | null>(null);
  const [history, setHistory] = useState<History | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [assigned, setAssigned] = useState(false);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [cancellationReason, setCancellationReason] = useState("");
  const dialogRef = useDialogFocus(Boolean(jobId));

  async function load(id: string, isCancelled: () => boolean) {
    setLoading(true);
    setError(null);
    setWarning(null);
    setAssigned(false);
    setSelectedIds([]);
    setConfirmingCancel(false);
    setCancellationReason("");
    try {
      const [jobBody, historyBody] = await Promise.all([
        fetch(`/api/jobs/${id}/summary`).then((res) => {
          if (!res.ok) throw new Error("Job details could not be loaded.");
          return res.json();
        }),
        fetch(`/api/jobs/${id}/history`).then((res) => {
          if (!res.ok) throw new Error("Job history could not be loaded.");
          return res.json();
        }),
      ]);
      if (isCancelled()) return;
      setJob(jobBody.job ?? null);
      setHistory({ preferredCleaner: historyBody.preferredCleaner ?? null, previousVisit: historyBody.previousVisit ?? null });
    } catch {
      if (!isCancelled()) setError("We couldn't load this job. Close the panel and try again.");
    } finally {
      if (!isCancelled()) setLoading(false);
    }
  }

  useEffect(() => {
    if (!jobId) return;
    let cancelled = false;
    // Fetching job + history from the server when the panel opens — same pattern as JobDetailPanel.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load(jobId, () => cancelled);
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
    const previousJob = job;
    const previousSelectedIds = [...selectedIds];
    const previousAssigned = assigned;
    commitJobPatch(job.id, fields, {
      onOptimistic: () => {
        setJob((current) => (current ? { ...current, ...fields } : current));
        setSaving(true);
        setError(null);
        setWarning(null);
      },
      onSuccess: () => {
        if (fields.employeeIds) setAssigned(true);
        router.refresh();
      },
      onWarning: setWarning,
      onError: (message) => {
        setJob(previousJob);
        setSelectedIds(previousSelectedIds);
        setAssigned(previousAssigned);
        setError(message);
        router.refresh();
      },
      onSettled: () => setSaving(false),
    });
  }

  function assignQuick(ids: string[]) {
    setSelectedIds(ids);
    patch({ employeeIds: ids });
  }

  const location = job ? [job.addressLine1, job.city, job.state, job.zip].filter(Boolean).join(", ") : "";

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4 sm:p-6">
      <button type="button" aria-label="Close assign panel" onClick={onClose} className="absolute inset-0 bg-[var(--co-overlay)]" />
      <aside ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="calendar-assign-title" className="relative flex h-[min(720px,calc(100dvh-2rem))] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-[var(--co-line)] bg-[var(--co-surface)] shadow-[var(--co-shadow-panel)] sm:h-[min(720px,calc(100dvh-3rem))]">
        <div className="flex items-start justify-between gap-3 border-b border-[var(--co-line-soft)] px-5 py-4">
          <div>
            <p className="eyebrow">Assign cleaner</p>
            <h2 id="calendar-assign-title" className="mt-1 text-lg font-semibold">{job ? `${job.customerFirstName} ${job.customerLastName}` : "Loading…"}</h2>
            {job ? (
              <p className="mt-0.5 text-xs text-[var(--co-muted)]">
                {formatVisitDate(job.scheduledDate)} · {job.scheduledStartTime?.slice(0, 5) ?? "No time"}
                {location ? ` · ${location}` : ""}
              </p>
            ) : null}
          </div>
          <button type="button" onClick={onClose} className="flex h-11 w-11 items-center justify-center rounded-full text-[var(--co-muted)] hover:bg-[var(--co-surface-muted)]" aria-label="Close">
            ✕
          </button>
        </div>

        {loading && !job ? <div className="p-5 text-sm text-[var(--co-muted)]">Loading job…</div> : null}
        {!job && error ? <p role="alert" aria-live="assertive" className="p-5 pt-0 text-xs font-medium text-[var(--co-danger)]">{error}</p> : null}

        {job ? (
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5">
            {error ? <p role="alert" aria-live="assertive" className="text-xs font-medium text-[var(--co-danger)]">{error}</p> : null}
            {warning ? <p role="status" className="co-badge-warning px-3 py-2 text-xs font-medium">Scheduling warning: {warning}</p> : null}
            {assigned ? <p className="rounded-xl bg-[var(--co-accent-tint)] px-3 py-2 text-xs font-medium text-[var(--co-accent-text)]">Assigned. This card will drop out of the unassigned queue on refresh.</p> : null}

            {history?.preferredCleaner ? (
              <div className="rounded-2xl border border-[var(--co-line)] bg-[var(--co-surface-muted)]/60 p-3.5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--co-muted)]">Customer&apos;s preferred cleaner</p>
                <div className="mt-1.5 flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold">{history.preferredCleaner.firstName} {history.preferredCleaner.lastName}</p>
                  <button
                    type="button"
                    disabled={saving || selectedIds.includes(history.preferredCleaner.id)}
                    onClick={() => assignQuick([history.preferredCleaner!.id])}
                    className="co-button-secondary py-1 text-xs disabled:opacity-50"
                  >
                    Assign
                  </button>
                </div>
              </div>
            ) : null}

            {history?.previousVisit ? (
              <div className="rounded-2xl border border-[var(--co-line-soft)] p-3.5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--co-muted)]">Last cleaning for this customer</p>
                <p className="mt-1.5 text-sm">
                  <span className="font-semibold">{history.previousVisit.employees.length ? names(history.previousVisit.employees) : "No one recorded"}</span>
                  <span className="text-[var(--co-muted)]"> · {formatVisitDate(history.previousVisit.scheduledDate)}{history.previousVisit.scheduledStartTime ? ` · ${history.previousVisit.scheduledStartTime.slice(0, 5)}` : ""}</span>
                </p>
                {history.previousVisit.employees.length ? (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => assignQuick(history.previousVisit!.employees.map((employee) => employee.id))}
                    className="co-button-secondary mt-2 py-1 text-xs disabled:opacity-50"
                  >
                    Assign same cleaner{history.previousVisit.employees.length > 1 ? "s" : ""}
                  </button>
                ) : null}
              </div>
            ) : (
              <p className="text-xs text-[var(--co-muted)]">No previous completed job on record for this customer.</p>
            )}

            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--co-muted)]">Assign crew</p>
              <div className="mt-2">
                <TeamSearchPicker employees={employees} selectedIds={selectedIds} onChange={setSelectedIds} />
              </div>
              <button type="button" disabled={saving || !selectedIds.length} onClick={() => patch({ employeeIds: selectedIds })} className="co-button-primary mt-3 w-full disabled:opacity-50">
                {saving ? "Saving…" : "Save assignment"}
              </button>
            </div>

            <div className="border-t border-[var(--co-line-soft)] pt-4">
              <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--co-muted)]">Reschedule</p>
              <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="block text-xs font-semibold text-[var(--co-muted)]">
                  Date
                  <input
                    key={`date-${job.scheduledDate}`}
                    type="date"
                    disabled={saving}
                    defaultValue={job.scheduledDate}
                    onBlur={(event) => event.target.value && event.target.value !== job.scheduledDate && patch({ scheduledDate: event.target.value })}
                    className="co-input mt-1 w-full disabled:opacity-60"
                  />
                </label>
                <label className="block text-xs font-semibold text-[var(--co-muted)]">
                  Time
                  <input
                    key={`time-${job.scheduledStartTime}`}
                    type="time"
                    disabled={saving}
                    defaultValue={job.scheduledStartTime?.slice(0, 5) ?? ""}
                    onBlur={(event) => {
                      if (!event.target.value) return;
                      const withSeconds = `${event.target.value}:00`;
                      if (withSeconds !== job.scheduledStartTime) patch({ scheduledStartTime: withSeconds });
                    }}
                    className="co-input mt-1 w-full disabled:opacity-60"
                  />
                </label>
              </div>
            </div>

            <label className="block text-xs font-semibold text-[var(--co-muted)]">
              Amount
              <div className="mt-1 flex items-stretch">
                <span className="flex items-center rounded-l-[var(--co-radius-control)] border border-r-0 border-[var(--co-input-border)] bg-[var(--co-input-bg)] px-3 text-sm text-[var(--co-muted)]">
                  $
                </span>
                <input
                  key={`price-${job.priceCents}`}
                  type="number"
                  step="0.01"
                  min="0"
                  disabled={saving}
                  defaultValue={(job.priceCents / 100).toFixed(2)}
                  onBlur={(event) => {
                    const nextCents = Math.round(Number(event.target.value || 0) * 100);
                    if (Number.isFinite(nextCents) && nextCents >= 0 && nextCents !== job.priceCents) patch({ priceCents: nextCents });
                  }}
                  onFocus={(event) => event.target.select()}
                  className="co-input w-full rounded-l-none disabled:opacity-60"
                />
              </div>
            </label>

            <div className="border-t border-[var(--co-line-soft)] pt-4">
              {job.status === "cancelled" ? (
                <StatusPill domain="job" status="cancelled" />
              ) : confirmingCancel ? (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-[var(--co-danger)]">Cancel this appointment?</p>
                  <label className="block text-xs font-semibold text-[var(--co-danger)]">Cancellation reason<textarea aria-label="Cancellation reason" value={cancellationReason} onChange={(event) => setCancellationReason(event.target.value)} rows={2} placeholder="Why is this job being cancelled?" className="co-input mt-1 w-full resize-none text-xs" /></label>
                  <div className="flex gap-2">
                  <button type="button" disabled={saving} onClick={() => { setConfirmingCancel(false); setCancellationReason(""); }} className="co-button-secondary py-1 text-xs disabled:opacity-50">
                    Keep job
                  </button>
                  <button
                    type="button"
                    disabled={saving || !cancellationReason.trim()}
                    onClick={() => {
                      setConfirmingCancel(false);
                      patch({ status: "cancelled", cancellationReason: cancellationReason.trim() });
                    }}
                    className="rounded-lg border border-[var(--co-danger)]/30 bg-[var(--co-danger)]/10 px-3 py-1 text-xs font-semibold text-[var(--co-danger)] hover:bg-[var(--co-danger)]/20 disabled:opacity-50"
                  >
                    Confirm cancel
                  </button>
                  </div>
                </div>
              ) : (
                <button type="button" disabled={saving} onClick={() => setConfirmingCancel(true)} className="text-xs font-semibold text-[var(--co-danger)] hover:underline disabled:opacity-50">
                  Cancel this job / appointment
                </button>
              )}
            </div>

            <Link href={`/jobs/${job.id}`} className="block text-center text-xs font-semibold text-[var(--co-accent-text)] hover:underline">
              Open full job page
            </Link>
          </div>
        ) : null}
      </aside>
    </div>
  );
}
