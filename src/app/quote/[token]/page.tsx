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
  supreme_deep: "Our most detailed clean for a full reset.",
  deep: "Extra attention to buildup, detail, and high-touch areas.",
  first_time: "A thorough first visit to establish your home baseline.",
  weekly: "Consistent maintenance for a home that stays ready.",
  biweekly: "A popular rhythm for busy households.",
  four_weeks: "Monthly maintenance with more time between visits.",
  move_in_out: "A transition clean for moving in or moving out.",
};

const DEFAULT_INTRO =
  "Thank you for considering our cleaning service. We prepared the options below around the home details you provided. Choose the service that feels right, and your total will update as you compare.";

const TESTIMONIALS = [
  {
    name: "Taylor R.",
    city: "Tulsa, OK",
    text: "CleanOps was consistently thorough and easy to work with. Coming home to a clean house is everything.",
  },
  {
    name: "Marcus H.",
    city: "Tulsa, OK",
    text: "They pay attention to the details I care about most. Highly recommend!",
  },
];

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
      <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#718179]">{eyebrow}</p>
      <h2 className="mt-2 text-2xl font-semibold text-[#1b2925]">{title}</h2>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function Stat({ label, value, suffix }: { label: string; value: string | number; suffix?: string }) {
  return (
    <div className="rounded-2xl bg-[#edf3e9] p-4">
      <p className="text-xs uppercase tracking-[0.12em] text-[#718179]">{label}</p>
      <p className="mt-2 font-medium text-[#1b2925]">
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
      <div className="flex items-center justify-between border-b border-[#edf0ec] px-5 py-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#718179]">Before / after</p>
          <p className="mt-1 text-base font-semibold text-[#1b2925]">{title}</p>
        </div>
        <span className="rounded-full bg-[#edf3e9] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#5c7436]">
          {hasAny ? "Ready" : "Add photos"}
        </span>
      </div>
      {hasAny ? (
        <div className="grid grid-cols-2 gap-0">
          <PhotoPanel title="Before" url={beforeUrl} fallback="Add a before photo" />
          <PhotoPanel title="After" url={afterUrl} fallback="Add an after photo" />
        </div>
      ) : (
        <div className="p-5 text-sm text-[#718179]">{fallback ?? "Add before and after photos to show the difference clearly."}</div>
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

  useEffect(() => {
    fetch(`/api/public/quotes/${token}`)
      .then((response) => {
        if (!response.ok) throw new Error("not found");
        return response.json();
      })
      .then((body: PublicQuote) => {
        setData(body);
        setSelectedType(body.quote.acceptedServiceType ?? body.quote.requestedServiceType);
      })
      .catch(() => setNotFound(true));
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
      body: JSON.stringify({ serviceType: selectedType, signatureName }),
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
  const brandColor = /^#[0-9a-fA-F]{6}$/.test(data?.companyBrandColor ?? "") ? (data?.companyBrandColor ?? "#14211f") : "#14211f";
  const contactPhone = data?.quoteTemplate?.contactPhone || data?.companyPhone || "";
  const reviewUrl = data?.companyReviewUrl || data?.quoteTemplate?.reviewUrl || "";
  const requiresDeposit = selectedType ? ["first_time", "deep"].includes(selectedType) : false;
  const selectedTotalCents = selectedBreakdown?.finalCents ?? data?.quote.totalCents ?? 0;
  const depositCents = requiresDeposit ? Math.round(selectedTotalCents * 0.5) : 0;
  const remainingCents = requiresDeposit ? Math.max(0, selectedTotalCents - depositCents) : 0;

  if (notFound) {
    return <div className="flex min-h-screen items-center justify-center bg-[#f4f2eb] p-6 text-center text-sm text-slate-500">This proposal link is invalid or has expired.</div>;
  }

  if (!data) {
    return <div className="flex min-h-screen items-center justify-center bg-[#f4f2eb] p-6 text-sm text-slate-500">Loading your proposal...</div>;
  }

  return (
    <div className="min-h-screen bg-[#f4f2eb] px-4 py-6 text-[#1b2925] sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <header className="mb-6 rounded-[32px] bg-white p-5 shadow-[0_12px_40px_rgba(33,52,43,.06)] sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl" style={{ background: brandColor }}>
                {data.companyLogoUrl ? (
                  <img src={data.companyLogoUrl} alt={`${data.companyName} logo`} className="h-full w-full object-contain p-1.5" />
                ) : (
                  <span className="font-bold text-[#c8e86b]">CO</span>
                )}
              </div>
              <div>
                <p className="text-2xl font-semibold tracking-tight">{data.companyName}</p>
                <p className="text-sm text-[#718179]">
                  Proposal for {data.customerFirstName} {data.customerLastName}
                </p>
                <p className="mt-2 text-xs text-[#718179]">{data.locationName || "Your home"} Â· Proposal {data.quote.id.slice(0, 8).toUpperCase()}</p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {data.companyPhone ? (
                <>
                  <a href={`tel:${data.companyPhone}`} className="inline-flex items-center gap-2 rounded-full border border-[#d7dfd4] bg-white px-4 py-2 text-sm font-medium text-[#1b2925]">
                    <span aria-hidden="true">☎</span>
                    Call
                  </a>
                  <a href={`sms:${data.companyPhone}`} className="inline-flex items-center gap-2 rounded-full border border-[#d7dfd4] bg-white px-4 py-2 text-sm font-medium text-[#1b2925]">
                    <span aria-hidden="true">✉</span>
                    Text
                  </a>
                </>
              ) : null}
              {data.companyReviewUrl ? (
                <a href={data.companyReviewUrl} target="_blank" rel="noreferrer" className="rounded-full border border-[#d7dfd4] bg-white px-4 py-2 text-sm font-medium text-[#1b2925]">
                  Google rating link
                </a>
              ) : null}
            </div>
          </div>
        </header>

        <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
          <main className="space-y-6">
            <Section eyebrow="Your cleaning proposal" title="Choose the service that fits your home">
              <p className="max-w-2xl whitespace-pre-line text-base leading-7 text-[#52625a]">{intro}</p>
              {data.quoteTemplate?.preferredDatePrompt ? (
                <div className="mt-5 rounded-2xl border border-[#dbe5d1] bg-[#f4f8ef] p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#6b7e58]">Preferred date</p>
                  <p className="mt-2 text-sm leading-6 text-[#52625a]">{data.quoteTemplate.preferredDatePrompt}</p>
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
                        selected ? "border-[#5c7436] bg-[#f0f8df] ring-2 ring-[#c8e86b]" : "border-[#e1e8df] bg-white"
                      } ${isAccepted || isExpired ? "cursor-default opacity-75" : ""}`}
                    >
                      {index === 1 ? (
                        <span className="absolute -top-3 left-4 rounded-full bg-[#14211f] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.1em] text-white">
                          Most popular
                        </span>
                      ) : null}
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold">{SERVICE_LABELS[type] ?? type}</p>
                          <p className="mt-2 min-h-10 text-xs leading-5 text-[#718179]">{SERVICE_DESCRIPTIONS[type] || "A service option prepared for your home."}</p>
                        </div>
                        <span className={`flex h-6 w-6 items-center justify-center rounded-md border text-sm ${selected ? "border-[#14211f] bg-[#14211f] text-[#c8e86b]" : "border-[#bdcbbf] text-transparent"}`}>
                          âœ“
                        </span>
                      </div>
                      <div className="mt-4 rounded-2xl border border-[#edf0ec] bg-[#fbfcf8] p-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#718179]">Photo checklist</p>
                        <ul className="mt-2 space-y-1.5 text-xs leading-5 text-[#52625a]">
                          {tier.roomLines.slice(0, 3).map((room) => (
                            <li key={`${type}-${room.roomTypeName}`} className="flex items-center justify-between gap-3">
                              <span className="truncate">{room.roomTypeName}</span>
                              <span className="rounded-full bg-white px-2 py-0.5 font-medium text-[#536d35]">{room.count}</span>
                            </li>
                          ))}
                          {tier.roomLines.length > 3 ? <li className="text-[11px] text-[#718179]">+{tier.roomLines.length - 3} more room types</li> : null}
                        </ul>
                      </div>
                      <p className="mt-5 text-2xl font-semibold">{dollars(tier.finalCents)}</p>
                      <p className="mt-1 text-xs text-[#718179]">Per scheduled visit</p>
                    </button>
                  );
                })}
              </div>
            </Section>

            <section className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
              <div className="rounded-[28px] bg-white p-6 shadow-[0_12px_40px_rgba(33,52,43,.06)]">
                <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#718179]">Add-on services</p>
                <h3 className="mt-2 text-2xl font-semibold text-[#1b2925]">Add extras without reopening the whole quote</h3>
                <p className="mt-3 max-w-2xl text-base leading-7 text-[#52625a]">
                  If you want windows, inside appliances, or a custom add-on, just call or text the office and we can update the scope before you accept.
                </p>
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  {[
                    "Inside windows",
                    "Oven interior",
                    "Fridge interior",
                    "Baseboards",
                    "Cabinet fronts",
                    "Laundry / folding",
                  ].map((item) => (
                    <div key={item} className="rounded-2xl border border-[#e7ebe2] bg-[#fbfcf8] px-4 py-3 text-sm font-medium text-[#1b2925]">
                      {item}
                    </div>
                  ))}
                </div>
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
                <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#718179]">Google reviews</p>
                <h3 className="mt-2 text-2xl font-semibold text-[#1b2925]">Make it easy for customers to trust the team</h3>
                <p className="mt-3 text-sm leading-7 text-[#52625a]">
                  The proposal can point customers straight to your review profile so they can see real feedback before they decide.
                </p>
                <div className="mt-5 rounded-[26px] border border-[#e7ebe2] bg-[#f7f8f3] p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#718179]">Review link</p>
                  <p className="mt-2 text-lg font-semibold text-[#1b2925]">{reviewUrl ? "Configured" : "Add your Google review link"}</p>
                  <p className="mt-2 text-sm leading-6 text-[#52625a]">{reviewUrl ? "This link will appear in the proposal header and the trust section." : "Paste your Google Business review URL here so customers can open it directly."}</p>
                  {reviewUrl ? (
                    <a href={reviewUrl} target="_blank" rel="noreferrer" className="mt-4 inline-flex rounded-full border border-[#d7dfd4] bg-white px-4 py-2 text-sm font-medium text-[#1b2925]">
                      Open review page
                    </a>
                  ) : null}
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
                <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#718179]">What neighbors say</p>
                <div className="mt-5 space-y-5">
                  {TESTIMONIALS.map((testimonial) => (
                    <div key={testimonial.name} className="rounded-2xl bg-[#f8f7f2] p-4">
                      <p className="text-sm leading-6 text-[#52625a]">â€œ{testimonial.text}â€</p>
                      <p className="mt-3 text-sm font-semibold text-[#1b2925]">
                        â€” {testimonial.name}, {testimonial.city}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-[28px] bg-white p-6 shadow-[0_12px_40px_rgba(33,52,43,.06)]">
                <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#718179]">Common questions</p>
                <div className="mt-5 space-y-3">
                  {FAQS.map((faq) => {
                    const open = openFaq === faq.q;
                    return (
                      <button key={faq.q} onClick={() => setOpenFaq(open ? null : faq.q)} className="block w-full rounded-2xl border border-[#e7ebe2] px-4 py-3 text-left">
                        <div className="flex items-center justify-between gap-4">
                          <span className="text-sm font-medium text-[#1b2925]">{faq.q}</span>
                          <span className="text-lg text-[#718179]">{open ? "âˆ’" : "+"}</span>
                        </div>
                        {open ? <p className="mt-3 text-sm leading-6 text-[#52625a]">{faq.a}</p> : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            </section>

            <section className="grid gap-6 md:grid-cols-2">
              <div className="rounded-[28px] bg-white p-6 shadow-[0_12px_40px_rgba(33,52,43,.06)]">
                <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#718179]">Weâ€™re covered so youâ€™re protected</p>
                <p className="mt-3 text-sm leading-7 text-[#52625a]">
                  CleanOps carries general liability insurance and bonding for peace of mind. Your service team and home are both protected.
                </p>
                <a
                  href={data.companyReviewUrl || "#"}
                  target={data.companyReviewUrl ? "_blank" : undefined}
                  rel={data.companyReviewUrl ? "noreferrer" : undefined}
                  className="mt-4 inline-flex text-sm font-semibold text-[#536d35] underline decoration-[#c8e86b] decoration-2 underline-offset-4"
                >
                  {data.companyReviewUrl ? "Leave a Google rating" : "Google rating link coming soon"}
                </a>
              </div>

              <div className="rounded-[28px] bg-white p-6 shadow-[0_12px_40px_rgba(33,52,43,.06)]">
                <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#718179]">W-9 available</p>
                <p className="mt-3 text-sm leading-7 text-[#52625a]">Weâ€™re happy to provide our W-9 upon request for bookkeeping or vendor setup.</p>
                <a href="#" className="mt-4 inline-flex text-sm font-semibold text-[#536d35] underline decoration-[#c8e86b] decoration-2 underline-offset-4">
                  Download W-9
                </a>
              </div>
            </section>

          </main>

          <aside className="space-y-5 lg:sticky lg:top-6 lg:self-start">
            <section className="rounded-[32px] bg-white p-6 shadow-[0_18px_60px_rgba(33,52,43,.1)]">
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#718179]">Your total</p>
              <p className="mt-2 text-4xl font-semibold">{dollars(selectedBreakdown?.finalCents ?? data.quote.totalCents)}</p>
              <p className="mt-1 text-sm text-[#718179]">{selectedType ? SERVICE_LABELS[selectedType] : "Select an option"}</p>
              <p className="mt-2 text-sm font-medium text-[#536d35]">{data.customerCity || data.locationName || "Your service area"}</p>
              <p className="mt-1 text-xs text-[#718179]">This proposal is tailored to the home and location on file.</p>

              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl bg-[#f6f8f2] p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#718179]">Service area</p>
                  <p className="mt-2 text-sm font-medium">{data.customerCity || data.locationName || "Your home"}</p>
                </div>
                <div className="rounded-2xl bg-[#f6f8f2] p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#718179]">Travel zone</p>
                  <p className="mt-2 text-sm font-medium">{data.travelZoneName || "Included"}</p>
                </div>
              </div>

              {selectedBreakdown ? (
                <div className="mt-6 rounded-2xl border border-[#e7ebe2] bg-[#fbfcf8] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#718179]">Selected option</p>
                    <span className="text-xs text-[#718179]">{dollars(selectedBreakdown.finalCents)} final</span>
                  </div>
                  <p className="mt-2 text-sm font-medium text-[#1b2925]">{SERVICE_LABELS[selectedType ?? ""] ?? "Service option"}</p>
                  <p className="mt-2 text-sm leading-6 text-[#52625a]">
                    Total includes the service scope, travel where applicable, and the live pricing rules tied to this home.
                  </p>
                </div>
              ) : null}

              {requiresDeposit ? (
                <div className="mt-4 rounded-2xl border border-[#dfe8cf] bg-[#f4f8ef] p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#6b7e58]">Deposit required</p>
                  <p className="mt-2 text-sm leading-6 text-[#52625a]">First-time and deep clean appointments require a 50% deposit to reserve the booking.</p>
                  <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                    <div className="rounded-2xl bg-white p-3">
                      <p className="text-xs uppercase tracking-[0.1em] text-[#718179]">Due today</p>
                      <p className="mt-1 font-semibold text-[#1b2925]">{dollars(depositCents)}</p>
                    </div>
                    <div className="rounded-2xl bg-white p-3">
                      <p className="text-xs uppercase tracking-[0.1em] text-[#718179]">After deposit</p>
                      <p className="mt-1 font-semibold text-[#1b2925]">{dollars(remainingCents)}</p>
                    </div>
                  </div>
                </div>
              ) : null}

              {isAccepted ? (
                <div className="mt-6 rounded-2xl bg-[#edf3e9] p-4 text-center text-sm text-[#5c7436]">
                  Accepted{data.quote.signatureName ? ` by ${data.quote.signatureName}` : ""}. Weâ€™ll be in touch to confirm scheduling.
                </div>
              ) : isExpired ? (
                <div className="mt-6 rounded-2xl bg-slate-100 p-4 text-center text-sm text-slate-500">This proposal is no longer available.</div>
              ) : (
                <div className="mt-6 border-t border-[#edf0ec] pt-5">
                  <label className="block text-sm font-medium">
                    Type your full name to sign
                    <input
                      value={signatureName}
                      onChange={(event) => setSignatureName(event.target.value)}
                      placeholder="Full name"
                      className="mt-2 w-full rounded-xl border border-[#d9e1da] px-3 py-3 outline-none focus:border-[#78964a]"
                    />
                  </label>
                  {error ? <p className="mt-3 text-sm text-rose-600">{error}</p> : null}
                  <button onClick={accept} disabled={accepting} className="mt-4 w-full rounded-xl bg-[#14211f] px-4 py-3 text-sm font-bold text-white disabled:opacity-50">
                    {accepting ? "Accepting..." : requiresDeposit ? "Accept and reserve →" : "Accept proposal →"}
                  </button>
                  <p className="mt-3 text-center text-xs text-[#718179]">By accepting, you agree to the service policies shown by the team.</p>
                </div>
              )}
            </section>

            <section className="rounded-[28px] bg-[#14211f] p-6 text-white shadow-[0_18px_60px_rgba(33,52,43,.15)]">
              <p className="text-sm font-semibold text-[#c8e86b]">Youâ€™re in good hands</p>
              <p className="mt-3 text-sm leading-7 text-white/75">
                Background-checked and trained pros, thoughtful communication, and a service standard built to make your home feel calm and cared for.
              </p>
              <div className="mt-6 grid gap-3 text-sm text-white/80">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">â€¢ 100% satisfaction-minded service</div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">â€¢ Eco-friendly products available</div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">â€¢ Fully licensed & insured</div>
              </div>
            </section>
          </aside>
        </div>

        <footer className="py-8 text-center text-xs text-[#718179]">
          Prepared by {data.quoteTemplate?.ownerName || data.companyName}
          {data.quoteTemplate?.ownerTitle ? ` Â· ${data.quoteTemplate.ownerTitle}` : ""}
        </footer>
      </div>
    </div>
  );
}

function PhotoPanel({ title, url, fallback }: { title: string; url: string; fallback: string }) {
  const hasUrl = Boolean(url.trim());
  return (
    <div className="overflow-hidden rounded-2xl border border-[#e7ebe2] bg-[#faf9f6]">
      <div className="h-36 overflow-hidden bg-[linear-gradient(135deg,#efe9dc,#f9f7f1)]">
        {hasUrl ? <img src={url} alt={title} className="h-full w-full object-cover" /> : null}
      </div>
      <div className="px-3 py-2">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#718179]">{title}</p>
        <p className="mt-1 text-sm text-[#52625a]">{hasUrl ? "Linked" : fallback}</p>
      </div>
    </div>
  );
}

