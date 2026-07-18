import Link from "next/link";
import { redirect } from "next/navigation";
import { and, eq, gte, ilike, inArray, isNotNull, isNull, lte } from "drizzle-orm";
import { db } from "@/db";
import { customers, jobAssignments, jobTypeEnum, jobs, users } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import { addDays, formatDayLabel, startOfWeek, toISODate, weekDates } from "@/lib/scheduling/dates";
import FilterBar from "./filter-bar";
import RoutePreview from "./route-preview";

const TYPE_LABELS: Record<string, string> = {
  first_clean: "First clean",
  recurring: "Recurring",
  one_time: "One-time",
  deep_clean: "Deep clean",
  move_out: "Move in/out",
};

const STATUS_STYLES: Record<string, string> = {
  scheduled: "border-slate-200 bg-slate-50 text-slate-600",
  in_progress: "border-amber-200 bg-amber-50 text-amber-700",
  completed: "border-emerald-200 bg-emerald-50 text-emerald-700",
  cancelled: "border-slate-200 bg-slate-50 text-slate-400",
  no_show: "border-rose-200 bg-rose-50 text-rose-700",
};

const EMPLOYEE_PALETTE = ["#2563eb", "#0f766e", "#7c3aed", "#ea580c", "#be123c", "#15803d", "#b45309", "#4f46e5"];

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

