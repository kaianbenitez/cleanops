"use client";

import { ChevronRight } from "lucide-react";
import { timestampLabel } from "@/lib/my-day/job-format";
import type { LedgerEvent } from "@/lib/my-day/workday-state";

const VISIBLE_TAIL = 3;

function Row({ event, timeZone }: { event: LedgerEvent; timeZone: string }) {
  return (
    <li className="flex items-baseline gap-3 py-1.5">
      <span className="w-[62px] shrink-0 type-field-meta font-semibold tabular-nums text-[var(--co-muted)]">
        {timestampLabel(event.at, timeZone)}
      </span>
      <span className="min-w-0 type-field-meta text-[var(--co-ink)]">{event.text}</span>
    </li>
  );
}

/**
 * Today's workday as a plain-language receipt list, built only from persisted
 * timestamps. Nothing here is inferred: an event appears because a column in
 * the database holds a time, which is the whole point — the employee can see
 * that her day was recorded without asking the office.
 */
export default function Ledger({ events, timeZone }: { events: LedgerEvent[]; timeZone: string }) {
  if (events.length === 0) return null;

  const earlier = events.length > VISIBLE_TAIL ? events.slice(0, events.length - VISIBLE_TAIL) : [];
  const recent = events.slice(-VISIBLE_TAIL);

  return (
    <section className="px-4 pt-5 sm:px-5" aria-label="Today's record">
      <h2 className="pb-1.5 type-field-meta font-semibold text-[var(--co-muted)]">Today&apos;s record</h2>

      {earlier.length > 0 ? (
        <details className="mb-1">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1.5 type-field-meta font-medium text-[var(--co-muted)] [&::-webkit-details-marker]:hidden">
            <ChevronRight className="h-[15px] w-[15px] shrink-0 transition-transform [details[open]_&]:rotate-90" aria-hidden />
            Earlier today ({earlier.length})
          </summary>
          <ul className="mt-1">
            {earlier.map((event) => (
              <Row key={`${event.jobId}-${event.kind}-${event.at}`} event={event} timeZone={timeZone} />
            ))}
          </ul>
        </details>
      ) : null}

      <ul>
        {recent.map((event) => (
          <Row key={`${event.jobId}-${event.kind}-${event.at}`} event={event} timeZone={timeZone} />
        ))}
      </ul>
    </section>
  );
}
