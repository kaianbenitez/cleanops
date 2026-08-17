"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ADD_ONS, normalizeAddOns } from "@/lib/pricing/add-ons";
import { LocalDateTime } from "@/components/local-date-time";
import { BookJobPanel } from "@/components/scheduling/book-job-panel";
import { StatusPill } from "@/components/ui/status-pill";
import { formatDisplayDate } from "@/lib/scheduling/dates";

type Tier = {
  roomSubtotalCents: number;
  travelFeeCents: number;
  discountPercent: number;
  minimumApplied: boolean;
  finalCents: number;
};

type Quote = {
  id: string;
  status: string;
  totalCents: number;
  publicToken: string;
  requestedServiceType: string | null;
  acceptedServiceType: string | null;
  signatureName: string | null;
  acceptedAt: string | null;
  bookedAt: string | null;
  desiredCleaningDate: string | null;
  acceptedAddOns: unknown[];
  sentAt: string | null;
  allTierPricing: Record<string, Tier> | null;
};

type QuoteDetails = Quote & {
  viewCount?: number;
  lastViewedAt?: string | null;
  createdByName?: string | null;
};

type BookingOverride = {
  reason: string;
  bookedAt: string;
  staffName: string | null;
};

type AcceptanceActivity = { after: { desiredCleaningDate?: string | null; scheduled?: boolean } | null; createdAt: string };

const LABELS: Record<string, string> = {
  supreme_deep: "Supreme Deep",
  deep: "Deep Clean",
  first_time: "First Time",
  weekly: "Weekly",
  biweekly: "Bi-Weekly",
  four_weeks: "Every 4 Weeks",
  move_in_out: "Move In / Out",
};

function dollars(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function PageCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="co-card overflow-hidden">
      <div className="border-b border-[var(--co-line-soft)] px-5 py-4">
        <h2 className="text-lg font-semibold">{title}</h2>
      </div>
      <div className="px-5 py-5">{children}</div>
    </section>
  );
}

