import Link from "next/link";
import { redirect } from "next/navigation";
import { and, eq, gte, ilike, inArray, isNull, lte } from "drizzle-orm";
import { db } from "@/db";
import { customers, jobAssignments, jobTypeEnum, jobs, recurringSeries, users } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import { addDays, formatDayLabel, startOfWeek, toISODate } from "@/lib/scheduling/dates";
import FilterBar from "./filter-bar";
import StaffBoard from "./staff-board";
import WeekBoard from "./week-board";
import MonthBoard from "./month-board";
import DatePicker from "./date-picker";

type SearchParams = {
  view?: string;
  week?: string;
  day?: string;
  month?: string;
  employeeId?: string;
  type?: string;
  recurrence?: string;
  status?: string;
  zip?: string;
  assignment?: string;
};

export type CalendarEmployee = { id: string; firstName: string; lastName: string };

export type CalendarJob = {
  id: string;
  type: string;
  status: string;
  scheduledDate: string;
  scheduledStartTime: string | null;
  estimatedDurationMinutes: number | null;
  priceCents: number;
  recurringSeriesId: string | null;
  recurrenceFrequency: string | null;
  customerFirstName: string;
  customerLastName: string;
  companyName: string | null;
  clientType: string;
  customerZip: string | null;
  customerCity: string | null;
  customerAddress: string | null;
  assignedUserIds: string[];
  updatedAt: Date;
};

export type CalendarActivity = { id: string; tone: "success" | "warning" | "info"; title: string; detail: string };

function query(params: SearchParams) {
  const result = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => value && result.set(key, value));
  const text = result.toString();
  return text ? `?${text}` : "";
}

function monthBounds(date: Date) {
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
  return { start, end };
}

