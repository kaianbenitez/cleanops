import Link from "next/link";
import { useState } from "react";
import { CalendarDays, Cat, CircleAlert, Clock3, CreditCard, KeyRound, Mail, MapPin, NotebookText, Phone, Sparkles } from "lucide-react";
import { StatusPill } from "@/components/ui/status-pill";
import { MaskedCode } from "@/components/ui/masked-code";
import { TYPE_LABELS, money, formatEstimatedTime, type Customer, type Location, type CustomerJob } from "./shared";
import { formatDisplayDate } from "@/lib/scheduling/dates";
import { cleanNoteText } from "@/lib/format";

const UPCOMING_VISITS_PREVIEW_COUNT = 3;

function UpcomingVisits({ upcomingJobs }: { upcomingJobs: CustomerJob[] }) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? upcomingJobs : upcomingJobs.slice(0, UPCOMING_VISITS_PREVIEW_COUNT);
  const remaining = upcomingJobs.length - visible.length;

  return (
    <Card title="Upcoming visits" action={<Link href="/calendar" className="text-sm font-semibold text-[var(--co-evergreen)] hover:underline">Open calendar →</Link>}>
      {upcomingJobs.length ? (
        <div className="divide-y divide-[var(--co-line-soft)]">
          {visible.map((job) => (
            <Link key={job.id} href={`/jobs/${job.id}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-[var(--co-surface-muted)] sm:px-6">
              <div>
                <p className="text-sm font-medium">{formatDisplayDate(job.scheduledDate)}</p>
                <p className="text-xs text-[var(--co-muted)]">{job.scheduledStartTime?.slice(0, 5) ?? "Time pending"} · {TYPE_LABELS[job.type] ?? job.type}</p>
                <p className="mt-1 text-xs text-[var(--co-muted)]">{formatEstimatedTime(job.estimatedDurationMinutes)} · {job.assignedCleanerNames?.length ? `Assigned: ${job.assignedCleanerNames.join(", ")}` : "Cleaner not assigned"}</p>
              </div>
              <StatusPill domain="job" status={job.status} />
            </Link>
          ))}
        </div>
      ) : (
        <p className="p-6 text-sm text-[var(--co-muted)]">No upcoming visits scheduled.</p>
      )}
      {remaining > 0 ? (
        <button
          onClick={() => setExpanded(true)}
          className="w-full border-t border-[var(--co-line-soft)] px-5 py-3 text-center text-sm font-semibold text-[var(--co-evergreen)] hover:bg-[var(--co-surface-muted)] sm:px-6"
        >
          Show {remaining} more visit{remaining === 1 ? "" : "s"}
        </button>
      ) : expanded && upcomingJobs.length > UPCOMING_VISITS_PREVIEW_COUNT ? (
        <button
          onClick={() => setExpanded(false)}
          className="w-full border-t border-[var(--co-line-soft)] px-5 py-3 text-center text-sm font-semibold text-[var(--co-evergreen)] hover:bg-[var(--co-surface-muted)] sm:px-6"
        >
          Show fewer
        </button>
      ) : null}
    </Card>
  );
}

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

function Preference({ icon: Icon, title, tone, children }: { icon: typeof KeyRound; title: string; tone?: string; children: React.ReactNode }) {
  return (
    <article className={`min-h-32 rounded-lg border p-4 ${tone ?? "border-[var(--co-line)] bg-[var(--co-surface-muted)]/80"}`}>
      <div className="flex gap-3">
        <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${tone ? "" : "text-[var(--co-evergreen)]"}`} />
        <div>
          <h3 className="text-sm font-semibold">{title}</h3>
          <div className={`mt-1 whitespace-pre-line text-sm leading-5 ${tone ? "" : "text-[var(--co-muted)]"}`}>{children}</div>
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
  const accessNotesText = cleanNoteText([location?.accessInstructions, customer.gateCodeOrKeyNotes].filter(Boolean).join(" "));
  const accessCodes = [
    location?.gateCode ? `Gate code: ${location.gateCode}` : null,
    location?.keyNumber ? `Key location: ${location.keyNumber}` : null,
  ].filter(Boolean).join(" · ");
  const preferredDays = customer.preferredDays?.map((day) => day.slice(0, 1).toUpperCase() + day.slice(1)).join(", ");
  const plan = customer.recurrence && customer.recurrence !== "none" ? customer.recurrence.replace("biweekly", "Every other week").replace(/^./, (letter) => letter.toUpperCase()) : "One-time service";
  const schedulingPreference = [preferredDays, customer.preferredTimeOfDay].filter(Boolean).join(" · ");
  const notes = [
    customer.generalNotes ? { icon: NotebookText, title: "General notes", text: cleanNoteText(customer.generalNotes) } : null,
    customer.doNotClean ? { icon: CircleAlert, title: "Do not clean", text: cleanNoteText(customer.doNotClean), tone: "border-rose-200 bg-rose-50 text-rose-800" } : null,
    customer.petNotes ? { icon: Cat, title: "Pets", text: cleanNoteText(customer.petNotes), tone: "border-amber-200 bg-amber-50 text-amber-900" } : null,
    customer.importantToCustomer ? { icon: Sparkles, title: "Important to customer", text: cleanNoteText(customer.importantToCustomer), tone: "border-violet-200 bg-violet-50 text-violet-900" } : null,
    schedulingPreference ? { icon: Clock3, title: "Scheduling preference", text: schedulingPreference } : null,
    accessNotesText || accessCodes ? { icon: KeyRound, title: "Entrance & access instructions", text: accessNotesText || "No entry instructions recorded." } : null,
  ].filter((note): note is { icon: typeof KeyRound; title: string; text: string; tone?: string } => Boolean(note));

  return (
    <div className="space-y-6">
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
          <section className="rounded-xl border border-[var(--co-line)] bg-[var(--co-surface-muted)]/75 p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-3 text-[var(--co-evergreen)]"><CalendarDays className="h-6 w-6" /><h2 className="text-lg font-semibold">{customer.isArchived ? "Archived service" : "Active subscription"}</h2></div><span className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-white ${customer.isArchived ? "bg-slate-500" : "bg-[var(--co-evergreen)]"}`}>{customer.isArchived ? "Archived" : customer.status === "client" ? "Active plan" : "Customer plan"}</span></div>
            <div className="mt-4 grid gap-3 md:grid-cols-3"><div><p className="text-[10px] font-bold uppercase text-[var(--co-muted)]">Plan details</p><p className="mt-1 text-sm font-semibold">{plan}</p></div><div><p className="text-[10px] font-bold uppercase text-[var(--co-muted)]">Next visit</p>{nextJob ? <Link href={`/jobs/${nextJob.id}`} className="mt-1 block text-sm font-semibold text-[var(--co-evergreen)] hover:underline">{formatDisplayDate(nextJob.scheduledDate)}<span className="mt-1 block font-normal text-[var(--co-muted)]">{nextJob.scheduledStartTime?.slice(0, 5) ?? "Time pending"}</span></Link> : <p className="mt-1 text-sm text-[var(--co-muted)]">No visit scheduled</p>}</div><div><p className="text-[10px] font-bold uppercase text-[var(--co-muted)]">Preferred cleaner</p><p className="mt-1 text-sm font-semibold">{customer.preferredCleanerId ? "Cleaner assigned" : "Any available cleaner"}</p><p className="mt-1 text-sm text-[var(--co-muted)]">{upcomingJobs.length ? `${upcomingJobs.length} upcoming visit${upcomingJobs.length === 1 ? "" : "s"}` : "No upcoming visits"}</p></div></div>
          </section>
          <UpcomingVisits upcomingJobs={upcomingJobs} />
          <Card title="Service history" action={<Link href="/jobs" className="text-sm font-semibold text-[var(--co-evergreen)] hover:underline">View all activity →</Link>}>
            {recentJobs.length ? <div className="overflow-x-auto"><table className="w-full min-w-[700px] text-left text-sm"><thead className="bg-[var(--co-surface-muted)] text-[10px] font-bold uppercase tracking-wide text-[var(--co-muted)]"><tr><th className="px-6 py-3">Date</th><th className="px-4 py-3">Service type</th><th className="px-4 py-3">Duration</th><th className="px-4 py-3">Price</th><th className="px-6 py-3 text-right">Status</th></tr></thead><tbody>{recentJobs.slice(0, 5).map((job) => <tr key={job.id} className="border-t border-[var(--co-line-soft)]"><td className="px-6 py-4"><Link href={`/jobs/${job.id}`} className="font-medium hover:text-[var(--co-evergreen)] hover:underline">{formatDisplayDate(job.scheduledDate)}</Link></td><td className="px-4 py-4 font-medium">{TYPE_LABELS[job.type] ?? job.type}</td><td className="px-4 py-4">{formatEstimatedTime(job.estimatedDurationMinutes)}</td><td className="px-4 py-4">{money(job.priceCents)}</td><td className="px-6 py-4 text-right"><span className={`rounded px-2 py-1 text-[10px] font-bold uppercase ${job.status === "completed" ? "bg-emerald-50 text-emerald-800" : job.status === "cancelled" ? "bg-rose-50 text-rose-700" : "bg-slate-100 text-slate-600"}`}>{job.status.replaceAll("_", " ")}</span></td></tr>)}</tbody></table></div> : <p className="p-6 text-sm text-[var(--co-muted)]">No service history yet.</p>}
          </Card>
          <Card title="Service notes & preferences" action={<button onClick={onEditFocus} className="text-sm font-semibold text-[var(--co-evergreen)] hover:underline">Edit</button>}>
            {notes.length ? (
              <div className="grid gap-4 p-5 md:grid-cols-2">
                {notes.map((note) => (
                  <Preference key={note.title} icon={note.icon} title={note.title} tone={note.tone}>
                    {note.text}
                    {note.title === "Entrance & access instructions" && accessCodes ? (
                      <div className="mt-2">
                        <MaskedCode>{accessCodes}</MaskedCode>
                      </div>
                    ) : null}
                  </Preference>
                ))}
              </div>
            ) : (
              <p className="p-5 text-sm text-[var(--co-muted)]">No notes or preferences recorded.</p>
            )}
          </Card>
        </div>
      </section>
    </div>
  );
}
