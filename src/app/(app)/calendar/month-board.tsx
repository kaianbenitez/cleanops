"use client";

import Link from "next/link";
import { useMemo } from "react";
import type { CalendarDaySummary } from "./page";

export default function MonthBoard({
  month,
  summaries,
  holidays,
  workingDays,
  appointmentCountByDate = {},
}: {
  month: Date;
  summaries: CalendarDaySummary[];
  holidays: string[];
  workingDays: number[];
  appointmentCountByDate?: Record<string, number>;
}) {
  const first = new Date(
    Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), 1),
  );
  const daysInMonth = new Date(
    Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 0),
  ).getUTCDate();
  const cells = useMemo(
    () =>
      Array.from(
        { length: daysInMonth },
        (_, index) =>
          new Date(
            Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), index + 1),
          ),
      ),
    [daysInMonth, month],
  );
  const byDate = new Map(
    summaries.map((summary) => [summary.scheduledDate, summary]),
  );
  const firstWeekday = first.getUTCDay();
  const leading = Math.max(workingDays.indexOf(firstWeekday), 0);
  const weekdayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return (
    <section className="overflow-hidden border border-[var(--co-line)] bg-[var(--co-surface)]">
      <div className="border-b border-[var(--co-line-soft)] px-4 py-3">
        <h2 className="text-base font-semibold">
          {month.toLocaleDateString("en-US", {
            month: "long",
            year: "numeric",
            timeZone: "UTC",
          })}{" "}
          capacity
        </h2>
        <p className="mt-0.5 text-xs text-[var(--co-muted)]">
          Monday–Friday workload overview. Select a day to open dispatch.
        </p>
      </div>
      <div
        className="grid divide-x divide-y divide-[var(--co-line-soft)]"
        style={{
          gridTemplateColumns: `repeat(${workingDays.length}, minmax(0, 1fr))`,
        }}
      >
        {workingDays.map((weekday) => (
          <div
            key={weekday}
            className="bg-[var(--co-surface-muted)] px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--co-faint)]"
          >
            {weekdayLabels[weekday]}
          </div>
        ))}
        {Array.from({ length: leading }, (_, index) => (
          <div
            key={`blank-${index}`}
            className="min-h-[132px] bg-[var(--co-bg)]"
          />
        ))}
        {cells.map((date) => {
          const iso = date.toISOString().slice(0, 10);
          const day = date.getUTCDay();
          if (!workingDays.includes(day)) return null;
          const summary = byDate.get(iso) ?? {
            scheduledDate: iso,
            jobs: 0,
            unassigned: 0,
            needsReview: 0,
          };
          const isHoliday = holidays.includes(iso);
          return (
            <Link
              key={iso}
              href={`/calendar?view=staff&day=${iso}`}
              className="min-h-[132px] bg-[var(--co-surface)] p-3 transition hover:bg-[var(--co-accent-tint)]/40"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">
                  {date.getUTCDate()}
                </span>
                <span className="text-xs font-semibold text-[var(--co-accent-text)]">
                  {summary.jobs} jobs
                </span>
              </div>
              {appointmentCountByDate[iso] ? (
                <span className="mt-1.5 inline-flex items-center gap-1 rounded-md border border-violet-300 bg-violet-50 px-1.5 py-0.5 text-[10px] font-semibold text-violet-800">
                  📅 {appointmentCountByDate[iso]} {appointmentCountByDate[iso] === 1 ? "meeting" : "meetings"}
                </span>
              ) : null}
              <div className="mt-5 space-y-2 text-xs">
                <div className="flex justify-between text-[var(--co-muted)]">
                  <span>Assigned</span>
                  <span className="font-medium text-[var(--co-ink)]">
                    {summary.jobs - summary.unassigned}
                  </span>
                </div>
                <div className="flex justify-between text-[var(--co-muted)]">
                  <span>Unassigned</span>
                  <span
                    className={
                      summary.unassigned
                        ? "font-semibold text-amber-700"
                        : "text-[var(--co-ink)]"
                    }
                  >
                    {summary.unassigned}
                  </span>
                </div>
                {isHoliday ? (
                  <div className="font-medium text-amber-800">
                    Holiday — capacity closed
                  </div>
                ) : null}
                {summary.needsReview ? (
                  <div className="font-semibold text-rose-700">
                    {summary.needsReview} needs review
                  </div>
                ) : null}
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
