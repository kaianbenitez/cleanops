import Link from "next/link";
import { formatDisplayDate } from "@/lib/scheduling/dates";
import { redirect } from "next/navigation";
import { and, count, desc, eq, gte, ilike, inArray, lte, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { customers, invoices, jobAssignments, jobs, timeEntries, users } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import { RecalculateEstimatesButton } from "./recalculate-estimates-button";

const TYPE_LABELS: Record<string, string> = {
  first_clean: "First clean",
  recurring: "Recurring",
  one_time: "One-time",
  deep_clean: "Deep clean",
  move_out: "Move in/out",
};

const STATUS_LABELS: Record<string, string> = {
  scheduled: "Scheduled",
  in_progress: "In progress",
  completed: "Completed",
  cancelled: "Cancelled",
  no_show: "No show",
};

const STATUS_STYLES: Record<string, string> = {
  scheduled: "border-slate-200 bg-slate-50 text-slate-600",
  in_progress: "border-amber-200 bg-amber-50 text-amber-700",
  completed: "border-emerald-200 bg-emerald-50 text-emerald-700",
  cancelled: "border-slate-200 bg-slate-50 text-slate-400",
  no_show: "border-rose-200 bg-rose-50 text-rose-700",
};

type SearchParams = {
  q?: string;
  status?: string;
  employeeId?: string;
  type?: string;
  missingHours?: string;
  unassigned?: string;
  jobId?: string;
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
    <div className={`rounded-[24px] border p-5 shadow-[0_8px_24px_rgba(27,41,37,0.03)] ${metricTone(tone)}`}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] opacity-75">{label}</p>
      <p className="mt-2 text-3xl font-semibold tracking-[-0.05em]">{value}</p>
      <p className="mt-1 text-xs opacity-80">{hint}</p>
    </div>
  );
}

