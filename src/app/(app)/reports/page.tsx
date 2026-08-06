import { and, asc, eq, isNotNull } from "drizzle-orm";
import {
  BriefcaseBusiness,
  CircleDollarSign,
  ClipboardCheck,
  FileText,
  HandCoins,
  ReceiptText,
  TrendingUp,
} from "lucide-react";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { companies, customers } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import { resolveRange } from "@/lib/dashboard/range";
import {
  getAccountsReceivableReport,
  getAccountsReceivableSummary,
  getJobsReport,
  getJobsReportSummary,
  getLastExports,
  getPayrollReport,
  getSalesReport,
  getSalesReportSummary,
  getTipsReport,
  type ReportKey,
  type ReportsRange,
} from "@/lib/reports/queries";
import {
  ReportsFilters,
  ReportActions,
  type PreviewTable,
} from "./reports-controls";

type SearchParams = Promise<{
  area?: string;
  from?: string;
  preset?: string;
  to?: string;
}>;
type ReportCardProps = {
  description: string;
  exportHref: string;
  icon: React.ReactNode;
  lastExported?: Date;
  name: string;
  preview: PreviewTable;
};

function money(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}
function date(value: Date | string | null) {
  return value
    ? new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }).format(new Date(value))
    : "—";
}
function hours(value: number) {
  return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
}
function relativeDate(value?: Date) {
  if (!value) return "Never exported";
  const seconds = Math.max(
    0,
    Math.round((Date.now() - new Date(value).getTime()) / 1000),
  );
  if (seconds < 60) return "Last exported just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `Last exported ${minutes}m ago`;
  const days = Math.floor(minutes / 1440);
  return days < 1
    ? `Last exported ${Math.floor(minutes / 60)}h ago`
    : `Last exported ${days}d ago`;
}

function ReportCard({
  description,
  exportHref,
  icon,
  lastExported,
  name,
  preview,
}: ReportCardProps) {
  return (
    <article className="co-card flex min-h-56 flex-col p-5">
      <div className="flex items-start gap-3">
        <div className="text-[var(--co-accent)]">{icon}</div>
        <div>
          <h3 className="font-semibold text-[var(--co-ink)]">{name}</h3>
          <p className="mt-1 text-sm leading-5 text-[var(--co-muted)]">
            {description}
          </p>
        </div>
      </div>
      <p className="mt-auto pt-5 text-xs text-[var(--co-muted)]">
        {relativeDate(lastExported)}
      </p>
      <div className="mt-3 border-t border-[var(--co-line-soft)] pt-4">
        <ReportActions exportHref={exportHref} preview={preview} />
      </div>
    </article>
  );
}

function ComingSoonCard() {
  return (
    <article className="co-card flex min-h-56 flex-col p-5 opacity-55">
      <div className="flex items-start gap-3">
        <ClipboardCheck
          className="h-5 w-5 text-[var(--co-muted)]"
          aria-hidden
        />
        <div>
          <h3 className="font-semibold text-[var(--co-ink)]">
            Quality &amp; Inspections
          </h3>
          <p className="mt-1 text-sm leading-5 text-[var(--co-muted)]">
            Inspection results and quality follow-up.
          </p>
        </div>
      </div>
      <div className="mt-auto pt-5">
        <p className="text-sm font-medium text-[var(--co-muted)]">
          Coming soon
        </p>
        <p className="mt-1 text-xs text-[var(--co-muted)]">Not tracked yet.</p>
      </div>
    </article>
  );
}

function SectionSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 3 }, (_, index) => (
        <div
          key={index}
          className="co-card h-56 animate-pulse bg-[var(--co-surface-muted)]"
        />
      ))}
    </div>
  );
}

function href(reportKey: ReportKey, range: ReportsRange, area?: string) {
  const params = new URLSearchParams({
    preset: "custom",
    from: range.fromIso,
    to: range.toIso,
  });
  if (
    area &&
    (reportKey === "accounts-receivable" ||
      reportKey === "jobs" ||
      reportKey === "sales")
  )
    params.set("area", area);
  return `/api/reports/${reportKey}/export?${params.toString()}`;
}

