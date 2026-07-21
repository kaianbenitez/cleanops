import Link from "next/link";
import { redirect } from "next/navigation";
import { and, eq, gte, ilike, inArray, isNotNull, isNull, lte } from "drizzle-orm";
import { db } from "@/db";
import { customers, jobAssignments, jobTypeEnum, jobs, users } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import { addDays, formatDayLabel, startOfWeek, toISODate, weekDates } from "@/lib/scheduling/dates";
import FilterBar from "./filter-bar";
import RoutePreview from "./route-preview";
import StaffBoard from "./staff-board";
import WeekBoard from "./week-board";
import DayBoard from "./day-board";
import ListBoard from "./list-board";
import { TYPE_LABELS, STATUS_STYLES } from "./shared";

type SearchParams = {
  view?: string;
  week?: string;
  day?: string;
  employeeId?: string;
  type?: string;
  recurring?: string;
  zip?: string;
};

type CalendarJob = {
  id: string;
  type: string;
  status: string;
  scheduledDate: string;
  scheduledStartTime: string | null;
  estimatedDurationMinutes: number | null;
  priceCents: number;
  recurringSeriesId: string | null;
  customerFirstName: string;
  customerLastName: string;
  customerZip: string | null;
  customerCity: string | null;
  customerAddress: string | null;
};

function query(params: SearchParams) {
  const result = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => value && result.set(key, value));
  const text = result.toString();
  return text ? `?${text}` : "";
}

function Metric({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="co-card p-5">
      <p className="text-xs font-medium uppercase tracking-[0.1em] text-[var(--co-muted)]">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-[-0.04em]">{value}</p>
      <p className="mt-1 text-xs text-[var(--co-muted)]">{hint}</p>
    </div>
  );
}

