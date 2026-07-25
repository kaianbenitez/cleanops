import Link from "next/link";
import { redirect } from "next/navigation";
import { and, eq, gte, ilike, inArray, lte, or } from "drizzle-orm";
import { db } from "@/db";
import { customers, invoices, jobAssignments, jobs, users } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";

const TYPE_LABELS: Record<string, string> = { first_clean: "First clean", recurring: "Recurring", one_time: "One-time", deep_clean: "Deep clean", move_out: "Move in/out" };
const STATUS_LABELS: Record<string, string> = { scheduled: "Scheduled", in_progress: "In progress", completed: "Completed", cancelled: "Cancelled", no_show: "No show" };
const STATUS_STYLES: Record<string, string> = {
  scheduled: "border-slate-200 bg-slate-50 text-slate-600", in_progress: "border-amber-200 bg-amber-50 text-amber-700",
  completed: "border-emerald-200 bg-emerald-50 text-emerald-700", cancelled: "border-slate-200 bg-slate-50 text-slate-500", no_show: "border-rose-200 bg-rose-50 text-rose-700",
};
type SearchParams = { q?: string; status?: string; employeeId?: string; type?: string; tab?: string; page?: string; from?: string; to?: string };

function dateOnly(date: Date) { return date.toISOString().slice(0, 10); }
function addDays(date: Date, days: number) { const next = new Date(date); next.setDate(next.getDate() + days); return next; }
function money(cents: number) { return `$${(cents / 100).toFixed(2)}`; }
function hrefWith(params: SearchParams, changes: Partial<Record<keyof SearchParams, string | undefined>>) {
  const next = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => { if (!(key in changes) && value) next.set(key, value); });
  Object.entries(changes).forEach(([key, value]) => { if (value) next.set(key, value); });
  const query = next.toString(); return query ? `/jobs?${query}` : "/jobs";
}
function statusPill(status: string) { return <span className={`inline-flex rounded-md border px-2 py-1 text-xs font-semibold ${STATUS_STYLES[status] ?? STATUS_STYLES.scheduled}`}>{STATUS_LABELS[status] ?? status}</span>; }
function isActive(status: string) { return status === "scheduled" || status === "in_progress"; }

