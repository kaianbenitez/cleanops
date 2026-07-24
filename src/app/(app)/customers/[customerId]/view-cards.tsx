import Link from "next/link";
import { ComingSoonStat } from "@/components/ui/coming-soon-stat";
import { TYPE_LABELS, money, type Customer, type Location, type CustomerJob, type AuditEntry } from "./shared";

function Card({ eyebrow, title, action, children }: { eyebrow: string; title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="co-card overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--co-line-soft)] px-5 py-4">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h2 className="mt-1 text-lg font-semibold">{title}</h2>
        </div>
        {action}
      </div>
      <div className="px-5 py-5">{children}</div>
    </section>
  );
}

export function CustomerViewCards({
  customer,
  location,
  primaryAddress,
  recentJobs,
  openBalance,
  lifetimeSpendCents,
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
  auditLogs: AuditEntry[];
  onEditFocus: () => void;
}) {
  // Access Protocol precedence: a per-location gate code/key location is more precise than
  // the customer-level free-text field, so prefer it when a location exists and has one set.
  const gateCode = location?.gateCode || null;
  const keyLocation = location?.keyNumber || null;
  const accessFallback = customer.gateCodeOrKeyNotes || null;
  const hasStructuredAccess = Boolean(gateCode || keyLocation);

  // Priority Areas has no dedicated column — derived by splitting importantToCustomer into
  // bullets. Cosmetic grouping of an existing free-text field, not new structured capture.
  const priorityAreas = (customer.importantToCustomer ?? "")
    .split(/\n|;/)
    .map((line) => line.trim())
    .filter(Boolean);

  // Supplies Preference has no dedicated column either — derived from the per-location
  // supply fields, falling back to the customer-level operational notes.
  const supplyParts = [
    location?.vacuumLocation ? `Vacuum: ${location.vacuumLocation}` : null,
    location?.mopHeadsNeeded ? `Mop heads: ${location.mopHeadsNeeded}` : null,
    location?.trashBags ? `Trash bags: ${location.trashBags}` : null,
  ].filter(Boolean) as string[];
  const suppliesPreference = supplyParts.length ? supplyParts.join(" · ") : customer.operationalNotes || null;

  return (
    <section className="grid gap-5 xl:grid-cols-[1.05fr_1.05fr_0.9fr]">
      <div className="space-y-5">
        <Card eyebrow="Contact" title="Contact Details">
          <div className="space-y-3 text-sm">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.1em] text-[var(--co-muted)]">Email address</p>
              <p className="mt-1 font-medium">{customer.email || "No email"}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.1em] text-[var(--co-muted)]">Phone number</p>
              <p className="mt-1 font-medium">{customer.phone || "No phone"}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.1em] text-[var(--co-muted)]">Primary residence</p>
              <p className="mt-1 font-medium">{primaryAddress || "Address not recorded"}</p>
            </div>
          </div>
          <div className="mt-4">
            {primaryAddress ? (
              <>
                <iframe
                  title="Customer location map"
                  src={`https://maps.google.com/maps?q=${encodeURIComponent(primaryAddress)}&output=embed`}
                  className="h-48 w-full rounded-2xl border-0"
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                />
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(primaryAddress)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-block text-sm font-medium text-[var(--co-evergreen)] hover:underline"
                >
                  View map →
                </a>
              </>
            ) : (
              <p className="text-sm text-[var(--co-muted)]">Add an address to this customer&apos;s profile to see it on a map here.</p>
            )}
          </div>
        </Card>

        <Card
          eyebrow="Billing"
          title="Payment Methods"
          action={
            <button className="text-sm font-medium text-[var(--co-evergreen)] hover:underline" onClick={onEditFocus}>
              Manage
            </button>
          }
        >
          <div className="space-y-2 text-sm">
            {["Cash", "Check", "Credit Card"].map((method) => {
              const accepted = customer.paymentMethods?.includes(method) ?? false;
              return (
                <div key={method} className="flex items-center justify-between rounded-xl border border-[var(--co-line-soft)] px-3 py-2">
                  <span className="font-medium">{method}</span>
                  <span className={accepted ? "text-xs font-medium text-emerald-700" : "text-xs text-[var(--co-muted)]"}>{accepted ? "Accepted" : "Not accepted"}</span>
                </div>
              );
            })}
          </div>
          {openBalance > 0 ? <p className="mt-3 text-sm text-rose-600">{money(openBalance)} currently outstanding.</p> : null}
        </Card>
      </div>

      <div className="space-y-5">
        <Card eyebrow="House notes" title="House Notes & Access">
          <div className="space-y-4 text-sm">
            <div className="rounded-2xl border border-[var(--co-line-soft)] bg-[var(--co-surface-muted)]/40 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--co-muted)]">Access protocol</p>
              {hasStructuredAccess ? (
                <div className="mt-2 space-y-1">
                  {gateCode ? <p>Gate code: <span className="font-medium">{gateCode}</span></p> : null}
                  {keyLocation ? <p>Key location: <span className="font-medium">{keyLocation}</span></p> : null}
                </div>
              ) : accessFallback ? (
                <p className="mt-2">{accessFallback}</p>
              ) : (
                <p className="mt-2 text-[var(--co-muted)]">No access details recorded.</p>
              )}
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--co-muted)]">Pet information</p>
              <p className="mt-1">{customer.petNotes || "No pet notes recorded."}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--co-muted)]">Priority areas</p>
              {priorityAreas.length ? (
                <ul className="mt-1 list-disc space-y-1 pl-4">
                  {priorityAreas.map((line, index) => (
                    <li key={index}>{line}</li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-[var(--co-muted)]">Nothing flagged yet.</p>
              )}
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--co-muted)]">Supplies preference</p>
              <p className="mt-1">{suppliesPreference || "No supply preferences recorded."}</p>
            </div>
          </div>
        </Card>

        <div className="co-card border-dashed border-[var(--co-line)] bg-[var(--co-surface-muted)]/30 p-5">
          <p className="eyebrow">Staff feedback</p>
          <p className="mt-3 text-sm text-[var(--co-muted)]">—</p>
          <p className="mt-2 inline-flex items-center gap-1 rounded-full bg-[var(--co-surface-muted)] px-2 py-0.5 text-[11px] font-semibold text-[var(--co-muted)]">Coming soon</p>
        </div>
      </div>

      <div className="space-y-5">
        <Card eyebrow="History" title="Service History">
          {recentJobs.length === 0 ? (
            <p className="text-sm text-[var(--co-muted)]">No completed jobs yet.</p>
          ) : (
            <div className="space-y-3">
              {recentJobs.slice(0, 5).map((job) => (
                <Link key={job.id} href={`/jobs/${job.id}`} className="block rounded-2xl border border-[var(--co-line-soft)] px-3 py-3 hover:bg-[var(--co-surface-muted)]">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">{TYPE_LABELS[job.type] ?? job.type}</p>
                    <p className="text-sm font-semibold">{money(job.priceCents)}</p>
                  </div>
                  <div className="mt-1 flex items-center justify-between text-xs text-[var(--co-muted)]">
                    <span>{job.scheduledDate}</span>
                    <span className="tracking-widest text-[var(--co-line)]" title="Ratings aren't tracked yet">★★★★★</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
          <Link href="/jobs" className="mt-3 inline-block text-sm font-medium text-[var(--co-evergreen)] hover:underline">
            View full history →
          </Link>
        </Card>

        <div className="grid grid-cols-2 gap-3">
          <div className="co-card p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--co-muted)]">Lifetime spend</p>
            <p className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-[var(--co-evergreen)]">{money(lifetimeSpendCents)}</p>
          </div>
          <ComingSoonStat label="Avg rating" />
        </div>
      </div>
    </section>
  );
}
