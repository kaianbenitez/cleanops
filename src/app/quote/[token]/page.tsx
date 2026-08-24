"use client";

import { use, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { Sparkles, Droplet, Star, Truck, PanelsTopLeft, Flame, Refrigerator, Ruler, LayoutGrid, Shirt, Minus, Plus, type LucideIcon } from "lucide-react";
import { ADD_ONS, MOVE_IN_OUT_DEFAULT_ADD_ONS, MAX_ADD_ON_QTY, addOnLineTotalCents, normalizeAddOns, type AddOnKey, type SelectedAddOn } from "@/lib/pricing/add-ons";
import { formatDisplayDate } from "@/lib/scheduling/dates";
import { DateInput } from "@/components/date-input";

type TierBreakdown = {
  roomLines: Array<{ roomTypeName: string; count: number }>;
  finalCents: number;
};

type PublicQuote = {
  quote: {
    id: string;
    status: string;
    totalCents: number;
    requestedServiceType: string | null;
    acceptedServiceType: string | null;
    notesToCustomer: string | null;
    validUntil: string | null;
    signatureName: string | null;
    acceptedAddOns: unknown[];
    desiredCleaningDate: string | null;
    acceptedAt: string | null;
    bookedAt: string | null;
  };
  customerFirstName: string;
  customerLastName: string;
  customerAddressLine1: string | null;
  customerCity: string | null;
  customerState: string | null;
  customerZip: string | null;
  companyName: string;
  companyPhone: string | null;
  companyLogoUrl: string | null;
  companyBrandColor: string | null;
  companyReviewUrl: string | null;
  locationName: string | null;
  travelZoneName: string | null;
  allTierPricing: Record<string, TierBreakdown> | null;
  quoteTemplate: {
    introLetter?: string;
    terms?: string;
    ownerName?: string;
    ownerTitle?: string;
    reviewUrl?: string | null;
    beforePhotoUrl?: string | null;
    afterPhotoUrl?: string | null;
    photoSets?: Array<{
      label?: string | null;
      beforePhotoUrl?: string | null;
      afterPhotoUrl?: string | null;
    }>;
    insuranceUrl?: string | null;
    w9Url?: string | null;
    preferredDatePrompt?: string;
    contactPhone?: string | null;
  } | null;
};

const MAIN_TYPES = ["supreme_deep", "deep", "first_time", "move_in_out"] as const;
const RECURRING_TYPES = ["weekly", "biweekly", "four_weeks"] as const;

const SERVICE_LABELS: Record<string, string> = {
  supreme_deep: "Supreme Deep Cleaning",
  deep: "Deep Cleaning",
  first_time: "First Time Cleaning",
  weekly: "Weekly",
  biweekly: "Bi-Weekly",
  four_weeks: "Every 4 Weeks",
  move_in_out: "Move In / Out",
};

const SERVICE_ICONS: Record<string, typeof Sparkles> = {
  supreme_deep: Sparkles,
  deep: Droplet,
  first_time: Star,
  move_in_out: Truck,
};

const SERVICE_BULLETS: Record<string, string[]> = {
  supreme_deep: ["Hand wipe fixtures & vents", "Steam mop all hard floors", "Interior fridge & oven detail", "Full kitchen sanitizing"],
  deep: ["Hand wipe fixtures & surfaces", "Spot clean doors & handles", "Vacuum & mop all floors", "Detailed bathroom clean"],
  first_time: ["General dusting throughout", "Vacuum & mop all floors", "Wipe down kitchen counters", "Fresh baseline for recurring service"],
  move_in_out: ["Full top-to-bottom deep clean", "Oven clean out included by default", "Fridge clean out included by default", "Window cleaning available as an add-on"],
};

const ADD_ON_STYLES: Record<AddOnKey, { icon: LucideIcon; color: string }> = {
  inside_windows: { icon: PanelsTopLeft, color: "var(--chart-1)" },
  oven_interior: { icon: Flame, color: "var(--chart-4)" },
  fridge_interior: { icon: Refrigerator, color: "var(--chart-3)" },
  baseboards: { icon: Ruler, color: "var(--chart-2)" },
  cabinet_fronts: { icon: LayoutGrid, color: "var(--co-accent-text)" },
  laundry: { icon: Shirt, color: "var(--co-warning)" },
};

const DEFAULT_INTRO =
  "Thank you for considering our cleaning service. We prepared the options below around the home details you provided. Choose the service that feels right, and your total will update as you compare.";

const FAQS = [
  { q: "Do I have to be home?", a: "That is up to your comfort level. If you are not home, please let us know how we will be getting in so we can keep the visit smooth and secure." },
  { q: "Do you offer a military discount?", a: "Yes. We offer a 5% discount for military, police, and fire personnel as a thank-you for your service." },
  { q: "What forms of payment do you accept?", a: "We accept check, money order, cash, and credit cards. A card on file is required for booking, and a 3.75% card fee applies when a card is charged." },
  { q: "Do I have to provide supplies?", a: "No. We bring everything needed to clean your home. We only ask that you keep a vacuum available just in case." },
  { q: "Do I have to sign a contract?", a: "No contract is required. We want you to stay because you are happy with the service." },
  { q: "What is the cancelation policy?", a: "We ask for 48 hours notice when possible. Last-minute changes may trigger a small cancelation fee so we can protect technician schedules." },
];

function dollars(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function addOnPriceLabel(item: (typeof ADD_ONS)[number]) {
  return item.priceCents != null ? `+${dollars(item.priceCents)}` : (item.priceLabel ?? "Ask for pricing");
}

function formatValidUntil(value: string | null) {
  return value ? formatDisplayDate(value) : null;
}

const ESTIMATE_DISCLAIMER =
  "The visit time shown is an estimate based on the condition discussed during the proposal process. We will confirm your final cleaning team before booking. If we arrive and the home's condition differs from the original description or more time is needed, we will ask for your approval before extending the visit. You may also keep the original visit time, with the understanding that some tasks may remain incomplete. Should the home not be ready for cleaning, we reserve the right to refuse service. Thank you for your understanding and cooperation.";

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[28px] border border-[var(--co-line-soft)] bg-[var(--co-surface)] p-6 shadow-[0_12px_40px_rgba(15,23,42,0.05)] sm:p-8">
      <h2 className="text-2xl font-semibold text-[var(--co-ink)]">{title}</h2>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function PhotoSetCard({
  title,
  beforeUrl,
  afterUrl,
  fallback,
}: {
  title: string;
  beforeUrl: string;
  afterUrl: string;
  fallback?: string;
}) {
  const hasBefore = Boolean(beforeUrl.trim());
  const hasAfter = Boolean(afterUrl.trim());
  const hasAny = hasBefore || hasAfter;
  return (
    <div className="overflow-hidden rounded-[28px] border border-[var(--co-line-soft)] bg-[var(--co-surface)] shadow-[0_12px_40px_rgba(15,23,42,0.05)]">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--co-line-soft)] px-5 py-4">
        <div className="min-w-0">
          <p className="eyebrow">Before / after</p>
          <p className="mt-1 break-words text-base font-semibold text-[var(--co-ink)]">{title}</p>
        </div>
        <span className="co-badge-success shrink-0 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em]">{hasAny ? "Ready" : "Add photos"}</span>
      </div>
      {hasAny ? (
        <div className="grid grid-cols-2 gap-0">
          <PhotoPanel title="Before" url={beforeUrl} fallback="Add a before photo" />
          <PhotoPanel title="After" url={afterUrl} fallback="Add an after photo" />
        </div>
      ) : (
        <div className="p-5 text-sm text-[var(--co-muted)]">{fallback ?? "Add before and after photos to show the difference clearly."}</div>
      )}
    </div>
  );
}