async function SalesReports({
  companyId,
  range,
  area,
}: {
  companyId: string;
  range: ReportsRange;
  area?: string;
}) {
  const [sales, summary, exports] = await Promise.all([
    getSalesReport(companyId, range, area),
    getSalesReportSummary(companyId, range, area),
    getLastExports(companyId),
  ]);
  const preview: PreviewTable = {
    columns: ["Type", "Customer", "Area", "Date"],
    rows: sales
      .slice(0, 50)
      .map((row) => [
        row.type,
        row.customerName,
        row.area ?? "—",
        date(row.eventDate),
      ]),
    summary: `Showing ${Math.min(sales.length, 50)} of ${sales.length} events · ${summary.newLeads} new leads, ${summary.quotesSent} quotes sent, ${summary.quotesAccepted} accepted, ${summary.acquiredRecurring} acquired recurring, ${summary.lostRecurring} lost recurring`,
  };
  return (
    <section>
      <div className="mb-3 flex items-center gap-2">
        <TrendingUp className="h-5 w-5 text-[var(--co-accent)]" aria-hidden />
        <h2 className="text-base font-semibold text-[var(--co-ink)]">
          Sales Reports
        </h2>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <ReportCard
          name="Sales"
          icon={<TrendingUp className="h-5 w-5" />}
          description="New leads, quote progress, recurring clients acquired, and recurring clients lost."
          lastExported={exports.sales}
          exportHref={href("sales", range, area)}
          preview={preview}
        />
      </div>
    </section>
  );
}

async function FinancialReports({
  companyId,
  range,
  area,
}: {
  companyId: string;
  range: ReportsRange;
  area?: string;
}) {
  const [payroll, tips, receivables, totalOutstanding, exports] =
    await Promise.all([
      getPayrollReport(companyId, range),
      getTipsReport(companyId, range),
      getAccountsReceivableReport(companyId, range, area),
      getAccountsReceivableSummary(companyId, range, area),
      getLastExports(companyId),
    ]);
  const payrollPreview: PreviewTable = {
    columns: [
      "Employee",
      "Pay period",
      "Regular hrs",
      "Office hrs",
      "Paycheck tips",
      "Cash tips",
      "Gross pay",
    ],
    rows: payroll
      .slice(0, 50)
      .map((row) => [
        row.employeeName,
        `${row.periodStart} – ${row.periodEnd}`,
        hours(row.regularHours),
        hours(row.officeHours),
        money(row.tipsPaycheckCents),
        money(row.tipsCashCents),
        money(row.grossPayCents),
      ]),
    summary: `Showing ${Math.min(payroll.length, 50)} of ${payroll.length} payroll lines`,
  };
  const tipsPreview: PreviewTable = {
    columns: [
      "Employee",
      "Pay period",
      "Paycheck tips",
      "Cash tips",
      "Total tips",
    ],
    rows: tips
      .slice(0, 50)
      .map((row) => [
        row.employeeName,
        `${row.periodStart} – ${row.periodEnd}`,
        money(row.paycheckTipsCents),
        money(row.cashTipsCents),
        money(row.paycheckTipsCents + row.cashTipsCents),
      ]),
    summary: `Showing ${Math.min(tips.length, 50)} of ${tips.length} employee periods`,
  };
  const arPreview: PreviewTable = {
    columns: [
      "Customer",
      "Area",
      "Invoice date",
      "Outstanding",
      "Aging",
      "Overdue",
    ],
    rows: receivables
      .slice(0, 50)
      .map((row) => [
        row.customerName,
        row.area ?? "—",
        date(row.invoiceCreatedAt),
        money(row.outstandingCents),
        row.agingBucket,
        row.overdue ? "Yes" : "No",
      ]),
    summary: `Showing ${Math.min(receivables.length, 50)} of ${receivables.length} invoices · ${money(totalOutstanding)} outstanding`,
  };
  return (
    <section>
      <div className="mb-3 flex items-center gap-2">
        <CircleDollarSign
          className="h-5 w-5 text-[var(--co-accent)]"
          aria-hidden
        />
        <h2 className="text-base font-semibold text-[var(--co-ink)]">
          Financial Reports
        </h2>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <ReportCard
          name="Payroll"
          icon={<HandCoins className="h-5 w-5" />}
          description="Employee hours and calculated gross pay by pay period."
          lastExported={exports.payroll}
          exportHref={href("payroll", range)}
          preview={payrollPreview}
        />
        <ReportCard
          name="Tips"
          icon={<ReceiptText className="h-5 w-5" />}
          description="Tips collected by employee for the selected date range."
          lastExported={exports.tips}
          exportHref={href("tips", range)}
          preview={tipsPreview}
        />
        <ReportCard
          name="Accounts Receivable"
          icon={<FileText className="h-5 w-5" />}
          description="Outstanding invoice balances and aging."
          lastExported={exports["accounts-receivable"]}
          exportHref={href("accounts-receivable", range, area)}
          preview={arPreview}
        />
      </div>
    </section>
  );
}

