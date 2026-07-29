"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ADD_ONS } from "@/lib/pricing/add-ons";
import { LocalDateTime } from "@/components/local-date-time";

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
  acceptedAddOns: string[];
  sentAt: string | null;
  allTierPricing: Record<string, Tier> | null;
};

type QuoteDetails = Quote & {
  viewCount?: number;
  lastViewedAt?: string | null;
};

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
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
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
  const [convertDate, setConvertDate] = useState("");
  const [selectedServiceType, setSelectedServiceType] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    const response = await fetch(`/api/quotes/${quoteId}`, { cache: "no-store" });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error ?? `Quote could not be loaded (${response.status}).`);
    const loadedQuote = { ...body.quote, viewCount: body.viewCount, lastViewedAt: body.lastViewedAt } as QuoteDetails;
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

  async function convert(forceJob = false) {
    if (!convertDate) {
      setError("Choose a start date first.");
      return;
    }
    const response = await fetch(`/api/quotes/${quoteId}/convert`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ startDate: convertDate, serviceType: selectedServiceType || undefined, forceJob }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(body.error ? JSON.stringify(body.error) : "Quote could not be converted.");
      return;
    }
    router.push(body.series ? "/calendar" : `/jobs/${body.job.id}`);
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
        <p className="mt-2 text-sm text-rose-600">{error}</p>
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
          <Link href="/quotes" className="text-sm font-medium text-[var(--co-evergreen)] hover:underline">
            Back to quotes
          </Link>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <p className="eyebrow">Sales / Quote detail</p>
            <span className="rounded-full border border-[var(--co-line)] bg-[var(--co-surface-muted)] px-2.5 py-1 text-xs font-medium">{quote.status}</span>
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
          <Link href={publicLink} target="_blank" className="co-button-secondary">
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
        <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
        <section className="space-y-5">
          <PageCard eyebrow="Proposal options" title="Customer can choose one service" description="Every tier is priced and sent — the customer picks which one to accept.">
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
                  <div key={type} className={`rounded-2xl border p-4 ${type === quote.acceptedServiceType ? "border-emerald-300 bg-emerald-50" : "border-[var(--co-line)] bg-white"}`}>
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

            {quote.acceptedAddOns?.length ? (
              <div className="mt-3 rounded-xl border border-[var(--co-line-soft)] p-4 text-sm">
                <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--co-muted)]">Add-ons requested</p>
                <ul className="mt-2 space-y-1.5">
                  {quote.acceptedAddOns.map((key) => {
                    const addOn = ADD_ONS.find((item) => item.key === key);
                    const needsPricing = addOn?.priceCents == null;
                    return (
                      <li key={key} className="flex items-center justify-between gap-3">
                        <span>{addOn?.label ?? key}</span>
                        {needsPricing ? (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">Call to price — {addOn?.priceLabel}</span>
                        ) : (
                          <span className="font-medium">{addOn ? dollars(addOn.priceCents!) : ""}</span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}
          </PageCard>

          <PageCard eyebrow="What this quote will become" title="Conversion context" description="Accepted quotes can turn into scheduled work.">
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
          <PageCard eyebrow="Public proposal link" title="Share with customer" description="Send the quote to generate the customer-facing link.">
            {publicUrl ? (
              <div className="flex gap-2">
                <input readOnly value={publicUrl} className="co-input min-w-0 flex-1 text-xs" />
                <button className="co-button-secondary" onClick={copy}>
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
            ) : (
              <p className="text-sm text-[var(--co-muted)]">Send the quote to generate the customer-facing link.</p>
            )}
            {quote.status !== "draft" && !publicUrl ? (
              <button className="co-button-secondary mt-4 w-full" onClick={send} disabled={sending}>
                {sending ? "Loading link..." : "Regenerate link"}
              </button>
            ) : null}
          </PageCard>

          <PageCard
            eyebrow="Next step"
            title="Convert into work"
            description={
              quote.status === "accepted"
                ? "Choose the first service date. Recurring options create the series and initial jobs."
                : "This quote hasn't been accepted yet. You can still schedule it manually if you have approval elsewhere."
            }
          >
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-semibold text-[var(--co-muted)]">Service to schedule</span>
              <select
                value={selectedServiceType}
                onChange={(event) => setSelectedServiceType(event.target.value)}
                className="co-input w-full"
                disabled={tiers.length === 0}
              >
                {tiers.map(([type, tier]) => (
                  <option key={type} value={type}>
                    {LABELS[type] ?? type} · {dollars(tier.finalCents)}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-semibold text-[var(--co-muted)]">Start date</span>
              <input type="date" value={convertDate} onChange={(event) => setConvertDate(event.target.value)} className="co-input w-full" />
            </label>
            <div className="mt-4 grid gap-2">
              {quote.status === "accepted" ? (
                <button onClick={() => convert(false)} className="co-button-primary w-full">
                  Schedule selected service
                </button>
              ) : null}
              <button onClick={() => convert(true)} className={`w-full ${quote.status === "accepted" ? "co-button-secondary" : "co-button-primary"}`} type="button">
                Schedule without acceptance
              </button>
            </div>
            <p className="mt-3 text-xs text-[var(--co-muted)]">
              This bypasses the customer acceptance gate for internal scheduling when approval was received elsewhere.
            </p>
          </PageCard>

          <PageCard eyebrow="Payment status" title="Quote state" description="This helps the office know what happened without opening the public page.">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-[var(--co-line-soft)] bg-[var(--co-surface-muted)]/35 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--co-muted)]">Sent</p>
                <p className="mt-2 text-sm font-medium"><LocalDateTime value={quote.sentAt} fallback="Not sent" /></p>
              </div>
              <div className="rounded-2xl border border-[var(--co-line-soft)] bg-[var(--co-surface-muted)]/35 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--co-muted)]">Viewed / accepted</p>
                <p className="mt-2 text-sm font-medium"><LocalDateTime value={quote.acceptedAt} fallback="No response yet" /></p>
              </div>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
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

          <PageCard eyebrow="Location" title="Where this job is" description={customerAddress || undefined}>
            {customerAddress ? (
              <>
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
