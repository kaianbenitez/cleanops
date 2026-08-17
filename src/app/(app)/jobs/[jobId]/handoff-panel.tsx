"use client";

import { CARD_CLASS } from "./types";

/**
 * End-of-job handoff: recorded time at a glance, then the single next action —
 * finish the job, or turn a finished job into an invoice.
 */
export default function HandoffPanel({
  status,
  recordedHours,
  openEntries,
  saving,
  onComplete,
  onCreateInvoice,
}: {
  status: string;
  recordedHours: number;
  openEntries: number;
  saving: boolean;
  onComplete: () => void;
  onCreateInvoice: () => void;
}) {
  const completed = status === "completed";

  return (
    <section className={CARD_CLASS}>
      <h2 className="font-semibold">Time & handoff</h2>
      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-xl bg-[var(--co-surface-muted)] p-3">
          <p className="text-xs text-[var(--co-muted)]">Recorded</p>
          <p className="mt-1 font-bold">{recordedHours.toFixed(2)} hrs</p>
        </div>
        <div className="rounded-xl bg-[var(--co-surface-muted)] p-3">
          <p className="text-xs text-[var(--co-muted)]">Open clocks</p>
          <p className="mt-1 font-bold">{openEntries}</p>
        </div>
      </div>

      {openEntries > 0 ? (
        <p className="mt-3 text-xs text-[var(--co-muted)]">
          {openEntries === 1 ? "One technician is" : `${openEntries} technicians are`} still clocked in — hours are incomplete until they clock out.
        </p>
      ) : null}

      <button
        type="button"
        disabled={saving}
        onClick={completed ? onCreateInvoice : onComplete}
        className="co-button-primary mt-4 w-full justify-center"
      >
        {saving ? "Saving..." : completed ? "Create invoice" : "Mark completed"}
      </button>
    </section>
  );
}
