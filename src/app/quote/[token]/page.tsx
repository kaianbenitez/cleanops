"use client";

import { use, useEffect, useMemo, useState } from "react";

type TierBreakdown = {
  roomLines: Array<{ roomTypeName: string; count: number; subtotalCents: number }>;
  roomSubtotalCents: number;
  travelFeeCents: number;
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
  };
  customerFirstName: string;
  customerLastName: string;
  customerCity: string | null;
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

const SERVICE_LABELS: Record<string, string> = {
  supreme_deep: "Supreme Deep",
  deep: "Deep Clean",
  first_time: "First Time",
  weekly: "Weekly",
  biweekly: "Bi-Weekly",
  four_weeks: "Every 4 Weeks",
  move_in_out: "Move In / Out",
};

const SERVICE_DESCRIPTIONS: Record<string, string> = {
  supreme_deep: "Hand wipe + steam mop + fridge + oven.",
  deep: "Hand wipe only.",
  first_time: "Dusting only.",
  weekly: "Maintenance clean.",
  biweekly: "Every 2 weeks.",
  four_weeks: "Every 4 weeks.",
  move_in_out: "Move-in / move-out.",
};

const SERVICE_SCOPE_PARAGRAPHS: Record<string, string> = {
  supreme_deep:
    "Our most detailed option for a true refresh. We handle the full hand-wipe detail work, then finish with steam mopping plus fridge and oven cleaning.",
  deep:
    "A thorough, detail-focused clean that keeps the home looking polished and cared for with extra attention where it matters most.",
  first_time:
    "The best starting point for a home that needs a reset before regular service begins. We focus on dusting and a strong overall refresh.",
  weekly:
    "A dependable maintenance visit that helps the home stay consistently clean, fresh, and ready for the week ahead.",
  biweekly:
    "A popular balance of coverage and value for busy households that want things kept in great shape between visits.",
  four_weeks:
    "A monthly upkeep clean that brings the home back to a fresh baseline and keeps buildup from getting ahead of you.",
  move_in_out:
    "A transition clean designed to help a home feel ready for its next chapter, whether you are moving in or moving out.",
};

const ADD_ONS = [
  { key: "inside_windows", label: "Inside windows", priceCents: 4500 },
  { key: "oven_interior", label: "Oven interior", priceCents: 3500 },
  { key: "fridge_interior", label: "Fridge interior", priceCents: 3500 },
  { key: "baseboards", label: "Baseboards", priceCents: 2500 },
  { key: "cabinet_fronts", label: "Cabinet fronts", priceCents: 3000 },
  { key: "laundry", label: "Laundry / folding", priceCents: 5000 },
] as const;

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

