import Link from "next/link";
import { CalendarDays, CreditCard, KeyRound, Mail, MapPin, PawPrint, Phone, Plus, ShieldBan } from "lucide-react";
import { TYPE_LABELS, money, type Customer, type Location, type CustomerJob } from "./shared";

function Card({ title, action, children, className = "" }: { title: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`co-card overflow-hidden ${className}`}>
      <div className="flex items-center justify-between gap-3 border-b border-[var(--co-line-soft)] px-5 py-4 sm:px-6">
        <h2 className="text-lg font-semibold tracking-[-0.02em]">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function Detail({ icon: Icon, label, children }: { icon: typeof Phone; label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--co-surface-muted)] text-[var(--co-evergreen)]"><Icon className="h-5 w-5" /></span>
      <div className="min-w-0 pt-0.5">
        <p className="text-[10px] font-bold uppercase tracking-[0.06em] text-[var(--co-muted)]">{label}</p>
        <div className="mt-1 text-sm font-medium leading-5 text-[var(--co-ink)]">{children}</div>
      </div>
    </div>
  );
}

function Preference({ icon: Icon, title, children }: { icon: typeof KeyRound; title: string; children: React.ReactNode }) {
  return (
    <article className="min-h-32 rounded-lg border border-[var(--co-line)] bg-[var(--co-surface-muted)]/80 p-4">
      <div className="flex gap-3">
        <Icon className="mt-0.5 h-5 w-5 shrink-0 text-[var(--co-evergreen)]" />
        <div>
          <h3 className="text-sm font-semibold">{title}</h3>
          <div className="mt-1 text-sm leading-5 text-[var(--co-muted)]">{children}</div>
        </div>
      </div>
    </article>
  );
}

