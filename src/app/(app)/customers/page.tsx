import Link from "next/link";
import { redirect } from "next/navigation";
import { and, asc, desc, eq, ilike, inArray, isNotNull, isNull, ne, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { customers, invoices, jobs } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import { PaginationControls } from "@/components/ui/pagination";
import { StatusPill, statusLabel, statusOptions, statusToneClass } from "@/components/ui/status-pill";
import { InitialsAvatar } from "@/components/ui/initials-avatar";
import { BulkArchiveTable, type EligibleCustomerRow } from "./bulk-archive-bar";
import { formatDisplayDate } from "@/lib/scheduling/dates";

const PAGE_SIZE = 25;

const TYPE_LABELS: Record<string, string> = {
  first_clean: "First clean",
  recurring: "Recurring",
  one_time: "One-time",
  deep_clean: "Deep clean",
  move_out: "Move in/out",
};

const RECURRENCE_LABELS: Record<string, string> = {
  weekly: "Weekly",
  biweekly: "Bi-weekly",
  every4weeks: "Every 4 weeks",
  monthly: "Monthly",
};

const SORT_LABELS = {
  name_asc: "Name (A–Z)",
  name_desc: "Name (Z–A)",
  newest: "Newest added",
  oldest: "Oldest added",
  revenue_desc: "Highest revenue",
} as const;

const HISTORY_LABELS = {
  never: "Never serviced",
  stale30: "Not serviced in 30+ days",
  stale60: "Not serviced in 60+ days",
  stale90: "Not serviced in 90+ days",
  upcoming: "Has an upcoming job",
  no_upcoming: "No upcoming job",
} as const;

type HistoryKey = keyof typeof HISTORY_LABELS;

function isHistoryKey(value: string | undefined): value is HistoryKey {
  return !!value && value in HISTORY_LABELS;
}

type SortKey = keyof typeof SORT_LABELS;

function isSortKey(value: string | undefined): value is SortKey {
  return !!value && value in SORT_LABELS;
}

type SearchParams = {
  q?: string;
  status?: string;
  payment?: string;
  recurrence?: string;
  attention?: string;
  clientType?: string;
  zip?: string;
  type?: string;
  archived?: string;
  eligible?: string;
  sort?: string;
  page?: string;
  history?: string;
  cancelled?: string;
  repeat?: string;
};

type CustomerRow = {
  id: string;
  firstName: string;
  lastName: string;
  companyName: string | null;
  status: string;
  clientType: string;
  recurrence: string | null;
  paymentMethods: string[] | null;
  addressLine1: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  phone: string | null;
  email: string | null;
  createdAt: Date;
  isArchived: boolean;
  tags: unknown;
};

type JobRow = {
  customerId: string;
  id: string;
  status: string;
  scheduledDate: string;
  scheduledStartTime: string | null;
  type: string;
};

type InvoiceRow = {
  customerId: string;
  status: string;
  totalCents: number;
  amountPaidCents: number;
};

function money(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function paymentStatus(invoices: InvoiceRow[]) {
  const billable = invoices.filter((invoice) => invoice.status !== "void");
  if (!billable.length) return { label: "No invoices", className: "text-[var(--co-muted)]" };
  const outstandingCents = billable.reduce((total, invoice) => total + Math.max(invoice.totalCents - invoice.amountPaidCents, 0), 0);
  if (outstandingCents > 0) return { label: `${money(outstandingCents)} due`, className: "text-amber-700" };
  return { label: "Paid", className: "text-emerald-700" };
}

function formatDate(date: string | Date) {
  return formatDisplayDate(date);
}

function hrefWith(params: SearchParams, key: keyof SearchParams, value: string) {
  const next = new URLSearchParams();
  Object.entries(params).forEach(([name, current]) => {
    if (name !== key && name !== "page" && current) next.set(name, current);
  });
  if (value) next.set(key, value);
  const query = next.toString();
  return query ? `/customers?${query}` : "/customers";
}

function hrefForPage(params: SearchParams, page: number) {
  const next = new URLSearchParams();
  Object.entries(params).forEach(([name, current]) => {
    if (name !== "page" && current) next.set(name, current);
  });
  if (page > 1) next.set("page", String(page));
  const query = next.toString();
  return query ? `/customers?${query}` : "/customers";
}

export default async function CustomersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const admin = await getCurrentUser();
  if (!admin) redirect("/login");
  if (admin.role !== "admin") redirect("/my-day");

  const sp = await searchParams;
  const isEligibleView = sp.eligible === "archive";

  // Matches a null payment_methods value *and* an explicitly-cleared empty array —
  // the customer edit form can save `[]` when every method is deselected, and a
  // plain isNull() check silently misses those rows (see dashboard/page.tsx's
  // equivalent check, which already handles both cases).
  const paymentMethodsMissing = or(isNull(customers.paymentMethods), sql`cardinality(${customers.paymentMethods}) = 0`)!;

  // "Eligible for archive": served at least once (never just a lead/quote), no
  // recurring plan, and no upcoming job. Independent of lost/moved status — a lost
  // one-time customer with a completed job is still eligible, matching the intent
  // of decluttering the active working list, not just tracking pipeline outcome.
  const archiveEligible = and(
    eq(customers.companyId, admin.companyId),
    eq(customers.isArchived, false),
    sql`${customers.status} not in ('lead', 'quoted')`,
    or(isNull(customers.recurrence), eq(customers.recurrence, "none")),
    sql`exists (select 1 from ${jobs} where ${jobs.customerId} = ${customers.id} and ${jobs.status} = 'completed')`,
    sql`not exists (select 1 from ${jobs} where ${jobs.customerId} = ${customers.id} and ${jobs.status} in ('scheduled', 'in_progress'))`
  )!;

  const conditions = isEligibleView ? [archiveEligible] : [eq(customers.companyId, admin.companyId)];

  if (!isEligibleView) {
    if (sp.status && sp.status !== "all") conditions.push(eq(customers.status, sp.status as typeof customers.status.enumValues[number]));
    if (sp.clientType && sp.clientType !== "all") conditions.push(eq(customers.clientType, sp.clientType as typeof customers.clientType.enumValues[number]));
    if (sp.recurrence === "recurring") conditions.push(and(isNotNull(customers.recurrence), ne(customers.recurrence, "none"))!);
    if (sp.payment === "missing") conditions.push(paymentMethodsMissing);
    if (sp.attention === "yes") conditions.push(or(paymentMethodsMissing, isNull(customers.addressLine1), eq(customers.addressLine1, ""))!);
    if (sp.zip) conditions.push(eq(customers.zip, sp.zip));
    if (sp.type && sp.type in TYPE_LABELS) {
      conditions.push(sql`exists (select 1 from ${jobs} where ${jobs.customerId} = ${customers.id} and ${jobs.type} = ${sp.type})`);
    }
    if (sp.archived !== "1") conditions.push(eq(customers.isArchived, false));
    if (sp.q?.trim()) {
      const query = `%${sp.q.trim()}%`;
      conditions.push(or(ilike(customers.firstName, query), ilike(customers.lastName, query), ilike(customers.companyName, query), ilike(customers.email, query), ilike(customers.addressLine1, query), ilike(customers.phone, query))!);
    }
    if (isHistoryKey(sp.history)) {
      const hasCompletedJob = sql`exists (select 1 from ${jobs} where ${jobs.customerId} = ${customers.id} and ${jobs.status} = 'completed')`;
      const servicedRecently = (days: number) =>
        sql`exists (select 1 from ${jobs} where ${jobs.customerId} = ${customers.id} and ${jobs.status} = 'completed' and ${jobs.scheduledDate} >= now() - make_interval(days => ${days}))`;
      const hasUpcomingJob = sql`exists (select 1 from ${jobs} where ${jobs.customerId} = ${customers.id} and ${jobs.status} in ('scheduled', 'in_progress'))`;
      if (sp.history === "never") conditions.push(sql`not ${hasCompletedJob}`);
      if (sp.history === "stale30") conditions.push(and(hasCompletedJob, sql`not ${servicedRecently(30)}`)!);
      if (sp.history === "stale60") conditions.push(and(hasCompletedJob, sql`not ${servicedRecently(60)}`)!);
      if (sp.history === "stale90") conditions.push(and(hasCompletedJob, sql`not ${servicedRecently(90)}`)!);
      if (sp.history === "upcoming") conditions.push(hasUpcomingJob);
      if (sp.history === "no_upcoming") conditions.push(sql`not ${hasUpcomingJob}`);
    }
    if (sp.cancelled === "1") {
      conditions.push(sql`exists (select 1 from ${jobs} where ${jobs.customerId} = ${customers.id} and ${jobs.status} = 'cancelled')`);
    }
    if (sp.repeat === "1") {
      conditions.push(sql`(select count(*) from ${jobs} where ${jobs.customerId} = ${customers.id} and ${jobs.status} = 'completed') >= 2`);
    }
  }

  const page = Math.max(1, Math.floor(Number(sp.page)) || 1);

  // Sort is scoped to the normal filtered view — the archive-eligible view has its own
  // review flow (bulk-archive-bar) and doesn't render this filter form, so it keeps the
  // long-standing name A-Z order rather than exposing an unreachable control.
  const sortKey: SortKey = !isEligibleView && isSortKey(sp.sort) ? sp.sort : "newest";
  const lifetimeRevenue = sql`(select coalesce(sum(${invoices.totalCents}), 0) from ${invoices} where ${invoices.customerId} = ${customers.id} and ${invoices.status} <> 'void')`;
  const orderBy =
    sortKey === "name_desc"
      ? [desc(customers.lastName), desc(customers.firstName)]
      : sortKey === "newest"
        ? [desc(customers.createdAt)]
        : sortKey === "oldest"
          ? [asc(customers.createdAt)]
          : sortKey === "revenue_desc"
            ? [desc(lifetimeRevenue)]
            : [asc(customers.lastName), asc(customers.firstName)];

  const [rows, [stats], [globalStats], [{ eligibleCount }], zipRows]: [
    CustomerRow[],
    { recurring: number; attention: number; leads: number; cancelled: number; repeat: number; total: number }[],
    { totalManaged: number; totalManaged30dAgo: number; retentionEligible: number; retentionRetained: number }[],
    { eligibleCount: number }[],
    { zip: string | null }[],
  ] = await Promise.all([
    db
      .select({
        id: customers.id,
        firstName: customers.firstName,
        lastName: customers.lastName,
        companyName: customers.companyName,
        status: customers.status,
        clientType: customers.clientType,
        recurrence: customers.recurrence,
        paymentMethods: customers.paymentMethods,
        addressLine1: customers.addressLine1,
        city: customers.city,
        state: customers.state,
        zip: customers.zip,
        phone: customers.phone,
        email: customers.email,
        createdAt: customers.createdAt,
        isArchived: customers.isArchived,
        tags: customers.tags,
      })
      .from(customers)
      .where(and(...conditions))
      .orderBy(...orderBy)
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db
      .select({
        recurring: sql<number>`count(*) filter (where ${customers.recurrence} is not null and ${customers.recurrence} <> 'none')`,
        attention: sql<number>`count(*) filter (where ${paymentMethodsMissing} or ${customers.addressLine1} is null or ${customers.addressLine1} = '')`,
        leads: sql<number>`count(*) filter (where ${customers.status} = 'lead')`,
        cancelled: sql<number>`count(*) filter (where exists (select 1 from ${jobs} where ${jobs.customerId} = ${customers.id} and ${jobs.status} = 'cancelled'))`,
        repeat: sql<number>`count(*) filter (where (select count(*) from ${jobs} where ${jobs.customerId} = ${customers.id} and ${jobs.status} = 'completed') >= 2)`,
        total: sql<number>`count(*)`,
      })
      .from(customers)
      .where(and(...conditions)),
    // Global company-wide KPIs — deliberately NOT scoped to the current filters, since
    // "Total Managed"/"Retention Rate" are headline numbers, not a filtered-view count.
    db
      .select({
        totalManaged: sql<number>`count(*) filter (where ${customers.isArchived} = false)`,
        totalManaged30dAgo: sql<number>`count(*) filter (where ${customers.isArchived} = false and ${customers.createdAt} <= now() - interval '30 days')`,
        retentionEligible: sql<number>`count(*) filter (where ${customers.status} not in ('lead','quoted'))`,
        retentionRetained: sql<number>`count(*) filter (where ${customers.status} = 'client')`,
      })
      .from(customers)
      .where(eq(customers.companyId, admin.companyId)),
    db.select({ eligibleCount: sql<number>`count(*)` }).from(customers).where(archiveEligible),
    db
      .selectDistinct({ zip: customers.zip })
      .from(customers)
      .where(and(eq(customers.companyId, admin.companyId), isNotNull(customers.zip), ne(customers.zip, "")))
      .orderBy(customers.zip),
  ]);

  const customerIds = rows.map((row) => row.id);
  const [customerJobs, customerInvoices]: [JobRow[], InvoiceRow[]] = customerIds.length
    ? await Promise.all([
        db
          .select({
            customerId: jobs.customerId,
            id: jobs.id,
            status: jobs.status,
            scheduledDate: jobs.scheduledDate,
            scheduledStartTime: jobs.scheduledStartTime,
            type: jobs.type,
          })
          .from(jobs)
          .where(inArray(jobs.customerId, customerIds)),
        db
          .select({
            customerId: invoices.customerId,
            status: invoices.status,
            totalCents: invoices.totalCents,
            amountPaidCents: invoices.amountPaidCents,
          })
          .from(invoices)
          .where(inArray(invoices.customerId, customerIds)),
      ])
    : [[], []];

  const nextJobByCustomer = new Map<string, JobRow>();
  customerJobs
    .filter((job) => !["completed", "cancelled", "no_show"].includes(job.status))
    .sort((a, b) => `${a.scheduledDate}${a.scheduledStartTime ?? ""}`.localeCompare(`${b.scheduledDate}${b.scheduledStartTime ?? ""}`))
    .forEach((job) => {
      if (!nextJobByCustomer.has(job.customerId)) nextJobByCustomer.set(job.customerId, job);
    });

  const lastJobByCustomer = new Map<string, JobRow>();
  customerJobs
    .filter((job) => job.status === "completed")
    .sort((a, b) => `${b.scheduledDate}${b.scheduledStartTime ?? ""}`.localeCompare(`${a.scheduledDate}${a.scheduledStartTime ?? ""}`))
    .forEach((job) => {
      if (!lastJobByCustomer.has(job.customerId)) lastJobByCustomer.set(job.customerId, job);
    });

  const invoicesByCustomer = new Map<string, InvoiceRow[]>();
  customerInvoices.forEach((invoice) => {
    const entries = invoicesByCustomer.get(invoice.customerId) ?? [];
    entries.push(invoice);
    invoicesByCustomer.set(invoice.customerId, entries);
  });

  const recurringCount = Number(stats.recurring);
  const attentionCount = Number(stats.attention);
  const leadCount = Number(stats.leads);
  const cancelledCount = Number(stats.cancelled);
  const repeatCount = Number(stats.repeat);
  const totalCount = Number(stats.total);

  const totalManaged = Number(globalStats.totalManaged);
  const totalManaged30dAgo = Number(globalStats.totalManaged30dAgo);
  const trendPct = totalManaged30dAgo > 0 ? Math.round(((totalManaged - totalManaged30dAgo) / totalManaged30dAgo) * 100) : null;
  const retentionEligible = Number(globalStats.retentionEligible);
  const retentionRetained = Number(globalStats.retentionRetained);
  // No precedent for this metric exists anywhere else in the app — of everyone pursued past
  // lead/quote stage, what fraction are currently active clients. Flagged as the one number
  // most likely to need revision once seen in context against real business expectations.
  const retentionRate = retentionEligible > 0 ? (retentionRetained / retentionEligible) * 100 : null;

  const eligibleRows: EligibleCustomerRow[] = isEligibleView
    ? rows.map((row) => ({
        id: row.id,
        name: row.companyName || `${row.firstName} ${row.lastName}`,
        clientTypeLabel: row.clientType === "commercial" ? "Commercial" : "Residential",
        status: row.status,
        statusLabel: statusLabel("customer", row.status),
        statusClassName: statusToneClass("customer", row.status),
        address: [row.addressLine1, row.city].filter(Boolean).join(", ") || "Address missing",
      }))
    : [];

  return (
    <div className="space-y-6">
      {!isEligibleView && eligibleCount > 0 ? (
        <Link
          href="/customers?eligible=archive"
          className="co-card flex items-center justify-between gap-3 border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 hover:border-amber-300"
        >
          <span>
            <strong>{Number(eligibleCount)}</strong> one-time customer{Number(eligibleCount) === 1 ? " hasn't" : "s haven't"} booked again — review for archive.
          </span>
          <span className="font-medium">Review →</span>
        </Link>
      ) : null}

      <section className="co-card flex flex-wrap items-center gap-3 px-4 py-3">
        {isEligibleView ? (
          <>
            <p className="text-sm text-[var(--co-muted)]">Customers eligible for archive</p>
            <Link href="/customers" className="text-sm font-semibold text-[var(--co-evergreen)] hover:underline">← Back to all customers</Link>
          </>
        ) : (
          <>
          <Link href={hrefWith(sp, "recurrence", sp.recurrence === "recurring" ? "" : "recurring")} className={`rounded-full px-3.5 py-2 text-xs font-semibold transition ${sp.recurrence === "recurring" ? "bg-[var(--co-evergreen)] text-white shadow-sm" : "border border-[var(--co-line)] bg-[var(--co-surface)] text-[var(--co-muted)] hover:border-[var(--co-evergreen)] hover:text-[var(--co-ink)]"}`}>
            Recurring <span className="ml-1 opacity-80">{recurringCount}</span>
          </Link>
          <Link href={hrefWith(sp, "attention", sp.attention === "yes" ? "" : "yes")} className={`rounded-full px-3.5 py-2 text-xs font-semibold transition ${sp.attention === "yes" ? "bg-amber-500 text-white shadow-sm" : "border border-[var(--co-line)] bg-[var(--co-surface)] text-[var(--co-muted)] hover:border-amber-400 hover:text-[var(--co-ink)]"}`}>
            Needs attention <span className="ml-1 opacity-80">{attentionCount}</span>
          </Link>
          <Link href={hrefWith(sp, "status", sp.status === "lead" ? "" : "lead")} className={`rounded-full px-3.5 py-2 text-xs font-semibold transition ${sp.status === "lead" ? "bg-[var(--co-evergreen)] text-white shadow-sm" : "border border-[var(--co-line)] bg-[var(--co-surface)] text-[var(--co-muted)] hover:border-[var(--co-evergreen)] hover:text-[var(--co-ink)]"}`}>
            Leads <span className="ml-1 opacity-80">{leadCount}</span>
          </Link>
          <Link href={hrefWith(sp, "cancelled", sp.cancelled === "1" ? "" : "1")} className={`rounded-full px-3.5 py-2 text-xs font-semibold transition ${sp.cancelled === "1" ? "bg-rose-600 text-white shadow-sm" : "border border-[var(--co-line)] bg-[var(--co-surface)] text-[var(--co-muted)] hover:border-rose-400 hover:text-[var(--co-ink)]"}`}>
            Cancelled job <span className="ml-1 opacity-80">{cancelledCount}</span>
          </Link>
          <Link href={hrefWith(sp, "repeat", sp.repeat === "1" ? "" : "1")} className={`rounded-full px-3.5 py-2 text-xs font-semibold transition ${sp.repeat === "1" ? "bg-[var(--co-evergreen)] text-white shadow-sm" : "border border-[var(--co-line)] bg-[var(--co-surface)] text-[var(--co-muted)] hover:border-[var(--co-evergreen)] hover:text-[var(--co-ink)]"}`}>
            Repeat customer <span className="ml-1 opacity-80">{repeatCount}</span>
          </Link>
          <Link href={hrefWith(sp, "archived", sp.archived === "1" ? "" : "1")} className={`rounded-full px-3.5 py-2 text-xs font-semibold transition ${sp.archived === "1" ? "bg-slate-600 text-white shadow-sm" : "border border-[var(--co-line)] bg-[var(--co-surface)] text-[var(--co-muted)] hover:border-slate-400 hover:text-[var(--co-ink)]"}`}>
            {sp.archived === "1" ? "Hide archived" : "Show archived"}
          </Link>
          </>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-4 rounded-lg border border-[var(--co-line)] bg-[var(--co-surface-muted)]/40 px-3 py-2 text-sm">
            <div>
              <p className="text-[10px] font-medium uppercase tracking-[0.1em] text-[var(--co-muted)]">Managed</p>
              <p className="font-semibold">{totalManaged.toLocaleString()}{trendPct !== null ? <span className={`ml-1 text-xs font-medium ${trendPct >= 0 ? "text-emerald-700" : "text-rose-600"}`}>{trendPct >= 0 ? "↑" : "↓"}{Math.abs(trendPct)}%</span> : null}</p>
            </div>
            <div className="border-l border-[var(--co-line-soft)] pl-4" title="Active clients as a share of everyone pursued past lead/quote">
              <p className="text-[10px] font-medium uppercase tracking-[0.1em] text-[var(--co-muted)]">Retention</p>
              <p className="font-semibold">{retentionRate !== null ? `${retentionRate.toFixed(1)}%` : "—"}</p>
            </div>
          </div>
          <Link href="/customers/new" className="co-button-primary">+ Add customer</Link>
        </div>
      </section>

      <section className="co-card overflow-hidden">
        {!isEligibleView ? (
          <form className="flex flex-wrap gap-3 border-b border-[var(--co-line-soft)] bg-[var(--co-surface-muted)]/40 p-4">
            <input name="q" defaultValue={sp.q} placeholder="Search name, email, phone, or address" className="co-input min-w-[240px] flex-1" />
            <select name="status" defaultValue={sp.status ?? "all"} className="co-input w-full sm:w-auto">
              <option value="all">All statuses</option>
              {statusOptions("customer").map(({ value, label }) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <select name="zip" defaultValue={sp.zip ?? ""} className="co-input w-full sm:w-auto">
              <option value="">All zip codes</option>
              {zipRows.map((row) => (row.zip ? <option key={row.zip} value={row.zip}>{row.zip}</option> : null))}
            </select>
            <select name="type" defaultValue={sp.type ?? ""} className="co-input w-full sm:w-auto">
              <option value="">Any service type</option>
              {Object.entries(TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <select name="clientType" defaultValue={sp.clientType ?? "all"} className="co-input w-full sm:w-auto">
              <option value="all">Residential + commercial</option>
              <option value="residential">Residential</option>
              <option value="commercial">Commercial</option>
            </select>
            <select name="payment" defaultValue={sp.payment ?? ""} className="co-input w-full sm:w-auto">
              <option value="">All payment methods</option>
              <option value="missing">Payment method missing</option>
            </select>
            <select name="history" defaultValue={isHistoryKey(sp.history) ? sp.history : ""} className="co-input w-full sm:w-auto">
              <option value="">Any service history</option>
              {Object.entries(HISTORY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <select name="sort" defaultValue={sortKey} className="co-input w-full sm:w-auto">
              {Object.entries(SORT_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            {sp.recurrence && <input type="hidden" name="recurrence" value={sp.recurrence} />}
            {sp.attention && <input type="hidden" name="attention" value={sp.attention} />}
            {sp.archived && <input type="hidden" name="archived" value={sp.archived} />}
            {sp.cancelled && <input type="hidden" name="cancelled" value={sp.cancelled} />}
            {sp.repeat && <input type="hidden" name="repeat" value={sp.repeat} />}
            <button type="submit" className="co-button-secondary">
              Filter customers
            </button>
            {Object.keys(sp).length ? (
              <Link href="/customers" className="self-center text-sm font-medium text-[var(--co-evergreen)]">
                Clear
              </Link>
            ) : null}
          </form>
        ) : null}

        {isEligibleView ? (
          <BulkArchiveTable rows={eligibleRows} />
        ) : rows.length === 0 ? (
          <div className="p-12 text-center">
            <p className="font-medium">No customers match these filters.</p>
            <p className="mt-1 text-sm text-[var(--co-muted)]">GHL imports will appear here when contacts are available.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1040px] text-left text-sm">
              <thead className="bg-[var(--co-surface-muted)] text-xs uppercase tracking-[0.1em] text-[var(--co-muted)]">
                <tr>
                  <th className="px-5 py-3">Customer</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Primary address</th>
                  <th className="px-5 py-3">Last service</th>
                  <th className="px-5 py-3">Next service</th>
                  <th className="px-5 py-3">Payment</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--co-line-soft)]">
                {rows.map((row) => {
                  const nextJob = nextJobByCustomer.get(row.id);
                  const lastJob = lastJobByCustomer.get(row.id);
                  const payment = paymentStatus(invoicesByCustomer.get(row.id) ?? []);
                  const planLabel = row.recurrence && row.recurrence !== "none" ? RECURRENCE_LABELS[row.recurrence] ?? row.recurrence : "One-time";
                  const clientTypeLabel = row.clientType === "commercial" ? "Commercial" : "Residential";

                  return (
                    // One link per row, stretched over the whole row by its ::after. Each cell
                    // used to carry its own <Link> to the same href, so a screen reader
                    // announced six identical links per row (150 on a full page).
                    <tr
                      key={row.id}
                      className="group relative transition-colors hover:bg-[var(--co-surface-muted)]/50 focus-within:bg-[var(--co-surface-muted)]/50 focus-within:outline focus-within:outline-2 focus-within:-outline-offset-2 focus-within:outline-[var(--co-evergreen)]"
                    >
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <InitialsAvatar firstName={row.firstName} lastName={row.lastName} companyName={row.companyName} className="h-10 w-10 rounded-full text-sm" />
                          <div className="min-w-0">
                            <Link
                              href={`/customers/${row.id}`}
                              className="font-semibold text-[var(--co-ink)] outline-none after:absolute after:inset-0 after:content-[''] group-hover:text-[var(--co-evergreen)]"
                            >
                              {row.companyName ? row.companyName : `${row.firstName} ${row.lastName}`}
                            </Link>
                            {row.isArchived ? <span className="ml-2 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-500">Archived</span> : null}
                            <p className="text-xs text-[var(--co-muted)]">
                              {clientTypeLabel} · {planLabel}
                            </p>
                            <p className="text-xs text-[var(--co-muted)]">Added {formatDate(row.createdAt)}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <StatusPill domain="customer" status={row.status} />
                      </td>
                      <td className="px-5 py-4 text-[var(--co-muted)]">
                        {row.addressLine1 ?? "Address missing"}
                        {row.city ? ` · ${row.city}` : ""}
                        {row.zip ? <span className="block text-xs">Area: {row.zip}</span> : null}
                      </td>
                      <td className="px-5 py-4">
                        {lastJob ? (
                          <>
                            <p className="font-medium">{formatDate(lastJob.scheduledDate)}</p>
                            <p className="text-xs text-[var(--co-muted)]">{TYPE_LABELS[lastJob.type] ?? lastJob.type}</p>
                          </>
                        ) : (
                          <span className="text-[var(--co-muted)]">—</span>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        {nextJob ? (
                          <span className="font-medium text-[var(--co-evergreen)]">{formatDate(nextJob.scheduledDate)}</span>
                        ) : (
                          <span className="text-[var(--co-muted)]">—</span>
                        )}
                      </td>
                      <td className={`px-5 py-4 font-semibold ${payment.className}`}>{payment.label}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {!isEligibleView ? (
          <PaginationControls page={page} pageSize={PAGE_SIZE} total={totalCount} itemLabel="customer" variant="pills" hrefForPage={(target) => hrefForPage(sp, target)} />
        ) : null}
      </section>
    </div>
  );
}
