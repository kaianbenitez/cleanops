"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

export type EmployeeDirectoryRow = {
  id: string;
  name: string;
  initials: string;
  title: string;
  isActive: boolean;
  status: "Scheduled" | "Available";
  todayJobs: Array<{ id: string; time: string; customer: string; type: string; city: string }>;
  hoursThisWeek: number;
  mileageMiles: number;
  tipsCents: number;
  bonusCents: number;
};

function money(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatHours(hours: number) {
  return `${hours.toFixed(1)} hrs`;
}

function statusTone(active: boolean, status: EmployeeDirectoryRow["status"]) {
  if (!active) return "border-slate-200 bg-slate-50 text-slate-500";
  return status === "Scheduled" ? "border-amber-200 bg-amber-50 text-amber-700" : "border-emerald-200 bg-emerald-50 text-emerald-700";
}

function SectionCard({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="co-card overflow-hidden">
      <div className="border-b border-[var(--co-line-soft)] px-5 py-4">
        <p className="eyebrow">{eyebrow}</p>
        <h2 className="mt-1 text-lg font-semibold">{title}</h2>
        {description ? <p className="mt-1 text-sm text-[var(--co-muted)]">{description}</p> : null}
      </div>
      <div className="px-5 py-5">{children}</div>
    </section>
  );
}

function StatCard({ label, value, subtext }: { label: string; value: string; subtext: string }) {
  return (
    <div className="co-card p-5">
      <p className="text-xs font-medium uppercase tracking-[0.1em] text-[var(--co-muted)]">{label}</p>
      <p className="mt-2 text-3xl font-semibold tracking-[-0.04em]">{value}</p>
      <p className="mt-2 text-xs text-[var(--co-muted)]">{subtext}</p>
    </div>
  );
}

function WorkTile({ time, customer, type, city }: { time: string; customer: string; type: string; city: string }) {
  return (
    <div className="rounded-2xl border border-[var(--co-line-soft)] bg-[var(--co-surface-muted)]/45 px-3 py-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold text-[var(--co-ink)]">{time}</p>
        <p className="text-[11px] text-[var(--co-muted)]">{city}</p>
      </div>
      <p className="mt-1 text-sm font-medium text-[var(--co-ink)]">{customer}</p>
      <p className="mt-0.5 text-[11px] text-[var(--co-muted)]">{type}</p>
    </div>
  );
}

export default function EmployeeDirectory({ rows }: { rows: EmployeeDirectoryRow[] }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("All");

  const filteredRows = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return rows.filter((row) => {
      const matchesQuery =
        !normalized || `${row.name} ${row.title} ${row.todayJobs.map((job) => job.customer).join(" ")}`.toLowerCase().includes(normalized);
      const matchesFilter = filter === "All" || (filter === "Inactive" ? !row.isActive : row.isActive && row.status === filter);
      return matchesQuery && matchesFilter;
    });
  }, [filter, query, rows]);

  const activeRows = rows.filter((row) => row.isActive);
  const availableRows = activeRows.filter((row) => row.status === "Available");
  const scheduledRows = activeRows.filter((row) => row.status === "Scheduled");
  const hoursTotal = activeRows.reduce((sum, row) => sum + row.hoursThisWeek, 0);
  const mileageTotal = activeRows.reduce((sum, row) => sum + row.mileageMiles, 0);
  const tipsTotal = activeRows.reduce((sum, row) => sum + row.tipsCents, 0);
  const bonusTotal = activeRows.reduce((sum, row) => sum + row.bonusCents, 0);

  const spotlight = filteredRows[0] ?? rows[0] ?? null;
  const activeToday = activeRows.filter((row) => row.todayJobs.length > 0);

  return (
    <div className="space-y-6">
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Active employees" value={String(activeRows.length)} subtext="Current roster" />
        <StatCard label="Available today" value={String(availableRows.length)} subtext="Open for assignment" />
        <StatCard label="Scheduled today" value={String(scheduledRows.length)} subtext="Jobs on the board" />
        <StatCard label="Hours this week" value={hoursTotal.toFixed(1)} subtext="All active staff" />
        <StatCard label="Mileage pending" value={String(activeRows.filter((row) => row.mileageMiles > 0).length)} subtext="Needs review" />
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(340px,0.75fr)]">
        <section className="space-y-5">
          <SectionCard eyebrow="People and payroll" title="Employee board" description="Availability, hours, and payroll signals in one place.">
            <div className="flex flex-col gap-3 border-b border-[var(--co-line-soft)] bg-[var(--co-surface-muted)]/35 p-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap gap-2" aria-label="Employee filters">
                {["All", "Available", "Scheduled", "Inactive"].map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setFilter(option)}
                    className={`rounded-full px-3.5 py-2 text-xs font-semibold transition ${
                      filter === option
                        ? "bg-[var(--co-evergreen)] text-white shadow-sm"
                        : "border border-[var(--co-line)] bg-white text-[var(--co-muted)] hover:border-[var(--co-evergreen)] hover:text-[var(--co-ink)]"
                    }`}
                  >
                    {option}
                  </button>
                ))}
              </div>

              <div className="grid w-full gap-3 lg:max-w-xl xl:grid-cols-[1.3fr_0.9fr]">
                <input
                  aria-label="Search employees"
                  className="co-input w-full text-sm"
                  placeholder="Search employees, jobs, or titles..."
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
                <div className="rounded-2xl border border-[var(--co-line)] bg-white px-4 py-3 text-sm text-[var(--co-muted)]">
                  <span className="font-semibold text-[var(--co-ink)]">{mileageTotal.toFixed(1)} mi</span> total mileage
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-3 border-b border-[var(--co-line-soft)] px-5 py-4">
              <span className="self-center text-xs text-[var(--co-muted)]">{filteredRows.length} shown</span>
            </div>

            {filteredRows.length === 0 ? (
              <div className="px-6 py-16 text-center">
                <p className="text-sm font-semibold text-[var(--co-ink)]">No employees match this view.</p>
                <p className="mt-1 text-xs text-[var(--co-muted)]">Try a different filter or search term.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[980px] text-sm">
                  <thead className="border-b border-[var(--co-line-soft)] bg-[var(--co-surface-muted)]/50 text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--co-muted)]">
                    <tr>
                      <th className="px-5 py-3">Employee</th>
                      <th className="px-3 py-3">Status</th>
                      <th className="px-3 py-3">Today</th>
                      <th className="px-3 py-3">Hours this week</th>
                      <th className="px-3 py-3">Mileage</th>
                      <th className="px-3 py-3">Tips + bonuses</th>
                      <th className="px-5 py-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--co-line-soft)]">
                    {filteredRows.map((row) => {
                      const extraPay = row.tipsCents + row.bonusCents;

                      return (
                        <tr key={row.id} className="align-top hover:bg-[var(--co-surface-muted)]/35">
                          <td className="px-5 py-4">
                            <Link href={`/employees/${row.id}`} className="flex min-w-[190px] items-center gap-3">
                              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--co-surface-muted)] text-xs font-bold text-[var(--co-evergreen)]">
                                {row.initials}
                              </span>
                              <span>
                                <span className="block font-semibold text-[var(--co-ink)]">{row.name}</span>
                                <span className="mt-0.5 block text-xs text-[var(--co-muted)]">{row.title}</span>
                              </span>
                            </Link>
                          </td>
                          <td className="px-3 py-4">
                            <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${statusTone(row.isActive, row.status)}`}>
                              <span className="h-1.5 w-1.5 rounded-full bg-current" />
                              {row.isActive ? row.status : "Inactive"}
                            </span>
                          </td>
                          <td className="px-3 py-4 text-xs text-[var(--co-ink)]">
                            {row.todayJobs.length === 0 ? (
                              <span className="text-[var(--co-muted)]">No jobs today</span>
                            ) : (
                              <div className="space-y-1.5">
                                {row.todayJobs.slice(0, 3).map((job) => (
                                  <div key={job.id}>
                                    <span className="font-semibold text-[var(--co-evergreen)]">{job.time}</span> {job.customer}
                                  </div>
                                ))}
                                {row.todayJobs.length > 3 ? <div className="text-[11px] text-[var(--co-muted)]">+{row.todayJobs.length - 3} more</div> : null}
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-4 font-semibold text-[var(--co-evergreen)]">{formatHours(row.hoursThisWeek)}</td>
                          <td className="px-3 py-4 text-[var(--co-ink)]">{row.mileageMiles.toFixed(1)} mi</td>
                          <td className="px-3 py-4 text-[var(--co-ink)]">{money(extraPay)}</td>
                          <td className="px-5 py-4 text-right">
                            <Link href={`/employees/${row.id}`} className="text-xs font-semibold text-[var(--co-evergreen)] hover:underline">
                              View details
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>

          <section className="grid gap-px overflow-hidden rounded-[24px] border border-[var(--co-line-soft)] bg-[var(--co-line-soft)] sm:grid-cols-3">
            <Link href="/payroll" className="group bg-white p-5 transition hover:bg-[var(--co-surface-muted)]">
              <p className="text-sm font-semibold text-[var(--co-ink)]">Review time entries</p>
              <p className="mt-1 text-xs leading-5 text-[var(--co-muted)]">Check and edit hours before payroll.</p>
              <span className="mt-4 block text-sm font-semibold text-[var(--co-evergreen)] transition group-hover:translate-x-1">Open payroll →</span>
            </Link>
            <Link href="/payroll" className="group bg-white p-5 transition hover:bg-[var(--co-surface-muted)]">
              <p className="text-sm font-semibold text-[var(--co-ink)]">Review mileage</p>
              <p className="mt-1 text-xs leading-5 text-[var(--co-muted)]">Verify route and pay calculations.</p>
              <span className="mt-4 block text-sm font-semibold text-[var(--co-evergreen)] transition group-hover:translate-x-1">Review entries →</span>
            </Link>
            <Link href="/payroll" className="group bg-white p-5 transition hover:bg-[var(--co-surface-muted)]">
              <p className="text-sm font-semibold text-[var(--co-ink)]">Open payroll</p>
              <p className="mt-1 text-xs leading-5 text-[var(--co-muted)]">Prepare the Friday pay period.</p>
              <span className="mt-4 block text-sm font-semibold text-[var(--co-evergreen)] transition group-hover:translate-x-1">Prepare payroll →</span>
            </Link>
          </section>
        </section>

        <aside className="space-y-5">
          <SectionCard eyebrow="Today at a glance" title="Team availability">
            <div className="space-y-3">
              {activeRows.length === 0 ? (
                <p className="text-sm text-[var(--co-muted)]">No active employees to show.</p>
              ) : (
                activeToday.map((row) => (
                  <div key={row.id} className="rounded-2xl border border-[var(--co-line-soft)] bg-[var(--co-surface-muted)]/40 p-4">
                    <div className="flex items-center justify-between gap-3 text-xs">
                      <span className="flex items-center gap-2 font-semibold text-[var(--co-ink)]">
                        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-[10px] font-bold text-[var(--co-evergreen)]">
                          {row.initials}
                        </span>
                        {row.name}
                      </span>
                      <span className="text-[var(--co-muted)]">
                        {row.todayJobs.length} job{row.todayJobs.length === 1 ? "" : "s"}
                      </span>
                    </div>
                    <div className="mt-3 flex gap-1 overflow-hidden rounded-full bg-[var(--co-line-soft)]">
                      {row.todayJobs.map((job) => (
                        <span key={job.id} className="min-w-8 flex-1 rounded-full bg-[var(--co-evergreen)]" title={`${job.time} - ${job.customer}`} />
                      ))}
                    </div>
                    <p className="mt-2 text-[11px] text-[var(--co-muted)]">{row.todayJobs.map((job) => job.time).join(" · ")}</p>
                  </div>
                ))
              )}
            </div>
          </SectionCard>

          <SectionCard eyebrow="Spotlight" title={spotlight ? spotlight.name : "No employee selected"}>
            <div className="space-y-4">
              {spotlight ? (
                <>
                  <div className="rounded-[24px] border border-[var(--co-line-soft)] bg-[linear-gradient(135deg,#f3f7ef,#ffffff)] p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--co-muted)]">Current load</p>
                    <p className="mt-2 text-3xl font-semibold tracking-[-0.05em] text-[var(--co-ink)]">{formatHours(spotlight.hoursThisWeek)}</p>
                    <p className="mt-1 text-xs text-[var(--co-muted)]">
                      {spotlight.status === "Available" ? "Open for assignments" : "Already scheduled today"}
                    </p>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-2">
                    <div className="rounded-2xl border border-[var(--co-line-soft)] bg-white px-3 py-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--co-muted)]">Mileage</p>
                      <p className="mt-1 text-sm font-semibold text-[var(--co-ink)]">{spotlight.mileageMiles.toFixed(1)} mi</p>
                    </div>
                    <div className="rounded-2xl border border-[var(--co-line-soft)] bg-white px-3 py-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--co-muted)]">Extras</p>
                      <p className="mt-1 text-sm font-semibold text-[var(--co-ink)]">{money(spotlight.tipsCents + spotlight.bonusCents)}</p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--co-muted)]">Today&apos;s work</p>
                    {spotlight.todayJobs.length === 0 ? (
                      <p className="text-sm text-[var(--co-muted)]">No jobs on the board for this employee today.</p>
                    ) : (
                      spotlight.todayJobs.slice(0, 4).map((job) => <WorkTile key={job.id} time={job.time} customer={job.customer} type={job.type} city={job.city} />)
                    )}
                  </div>

                  <Link href={`/employees/${spotlight.id}`} className="co-button-secondary w-full justify-center">
                    Open employee profile
                  </Link>
                </>
              ) : null}
            </div>
          </SectionCard>

          <SectionCard eyebrow="Payroll signals" title="This week at a glance">
            <div className="grid gap-px overflow-hidden rounded-2xl border border-[var(--co-line-soft)] bg-[var(--co-line-soft)] sm:grid-cols-2">
              <div className="bg-white p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--co-muted)]">Scheduled staff</p>
                <p className="mt-2 text-3xl font-semibold tracking-[-0.05em] text-[var(--co-ink)]">{scheduledRows.length}</p>
              </div>
              <div className="bg-white p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--co-muted)]">Tips + bonuses</p>
                <p className="mt-2 text-3xl font-semibold tracking-[-0.05em] text-[var(--co-ink)]">{money(tipsTotal + bonusTotal)}</p>
              </div>
            </div>
          </SectionCard>
        </aside>
      </div>
    </div>
  );
}
