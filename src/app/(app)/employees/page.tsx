import Link from "next/link";
import { redirect } from "next/navigation";
import { and, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { customers, jobAssignments, jobs, payrollLines, payrollPeriods, timeEntries, users } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import { isFieldEligible } from "@/lib/auth/field-staff";
import { createAdminClient } from "@/lib/supabase/admin";
import EmployeeDirectory, { type EmployeeDirectoryRow } from "./directory-client";
import AdminAccessPanel from "./admin-access-panel";

const TYPE_LABELS: Record<string, string> = {
  first_clean: "First clean",
  recurring: "Recurring",
  one_time: "One-time",
  deep_clean: "Deep clean",
  move_out: "Move in / out",
};

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function weekStartISO() {
  const date = new Date();
  const day = date.getUTCDay();
  date.setUTCDate(date.getUTCDate() + (day === 0 ? -6 : 1 - day));
  date.setUTCHours(0, 0, 0, 0);
  return isoDate(date);
}

function addDays(dateString: string, days: number) {
  const date = new Date(`${dateString}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return isoDate(date);
}

export default async function EmployeesPage() {
  const admin = await getCurrentUser();
  if (!admin) redirect("/login");
  if (admin.role !== "admin") redirect("/my-day");

  const today = isoDate(new Date());
  const periodStart = weekStartISO();
  const periodEnd = addDays(periodStart, 6);

  const [employeeRows, todayJobs, weeklyTime, weeklyPayroll] = await Promise.all([
    db
      .select({
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        title: users.title,
        isActive: users.isActive,
        payType: users.payType,
        profilePhotoUrl: users.profilePhotoUrl,
      })
      .from(users)
      .where(and(eq(users.companyId, admin.companyId), isFieldEligible))
      .orderBy(sql`${users.isActive} desc`, users.firstName, users.lastName),
    db
      .select({
        userId: jobAssignments.userId,
        jobId: jobs.id,
        scheduledStartTime: jobs.scheduledStartTime,
        type: jobs.type,
        customerFirstName: customers.firstName,
        customerLastName: customers.lastName,
        city: customers.city,
      })
      .from(jobAssignments)
      .innerJoin(jobs, eq(jobAssignments.jobId, jobs.id))
      .innerJoin(customers, eq(jobs.customerId, customers.id))
      .where(and(eq(jobs.companyId, admin.companyId), eq(jobs.scheduledDate, today))),
    db
      .select({ userId: timeEntries.userId, minutes: sql<number>`coalesce(sum(${timeEntries.minutesWorked}), 0)` })
      .from(timeEntries)
      .innerJoin(jobs, eq(timeEntries.jobId, jobs.id))
      .where(and(eq(jobs.companyId, admin.companyId), gte(jobs.scheduledDate, periodStart), lte(jobs.scheduledDate, periodEnd)))
      .groupBy(timeEntries.userId),
    db
      .select({
        userId: payrollLines.userId,
        mileageMiles: payrollLines.mileageMiles,
        tipsCents: sql<number>`(${payrollLines.tipsPaycheckCents} + ${payrollLines.tipsCashCents})`,
        bonusCents: sql<number>`(${payrollLines.bonusCents} + ${payrollLines.teamLeadBonusCents} + ${payrollLines.trainerBonusCents})`,
      })
      .from(payrollLines)
      .innerJoin(payrollPeriods, eq(payrollLines.payrollPeriodId, payrollPeriods.id))
      .where(and(eq(payrollPeriods.companyId, admin.companyId), eq(payrollPeriods.startDate, periodStart), eq(payrollPeriods.endDate, periodEnd))),
  ]);

  const jobsByEmployee = new Map<string, typeof todayJobs>();
  for (const job of todayJobs) {
    const list = jobsByEmployee.get(job.userId) ?? [];
    list.push(job);
    jobsByEmployee.set(job.userId, list);
  }

  const timeByEmployee = new Map(weeklyTime.map((row) => [row.userId, Number(row.minutes ?? 0) / 60]));
  const payrollByEmployee = new Map(weeklyPayroll.map((row) => [row.userId, row]));

  const photoPaths = employeeRows.filter((employee) => employee.profilePhotoUrl).map((employee) => employee.profilePhotoUrl as string);
  const photoUrlByPath = new Map<string, string>();
  if (photoPaths.length > 0) {
    const { data: signedUrls } = await createAdminClient().storage.from("employee-photos").createSignedUrls(photoPaths, 60 * 60);
    for (const signed of signedUrls ?? []) {
      if (signed.signedUrl) photoUrlByPath.set(signed.path ?? "", signed.signedUrl);
    }
  }

  const rows: EmployeeDirectoryRow[] = employeeRows.map((employee) => {
    const schedule = jobsByEmployee.get(employee.id) ?? [];
    const payroll = payrollByEmployee.get(employee.id);
    const hours = timeByEmployee.get(employee.id) ?? 0;
    return {
      id: employee.id,
      name: `${employee.firstName} ${employee.lastName}`,
      initials: `${employee.firstName[0] ?? ""}${employee.lastName[0] ?? ""}`.toUpperCase(),
      photoUrl: employee.profilePhotoUrl ? (photoUrlByPath.get(employee.profilePhotoUrl) ?? null) : null,
      title: employee.title ?? (employee.payType === "commission_jth" ? "Cleaning technician" : "Team member"),
      isActive: employee.isActive,
      status: schedule.length > 0 ? "Scheduled" : "Available",
      todayJobs: schedule.map((job) => ({
        id: job.jobId,
        time: job.scheduledStartTime?.slice(0, 5) ?? "Time not set",
        customer: `${job.customerFirstName} ${job.customerLastName}`,
        type: TYPE_LABELS[job.type] ?? job.type,
        city: job.city ?? "Location not set",
      })),
      hoursThisWeek: hours,
      mileageMiles: Number(payroll?.mileageMiles ?? 0),
      tipsCents: Number(payroll?.tipsCents ?? 0),
      bonusCents: Number(payroll?.bonusCents ?? 0),
    };
  });

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="eyebrow">People and payroll</p>
          <h1 className="page-title">Employees</h1>
          <p className="page-subtitle">Keep track of availability, hours, and team performance.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/employees/new" className="co-button-primary">
            + Add employee
          </Link>
          <Link href="/payroll" className="co-button-secondary">
            Review payroll
          </Link>
        </div>
      </header>

      <AdminAccessPanel />

      <EmployeeDirectory rows={rows} />
    </div>
  );
}
