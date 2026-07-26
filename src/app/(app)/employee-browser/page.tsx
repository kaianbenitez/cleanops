import Link from "next/link";
import { redirect } from "next/navigation";
import { and, desc, eq, gte, isNull, lt, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { companies, customers, jobAssignments, jobs, payrollLines, payrollPeriods, timeEntries, users } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import { payrollWeekRangeForDate } from "@/lib/payroll/periods";
import EmployeeBrowserClient from "./employee-browser-client";
import { formatDisplayDate } from "@/lib/scheduling/dates";

type TimeEntryPreview = {
  id: string;
  jobId: string;
  clockIn: string;
  clockOut: string | null;
  minutesWorked: number | null;
  notes: string | null;
  editedByAdmin?: boolean;
  recordedByAdmin?: boolean;
  scheduledDate: string;
  scheduledStartTime: string | null;
  type: string;
  status: string;
  customerFirstName: string;
  customerLastName: string;
  addressLine1: string | null;
};

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function friendlyPeriod(startDate: string, endDate: string) {
  return `${formatDisplayDate(startDate)} - ${formatDisplayDate(endDate)}`;
}

export default async function EmployeeBrowserPage({ searchParams }: { searchParams: Promise<{ employeeId?: string }> }) {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");
  if (currentUser.role !== "admin") redirect("/dashboard");

  const sp = await searchParams;
  const today = isoDate(new Date());
  const period = payrollWeekRangeForDate(new Date());

  const [employees, allActiveRows] = await Promise.all([
    db
      .select({
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        title: users.title,
        payType: users.payType,
        isActive: users.isActive,
      })
      .from(users)
      .where(and(eq(users.companyId, currentUser.companyId), eq(users.role, "employee")))
      .orderBy(desc(users.isActive), users.firstName, users.lastName),
    db
      .select({
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
      })
      .from(users)
      .where(and(eq(users.companyId, currentUser.companyId), eq(users.role, "employee"), eq(users.isActive, true)))
      .orderBy(users.firstName, users.lastName),
  ]);

  const previewEmployeeId = sp.employeeId && employees.some((employee) => employee.id === sp.employeeId)
    ? sp.employeeId
    : allActiveRows[0]?.id ?? employees[0]?.id ?? null;

  if (!previewEmployeeId) {
    return (
      <div className="mx-auto max-w-xl">
        <div className="co-card p-8 text-center">
          <p className="eyebrow">Employee browser</p>
          <h1 className="mt-2 text-2xl font-semibold">No active employees yet</h1>
          <p className="mt-3 text-sm text-[var(--co-muted)]">
            Add at least one employee before the mobile browser can mirror their day.
          </p>
          <Link href="/employees/new" className="co-button-primary mt-5">
            Add employee
          </Link>
        </div>
      </div>
    );
  }

  const company = await db
    .select({
      name: companies.name,
      settings: companies.settings,
    })
    .from(companies)
    .where(eq(companies.id, currentUser.companyId))
    .limit(1)
    .then((rows) => rows[0] ?? null);

  const [selectedEmployee, todayJobs, upcomingJobs, openEntry, weeklyMinutes, payrollLine, recentTimeEntries] = await Promise.all([
    db
      .select({
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        title: users.title,
        payType: users.payType,
        hourlyRateCents: users.hourlyRateCents,
        isActive: users.isActive,
      })
      .from(users)
      .where(and(eq(users.id, previewEmployeeId), eq(users.companyId, currentUser.companyId)))
      .limit(1)
      .then((rows) => rows[0] ?? null),
    db
      .select({
        role: jobAssignments.role,
        id: jobs.id,
        status: jobs.status,
        type: jobs.type,
        scheduledDate: jobs.scheduledDate,
        scheduledStartTime: jobs.scheduledStartTime,
        estimatedDurationMinutes: jobs.estimatedDurationMinutes,
        customerFirstName: customers.firstName,
        customerLastName: customers.lastName,
        addressLine1: customers.addressLine1,
        city: customers.city,
        state: customers.state,
        accessNotes: customers.gateCodeOrKeyNotes,
      })
      .from(jobAssignments)
      .innerJoin(jobs, eq(jobAssignments.jobId, jobs.id))
      .innerJoin(customers, eq(jobs.customerId, customers.id))
      .where(and(eq(jobAssignments.userId, previewEmployeeId), eq(jobs.companyId, currentUser.companyId), eq(jobs.scheduledDate, today), ne(jobs.status, "cancelled")))
      .orderBy(jobs.scheduledStartTime),
    db
      .select({
        role: jobAssignments.role,
        id: jobs.id,
        status: jobs.status,
        type: jobs.type,
        scheduledDate: jobs.scheduledDate,
        scheduledStartTime: jobs.scheduledStartTime,
        estimatedDurationMinutes: jobs.estimatedDurationMinutes,
        customerFirstName: customers.firstName,
        customerLastName: customers.lastName,
        addressLine1: customers.addressLine1,
        city: customers.city,
        state: customers.state,
        accessNotes: customers.gateCodeOrKeyNotes,
      })
      .from(jobAssignments)
      .innerJoin(jobs, eq(jobAssignments.jobId, jobs.id))
      .innerJoin(customers, eq(jobs.customerId, customers.id))
      .where(and(eq(jobAssignments.userId, previewEmployeeId), eq(jobs.companyId, currentUser.companyId), gte(jobs.scheduledDate, today), ne(jobs.status, "cancelled"), ne(jobs.scheduledDate, today)))
      .orderBy(jobs.scheduledDate, jobs.scheduledStartTime)
      .limit(4),
    db
      .select({
        id: timeEntries.id,
        jobId: timeEntries.jobId,
        clockIn: timeEntries.clockIn,
        clockOut: timeEntries.clockOut,
        minutesWorked: timeEntries.minutesWorked,
        notes: timeEntries.notes,
        scheduledDate: jobs.scheduledDate,
        scheduledStartTime: jobs.scheduledStartTime,
        type: jobs.type,
        status: jobs.status,
        customerFirstName: customers.firstName,
        customerLastName: customers.lastName,
        addressLine1: customers.addressLine1,
      })
      .from(timeEntries)
      .innerJoin(jobs, eq(timeEntries.jobId, jobs.id))
      .innerJoin(customers, eq(jobs.customerId, customers.id))
      .where(and(eq(timeEntries.userId, previewEmployeeId), isNull(timeEntries.clockOut)))
      .orderBy(desc(timeEntries.clockIn))
      .limit(1)
      .then((rows) => rows[0] ?? null),
    db
      .select({
        totalMinutes: sql<number>`coalesce(sum(${timeEntries.minutesWorked}), 0)`,
      })
      .from(timeEntries)
      .where(
        and(
          eq(timeEntries.userId, previewEmployeeId),
          gte(timeEntries.clockIn, new Date(`${period.startDate}T00:00:00.000Z`)),
          lt(timeEntries.clockIn, new Date(`${period.endDate}T23:59:59.999Z`))
        )
      )
      .then((rows) => Number(rows[0]?.totalMinutes ?? 0)),
    db
      .select({
        id: payrollLines.id,
        mileageMiles: payrollLines.mileageMiles,
        mileageRateCents: payrollLines.mileageRateCents,
        mileageCents: payrollLines.mileageCents,
        finalCents: payrollLines.finalCents,
        adjustmentCents: payrollLines.adjustmentCents,
        tipsPaycheckCents: payrollLines.tipsPaycheckCents,
        tipsCashCents: payrollLines.tipsCashCents,
        bonusCents: payrollLines.bonusCents,
        teamLeadBonusCents: payrollLines.teamLeadBonusCents,
        trainerBonusCents: payrollLines.trainerBonusCents,
      })
      .from(payrollPeriods)
      .innerJoin(payrollLines, eq(payrollLines.payrollPeriodId, payrollPeriods.id))
      .where(and(eq(payrollPeriods.companyId, currentUser.companyId), eq(payrollPeriods.startDate, period.startDate), eq(payrollPeriods.endDate, period.endDate), eq(payrollLines.userId, previewEmployeeId)))
      .limit(1)
      .then((rows) => rows[0] ?? null),
    db
      .select({
        id: timeEntries.id,
        jobId: timeEntries.jobId,
        clockIn: timeEntries.clockIn,
        clockOut: timeEntries.clockOut,
        minutesWorked: timeEntries.minutesWorked,
        notes: timeEntries.notes,
        editedByAdmin: timeEntries.editedByAdmin,
        recordedByAdmin: timeEntries.recordedByAdmin,
        scheduledDate: jobs.scheduledDate,
        scheduledStartTime: jobs.scheduledStartTime,
        type: jobs.type,
        status: jobs.status,
        customerFirstName: customers.firstName,
        customerLastName: customers.lastName,
        addressLine1: customers.addressLine1,
      })
      .from(timeEntries)
      .innerJoin(jobs, eq(timeEntries.jobId, jobs.id))
      .innerJoin(customers, eq(jobs.customerId, customers.id))
      .where(eq(timeEntries.userId, previewEmployeeId))
      .orderBy(desc(timeEntries.clockIn))
      .limit(8),
  ]);

  const openEntryPreview: TimeEntryPreview | null = openEntry
    ? {
        ...openEntry,
        clockIn: openEntry.clockIn.toISOString(),
        clockOut: openEntry.clockOut ? openEntry.clockOut.toISOString() : null,
      }
    : null;

  const recentTimeEntryPreviews: TimeEntryPreview[] = recentTimeEntries.map((entry) => ({
    ...entry,
    clockIn: entry.clockIn.toISOString(),
    clockOut: entry.clockOut ? entry.clockOut.toISOString() : null,
  }));

  const hoursThisPeriod = Math.round((weeklyMinutes / 60) * 100) / 100;
  const mileageMiles = payrollLine ? Number(payrollLine.mileageMiles) : 0;
  const mileageRateCents = payrollLine?.mileageRateCents ?? 35;
  const dailyRouteCount = todayJobs.length + upcomingJobs.length;
  const previewLabel = selectedEmployee ? `${selectedEmployee.firstName} ${selectedEmployee.lastName}` : "Employee preview";
  const branding = ((company?.settings as { branding?: { logoUrl?: string | null; brandColor?: string | null; phone?: string | null } } | null)?.branding ?? null) as {
    logoUrl?: string | null;
    brandColor?: string | null;
    phone?: string | null;
  } | null;

  return (
    <div className="mx-auto max-w-[560px] space-y-5">
      <header className="co-card overflow-hidden">
        <div
          className="px-5 py-5 text-white"
          style={{
            background: `linear-gradient(135deg, ${branding?.brandColor ?? "#14211f"}, #1c2f2a)`,
          }}
        >
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-white/10">
                {branding?.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={branding.logoUrl} alt={`${company?.name ?? "Company"} logo`} className="h-full w-full object-contain p-1.5" />
                ) : (
                  <span className="text-sm font-semibold text-white/85">{(company?.name ?? "CO").slice(0, 2).toUpperCase()}</span>
                )}
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/55">Employee browser</p>
                <h1 className="mt-1 text-3xl font-semibold tracking-[-0.05em]">Time and route preview</h1>
              </div>
            </div>
            <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white/80">
              Admin view
            </span>
          </div>
          <p className="mt-4 max-w-md text-sm leading-6 text-white/70">
            Use this phone-style view to mimic how an employee clocks in, tracks time, and logs mileage.
          </p>
        </div>
        <div className="border-t border-[var(--co-line-soft)] bg-[var(--co-surface-muted)]/40 p-4">
          <form method="get" className="grid gap-3">
            <label className="block text-sm">
              <span className="mb-2 block text-xs font-semibold text-[var(--co-muted)]">Preview employee</span>
              <select
                name="employeeId"
                defaultValue={selectedEmployee.id}
                className="co-input w-full"
              >
                {employees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.firstName} {employee.lastName}
                    {employee.isActive ? "" : " (inactive)"}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <Link href="/dashboard" className="co-button-secondary justify-center">
                Back to dashboard
              </Link>
              <Link href="/employees" className="co-button-secondary justify-center">
                Employees
              </Link>
            </div>
            <button type="submit" className="co-button-primary justify-center">
              Open preview
            </button>
          </form>
        </div>
      </header>

      <section className="grid grid-cols-2 gap-3">
        <MetricCard label="Today" value={String(todayJobs.length)} hint="scheduled jobs" />
        <MetricCard label="Open shift" value={openEntry ? "On" : "Off"} hint={openEntry ? "clocked in" : "not clocked in"} />
        <MetricCard label="This period" value={`${hoursThisPeriod.toFixed(2)}h`} hint={`${period.startDate} to ${period.endDate}`} />
        <MetricCard label="Mileage" value={`${mileageMiles.toFixed(1)} mi`} hint={`$${(mileageRateCents / 100).toFixed(2)}/mi`} />
      </section>

      <EmployeeBrowserClient
        employeeId={selectedEmployee.id}
        employeeName={previewLabel}
        currentPeriodLabel={friendlyPeriod(period.startDate, period.endDate)}
        mileageMiles={mileageMiles}
        mileageRateCents={mileageRateCents}
        todayJobs={todayJobs}
        upcomingJobs={upcomingJobs}
        openEntry={openEntryPreview}
        recentTimeEntries={recentTimeEntryPreviews}
        weeklyHours={hoursThisPeriod}
        weeklyMinutes={weeklyMinutes}
        routeCount={dailyRouteCount}
        companyLogoUrl={branding?.logoUrl ?? null}
        companyBrandColor={branding?.brandColor ?? "#14211f"}
        officePhone={branding?.phone ?? null}
      />
    </div>
  );
}

function MetricCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="co-card p-4">
      <p className="text-xs font-medium uppercase tracking-[0.1em] text-[var(--co-muted)]">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-[-0.04em]">{value}</p>
      <p className="mt-1 text-xs text-[var(--co-muted)]">{hint}</p>
    </div>
  );
}
