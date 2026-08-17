import Link from "next/link";
import { formatDisplayDate } from "@/lib/scheduling/dates";
import { redirect } from "next/navigation";
import { and, count, desc, eq, gte, ilike, inArray, lte, notExists, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { customers, invoices, jobAssignments, jobs, timeEntries, users } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import { isFieldEligible } from "@/lib/auth/field-staff";
import { StatusPill, statusLabel, statusOptions } from "@/components/ui/status-pill";
import { RecalculateEstimatesButton } from "./recalculate-estimates-button";

const TYPE_LABELS: Record<string, string> = {
  first_clean: "First clean",
  recurring: "Recurring",
  one_time: "One-time",
  deep_clean: "Deep clean",
  move_out: "Move in/out",
};

type SearchParams = {
  q?: string;
  status?: string;
  employeeId?: string;
  type?: string;
  missingHours?: string;
  unassigned?: string;
  tab?: string;
  page?: string;
  start?: string;
  end?: string;
};

function dateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function hrefWith(params: SearchParams, changes: Partial<Record<keyof SearchParams, string>>) {
  const next = new URLSearchParams();
  for (const [entryKey, entryValue] of Object.entries(params)) {
    if (!(entryKey in changes) && entryValue) next.set(entryKey, entryValue);
  }
  for (const [entryKey, entryValue] of Object.entries(changes)) {
    if (entryValue) next.set(entryKey, entryValue);
  }
  const query = next.toString();
  return query ? `/jobs?${query}` : "/jobs";
}

function money(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatEstimatedTime(minutes: number | null) {
  if (!minutes) return "—";
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function metricTone(status: "warning" | "neutral" | "good") {
  if (status === "warning") return "bg-amber-50 text-amber-700 border-amber-100";
  if (status === "good") return "bg-emerald-50 text-emerald-700 border-emerald-100";
  return "bg-[var(--co-surface-muted)]/50 text-[var(--co-ink)] border-[var(--co-line-soft)]";
}

function MetricCard({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: string;
  hint: string;
  tone?: "warning" | "neutral" | "good";
}) {
  return (
    <div className={`min-w-[230px] rounded-2xl border bg-white p-5 shadow-[0_8px_24px_rgba(27,41,37,0.03)] ${metricTone(tone)}`}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] opacity-75">{label}</p>
      <div className="mt-2 flex items-end justify-between gap-4"><p className="text-4xl font-semibold tracking-[-0.06em]">{value}</p><p className="max-w-24 text-right text-xs leading-4 opacity-80">{hint}</p></div>
    </div>
  );
}

function Pill({ status }: { status: string }) {
  return <StatusPill domain="job" status={status} />;
}

export default async function JobsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const admin = await getCurrentUser();
  if (!admin) redirect("/login");
  if (admin.role !== "admin") redirect("/my-day");

  const sp = await searchParams;
  const activeTab = sp.tab ?? "active";
  const pageSize = 25;
  const page = Math.max(1, Number(sp.page ?? "1") || 1);
  const today = new Date();
  const weekDay = today.getDay();
  const weekStart = addDays(today, weekDay === 0 ? -6 : 1 - weekDay);
  const rangeStart = sp.start && /^\d{4}-\d{2}-\d{2}$/.test(sp.start) ? sp.start : dateOnly(addDays(today, -14));
  const rangeEnd = sp.end && /^\d{4}-\d{2}-\d{2}$/.test(sp.end) ? sp.end : dateOnly(addDays(today, 45));
  const todayText = dateOnly(today);
  const weekStartText = dateOnly(weekStart);
  const weekEndText = dateOnly(addDays(weekStart, 6));

  const missingHoursCondition = sql`coalesce((select sum(minutes_worked) from time_entries where time_entries.job_id = ${jobs.id}), 0) = 0`;
  const unassignedCondition = notExists(db.select({ jobId: jobAssignments.jobId }).from(jobAssignments).where(eq(jobAssignments.jobId, jobs.id)));

  const conditions = [eq(jobs.companyId, admin.companyId), gte(jobs.scheduledDate, rangeStart), lte(jobs.scheduledDate, rangeEnd)];
  if (sp.status && sp.status !== "all" && statusOptions("job").some(({ value }) => value === sp.status)) conditions.push(eq(jobs.status, sp.status as typeof jobs.status.enumValues[number]));
  if (!sp.status && activeTab === "active") conditions.push(inArray(jobs.status, ["scheduled", "in_progress"]));
  if (!sp.status && activeTab === "pending") conditions.push(and(eq(jobs.status, "completed"), sql`not exists (select 1 from invoices where invoices.job_id = ${jobs.id})`)!);
  if (!sp.status && activeTab === "history") conditions.push(inArray(jobs.status, ["completed", "cancelled", "no_show"]));
  if (sp.type) conditions.push(eq(jobs.type, sp.type as typeof jobs.type.enumValues[number]));
  if (sp.q?.trim()) {
    const query = `%${sp.q.trim()}%`;
    conditions.push(or(ilike(customers.firstName, query), ilike(customers.lastName, query), ilike(customers.addressLine1, query))!);
  }
  if (sp.employeeId) {
    conditions.push(inArray(jobs.id, db.select({ jobId: jobAssignments.jobId }).from(jobAssignments).where(eq(jobAssignments.userId, sp.employeeId))));
  }
  if (sp.unassigned === "yes") {
    conditions.push(unassignedCondition);
  } else if (sp.missingHours === "yes") {
    conditions.push(missingHoursCondition);
  }

  const metricsConditions = [eq(jobs.companyId, admin.companyId), gte(jobs.scheduledDate, rangeStart), lte(jobs.scheduledDate, rangeEnd)];

  const [rows, totalRowsResult, employees, metricsRows] = await Promise.all([
    db
      .select({
        id: jobs.id,
        type: jobs.type,
        status: jobs.status,
        scheduledDate: jobs.scheduledDate,
        scheduledStartTime: jobs.scheduledStartTime,
        estimatedDurationMinutes: jobs.estimatedDurationMinutes,
        priceCents: jobs.priceCents,
        customerId: jobs.customerId,
        customerFirstName: customers.firstName,
        customerLastName: customers.lastName,
        addressLine1: customers.addressLine1,
        city: customers.city,
        state: customers.state,
        zip: customers.zip,
      })
      .from(jobs)
      .innerJoin(customers, eq(jobs.customerId, customers.id))
      .where(and(...conditions))
      .orderBy(desc(jobs.scheduledDate), jobs.scheduledStartTime)
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ total: count() }).from(jobs).innerJoin(customers, eq(jobs.customerId, customers.id)).where(and(...conditions)),
    db
      .select({ id: users.id, firstName: users.firstName, lastName: users.lastName, isActive: users.isActive })
      .from(users)
      .where(and(eq(users.companyId, admin.companyId), isFieldEligible))
      .orderBy(users.firstName),
    db
      .select({
        today: sql<number>`count(*) filter (where ${jobs.scheduledDate} = ${todayText})`,
        completedToday: sql<number>`count(*) filter (where ${jobs.status} = 'completed' and ${jobs.scheduledDate} = ${todayText})`,
        week: sql<number>`count(*) filter (where ${jobs.scheduledDate} >= ${weekStartText} and ${jobs.scheduledDate} <= ${weekEndText})`,
        unassigned: sql<number>`count(*) filter (where ${jobs.status} not in ('cancelled', 'no_show') and not exists (select 1 from job_assignments where job_assignments.job_id = ${jobs.id}))`,
        awaiting: sql<number>`count(*) filter (where ${jobs.status} = 'completed' and not exists (select 1 from invoices where invoices.job_id = ${jobs.id}))`,
        missingHours: sql<number>`count(*) filter (where coalesce((select sum(minutes_worked) from time_entries where time_entries.job_id = ${jobs.id}), 0) = 0)`,
      })
      .from(jobs)
      .where(and(...metricsConditions)),
  ]);
  const totalRows = Number(totalRowsResult[0]?.total ?? 0);
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));

  const jobIds = rows.map((row) => row.id);

  const [assignments, entries] = await Promise.all([
    jobIds.length
      ? db
          .select({ jobId: jobAssignments.jobId, userId: users.id, firstName: users.firstName, lastName: users.lastName, isActive: users.isActive })
          .from(jobAssignments)
          .innerJoin(users, eq(jobAssignments.userId, users.id))
          .where(inArray(jobAssignments.jobId, jobIds))
      : Promise.resolve([]),
    jobIds.length
      ? db.select({ jobId: timeEntries.jobId, minutesWorked: timeEntries.minutesWorked }).from(timeEntries).where(inArray(timeEntries.jobId, jobIds))
      : Promise.resolve([]),
  ]);

  const assignmentsByJob = new Map<string, typeof assignments>();
  assignments.forEach((assignment) => assignmentsByJob.set(assignment.jobId, [...(assignmentsByJob.get(assignment.jobId) ?? []), assignment]));
  const minutesByJob = new Map<string, number>();
  entries.forEach((entry) => minutesByJob.set(entry.jobId, (minutesByJob.get(entry.jobId) ?? 0) + (entry.minutesWorked ?? 0)));

  const metrics = {
    today: Number(metricsRows[0]?.today ?? 0),
    completedToday: Number(metricsRows[0]?.completedToday ?? 0),
    week: Number(metricsRows[0]?.week ?? 0),
    unassigned: Number(metricsRows[0]?.unassigned ?? 0),
    awaiting: Number(metricsRows[0]?.awaiting ?? 0),
    missingHours: Number(metricsRows[0]?.missingHours ?? 0),
  };

  const filteredRows = rows;

  return (
    <div className="space-y-6">
      <header className="grid items-center gap-6 xl:grid-cols-[minmax(0,1fr)_auto]">
        <div className="min-w-0">
          <p className="eyebrow text-[var(--co-accent-text)]">Admin &nbsp;›&nbsp; Jobs management</p>
          <h1 className="page-title mt-2">Operations Hub</h1>
          <p className="page-subtitle max-w-[34rem]">Real-time management of residential cleaning services across all zones.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <MetricCard label="Completed today" value={String(metrics.completedToday)} hint="services closed today" tone="good" />
          <MetricCard label="Pending review" value={String(metrics.awaiting)} hint="completed, awaiting invoice" tone={metrics.awaiting ? "warning" : "good"} />
        </div>
      </header>

      <nav className="flex flex-wrap items-center justify-between gap-4 rounded-[var(--co-radius-card)] bg-[var(--co-surface-muted)]/80 p-4 sm:p-5" aria-label="Job views">
        <div className="flex rounded-2xl bg-[var(--co-surface-muted-strong)] p-1.5">
          {[['active','Active'],['pending','Pending'],['history','History']].map(([tab, label]) => <Link key={tab} href={hrefWith(sp, { tab, status: "", page: "" })} className={`rounded-xl px-5 py-3 text-sm font-semibold ${activeTab === tab ? 'bg-[var(--co-surface)] text-[var(--co-accent-text)] shadow-sm' : 'text-[var(--co-muted)] hover:text-[var(--co-ink)]'}`}>{label}</Link>)}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
        <form className="flex flex-wrap items-center gap-2">
          <input name="start" type="date" defaultValue={rangeStart} className="co-input w-[154px] text-sm" />
          <span className="text-xs text-[var(--co-muted)]">to</span>
          <input name="end" type="date" defaultValue={rangeEnd} className="co-input w-[154px] text-sm" />
          {sp.tab ? <input type="hidden" name="tab" value={sp.tab} /> : null}
          <button className="co-button-secondary text-sm" type="submit">Apply</button>
        </form>
          <Link href="/calendar" className="co-button-secondary">Calendar</Link>
          <Link href="/recurring/new" className="co-button-secondary">+ Recurring</Link>
          <RecalculateEstimatesButton />
          <Link href="/jobs/new" className="co-button-primary">+ New job</Link>
        </div>
      </nav>

      <section className="block">
        <section className="co-card overflow-hidden">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--co-line-soft)] px-5 py-5 sm:px-6">
            <div>
              <p className="eyebrow">Active jobs</p>
              <h2 className="mt-1 text-xl font-semibold tracking-[-0.03em] text-[var(--co-ink)]">Service operations</h2>
              <p className="mt-1 text-sm text-[var(--co-muted)]">Open a job to manage crew, timing, customer details, photos, and close-out.</p>
            </div>
            <Link href="/calendar" className="mt-1 text-sm font-medium text-[var(--co-accent-text)] hover:underline">
              Route preview &rarr;
            </Link>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--co-line-soft)] bg-[var(--co-surface-muted)]/35 p-4 sm:px-5" aria-label="Job controls">
            <div className="flex flex-wrap items-center gap-2" aria-label="Job status filters">
              {["all", "scheduled", "in_progress", "completed", "cancelled"].map((status) => (
                <Link
                  key={status}
                  href={hrefWith(sp, { status, missingHours: "", unassigned: "" })}
                  className={`rounded-full px-3.5 py-2 text-xs font-semibold transition ${
                    !sp.missingHours && !sp.unassigned && (sp.status ?? "all") === status
                      ? "bg-[var(--co-accent-fill)] text-white shadow-sm"
                      : "border border-[var(--co-line)] bg-[var(--co-surface)] text-[var(--co-muted)] hover:border-[var(--co-accent-text)] hover:text-[var(--co-ink)]"
                  }`}
                >
                  {status === "all" ? "All jobs" : statusLabel("job", status)}
                </Link>
              ))}
              <Link
                href={hrefWith(sp, { missingHours: "yes", unassigned: "", status: "" })}
                className={`rounded-full px-3.5 py-2 text-xs font-semibold transition ${
                  sp.missingHours === "yes"
                    ? "bg-[var(--co-accent-fill)] text-white shadow-sm"
                    : "border border-[var(--co-line)] bg-[var(--co-surface)] text-[var(--co-muted)] hover:border-[var(--co-accent-text)] hover:text-[var(--co-ink)]"
                }`}
              >
                Missing hours
                {metrics.missingHours ? <span className="ml-2 rounded-full bg-white/20 px-2 py-0.5 text-[11px]">{metrics.missingHours}</span> : null}
              </Link>
              <Link
                href={hrefWith(sp, { unassigned: "yes", missingHours: "", status: "" })}
                className={`rounded-full px-3.5 py-2 text-xs font-semibold transition ${
                  sp.unassigned === "yes"
                    ? "bg-[var(--co-accent-fill)] text-white shadow-sm"
                    : "border border-[var(--co-line)] bg-[var(--co-surface)] text-[var(--co-muted)] hover:border-[var(--co-accent-text)] hover:text-[var(--co-ink)]"
                }`}
                >
                Unassigned
                {metrics.unassigned ? <span className="ml-2 rounded-full bg-white/20 px-2 py-0.5 text-[11px]">{metrics.unassigned}</span> : null}
              </Link>
            </div>

            <form className="flex flex-wrap items-center gap-3">
              <input name="q" defaultValue={sp.q} placeholder="Search customer or address" className="co-input min-w-[220px] flex-1" />
              <select name="employeeId" defaultValue={sp.employeeId ?? ""} className="co-input">
                <option value="">All technicians</option>
                {employees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.firstName} {employee.lastName}
                  </option>
                ))}
              </select>
              <select name="type" defaultValue={sp.type ?? ""} className="co-input">
                <option value="">All cleaning types</option>
                {Object.entries(TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              {sp.status ? <input type="hidden" name="status" value={sp.status} /> : null}
              {sp.tab ? <input type="hidden" name="tab" value={sp.tab} /> : null}
              <input type="hidden" name="start" value={rangeStart} />
              <input type="hidden" name="end" value={rangeEnd} />
              <button className="co-button-secondary justify-center" type="submit">
                Filter
              </button>
            </form>
          </div>

          {filteredRows.length === 0 ? (
            <div className="px-6 py-16 text-center">
              <p className="text-sm font-semibold text-[var(--co-ink)]">No jobs match these filters.</p>
              <p className="mt-1 text-xs text-[var(--co-muted)]">Try clearing a filter or create a new job.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-left text-sm">
                <thead className="border-b border-[var(--co-line-soft)] bg-[var(--co-surface-muted)]/50 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--co-muted)]">
                  <tr>
                    <th className="px-5 py-3">Job ID</th>
                    <th className="px-5 py-3">Customer</th>
                    <th className="px-5 py-3">Cleaning type</th>
                    <th className="px-5 py-3">Assigned cleaners</th>
                    <th className="px-5 py-3">Schedule</th>
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--co-line-soft)]">
                  {filteredRows.map((row) => {
                    const assigned = assignmentsByJob.get(row.id) ?? [];

                    return (
                      <tr key={row.id} className="transition-colors hover:bg-[var(--co-surface-muted)]/55">
                        <td className="px-5 py-4 font-mono font-semibold text-[var(--co-accent-text)]">
                          <Link href={`/jobs/${row.id}`} className="-mx-5 -my-4 block px-5 py-4 font-medium text-[var(--co-ink)] hover:text-[var(--co-accent-text)]">
                            #{row.id.slice(0, 8).toUpperCase()}
                          </Link>
                        </td>
                        <td className="px-5 py-4 font-medium text-[var(--co-ink)]">
                          {row.customerFirstName} {row.customerLastName}
                          <span className="block max-w-[180px] truncate text-xs font-normal text-[var(--co-muted)]">{row.addressLine1 ?? "No address"}</span>
                        </td>
                        <td className="px-5 py-4 text-[var(--co-muted)]">
                          {TYPE_LABELS[row.type] ?? row.type}
                          {row.estimatedDurationMinutes ? <span className="block text-xs">Est. {formatEstimatedTime(row.estimatedDurationMinutes)}</span> : null}
                        </td>
                        <td className="px-5 py-4">
                          {assigned.length ? (
                            <div className="flex flex-wrap gap-1.5">
                              {assigned.map((person) => (
                                <span key={person.userId} className="rounded-full bg-[var(--co-surface-muted)] px-2 py-1 text-xs text-[var(--co-accent-text)]">
                                  {person.firstName} {person.lastName[0]}.
                                  {!person.isActive ? <span className="ml-1 text-[10px] font-semibold uppercase tracking-[0.04em] text-[var(--co-muted)]">Inactive</span> : null}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="font-medium text-amber-700">Unassigned</span>
                          )}
                        </td>
                        <td className="px-5 py-4"><span className="block font-semibold text-[var(--co-ink)]">{row.scheduledDate === todayText ? "Today" : formatDisplayDate(row.scheduledDate)}</span><span className="block text-xs text-[var(--co-muted)]">{row.scheduledStartTime?.slice(0, 5) ?? "No time"}{row.estimatedDurationMinutes ? ` · Est. ${formatEstimatedTime(row.estimatedDurationMinutes)}` : ""}</span></td>
                        <td className="px-5 py-4">
                          <Pill status={row.status} />
                        </td>
                        <td className={`px-5 py-4 font-semibold ${row.status === "cancelled" ? "text-[var(--co-muted)] line-through" : "text-[var(--co-ink)]"}`}>{money(row.priceCents)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--co-line-soft)] px-5 py-3 text-xs text-[var(--co-muted)]">
            <span>Showing {totalRows ? (page - 1) * pageSize + 1 : 0}–{Math.min(page * pageSize, totalRows)} of {totalRows} jobs.</span>
            <div className="flex items-center gap-2"><Link aria-disabled={page === 1} href={hrefWith(sp, { page: page > 1 ? String(page - 1) : "1" })} className={`co-button-secondary px-3 py-1.5 ${page === 1 ? 'pointer-events-none opacity-40' : ''}`}>Previous</Link><span className="font-medium text-[var(--co-ink)]">Page {page} of {totalPages}</span><Link aria-disabled={page >= totalPages} href={hrefWith(sp, { page: page < totalPages ? String(page + 1) : String(totalPages) })} className={`co-button-secondary px-3 py-1.5 ${page >= totalPages ? 'pointer-events-none opacity-40' : ''}`}>Next</Link></div>
          </div>
        </section>
      </section>
    </div>
  );
}
