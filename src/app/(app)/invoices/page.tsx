import Link from "next/link";
import { redirect } from "next/navigation";
import { and, desc, eq, ilike, or } from "drizzle-orm";
import { db } from "@/db";
import { customers, invoices, jobs } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";

type SearchParams = { q?: string; status?: string };

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  sent: "Pending",
  paid: "Paid",
  void: "Void",
};

const STATUS_STYLES: Record<string, string> = {
  draft: "border-slate-200 bg-slate-50 text-slate-600",
  sent: "border-amber-200 bg-amber-50 text-amber-700",
  paid: "border-emerald-200 bg-emerald-50 text-emerald-700",
  void: "border-slate-200 bg-slate-50 text-slate-400",
};

function dollars(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function isOverdue(status: string, createdAt: Date) {
  return status === "sent" && Date.now() - new Date(createdAt).getTime() > 14 * 24 * 60 * 60 * 1000;
}

function queryHref(params: SearchParams, key: keyof SearchParams, value: string) {
  const next = new URLSearchParams();
  Object.entries(params).forEach(([name, current]) => {
    if (name !== key && current) next.set(name, current);
  });
  if (value) next.set(key, value);
  const query = next.toString();
  return query ? `/invoices?${query}` : "/invoices";
}

function statsCard({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="co-card p-5">
      <p className="text-xs font-medium uppercase tracking-[0.1em] text-[var(--co-muted)]">{label}</p>
      <p className="mt-2 text-3xl font-semibold tracking-[-0.04em]">{value}</p>
      <p className="mt-2 text-xs text-[var(--co-muted)]">{note}</p>
    </div>
  );
}

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const admin = await getCurrentUser();
  if (!admin) redirect("/login");
  if (admin.role !== "admin") redirect("/my-day");

  const sp = await searchParams;
  const conditions = [eq(invoices.companyId, admin.companyId)];
  if (sp.status && sp.status !== "all") conditions.push(eq(invoices.status, sp.status as typeof invoices.status.enumValues[number]));
  if (sp.q?.trim()) {
    const query = `%${sp.q.trim()}%`;
    conditions.push(or(ilike(customers.firstName, query), ilike(customers.lastName, query), ilike(invoices.id, query))!);
  }

  const rows = await db
    .select({
      id: invoices.id,
      status: invoices.status,
      method: invoices.method,
      totalCents: invoices.totalCents,
      amountPaidCents: invoices.amountPaidCents,
      createdAt: invoices.createdAt,
      customerId: customers.id,
      customerFirstName: customers.firstName,
      customerLastName: customers.lastName,
      jobType: jobs.type,
      jobScheduledDate: jobs.scheduledDate,
    })
    .from(invoices)
    .innerJoin(customers, eq(invoices.customerId, customers.id))
    .leftJoin(jobs, eq(invoices.jobId, jobs.id))
    .where(and(...conditions))
    .orderBy(desc(invoices.createdAt));

  const counts = {
    all: rows.length,
    paid: rows.filter((row) => row.status === "paid").length,
    sent: rows.filter((row) => row.status === "sent").length,
    overdue: rows.filter((row) => isOverdue(row.status, row.createdAt)).length,
  };
  const overdueTotal = rows.filter((row) => isOverdue(row.status, row.createdAt)).reduce((sum, row) => sum + Math.max(row.totalCents - row.amountPaidCents, 0), 0);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="eyebrow">Operations / Billing</p>
          <h1 className="page-title">Invoices</h1>
          <p className="page-subtitle">Send, track, and reconcile every customer payment.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/jobs?status=completed" className="co-button-secondary">
            Completed jobs
          </Link>
          <Link href="/jobs" className="co-button-primary">
            Find completed jobs
          </Link>
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "All invoices", value: String(counts.all), note: "Current billing records" },
          { label: "Paid", value: String(counts.paid), note: "Collected and closed" },
          { label: "Pending", value: String(counts.sent), note: "Waiting on payment" },
          { label: "Overdue", value: String(counts.overdue), note: "Needs follow-up" },
        ].map((item) => statsCard(item))}
      </section>

      {counts.overdue > 0 ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {counts.overdue} overdue invoice{counts.overdue === 1 ? "" : "s"} totaling {dollars(overdueTotal)}.
        </div>
      ) : null}

      <section className="co-card overflow-hidden">
        <form className="flex flex-wrap gap-3 border-b border-[var(--co-line-soft)] bg-[var(--co-surface-muted)]/40 p-4">
          <input name="q" defaultValue={sp.q} placeholder="Search invoices or customers" className="co-input min-w-[240px] flex-1" />
          <select name="status" defaultValue={sp.status ?? "all"} className="co-input w-full sm:w-auto">
            <option value="all">All statuses</option>
            <option value="draft">Draft</option>
            <option value="sent">Pending</option>
            <option value="paid">Paid</option>
            <option value="void">Void</option>
          </select>
          <button type="submit" className="co-button-secondary">
            Filter invoices
          </button>
          {Object.keys(sp).length ? (
            <Link href="/invoices" className="self-center text-sm font-medium text-[var(--co-evergreen)]">
              Clear
            </Link>
          ) : null}
        </form>

        {rows.length === 0 ? (
          <div className="p-12 text-center">
            <p className="font-medium">No invoices found.</p>
            <p className="mt-1 text-sm text-[var(--co-muted)]">Create an invoice from a completed job.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-left text-sm">
              <thead className="bg-[var(--co-surface-muted)] text-xs uppercase tracking-[0.1em] text-[var(--co-muted)]">
                <tr>
                  <th className="px-5 py-3">Invoice</th>
                  <th className="px-5 py-3">Customer</th>
                  <th className="px-5 py-3">Job</th>
                  <th className="px-5 py-3">Amount</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Method</th>
                  <th className="px-5 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--co-line-soft)]">
                {rows.map((invoice) => {
                  const overdue = isOverdue(invoice.status, invoice.createdAt);
                  return (
                    <tr key={invoice.id} className="hover:bg-[var(--co-surface-muted)]/50">
                      <td className="px-5 py-4">
                        <Link href={`/invoices/${invoice.id}`} className="font-semibold text-[var(--co-evergreen)]">
                          INV-{invoice.id.slice(0, 6).toUpperCase()}
                        </Link>
                        <span className="mt-1 block text-xs text-[var(--co-muted)]">{new Date(invoice.createdAt).toLocaleDateString()}</span>
                      </td>
                      <td className="px-5 py-4 font-medium">
                        <Link href={`/customers/${invoice.customerId}`} className="hover:underline">
                          {invoice.customerFirstName} {invoice.customerLastName}
                        </Link>
                      </td>
                      <td className="px-5 py-4 text-[var(--co-muted)]">
                        {invoice.jobType?.replaceAll("_", " ") ?? "—"}
                        <span className="block text-xs">{invoice.jobScheduledDate ?? ""}</span>
                      </td>
                      <td className="px-5 py-4">
                        <span className="font-semibold">{dollars(invoice.totalCents)}</span>
                        {invoice.amountPaidCents > 0 && invoice.status !== "paid" ? (
                          <span className="block text-xs text-[var(--co-muted)]">{dollars(invoice.amountPaidCents)} paid</span>
                        ) : null}
                      </td>
                      <td className="px-5 py-4">
                        <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${STATUS_STYLES[invoice.status] ?? "border-slate-200 bg-slate-50"}`}>
                          {overdue ? "Overdue" : STATUS_LABELS[invoice.status] ?? invoice.status}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-[var(--co-muted)]">{invoice.method ?? "—"}</td>
                      <td className="px-5 py-4 text-right">
                        <Link href={`/invoices/${invoice.id}`} className="font-medium text-[var(--co-evergreen)]">
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

        <div className="border-t border-[var(--co-line-soft)] px-5 py-3 text-xs text-[var(--co-muted)]">Showing {rows.length} invoice{rows.length === 1 ? "" : "s"}</div>
      </section>
    </div>
  );
}
