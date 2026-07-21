"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import AddressAutocomplete from "../address-autocomplete";

type Customer = {
  id: string;
  firstName: string;
  lastName: string;
  status: string;
  salutation?: string | null;
  customerNumber?: string | null;
  phone?: string | null;
  email?: string | null;
  textMessagingAllowed?: boolean;
  source?: string | null;
  preferredCommunication?: string | null;
  preferredDay?: string | null;
  preferredTime?: string | null;
  serviceType?: string | null;
  paymentMethod?: string | null;
  importantToCustomer?: string | null;
  doNotClean?: string | null;
  petNotes?: string | null;
  operationalNotes?: string | null;
  homeDetails?: Record<string, unknown>;
  tags?: unknown;
};

type RoomType = { id: string; name: string; sortOrder: number };

type Location = {
  id?: string;
  label: string;
  addressLine1: string;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  subdivision?: string | null;
  accessInstructions?: string | null;
  keyNumber?: string | null;
  garageCode?: string | null;
  gateCode?: string | null;
  alarmCode?: string | null;
  vacuumLocation?: string | null;
  mopHeadsNeeded?: string | null;
  trashBags?: string | null;
  googlePlaceId?: string | null;
};

type CustomerJob = {
  id: string;
  type: string;
  status: string;
  scheduledDate: string;
  scheduledStartTime: string | null;
  estimatedDurationMinutes: number | null;
  priceCents: number;
};

type CustomerInvoice = {
  id: string;
  status: string;
  method: string | null;
  totalCents: number;
  amountPaidCents: number;
  tipCents: number;
  createdAt: string;
  paidAt: string | null;
};

type AuditEntry = {
  id: string;
  action: string;
  createdAt: string;
  editorFirstName: string | null;
  editorLastName: string | null;
};

type ServiceAreaSummary = {
  status: "in_area" | "outside_area" | "missing_address" | "no_service_zones";
  label: string;
  detail: string;
  matchedServiceLocationName?: string | null;
  matchedZoneName?: string | null;
  addressLabel?: string | null;
};

const STATUS_OPTIONS = [
  { value: "lead", label: "Lead" },
  { value: "quoted", label: "Quoted" },
  { value: "first_clean_booked", label: "First clean booked" },
  { value: "client", label: "Active client" },
  { value: "lost", label: "Lost" },
  { value: "moved", label: "Moved" },
];

const STATUS_STYLES: Record<string, string> = {
  lead: "border-slate-200 bg-slate-50 text-slate-600",
  quoted: "border-blue-200 bg-blue-50 text-blue-700",
  first_clean_booked: "border-amber-200 bg-amber-50 text-amber-700",
  client: "border-emerald-200 bg-emerald-50 text-emerald-700",
  lost: "border-rose-200 bg-rose-50 text-rose-700",
  moved: "border-slate-200 bg-slate-50 text-slate-400",
};

const TYPE_LABELS: Record<string, string> = {
  first_clean: "First clean",
  recurring: "Recurring",
  one_time: "One-time",
  deep_clean: "Deep clean",
  move_out: "Move in/out",
};

const input = "co-input w-full";

function Field({
  label,
  value,
  onChange,
  type = "text",
  textarea = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  textarea?: boolean;
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-xs font-semibold text-[var(--co-muted)]">{label}</span>
      {textarea ? (
        <textarea rows={3} value={value} onChange={(event) => onChange(event.target.value)} className={`${input} resize-none`} />
      ) : (
        <input type={type} value={value} onChange={(event) => onChange(event.target.value)} className={input} />
      )}
    </label>
  );
}

function formatApiError(error: unknown): string {
  if (!error) return "";
  if (typeof error === "string") return error;
  if (typeof error === "object" && error !== null) {
    const { fieldErrors, formErrors } = error as { fieldErrors?: Record<string, string[]>; formErrors?: string[] };
    if (fieldErrors || formErrors) {
      const fieldMessages = Object.entries(fieldErrors ?? {}).map(([field, messages]) => `${field}: ${messages.join(", ")}`);
      return [...(formErrors ?? []), ...fieldMessages].join(" · ") || "Could not save this profile.";
    }
  }
  return "Could not save this profile.";
}

