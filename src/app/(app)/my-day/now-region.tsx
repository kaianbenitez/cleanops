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
      className="co-my-day-now sticky top-0 z-20 border-b border-[var(--co-line-soft)] bg-[var(--co-surface)]/95 px-4 py-3 backdrop-blur sm:px-5"
    >
      <div className="flex items-start gap-2.5">
        {isRecording ? (
          <span
            className="mt-1.5 h-2 w-2 shrink-0 rounded-full motion-safe:animate-pulse"
            style={{ background: "var(--co-success)" }}
            aria-hidden
          />
        ) : (
          <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[var(--co-faint)]" aria-hidden />
        )}
        <div className="min-w-0 flex-1">
          {/* The elapsed number is the one place this screen spends real
              visual weight — everything else stays quiet by comparison. */}
          {elapsed ? (
            <p className="type-field-hero leading-none tabular-nums" style={{ color: "var(--co-success)" }} aria-hidden>
              {elapsed}
            </p>
          ) : null}
          <p className={`type-field-body font-semibold text-[var(--co-ink)] ${elapsed ? "mt-1.5" : ""}`}>{now.recordedLine}</p>
          {/* Only the work state is announced. Announcing the seconds counter
              would make a screen reader talk over the whole workday. */}
          <p aria-live="polite" className="mt-0.5 type-field-meta font-medium text-[var(--co-muted)]">
            {now.workLine}
          </p>
        </div>
      </div>
    </section>
  );
}