export default async function CalendarPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const admin = await getCurrentUser();
  if (!admin) redirect("/login");
  if (admin.role !== "admin") redirect("/my-day");

  const sp = await searchParams;
  const view = sp.view === "week" || sp.view === "month" ? sp.view : "staff";
  const today = new Date();
  const dayAnchor = sp.day ? new Date(`${sp.day}T00:00:00.000Z`) : today;
  const weekStart = startOfWeek(sp.week ? new Date(`${sp.week}T00:00:00.000Z`) : today);
  const weekDays = Array.from({ length: 5 }, (_, index) => addDays(weekStart, index + 1));
  const monthAnchor = sp.month ? new Date(`${sp.month}-01T00:00:00.000Z`) : new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  const month = monthBounds(monthAnchor);
  const days = view === "staff" ? [dayAnchor] : view === "month" ? [] : weekDays;
  const start = view === "month" ? toISODate(month.start) : toISODate(days[0]);
  const end = view === "month" ? toISODate(month.end) : toISODate(days[days.length - 1]);
  const todayIso = toISODate(today);

  const employeesQuery = db
    .select({ id: users.id, firstName: users.firstName, lastName: users.lastName })
    .from(users)
    .where(and(eq(users.companyId, admin.companyId), eq(users.role, "employee"), eq(users.isActive, true)))
    .orderBy(users.firstName);

  const conditions = [eq(jobs.companyId, admin.companyId), gte(jobs.scheduledDate, start), lte(jobs.scheduledDate, end)];
  if (sp.type && (jobTypeEnum as readonly string[]).includes(sp.type)) conditions.push(eq(jobs.type, sp.type as typeof jobs.type.enumValues[number]));
  if (sp.status) conditions.push(eq(jobs.status, sp.status as typeof jobs.status.enumValues[number]));
  if (sp.zip) conditions.push(ilike(customers.zip, `${sp.zip}%`));
  if (sp.recurrence === "none") conditions.push(isNull(recurringSeries.id));
  if (sp.recurrence && sp.recurrence !== "none") conditions.push(eq(recurringSeries.frequency, sp.recurrence as typeof recurringSeries.frequency.enumValues[number]));

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
      recurrenceFrequency: recurringSeries.frequency,
      customerFirstName: customers.firstName,
      customerLastName: customers.lastName,
      companyName: customers.companyName,
      clientType: customers.clientType,
      customerZip: customers.zip,
      customerCity: customers.city,
      customerAddress: customers.addressLine1,
      updatedAt: jobs.updatedAt,
    })
    .from(jobs)
    .innerJoin(customers, eq(jobs.customerId, customers.id))
    .leftJoin(recurringSeries, eq(jobs.recurringSeriesId, recurringSeries.id));

  const rowsQuery = sp.employeeId
    ? base.innerJoin(jobAssignments, and(eq(jobAssignments.jobId, jobs.id), eq(jobAssignments.userId, sp.employeeId))).where(and(...conditions)).orderBy(jobs.scheduledDate, jobs.scheduledStartTime)
    : base.where(and(...conditions)).orderBy(jobs.scheduledDate, jobs.scheduledStartTime);

  const [employees, rows] = (await Promise.all([employeesQuery, rowsQuery])) as [CalendarEmployee[], Omit<CalendarJob, "assignedUserIds">[]];

  const assignments = rows.length
    ? await db.select({ jobId: jobAssignments.jobId, userId: users.id }).from(jobAssignments).innerJoin(users, eq(jobAssignments.userId, users.id)).where(inArray(jobAssignments.jobId, rows.map((row) => row.id)))
    : [];
  const byJob = new Map<string, string[]>();
  assignments.forEach((assignment) => byJob.set(assignment.jobId, [...(byJob.get(assignment.jobId) ?? []), assignment.userId]));
  const jobsWithAssignments: CalendarJob[] = rows.map((row) => ({ ...row, assignedUserIds: byJob.get(row.id) ?? [] }));
  const displayedJobs = sp.assignment === "unassigned" ? jobsWithAssignments.filter((job) => !job.assignedUserIds.length) : jobsWithAssignments;

  const filterParams: SearchParams = { view: sp.view, week: sp.week, day: sp.day, month: sp.month, employeeId: sp.employeeId, type: sp.type, recurrence: sp.recurrence, status: sp.status, zip: sp.zip, assignment: sp.assignment };
  const previousDate = view === "month" ? new Date(Date.UTC(monthAnchor.getUTCFullYear(), monthAnchor.getUTCMonth() - 1, 1)) : view === "staff" ? addDays(dayAnchor, -1) : addDays(weekStart, -7);
  const nextDate = view === "month" ? new Date(Date.UTC(monthAnchor.getUTCFullYear(), monthAnchor.getUTCMonth() + 1, 1)) : view === "staff" ? addDays(dayAnchor, 1) : addDays(weekStart, 7);
  const prev = query({ ...filterParams, ...(view === "month" ? { month: toISODate(previousDate).slice(0, 7) } : view === "staff" ? { day: toISODate(previousDate) } : { week: toISODate(previousDate) }) });
  const next = query({ ...filterParams, ...(view === "month" ? { month: toISODate(nextDate).slice(0, 7) } : view === "staff" ? { day: toISODate(nextDate) } : { week: toISODate(nextDate) }) });
  const todayQuery = query({ ...filterParams, ...(view === "month" ? { month: todayIso.slice(0, 7) } : view === "staff" ? { day: todayIso } : { week: toISODate(startOfWeek(today)) }) });

  const activities: CalendarActivity[] = [...displayedJobs].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()).slice(0, 5).map((job) => ({ id: job.id, tone: job.status === "completed" ? "success" : job.status === "in_progress" ? "info" : "warning", title: job.status === "completed" ? `Job completed - ${job.companyName || `${job.customerFirstName} ${job.customerLastName}`}` : job.status === "in_progress" ? `Job started - ${job.companyName || `${job.customerFirstName} ${job.customerLastName}`}` : `Schedule updated - ${job.companyName || `${job.customerFirstName} ${job.customerLastName}`}`, detail: `${job.customerCity ?? "No city"} - ${job.customerZip ?? "No ZIP"}` }));
  const currentDate = view === "month" ? monthAnchor : view === "staff" ? dayAnchor : weekStart;
  const dateLabel = view === "month" ? monthAnchor.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" }) : view === "staff" ? formatDayLabel(dayAnchor) : `${weekDays[0].toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })} to ${weekDays[4].toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}`;
  return (
    <div className="-mx-3 -mt-4 min-h-[calc(100dvh-64px)] bg-[var(--co-bg)] sm:-mx-4 lg:-mx-5 xl:-mx-6 lg:-mt-5">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--co-line-soft)] bg-[var(--co-surface)] px-4 py-3 lg:px-6">
        <div className="flex flex-wrap items-center gap-2"><DatePicker view={view} value={currentDate} label={dateLabel} /><Link href={`/calendar${prev}`} className="co-button-secondary" aria-label="Previous period">Previous</Link><Link href={`/calendar${todayQuery}`} className="co-button-secondary">Today</Link><Link href={`/calendar${next}`} className="co-button-secondary" aria-label="Next period">Next</Link></div>
      </header>

      <FilterBar employees={employees} />

      <main className="p-3 sm:p-4 lg:p-5">
        {view === "week" ? <WeekBoard days={weekDays.map((day) => ({ iso: toISODate(day), label: formatDayLabel(day), dayNum: day.getDate(), isToday: toISODate(day) === todayIso }))} employees={employees} jobs={displayedJobs} /> : null}
        {view === "staff" ? <StaffBoard dayIso={toISODate(dayAnchor)} dayLabel={formatDayLabel(dayAnchor)} employees={employees} jobs={displayedJobs} activities={activities} unassignedJobs={jobsWithAssignments.filter((job) => !job.assignedUserIds.length)} /> : null}
        {view === "month" ? <MonthBoard month={monthAnchor} jobs={displayedJobs} /> : null}
      </main>
    </div>
  );
}
