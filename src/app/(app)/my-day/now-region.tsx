"use client";

import { useEffect, useState } from "react";
import { formatElapsed } from "@/lib/my-day/job-format";
import type { WorkdayNow } from "@/lib/my-day/workday-state";

/**
 * The persistent "Now" region: two independent truths, never merged.
 *
 * Line 1 is *recorded time* — what the clock is measuring. It is deliberately
 * never called paid time: cleaners are paid the job's ticket hours regardless
 * of clocked minutes, so a timer labelled "paid" would be a lie (see the
 * state model doc, §1.1).
 *
 * Line 2 is the work state — travelling, arrived, cleaning, waiting on a
 * teammate. A timer never appears without a label naming what it measures.
 *
 * The elapsed counter is computed on the client from `recordingSince`, not
 * server-rendered: a formatted elapsed string would be stale before it
 * arrived and would visibly jump on hydration.
 */
export default function NowRegion({ now }: { now: WorkdayNow }) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!now.recordingSince) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the clock can only start once mounted; SSR has no "now".
    setTick(Date.now());
    const id = window.setInterval(() => setTick(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [now.recordingSince]);

  const isRecording = Boolean(now.recordingSince);
  const elapsed = isRecording && tick ? formatElapsed(now.recordingSince, tick) : null;

  return (
    <section
      aria-label="Right now"
      className="sticky top-0 z-20 border-b border-[var(--co-line-soft)] bg-[var(--co-surface)]/95 px-4 py-3 backdrop-blur sm:px-5"
    >
      <div className="flex items-center gap-2.5">
        {isRecording ? (
          <span
            className="h-2 w-2 shrink-0 rounded-full motion-safe:animate-pulse"
            style={{ background: "var(--co-success)" }}
            aria-hidden
          />
        ) : (
          <span className="h-2 w-2 shrink-0 rounded-full bg-[var(--co-faint)]" aria-hidden />
        )}
        <p className="min-w-0 flex-1 type-field-body font-semibold text-[var(--co-ink)]">{now.recordedLine}</p>
        {elapsed ? (
          <span
            className="shrink-0 font-mono text-[17px] font-semibold tabular-nums tracking-[-0.01em]"
            style={{ color: "var(--co-success)" }}
            aria-hidden
          >
            {elapsed}
          </span>
        ) : null}
      </div>

      {/* Only the work state is announced. Announcing the seconds counter
          would make a screen reader talk over the whole workday. */}
      <p aria-live="polite" className="mt-1 pl-[18px] type-field-meta font-medium text-[var(--co-muted)]">
        {now.workLine}
      </p>
    </section>
  );
}