async function OperationsReports({
  companyId,
  range,
  area,
}: {
  companyId: string;
  range: ReportsRange;
  area?: string;
}) {
  const [jobsReport, summary, exports] = await Promise.all([
    getJobsReport(companyId, range, area),
    getJobsReportSummary(companyId, range, area),
    getLastExports(companyId),
  ]);
  const preview: PreviewTable = {
    columns: [
      "Customer",
      "Area",
      "Scheduled",
      "Status",
      "Completed",
      "Est. duration",
    ],
    rows: jobsReport
      .slice(0, 50)
      .map((row) => [
        row.customerName,
        row.area ?? "—",
        row.scheduledDate,
        row.status,
        date(row.completedAt),
        row.estimatedDurationMinutes
          ? `${row.estimatedDurationMinutes} min`
          : "—",
      ]),
    summary: `Showing ${Math.min(jobsReport.length, 50)} of ${jobsReport.length} jobs · ${summary.completed} completed, ${summary.scheduled} scheduled, ${summary.cancelled} cancelled · ${summary.estimatedMinutes} estimated minutes`,
  };
  return (
    <section>
      <div className="mb-3 flex items-center gap-2">
        <BriefcaseBusiness
          className="h-5 w-5 text-[var(--co-accent)]"
          aria-hidden
        />
        <h2 className="text-base font-semibold text-[var(--co-ink)]">
          Operations Reports
        </h2>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <ReportCard
          name="Jobs"
          icon={<BriefcaseBusiness className="h-5 w-5" />}
          description="Completed, scheduled, and cancelled job counts and durations for the selected date range."
          lastExported={exports.jobs}
          exportHref={href("jobs", range, area)}
          preview={preview}
        />
        <ComingSoonCard />
      </div>
    </section>
  );
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const [user, params] = await Promise.all([getCurrentUser(), searchParams]);
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/my-day");
  const [company, areas] = await Promise.all([
    db
      .select({ timezone: companies.timezone })
      .from(companies)
      .where(eq(companies.id, user.companyId))
      .limit(1)
      .then((rows) => rows[0] ?? null),
    db
      .selectDistinct({ city: customers.city })
      .from(customers)
      .where(
        and(eq(customers.companyId, user.companyId), isNotNull(customers.city)),
      )
      .orderBy(asc(customers.city)),
  ]);
  if (!company) redirect("/login");
  const range = resolveRange(
    {
      preset: params.preset ?? "last_30_days",
      from: params.from,
      to: params.to,
    },
    company.timezone,
  );
  const validAreas = areas
    .map((row) => row.city)
    .filter((city): city is string => Boolean(city));
  const area = validAreas.includes(params.area ?? "") ? params.area : undefined;
  return (
    <div className="max-w-7xl space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="page-title">Reports &amp; Exports</h1>
          <p className="page-subtitle">
            Data hub for operations, financials, and customer metrics.
          </p>
        </div>
        <ReportsFilters
          areas={validAreas}
          area={area}
          fromIso={range.fromIso}
          toIso={range.toIso}
          preset={range.preset}
        />
      </header>
      <Suspense fallback={<SectionSkeleton />}>
        <FinancialReports
          companyId={user.companyId}
          range={range}
          area={area}
        />
      </Suspense>
      <Suspense fallback={<SectionSkeleton />}>
        <OperationsReports
          companyId={user.companyId}
          range={range}
          area={area}
        />
      </Suspense>
      <Suspense fallback={<SectionSkeleton />}>
        <SalesReports companyId={user.companyId} range={range} area={area} />
      </Suspense>
    </div>
  );
}
