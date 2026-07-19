import Link from "next/link";
import { redirect } from "next/navigation";
import { and, desc, eq, gte, inArray, isNotNull, lt, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { companies, customers, ghlSyncLog, invoices, jobAssignments, jobs, quotes, timeEntries, users } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import TechnicianRoutePreview, { type TechnicianRoute } from "./technician-route-preview";

type SearchParams = { from?: string; to?: string };

type RouteJob = {
  id: string;
  firstName: string;
  lastName: string;
  address: string;
  city: string;
  zip: string;
  time: string;
};

type ScheduleRow = {
  id: string;
  type: string;
  status: string;
  scheduledDate: string;
  scheduledStartTime: string | null;
  estimatedDurationMinutes: number | null;
  customerFirstName: string;
  customerLastName: string;
  addressLine1: string | null;
  city: string | null;
  zip: string | null;
};

function iso(date: Date) {
  return date.toISOString().slice(0, 10);
}

function dayStart(value: string | undefined, fallback: Date) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00.000Z`) : fallback;
}

function formatMoney(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function formatTime(value: string | null) {
  if (!value) return "Time not set";
  const [hours, minutes] = value.split(":").map((part) => Number(part || 0));
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function formatDateTime(value: string | Date | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function formatDay(date: Date) {
  return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function pillClass(status: string) {
  return status === "completed"
    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
    : status === "in_progress"
      ? "border-amber-200 bg-amber-50 text-amber-700"
      : status === "cancelled"
        ? "border-slate-200 bg-slate-50 text-slate-400"
        : "border-[var(--co-line-soft)] bg-[var(--co-surface-muted)] text-[var(--co-muted)]";
}

function sectionCard({
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

export default async function DashboardPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const admin = await getCurrentUser();
  if (!admin) redirect("/login");
  if (admin.role !== "admin") redirect("/my-day");

  const sp = await searchParams;
  const today = new Date();
  const todayText = iso(today);
  const rangeFrom = dayStart(sp.from, new Date(today.getTime() - 30 * 86400000));
  const rangeTo = dayStart(sp.to, today);
  const rangeToExclusive = new Date(rangeTo.getTime() + 86400000);
  const weekStart = new Date(today);
  const weekDay = today.getUTCDay();
  weekStart.setUTCDate(today.getUTCDate() - (weekDay === 0 ? 6 : weekDay - 1));
  const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));

  const [
    leadCount,
    quoteSentCount,
    acceptedCount,
    recurringCount,
    activeClientCount,
    revenueRows,
    overdueRows,
    todayRows,
    failedSyncRows,
    customersNeedingAttention,
    companyRows,
    employees,
  ] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)` })
      .from(customers)
      .where(and(eq(customers.companyId, admin.companyId), eq(customers.status, "lead"), gte(customers.createdAt, rangeFrom), lt(customers.createdAt, rangeToExclusive))),
    db
      .select({ count: sql<number>`count(*)` })
      .from(quotes)
      .where(and(eq(quotes.companyId, admin.companyId), ne(quotes.status, "draft"), gte(quotes.createdAt, rangeFrom), lt(quotes.createdAt, rangeToExclusive))),
    db
      .select({ count: sql<number>`count(*)` })
      .from(quotes)
      .where(and(eq(quotes.companyId, admin.companyId), eq(quotes.status, "accepted"), gte(quotes.acceptedAt, rangeFrom), lt(quotes.acceptedAt, rangeToExclusive))),
    db
      .select({ count: sql<number>`count(*)` })
      .from(customers)
      .where(and(eq(customers.companyId, admin.companyId), ne(customers.recurrence, "none"), isNotNull(customers.recurrence), gte(customers.updatedAt, monthStart))),
    db
      .select({ count: sql<number>`count(*)` })
      .from(customers)
      .where(and(eq(customers.companyId, admin.companyId), eq(customers.status, "client"))),
    db
      .select({
        amountPaidCents: invoices.amountPaidCents,
        paidAt: invoices.paidAt,
      })
      .from(invoices)
      .where(and(eq(invoices.companyId, admin.companyId), eq(invoices.status, "paid"), gte(invoices.paidAt, weekStart))),
    db
      .select({
        id: invoices.id,
        customerId: invoices.customerId,
        totalCents: invoices.totalCents,
        amountPaidCents: invoices.amountPaidCents,
        createdAt: invoices.createdAt,
      })
      .from(invoices)
      .where(and(eq(invoices.companyId, admin.companyId), eq(invoices.status, "sent"), lt(invoices.createdAt, new Date(today.getTime() - 14 * 86400000))))
      .orderBy(desc(invoices.createdAt)),
    db
      .select({
        id: jobs.id,
        type: jobs.type,
        status: jobs.status,
        scheduledDate: jobs.scheduledDate,
        scheduledStartTime: jobs.scheduledStartTime,
        estimatedDurationMinutes: jobs.estimatedDurationMinutes,
        customerFirstName: customers.firstName,
        customerLastName: customers.lastName,
        addressLine1: customers.addressLine1,
        city: customers.city,
        zip: customers.zip,
      })
      .from(jobs)
      .innerJoin(customers, eq(jobs.customerId, customers.id))
      .where(and(eq(jobs.companyId, admin.companyId), eq(jobs.scheduledDate, todayText)))
      .orderBy(jobs.scheduledStartTime, jobs.createdAt),
    db
      .select({ id: ghlSyncLog.id })
      .from(ghlSyncLog)
      .where(and(eq(ghlSyncLog.companyId, admin.companyId), ne(ghlSyncLog.status, "ok"))),
    db
      .select({
        id: customers.id,
        paymentMethod: customers.paymentMethod,
        addressLine1: customers.addressLine1,
        importantToCustomer: customers.importantToCustomer,
        operationalNotes: customers.operationalNotes,
        gateCodeOrKeyNotes: customers.gateCodeOrKeyNotes,
      })
      .from(customers)
      .where(eq(customers.companyId, admin.companyId)),
    db
      .select({ settings: companies.settings })
      .from(companies)
      .where(eq(companies.id, admin.companyId))
      .limit(1),
    db
      .select({
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
      })
      .from(users)
      .where(and(eq(users.companyId, admin.companyId), eq(users.role, "employee"), eq(users.isActive, true)))
      .orderBy(users.firstName),
  ]);

  const invoiceIds = overdueRows.map((invoice) => invoice.id);
  const overdueCustomerRows = invoiceIds.length
    ? await db
        .select({
          invoiceId: invoices.id,
          customerFirstName: customers.firstName,
          customerLastName: customers.lastName,
        })
        .from(invoices)
        .innerJoin(customers, eq(invoices.customerId, customers.id))
        .where(inArray(invoices.id, invoiceIds))
    : [];
  const overdueByInvoice = new Map(overdueCustomerRows.map((row) => [row.invoiceId, `${row.customerFirstName} ${row.customerLastName}`]));

  const completedIds = todayRows.filter((job) => job.status === "completed").map((job) => job.id);
  const assignmentRows = todayRows.length
    ? await db
        .select({
          jobId: jobAssignments.jobId,
          userId: users.id,
          firstName: users.firstName,
          lastName: users.lastName,
        })
        .from(jobAssignments)
        .innerJoin(users, eq(jobAssignments.userId, users.id))
        .where(inArray(jobAssignments.jobId, todayRows.map((job) => job.id)))
    : [];

  const assignmentsByJob = new Map<string, typeof assignmentRows>();
  assignmentRows.forEach((assignment) => {
    assignmentsByJob.set(assignment.jobId, [...(assignmentsByJob.get(assignment.jobId) ?? []), assignment]);
  });

  const timeRows = completedIds.length ? await db.select({ jobId: timeEntries.jobId }).from(timeEntries).where(inArray(timeEntries.jobId, completedIds)) : [];
  const invoicedRows = completedIds.length ? await db.select({ jobId: invoices.jobId }).from(invoices).where(inArray(invoices.jobId, completedIds)) : [];
  const timeJobIds = new Set(timeRows.map((row) => row.jobId));
  const invoicedJobIds = new Set(invoicedRows.map((row) => row.jobId));

  const attention = {
    unassigned: todayRows.filter((job) => !(assignmentsByJob.get(job.id) ?? []).length).length,
    missingHours: completedIds.filter((jobId) => !timeJobIds.has(jobId)).length,
    awaitingInvoice: completedIds.filter((jobId) => !invoicedJobIds.has(jobId)).length,
    paymentMethod: customersNeedingAttention.filter((customer) => !customer.paymentMethod?.trim()).length,
    incompleteNotes: customersNeedingAttention.filter(
      (customer) => !customer.addressLine1 || !customer.importantToCustomer?.trim() || !customer.operationalNotes?.trim() || !customer.gateCodeOrKeyNotes?.trim()
    ).length,
    sync: failedSyncRows.length,
  };

  const attentionItems = [
    { label: "Unassigned jobs", value: attention.unassigned, href: "/jobs?unassigned=yes", action: "Assign now", detail: "Today's schedule" },
    { label: "Jobs without hours", value: attention.missingHours, href: "/jobs?status=completed&missingHours=yes", action: "Review hours", detail: "Completed today" },
    { label: "Awaiting invoicing", value: attention.awaitingInvoice, href: "/jobs?status=completed", action: "Create invoices", detail: "Completed today" },
    { label: "Payment method missing", value: attention.paymentMethod, href: "/customers?payment=missing", action: "Open customers", detail: "Customer records" },
    { label: "Incomplete house notes", value: attention.incompleteNotes, href: "/customers?attention=yes", action: "Complete notes", detail: "Customer records" },
    { label: "Failed GHL / Square syncs", value: attention.sync, href: "/sync-issues", action: "View failures", detail: "Needs investigation" },
  ];

  const sent = Number(quoteSentCount[0]?.count ?? 0);
  const accepted = Number(acceptedCount[0]?.count ?? 0);
  const conversion = sent ? Math.round((accepted / sent) * 100) : 0;
  const overdueTotal = overdueRows.reduce((sum, invoice) => sum + Math.max(invoice.totalCents - invoice.amountPaidCents, 0), 0);
  const weeklyRevenue = revenueRows.reduce((sum, row) => sum + row.amountPaidCents, 0);
  const revenueDays = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(weekStart);
    date.setUTCDate(weekStart.getUTCDate() + index);
    const key = iso(date);
    const amount = revenueRows
      .filter((row) => row.paidAt && iso(new Date(row.paidAt)) === key)
      .reduce((sum, row) => sum + row.amountPaidCents, 0);
    return {
      key,
      label: date.toLocaleDateString("en-US", { weekday: "short" }),
      amount,
    };
  });
  const maxRevenueDay = Math.max(...revenueDays.map((day) => day.amount), 1);

  const inventory = Array.isArray((companyRows[0]?.settings as { inventory?: unknown } | null)?.inventory)
    ? (
        companyRows[0]?.settings as {
          inventory: Array<{ name: string; onHand: number; reorderAt: number; unitCostCents: number }>;
        }
      ).inventory
    : [];
  const inventoryValue = inventory.reduce((sum, item) => sum + item.onHand * item.unitCostCents, 0);
  const lowStock = inventory.filter((item) => item.onHand <= item.reorderAt).length;

  const routeTechnicians: TechnicianRoute[] = employees.map((employee) => {
    const employeeJobs = todayRows.filter((job) => (assignmentsByJob.get(job.id) ?? []).some((assignment) => assignment.userId === employee.id));
    return {
      employeeId: employee.id,
      employeeName: `${employee.firstName} ${employee.lastName}`,
      jobs: employeeJobs.map((job) => ({
        id: job.id,
        firstName: job.customerFirstName,
        lastName: job.customerLastName,
        address: job.addressLine1 ?? "Address not set",
        city: job.city ?? "",
        zip: job.zip ?? "",
        time: formatTime(job.scheduledStartTime),
      })),
    };
  });

  const dateLabel = today.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  const query = (from: string, to: string) => `/dashboard?from=${from}&to=${to}`;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="eyebrow">{dateLabel}</p>
          <h1 className="page-title mt-2">Good morning, {admin.firstName}.</h1>
          <p className="page-subtitle">Your operations board for leads, jobs, cash, routing, and follow-up work.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/jobs/new" className="co-button-primary">
            + New job
          </Link>
          <Link href="/quotes/new" className="co-button-secondary">
            + New quote
          </Link>
        </div>
      </header>

      <section className="co-card flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <p className="eyebrow">Performance window</p>
          <p className="mt-1 text-sm text-[var(--co-muted)]">These dates apply to the performance metrics below.</p>
        </div>
        <form className="flex flex-wrap items-center gap-2 text-sm">
          <label className="flex items-center gap-2 text-xs font-semibold text-[var(--co-muted)]">
            From
            <input type="date" name="from" defaultValue={iso(rangeFrom)} className="co-input" aria-label="Performance start date" />
          </label>
          <span className="text-[var(--co-muted)]">to</span>
          <label className="flex items-center gap-2 text-xs font-semibold text-[var(--co-muted)]">
            Through
            <input type="date" name="to" defaultValue={iso(rangeTo)} className="co-input" aria-label="Performance end date" />
          </label>
          <button className="co-button-secondary" type="submit">
            Apply dates
          </button>
          <Link href="/dashboard" className="text-xs font-medium text-[var(--co-evergreen)] hover:underline">
            Reset
          </Link>
        </form>
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.35fr_0.65fr]">
        <div className="space-y-5">
          {sectionCard({
            eyebrow: "Operations",
            title: "Today's schedule",
            description: "Start here and move from scheduled jobs to completed, invoiced, and paid.",
            children: (
              <>
                <div className="space-y-2 md:hidden">
                  {todayRows.length === 0 ? (
                    <p className="rounded-xl bg-[var(--co-surface-muted)] px-4 py-6 text-center text-sm text-[var(--co-muted)]">No jobs scheduled today.</p>
                  ) : (
                    todayRows.map((job) => {
                      const assigned = assignmentsByJob.get(job.id) ?? [];
                      const assignedLabel = assigned.length ? assigned.map((person) => `${person.firstName} ${person.lastName}`).join(", ") : "Unassigned";
                      return (
                        <Link key={job.id} href={`/jobs/${job.id}`} className="block rounded-xl border border-[var(--co-line-soft)] px-4 py-3 hover:bg-[var(--co-surface-muted)]">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-xs font-semibold text-[var(--co-muted)]">{formatTime(job.scheduledStartTime)}</p>
                              <p className="mt-1 font-semibold text-[var(--co-ink)]">{job.customerFirstName} {job.customerLastName}</p>
                            </div>
                            <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${pillClass(job.status)}`}>{job.status.replaceAll("_", " ")}</span>
                          </div>
                          <p className="mt-2 text-xs capitalize text-[var(--co-muted)]">{job.type.replaceAll("_", " ")} · {assignedLabel}</p>
                          <p className="mt-1 text-xs text-[var(--co-muted)]">
                            {job.addressLine1 ?? "No address"}{job.city ? `, ${job.city}` : ""}{job.zip ? ` ${job.zip}` : ""}
                          </p>
                        </Link>
                      );
                    })
                  )}
                </div>

                <div className="hidden overflow-x-auto md:block">
                  <table className="w-full min-w-[760px] text-left text-sm">
                    <thead className="bg-[var(--co-surface-muted)] text-xs uppercase tracking-[0.08em] text-[var(--co-muted)]">
                      <tr>
                        <th className="px-4 py-3">Time</th>
                        <th className="px-4 py-3">Customer</th>
                        <th className="px-4 py-3">Cleaning type</th>
                        <th className="px-4 py-3">Location</th>
                        <th className="px-4 py-3">Assigned to</th>
                        <th className="px-4 py-3">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--co-line-soft)]">
                      {todayRows.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-4 py-8 text-center text-sm text-[var(--co-muted)]">
                            No jobs scheduled today.
                          </td>
                        </tr>
                      ) : (
                        todayRows.map((job) => {
                          const assigned = assignmentsByJob.get(job.id) ?? [];
                          const assignedLabel = assigned.length ? assigned.map((person) => `${person.firstName} ${person.lastName}`).join(", ") : "Unassigned";
                          return (
                            <tr key={job.id} className="hover:bg-[var(--co-surface-muted)]/30">
                              <td className="px-4 py-4 text-[var(--co-muted)]">{formatTime(job.scheduledStartTime)}</td>
                              <td className="px-4 py-4">
                                <Link href={`/jobs/${job.id}`} className="font-medium text-[var(--co-ink)] hover:underline">
                                  {job.customerFirstName} {job.customerLastName}
                                </Link>
                              </td>
                              <td className="px-4 py-4 text-[var(--co-muted)]">{job.type.replaceAll("_", " ")}</td>
                              <td className="px-4 py-4 text-[var(--co-muted)]">
                                {job.addressLine1 ?? "No address"}
                                {job.city ? `, ${job.city}` : ""}
                              </td>
                              <td className="px-4 py-4 text-[var(--co-muted)]">{assignedLabel}</td>
                              <td className="px-4 py-4">
                                <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${pillClass(job.status)}`}>{job.status.replaceAll("_", " ")}</span>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
                <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl border border-[var(--co-line-soft)] bg-[var(--co-surface-muted)]/35 px-4 py-3 text-sm">
                  <span className="text-[var(--co-muted)]">Review the live calendar when you need to change the order or assign someone new.</span>
                  <Link href="/calendar" className="font-medium text-[var(--co-evergreen)] hover:underline">
                    Open calendar
                  </Link>
                </div>
              </>
            ),
          })}

          {sectionCard({
            eyebrow: "Attention required",
            title: "Keep the board clean",
            description: "Open an item to resolve the next operational blocker.",
            children: (
              <div className="space-y-2">
                {attentionItems.map((item) => (
                  <Link
                    key={item.label}
                    href={item.href}
                    className="flex items-center gap-3 rounded-xl border border-[var(--co-line-soft)] px-3 py-3 hover:bg-[var(--co-surface-muted)]"
                    aria-label={`${item.label}: ${item.value}. ${item.action}`}
                  >
                    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${item.value > 0 ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`} aria-hidden="true">
                      {item.value}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-[var(--co-ink)]">{item.label}</span>
                      <span className="mt-0.5 block text-xs text-[var(--co-muted)]">{item.detail}</span>
                    </span>
                    <span className="shrink-0 text-xs font-semibold text-[var(--co-evergreen)]">{item.value > 0 ? item.action : "Clear"}</span>
                  </Link>
                ))}
              </div>
            ),
          })}
        </div>

        <div className="space-y-5">
          {sectionCard({
            eyebrow: "Cash flow",
            title: "Weekly revenue",
            description: `Payments received since ${formatDay(weekStart)}.`,
            children: (
              <>
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <p className="text-4xl font-semibold tracking-[-0.05em]">{formatMoney(weeklyRevenue)}</p>
                    <p className="mt-1 text-xs text-[var(--co-muted)]">{revenueRows.length} paid invoice{revenueRows.length === 1 ? "" : "s"}</p>
                  </div>
                  <span className="rounded-full bg-[var(--co-surface-muted)] px-2.5 py-1 text-xs font-medium text-[var(--co-evergreen)]">Mon–Sun</span>
                </div>
                <ol className="mt-6 flex h-36 items-end gap-2" aria-label="Revenue received by day this week">
                  {revenueDays.map((day) => (
                    <li key={day.key} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-2">
                      <span className="sr-only">{day.label}: {formatMoney(day.amount)}</span>
                      <span
                        className={`w-full rounded-t-lg ${day.amount > 0 ? "bg-[var(--co-evergreen)]" : "bg-[var(--co-surface-muted)]"}`}
                        style={{ height: `${Math.max((day.amount / maxRevenueDay) * 100, day.amount > 0 ? 8 : 3)}%` }}
                        title={`${day.label}: ${formatMoney(day.amount)}`}
                      />
                      <span className="text-[11px] font-medium text-[var(--co-muted)]">{day.label}</span>
                    </li>
                  ))}
                </ol>
                <Link href="/invoices" className="mt-4 block text-sm font-medium text-[var(--co-evergreen)] hover:underline">
                  View invoices
                </Link>
              </>
            ),
          })}

          {sectionCard({
            eyebrow: "Collections",
            title: "Overdue invoices",
            description: "Open balances that need follow-up.",
            children: (
              <>
                <div className="flex items-center justify-between">
                  <p className="text-2xl font-semibold text-rose-600">{formatMoney(overdueTotal)}</p>
                  <span className="rounded-full bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-700">{overdueRows.length} invoices</span>
                </div>
                <div className="mt-4 space-y-3">
                  {overdueRows.slice(0, 3).map((invoice) => (
                    <div key={invoice.id} className="rounded-2xl border border-[var(--co-line-soft)] px-3 py-3 text-sm">
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <p className="font-medium text-[var(--co-ink)]">
                            {overdueByInvoice.get(invoice.id) ?? "Invoice"}
                          </p>
                          <p className="mt-1 text-xs text-[var(--co-muted)]">Sent {formatDateTime(invoice.createdAt)}</p>
                        </div>
                        <span className="font-semibold text-[var(--co-ink)]">{formatMoney(Math.max(invoice.totalCents - invoice.amountPaidCents, 0))}</span>
                      </div>
                    </div>
                  ))}
                  {overdueRows.length === 0 ? <p className="text-sm text-[var(--co-muted)]">No overdue invoices right now.</p> : null}
                </div>
                <Link href="/invoices?status=sent" className="mt-4 block text-sm font-medium text-[var(--co-evergreen)] hover:underline">
                  Review overdue invoices
                </Link>
              </>
            ),
          })}

          {sectionCard({
            eyebrow: "Supplies",
            title: "Inventory snapshot",
            description: "Fast visibility into stock you are close to running out of.",
            children: (
              <>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-2xl border border-dashed border-[var(--co-line)] bg-[var(--co-surface-muted)]/35 p-4">
                    <p className="text-xs text-[var(--co-muted)]">Inventory value</p>
                    <p className="mt-2 text-sm font-medium">{formatMoney(inventoryValue)}</p>
                  </div>
                  <div className="rounded-2xl border border-dashed border-[var(--co-line)] bg-[var(--co-surface-muted)]/35 p-4">
                    <p className="text-xs text-[var(--co-muted)]">Low stock</p>
                    <p className="mt-2 text-sm font-medium">{lowStock} item{lowStock === 1 ? "" : "s"}</p>
                  </div>
                  <div className="rounded-2xl border border-dashed border-[var(--co-line)] bg-[var(--co-surface-muted)]/35 p-4">
                    <p className="text-xs text-[var(--co-muted)]">Tracked items</p>
                    <p className="mt-2 text-sm font-medium">{inventory.length} item{inventory.length === 1 ? "" : "s"}</p>
                  </div>
                </div>

                <div className="mt-4 space-y-2">
                  {inventory.slice(0, 5).map((item) => (
                    <div key={item.name} className="flex items-center justify-between rounded-2xl border border-[var(--co-line-soft)] px-3 py-3 text-sm">
                      <div>
                        <p className="font-medium">{item.name}</p>
                        <p className="mt-0.5 text-xs text-[var(--co-muted)]">Reorder at {item.reorderAt}</p>
                      </div>
                      <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${item.onHand <= item.reorderAt ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}>
                        {item.onHand} on hand
                      </span>
                    </div>
                  ))}
                  {inventory.length === 0 ? <p className="text-sm text-[var(--co-muted)]">Inventory has not been set up yet.</p> : null}
                </div>

                <Link href="/supplies" className="mt-4 block text-sm font-medium text-[var(--co-evergreen)] hover:underline">
                  Open inventory
                </Link>
              </>
            ),
          })}
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
        <TechnicianRoutePreview routes={routeTechnicians} fallbackTitle="Today's route" />

        {sectionCard({
          eyebrow: "Performance",
          title: "Business pulse",
          description: `Selected performance window: ${formatDay(rangeFrom)} through ${formatDay(rangeTo)}.`,
          children: (
            <div className="space-y-4 text-sm text-[var(--co-muted)]">
              <div className="grid gap-2 sm:grid-cols-2">
                {[
                  { label: "New leads", value: String(leadCount[0]?.count ?? 0), note: "selected window" },
                  { label: "Quotes sent", value: String(sent), note: "selected window" },
                  { label: "Quotes accepted", value: String(accepted), note: "selected window" },
                  { label: "Conversion rate", value: `${conversion}%`, note: "accepted vs sent" },
                  { label: "New recurring", value: String(recurringCount[0]?.count ?? 0), note: "this month" },
                  { label: "Active clients", value: String(activeClientCount[0]?.count ?? 0), note: "current clients" },
                ].map((item) => (
                  <div key={item.label} className="rounded-xl border border-[var(--co-line-soft)] bg-[var(--co-surface-muted)]/35 px-3 py-3">
                    <p className="text-xs font-medium text-[var(--co-muted)]">{item.label}</p>
                    <p className="mt-1 text-2xl font-semibold tracking-[-0.04em] text-[var(--co-ink)]">{item.value}</p>
                    <p className="mt-1 text-xs text-[var(--co-muted)]">{item.note}</p>
                  </div>
                ))}
              </div>
              <p className="text-xs text-[var(--co-muted)]">Use the selected date window to compare quoting activity and customer growth. Daily operations above are always anchored to today.</p>
              <div className="rounded-xl border border-[var(--co-line-soft)] bg-[var(--co-surface-muted)]/35 p-4">
                <p className="text-xs font-semibold text-[var(--co-muted)]">Keep performance context visible</p>
                <ul className="mt-3 space-y-2">
                  <li className="text-xs text-[var(--co-muted)]">Conversion rate uses accepted quotes divided by quotes sent.</li>
                  <li className="text-xs text-[var(--co-muted)]">Revenue bars show paid invoices by day for the current week.</li>
                  <li className="text-xs text-[var(--co-muted)]">Today’s schedule and attention counts are not changed by the performance filter.</li>
                </ul>
              </div>
              <Link href="/settings" className="inline-flex font-medium text-[var(--co-evergreen)] hover:underline">
                Review settings
              </Link>
            </div>
          ),
        })}
      </section>
    </div>
  );
}
