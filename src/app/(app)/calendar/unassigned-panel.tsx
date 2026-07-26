"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { commitJobPatch } from "./drag-commit";
import TeamSearchPicker from "@/components/team-search-picker";
import { formatDisplayDate } from "@/lib/scheduling/dates";

type Employee = { id: string; firstName: string; lastName: string };

type JobDetail = {
  id: string;
  scheduledDate: string;
  scheduledStartTime: string | null;
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
  const [assigned, setAssigned] = useState(false);

  async function load(id: string, isCancelled: () => boolean) {
    setLoading(true);
    setError(null);
    setAssigned(false);
    setSelectedIds([]);
    try {
      const [jobBody, historyBody] = await Promise.all([
        fetch(`/api/jobs/${id}`).then((res) => res.json()),
        fetch(`/api/jobs/${id}/history`).then((res) => res.json()),
      ]);
      if (isCancelled()) return;
      setJob(jobBody.job ?? null);
      setHistory({ preferredCleaner: historyBody.preferredCleaner ?? null, previousVisit: historyBody.previousVisit ?? null });
    } catch {
      if (!isCancelled()) setError("Couldn't load this job.");
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

  function assignQuick(ids: string[]) {
    setSelectedIds(ids);
    save(ids);
  }

  function save(ids: string[]) {
    if (!job) return;
    commitJobPatch(job.id, { employeeIds: ids }, {
      onOptimistic: () => {
        setSaving(true);
        setError(null);
      },
      onSuccess: () => {
        setAssigned(true);
        router.refresh();
      },
      onError: (message) => setError(message),
      onSettled: () => setSaving(false),
    });
  }

  const location = job ? [job.addressLine1, job.city, job.state, job.zip].filter(Boolean).join(", ") : "";

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <button type="button" aria-label="Close assign panel" onClick={onClose} className="absolute inset-0 bg-black/30" />
      <aside className="relative flex h-full w-full max-w-md flex-col overflow-y-auto border-l border-[var(--co-line)] bg-white shadow-[0_0_60px_rgba(15,23,20,0.25)]">
        <div className="flex items-start justify-between gap-3 border-b border-[var(--co-line-soft)] px-5 py-4">
          <div>
            <p className="eyebrow">Assign cleaner</p>
            <h2 className="mt-1 text-lg font-semibold">{job ? `${job.customerFirstName} ${job.customerLastName}` : "Loading…"}</h2>
            {job ? (
              <p className="mt-0.5 text-xs text-[var(--co-muted)]">
                {formatVisitDate(job.scheduledDate)} · {job.scheduledStartTime?.slice(0, 5) ?? "No time"}
                {location ? ` · ${location}` : ""}
              </p>
            ) : null}
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-1 text-[var(--co-muted)] hover:bg-[var(--co-surface-muted)]" aria-label="Close">
            ✕
          </button>
        </div>

        {loading && !job ? <div className="p-5 text-sm text-[var(--co-muted)]">Loading job…</div> : null}

        {job ? (
          <div className="flex-1 space-y-5 px-5 py-5">
            {error ? <p className="text-xs font-medium text-rose-600">{error}</p> : null}
            {assigned ? <p className="rounded-xl bg-[var(--co-accent-tint)] px-3 py-2 text-xs font-medium text-[var(--co-evergreen)]">Assigned. This card will drop out of the unassigned queue on refresh.</p> : null}

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
              <button type="button" disabled={saving || !selectedIds.length} onClick={() => save(selectedIds)} className="co-button-primary mt-3 w-full disabled:opacity-50">
                {saving ? "Saving…" : "Save assignment"}
              </button>
            </div>

            <Link href={`/jobs/${job.id}`} className="block text-center text-xs font-semibold text-[var(--co-evergreen)] hover:underline">
              Open full job page
            </Link>
          </div>
        ) : null}
      </aside>
    </div>
  );
}