function money(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function Section({
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
      <div className="border-b border-[var(--co-line-soft)] px-5 py-4 sm:px-6">
        <p className="eyebrow">{eyebrow}</p>
        <h2 className="mt-1 text-lg font-semibold">{title}</h2>
        {description ? <p className="mt-1 text-sm text-[var(--co-muted)]">{description}</p> : null}
      </div>
      <div className="px-5 py-5 sm:px-6">{children}</div>
    </section>
  );
}

function InfoCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-[24px] border border-[var(--co-line-soft)] bg-[var(--co-surface-muted)]/40 p-4 shadow-[0_8px_24px_rgba(27,41,37,0.03)]">
      <p className="text-xs font-medium uppercase tracking-[0.12em] text-[var(--co-muted)]">{label}</p>
      <p className="mt-2 text-sm font-semibold">{value}</p>
      {sub ? <p className="mt-1 text-xs text-[var(--co-muted)]">{sub}</p> : null}
    </div>
  );
}

function PhotoTile({ title }: { title: string }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--co-line-soft)] bg-white">
      <div className="flex h-32 items-end bg-[linear-gradient(135deg,#f5f0e8,#ddd4c2)] p-3">
        <span className="rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-semibold text-[var(--co-evergreen)]">Before / after</span>
      </div>
      <div className="flex items-center justify-between px-3 py-2 text-xs">
        <span className="font-medium text-[var(--co-ink)]">{title}</span>
        <span className="rounded-full bg-[var(--co-surface-muted)] px-2 py-0.5 text-[var(--co-muted)]">Before / after</span>
      </div>
    </div>
  );
}

