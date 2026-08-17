"use client";

import { formatDisplayDate } from "@/lib/scheduling/dates";
import type { SeriesCustomerOption } from "@/lib/recurring/new-series-data";
import { DAYS, FREQUENCY_LABELS, type SeriesFrequency } from "./constants";
import type { Submission } from "./types";

/** Sticky sidebar: a plain-language read-back of the series plus the submit
 * button and its result. Everything here is derived from the form state — it
 * holds none of its own. */
export default function SeriesSummary({
  customer,
  frequency,
  dayOfWeek,
  startDate,
  priceCents,
  teamCount,
  submission,
  onViewCalendar,
}: {
  customer: SeriesCustomerOption | null;
  frequency: SeriesFrequency;
  dayOfWeek: number;
  startDate: string;
  priceCents: number;
  teamCount: number;
  submission: Submission;
  onViewCalendar: () => void;
}) {
  return (
    <aside className="xl:sticky xl:top-5 xl:self-start">
      <section className="co-card p-5">
        <p className="eyebrow">Series summary</p>
        <h2 className="mt-1 text-xl font-semibold">Ready to generate</h2>

        <div className="mt-5 space-y-4 border-y border-[var(--co-line-soft)] py-5 text-sm">
          <Row label="Customer" value={customer ? `${customer.firstName} ${customer.lastName}` : "Not selected"} />
          <Row label="Frequency" value={FREQUENCY_LABELS[frequency]} />
          {frequency !== "monthly" ? (
            <Row label="Preferred day" value={DAYS.find((day) => day.value === dayOfWeek)?.label ?? "—"} />
          ) : null}
          <Row label="First visit" value={startDate ? formatDisplayDate(startDate) : "Not selected"} />
          <Row label="Price / visit" value={`$${(priceCents / 100).toFixed(2)}`} />
          <Row label="Default team" value={teamCount ? `${teamCount} assigned` : "Assign later"} />
        </div>

        {submission.state === "error" ? (
          <p className="co-badge-danger mt-4 rounded-xl px-3 py-2 text-sm">{submission.message}</p>
        ) : null}

        {submission.state === "done" ? (
          <div className="mt-4 rounded-xl bg-[var(--co-surface-muted)] px-3 py-3 text-sm text-[var(--co-success)]">
            Generated {submission.created} visit{submission.created === 1 ? "" : "s"}.{" "}
            {submission.skipped ? `${submission.skipped} already existed.` : ""}
          </div>
        ) : null}

        <button type="submit" disabled={submission.state === "submitting"} className="co-button-primary mt-5 w-full py-3">
          {submission.state === "submitting" ? "Generating…" : "Create recurring series →"}
        </button>

        {submission.state === "done" ? (
          <button type="button" onClick={onViewCalendar} className="co-button-secondary mt-2 w-full">
            View calendar
          </button>
        ) : null}
      </section>
    </aside>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-[var(--co-muted)]">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}