function Pill({ status }: { status: string }) {
  return <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${STATUS_STYLES[status] ?? "border-slate-200 bg-slate-50 text-slate-600"}`}>{status.replaceAll("_", " ")}</span>;
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

function minutesFromTime(value: string | null | undefined) {
  if (!value) return 9 * 60;
  const [hours, minutes] = value.slice(0, 5).split(":").map((part) => Number(part || 0));
  return hours * 60 + minutes;
}

function monthBounds(date: Date) {
  const start = new Date(Date.UTC(date.getFullYear(), date.getMonth(), 1));
  const end = new Date(Date.UTC(date.getFullYear(), date.getMonth() + 1, 0));
  return { start: toISODate(start), end: toISODate(end) };
}

function employeeColor(id: string | null | undefined) {
  if (!id) return "#94a3b8";
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) {
    hash = (hash * 31 + id.charCodeAt(index)) >>> 0;
  }
  return EMPLOYEE_PALETTE[hash % EMPLOYEE_PALETTE.length];
}

function hourLabel(totalMinutes: number) {
  const hour24 = Math.floor(totalMinutes / 60);
  const hour12 = ((hour24 + 11) % 12) + 1;
  const suffix = hour24 < 12 ? "AM" : "PM";
  return `${hour12} ${suffix}`;
}

export default async function CalendarPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const admin = await getCurrentUser();
  if (!admin) redirect("/login");
  if (admin.role !== "admin") redirect("/my-day");

  const sp = await searchParams;
  const view = sp.view ?? "week";
  const dayAnchor = sp.day ? new Date(`${sp.day}T00:00:00.000Z`) : new Date();
  const weekStart = startOfWeek(sp.week ? new Date(`${sp.week}T00:00:00.000Z`) : new Date());
  const days = view === "day" ? [dayAnchor] : weekDates(weekStart);
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
        .select({ jobId: jobAssignments.jobId, userId: users.id, firstName: users.firstName, lastName: users.lastName })
        .from(jobAssignments)
        .innerJoin(users, eq(jobAssignments.userId, users.id))
        .where(inArray(jobAssignments.jobId, rows.map((row) => row.id)))
    : [];

  const byJob = new Map<string, typeof assignments>();
  assignments.forEach((assignment) => byJob.set(assignment.jobId, [...(byJob.get(assignment.jobId) ?? []), assignment]));
  const byDate = new Map<string, CalendarJob[]>();
  rows.forEach((row) => byDate.set(row.scheduledDate, [...(byDate.get(row.scheduledDate) ?? []), row]));
  const monthAssigned = new Set(assignments.map((assignment) => assignment.jobId));
  const monthUnassigned = monthRows.filter((job) => !monthAssigned.has(job.id) && !["cancelled", "no_show"].includes(job.status));

  const filterParams: SearchParams = { view: sp.view, employeeId: sp.employeeId, type: sp.type, recurring: sp.recurring, zip: sp.zip };
  const prev = query({ ...filterParams, ...(view === "day" ? { day: toISODate(addDays(dayAnchor, -1)) } : { week: toISODate(addDays(weekStart, -7)) }) });
  const next = query({ ...filterParams, ...(view === "day" ? { day: toISODate(addDays(dayAnchor, 1)) } : { week: toISODate(addDays(weekStart, 7)) }) });

  const selectedEmployee = employees.find((employee) => employee.id === sp.employeeId) ?? null;
  const routeDate = view === "day" ? dayAnchor : days.find((day) => toISODate(day) === todayIso) ?? days[0];
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
            <div className="co-card overflow-hidden">
              <div className="border-b border-[var(--co-line-soft)] px-5 py-4">
                <p className="eyebrow">Week view</p>
                <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <h2 className="mt-1 text-lg font-semibold">Time-board schedule</h2>
                    <p className="mt-1 text-xs text-[var(--co-muted)]">Days across the top, time down the side, with zip code and crew on each card.</p>
                  </div>
                  <span className="rounded-full border border-[var(--co-line-soft)] bg-[var(--co-surface-muted)]/50 px-3 py-1 text-xs font-medium text-[var(--co-evergreen)]">
                    {rows.length} jobs in view
                  </span>
                </div>
              </div>

              <div className="overflow-x-auto">
                <div className="min-w-[1100px] p-4">
                  <div className="grid" style={{ gridTemplateColumns: `64px repeat(${days.length}, minmax(0, 1fr))` }}>
                    <div className="border-b border-[var(--co-line-soft)]" />
                    {days.map((day) => {
                      const date = toISODate(day);
                      const isToday = date === todayIso;
                      return (
                        <div
                          key={date}
                          className={`border-b border-l border-[var(--co-line-soft)] px-3 py-2 text-center ${isToday ? "bg-[var(--co-surface-muted)]/70" : "bg-white"}`}
                        >
                          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--co-muted)]">{formatDayLabel(day).slice(0, 3)}</p>
                          <p className="mt-1 text-sm font-semibold text-[var(--co-ink)]">{day.getDate()}</p>
                        </div>
                      );
                    })}
                  </div>

                  {Array.from({ length: 12 }, (_, index) => 7 + index).map((hour) => (
                    <div key={hour} className="grid" style={{ gridTemplateColumns: `64px repeat(${days.length}, minmax(0, 1fr))` }}>
                      <div className="relative border-b border-[var(--co-line-soft)] pr-2 pt-1 text-right text-[11px] font-medium text-[var(--co-muted)]">
                        {hourLabel(hour * 60)}
                      </div>
                      {days.map((day) => {
                        const date = toISODate(day);
                        const dayJobs = byDate.get(date) ?? [];
                        const isToday = date === todayIso;
                        return (
                          <div
                            key={`${date}-${hour}`}
                            className={`relative h-[72px] border-b border-l border-[var(--co-line-soft)] ${isToday ? "bg-[var(--co-surface-muted)]/30" : "bg-white"}`}
                          >
                            {hour === 7 &&
                              dayJobs.map((job) => {
                                const startMinutes = minutesFromTime(job.scheduledStartTime);
                                const duration = Math.max(job.estimatedDurationMinutes ?? 75, 45);
                                const top = ((startMinutes - 7 * 60) / 60) * 72 + 4;
                                const height = Math.max((duration / 60) * 72 - 8, 42);
                                const assignedId = (byJob.get(job.id) ?? [])[0]?.userId ?? null;
                                const accent = employeeColor(assignedId);
                                return (
                                  <Link
                                    key={job.id}
                                    href={`/jobs/${job.id}`}
                                    className={`absolute left-2 right-2 rounded-2xl border px-3 py-2 text-left text-xs shadow-[0_10px_24px_rgba(27,41,37,0.06)] transition-transform hover:-translate-y-0.5 ${
                                      STATUS_STYLES[job.status] ?? "border-slate-200 bg-slate-50"
                                    }`}
                                    style={{ top: `${Math.max(top, 6)}px`, height: `${height}px`, borderLeftWidth: "4px", borderLeftColor: accent }}
                                  >
                                    <div className="font-semibold">
                                      {job.scheduledStartTime?.slice(0, 5)} {job.customerFirstName} {job.customerLastName}
                                    </div>
                                    <div className="mt-1 truncate text-[10px] opacity-75">{TYPE_LABELS[job.type] ?? job.type}</div>
                                    <div className="mt-1 flex items-center justify-between gap-2 text-[10px] opacity-80">
                                      <span>{job.customerZip ?? "No zip"}</span>
                                      <span>{(byJob.get(job.id) ?? []).map((person) => person.firstName).join(", ") || "Unassigned"}</span>
                                    </div>
                                  </Link>
                                );
                              })}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : null}

          {view === "day" && rows.length > 0 ? (
            <div className="co-card overflow-hidden">
              <div className="border-b border-[var(--co-line-soft)] px-5 py-4">
                <p className="eyebrow">Day view</p>
                <h2 className="mt-1 text-lg font-semibold">{formatDayLabel(routeDate)}</h2>
              </div>
              <div className="divide-y divide-[var(--co-line-soft)]">
                {rows.map((job) => (
                  <Link
                    key={job.id}
                    href={`/jobs/${job.id}`}
                    className="flex flex-wrap items-center gap-4 px-5 py-4 hover:bg-[var(--co-surface-muted)]/50"
                    style={{ borderLeft: `4px solid ${employeeColor((byJob.get(job.id) ?? [])[0]?.userId ?? null)}` }}
                  >
                    <div className="w-20 font-medium text-[var(--co-ink)]">{job.scheduledStartTime?.slice(0, 5) ?? "No time"}</div>
                    <div className="min-w-[180px] flex-1">
                      <div className="font-medium text-[var(--co-ink)]">
                        {job.customerFirstName} {job.customerLastName}
                      </div>
                      <div className="text-xs text-[var(--co-muted)]">
                        {TYPE_LABELS[job.type] ?? job.type} · {(byJob.get(job.id) ?? []).map((person) => `${person.firstName} ${person.lastName}`).join(", ") || "Unassigned"}
                      </div>
                    </div>
                    <div className="text-sm text-[var(--co-muted)]">${(job.priceCents / 100).toFixed(2)}</div>
                    <Pill status={job.status} />
                  </Link>
                ))}
              </div>
            </div>
          ) : null}

          {view === "list" && rows.length > 0 ? (
            <div className="co-card overflow-hidden">
              <div className="border-b border-[var(--co-line-soft)] px-5 py-4">
                <p className="eyebrow">List view</p>
                <h2 className="mt-1 text-lg font-semibold">All scheduled jobs</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[820px] text-left text-sm">
                  <thead className="bg-[var(--co-surface-muted)] text-xs uppercase tracking-[0.1em] text-[var(--co-muted)]">
                    <tr>
                      <th className="px-5 py-3">Date</th>
                      <th className="px-5 py-3">Customer</th>
                      <th className="px-5 py-3">Address</th>
                      <th className="px-5 py-3">Type</th>
                      <th className="px-5 py-3">Assigned</th>
                      <th className="px-5 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--co-line-soft)]">
                    {rows.map((job) => (
                      <tr key={job.id} className="hover:bg-[var(--co-surface-muted)]/50">
                        <td className="px-5 py-4">
                          <Link href={`/jobs/${job.id}`} className="font-medium text-[var(--co-evergreen)] hover:underline">
                            {job.scheduledDate}
                            <span className="block text-xs text-[var(--co-muted)]">{job.scheduledStartTime?.slice(0, 5)}</span>
                          </Link>
                        </td>
                        <td className="px-5 py-4 font-medium">
                          {job.customerFirstName} {job.customerLastName}
                        </td>
                        <td className="px-5 py-4 text-xs text-[var(--co-muted)]">
                          {job.customerAddress ?? "No address"}
                          <span className="block">
                            {job.customerCity ?? ""} {job.customerZip ?? ""}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-[var(--co-muted)]">{TYPE_LABELS[job.type] ?? job.type}</td>
                        <td className="px-5 py-4 text-[var(--co-muted)]">{(byJob.get(job.id) ?? []).map((person) => person.firstName).join(", ") || "Unassigned"}</td>
                    <td className="px-5 py-4">
                          <Pill status={job.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {view === "employee" ? (
            <div className="space-y-3">
              {(sp.employeeId ? employees.filter((employee) => employee.id === sp.employeeId) : employees).map((employee) => {
                const employeeJobs = rows.filter((job) => (byJob.get(job.id) ?? []).some((assignment) => assignment.userId === employee.id));
                return (
                  <div key={employee.id} className="co-card overflow-hidden">
                    <div className="border-b border-[var(--co-line-soft)] px-5 py-4">
                      <div className="flex items-center justify-between">
                        <h2 className="font-semibold">
                          {employee.firstName} {employee.lastName}
                        </h2>
                        <span className="text-xs text-[var(--co-muted)]">{employeeJobs.length} jobs</span>
                      </div>
                    </div>
                    <div className="px-5 py-3">
                      {employeeJobs.map((job) => (
                        <Link key={job.id} href={`/jobs/${job.id}`} className="flex items-center gap-3 border-t border-[var(--co-line-soft)] py-3 text-sm first:border-0">
                          <span className="w-24 text-[var(--co-muted)]">{job.scheduledDate}</span>
                          <span className="flex-1 font-medium">
                            {job.customerFirstName} {job.customerLastName}
                          </span>
                          <span className="text-xs text-[var(--co-muted)]">{TYPE_LABELS[job.type] ?? job.type}</span>
                        </Link>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
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
