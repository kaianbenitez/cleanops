import Link from "next/link";
import { redirect } from "next/navigation";
import { and, eq, ilike, inArray, isNotNull, isNull, ne, or } from "drizzle-orm";
import { db } from "@/db";
import { customers, invoices, jobs } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";

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

type SearchParams = {
  q?: string;
  status?: string;
  payment?: string;
  recurrence?: string;
  attention?: string;
  clientType?: string;
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
    if (name !== key && current) next.set(name, current);
  });
  if (value) next.set(key, value);
  const query = next.toString();
  return query ? `/customers?${query}` : "/customers";
}

function statCard({ label, value, note, href }: { label: string; value: string; note: string; href: string }) {
  return (
    <Link href={href} className="co-card group p-5 transition hover:-translate-y-0.5 hover:border-[var(--co-evergreen)]">
      <p className="text-xs font-medium uppercase tracking-[0.1em] text-[var(--co-muted)]">{label}</p>
      <p className="mt-2 text-3xl font-semibold tracking-[-0.04em]">{value}</p>
      <p className="mt-2 text-xs text-[var(--co-muted)]">{note}</p>
      <span className="mt-3 block text-xs font-medium text-[var(--co-evergreen)] opacity-80 group-hover:opacity-100">View details</span>
    </Link>
  );
}