export default function QuoteDetailPage({ params }: { params: Promise<{ quoteId: string }> }) {
  const { quoteId } = use(params);
  const router = useRouter();
  const [quote, setQuote] = useState<QuoteDetails | null>(null);
  const [customerId, setCustomerId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");
  const [locationName, setLocationName] = useState("");
  const [hourlyRateCents, setHourlyRateCents] = useState<number | null>(null);
  const [publicUrl, setPublicUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const [selectedServiceType, setSelectedServiceType] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [bookingOverride, setBookingOverride] = useState<BookingOverride | null>(null);
  const [acceptanceActivity, setAcceptanceActivity] = useState<AcceptanceActivity | null>(null);

  const load = useCallback(async () => {
    const response = await fetch(`/api/quotes/${quoteId}`, { cache: "no-store" });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error ?? `Quote could not be loaded (${response.status}).`);
    const loadedQuote = { ...body.quote, viewCount: body.viewCount, lastViewedAt: body.lastViewedAt, createdByName: body.createdByName } as QuoteDetails;
    setQuote(loadedQuote);
    setSelectedServiceType((current) => {
      if (current && loadedQuote.allTierPricing?.[current]) return current;
      return loadedQuote.acceptedServiceType ?? loadedQuote.requestedServiceType ?? Object.keys(loadedQuote.allTierPricing ?? {})[0] ?? "";
    });
    setCustomerId(body.customerId ?? "");
    setCustomerName(`${body.customerFirstName} ${body.customerLastName}`);
    setCustomerAddress(
      [body.customerAddressLine1, body.customerCity, body.customerState, body.customerZip].filter(Boolean).join(", ")
    );
    setLocationName(body.locationName ?? "");
    setHourlyRateCents(typeof body.hourlyRateCents === "number" ? body.hourlyRateCents : null);
    setBookingOverride(body.bookingOverride ?? null);
    setAcceptanceActivity(body.acceptanceActivity ?? null);
    setLoaded(true);
  }, [quoteId]);

  useEffect(() => {
    // Protected quote API load boundary.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load().catch((cause: unknown) => {
      setError(cause instanceof Error ? cause.message : "Quote could not be loaded.");
      setLoaded(true);
    });
  }, [load]);

  async function send() {
    setSending(true);
    setError("");
    const response = await fetch(`/api/quotes/${quoteId}/send`, { method: "POST" });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) setError(body.error ?? "Quote could not be sent.");
    else {
      setPublicUrl(body.publicUrl ?? "");
      await load();
    }
    setSending(false);
  }

  async function copy() {
    if (!publicUrl) return;
    await navigator.clipboard.writeText(publicUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  }


  if (!loaded) {
    return (
      <div className="space-y-4">
        <div className="h-4 w-32 animate-pulse rounded bg-[var(--co-line)]" />
        <div className="h-36 animate-pulse rounded-2xl bg-[var(--co-surface)]" />
        <div className="h-64 animate-pulse rounded-2xl bg-[var(--co-surface)]" />
      </div>
    );
  }

  if (!quote) {
    return (
      <div className="co-card p-8 text-center">
        <p className="font-medium">Unable to load this quote.</p>
        <p className="mt-2 text-sm text-[var(--co-danger)]">{error}</p>
      </div>
    );
  }

  const tiers = quote.allTierPricing ? Object.entries(quote.allTierPricing) : [];
  const tierCentsRange = tiers.length
    ? tiers.reduce(
        (range, [, tier]) => [Math.min(range[0], tier.finalCents), Math.max(range[1], tier.finalCents)],
        [Infinity, -Infinity]
      )
    : null;
  const publicLink = `/quote/${quote.publicToken}`;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link href="/quotes" className="text-sm font-medium text-[var(--co-accent-text)] hover:underline">
            Back to quotes
          </Link>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <StatusPill domain="quote" status={quote.status} />
            {bookingOverride ? <span className="co-badge-warning rounded-full px-2.5 py-1 text-xs font-medium">Staff override — customer did not sign</span> : null}
            {quote.status === "accepted" && !quote.bookedAt ? <span className="co-badge-success rounded-full px-2.5 py-1 text-xs font-medium">Approved — not scheduled</span> : null}
            {quote.bookedAt ? <span className="co-badge-success rounded-full px-2.5 py-1 text-xs font-medium">Scheduled</span> : null}
          </div>
          <h1 className="page-title mt-2">{customerName}</h1>
          <p className="page-subtitle">
            {locationName || "Service location not recorded"} - Q-{quote.id.slice(0, 6).toUpperCase()}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {customerId ? (
            <Link href={`/customers/${customerId}`} className="co-button-secondary">
              Customer profile
            </Link>
          ) : null}
          <Link href={publicLink} target="_blank" rel="noreferrer" className="co-button-secondary">
            Open proposal
          </Link>
          {quote.status === "draft" ? (
            <button className="co-button-primary" onClick={send} disabled={sending}>
              {sending ? "Sending..." : "Mark sent & get link"}
            </button>
          ) : null}
        </div>
      </header>

      {error ? (
        <div role="alert" className="co-badge-danger rounded-xl px-4 py-3 text-sm">
          {error}
        </div>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
        <section className="space-y-5">
          <PageCard title="Services">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-[var(--co-muted)]">{quote.acceptedServiceType ? "Accepted total" : "Priced range"}</p>
              <span className="text-2xl font-semibold">
                {quote.acceptedServiceType || quote.requestedServiceType
                  ? dollars(quote.totalCents)
                  : tierCentsRange
                    ? `${dollars(tierCentsRange[0])} – ${dollars(tierCentsRange[1])}`
                    : "—"}
              </span>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {tiers.map(([type, tier]) => {
                const estimatedHours = hourlyRateCents ? tier.finalCents / hourlyRateCents : null;
                return (
                  <div key={type} className={`rounded-2xl border p-4 ${type === quote.acceptedServiceType ? "border-[var(--co-success)]/30 bg-[var(--co-success)]/10" : "border-[var(--co-line)] bg-[var(--co-surface)]"}`}>
                    <p className="font-semibold">{LABELS[type] ?? type}</p>
                    <p className="mt-4 text-2xl font-semibold">{dollars(tier.finalCents)}</p>
                    <p className="mt-1 text-xs text-[var(--co-muted)]">
                      Travel {dollars(tier.travelFeeCents)}
                      {tier.minimumApplied ? " · minimum applied" : ""}
                      {estimatedHours !== null ? ` · ${estimatedHours.toFixed(1)} est. hrs` : ""}
                    </p>
                  </div>
                );
              })}
            </div>

            {quote.signatureName ? (
              <div className="mt-5 rounded-xl bg-[var(--co-surface-muted)] p-4 text-sm">
                Accepted by <span className="font-semibold">{quote.signatureName}</span>
                {quote.acceptedAt ? <> on <LocalDateTime value={quote.acceptedAt} /></> : ""}.
              </div>
            ) : null}

            {normalizeAddOns(quote.acceptedAddOns).length ? (
              <div className="mt-3 rounded-xl border border-[var(--co-line-soft)] p-4 text-sm">
                <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--co-muted)]">Add-ons requested</p>
                <ul className="mt-2 space-y-1.5">
                  {normalizeAddOns(quote.acceptedAddOns).map(({ key, qty }) => {
                    const addOn = ADD_ONS.find((item) => item.key === key);
                    const needsPricing = addOn?.priceCents == null;
                    return (
                      <li key={key} className="flex items-center justify-between gap-3">
                        <span>{addOn?.label ?? key}{addOn?.quantified ? ` × ${qty}` : ""}</span>
                        {needsPricing ? (
                          <span className="co-badge-warning rounded-full px-2 py-0.5 text-xs font-medium">Call to price — {addOn?.priceLabel}</span>
                        ) : (
                          <span className="font-medium">{addOn ? dollars(addOn.priceCents! * (addOn.quantified ? qty : 1)) : ""}</span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}
          </PageCard>

          <PageCard title="Service status">
            {quote.status === "accepted" && !quote.bookedAt ? (
              <div className="mb-4 rounded-2xl border border-[var(--co-accent-text)]/30 bg-[var(--co-accent-tint)] p-4 text-sm">
                <p className="font-semibold">Approved, not scheduled</p>
                <p className="mt-1 text-[var(--co-muted)]">The customer approved the service and price. Contact them with availability and confirm a cleaning date before booking.</p>
              </div>
            ) : null}
            <div className="mb-4 rounded-2xl border border-[var(--co-line-soft)] bg-[var(--co-surface-muted)]/35 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--co-muted)]">Customer&apos;s desired cleaning date</p>
              <p className="mt-2 text-sm font-medium">{quote.desiredCleaningDate ? formatDisplayDate(quote.desiredCleaningDate) : "No preference provided"}</p>
              {quote.desiredCleaningDate && !quote.bookedAt ? <p className="mt-1 text-xs text-[var(--co-muted)]">Requested date only — availability still needs to be confirmed.</p> : null}
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-2xl border border-[var(--co-line-soft)] bg-[var(--co-surface-muted)]/35 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--co-muted)]">Requested service</p>
                <p className="mt-2 text-sm font-medium">{LABELS[quote.requestedServiceType ?? ""] ?? quote.requestedServiceType ?? "Not selected"}</p>
              </div>
              <div className="rounded-2xl border border-[var(--co-line-soft)] bg-[var(--co-surface-muted)]/35 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--co-muted)]">Accepted service</p>
                <p className="mt-2 text-sm font-medium">{LABELS[quote.acceptedServiceType ?? ""] ?? quote.acceptedServiceType ?? "Not accepted yet"}</p>
              </div>
            </div>
          </PageCard>
        </section>

        <aside className="space-y-5">
          {quote.status !== "draft" || publicUrl ? (
            <PageCard title="Share quote">
              {publicUrl ? (
                <div className="flex gap-2">
                  <input readOnly value={publicUrl} className="co-input min-w-0 flex-1 text-xs" />
                  <button className="co-button-secondary" onClick={copy}>
                    {copied ? "Copied" : "Copy"}
                  </button>
                </div>
              ) : (
                <button className="co-button-secondary w-full" onClick={send} disabled={sending}>
                  {sending ? "Loading link..." : "Regenerate link"}
                </button>
              )}
            </PageCard>
          ) : null}

          {quote.bookedAt ? (
            <PageCard title="Booked"><Link href="/calendar" className="co-button-secondary w-full justify-center">Open calendar</Link></PageCard>
          ) : (
            <BookJobPanel quoteId={quoteId} quoteStatus={quote.status} serviceType={selectedServiceType} customerName={customerName} address={customerAddress} serviceLabel={LABELS[selectedServiceType] ?? selectedServiceType} priceLabel={dollars(tiers.find(([type]) => type === selectedServiceType)?.[1].finalCents ?? quote.totalCents)} branchName={locationName} totalJthMinutes={(() => { const tier = tiers.find(([type]) => type === selectedServiceType)?.[1]; return tier && hourlyRateCents ? Math.round((tier.finalCents / hourlyRateCents) * 60) : null; })()} onBooked={(redirectTo) => router.push(redirectTo)} />
          )}

          <PageCard title="Quote activity">
            {bookingOverride ? (
              <div className="co-badge-warning mb-3 px-4 py-3 text-sm">
                <p className="font-semibold">Accepted by staff — no customer signature</p>
                <p className="mt-1">{bookingOverride.reason}</p>
                <p className="mt-1 text-xs">Scheduled <LocalDateTime value={bookingOverride.bookedAt} />{bookingOverride.staffName ? ` by ${bookingOverride.staffName}` : ""}.</p>
              </div>
            ) : null}
            {acceptanceActivity ? (
              <div className="co-badge-success mb-3 px-4 py-3 text-sm">
                <p className="font-semibold">Customer approved the proposal</p>
                <p className="mt-1">{acceptanceActivity.after?.desiredCleaningDate ? `Preferred date: ${acceptanceActivity.after.desiredCleaningDate}. ` : "No preferred date was provided. "}Approval does not schedule a cleaning.</p>
                <p className="mt-1 text-xs"><LocalDateTime value={acceptanceActivity.createdAt} /></p>
              </div>
            ) : null}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-[var(--co-line-soft)] bg-[var(--co-surface-muted)]/35 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--co-muted)]">Quoted by</p>
                <p className="mt-2 text-sm font-medium">{quote.createdByName ?? "Not recorded"}</p>
              </div>
              <div className="rounded-2xl border border-[var(--co-line-soft)] bg-[var(--co-surface-muted)]/35 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--co-muted)]">Sent</p>
                <p className="mt-2 text-sm font-medium"><LocalDateTime value={quote.sentAt} fallback="Not sent" /></p>
              </div>
              <div className="rounded-2xl border border-[var(--co-line-soft)] bg-[var(--co-surface-muted)]/35 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--co-muted)]">Viewed / accepted</p>
                <p className="mt-2 text-sm font-medium"><LocalDateTime value={quote.acceptedAt} fallback="No response yet" /></p>
              </div>
              <div className="rounded-2xl border border-[var(--co-line-soft)] bg-[var(--co-surface-muted)]/35 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--co-muted)]">Viewed count</p>
                <p className="mt-2 text-sm font-medium">{quote.viewCount ?? 0} times</p>
              </div>
              <div className="rounded-2xl border border-[var(--co-line-soft)] bg-[var(--co-surface-muted)]/35 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--co-muted)]">Last viewed</p>
                <p className="mt-2 text-sm font-medium"><LocalDateTime value={quote.lastViewedAt} fallback="Not viewed yet" /></p>
              </div>
            </div>
          </PageCard>

          <PageCard title="Location">
            {customerAddress ? (
              <>
                <p className="mb-3 text-sm text-[var(--co-muted)]">{customerAddress}</p>
                <div className="overflow-hidden rounded-2xl border border-[var(--co-line-soft)]">
                  <iframe
                    title="Customer location map"
                    src={`https://maps.google.com/maps?q=${encodeURIComponent(customerAddress)}&output=embed`}
                    className="h-56 w-full border-0"
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                  />
                </div>
                <a
                  href={`https://maps.google.com/?q=${encodeURIComponent(customerAddress)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="co-button-secondary mt-3 w-full justify-center"
                >
                  Open in Google Maps
                </a>
              </>
            ) : (
              <p className="text-sm text-[var(--co-muted)]">Add an address to this customer&apos;s profile to see it on a map here.</p>
            )}
          </PageCard>
        </aside>
      </div>
    </div>
  );
}