export function CustomerViewCards({
  customer,
  location,
  primaryAddress,
  upcomingJobs,
  recentJobs,
  nextJob,
  openBalance,
  onEditFocus,
}: {
  customer: Customer;
  location: Location | null;
  locations: Location[];
  primaryAddress: string;
  upcomingJobs: CustomerJob[];
  recentJobs: CustomerJob[];
  nextJob: CustomerJob | null;
  lastJob: CustomerJob | null;
  openBalance: number;
  lifetimeSpendCents: number;
  auditLogs: unknown[];
  onEditFocus: () => void;
}) {
  const accessNotes = [
    location?.accessInstructions,
    location?.gateCode ? `Gate code: ${location.gateCode}` : null,
    location?.keyNumber ? `Key location: ${location.keyNumber}` : null,
    customer.gateCodeOrKeyNotes,
  ].filter(Boolean).join(" ");
  const preferredDays = customer.preferredDays?.map((day) => day.slice(0, 1).toUpperCase() + day.slice(1)).join(", ");
  const plan = customer.recurrence && customer.recurrence !== "none" ? customer.recurrence.replace("biweekly", "Every other week").replace(/^./, (letter) => letter.toUpperCase()) : "One-time service";

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-[var(--co-line)] bg-[var(--co-surface-muted)]/75 p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 text-[var(--co-evergreen)]"><CalendarDays className="h-6 w-6" /><h2 className="text-lg font-semibold">Active subscription</h2></div>
          <span className="rounded-full bg-[var(--co-evergreen)] px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-white">{customer.status === "client" ? "Active plan" : "Customer plan"}</span>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-3">
          <div className="rounded-lg bg-white p-4 shadow-sm"><p className="text-[10px] font-bold uppercase text-[var(--co-muted)]">Plan details</p><p className="mt-1 text-sm font-semibold">{plan}</p><p className="mt-1 text-sm text-[var(--co-muted)]">{preferredDays ? `${preferredDays}${customer.preferredTimeOfDay ? ` · ${customer.preferredTimeOfDay}` : ""}` : "Schedule preference not set"}</p></div>
          <div className="rounded-lg bg-white p-4 shadow-sm"><p className="text-[10px] font-bold uppercase text-[var(--co-muted)]">Next visit</p>{nextJob ? <Link href={`/jobs/${nextJob.id}`} className="mt-1 block text-sm font-semibold text-[var(--co-evergreen)] hover:underline">{new Date(`${nextJob.scheduledDate}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}<span className="mt-1 block font-normal text-[var(--co-muted)]">{nextJob.scheduledStartTime?.slice(0, 5) ?? "Time pending"}</span></Link> : <p className="mt-1 text-sm text-[var(--co-muted)]">No visit scheduled</p>}</div>
          <div className="rounded-lg bg-white p-4 shadow-sm"><p className="text-[10px] font-bold uppercase text-[var(--co-muted)]">Preferred cleaner</p><p className="mt-1 text-sm font-semibold">{customer.preferredCleanerId ? "Cleaner assigned" : "Any available cleaner"}</p><p className="mt-1 text-sm text-[var(--co-muted)]">{upcomingJobs.length ? `${upcomingJobs.length} upcoming visit${upcomingJobs.length === 1 ? "" : "s"}` : "No upcoming visits"}</p></div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[305px_minmax(0,1fr)]">
        <aside className="space-y-6">
          <Card title="Contact info" action={<button onClick={onEditFocus} className="text-sm font-semibold text-[var(--co-evergreen)] hover:underline">Edit</button>}>
            <div className="space-y-4 p-5">
              <Detail icon={Phone} label="Primary phone">{customer.phone || "No phone on file"}</Detail>
              <Detail icon={Mail} label="Email address">{customer.email || "No email on file"}</Detail>
              <div className="border-t border-[var(--co-line)] pt-4"><Detail icon={MapPin} label="Service address">{primaryAddress || "No service address on file"}</Detail></div>
              {primaryAddress ? <iframe title="Customer location map" src={`https://maps.google.com/maps?q=${encodeURIComponent(primaryAddress)}&output=embed`} className="h-32 w-full rounded-lg border-0" loading="lazy" referrerPolicy="no-referrer-when-downgrade" /> : null}
            </div>
          </Card>
          <Card title="Billing" action={<CreditCard className="h-5 w-5 text-[var(--co-muted)]" />}>
            <div className="space-y-3 p-5"><div className="rounded-lg bg-[var(--co-surface-muted)] p-3 text-sm"><p className="font-semibold">{customer.paymentMethods?.length ? customer.paymentMethods.join(" · ") : "Payment method not set"}</p><p className="mt-1 text-xs text-[var(--co-muted)]">{openBalance ? `${money(openBalance)} outstanding` : "No open balance"}</p></div><Link href="/invoices" className="inline-flex items-center gap-1 text-sm font-semibold text-[var(--co-evergreen)] hover:underline">View all invoices →</Link></div>
          </Card>
        </aside>
        <div className="space-y-6">
          <Card title="Service history" action={<Link href="/jobs" className="text-sm font-semibold text-[var(--co-evergreen)] hover:underline">View all activity →</Link>}>
            {recentJobs.length ? <div className="overflow-x-auto"><table className="w-full min-w-[620px] text-left text-sm"><thead className="bg-[var(--co-surface-muted)] text-[10px] font-bold uppercase tracking-wide text-[var(--co-muted)]"><tr><th className="px-6 py-3">Date</th><th className="px-4 py-3">Service type</th><th className="px-4 py-3">Price</th><th className="px-6 py-3 text-right">Status</th></tr></thead><tbody>{recentJobs.slice(0, 5).map((job) => <tr key={job.id} className="border-t border-[var(--co-line-soft)]"><td className="px-6 py-4"><Link href={`/jobs/${job.id}`} className="font-medium hover:text-[var(--co-evergreen)] hover:underline">{new Date(`${job.scheduledDate}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</Link></td><td className="px-4 py-4 font-medium">{TYPE_LABELS[job.type] ?? job.type}</td><td className="px-4 py-4">{money(job.priceCents)}</td><td className="px-6 py-4 text-right"><span className={`rounded px-2 py-1 text-[10px] font-bold uppercase ${job.status === "completed" ? "bg-emerald-50 text-emerald-800" : job.status === "cancelled" ? "bg-rose-50 text-rose-700" : "bg-slate-100 text-slate-600"}`}>{job.status.replaceAll("_", " ")}</span></td></tr>)}</tbody></table></div> : <p className="p-6 text-sm text-[var(--co-muted)]">No service history yet.</p>}
          </Card>
          <Card title="Service notes & preferences" action={<button onClick={onEditFocus} className="text-sm font-semibold text-[var(--co-evergreen)] hover:underline">Edit</button>}>
            <div className="grid gap-4 p-5 md:grid-cols-2"><Preference icon={KeyRound} title="Access instructions">{accessNotes || "No access instructions recorded."}</Preference><Preference icon={PawPrint} title="Pet warning">{customer.petNotes || "No pet notes recorded."}</Preference><Preference icon={ShieldBan} title="Out-of-bounds">{customer.operationalNotes || customer.importantToCustomer || "No restricted areas recorded."}</Preference><button onClick={onEditFocus} className="flex min-h-32 flex-col items-center justify-center rounded-lg border border-dashed border-[var(--co-line)] bg-[var(--co-surface-muted)]/30 text-sm font-semibold uppercase tracking-wide text-[var(--co-muted)] hover:border-[var(--co-evergreen)] hover:text-[var(--co-evergreen)]"><Plus className="mb-2 h-6 w-6" />Add preference</button></div>
          </Card>
        </div>
      </section>
    </div>
  );
}