function panel({ eyebrow, title, description, children }: { eyebrow: string; title: string; description?: string; children: React.ReactNode }) {
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

export default async function CustomersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const admin = await getCurrentUser();
  if (!admin) redirect("/login");
  if (admin.role !== "admin") redirect("/my-day");

  const sp = await searchParams;
  const conditions = [eq(customers.companyId, admin.companyId)];

  if (sp.status && sp.status !== "all") conditions.push(eq(customers.status, sp.status as typeof customers.status.enumValues[number]));
  if (sp.clientType && sp.clientType !== "all") conditions.push(eq(customers.clientType, sp.clientType as typeof customers.clientType.enumValues[number]));
  if (sp.recurrence === "recurring") conditions.push(and(isNotNull(customers.recurrence), ne(customers.recurrence, "none"))!);
  if (sp.payment === "missing") conditions.push(isNull(customers.paymentMethods));
  if (sp.attention === "yes") conditions.push(or(isNull(customers.paymentMethods), isNull(customers.addressLine1), eq(customers.addressLine1, ""))!);
  if (sp.q?.trim()) {
    const query = `%${sp.q.trim()}%`;
    conditions.push(or(ilike(customers.firstName, query), ilike(customers.lastName, query), ilike(customers.companyName, query), ilike(customers.email, query), ilike(customers.addressLine1, query))!);
  }

  const rows: CustomerRow[] = await db
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
      tags: customers.tags,
    })
    .from(customers)
    .where(and(...conditions))
    .orderBy(customers.lastName, customers.firstName);

  const customerIds = rows.map((row) => row.id);
  const customerJobs: JobRow[] = customerIds.length
    ? await db
        .select({
          customerId: jobs.customerId,
          id: jobs.id,
          status: jobs.status,
          scheduledDate: jobs.scheduledDate,
          scheduledStartTime: jobs.scheduledStartTime,
          type: jobs.type,
        })
        .from(jobs)
        .where(inArray(jobs.customerId, customerIds))
    : [];
  const customerInvoices: InvoiceRow[] = customerIds.length
    ? await db
        .select({
          customerId: invoices.customerId,
          status: invoices.status,
          totalCents: invoices.totalCents,
          amountPaidCents: invoices.amountPaidCents,
        })
        .from(invoices)
        .where(inArray(invoices.customerId, customerIds))
    : [];

  const nextJobByCustomer = new Map<string, JobRow>();
  customerJobs
    .filter((job) => !["completed", "cancelled", "no_show"].includes(job.status))
    .sort((a, b) => `${a.scheduledDate}${a.scheduledStartTime ?? ""}`.localeCompare(`${b.scheduledDate}${b.scheduledStartTime ?? ""}`))
    .forEach((job) => {
      if (!nextJobByCustomer.has(job.customerId)) nextJobByCustomer.set(job.customerId, job);
    });

  const openInvoiceByCustomer = new Map<string, number>();
  customerInvoices.forEach((invoice) => {
    if (invoice.status !== "paid" && invoice.status !== "void") {
      openInvoiceByCustomer.set(invoice.customerId, (openInvoiceByCustomer.get(invoice.customerId) ?? 0) + Math.max(invoice.totalCents - invoice.amountPaidCents, 0));
    }
  });

  const recurringCount = rows.filter((row) => row.recurrence && row.recurrence !== "none").length;
  const attentionCount = rows.filter((row) => !row.paymentMethods?.length || !row.addressLine1).length;
  const openBalance = [...openInvoiceByCustomer.values()].reduce((sum, value) => sum + value, 0);
  const leadCount = rows.filter((row) => row.status === "lead").length;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="eyebrow">Operations / Relationships</p>
          <h1 className="page-title">Customers</h1>
          <p className="page-subtitle">Keep every home, preference, and service history ready for the next visit.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="rounded-xl border border-[var(--co-line)] bg-[var(--co-surface)] px-3 py-2 text-xs text-[var(--co-muted)]">Contacts are imported from GHL</div>
          <Link href="/customers/new" className="co-button-primary">
            + Add customer
          </Link>
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {statCard({ label: "Recurring", value: String(recurringCount), note: "Active repeat clients", href: hrefWith(sp, "recurrence", "recurring") })}
        {statCard({ label: "Needs attention", value: String(attentionCount), note: "Missing profile details", href: hrefWith(sp, "attention", "yes") })}
        {statCard({ label: "Leads", value: String(leadCount), note: "Not yet converted", href: hrefWith(sp, "status", "lead") })}
        {statCard({ label: "Open balance", value: money(openBalance), note: "Uncollected invoices", href: "/invoices?status=sent" })}
      </section>

      <section className="flex flex-wrap gap-3">
        <Link href={hrefWith(sp, "recurrence", "recurring")} className={`co-card flex items-center gap-3 px-4 py-3 ${sp.recurrence === "recurring" ? "border-[var(--co-evergreen)]" : ""}`}>
          <span className="text-xl text-[var(--co-evergreen)]">↻</span>
          <span>
            <span className="block text-xs text-[var(--co-muted)]">Recurring</span>
            <span className="block text-lg font-semibold">{recurringCount}</span>
          </span>
        </Link>
        <Link href={hrefWith(sp, "attention", "yes")} className={`co-card flex items-center gap-3 px-4 py-3 ${sp.attention === "yes" ? "border-amber-300" : ""}`}>
          <span className="text-xl text-amber-600">!</span>
          <span>
            <span className="block text-xs text-[var(--co-muted)]">Needs attention</span>
            <span className="block text-lg font-semibold">{attentionCount}</span>
          </span>
        </Link>
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.35fr_0.65fr]">
        <div className="space-y-5">
          <section className="co-card overflow-hidden">
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
              <button type="submit" className="co-button-secondary">
                Filter customers
              </button>
              {Object.keys(sp).length ? (
                <Link href="/customers" className="self-center text-sm font-medium text-[var(--co-evergreen)]">
                  Clear
                </Link>
              ) : null}
            </form>

            {rows.length === 0 ? (
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
                      <th className="px-5 py-3">Next cleaning</th>
                      <th className="px-5 py-3">Plan</th>
                      <th className="px-5 py-3">Payment</th>
                      <th className="px-5 py-3">Attention</th>
                      <th className="px-5 py-3"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--co-line-soft)]">
                    {rows.map((row) => {
                      const nextJob = nextJobByCustomer.get(row.id);
                      const balance = openInvoiceByCustomer.get(row.id) ?? 0;
                      const missing = !row.paymentMethods?.length || !row.addressLine1;

                      return (
                        <tr key={row.id} className="transition-colors hover:bg-[var(--co-surface-muted)]/50">
                          <td className="px-5 py-4">
                            <Link href={`/customers/${row.id}`} className="font-semibold text-[var(--co-ink)] hover:text-[var(--co-evergreen)]">
                              {row.companyName ? row.companyName : `${row.firstName} ${row.lastName}`}
                            </Link>
                            {row.clientType === "commercial" ? (
                              <span className="ml-2 rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-blue-700">Commercial</span>
                            ) : null}
                            {row.companyName ? (
                              <span className="mt-1 block text-xs text-[var(--co-muted)]">Contact: {row.firstName} {row.lastName}</span>
                            ) : null}
                            <span className="mt-1 block text-xs text-[var(--co-muted)]">
                              {row.addressLine1 ?? "Address missing"}
                              {row.city ? ` · ${row.city}` : ""}
                            </span>
                            <span className="mt-1 block text-xs text-[var(--co-muted)]">
                              {row.email ?? "No email"} {row.phone ? ` · ${row.phone}` : ""}
                            </span>
                          </td>
                          <td className="px-5 py-4">
                            <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${STATUS_STYLES[row.status] ?? "border-slate-200 bg-slate-50 text-slate-600"}`}>
                              {STATUS_LABELS[row.status] ?? row.status}
                            </span>
                          </td>
                          <td className="px-5 py-4">
                            {nextJob ? (
                              <Link href={`/jobs/${nextJob.id}`} className="font-medium text-[var(--co-evergreen)]">
                                {nextJob.scheduledDate}
                                <span className="block text-xs text-[var(--co-muted)]">{nextJob.scheduledStartTime?.slice(0, 5) ?? "No time"}</span>
                              </Link>
                            ) : (
                              <span className="text-[var(--co-muted)]">—</span>
                            )}
                          </td>
                          <td className="px-5 py-4 text-[var(--co-muted)]">
                            {row.recurrence && row.recurrence !== "none" ? row.recurrence : "One-time"}
                            <span className="block text-xs">{row.clientType === "commercial" ? "Commercial" : "Residential"}</span>
                          </td>
                          <td className="px-5 py-4">
                            {row.paymentMethods?.length ? <span className="text-[var(--co-muted)]">{row.paymentMethods.join(", ")}</span> : <span className="font-medium text-amber-700">Missing</span>}
                            {balance > 0 ? <span className="block text-xs text-rose-600">{money(balance)} due</span> : null}
                          </td>
                          <td className="px-5 py-4">
                            {missing ? <span className="rounded-full bg-amber-50 px-2 py-1 text-xs text-amber-700">Review profile</span> : <span className="text-xs text-emerald-700">Ready</span>}
                          </td>
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
            <div className="border-t border-[var(--co-line-soft)] px-5 py-3 text-xs text-[var(--co-muted)]">Showing {rows.length} customer{rows.length === 1 ? "" : "s"}</div>
          </section>
        </div>

        <div className="space-y-5">
          {panel({
            eyebrow: "Office workflow",
            title: "How this screen should be used",
            description: "This is the customer hub for office staff.",
            children: (
              <div className="space-y-4 text-sm text-[var(--co-muted)]">
                <p>Use this page to find a customer quickly, verify whether they are recurring, and jump into the profile when something is missing.</p>
                <div className="rounded-2xl border border-[var(--co-line-soft)] bg-[var(--co-surface-muted)]/35 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--co-muted)]">Good signals</p>
                  <ul className="mt-3 space-y-2">
                    <li>• Recurring customers are visible at a glance</li>
                    <li>• Missing payment method or address is flagged</li>
                    <li>• Next job link goes directly to the job detail</li>
                  </ul>
                </div>
                <div className="rounded-2xl border border-[var(--co-line-soft)] bg-[var(--co-surface-muted)]/35 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--co-muted)]">Later, if needed</p>
                  <p className="mt-2">We can add a selected-customer preview panel here, but the current focus is speed, search, and handoff to the profile page.</p>
                </div>
              </div>
            ),
          })}

          {panel({
            eyebrow: "Quick actions",
            title: "Admin shortcuts",
            children: (
              <div className="space-y-2">
                <Link href="/customers/new" className="co-button-primary block w-full text-center">
                  + Add customer
                </Link>
                <Link href="/quotes/new" className="co-button-secondary block w-full text-center">
                  Create quote
                </Link>
                <Link href="/calendar" className="co-button-secondary block w-full text-center">
                  Open calendar
                </Link>
                <Link href="/dashboard" className="co-button-secondary block w-full text-center">
                  Back to dashboard
                </Link>
              </div>
            ),
          })}
        </div>
      </section>
    </div>
  );
}