function Pill({ status }: { status: string }) {
  return <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${STATUS_STYLES[status] ?? "border-slate-200 bg-slate-50 text-slate-600"}`}>{STATUS_LABELS[status] ?? status}</span>;
}

function SideCard({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="co-card overflow-hidden">
      <div className="border-b border-[var(--co-line-soft)] px-5 py-4">
        <p className="eyebrow">{eyebrow}</p>
        <h2 className="mt-1 text-lg font-semibold">{title}</h2>
      </div>
      <div className="px-5 py-5">{children}</div>
    </section>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--co-line-soft)] bg-[var(--co-surface-muted)]/35 px-3 py-3">
      <p className="text-xs font-medium uppercase tracking-[0.12em] text-[var(--co-muted)]">{label}</p>
      <p className="text-sm font-semibold text-[var(--co-ink)]">{value}</p>
    </div>
  );
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

  const conditions = [eq(jobs.companyId, admin.companyId), gte(jobs.scheduledDate, rangeStart), lte(jobs.scheduledDate, rangeEnd)];
  if (sp.status && sp.status !== "all" && STATUS_LABELS[sp.status]) conditions.push(eq(jobs.status, sp.status as typeof jobs.status.enumValues[number]));
  if (!sp.status && activeTab === "active") conditions.push(inArray(jobs.status, ["scheduled", "in_progress"]));
  if (!sp.status && activeTab === "pending") conditions.push(and(eq(jobs.status, "completed"), sql`not exists (select 1 from invoices where invoices.job_id = ${jobs.id})`)!);
  if (!sp.status && activeTab === "history") conditions.push(inArray(jobs.status, ["completed", "cancelled", "no_show"]));
  if (sp.type) conditions.push(eq(jobs.type, sp.type as typeof jobs.type.enumValues[number]));
  if (sp.q?.trim()) {
    const query = `%${sp.q.trim()}%`;
    conditions.push(or(ilike(customers.firstName, query), ilike(customers.lastName, query), ilike(customers.addressLine1, query))!);
  }

  if (sp.employeeId) {
    const assigned = await db.select({ jobId: jobAssignments.jobId }).from(jobAssignments).where(eq(jobAssignments.userId, sp.employeeId));
    conditions.push(assigned.length ? inArray(jobs.id, assigned.map((row) => row.jobId)) : inArray(jobs.id, ["00000000-0000-0000-0000-000000000000"]));
  }

  const [rows, totalRowsResult, employees, allJobs] = await Promise.all([
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
      .where(and(eq(users.companyId, admin.companyId), eq(users.role, "employee")))
      .orderBy(users.firstName),
    db
      .select({ id: jobs.id, status: jobs.status, scheduledDate: jobs.scheduledDate })
      .from(jobs)
      .where(and(eq(jobs.companyId, admin.companyId), gte(jobs.scheduledDate, rangeStart), lte(jobs.scheduledDate, rangeEnd))),
  ]);
  const totalRows = Number(totalRowsResult[0]?.total ?? 0);
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));

  const jobIds = rows.map((row) => row.id);
  const allJobIds = allJobs.map((job) => job.id);

  const [assignments, entries, invoiceRows, allAssignments, allInvoiceRows] = await Promise.all([
    jobIds.length
      ? db
          .select({ jobId: jobAssignments.jobId, userId: users.id, firstName: users.firstName, lastName: users.lastName })
          .from(jobAssignments)
          .innerJoin(users, eq(jobAssignments.userId, users.id))
          .where(inArray(jobAssignments.jobId, jobIds))
      : Promise.resolve([]),
    jobIds.length
      ? db.select({ jobId: timeEntries.jobId, minutesWorked: timeEntries.minutesWorked }).from(timeEntries).where(inArray(timeEntries.jobId, jobIds))
      : Promise.resolve([]),
    jobIds.length
      ? db.select({ jobId: invoices.jobId, status: invoices.status }).from(invoices).where(inArray(invoices.jobId, jobIds))
      : Promise.resolve([]),
    allJobIds.length
      ? db.select({ jobId: jobAssignments.jobId }).from(jobAssignments).where(inArray(jobAssignments.jobId, allJobIds))
      : Promise.resolve([]),
    allJobIds.length
      ? db.select({ jobId: invoices.jobId }).from(invoices).where(inArray(invoices.jobId, allJobIds))
      : Promise.resolve([]),
  ]);

  const assignmentsByJob = new Map<string, typeof assignments>();
  assignments.forEach((assignment) => assignmentsByJob.set(assignment.jobId, [...(assignmentsByJob.get(assignment.jobId) ?? []), assignment]));
  const minutesByJob = new Map<string, number>();
  entries.forEach((entry) => minutesByJob.set(entry.jobId, (minutesByJob.get(entry.jobId) ?? 0) + (entry.minutesWorked ?? 0)));
  const invoiceByJob = new Map<string, string>();
  invoiceRows.forEach((invoice) => invoice.jobId && invoiceByJob.set(invoice.jobId, invoice.status));

  const assignedIds = new Set(allAssignments.map((assignment) => assignment.jobId));
  const invoicedIds = new Set(allInvoiceRows.map((invoice) => invoice.jobId).filter((jobId): jobId is string => Boolean(jobId)));

  const metrics = {
    today: allJobs.filter((job) => job.scheduledDate === todayText).length,
    week: allJobs.filter((job) => job.scheduledDate >= weekStartText && job.scheduledDate <= weekEndText).length,
    unassigned: allJobs.filter((job) => !assignedIds.has(job.id) && !["cancelled", "no_show"].includes(job.status)).length,
    awaiting: allJobs.filter((job) => job.status === "completed" && !invoicedIds.has(job.id)).length,
  };

  const missingHoursCount = rows.filter((row) => !minutesByJob.get(row.id)).length;
  const unassignedRows = rows.filter((row) => (assignmentsByJob.get(row.id) ?? []).length === 0);
  const visibleRows = sp.missingHours === "yes" ? rows.filter((row) => !minutesByJob.get(row.id)) : rows;
  const filteredRows = sp.unassigned === "yes" ? unassignedRows : visibleRows;
  const selectedJob = rows.find((row) => row.id === sp.jobId) ?? filteredRows[0] ?? rows[0] ?? null;
  const selectedAssignments = selectedJob ? assignmentsByJob.get(selectedJob.id) ?? [] : [];
  const selectedMinutes = selectedJob ? minutesByJob.get(selectedJob.id) ?? 0 : 0;
  const selectedInvoice = selectedJob ? invoiceByJob.get(selectedJob.id) : null;
  const availableToday = employees.filter((employee) => rows.filter((job) => (assignmentsByJob.get(job.id) ?? []).some((assignment) => assignment.userId === employee.id)).length === 0);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="eyebrow">Admin &nbsp;›&nbsp; Jobs management</p>
          <h1 className="page-title">Operations Hub</h1>
          <p className="page-subtitle">Real-time management of residential cleaning services across all zones.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <RecalculateEstimatesButton />
          <Link href="/calendar" className="co-button-secondary">
            Open calendar
          </Link>
          <Link href="/recurring/new" className="co-button-secondary">
            + Recurring
          </Link>
          <Link href="/jobs/new" className="co-button-primary">
            + New job
          </Link>
        </div>
      </header>

      <section className="ml-auto grid max-w-[500px] gap-3 sm:grid-cols-2">
        <MetricCard label="Completed today" value={String(allJobs.filter((job) => job.status === "completed" && job.scheduledDate === todayText).length)} hint="services closed today" tone="good" />
        <MetricCard label="Pending review" value={String(metrics.awaiting)} hint="completed, awaiting invoice" tone={metrics.awaiting ? "warning" : "good"} />
      </section>

      <nav className="flex flex-wrap items-center justify-between gap-3 rounded-[24px] border border-[var(--co-line-soft)] bg-[var(--co-surface-muted)]/55 p-3" aria-label="Job views">
        <div className="flex rounded-2xl bg-white p-1 shadow-sm">
          {[['active','Active'],['pending','Pending review'],['history','History']].map(([tab, label]) => <Link key={tab} href={hrefWith(sp, { tab, status: "", page: "", jobId: "" })} className={`rounded-xl px-4 py-2 text-sm font-semibold ${activeTab === tab ? 'bg-[var(--co-evergreen)] text-white' : 'text-[var(--co-muted)] hover:text-[var(--co-ink)]'}`}>{label}</Link>)}
        </div>
        <form className="flex flex-wrap items-center gap-2">
          <input name="start" type="date" defaultValue={rangeStart} className="co-input text-sm" />
          <span className="text-xs text-[var(--co-muted)]">to</span>
          <input name="end" type="date" defaultValue={rangeEnd} className="co-input text-sm" />
          {sp.tab ? <input type="hidden" name="tab" value={sp.tab} /> : null}
          <button className="co-button-secondary text-sm" type="submit">Apply dates</button>
        </form>
      </nav>

      <section className="block">
        <section className="co-card overflow-hidden">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--co-line-soft)] px-5 py-5 sm:px-6">
            <div>
              <p className="eyebrow">Active jobs</p>
              <h2 className="mt-1 text-xl font-semibold tracking-[-0.03em] text-[var(--co-ink)]">Service operations</h2>
              <p className="mt-1 text-sm text-[var(--co-muted)]">Open a job to manage crew, timing, customer details, photos, and close-out.</p>
            </div>
            <Link href="/calendar" className="mt-1 text-sm font-medium text-[var(--co-evergreen)] hover:underline">
              Route preview &rarr;
            </Link>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--co-line-soft)] bg-[var(--co-surface-muted)]/35 p-4 sm:px-5" aria-label="Job controls">
            <div className="flex flex-wrap items-center gap-2" aria-label="Job status filters">
              {["all", "scheduled", "in_progress", "completed", "cancelled"].map((status) => (
                <Link
                  key={status}
                  href={hrefWith(sp, { status, missingHours: "", unassigned: "", jobId: "" })}
                  className={`rounded-full px-3.5 py-2 text-xs font-semibold transition ${
                    !sp.missingHours && !sp.unassigned && (sp.status ?? "all") === status
                      ? "bg-[var(--co-evergreen)] text-white shadow-sm"
                      : "border border-[var(--co-line)] bg-white text-[var(--co-muted)] hover:border-[var(--co-evergreen)] hover:text-[var(--co-ink)]"
                  }`}
                >
                  {status === "all" ? "All jobs" : STATUS_LABELS[status]}
                </Link>
              ))}
              <Link
                href={hrefWith(sp, { missingHours: "yes", unassigned: "", status: "", jobId: "" })}
                className={`rounded-full px-3.5 py-2 text-xs font-semibold transition ${
                  sp.missingHours === "yes"
                    ? "bg-[var(--co-evergreen)] text-white shadow-sm"
                    : "border border-[var(--co-line)] bg-white text-[var(--co-muted)] hover:border-[var(--co-evergreen)] hover:text-[var(--co-ink)]"
                }`}
              >
                Missing hours
                {missingHoursCount ? <span className="ml-2 rounded-full bg-white/20 px-2 py-0.5 text-[11px]">{missingHoursCount}</span> : null}
              </Link>
              <Link
                href={hrefWith(sp, { unassigned: "yes", missingHours: "", status: "", jobId: "" })}
                className={`rounded-full px-3.5 py-2 text-xs font-semibold transition ${
                  sp.unassigned === "yes"
                    ? "bg-[var(--co-evergreen)] text-white shadow-sm"
                    : "border border-[var(--co-line)] bg-white text-[var(--co-muted)] hover:border-[var(--co-evergreen)] hover:text-[var(--co-ink)]"
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
              {sp.jobId ? <input type="hidden" name="jobId" value={sp.jobId} /> : null}
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
                    const minutes = minutesByJob.get(row.id) ?? 0;
                    const invoiceStatus = invoiceByJob.get(row.id);
                    const selected = selectedJob?.id === row.id;

                    return (
                      <tr key={row.id} className={`transition-colors hover:bg-[var(--co-surface-muted)]/55 ${selected ? "bg-[var(--co-surface-muted)]/40" : ""}`}>
                        <td className="px-5 py-4 font-mono font-semibold text-[var(--co-evergreen)]">
                          <Link href={`/jobs/${row.id}`} className="-mx-5 -my-4 block px-5 py-4 font-medium text-[var(--co-ink)] hover:text-[var(--co-evergreen)]">
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
                                <span key={person.userId} className="rounded-full bg-[var(--co-surface-muted)] px-2 py-1 text-xs text-[var(--co-evergreen)]">
                                  {person.firstName} {person.lastName[0]}.
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

        <aside className="hidden space-y-5">
          <SideCard eyebrow="Job details" title={selectedJob ? `${selectedJob.customerFirstName} ${selectedJob.customerLastName}` : "Select a job"}>
            {selectedJob ? (
              <div className="space-y-4">
                <div className="rounded-[24px] border border-[var(--co-line-soft)] bg-[linear-gradient(135deg,#f5f7f1,#ffffff)] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--co-muted)]">Needs assignment</p>
                      <p className="mt-2 text-sm font-semibold">{selectedAssignments.length ? `${selectedAssignments.length} technician${selectedAssignments.length === 1 ? "" : "s"} assigned` : "Unassigned"}</p>
                      <p className="mt-1 text-xs text-[var(--co-muted)]">
                        {selectedJob.scheduledDate} · {selectedJob.scheduledStartTime?.slice(0, 5) ?? "No time"}
                      </p>
                    </div>
                    <Pill status={selectedJob.status} />
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <StatRow label="Customer" value={`${selectedJob.customerFirstName} ${selectedJob.customerLastName}`} />
                  <StatRow label="Next action" value={selectedJob.status === "completed" ? "Invoice ready" : "Keep scheduled"} />
                </div>

                <div className="space-y-3 text-sm">
                  <div>
                    <p className="text-[var(--co-muted)]">Address</p>
                    <p className="mt-1 font-medium">
                      {selectedJob.addressLine1 ?? "No address"}
                      <br />
                      {selectedJob.city ?? ""}
                      {selectedJob.state ? `, ${selectedJob.state}` : ""} {selectedJob.zip ?? ""}
                    </p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <StatRow label="Type" value={TYPE_LABELS[selectedJob.type] ?? selectedJob.type} />
                    <StatRow label="Budget hours" value={selectedJob.estimatedDurationMinutes ? (selectedJob.estimatedDurationMinutes / 60).toFixed(2) : "—"} />
                    <StatRow label="Job value" value={money(selectedJob.priceCents)} />
                    <StatRow label="Recorded hours" value={`${(selectedMinutes / 60).toFixed(2)} hrs`} />
                    <StatRow label="Invoice" value={selectedInvoice === "paid" ? "Paid" : selectedInvoice === "sent" ? "Sent" : selectedJob.status === "completed" ? "Ready" : "Not ready"} />
                    <StatRow label="Crew" value={selectedAssignments.length ? `${selectedAssignments.length} assigned` : "None"} />
                  </div>
                </div>

                <div className="grid gap-2">
                  <Link href={`/jobs/${selectedJob.id}`} className="co-button-primary justify-center">
                    Open job
                  </Link>
                  <Link href={`/customers/${selectedJob.customerId}`} className="co-button-secondary justify-center">
                    View customer
                  </Link>
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                      [selectedJob.addressLine1, selectedJob.city, selectedJob.state].filter(Boolean).join(", ")
                    )}`}
                    target="_blank"
                    rel="noreferrer"
                    className="co-button-secondary justify-center"
                  >
                    Open map
                  </a>
                  {selectedJob.status === "completed" ? (
                    <Link href={`/invoices?jobId=${selectedJob.id}`} className="co-button-secondary justify-center">
                      Review invoice
                    </Link>
                  ) : null}
                </div>
              </div>
            ) : (
              <p className="text-sm text-[var(--co-muted)]">Select a row to inspect the job.</p>
            )}
          </SideCard>

          <SideCard eyebrow="Team today" title="Availability">
            <div className="space-y-3">
              {employees.map((employee) => {
                const count = rows.filter((job) => (assignmentsByJob.get(job.id) ?? []).some((assignment) => assignment.userId === employee.id)).length;
                const available = count === 0;
                return (
                  <div key={employee.id} className="flex items-center justify-between rounded-2xl border border-[var(--co-line-soft)] px-3 py-3 text-sm">
                    <div>
                      <p className="font-medium">
                        {employee.firstName} {employee.lastName}
                      </p>
                      <p className="text-xs text-[var(--co-muted)]">{available ? "Available today" : `${count} scheduled job${count === 1 ? "" : "s"}`}</p>
                    </div>
                    <span className={`h-2.5 w-2.5 rounded-full ${available ? "bg-emerald-500" : "bg-amber-500"}`} aria-label={available ? "Available" : "Scheduled"} />
                  </div>
                );
              })}
            </div>
          </SideCard>

          <SideCard eyebrow="Queue" title="Unassigned jobs">
            <div className="space-y-2">
              {unassignedRows.slice(0, 4).map((job) => (
                <Link key={job.id} href={hrefWith(sp, { jobId: job.id, unassigned: "yes" })} className="block rounded-2xl border border-amber-200 bg-amber-50/60 p-3 text-sm hover:bg-amber-50">
                  <div className="font-medium">
                    {job.customerFirstName} {job.customerLastName}
                  </div>
                  <div className="mt-1 text-xs text-[var(--co-muted)]">
                    {job.scheduledDate} &middot; {TYPE_LABELS[job.type] ?? job.type}
                  </div>
                </Link>
              ))}
              {unassignedRows.length === 0 ? <p className="text-sm text-[var(--co-muted)]">Everything is assigned.</p> : null}
            </div>
          </SideCard>

          <SideCard eyebrow="Quick glance" title="This week">
            <div className="space-y-2">
              <StatRow label="Available" value={String(availableToday.length)} />
              <StatRow label="Missing hours" value={String(missingHoursCount)} />
              <StatRow label="Awaiting invoicing" value={String(metrics.awaiting)} />
              <StatRow label="Unassigned jobs" value={String(metrics.unassigned)} />
            </div>
          </SideCard>
        </aside>
      </section>
    </div>
  );
}
