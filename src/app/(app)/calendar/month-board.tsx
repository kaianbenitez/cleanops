"use client";

import Link from "next/link";
import { useMemo } from "react";
import type { CalendarJob } from "./page";

export default function MonthBoard({ month, jobs }: { month: Date; jobs: CalendarJob[] }) {
  const first = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), 1));
  const daysInMonth = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 0)).getUTCDate();
  const cells = useMemo(() => Array.from({ length: daysInMonth }, (_, index) => new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), index + 1))), [daysInMonth, month]);
  const byDate = new Map<string, CalendarJob[]>();
  jobs.forEach((job) => byDate.set(job.scheduledDate, [...(byDate.get(job.scheduledDate) ?? []), job]));
  const firstWeekday = first.getUTCDay();
  const leading = firstWeekday === 0 || firstWeekday === 6 ? 0 : firstWeekday - 1;
  return <section className="overflow-hidden border border-[var(--co-line)] bg-[var(--co-surface)]"><div className="border-b border-[var(--co-line-soft)] px-4 py-3"><h2 className="text-base font-semibold">{month.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" })} capacity</h2><p className="mt-0.5 text-xs text-[var(--co-muted)]">Monday–Friday workload overview. Select a day to open dispatch.</p></div><div className="grid grid-cols-5 divide-x divide-y divide-[var(--co-line-soft)]">{["Mon", "Tue", "Wed", "Thu", "Fri"].map((label) => <div key={label} className="bg-[var(--co-surface-muted)] px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--co-faint)]">{label}</div>)}{Array.from({ length: leading }, (_, index) => <div key={`blank-${index}`} className="min-h-[132px] bg-[var(--co-bg)]" />)}{cells.map((date) => { const iso = date.toISOString().slice(0, 10); const day = date.getUTCDay(); if (day === 0 || day === 6) return null; const dayJobs = byDate.get(iso) ?? []; const unassigned = dayJobs.filter((job) => !job.assignedUserIds.length).length; const conflicts = dayJobs.filter((job) => job.status === "no_show").length; return <Link key={iso} href={`/calendar?view=staff&day=${iso}`} className="min-h-[132px] bg-[var(--co-surface)] p-3 transition hover:bg-[var(--co-accent-tint)]/40"><div className="flex items-center justify-between"><span className="text-sm font-semibold">{date.getUTCDate()}</span><span className="text-xs font-semibold text-[var(--co-evergreen)]">{dayJobs.length} jobs</span></div><div className="mt-5 space-y-2 text-xs"><div className="flex justify-between text-[var(--co-muted)]"><span>Assigned</span><span className="font-medium text-[var(--co-ink)]">{dayJobs.length - unassigned}</span></div><div className="flex justify-between text-[var(--co-muted)]"><span>Unassigned</span><span className={unassigned ? "font-semibold text-amber-700" : "text-[var(--co-ink)]"}>{unassigned}</span></div>{conflicts ? <div className="font-semibold text-rose-700">{conflicts} needs review</div> : null}</div></Link>; })}</div></section>;
}