function Section({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[28px] bg-white p-6 shadow-[0_12px_40px_rgba(33,52,43,.06)] sm:p-8">
      <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#756b60]">{eyebrow}</p>
      <h2 className="mt-2 text-2xl font-semibold text-[#221d1a]">{title}</h2>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function Stat({ label, value, suffix }: { label: string; value: string | number; suffix?: string }) {
  return (
    <div className="rounded-2xl bg-[#f1ece2] p-4">
      <p className="text-xs uppercase tracking-[0.12em] text-[#756b60]">{label}</p>
      <p className="mt-2 font-medium text-[#221d1a]">
        {value}
        {suffix ?? ""}
      </p>
    </div>
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
    <div className="overflow-hidden rounded-[28px] bg-white shadow-[0_12px_40px_rgba(33,52,43,.06)]">
      <div className="flex items-center justify-between border-b border-[#efe9de] px-5 py-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#756b60]">Before / after</p>
          <p className="mt-1 text-base font-semibold text-[#221d1a]">{title}</p>
        </div>
        <span className="rounded-full bg-[#f1ece2] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#4d7a3f]">
          {hasAny ? "Ready" : "Add photos"}
        </span>
      </div>
      {hasAny ? (
        <div className="grid grid-cols-2 gap-0">
          <PhotoPanel title="Before" url={beforeUrl} fallback="Add a before photo" />
          <PhotoPanel title="After" url={afterUrl} fallback="Add an after photo" />
        </div>
      ) : (
        <div className="p-5 text-sm text-[#756b60]">{fallback ?? "Add before and after photos to show the difference clearly."}</div>
      )}
    </div>
  );
}

export default function PublicQuotePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [data, setData] = useState<PublicQuote | null>(null);
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [signatureName, setSignatureName] = useState("");
  const [accepting, setAccepting] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [openFaq, setOpenFaq] = useState<string | null>(FAQS[0].q);
  const [selectedAddOns, setSelectedAddOns] = useState<string[]>([]);

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
        setSelectedType(body.quote.acceptedServiceType ?? body.quote.requestedServiceType);
      })
      .catch(() => setNotFound(true))
      .finally(() => window.clearTimeout(timeout));
  }, [token]);

  async function accept() {
    setError(null);
    if (!selectedType) {
      setError("Choose a service option first.");
      return;
    }
    if (!signatureName.trim()) {
      setError("Type your full name to sign.");
      return;
    }

    setAccepting(true);
    const response = await fetch(`/api/public/quotes/${token}/accept`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ serviceType: selectedType, signatureName, addOns: selectedAddOns }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(body.error ? JSON.stringify(body.error) : "This proposal could not be accepted.");
    } else {
      setAccepted(true);
    }
    setAccepting(false);
  }

  const isExpired = data ? data.quote.status === "declined" || data.quote.status === "expired" : false;
  const isAccepted = accepted || data?.quote.status === "accepted";
  const intro = data?.quoteTemplate?.introLetter || DEFAULT_INTRO;
  const quoteTiers = useMemo(() => (data?.allTierPricing ? Object.entries(data.allTierPricing) : []), [data]);
  const selectedBreakdown = selectedType ? data?.allTierPricing?.[selectedType] : null;
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
  const brandColor = /^#[0-9a-fA-F]{6}$/.test(data?.companyBrandColor ?? "") ? (data?.companyBrandColor ?? "#1c1917") : "#1c1917";
  const contactPhone = data?.quoteTemplate?.contactPhone || data?.companyPhone || "";
  const requiresDeposit = selectedType ? ["first_time", "deep"].includes(selectedType) : false;
  const selectedTotalCents = selectedBreakdown?.finalCents ?? data?.quote.totalCents ?? 0;
  const selectedAddOnTotalCents = selectedAddOns.reduce((sum, key) => sum + (ADD_ONS.find((item) => item.key === key)?.priceCents ?? 0), 0);
  const quotedTotalCents = selectedTotalCents + selectedAddOnTotalCents;
  const depositCents = requiresDeposit ? Math.round(quotedTotalCents * 0.5) : 0;
  const remainingCents = requiresDeposit ? Math.max(0, quotedTotalCents - depositCents) : 0;

  if (notFound) {
    return <div className="flex min-h-screen items-center justify-center bg-[#f7f3ec] p-6 text-center text-sm text-[#756b60]">This proposal link is invalid or has expired.</div>;
  }

  if (!data) {
    return <div className="flex min-h-screen items-center justify-center bg-[#f7f3ec] p-6 text-sm text-[#756b60]">Loading your proposal...</div>;
  }

  return (
    <div className="min-h-screen bg-[#f7f3ec] px-4 py-6 text-[#221d1a] sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <header className="mb-6 rounded-[32px] bg-white p-5 shadow-[0_12px_40px_rgba(33,52,43,.06)] sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl" style={{ background: brandColor }}>
                {data.companyLogoUrl ? (
                  <img src={data.companyLogoUrl} alt={`${data.companyName} logo`} className="h-full w-full object-contain p-1.5" />
                ) : (
                  <span className="font-bold text-[#e8a06e]">CO</span>
                )}
              </div>
              <div>
                <p className="text-2xl font-semibold tracking-tight">{data.companyName}</p>
                <p className="text-sm text-[#756b60]">
                  Proposal for {data.customerFirstName} {data.customerLastName}
                </p>
                <p className="mt-2 text-xs text-[#756b60]">{data.locationName || "Your home"} · Proposal {data.quote.id.slice(0, 8).toUpperCase()}</p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {data.companyPhone ? (
                <>
                  <a href={`tel:${data.companyPhone}`} className="inline-flex items-center gap-2 rounded-full border border-[#ddd2c0] bg-white px-4 py-2 text-sm font-medium text-[#221d1a]">
                    <span aria-hidden="true">☎</span>
                    Call
                  </a>
                  <a href={`sms:${data.companyPhone}`} className="inline-flex items-center gap-2 rounded-full border border-[#ddd2c0] bg-white px-4 py-2 text-sm font-medium text-[#221d1a]">
                    <span aria-hidden="true">✉</span>
                    Text
                  </a>
                </>
              ) : null}
            </div>
          </div>
        </header>

        <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
          <main className="space-y-6">
            <Section eyebrow="Your cleaning proposal" title="Choose the service that fits your home">
              <p className="max-w-2xl whitespace-pre-line text-base leading-7 text-[#5b5044]">{intro}</p>
              {data.quoteTemplate?.preferredDatePrompt ? (
                <div className="mt-5 rounded-2xl border border-[#e8d9c5] bg-[#f7efe3] p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#8a6a3e]">Preferred date</p>
                  <p className="mt-2 text-sm leading-6 text-[#5b5044]">{data.quoteTemplate.preferredDatePrompt}</p>
                </div>
              ) : null}

              <div className="mt-8 grid gap-3 sm:grid-cols-3">
                <Stat label="Service area" value={data.customerCity || data.locationName || "Your home"} />
                <Stat label="Options" value={data.allTierPricing ? Object.keys(data.allTierPricing).length : 0} suffix=" service tiers" />
                <Stat label="Your choice" value="Updates in real time" />
              </div>
            </Section>

            <Section eyebrow="Compare your options" title="One simple choice, one clear total">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {quoteTiers.map(([type, tier], index) => {
                  const selected = selectedType === type;
                  return (
                    <button
                      key={type}
                      disabled={isAccepted || isExpired}
                      onClick={() => setSelectedType(type)}
                      className={`relative rounded-2xl border p-5 text-left transition-transform hover:-translate-y-0.5 ${
                        selected ? "border-[#4d7a3f] bg-[#f3e2d6] ring-2 ring-[#e8a06e]" : "border-[#e6ddd0] bg-white"
                      } ${isAccepted || isExpired ? "cursor-default opacity-75" : ""}`}
                    >
                      {index === 1 ? (
                        <span className="absolute -top-3 left-4 rounded-full bg-[#1c1917] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.1em] text-white">
                          Most popular
                        </span>
                      ) : null}
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold">{SERVICE_LABELS[type] ?? type}</p>
                          <p className="mt-2 min-h-10 text-xs leading-5 text-[#756b60]">{SERVICE_DESCRIPTIONS[type] || "A service option prepared for your home."}</p>
                        </div>
                        <span className={`flex h-6 w-6 items-center justify-center rounded-md border text-sm ${selected ? "border-[#1c1917] bg-[#1c1917] text-[#e8a06e]" : "border-[#c9bba5] text-transparent"}`}>
                          ✓
                        </span>
                      </div>
                      <p className="mt-4 text-sm leading-6 text-[#5b5044]">
                        {SERVICE_SCOPE_PARAGRAPHS[type] ||
                          "A thoughtful option built around the home’s needs, with add-ons available if you want to go a little further."}
                      </p>
                      <p className="mt-5 text-2xl font-semibold">{dollars(tier.finalCents)}</p>
                      <p className="mt-1 text-xs text-[#756b60]">Per scheduled visit</p>
                    </button>
                  );
                })}
              </div>
            </Section>

            <section className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
              <div className="rounded-[28px] bg-white p-6 shadow-[0_12px_40px_rgba(33,52,43,.06)]">
                <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#756b60]">Add-on services</p>
                <h3 className="mt-2 text-2xl font-semibold text-[#221d1a]">Add extras without reopening the whole quote</h3>
                <p className="mt-3 max-w-2xl text-base leading-7 text-[#5b5044]">
                  Choose any extras below and the total updates right away. Selected items will stay on the accepted quote.
                </p>
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  {ADD_ONS.map((item) => {
                    const checked = selectedAddOns.includes(item.key);
                    return (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() =>
                          setSelectedAddOns((current) => (checked ? current.filter((key) => key !== item.key) : [...current, item.key]))
                        }
                        className={`flex h-full flex-col gap-3 rounded-2xl border px-4 py-4 text-left transition ${
                          checked ? "border-[#4d7a3f] bg-[#f3e2d6]" : "border-[#e6ddd0] bg-[#faf7f2]"
                        }`}
                      >
                        <div className="flex w-full items-start gap-3">
                          <span
                            className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border text-[11px] ${
                              checked ? "border-[#1c1917] bg-[#1c1917] text-[#e8a06e]" : "border-[#c9bba5] text-transparent"
                            }`}
                          >
                            ✓
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium leading-6 text-[#221d1a]">{item.label}</p>
                            <p className="mt-1 text-xs text-[#756b60]">Tap to add or remove this extra.</p>
                          </div>
                        </div>
                        <div className="flex items-center justify-between gap-3 border-t border-[#e6ddd0] pt-3">
                          <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[#756b60]">Add-on price</span>
                          <span className={`rounded-full border px-3 py-1 text-sm font-semibold whitespace-nowrap ${checked ? "border-[#4d7a3f] bg-white text-[#a84a22]" : "border-[#ddd2c0] bg-white text-[#a84a22]"}`}>
                            +{dollars(item.priceCents)}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
                {selectedAddOnTotalCents ? (
                  <div className="mt-5 rounded-2xl border border-[#e8d9c5] bg-[#f7efe3] p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#8a6a3e]">Add-ons selected</p>
                    <div className="mt-3 space-y-2 text-sm text-[#5b5044]">
                      {ADD_ONS.filter((item) => selectedAddOns.includes(item.key)).map((item) => (
                        <div key={item.key} className="flex items-center justify-between gap-3">
                          <span>{item.label}</span>
                          <span className="font-medium text-[#221d1a]">+{dollars(item.priceCents)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
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
              </div>

              <div className="rounded-[28px] bg-white p-6 shadow-[0_12px_40px_rgba(33,52,43,.06)]">
                <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#756b60]">A little more confidence</p>
                <h3 className="mt-2 text-2xl font-semibold text-[#221d1a]">Clear service, clear expectations</h3>
                <p className="mt-3 text-sm leading-7 text-[#5b5044]">We bring the process, care, and communication needed to make your scheduled visit feel simple.</p>
                <div className="mt-5 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-2xl border border-[#e6ddd0] bg-[#f1ece2] p-4 text-sm text-[#5b5044]">Thoughtful service</div>
                  <div className="rounded-2xl border border-[#e6ddd0] bg-[#f1ece2] p-4 text-sm text-[#5b5044]">Reliable communication</div>
                  <div className="rounded-2xl border border-[#e6ddd0] bg-[#f1ece2] p-4 text-sm text-[#5b5044]">Licensed and insured</div>
                </div>
              </div>
            </section>

            <section className="grid gap-6 md:grid-cols-3">
              {photoSets.length > 0 ? (
                photoSets.map((set) => (
                  <PhotoSetCard key={set.title} title={set.title} beforeUrl={set.beforePhotoUrl} afterUrl={set.afterPhotoUrl} />
                ))
              ) : (
                <>
                  <PhotoSetCard title="Kitchen" beforeUrl={""} afterUrl={""} fallback="Add a kitchen comparison set." />
                  <PhotoSetCard title="Bathroom" beforeUrl={""} afterUrl={""} fallback="Add a bathroom comparison set." />
                  <PhotoSetCard title="Living area" beforeUrl={""} afterUrl={""} fallback="Add a living space comparison set." />
                </>
              )}
            </section>

            <section className="grid gap-6 md:grid-cols-2">
              <div className="rounded-[28px] bg-white p-6 shadow-[0_12px_40px_rgba(33,52,43,.06)]">
                <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#756b60]">Insurance & W-9</p>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <div className="rounded-2xl border border-[#e6ddd0] bg-[#f1ece2] p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#756b60]">Insurance certificate</p>
                    <p className="mt-2 text-sm leading-6 text-[#5b5044]">Your certificate is available for review before you accept.</p>
                    {data.quoteTemplate?.insuranceUrl ? <a href={data.quoteTemplate.insuranceUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex text-sm font-medium text-[#a84a22]">View certificate</a> : <p className="mt-3 text-xs text-[#756b60]">Certificate not configured</p>}
                  </div>
                  <div className="rounded-2xl border border-[#e6ddd0] bg-[#f1ece2] p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#756b60]">W-9 available</p>
                    <p className="mt-2 text-sm leading-6 text-[#5b5044]">Business information is available when requested.</p>
                    {data.quoteTemplate?.w9Url ? <a href={data.quoteTemplate.w9Url} target="_blank" rel="noreferrer" className="mt-3 inline-flex text-sm font-medium text-[#a84a22]">View W-9</a> : <p className="mt-3 text-xs text-[#756b60]">W-9 not configured</p>}
                  </div>
                </div>
              </div>

              <div className="rounded-[28px] bg-white p-6 shadow-[0_12px_40px_rgba(33,52,43,.06)]">
                <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#756b60]">Common questions</p>
                <div className="mt-5 space-y-3">
                  {FAQS.map((faq) => {
                    const open = openFaq === faq.q;
                    return (
                      <button key={faq.q} onClick={() => setOpenFaq(open ? null : faq.q)} className="block w-full rounded-2xl border border-[#e6ddd0] px-4 py-3 text-left">
                        <div className="flex items-center justify-between gap-4">
                          <span className="text-sm font-medium text-[#221d1a]">{faq.q}</span>
                          <span className="text-lg text-[#756b60]">{open ? "-" : "+"}</span>
                        </div>
                        {open ? <p className="mt-3 text-sm leading-6 text-[#5b5044]">{faq.a}</p> : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            </section>

          </main>

          <aside className="space-y-5 lg:sticky lg:top-6 lg:self-start">
            <section className="rounded-[32px] bg-white p-6 shadow-[0_18px_60px_rgba(33,52,43,.1)]">
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#756b60]">Your total</p>
              <p className="mt-2 text-4xl font-semibold">{dollars(quotedTotalCents)}</p>
              <p className="mt-1 text-sm text-[#756b60]">{selectedType ? SERVICE_LABELS[selectedType] : "Select an option"}</p>
              <p className="mt-2 text-sm font-medium text-[#a84a22]">{data.customerCity || data.locationName || "Your service area"}</p>
              <p className="mt-1 text-xs text-[#756b60]">This proposal is tailored to the home and location on file.</p>

              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl bg-[#f1ece2] p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#756b60]">Service area</p>
                  <p className="mt-2 text-sm font-medium">{data.customerCity || data.locationName || "Your home"}</p>
                </div>
                <div className="rounded-2xl bg-[#f1ece2] p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#756b60]">Travel zone</p>
                  <p className="mt-2 text-sm font-medium">{data.travelZoneName || "Included"}</p>
                </div>
              </div>

              {selectedBreakdown ? (
                <div className="mt-6 rounded-2xl border border-[#e6ddd0] bg-[#faf7f2] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#756b60]">Selected option</p>
                    <span className="text-xs text-[#756b60]">{dollars(quotedTotalCents)} final</span>
                  </div>
                  <p className="mt-2 text-sm font-medium text-[#221d1a]">{SERVICE_LABELS[selectedType ?? ""] ?? "Service option"}</p>
                  <p className="mt-2 text-sm leading-6 text-[#5b5044]">
                    Total includes the service scope, travel where applicable, and any selected add-ons.
                  </p>
                </div>
              ) : null}

              {requiresDeposit ? (
                <div className="mt-4 rounded-2xl border border-[#e8d9c5] bg-[#f7efe3] p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#8a6a3e]">Deposit required</p>
                  <p className="mt-2 text-sm leading-6 text-[#5b5044]">First-time and deep clean appointments require a 50% deposit to reserve the booking.</p>
                  <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                    <div className="rounded-2xl bg-white p-3">
                      <p className="text-xs uppercase tracking-[0.1em] text-[#756b60]">Due today</p>
                      <p className="mt-1 font-semibold text-[#221d1a]">{dollars(depositCents)}</p>
                    </div>
                    <div className="rounded-2xl bg-white p-3">
                      <p className="text-xs uppercase tracking-[0.1em] text-[#756b60]">After deposit</p>
                      <p className="mt-1 font-semibold text-[#221d1a]">{dollars(remainingCents)}</p>
                    </div>
                  </div>
                </div>
              ) : null}

              {isAccepted ? (
                <div className="mt-6 rounded-2xl bg-[#f1ece2] p-4 text-center text-sm text-[#4d7a3f]">
                  Accepted{data.quote.signatureName ? ` by ${data.quote.signatureName}` : ""}. We&apos;ll be in touch to confirm scheduling.
                </div>
              ) : isExpired ? (
                <div className="mt-6 rounded-2xl bg-slate-100 p-4 text-center text-sm text-slate-500">This proposal is no longer available.</div>
              ) : (
                <div className="mt-6 border-t border-[#efe9de] pt-5">
                  <label className="block text-sm font-medium">
                    Type your full name to sign
                    <input
                      value={signatureName}
                      onChange={(event) => setSignatureName(event.target.value)}
                      placeholder="Full name"
                      className="mt-2 w-full rounded-xl border border-[#ddd2c0] px-3 py-3 outline-none focus:border-[#c1592c]"
                    />
                  </label>
                  {error ? <p className="mt-3 text-sm text-rose-600">{error}</p> : null}
                  <button onClick={accept} disabled={accepting} className="mt-4 w-full rounded-xl bg-[#1c1917] px-4 py-3 text-sm font-bold text-white disabled:opacity-50">
                    {accepting ? "Accepting..." : requiresDeposit ? "Accept and reserve →" : "Accept proposal →"}
                  </button>
                  <p className="mt-3 text-center text-xs text-[#756b60]">By accepting, you agree to the service policies shown by the team.</p>
                </div>
              )}
            </section>

            <section className="rounded-[28px] bg-[#1c1917] p-6 text-white shadow-[0_18px_60px_rgba(33,52,43,.15)]">
              <p className="text-sm font-semibold text-[#e8a06e]">You&apos;re in good hands</p>
              <p className="mt-3 text-sm leading-7 text-white/75">
                Background-checked and trained pros, thoughtful communication, and a service standard built to make your home feel calm and cared for.
              </p>
              <div className="mt-6 grid gap-3 text-sm text-white/80">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">• 100% satisfaction-minded service</div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">• Eco-friendly products available</div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">• Fully licensed & insured</div>
              </div>
            </section>
          </aside>
        </div>

        <footer className="py-8 text-center text-xs text-[#756b60]">
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
    <div className="overflow-hidden rounded-2xl border border-[#e6ddd0] bg-[#faf7f2]">
      <div className="h-36 overflow-hidden bg-[linear-gradient(135deg,#efe0cd,#faf7f2)]">
        {hasUrl ? <img src={url} alt={title} className="h-full w-full object-cover" /> : null}
      </div>
      <div className="px-3 py-2">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#756b60]">{title}</p>
        <p className="mt-1 text-sm text-[#5b5044]">{hasUrl ? "Linked" : fallback}</p>
      </div>
    </div>
  );
}