export default function PublicQuotePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [data, setData] = useState<PublicQuote | null>(null);
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [recurringInterest, setRecurringInterest] = useState(false);
  const [recurringFrequency, setRecurringFrequency] = useState<string | null>(null);
  const [signatureName, setSignatureName] = useState("");
  const [accepting, setAccepting] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signatureInvalid, setSignatureInvalid] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [openFaq, setOpenFaq] = useState<string | null>(FAQS[0].q);
  const [selectedAddOns, setSelectedAddOns] = useState<SelectedAddOn[]>([]);
  const [desiredCleaningDate, setDesiredCleaningDate] = useState("");

  // Move In/Out bundles oven/fridge/window cleaning by default — the customer can
  // still uncheck any of them, this just saves them from having to remember to ask.
  function applyTierAddOnDefaults(type: string | null) {
    if (type !== "move_in_out") return;
    setSelectedAddOns((current) => {
      const existingKeys = new Set(current.map((entry) => entry.key));
      return [...current, ...MOVE_IN_OUT_DEFAULT_ADD_ONS.filter((key) => !existingKeys.has(key)).map((key) => ({ key, qty: 1 }))];
    });
  }

  function toggleAddOn(key: AddOnKey) {
    setSelectedAddOns((current) => current.some((entry) => entry.key === key) ? current.filter((entry) => entry.key !== key) : [...current, { key, qty: 1 }]);
  }

  function setAddOnQty(key: AddOnKey, qty: number) {
    const clamped = Math.max(1, Math.min(MAX_ADD_ON_QTY, Math.round(qty)));
    setSelectedAddOns((current) => current.map((entry) => entry.key === key ? { ...entry, qty: clamped } : entry));
  }

  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 8_000);
    fetch(`/api/public/quotes/${token}`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("not found");
        return response.json();
      })
      .then((body: PublicQuote) => {
        setData(body);
        setDesiredCleaningDate(body.quote.desiredCleaningDate ?? "");
        setSelectedAddOns(normalizeAddOns(body.quote.acceptedAddOns));
        const initialType = body.quote.acceptedServiceType ?? body.quote.requestedServiceType;
        if (initialType && (RECURRING_TYPES as readonly string[]).includes(initialType)) {
          setRecurringInterest(true);
          setRecurringFrequency(initialType);
        } else {
          setSelectedType(initialType);
          applyTierAddOnDefaults(initialType);
        }
      })
      .catch(() => setNotFound(true))
      .finally(() => window.clearTimeout(timeout));
  }, [token]);

  async function accept() {
    setError(null);
    setSignatureInvalid(false);
    const serviceType = selectedType ?? recurringFrequency;
    if (!serviceType) {
      setError("Choose a service option first.");
      return;
    }
    if (recurringInterest && !recurringFrequency) {
      setError("Choose a recurring cleaning frequency.");
      return;
    }
    if (!signatureName.trim()) {
      setError("Type your full name to sign.");
      setSignatureInvalid(true);
      return;
    }

    setAccepting(true);
    try {
      const response = await fetch(`/api/public/quotes/${token}/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceType,
          signatureName,
          addOns: selectedAddOns,
          recurringServiceType: selectedType && recurringInterest ? recurringFrequency : undefined,
          desiredCleaningDate: desiredCleaningDate || null,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        const validationMessage = body.error?.fieldErrors
          ? Object.values(body.error.fieldErrors).flat().filter(Boolean).join(" ")
          : null;
        setError(typeof body.error === "string" ? body.error : validationMessage || "This proposal could not be approved. Check the highlighted details and try again.");
        setSignatureInvalid(Boolean(body.error?.fieldErrors?.signatureName));
      }
      else {
        setDesiredCleaningDate(body.desiredCleaningDate ?? desiredCleaningDate);
        setData((current) => current ? { ...current, quote: { ...current.quote, status: "accepted", desiredCleaningDate: body.desiredCleaningDate ?? desiredCleaningDate } } : current);
        setAccepted(true);
      }
    } catch {
      setError("We could not reach the server. Your proposal was not accepted; please try again.");
    } finally {
      setAccepting(false);
    }
  }

  function toggleRecurring(checked: boolean) {
    setRecurringInterest(checked);
    if (!checked) setRecurringFrequency(null);
  }

  const isExpired = data ? data.quote.status === "declined" || data.quote.status === "expired" : false;
  const isAccepted = accepted || data?.quote.status === "accepted";
  const locked = isAccepted || isExpired;
  const intro = data?.quoteTemplate?.introLetter || DEFAULT_INTRO;
  const fullAddress = data
    ? [data.customerAddressLine1, data.customerCity, data.customerState, data.customerZip].filter(Boolean).join(", ")
    : "";
  const validUntilLabel = data ? formatValidUntil(data.quote.validUntil) : null;
  const mainTiers = useMemo(
    () => MAIN_TYPES.filter((type) => data?.allTierPricing?.[type]).map((type) => [type, data!.allTierPricing![type]] as const),
    [data]
  );
  const recurringTiers = useMemo(
    () => RECURRING_TYPES.filter((type) => data?.allTierPricing?.[type]).map((type) => [type, data!.allTierPricing![type]] as const),
    [data]
  );
  const selectedBreakdown = selectedType ? data?.allTierPricing?.[selectedType] : null;
  const recurringBreakdown = recurringFrequency ? data?.allTierPricing?.[recurringFrequency] : null;
  const recurringCompareCents = selectedBreakdown?.finalCents ?? Math.min(...mainTiers.map(([, tier]) => tier.finalCents), Infinity);
  const recurringSavingsCents = recurringBreakdown && Number.isFinite(recurringCompareCents) ? recurringCompareCents - recurringBreakdown.finalCents : 0;
  const photoSets = useMemo(() => {
    const templateSets = data?.quoteTemplate?.photoSets ?? [];
    if (templateSets.length > 0) {
      return templateSets.slice(0, 3).map((set, index) => ({
        title: set.label?.trim() || `Photo set ${index + 1}`,
        beforePhotoUrl: set.beforePhotoUrl ?? "",
        afterPhotoUrl: set.afterPhotoUrl ?? "",
      }));
    }

    if (data?.quoteTemplate?.beforePhotoUrl || data?.quoteTemplate?.afterPhotoUrl) {
      return [
        {
          title: "Photo set 1",
          beforePhotoUrl: data.quoteTemplate.beforePhotoUrl ?? "",
          afterPhotoUrl: data.quoteTemplate.afterPhotoUrl ?? "",
        },
      ];
    }

    return [];
  }, [data?.quoteTemplate?.afterPhotoUrl, data?.quoteTemplate?.beforePhotoUrl, data?.quoteTemplate?.photoSets]);
  const contactPhone = data?.quoteTemplate?.contactPhone || data?.companyPhone || "";
  const requiresDeposit = selectedType ? ["first_time", "deep"].includes(selectedType) : false;
  const selectedTotalCents = selectedBreakdown?.finalCents ?? data?.quote.totalCents ?? 0;
  const selectedAddOnTotalCents = selectedAddOns.reduce((sum, entry) => {
    const addOn = ADD_ONS.find((item) => item.key === entry.key);
    return addOn ? sum + addOnLineTotalCents(addOn, entry.qty) : sum;
  }, 0);
  const quotedTotalCents = selectedTotalCents + selectedAddOnTotalCents;
  const displayedTotalCents = isAccepted ? data?.quote.totalCents ?? quotedTotalCents : quotedTotalCents;
  const depositCents = requiresDeposit ? Math.round(quotedTotalCents * 0.5) : 0;
  const remainingCents = requiresDeposit ? Math.max(0, quotedTotalCents - depositCents) : 0;

  if (notFound) {
    return <div className="flex min-h-[100dvh] items-center justify-center bg-[var(--co-bg)] p-6 text-center text-sm text-[var(--co-muted)]">This proposal link is invalid or has expired.</div>;
  }

  if (!data) {
    return <div className="flex min-h-[100dvh] items-center justify-center bg-[var(--co-bg)] p-6 text-sm text-[var(--co-muted)]">Loading your proposal...</div>;
  }

  return (
    <div className="min-h-[100dvh] bg-[var(--co-bg)] px-4 py-6 pb-24 text-[var(--co-ink)] sm:px-6 lg:px-8 lg:pb-6">
      <div className="mx-auto max-w-7xl">
        <header className="mb-6 rounded-[32px] border border-[var(--co-line-soft)] bg-[var(--co-surface)] p-5 shadow-[0_12px_40px_rgba(15,23,42,0.05)] sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex min-w-0 items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-[var(--co-accent-fill)]">
                {data.companyLogoUrl ? (
                  <Image src={data.companyLogoUrl} alt={`${data.companyName} logo`} width={48} height={48} sizes="48px" className="h-full w-full object-contain p-1.5" />
                ) : (
                  <span className="font-bold text-white">CO</span>
                )}
              </div>
              <div className="min-w-0">
                <p className="break-words text-2xl font-semibold tracking-tight text-[var(--co-ink)]">{data.companyName}</p>
                <p className="break-words text-sm text-[var(--co-muted)]">
                  Proposal for {data.customerFirstName} {data.customerLastName}
                </p>
                {fullAddress ? <p className="mt-1 break-words text-xs text-[var(--co-muted)]">{fullAddress}</p> : null}
                <p className="mt-2 break-words text-xs text-[var(--co-faint)]">{data.locationName || "Your home"} · Proposal {data.quote.id.slice(0, 8).toUpperCase()}</p>
              </div>
            </div>

            <div className="flex shrink-0 flex-col items-end gap-2">
              <div className="flex flex-wrap justify-end gap-2">
                {data.companyPhone ? (
                  <>
                    <a href={`tel:${data.companyPhone}`} className="co-button-secondary">
                      Call
                    </a>
                    <a href={`sms:${data.companyPhone}`} className="co-button-secondary">
                      Text
                    </a>
                  </>
                ) : null}
              </div>
              {validUntilLabel ? (
                <span className="whitespace-nowrap rounded-full bg-[var(--co-surface-muted)] px-3 py-1 text-xs font-medium text-[var(--co-muted)]">
                  Valid until {validUntilLabel}
                </span>
              ) : null}
            </div>
          </div>
        </header>

        <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
          <main className="space-y-6">
            <Section title="Your quote">
              <p className="max-w-2xl whitespace-pre-line text-base leading-7 text-[var(--co-muted)]">{intro}</p>
              {data.quoteTemplate?.preferredDatePrompt ? (
                <div className="mt-5 rounded-2xl border border-[var(--co-line-soft)] bg-[var(--co-accent-tint)] p-4">
                  <p className="eyebrow">Preferred date</p>
                  <p className="mt-2 text-sm leading-6 text-[var(--co-muted)]">{data.quoteTemplate.preferredDatePrompt}</p>
                </div>
              ) : null}

            </Section>

            <Section title="Choose a service">
              <div role="group" aria-label="Choose a service" className="grid gap-3 md:grid-cols-2">
                {mainTiers.map(([type, tier], index) => {
                  const selected = selectedType === type;
                  const Icon = SERVICE_ICONS[type];
                  return (
                    <button
                      key={type}
                      type="button"
                      disabled={locked}
                      aria-pressed={selected}
                      onClick={() => {
                        setSelectedType(type);
                        applyTierAddOnDefaults(type);
                      }}
                      className={`relative flex min-w-0 flex-col rounded-2xl border p-5 text-left transition-transform hover:-translate-y-0.5 ${
                        selected ? "border-[var(--co-accent-text)] bg-[var(--co-accent-tint)] ring-2 ring-[var(--co-accent-fill)]" : "border-[var(--co-line-soft)] bg-[var(--co-surface)]"
                      } ${locked ? "cursor-default opacity-75" : ""}`}
                    >
                      {index === 1 ? (
                        <span className="absolute -top-3 left-4 rounded-full bg-[var(--co-accent-fill)] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.1em] text-white">
                          Most popular
                        </span>
                      ) : null}
                      <span
                        className={`absolute top-5 right-5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border text-sm ${selected ? "border-[var(--co-accent-fill)] bg-[var(--co-accent-fill)] text-white" : "border-[var(--co-line)] text-transparent"}`}
                        aria-hidden="true"
                      >
                        ✓
                      </span>

                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--co-accent-fill)] text-white">
                        <Icon className="h-4 w-4" aria-hidden />
                      </span>
                      <div className="mt-3 min-w-0 pr-8">
                        <p className="font-semibold text-[var(--co-ink)]">{SERVICE_LABELS[type] ?? type}</p>
                      </div>

                      <ul className="mt-4 space-y-1.5">
                        {SERVICE_BULLETS[type]?.map((bullet) => (
                          <li key={bullet} className="flex items-start gap-2 text-xs leading-5 text-[var(--co-muted)]">
                            <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-[var(--co-accent-fill)]" aria-hidden />
                            <span className="min-w-0 break-words">{bullet}</span>
                          </li>
                        ))}
                      </ul>

                      <p className="mt-5 text-2xl font-semibold text-[var(--co-ink)]">{dollars(tier.finalCents)}</p>
                      <p className="mt-1 text-xs text-[var(--co-muted)]">Per visit</p>
                    </button>
                  );
                })}
              </div>

              {recurringTiers.length > 0 ? (
                <div className="mt-5 rounded-2xl border border-[var(--co-accent-text)] bg-[var(--co-accent-tint)] p-5">
                  <label className="flex cursor-pointer items-start gap-3">
                    <input
                      type="checkbox"
                      checked={recurringInterest}
                      disabled={locked}
                      onChange={(event) => toggleRecurring(event.target.checked)}
                      className="mt-1 h-4 w-4 shrink-0 accent-[var(--co-accent-fill)]"
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-[var(--co-ink)]">✨ Also sign up for recurring cleaning and save</span>
                      <span className="mt-1 block text-xs leading-5 text-[var(--co-muted)]">
                        Optional — keep your {selectedType ? SERVICE_LABELS[selectedType]?.toLowerCase() : "selected"} visit above, and add ongoing Weekly, Bi-Weekly, or Every 4
                        Weeks service at our best per-visit rate. Cancel anytime.
                      </span>
                    </span>
                  </label>

                  {recurringInterest ? (
                    <div className="mt-4">
                      <div role="group" aria-label="Recurring frequency" className="grid gap-2 sm:grid-cols-3">
                        {recurringTiers.map(([type, tier]) => {
                          const selected = recurringFrequency === type;
                          return (
                            <button
                              key={type}
                              type="button"
                              aria-pressed={selected}
                              disabled={locked}
                              onClick={() => setRecurringFrequency(type)}
                              className={`min-w-0 rounded-xl border px-3 py-2.5 text-left transition ${
                                selected ? "border-[var(--co-accent-text)] bg-[var(--co-surface)] ring-1 ring-[var(--co-accent-fill)]" : "border-[var(--co-line-soft)] bg-[var(--co-surface)]"
                              } ${locked ? "cursor-default opacity-75" : ""}`}
                            >
                              <span className="block break-words text-sm font-semibold text-[var(--co-ink)]">{SERVICE_LABELS[type]}</span>
                              <span className="block text-xs text-[var(--co-muted)]">{dollars(tier.finalCents)}/visit</span>
                            </button>
                          );
                        })}
                      </div>
                      {recurringBreakdown && recurringSavingsCents > 0 ? (
                        <p className="mt-3 text-sm font-medium text-[var(--co-accent-text)]">
                          That&apos;s {dollars(recurringSavingsCents)} less per visit than {selectedType ? SERVICE_LABELS[selectedType] : "a one-time clean"}.
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </Section>

            <details className="min-w-0 rounded-2xl border border-[var(--co-line-soft)] bg-[var(--co-surface)] px-5 py-4">
              <summary className="cursor-pointer text-sm font-semibold text-[var(--co-ink)]">Estimate and booking terms</summary>
              <p className="mt-3 text-sm leading-6 text-[var(--co-muted)]">{ESTIMATE_DISCLAIMER}</p>
            </details>

            <section className="min-w-0 rounded-[28px] border border-[var(--co-line-soft)] bg-[var(--co-surface)] p-6 shadow-[0_12px_40px_rgba(15,23,42,0.05)]">
              <h3 className="text-2xl font-semibold text-[var(--co-ink)]">Extras</h3>
              <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {ADD_ONS.map((item) => {
                  const selectedEntry = selectedAddOns.find((entry) => entry.key === item.key);
                  const checked = Boolean(selectedEntry);
                  const style = ADD_ON_STYLES[item.key];
                  const Icon = style.icon;
                  const includedByDefault = selectedType === "move_in_out" && MOVE_IN_OUT_DEFAULT_ADD_ONS.includes(item.key);
                  return (
                    <div
                      key={item.key}
                      className={`flex min-w-0 flex-col gap-3 rounded-xl border px-4 py-3 text-left transition ${
                        checked ? "border-[var(--co-accent-text)] bg-[var(--co-accent-tint)]" : "border-[var(--co-line-soft)] bg-[var(--co-surface-muted)]"
                      } ${locked ? "cursor-default opacity-75" : ""}`}
                    >
                      <button type="button" disabled={locked} aria-pressed={checked} onClick={() => toggleAddOn(item.key)} className="flex min-w-0 items-center gap-3 text-left">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white" style={{ background: style.color }}><Icon className="h-4 w-4" aria-hidden /></span>
                        <span className="min-w-0 flex-1"><span className="block text-sm font-medium text-[var(--co-ink)]">{item.label}</span><span className="mt-0.5 block text-xs text-[var(--co-muted)]">{includedByDefault ? "Included" : addOnPriceLabel(item)}</span></span>
                        <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border text-[11px] ${checked ? "border-[var(--co-accent-fill)] bg-[var(--co-accent-fill)] text-white" : "border-[var(--co-line)] text-transparent"}`} aria-hidden="true">✓</span>
                      </button>
                      {item.quantified && checked && selectedEntry ? <div className="flex items-center justify-between border-t border-[var(--co-line-soft)] pt-2"><span className="eyebrow">Quantity</span><span className="flex items-center gap-2"><button type="button" disabled={locked} onClick={() => setAddOnQty(item.key, selectedEntry.qty - 1)} className="flex h-7 w-7 items-center justify-center rounded-full border border-[var(--co-line)] disabled:opacity-50" aria-label={`Fewer ${item.label}`}><Minus className="h-3.5 w-3.5" aria-hidden /></button><span className="min-w-[1.5rem] text-center text-sm font-semibold">{selectedEntry.qty}</span><button type="button" disabled={locked} onClick={() => setAddOnQty(item.key, selectedEntry.qty + 1)} className="flex h-7 w-7 items-center justify-center rounded-full border border-[var(--co-line)] disabled:opacity-50" aria-label={`More ${item.label}`}><Plus className="h-3.5 w-3.5" aria-hidden /></button></span></div> : null}
                    </div>
                  );
                })}
              </div>
              {selectedAddOns.some((entry) => ADD_ONS.find((item) => item.key === entry.key)?.priceCents == null) ? (
                <p className="mt-4 text-xs text-[var(--co-muted)]">Custom-priced extras will be confirmed before the appointment.</p>
              ) : null}
              {contactPhone ? (
                <div className="mt-6 flex flex-wrap gap-2">
                  <a href={`tel:${contactPhone}`} className="co-button-secondary">
                    Call {contactPhone}
                  </a>
                  <a href={`sms:${contactPhone}`} className="co-button-secondary">
                    Text us
                  </a>
                </div>
              ) : null}
            </section>

            <section className="grid gap-6 md:grid-cols-3">
              {photoSets.length > 0 ? (
                photoSets.map((set) => (
                  <PhotoSetCard key={set.title} title={set.title} beforeUrl={set.beforePhotoUrl} afterUrl={set.afterPhotoUrl} />
                ))
              ) : null}
            </section>

            <section className="grid gap-6 md:grid-cols-2">
              {(data.quoteTemplate?.insuranceUrl || data.quoteTemplate?.w9Url) ? (
              <div className="min-w-0 rounded-[28px] border border-[var(--co-line-soft)] bg-[var(--co-surface)] p-6 shadow-[0_12px_40px_rgba(15,23,42,0.05)]">
                <p className="eyebrow">Insurance & W-9</p>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  {data.quoteTemplate?.insuranceUrl ? (
                  <div className="min-w-0 rounded-2xl border border-[var(--co-line-soft)] bg-[var(--co-surface-muted)] p-4">
                    <p className="eyebrow">Insurance certificate</p>
                    <p className="mt-2 text-sm leading-6 text-[var(--co-muted)]">Your certificate is available for review before you accept.</p>
                      <a href={data.quoteTemplate.insuranceUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex text-sm font-medium text-[var(--co-accent-text)]">
                        View certificate
                      </a>
                  </div>
                  ) : null}
                  {data.quoteTemplate?.w9Url ? (
                  <div className="min-w-0 rounded-2xl border border-[var(--co-line-soft)] bg-[var(--co-surface-muted)] p-4">
                    <p className="eyebrow">W-9 available</p>
                    <p className="mt-2 text-sm leading-6 text-[var(--co-muted)]">Business information is available when requested.</p>
                      <a href={data.quoteTemplate.w9Url} target="_blank" rel="noreferrer" className="mt-3 inline-flex text-sm font-medium text-[var(--co-accent-text)]">
                        View W-9
                      </a>
                  </div>
                  ) : null}
                </div>
              </div>
              ) : null}

              <div className="min-w-0 rounded-[28px] border border-[var(--co-line-soft)] bg-[var(--co-surface)] p-6 shadow-[0_12px_40px_rgba(15,23,42,0.05)]">
                <p className="eyebrow">Common questions</p>
                <div className="mt-5 space-y-3">
                  {FAQS.map((faq) => {
                    const open = openFaq === faq.q;
                    return (
                      <button
                        key={faq.q}
                        type="button"
                        aria-expanded={open}
                        aria-controls={`faq-answer-${FAQS.indexOf(faq)}`}
                        onClick={() => setOpenFaq(open ? null : faq.q)}
                        className="block min-h-11 w-full min-w-0 rounded-2xl border border-[var(--co-line-soft)] px-4 py-3 text-left"
                      >
                        <div className="flex min-w-0 items-center justify-between gap-4">
                          <span className="min-w-0 break-words text-sm font-medium text-[var(--co-ink)]">{faq.q}</span>
                          <span className="shrink-0 text-lg text-[var(--co-muted)]">{open ? "-" : "+"}</span>
                        </div>
                        {open ? <p id={`faq-answer-${FAQS.indexOf(faq)}`} className="mt-3 text-sm leading-6 text-[var(--co-muted)]">{faq.a}</p> : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            </section>

            {data.quote.notesToCustomer || data.quoteTemplate?.terms ? (
              <section className="rounded-[28px] border border-[var(--co-line-soft)] bg-[var(--co-surface)] p-6">
                <p className="eyebrow">Service terms</p>
                {data.quote.notesToCustomer ? <p className="mt-3 whitespace-pre-line text-sm leading-6 text-[var(--co-ink)]">{data.quote.notesToCustomer}</p> : null}
                {data.quoteTemplate?.terms ? <p className="mt-3 whitespace-pre-line text-sm leading-6 text-[var(--co-muted)]">{data.quoteTemplate.terms}</p> : null}
              </section>
            ) : null}
          </main>

          <aside className="space-y-5 lg:sticky lg:top-6 lg:self-start">
            <section className="rounded-[32px] border border-[var(--co-line-soft)] bg-[var(--co-surface)] p-6 shadow-[0_18px_60px_rgba(15,23,42,0.08)]">
              <p className="eyebrow">Your total</p>
              <p className="mt-2 text-4xl font-semibold text-[var(--co-ink)]">{dollars(quotedTotalCents)}</p>
              <p className="mt-1 break-words text-sm text-[var(--co-muted)]">{selectedType ? SERVICE_LABELS[selectedType] : "Select an option"}</p>

              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                <div className="min-w-0 rounded-2xl bg-[var(--co-surface-muted)] p-4">
                  <p className="eyebrow">Service area</p>
                  <p className="mt-2 break-words text-sm font-medium text-[var(--co-ink)]">{data.customerCity || data.locationName || "Your home"}</p>
                </div>
                <div className="min-w-0 rounded-2xl bg-[var(--co-surface-muted)] p-4">
                  <p className="eyebrow">Travel zone</p>
                  <p className="mt-2 break-words text-sm font-medium text-[var(--co-ink)]">{data.travelZoneName || "Included"}</p>
                </div>
              </div>

              {requiresDeposit ? (
                <div className="mt-4 rounded-2xl border border-[var(--co-line-soft)] bg-[var(--co-accent-tint)] p-4">
                  <p className="eyebrow">Deposit required</p>
                  <p className="mt-2 text-sm leading-6 text-[var(--co-muted)]">First-time and deep clean visits may require a 50% deposit before the office confirms and schedules the appointment.</p>
                  <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                    <div className="min-w-0 rounded-2xl bg-[var(--co-surface)] p-3">
                      <p className="eyebrow">Due today</p>
                      <p className="mt-1 font-semibold text-[var(--co-ink)]">{dollars(depositCents)}</p>
                    </div>
                    <div className="min-w-0 rounded-2xl bg-[var(--co-surface)] p-3">
                      <p className="eyebrow">After deposit</p>
                      <p className="mt-1 font-semibold text-[var(--co-ink)]">{dollars(remainingCents)}</p>
                    </div>
                  </div>
                </div>
              ) : null}

              {!locked ? (
                <div className="mt-6 space-y-4 border-t border-[var(--co-line-soft)] pt-5">
                  <DateInput
                    label="Desired cleaning date (optional)"
                    placeholder="Choose a preferred date"
                    value={desiredCleaningDate}
                    onChange={setDesiredCleaningDate}
                    min={new Date().toISOString().slice(0, 10)}
                    disabled={locked}
                    ariaDescribedBy="desired-date-help"
                    className="text-sm"
                  />
                  <p id="desired-date-help" className="-mt-2 text-xs leading-5 text-[var(--co-muted)]">Tell us which date you prefer. This is a request only and is not confirmed until our office contacts you.</p>
                  <div className="rounded-2xl border border-[var(--co-accent-text)]/30 bg-[var(--co-accent-tint)] p-4 text-sm leading-6 text-[var(--co-muted)]">
                    Approving this proposal confirms that you would like to move forward with the selected service and price. Our office will contact you with availability and confirm your cleaning date.
                  </div>
                </div>
              ) : null}

              {isAccepted ? (
                <div className="mt-6 rounded-2xl bg-[var(--co-accent-tint)] p-4 text-center text-sm text-[var(--co-accent-text)]">
                  {data.quote.bookedAt ? `Your cleaning has been scheduled. ` : "Proposal approved. "}Thank you, {data.customerFirstName}. {data.quote.desiredCleaningDate ? `We received your preferred date (${formatDisplayDate(data.quote.desiredCleaningDate)}) and will contact you with availability to confirm your cleaning appointment.` : `Our office will contact you with available dates to confirm your cleaning appointment.`}
                </div>
              ) : isExpired ? (
                <div className="mt-6 rounded-2xl bg-[var(--co-surface-muted)] p-4 text-center text-sm text-[var(--co-muted)]">This proposal is no longer available.</div>
              ) : (
                <div className="mt-6 border-t border-[var(--co-line-soft)] pt-5">
                  <label className="block text-sm font-medium text-[var(--co-ink)]">
                    Type your full name to sign
                    <input
                      id="signature-name"
                      name="signatureName"
                      aria-invalid={signatureInvalid}
                      aria-describedby={error ? "proposal-approval-error" : undefined}
                      value={signatureName}
                      onChange={(event) => setSignatureName(event.target.value)}
                      placeholder="Full name"
                      className="co-input mt-2 w-full"
                    />
                  </label>
                  {error ? <p id="proposal-approval-error" role="alert" className="mt-3 text-sm text-[var(--co-danger)]">{error}</p> : null}
                  <button onClick={accept} disabled={accepting} className="co-button-primary mt-4 w-full">
                    {accepting ? "Approving..." : "Approve proposal"}
                  </button>
                  <p className="mt-3 text-center text-xs text-[var(--co-muted)]">By approving, you agree to the service policies shown by the team.</p>
                </div>
              )}
            </section>

            <section className="rounded-[28px] bg-[var(--co-accent-fill)] p-6 text-white shadow-[0_18px_60px_rgba(36,87,255,0.2)]">
              <p className="text-sm font-semibold text-white">You&apos;re in good hands</p>
              <p className="mt-3 text-sm leading-7 text-white/90">
                Background-checked and trained pros, thoughtful communication, and a service standard built to make your home feel calm and cared for.
              </p>
              <div className="mt-6 grid gap-3 text-sm text-white/90">
                <div className="min-w-0 break-words rounded-2xl border border-white/15 bg-white/10 p-4">• 100% satisfaction-minded service</div>
                <div className="min-w-0 break-words rounded-2xl border border-white/15 bg-white/10 p-4">• Eco-friendly products available</div>
                <div className="min-w-0 break-words rounded-2xl border border-white/15 bg-white/10 p-4">• Fully licensed & insured</div>
              </div>
            </section>
          </aside>
        </div>

        {!locked ? (
          <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--co-line-soft)] bg-[var(--co-surface)]/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-8px_30px_rgba(15,23,42,0.12)] backdrop-blur lg:hidden">
            <div className="mx-auto flex max-w-7xl items-center gap-3">
              <div className="min-w-0 flex-1"><p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--co-muted)]">Current total</p><p className="truncate text-lg font-semibold">{dollars(displayedTotalCents)}</p></div>
              <button onClick={accept} disabled={accepting} className="co-button-primary min-h-11 shrink-0">{accepting ? "Approving..." : "Approve proposal"}</button>
            </div>
          </div>
        ) : null}

        <footer className="py-8 text-center text-xs text-[var(--co-muted)]">
          Prepared by {data.quoteTemplate?.ownerName || data.companyName}
          {data.quoteTemplate?.ownerTitle ? ` · ${data.quoteTemplate.ownerTitle}` : ""}
        </footer>
      </div>
    </div>
  );
}

function PhotoPanel({ title, url, fallback }: { title: string; url: string; fallback: string }) {
  const hasUrl = Boolean(url.trim());
  return (
    <div className="min-w-0 overflow-hidden border border-[var(--co-line-soft)] bg-[var(--co-surface-muted)]">
      <div className="h-36 overflow-hidden bg-[var(--co-surface-muted)]">
        {hasUrl ? <Image src={url} alt={title} width={600} height={400} sizes="(min-width: 768px) 33vw, 100vw" loading="lazy" className="h-full w-full object-cover" /> : null}
      </div>
      <div className="min-w-0 px-3 py-2">
        <p className="eyebrow">{title}</p>
        <p className="mt-1 break-words text-sm text-[var(--co-muted)]">{hasUrl ? "Linked" : fallback}</p>
      </div>
    </div>
  );
}
