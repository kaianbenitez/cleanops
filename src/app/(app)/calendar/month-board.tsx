"use client";

import Link from "next/link";
import { useMemo } from "react";
import { CalendarDays } from "lucide-react";
import type { CalendarDaySummary } from "./page";

function issuesNeedingAttentionLabel(count: number) {
  return `${count} ${count === 1 ? "issue" : "issues"} needing attention`;
}

export default function MonthBoard({
  month,
  summaries,
  holidays,
  workingDays,
  boardAxis,
  appointmentCountByDate = {},
  readinessByDate = new Map(),
  attentionIssuesByDate = {},
}: {
  month: Date;
  summaries: CalendarDaySummary[];
  holidays: string[];
  workingDays: number[];
  /** The viewer's board axis preference (from the state cookie/query, not
   * this view), so a day cell returns to Board on the axis they last used
   * instead of always hardcoding the vertical axis. */
  boardAxis: "vertical" | "horizontal";
  appointmentCountByDate?: Record<string, number>;
  readinessByDate?: Map<string, Record<string, number>>;
  attentionIssuesByDate?: Record<string, number>;
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
        <h2 className="type-admin-title font-semibold">
          {month.toLocaleDateString("en-US", {
            month: "long",
            year: "numeric",
            timeZone: "UTC",
          })}{" "}
          labor capacity
        </h2>
        <p className="type-admin-meta mt-0.5 text-[var(--co-muted)]">
          Monday–Friday workload overview. Select a day to open dispatch.
        </p>
        <p className="mt-2 text-xs text-[var(--co-muted)] sm:hidden">
          Swipe horizontally to see the full month.
        </p>
      </div>
      <div className="overflow-x-auto">
        <div
          className="grid min-w-[680px] divide-x divide-y divide-[var(--co-line-soft)] md:min-w-0"
          style={{
            gridTemplateColumns: `repeat(${workingDays.length}, minmax(0, 1fr))`,
          }}
        >
          {workingDays.map((weekday) => (
            <div
              key={weekday}
              className="bg-[var(--co-surface-muted)] px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--co-faint)]"
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
            needsTime: 0,
            ready: 0,
          };
          const isHoliday = holidays.includes(iso);
          const readiness = readinessByDate.get(iso) ?? {};
          const attentionCount = attentionIssuesByDate[iso] ?? 0;
          const attentionCopy = `${issuesNeedingAttentionLabel(attentionCount)} in dispatch`;
            return (
              <Link
                key={iso}
                href={`/calendar?view=board&axis=${boardAxis}&day=${iso}${attentionCount ? "&attention=1" : ""}`}
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
                <span className="co-badge-spark mt-1.5 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-semibold">
                  <CalendarDays className="h-3 w-3" strokeWidth={1.75} aria-hidden />
                  {appointmentCountByDate[iso]} {appointmentCountByDate[iso] === 1 ? "meeting" : "meetings"}
                </span>
              ) : null}
              {attentionCount ? (
                <div className="mt-2 font-semibold text-[var(--co-danger)]">
                  {attentionCopy}
                </div>
              ) : null}
              <div className="mt-5 space-y-2 text-xs">
                {Object.entries(readiness).map(([label, count]) => <div key={label} className="flex items-center justify-between"><span className="text-[var(--co-muted)]">{label}</span><span className={label === "Ready" ? "co-badge-success rounded px-1.5 py-0.5 font-bold" : label === "Conflict" ? "co-badge-danger rounded px-1.5 py-0.5 font-bold" : label === "Over capacity" ? "co-badge-warning rounded px-1.5 py-0.5 font-bold" : "co-badge-spark rounded px-1.5 py-0.5 font-bold"}>{count}</span></div>)}
                <div className="flex justify-between text-[var(--co-muted)]">
                  <span>Assigned</span>
                  <span className="font-medium text-[var(--co-ink)]">
                    {summary.jobs - summary.unassigned}
                  </span>
                </div>
                <div className="flex justify-between text-[var(--co-muted)]">
                  <span>Crew not assigned</span>
                  <span
                    className={
                      summary.unassigned
                        ? "font-semibold text-[var(--co-warning)]"
                        : "text-[var(--co-ink)]"
                    }
                  >
                    {summary.unassigned}
                  </span>
                </div>
                {isHoliday ? (
                  <div className="font-medium text-[var(--co-warning)]">
                    Holiday — labor capacity closed
                  </div>
                ) : null}
                {summary.needsReview ? (
                  <div className="font-semibold text-[var(--co-danger)]">
                    {issuesNeedingAttentionLabel(summary.needsReview)}
                  </div>
                ) : null}
              </div>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