export default function CustomerProfilePage({ params }: { params: Promise<{ customerId: string }> }) {
  const { customerId } = use(params);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [roomTypes, setRoomTypes] = useState<RoomType[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [jobs, setJobs] = useState<CustomerJob[]>([]);
  const [invoices, setInvoices] = useState<CustomerInvoice[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditEntry[]>([]);
  const [serviceArea, setServiceArea] = useState<ServiceAreaSummary | null>(null);
  const [activeLocationIndex, setActiveLocationIndex] = useState(0);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    setLoaded(false);
    const response = await fetch(`/api/customers/${customerId}`, { cache: "no-store" });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error ?? `Customer could not be loaded (${response.status}).`);
    setCustomer(body.customer);
    setLocations(body.locations ?? []);
    setJobs(body.jobs ?? []);
    setInvoices(body.invoices ?? []);
    setAuditLogs(body.auditLogs ?? []);
    setServiceArea(body.serviceArea ?? null);
    setLoaded(true);
  }, [customerId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load customer profile data on mount
    load().catch((cause: unknown) => {
      setError(cause instanceof Error ? cause.message : "Customer could not be loaded.");
      setLoaded(true);
    });
  }, [load]);

  useEffect(() => {
    fetch("/api/room-types")
      .then((response) => response.json())
      .then((body) => setRoomTypes(body.roomTypes ?? []))
      .catch(() => {});
  }, []);

  const location = locations[activeLocationIndex] ?? null;
  const home = customer?.homeDetails ?? {};
  const roomCounts = (home.roomCounts as Record<string, number>) ?? {};
  const upcomingJobs = useMemo(
    () =>
      jobs
        .filter((job) => !["completed", "cancelled", "no_show"].includes(job.status))
        .sort((a, b) => `${a.scheduledDate}${a.scheduledStartTime ?? ""}`.localeCompare(`${b.scheduledDate}${b.scheduledStartTime ?? ""}`)),
    [jobs]
  );
  const recentJobs = useMemo(
    () =>
      jobs
        .filter((job) => job.status === "completed" || job.status === "no_show" || job.status === "cancelled")
        .sort((a, b) => `${b.scheduledDate}${b.scheduledStartTime ?? ""}`.localeCompare(`${a.scheduledDate}${a.scheduledStartTime ?? ""}`)),
    [jobs]
  );
  const nextJob = upcomingJobs[0] ?? null;
  const lastJob = recentJobs[0] ?? null;
  const openBalance = invoices.reduce((sum, invoice) => sum + (invoice.status === "void" ? 0 : Math.max(invoice.totalCents - invoice.amountPaidCents, 0)), 0);

  const updateCustomer = (key: keyof Customer, value: string | boolean) => setCustomer((current) => (current ? { ...current, [key]: value } : current));
  const updateHome = (key: string, value: string) => setCustomer((current) => (current ? { ...current, homeDetails: { ...(current.homeDetails ?? {}), [key]: value } } : current));
  const updateRoomCount = (roomTypeId: string, value: string) =>
    setCustomer((current) => {
      if (!current) return current;
      const home = current.homeDetails ?? {};
      const roomCounts = { ...((home.roomCounts as Record<string, number>) ?? {}) };
      const count = Number(value);
      if (value.trim() === "" || Number.isNaN(count)) {
        delete roomCounts[roomTypeId];
      } else {
        roomCounts[roomTypeId] = count;
      }
      return { ...current, homeDetails: { ...home, roomCounts } };
    });
  const updateLocation = (key: keyof Location, value: string) => setLocations((current) => current.map((item, index) => (index === activeLocationIndex ? { ...item, [key]: value } : item)));
  const updateAddress = (parts: { addressLine1: string; city: string; state: string; zip: string; county: string; googlePlaceId: string }) =>
    setLocations((current) => current.map((item, index) => (index === activeLocationIndex ? { ...item, ...parts } : item)));

  async function save() {
    if (!customer) return;
    setSaving(true);
    setMessage("");
    setError("");
    const response = await fetch(`/api/customers/${customerId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        firstName: customer.firstName,
        lastName: customer.lastName,
        salutation: customer.salutation || null,
        customerNumber: customer.customerNumber || null,
        email: customer.email || null,
        phone: customer.phone || null,
        status: customer.status,
        source: customer.source || null,
        textMessagingAllowed: Boolean(customer.textMessagingAllowed),
        preferredCommunication: customer.preferredCommunication || null,
        preferredDay: customer.preferredDay || null,
        preferredTime: customer.preferredTime || null,
        serviceType: customer.serviceType || null,
        paymentMethod: customer.paymentMethod || null,
        importantToCustomer: customer.importantToCustomer || null,
        doNotClean: customer.doNotClean || null,
        petNotes: customer.petNotes || null,
        operationalNotes: customer.operationalNotes || null,
        homeDetails: customer.homeDetails ?? {},
        locations: locations.map((item) => ({ ...item, id: item.id || undefined })),
      }),
    });
    const body = await response.json().catch(() => ({}));
    setSaving(false);
    if (!response.ok) {
      setError(formatApiError(body.error) ?? "Could not save this profile.");
      return;
    }
    setMessage("Profile saved.");
    await load();
  }

  const addressSectionRef = useRef<HTMLElement>(null);

  function jumpToAddressFields() {
    addressSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function addLocation() {
    setLocations((current) => [...current, { label: `Location ${current.length + 1}`, addressLine1: "" }]);
    setActiveLocationIndex(locations.length);
    setTimeout(jumpToAddressFields, 50);
  }

  const primaryAddress = location
    ? [location.addressLine1, location.city, location.state, location.zip].filter(Boolean).join(", ")
    : "";

  if (!loaded) {
    return (
      <div className="space-y-4">
        <div className="h-4 w-36 animate-pulse rounded bg-[var(--co-line)]" />
        <div className="h-36 animate-pulse rounded-2xl bg-[var(--co-surface)]" />
        <div className="h-72 animate-pulse rounded-2xl bg-[var(--co-surface)]" />
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="co-card p-8 text-center">
        <p className="font-medium">Unable to load this customer.</p>
        <p className="mt-2 text-sm text-rose-600">{error}</p>
        <button className="co-button-secondary mt-5" onClick={() => load()}>
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <Link href="/customers" className="text-sm font-medium text-[var(--co-evergreen)] hover:underline">
            ← Customers
          </Link>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <p className="eyebrow">Customer profile</p>
            <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${STATUS_STYLES[customer.status] ?? "border-slate-200 bg-slate-50 text-slate-600"}`}>
              {STATUS_OPTIONS.find((option) => option.value === customer.status)?.label ?? customer.status}
            </span>
          </div>
          <h1 className="page-title mt-2">
            {customer.firstName} {customer.lastName}
          </h1>
          <p className="page-subtitle">Internal profile for scheduling, house instructions, and customer history.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/jobs/new?customerId=${customer.id}`} className="co-button-secondary">
            + New job
          </Link>
          <button className="co-button-primary" onClick={save} disabled={saving}>
            {saving ? "Saving..." : "Save profile"}
          </button>
        </div>
      </header>

      {message ? (
        <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {message}
        </div>
      ) : null}
      {error ? (
        <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      <section className="grid gap-5 xl:grid-cols-[1.1fr_1.15fr_0.85fr]">
        <div className="co-card p-5">
          <div className="flex items-start gap-4">
            <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-[var(--co-surface-muted)] text-2xl font-bold text-[var(--co-evergreen)]">
              {customer.firstName[0]}
              {customer.lastName[0]}
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-semibold">
                {customer.firstName} {customer.lastName}
              </h2>
              <p className="mt-1 text-sm text-[var(--co-muted)]">{customer.email || "No email"}</p>
              <p className="text-sm text-[var(--co-muted)]">{customer.phone || "No phone"}</p>
              <p className="mt-3 text-xs text-[var(--co-muted)]">Lead source: {customer.source || "Not recorded"}</p>
              <p className="mt-1 text-xs text-[var(--co-muted)]">Preferred contact: {customer.preferredCommunication || "Not recorded"}</p>
            </div>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <InfoCard label="Visits" value={`${upcomingJobs.length}`} sub="Upcoming jobs" />
            <InfoCard label="Invoices" value={`${invoices.length}`} sub="Recorded invoices" />
            <InfoCard label="Open balance" value={money(openBalance)} sub={openBalance ? "Needs collection" : "Paid through"} />
            <InfoCard
              label="Service area"
              value={serviceArea?.label ?? "Checking..."}
              sub={serviceArea?.detail ?? "Matched against configured zones"}
            />
          </div>
          <div className="mt-5 grid gap-3 rounded-[24px] border border-[var(--co-line-soft)] bg-[linear-gradient(135deg,#f8fbf5,#eef5eb)] p-4 sm:grid-cols-2">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.12em] text-[var(--co-muted)]">Next visit</p>
              {nextJob ? (
                <Link href={`/jobs/${nextJob.id}`} className="mt-2 block text-sm font-semibold text-[var(--co-evergreen)] hover:underline">
                  {nextJob.scheduledDate}
                  <span className="block text-xs font-normal text-[var(--co-muted)]">
                    {nextJob.scheduledStartTime?.slice(0, 5) ?? "No time"} · {TYPE_LABELS[nextJob.type] ?? nextJob.type}
                  </span>
                </Link>
              ) : (
                <p className="mt-2 text-sm text-[var(--co-muted)]">No visit scheduled yet.</p>
              )}
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.12em] text-[var(--co-muted)]">Last visit</p>
              {lastJob ? (
                <Link href={`/jobs/${lastJob.id}`} className="mt-2 block text-sm font-semibold text-[var(--co-evergreen)] hover:underline">
                  {lastJob.scheduledDate}
                  <span className="block text-xs font-normal text-[var(--co-muted)]">
                    {TYPE_LABELS[lastJob.type] ?? lastJob.type} · {lastJob.status.replaceAll("_", " ")}
                  </span>
                </Link>
              ) : (
                <p className="mt-2 text-sm text-[var(--co-muted)]">No completed history yet.</p>
              )}
            </div>
          </div>
          <div className="mt-5 border-t border-[var(--co-line-soft)] pt-4">
            <label className="block text-xs font-semibold text-[var(--co-muted)]">
              Customer status
              <select className="co-input mt-1 w-full" value={customer.status} onChange={(event) => updateCustomer("status", event.target.value)}>
                {STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="mt-3 flex items-center gap-2 text-sm">
              <input type="checkbox" checked={Boolean(customer.textMessagingAllowed)} onChange={(event) => updateCustomer("textMessagingAllowed", event.target.checked)} className="accent-[var(--co-evergreen)]" />
              Allow text messaging
            </label>
            <div className="mt-4 flex flex-wrap gap-2">
              <span className="rounded-full bg-[var(--co-surface-muted)] px-3 py-1 text-xs font-medium text-[var(--co-evergreen)]">Internal only</span>
              <span className="rounded-full bg-[var(--co-surface-muted)] px-3 py-1 text-xs font-medium text-[var(--co-evergreen)]">Takeover ready</span>
            </div>
          </div>
        </div>

        <div className="co-card p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="eyebrow">Service address</p>
              <h2 className="mt-1 text-lg font-semibold">{location?.label ?? "No address on file"}</h2>
              <p className="mt-1 text-sm text-[var(--co-muted)]">{location?.addressLine1 || "Address not recorded"}</p>
              <p className="text-sm text-[var(--co-muted)]">
                {location?.city ?? ""}
                {location?.state ? `, ${location.state}` : ""} {location?.zip ?? ""}
              </p>
            </div>
            <span className="rounded-xl bg-[var(--co-surface-muted)] px-3 py-2 text-xs font-medium text-[var(--co-evergreen)]">
              {locations.length} address{locations.length === 1 ? "" : "es"}
            </span>
          </div>

          {locations.length > 0 ? (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {locations.map((item, index) => (
                <button
                  key={item.id || `location-${index}`}
                  onClick={() => {
                    setActiveLocationIndex(index);
                    jumpToAddressFields();
                  }}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
                    index === activeLocationIndex ? "border-[var(--co-evergreen)] bg-[var(--co-evergreen)] text-white" : "border-[var(--co-line)] bg-white text-[var(--co-muted)]"
                  }`}
                >
                  {item.label}
                </button>
              ))}
              <button className="rounded-full border border-dashed border-[var(--co-line)] px-3 py-1.5 text-xs text-[var(--co-muted)]" onClick={addLocation}>
                + Address
              </button>
              <button onClick={jumpToAddressFields} className="ml-auto text-xs font-medium text-[var(--co-evergreen)] hover:underline">
                Edit address details ↓
              </button>
            </div>
          ) : (
            <button className="co-button-secondary mt-4" onClick={addLocation}>
              Add service address
            </button>
          )}

          <div className="mt-4 rounded-2xl border border-[var(--co-line-soft)] bg-[linear-gradient(135deg,#eef5eb,#f8faf5)] p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.12em] text-[var(--co-muted)]">Map preview</p>
                <p className="mt-1 text-sm font-semibold">{location?.city ? `${location.city}, ${location.state ?? ""}` : "Service area"}</p>
              </div>
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(primaryAddress)}`}
                target="_blank"
                rel="noreferrer"
                className="text-sm font-medium text-[var(--co-evergreen)] hover:underline"
              >
                Get directions
              </a>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <InfoCard label="Gate / access" value={location?.accessInstructions || "No instructions"} sub="Visible to internal team" />
              <InfoCard label="Subdivision" value={location?.subdivision || "Not recorded"} sub="Useful for route recall" />
            </div>
          </div>

          {location ? (
            <div className="mt-4 rounded-2xl border border-[var(--co-line-soft)] bg-[var(--co-surface-muted)]/50 p-4 text-sm">
              <p className="font-medium">Entry instructions</p>
              <p className="mt-1 text-[var(--co-muted)]">{location.accessInstructions || "No entry instructions recorded."}</p>
            </div>
          ) : null}
        </div>

        <div className="space-y-5">
        <Section eyebrow="Schedule" title="Upcoming visits" description="The next jobs on the board, in the order they should happen.">
          {upcomingJobs.length === 0 ? (
            <p className="py-4 text-sm text-[var(--co-muted)]">No upcoming jobs scheduled.</p>
          ) : (
            <div className="space-y-2">
                {upcomingJobs.slice(0, 5).map((job) => (
                  <Link
                    key={job.id}
                    href={`/jobs/${job.id}`}
                    className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--co-line-soft)] px-3 py-3 hover:bg-[var(--co-surface-muted)]"
                  >
                    <div>
                      <p className="text-sm font-medium">{job.scheduledDate}</p>
                      <p className="text-xs text-[var(--co-muted)]">
                        {job.scheduledStartTime?.slice(0, 5) ?? "No time"} · {TYPE_LABELS[job.type] ?? job.type}
                      </p>
                    </div>
                    <span className="rounded-full border border-[var(--co-line)] bg-white px-2.5 py-1 text-xs text-[var(--co-muted)]">{job.status.replaceAll("_", " ")}</span>
                  </Link>
                ))}
              </div>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              <Link href={`/jobs/new?customerId=${customer.id}`} className="co-button-secondary">
                Add another visit
              </Link>
              <Link href="/calendar" className="co-button-secondary">
                Open calendar
              </Link>
            </div>
          </Section>

          <Section eyebrow="Billing" title="Invoice history" description="Quick glance at what’s paid and what still needs collection.">
            {invoices.length === 0 ? (
              <p className="py-4 text-sm text-[var(--co-muted)]">No invoices recorded.</p>
            ) : (
              <div className="space-y-2">
                {invoices.slice(0, 5).map((invoice) => (
                  <Link key={invoice.id} href={`/invoices/${invoice.id}`} className="flex items-center justify-between rounded-2xl border border-[var(--co-line-soft)] px-3 py-3 text-sm hover:bg-[var(--co-surface-muted)]">
                    <div>
                      <p className="font-medium">{new Date(invoice.createdAt).toLocaleDateString()}</p>
                      <p className="text-xs text-[var(--co-muted)]">{invoice.method || "Payment pending"}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold">{money(invoice.totalCents)}</p>
                      <span className={`text-xs ${invoice.status === "paid" ? "text-emerald-700" : "text-amber-700"}`}>{invoice.status}</span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </Section>

          <Section eyebrow="History" title="Recent jobs" description="Useful when someone is taking over the account.">
            {recentJobs.length === 0 ? (
              <p className="py-4 text-sm text-[var(--co-muted)]">No completed jobs yet.</p>
            ) : (
              <div className="space-y-2">
                {recentJobs.slice(0, 4).map((job) => (
                  <Link key={job.id} href={`/jobs/${job.id}`} className="flex items-center justify-between rounded-2xl border border-[var(--co-line-soft)] px-3 py-3 text-sm hover:bg-[var(--co-surface-muted)]">
                    <div>
                      <p className="font-medium">{job.scheduledDate}</p>
                      <p className="text-xs text-[var(--co-muted)]">{TYPE_LABELS[job.type] ?? job.type}</p>
                    </div>
                    <span className="text-sm font-medium text-[var(--co-evergreen)]">Open →</span>
                  </Link>
                ))}
              </div>
            )}
          </Section>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[1fr_0.95fr]">
        <Section eyebrow="House notes" title="Takeover instructions" description="These are the notes that matter when someone new takes over the job.">
          <div className="space-y-3">
            <Field label="Important to the customer" value={customer.importantToCustomer ?? ""} onChange={(value) => updateCustomer("importantToCustomer", value)} textarea />
            <Field label="Do not clean" value={customer.doNotClean ?? ""} onChange={(value) => updateCustomer("doNotClean", value)} textarea />
            <Field label="Pet notes" value={customer.petNotes ?? ""} onChange={(value) => updateCustomer("petNotes", value)} textarea />
            <Field label="Operational notes" value={customer.operationalNotes ?? ""} onChange={(value) => updateCustomer("operationalNotes", value)} textarea />
          </div>
        </Section>

        <Section eyebrow="Home profile" title="Rooms and preferences" description="The fields your team needs when they first walk in.">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Service type" value={customer.serviceType ?? ""} onChange={(value) => updateCustomer("serviceType", value)} />
            <Field label="Payment method" value={customer.paymentMethod ?? ""} onChange={(value) => updateCustomer("paymentMethod", value)} />
            <Field label="Preferred communication" value={customer.preferredCommunication ?? ""} onChange={(value) => updateCustomer("preferredCommunication", value)} />
            <Field label="Preferred day" value={customer.preferredDay ?? ""} onChange={(value) => updateCustomer("preferredDay", value)} />
            <Field label="Preferred time" value={customer.preferredTime ?? ""} onChange={(value) => updateCustomer("preferredTime", value)} />
            <Field label="Dirt level" value={String(home.dirtLevel ?? "")} onChange={(value) => updateHome("dirtLevel", value)} />
            <Field label="Clutter code" value={String(home.clutterCode ?? "")} onChange={(value) => updateHome("clutterCode", value)} />
            <Field label="Pets" value={String(home.dogs ?? "")} onChange={(value) => updateHome("dogs", value)} />
          </div>

          {/* Feeds quote autofill directly (see quotes/new's customer-fetch effect) — every
              room type the company has configured, not just bedrooms/bathrooms, so a repeat
              quote doesn't require re-entering the whole house from scratch. */}
          <div className="mt-5 border-t border-[var(--co-line-soft)] pt-5">
            <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--co-muted)]">Room counts (used to autofill quotes)</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {roomTypes.map((roomType) => (
                <Field
                  key={roomType.id}
                  label={roomType.name}
                  type="number"
                  value={String(roomCounts[roomType.id] ?? "")}
                  onChange={(value) => updateRoomCount(roomType.id, value)}
                />
              ))}
            </div>
          </div>
        </Section>
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
        <Section eyebrow="Photos" title="Before / after" description="Use this section to show proof of quality and set expectations for future handoffs.">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <PhotoTile title="Kitchen" />
            <PhotoTile title="Bathroom" />
            <PhotoTile title="Living room" />
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-[var(--co-muted)]">Photo upload and storage can be connected later. This block is here so the UI already tells the story.</p>
            <button className="co-button-secondary" type="button">
              View all photos
            </button>
          </div>
        </Section>

        <Section eyebrow="Audit trail" title="Recent changes" description="Helpful when you inherit a job and need to see what changed.">
          {auditLogs.length === 0 ? (
            <p className="py-4 text-sm text-[var(--co-muted)]">No audit history recorded yet.</p>
          ) : (
            <div className="space-y-3">
              {auditLogs.slice(0, 5).map((entry) => (
                <div key={entry.id} className="rounded-2xl border border-[var(--co-line-soft)] bg-[var(--co-surface-muted)]/30 p-3 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-[var(--co-ink)]">{entry.action}</p>
                      <p className="mt-1 text-xs text-[var(--co-muted)]">
                        {entry.editorFirstName || "System"} {entry.editorLastName || ""}
                      </p>
                    </div>
                    <span className="text-xs text-[var(--co-muted)]">{new Date(entry.createdAt).toLocaleString()}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Section>
      </section>

      <section id="edit-location" ref={addressSectionRef} className="co-card p-5 scroll-mt-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="eyebrow">Contact, address &amp; access</p>
            <h2 className="mt-1 text-lg font-semibold">{location ? `Editing: ${location.label || "Service address"}` : "Contact details"}</h2>
          </div>
          <span className="text-xs text-[var(--co-muted)]">Sensitive details stay internal</span>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="First name" value={customer.firstName} onChange={(value) => updateCustomer("firstName", value)} />
          <Field label="Last name" value={customer.lastName} onChange={(value) => updateCustomer("lastName", value)} />
          <Field label="Phone" value={customer.phone ?? ""} onChange={(value) => updateCustomer("phone", value)} />
          <Field label="Email" value={customer.email ?? ""} onChange={(value) => updateCustomer("email", value)} type="email" />
          {location ? (
            <>
              <Field label="Address label" value={location.label} onChange={(value) => updateLocation("label", value)} />
              <label className="block text-sm">
                <span className="mb-1 block text-xs font-semibold text-[var(--co-muted)]">Street address</span>
                <AddressAutocomplete value={location.addressLine1} onChange={(value) => updateLocation("addressLine1", value)} onAddressSelected={updateAddress} />
              </label>
              <Field label="City" value={location.city ?? ""} onChange={(value) => updateLocation("city", value)} />
              <Field label="State" value={location.state ?? ""} onChange={(value) => updateLocation("state", value)} />
              <Field label="ZIP" value={location.zip ?? ""} onChange={(value) => updateLocation("zip", value)} />
              <Field label="Gate / key notes" value={location.accessInstructions ?? ""} onChange={(value) => updateLocation("accessInstructions", value)} textarea />
              <Field label="Garage code" value={location.garageCode ?? ""} onChange={(value) => updateLocation("garageCode", value)} />
              <Field label="Gate code" value={location.gateCode ?? ""} onChange={(value) => updateLocation("gateCode", value)} />
            </>
          ) : (
            <p className="text-sm text-[var(--co-muted)] md:col-span-2">No service address yet — click &quot;Add service address&quot; above to add one.</p>
          )}
        </div>
        <button className="co-button-primary mt-5" onClick={save} disabled={saving}>
          {saving ? "Saving..." : "Save all profile changes"}
        </button>
      </section>
    </div>
  );
}
