import Link from "next/link";
import { redirect } from "next/navigation";
import { and, eq, ilike, inArray, isNotNull, isNull, ne, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { customers, invoices, jobs } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import { PaginationControls } from "@/components/ui/pagination";
import { InitialsAvatar } from "@/components/ui/initials-avatar";
import { BulkArchiveTable, type EligibleCustomerRow } from "./bulk-archive-bar";

const PAGE_SIZE = 25;

const STATUS_LABELS: Record<string, string> = {
  lead: "Lead",
  quoted: "Quoted",
  first_clean_booked: "First clean booked",
  client: "Active client",
  lost: "Lost",
  moved: "Moved",
};

const STATUS_STYLES: Record<string, string> = {
  lead: "border-slate-200 bg-slate-50 text-slate-600",
  quoted: "border-blue-200 bg-blue-50 text-blue-700",
  first_clean_booked: "border-amber-200 bg-amber-50 text-amber-700",
  client: "border-emerald-200 bg-emerald-50 text-emerald-700",
  lost: "border-rose-200 bg-rose-50 text-rose-700",
  moved: "border-slate-200 bg-slate-50 text-slate-400",
};

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
  page?: string;
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
      conditions.push(or(ilike(customers.firstName, query), ilike(customers.lastName, query), ilike(customers.companyName, query), ilike(customers.email, query), ilike(customers.addressLine1, query))!);
    }
  }

  const page = Math.max(1, Math.floor(Number(sp.page)) || 1);

  const [rows, [stats], [globalStats], [{ eligibleCount }], zipRows]: [
    CustomerRow[],
    { recurring: number; attention: number; leads: number; total: number }[],
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
        isArchived: customers.isArchived,
        tags: customers.tags,
      })
      .from(customers)
      .where(and(...conditions))
      .orderBy(customers.lastName, customers.firstName)
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db
      .select({
        recurring: sql<number>`count(*) filter (where ${customers.recurrence} is not null and ${customers.recurrence} <> 'none')`,
        attention: sql<number>`count(*) filter (where ${paymentMethodsMissing} or ${customers.addressLine1} is null or ${customers.addressLine1} = '')`,
        leads: sql<number>`count(*) filter (where ${customers.status} = 'lead')`,
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

  const ltvByCustomer = new Map<string, number>();
  customerInvoices.forEach((invoice) => {
    if (invoice.status === "void") return;
    ltvByCustomer.set(invoice.customerId, (ltvByCustomer.get(invoice.customerId) ?? 0) + invoice.amountPaidCents);
  });

  const recurringCount = Number(stats.recurring);
  const attentionCount = Number(stats.attention);
  const leadCount = Number(stats.leads);
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
        statusLabel: STATUS_LABELS[row.status] ?? row.status,
        statusClassName: STATUS_STYLES[row.status] ?? "border-slate-200 bg-slate-50 text-slate-600",
        address: [row.addressLine1, row.city].filter(Boolean).join(", ") || "Address missing",
      }))
    : [];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="eyebrow">Operations / Relationships</p>
          <h1 className="page-title">Customers</h1>
          <p className="page-subtitle">Keep every home, preference, and service history ready for the next visit.</p>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-4 rounded-xl border border-[var(--co-line)] bg-[var(--co-surface)] px-4 py-2 text-sm">
            <div>
              <p className="text-[10px] font-medium uppercase tracking-[0.1em] text-[var(--co-muted)]">Total managed</p>
              <p className="font-semibold">
                {totalManaged.toLocaleString()}
                {trendPct !== null ? (
                  <span className={`ml-1 text-xs font-medium ${trendPct >= 0 ? "text-emerald-700" : "text-rose-600"}`}>
                    {trendPct >= 0 ? "↑" : "↓"}
                    {Math.abs(trendPct)}%
                  </span>
                ) : null}
              </p>
            </div>
            <div className="border-l border-[var(--co-line-soft)] pl-4" title="Active clients as a share of everyone pursued past lead/quote — no established definition yet, treat as directional">
              <p className="text-[10px] font-medium uppercase tracking-[0.1em] text-[var(--co-muted)]">Retention rate</p>
              <p className="font-semibold">{retentionRate !== null ? `${retentionRate.toFixed(1)}%` : "—"}</p>
            </div>
          </div>
          <Link href="/customers/new" className="co-button-primary">
            + Add customer
          </Link>
        </div>
      </header>

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

      {isEligibleView ? (
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-[var(--co-muted)]">
            Showing customers who&apos;ve been served but never signed up for a recurring plan and have nothing upcoming.
          </p>
          <Link href="/customers" className="text-sm font-medium text-[var(--co-evergreen)] hover:underline">
            ← Back to all customers
          </Link>
        </div>
      ) : (
        <section className="flex flex-wrap gap-3">
          <Link href={hrefWith(sp, "recurrence", sp.recurrence === "recurring" ? "" : "recurring")} className={`rounded-full px-3.5 py-2 text-xs font-semibold transition ${sp.recurrence === "recurring" ? "bg-[var(--co-evergreen)] text-white shadow-sm" : "border border-[var(--co-line)] bg-white text-[var(--co-muted)] hover:border-[var(--co-evergreen)] hover:text-[var(--co-ink)]"}`}>
            Recurring <span className="ml-1 opacity-80">{recurringCount}</span>
          </Link>
          <Link href={hrefWith(sp, "attention", sp.attention === "yes" ? "" : "yes")} className={`rounded-full px-3.5 py-2 text-xs font-semibold transition ${sp.attention === "yes" ? "bg-amber-500 text-white shadow-sm" : "border border-[var(--co-line)] bg-white text-[var(--co-muted)] hover:border-amber-400 hover:text-[var(--co-ink)]"}`}>
            Needs attention <span className="ml-1 opacity-80">{attentionCount}</span>
          </Link>
          <Link href={hrefWith(sp, "status", sp.status === "lead" ? "" : "lead")} className={`rounded-full px-3.5 py-2 text-xs font-semibold transition ${sp.status === "lead" ? "bg-[var(--co-evergreen)] text-white shadow-sm" : "border border-[var(--co-line)] bg-white text-[var(--co-muted)] hover:border-[var(--co-evergreen)] hover:text-[var(--co-ink)]"}`}>
            Leads <span className="ml-1 opacity-80">{leadCount}</span>
          </Link>
          <Link href={hrefWith(sp, "archived", sp.archived === "1" ? "" : "1")} className={`ml-auto rounded-full px-3.5 py-2 text-xs font-semibold transition ${sp.archived === "1" ? "bg-slate-600 text-white shadow-sm" : "border border-[var(--co-line)] bg-white text-[var(--co-muted)] hover:border-slate-400 hover:text-[var(--co-ink)]"}`}>
            {sp.archived === "1" ? "Hide archived" : "Show archived"}
          </Link>
        </section>
      )}

      <section className="co-card overflow-hidden">
        {!isEligibleView ? (
          <form className="flex flex-wrap gap-3 border-b border-[var(--co-line-soft)] bg-[var(--co-surface-muted)]/40 p-4">
            <input name="q" defaultValue={sp.q} placeholder="Search customers, email, or address" className="co-input min-w-[240px] flex-1" />
            <select name="status" defaultValue={sp.status ?? "all"} className="co-input w-full sm:w-auto">
              <option value="all">All statuses</option>
              {Object.entries(STATUS_LABELS).map(([value, label]) => (
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
            {sp.recurrence && <input type="hidden" name="recurrence" value={sp.recurrence} />}
            {sp.attention && <input type="hidden" name="attention" value={sp.attention} />}
            {sp.archived && <input type="hidden" name="archived" value={sp.archived} />}
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
                  <th className="px-5 py-3">LTV</th>
                  <th className="px-5 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--co-line-soft)]">
                {rows.map((row) => {
                  const nextJob = nextJobByCustomer.get(row.id);
                  const lastJob = lastJobByCustomer.get(row.id);
                  const ltv = ltvByCustomer.get(row.id) ?? 0;
                  const planLabel = row.recurrence && row.recurrence !== "none" ? RECURRENCE_LABELS[row.recurrence] ?? row.recurrence : "One-time";
                  const clientTypeLabel = row.clientType === "commercial" ? "Commercial" : "Residential";

                  return (
                    <tr key={row.id} className="transition-colors hover:bg-[var(--co-surface-muted)]/50">
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <InitialsAvatar firstName={row.firstName} lastName={row.lastName} companyName={row.companyName} className="h-10 w-10 rounded-full text-sm" />
                          <div className="min-w-0">
                            <Link href={`/customers/${row.id}`} className="font-semibold text-[var(--co-ink)] hover:text-[var(--co-evergreen)]">
                              {row.companyName ? row.companyName : `${row.firstName} ${row.lastName}`}
                            </Link>
                            {row.isArchived ? <span className="ml-2 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-500">Archived</span> : null}
                            <p className="text-xs text-[var(--co-muted)]">
                              {clientTypeLabel} · {planLabel}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <span className={`whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-medium ${STATUS_STYLES[row.status] ?? "border-slate-200 bg-slate-50 text-slate-600"}`}>
                          {STATUS_LABELS[row.status] ?? row.status}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-[var(--co-muted)]">
                        {row.addressLine1 ?? "Address missing"}
                        {row.city ? ` · ${row.city}` : ""}
                        {row.zip ? <span className="block text-xs">Area: {row.zip}</span> : null}
                      </td>
                      <td className="px-5 py-4">
                        {lastJob ? (
                          <>
                            <p className="font-medium">{lastJob.scheduledDate}</p>
                            <p className="text-xs text-[var(--co-muted)]">{TYPE_LABELS[lastJob.type] ?? lastJob.type}</p>
                          </>
                        ) : (
                          <span className="text-[var(--co-muted)]">—</span>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        {nextJob ? (
                          <Link href={`/jobs/${nextJob.id}`} className="font-medium text-[var(--co-evergreen)]">
                            {nextJob.scheduledDate}
                          </Link>
                        ) : (
                          <span className="text-[var(--co-muted)]">—</span>
                        )}
                      </td>
                      <td className="px-5 py-4 font-semibold">{money(ltv)}</td>
                      <td className="px-5 py-4 text-right">
                        <Link href={`/customers/${row.id}`} className="font-medium text-[var(--co-evergreen)]">
                          Open
                        </Link>
                      </td>
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