function SidePanel({
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

function monthBounds(date: Date) {
  const start = new Date(Date.UTC(date.getFullYear(), date.getMonth(), 1));
  const end = new Date(Date.UTC(date.getFullYear(), date.getMonth() + 1, 0));
  return { start: toISODate(start), end: toISODate(end) };
}

export default async function CalendarPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const admin = await getCurrentUser();
  if (!admin) redirect("/login");
  if (admin.role !== "admin") redirect("/my-day");

  const sp = await searchParams;
  const view = sp.view ?? "week";
  const dayAnchor = sp.day ? new Date(`${sp.day}T00:00:00.000Z`) : new Date();
  const weekStart = startOfWeek(sp.week ? new Date(`${sp.week}T00:00:00.000Z`) : new Date());
  const days = view === "day" || view === "staff" ? [dayAnchor] : weekDates(weekStart);
  const start = toISODate(days[0]);
  const end = toISODate(days[days.length - 1]);
  const now = new Date();
  const todayIso = toISODate(now);
  const { start: monthStart, end: monthEnd } = monthBounds(now);

  const employees = await db
    .select({ id: users.id, firstName: users.firstName, lastName: users.lastName })
    .from(users)
    .where(and(eq(users.companyId, admin.companyId), eq(users.role, "employee"), eq(users.isActive, true)))
    .orderBy(users.firstName);

  const conditions = [eq(jobs.companyId, admin.companyId), gte(jobs.scheduledDate, start), lte(jobs.scheduledDate, end)];
  if (sp.type && (jobTypeEnum as readonly string[]).includes(sp.type)) conditions.push(eq(jobs.type, sp.type as typeof jobs.type.enumValues[number]));
  if (sp.recurring === "yes") conditions.push(isNotNull(jobs.recurringSeriesId));
  if (sp.recurring === "no") conditions.push(isNull(jobs.recurringSeriesId));
  if (sp.zip) conditions.push(ilike(customers.zip, `${sp.zip}%`));

  const base = db
    .select({
      id: jobs.id,
      type: jobs.type,
      status: jobs.status,
      scheduledDate: jobs.scheduledDate,
      scheduledStartTime: jobs.scheduledStartTime,
      estimatedDurationMinutes: jobs.estimatedDurationMinutes,
      priceCents: jobs.priceCents,
      recurringSeriesId: jobs.recurringSeriesId,
      customerFirstName: customers.firstName,
      customerLastName: customers.lastName,
      customerZip: customers.zip,
      customerCity: customers.city,
      customerAddress: customers.addressLine1,
    })
    .from(jobs)
    .innerJoin(customers, eq(jobs.customerId, customers.id));

  const rows: CalendarJob[] = sp.employeeId
    ? await base
        .innerJoin(jobAssignments, and(eq(jobAssignments.jobId, jobs.id), eq(jobAssignments.userId, sp.employeeId)))
        .where(and(...conditions))
        .orderBy(jobs.scheduledDate, jobs.scheduledStartTime)
    : await base.where(and(...conditions)).orderBy(jobs.scheduledDate, jobs.scheduledStartTime);

  const monthRows = await db
    .select({
      id: jobs.id,
      type: jobs.type,
      status: jobs.status,
      scheduledDate: jobs.scheduledDate,
      customerFirstName: customers.firstName,
      customerLastName: customers.lastName,
    })
    .from(jobs)
    .innerJoin(customers, eq(jobs.customerId, customers.id))
    .where(and(eq(jobs.companyId, admin.companyId), gte(jobs.scheduledDate, monthStart), lte(jobs.scheduledDate, monthEnd)));

  const assignments = rows.length
    ? await db
        .select({ jobId: jobAssignments.jobId, userId: users.id, firstName: users.firstName, lastName: users.lastName, role: jobAssignments.role })
        .from(jobAssignments)
        .innerJoin(users, eq(jobAssignments.userId, users.id))
        .where(inArray(jobAssignments.jobId, rows.map((row) => row.id)))
    : [];

  const byJob = new Map<string, typeof assignments>();
  assignments.forEach((assignment) => byJob.set(assignment.jobId, [...(byJob.get(assignment.jobId) ?? []), assignment]));
  // Postgres makes no row-order guarantee without ORDER BY; assignedUserIds[0] must be the lead, so sort explicitly.
  byJob.forEach((jobAssignmentsForJob) => jobAssignmentsForJob.sort((a, b) => (a.role === b.role ? 0 : a.role === "lead" ? -1 : 1)));
  const byDate = new Map<string, CalendarJob[]>();
  rows.forEach((row) => byDate.set(row.scheduledDate, [...(byDate.get(row.scheduledDate) ?? []), row]));
  const monthAssigned = new Set(assignments.map((assignment) => assignment.jobId));
  const monthUnassigned = monthRows.filter((job) => !monthAssigned.has(job.id) && !["cancelled", "no_show"].includes(job.status));

  const filterParams: SearchParams = { view: sp.view, employeeId: sp.employeeId, type: sp.type, recurring: sp.recurring, zip: sp.zip };
  const prev = query({ ...filterParams, ...(view === "day" || view === "staff" ? { day: toISODate(addDays(dayAnchor, -1)) } : { week: toISODate(addDays(weekStart, -7)) }) });
  const next = query({ ...filterParams, ...(view === "day" || view === "staff" ? { day: toISODate(addDays(dayAnchor, 1)) } : { week: toISODate(addDays(weekStart, 7)) }) });

  const selectedEmployee = employees.find((employee) => employee.id === sp.employeeId) ?? null;
  const routeDate = view === "day" || view === "staff" ? dayAnchor : days.find((day) => toISODate(day) === todayIso) ?? days[0];
  const routeJobs = (byDate.get(toISODate(routeDate)) ?? [])
    .filter((job) => (selectedEmployee ? (byJob.get(job.id) ?? []).some((assignment) => assignment.userId === selectedEmployee.id) : true))
    .slice(0, 5);
  const unassigned = monthUnassigned;
  const todayRows = rows.filter((row) => row.scheduledDate === todayIso);
  const selectedJobs = selectedEmployee ? rows.filter((job) => (byJob.get(job.id) ?? []).some((assignment) => assignment.userId === selectedEmployee.id)) : rows;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="eyebrow">Operations / Schedule</p>
          <h1 className="page-title">Calendar</h1>
          <p className="page-subtitle">Place every job with confidence, then publish the day.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/calendar${prev}`} className="co-button-secondary">
            ← Prev
          </Link>
          <Link href={`/calendar${query(filterParams)}`} className="co-button-secondary">
            Today
          </Link>
          <Link href={`/calendar${next}`} className="co-button-secondary">
            Next →
          </Link>
          <Link href="/jobs/new" className="co-button-primary">
            + New job
          </Link>
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Today" value={String(todayRows.length)} hint="jobs on the board today" />
        <Metric label="This week" value={String(rows.length)} hint="jobs in the current window" />
        <Metric label="Unassigned" value={String(unassigned.length)} hint="need a technician" />
        <Metric
          label="Technician load"
          value={selectedEmployee ? String(selectedJobs.length) : "All"}
          hint={selectedEmployee ? `${selectedEmployee.firstName} ${selectedEmployee.lastName}` : "Use technician filter"}
        />
      </section>

      <FilterBar employees={employees} />

      <section className="grid gap-5 xl:grid-cols-[1.45fr_0.75fr]">
        <div className="space-y-5">
          {view === "week" ? (
            <WeekBoard
              days={days.map((day) => {
                const iso = toISODate(day);
                return { iso, label: formatDayLabel(day), dayNum: day.getDate(), isToday: iso === todayIso };
              })}
              employees={employees}
              jobs={rows.map((job) => ({
                id: job.id,
                type: job.type,
                status: job.status,
                scheduledDate: job.scheduledDate,
                scheduledStartTime: job.scheduledStartTime,
                estimatedDurationMinutes: job.estimatedDurationMinutes,
                recurringSeriesId: job.recurringSeriesId,
                customerFirstName: job.customerFirstName,
                customerLastName: job.customerLastName,
                customerZip: job.customerZip,
                assignedUserIds: (byJob.get(job.id) ?? []).map((assignment) => assignment.userId),
              }))}
            />
          ) : null}

          {view === "day" ? (
            <DayBoard
              key={toISODate(routeDate)}
              dayLabel={formatDayLabel(routeDate)}
              employees={employees}
              jobs={rows.map((job) => ({
                id: job.id,
                type: job.type,
                status: job.status,
                scheduledStartTime: job.scheduledStartTime,
                estimatedDurationMinutes: job.estimatedDurationMinutes,
                priceCents: job.priceCents,
                customerFirstName: job.customerFirstName,
                customerLastName: job.customerLastName,
                customerZip: job.customerZip,
                assignedUserIds: (byJob.get(job.id) ?? []).map((assignment) => assignment.userId),
              }))}
            />
          ) : null}

          {view === "staff" ? (
            <StaffBoard
              key={toISODate(dayAnchor)}
              dayLabel={formatDayLabel(dayAnchor)}
              employees={sp.employeeId ? employees.filter((employee) => employee.id === sp.employeeId) : employees}
              jobs={rows.map((job) => ({
                id: job.id,
                type: job.type,
                status: job.status,
                scheduledStartTime: job.scheduledStartTime,
                estimatedDurationMinutes: job.estimatedDurationMinutes,
                customerFirstName: job.customerFirstName,
                customerLastName: job.customerLastName,
                customerZip: job.customerZip,
                assignedUserIds: (byJob.get(job.id) ?? []).map((assignment) => assignment.userId),
              }))}
            />
          ) : null}

          {view === "list" ? (
            <ListBoard
              employees={employees}
              jobs={rows.map((job) => ({
                id: job.id,
                type: job.type,
                status: job.status,
                scheduledDate: job.scheduledDate,
                scheduledStartTime: job.scheduledStartTime,
                recurringSeriesId: job.recurringSeriesId,
                customerFirstName: job.customerFirstName,
                customerLastName: job.customerLastName,
                customerZip: job.customerZip,
                customerCity: job.customerCity,
                customerAddress: job.customerAddress,
                assignedUserIds: (byJob.get(job.id) ?? []).map((assignment) => assignment.userId),
              }))}
            />
          ) : null}

        </div>

        <aside className="space-y-5">
          <SidePanel eyebrow="Route preview" title={selectedEmployee ? `${selectedEmployee.firstName} ${selectedEmployee.lastName}` : "Today's route"}>
            <RoutePreview
              showHeader={false}
              title={selectedEmployee ? `${selectedEmployee.firstName}'s route` : "Today's route"}
              jobs={routeJobs.map((job) => ({
                id: job.id,
                firstName: job.customerFirstName,
                lastName: job.customerLastName,
                address: job.customerAddress ?? "",
                city: job.customerCity ?? "",
                zip: job.customerZip ?? "",
                time: job.scheduledStartTime?.slice(0, 5) ?? "No time",
              }))}
            />
          </SidePanel>

          <SidePanel eyebrow="Schedule" title="Today's jobs">
            <div className="space-y-2">
              {todayRows.slice(0, 5).map((job) => (
                <Link key={job.id} href={`/jobs/${job.id}`} className={`block rounded-2xl border px-3 py-3 text-sm ${STATUS_STYLES[job.status] ?? "border-slate-200 bg-slate-50"}`}>
                  <div className="font-medium">
                    {job.scheduledStartTime?.slice(0, 5)} {job.customerFirstName} {job.customerLastName}
                  </div>
                  <div className="mt-1 text-xs opacity-75">
                    {TYPE_LABELS[job.type] ?? job.type} · {job.customerZip ?? "No zip"}
                  </div>
                </Link>
              ))}
              {todayRows.length === 0 ? <p className="text-sm text-[var(--co-muted)]">No jobs scheduled for today.</p> : null}
            </div>
          </SidePanel>

          <SidePanel eyebrow="Current month" title="Unassigned jobs">
            <div className="space-y-2">
              {unassigned.slice(0, 4).map((job) => (
                <Link key={job.id} href={`/jobs/${job.id}`} className="block rounded-2xl border border-amber-200 bg-amber-50/60 p-3 text-sm hover:bg-amber-50">
                  <div className="font-medium">
                    {job.customerFirstName} {job.customerLastName}
                  </div>
                  <div className="mt-1 text-xs text-[var(--co-muted)]">
                    {job.scheduledDate} · {TYPE_LABELS[job.type] ?? job.type}
                  </div>
                </Link>
              ))}
              {unassigned.length === 0 ? <p className="text-sm text-[var(--co-muted)]">Everything is assigned.</p> : null}
            </div>
          </SidePanel>

          <SidePanel eyebrow="Availability" title="Team today">
            <div className="space-y-3">
              {employees.map((employee) => {
                const count = rows.filter((job) => (byJob.get(job.id) ?? []).some((assignment) => assignment.userId === employee.id)).length;
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
          </SidePanel>
        </aside>
      </section>
    </div>
  );
}