export default async function JobsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const admin = await getCurrentUser();
  if (!admin) redirect("/login");
  if (admin.role !== "admin") redirect("/my-day");
  const sp = await searchParams;
  const today = new Date();
  const from = sp.from ?? dateOnly(addDays(today, -14));
  const to = sp.to ?? dateOnly(addDays(today, 45));
  const tab = sp.tab ?? "active";
  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const conditions = [eq(jobs.companyId, admin.companyId), gte(jobs.scheduledDate, from), lte(jobs.scheduledDate, to)];
  if (sp.status && sp.status !== "all") conditions.push(eq(jobs.status, sp.status as typeof jobs.status.enumValues[number]));
  if (sp.type) conditions.push(eq(jobs.type, sp.type as typeof jobs.type.enumValues[number]));
  if (sp.q?.trim()) { const q = `%${sp.q.trim()}%`; conditions.push(or(ilike(customers.firstName, q), ilike(customers.lastName, q), ilike(customers.addressLine1, q), ilike(customers.city, q))!); }
  const [rawRows, employees] = await Promise.all([
    db.select({ id: jobs.id, customerId: jobs.customerId, type: jobs.type, status: jobs.status, scheduledDate: jobs.scheduledDate, scheduledStartTime: jobs.scheduledStartTime, priceCents: jobs.priceCents, customerFirstName: customers.firstName, customerLastName: customers.lastName, addressLine1: customers.addressLine1, city: customers.city, state: customers.state })
      .from(jobs).innerJoin(customers, eq(jobs.customerId, customers.id)).where(and(...conditions)).orderBy(jobs.scheduledDate, jobs.scheduledStartTime).limit(500),
    db.select({ id: users.id, firstName: users.firstName, lastName: users.lastName }).from(users).where(and(eq(users.companyId, admin.companyId), eq(users.role, "employee"))).orderBy(users.firstName),
  ]);
  const ids = rawRows.map((row) => row.id);
  const [assignmentRows, invoiceRows] = await Promise.all([
    ids.length ? db.select({ jobId: jobAssignments.jobId, userId: users.id, firstName: users.firstName, lastName: users.lastName }).from(jobAssignments).innerJoin(users, eq(jobAssignments.userId, users.id)).where(inArray(jobAssignments.jobId, ids)) : Promise.resolve([]),
    ids.length ? db.select({ jobId: invoices.jobId, status: invoices.status }).from(invoices).where(inArray(invoices.jobId, ids)) : Promise.resolve([]),
  ]);
  const assignments = new Map<string, typeof assignmentRows>();
  assignmentRows.forEach((row) => assignments.set(row.jobId, [...(assignments.get(row.jobId) ?? []), row]));
  const invoiceByJob = new Map<string, string>(); invoiceRows.forEach((row) => row.jobId && invoiceByJob.set(row.jobId, row.status));
  let rows = rawRows.filter((row) => {
    const assigned = (assignments.get(row.id) ?? []).length > 0;
    if (tab === "history") return ["completed", "cancelled", "no_show"].includes(row.status);
    if (tab === "pending") return isActive(row.status) && !assigned;
    return isActive(row.status) && assigned;
  });
  if (sp.employeeId) rows = rows.filter((row) => (assignments.get(row.id) ?? []).some((assignment) => assignment.userId === sp.employeeId));
  const total = rows.length; const pageCount = Math.max(1, Math.ceil(total / 25)); const currentPage = Math.min(page, pageCount); const pageRows = rows.slice((currentPage - 1) * 25, currentPage * 25);
  const todayText = dateOnly(today);
  const activeToday = rawRows.filter((row) => row.scheduledDate === todayText && isActive(row.status) && (assignments.get(row.id) ?? []).length > 0).length;
  const pending = rawRows.filter((row) => isActive(row.status) && !(assignments.get(row.id) ?? []).length).length;
  const completedToday = rawRows.filter((row) => row.scheduledDate === todayText && row.status === "completed").length;
  const awaitingInvoice = rawRows.filter((row) => row.status === "completed" && !invoiceByJob.has(row.id)).length;
  const clear = hrefWith(sp, { q: undefined, status: undefined, employeeId: undefined, type: undefined, page: undefined });
  return <div className="space-y-6">
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div><p className="eyebrow">Operations</p><h1 className="page-title">Jobs</h1><p className="page-subtitle">A clear view of the work that needs attention.</p></div>
      <div className="flex flex-wrap gap-2"><Link href="/calendar" className="co-button-secondary">Open calendar</Link><Link href="/jobs/new" className="co-button-primary">New job</Link></div>
    </header>
    <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {[['Active today', activeToday, 'assigned visits'], ['Pending assignment', pending, 'need a cleaner'], ['Completed today', completedToday, 'closed visits'], ['Awaiting invoice', awaitingInvoice, 'ready for handoff']].map(([label, value, hint]) => <div key={String(label)} className="border-l-2 border-[var(--co-evergreen)] bg-white px-4 py-3"><p className="text-xs text-[var(--co-muted)]">{label}</p><p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p><p className="text-xs text-[var(--co-faint)]">{hint}</p></div>)}
    </section>
    <section className="co-card overflow-hidden">
      <nav className="flex flex-wrap border-b border-[var(--co-line-soft)] px-4 pt-2" aria-label="Job views">
        {[['active', 'Active'], ['pending', 'Pending'], ['history', 'History']].map(([value, label]) => <Link key={value} href={hrefWith(sp, { tab: value, page: undefined })} className={`border-b-2 px-4 py-3 text-sm font-semibold ${tab === value ? 'border-[var(--co-evergreen)] text-[var(--co-evergreen)]' : 'border-transparent text-[var(--co-muted)] hover:text-[var(--co-ink)]'}`}>{label}{value === 'pending' && pending ? <span className="ml-2 text-xs text-amber-700">{pending}</span> : null}</Link>)}
      </nav>
      <form className="grid gap-3 border-b border-[var(--co-line-soft)] bg-[var(--co-surface-muted)]/35 p-4 md:grid-cols-2 xl:grid-cols-[1.5fr_1fr_1fr_1fr_auto]" action="/jobs">
        <input name="q" defaultValue={sp.q} placeholder="Search customer or address" className="co-input" />
        <select name="employeeId" defaultValue={sp.employeeId ?? ""} className="co-input"><option value="">All cleaners</option>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.firstName} {employee.lastName}</option>)}</select>
        <select name="type" defaultValue={sp.type ?? ""} className="co-input"><option value="">All service types</option>{Object.entries(TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
        <select name="status" defaultValue={sp.status ?? "all"} className="co-input"><option value="all">All statuses</option>{Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
        <input type="hidden" name="tab" value={tab} /><button type="submit" className="co-button-secondary">Filter</button>
        <div className="flex flex-wrap items-center gap-2 md:col-span-2 xl:col-span-5"><label className="text-xs font-semibold text-[var(--co-muted)]">From <input type="date" name="from" defaultValue={from} className="co-input ml-1" /></label><label className="text-xs font-semibold text-[var(--co-muted)]">To <input type="date" name="to" defaultValue={to} className="co-input ml-1" /></label><Link href={clear} className="text-xs font-semibold text-[var(--co-muted)] hover:text-[var(--co-evergreen)]">Reset</Link></div>
      </form>
      {pageRows.length === 0 ? <div className="px-6 py-16 text-center"><p className="font-semibold">No jobs in this view.</p><p className="mt-1 text-sm text-[var(--co-muted)]">Try another tab, date range, or filter.</p></div> : <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead className="border-b border-[var(--co-line-soft)] bg-[var(--co-surface-muted)]/40 text-xs font-semibold text-[var(--co-muted)]"><tr>{['Job ID', 'Customer', 'Service type', 'Assigned cleaners', 'Schedule', 'Status', 'Total'].map((header) => <th key={header} className="px-4 py-3">{header}</th>)}</tr></thead><tbody className="divide-y divide-[var(--co-line-soft)]">{pageRows.map((row) => { const assigned = assignments.get(row.id) ?? []; const href = `/jobs/${row.id}`; return <tr key={row.id} className="group hover:bg-[var(--co-surface-muted)]/45"><td className="px-4 py-4 font-mono text-xs text-[var(--co-faint)]"><Link href={href} className="block">#{row.id.slice(0, 8).toUpperCase()}</Link></td><td className="px-4 py-4"><Link href={href} className="block font-semibold text-[var(--co-ink)]">{row.customerFirstName} {row.customerLastName}<span className="mt-0.5 block max-w-[220px] truncate text-xs font-normal text-[var(--co-muted)]">{row.addressLine1 ?? 'No address'}{row.city ? ` · ${row.city}` : ''}</span></Link></td><td className="px-4 py-4 text-[var(--co-muted)]">{TYPE_LABELS[row.type] ?? row.type}</td><td className="px-4 py-4">{assigned.length ? <div className="space-y-1">{assigned.map((person, index) => <p key={person.userId} className="text-xs font-medium">{person.firstName} {person.lastName}<span className="ml-1 text-[var(--co-faint)]">{index === 0 ? 'Lead' : 'Helper'}</span></p>)}</div> : <span className="text-xs font-semibold text-amber-700">Unassigned</span>}</td><td className="px-4 py-4"><span className="font-medium">{row.scheduledDate}</span><span className="block text-xs text-[var(--co-muted)]">{row.scheduledStartTime?.slice(0, 5) ?? 'No time'}</span></td><td className="px-4 py-4">{statusPill(row.status)}</td><td className="px-4 py-4 font-semibold">{money(row.priceCents)}{row.status === 'completed' && !invoiceByJob.has(row.id) ? <span className="mt-1 block text-[11px] font-normal text-amber-700">Needs invoice</span> : null}</td></tr>; })}</tbody></table></div>}
      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--co-line-soft)] px-4 py-3 text-xs text-[var(--co-muted)]"><span>{total ? `${(currentPage - 1) * 25 + 1}–${Math.min(currentPage * 25, total)} of ${total}` : '0 jobs'} · 25 per page</span><div className="flex gap-2"><Link aria-disabled={currentPage <= 1} className={`co-button-secondary min-h-0 px-3 py-2 ${currentPage <= 1 ? 'pointer-events-none opacity-40' : ''}`} href={hrefWith(sp, { page: String(currentPage - 1) })}>Previous</Link><Link aria-disabled={currentPage >= pageCount} className={`co-button-secondary min-h-0 px-3 py-2 ${currentPage >= pageCount ? 'pointer-events-none opacity-40' : ''}`} href={hrefWith(sp, { page: String(currentPage + 1) })}>Next</Link></div></footer>
    </section>
  </div>;
}
