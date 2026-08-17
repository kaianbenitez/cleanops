"use client";

import { StatusPill } from "@/components/ui/status-pill";
import Link from "next/link";
import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pencil, Plus, Repeat2 } from "lucide-react";
import AddressAutocomplete from "../address-autocomplete";
import { InitialsAvatar } from "@/components/ui/initials-avatar";
import { CustomerViewCards } from "./view-cards";
import { TYPE_LABELS, money, type Customer, type Location, type CustomerJob, type AuditEntry } from "./shared";
import { cleanNoteText } from "@/lib/format";

type EquipmentCustomer = Customer & {
  mopHeadCount?: number | null;
  ragCount?: number | null;
  vacuumCount?: number | null;
};

type EmployeeOption = { id: string; firstName: string; lastName: string };

type RoomType = { id: string; name: string; sortOrder: number };

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

type CustomerQuote = {
  id: string;
  status: string;
  totalCents: number;
  requestedServiceType: string | null;
  acceptedServiceType: string | null;
  createdAt: string;
};

type RecurringSeries = { id: string; frequency: string; isActive: boolean; startDate: string; endDate: string | null };

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

const CLIENT_TYPE_OPTIONS = [
  { value: "residential", label: "Residential" },
  { value: "commercial", label: "Commercial" },
];

const PAYMENT_METHOD_OPTIONS = ["Cash", "Check", "Credit Card"] as const;
const WEEKDAY_OPTIONS = [
  ["monday", "Mon"],
  ["tuesday", "Tue"],
  ["wednesday", "Wed"],
  ["thursday", "Thu"],
  ["friday", "Fri"],
] as const;

const input = "co-input w-full";

function formatCustomerDate(date: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
}

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
        <textarea rows={3} value={value} onChange={(event) => onChange(event.target.value)} className={`${input} min-h-24 resize-y overflow-auto`} />
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
    <div className="rounded-[var(--co-radius-card)] border border-[var(--co-line-soft)] bg-[var(--co-surface-muted)]/40 p-4 shadow-[0_8px_24px_rgba(27,41,37,0.03)]">
      <p className="text-xs font-medium uppercase tracking-[0.12em] text-[var(--co-muted)]">{label}</p>
      <p className="mt-2 text-sm font-semibold">{value}</p>
      {sub ? <p className="mt-1 text-xs text-[var(--co-muted)]">{sub}</p> : null}
    </div>
  );
}

export default function CustomerProfilePage({ params }: { params: Promise<{ customerId: string }> }) {
  const { customerId } = use(params);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [roomTypes, setRoomTypes] = useState<RoomType[]>([]);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [jobs, setJobs] = useState<CustomerJob[]>([]);
  const [quotes, setQuotes] = useState<CustomerQuote[]>([]);
  const [invoices, setInvoices] = useState<CustomerInvoice[]>([]);
  const [recurringSeries, setRecurringSeries] = useState<RecurringSeries[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditEntry[]>([]);
  const [serviceArea, setServiceArea] = useState<ServiceAreaSummary | null>(null);
  const [activeLocationIndex, setActiveLocationIndex] = useState(0);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [lifetimeSpendCents, setLifetimeSpendCents] = useState(0);
  const [archiving, setArchiving] = useState(false);
  const [endingSeries, setEndingSeries] = useState(false);
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);
  const [archiveReasonInput, setArchiveReasonInput] = useState("");

  const load = useCallback(async () => {
    setLoaded(false);
    const response = await fetch(`/api/customers/${customerId}`, { cache: "no-store" });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error ?? `Customer could not be loaded (${response.status}).`);
    const rawCustomer = body.customer as Customer & {
      notes?: string | null;
      operationalNotes?: string | null;
      importantToCustomer?: string | null;
      doNotClean?: string | null;
      petNotes?: string | null;
      preferredDay?: string | null;
      preferredTime?: string | null;
      paymentMethod?: string | null;
    };
    setCustomer({
      ...rawCustomer,
      generalNotes: cleanNoteText(
        rawCustomer.generalNotes ??
          ([rawCustomer.notes, rawCustomer.operationalNotes, rawCustomer.importantToCustomer, rawCustomer.doNotClean, rawCustomer.petNotes]
            .filter((value): value is string => Boolean(value?.trim()))
            .join("\n\n") || null)
      ) || null,
      doNotClean: cleanNoteText(rawCustomer.doNotClean) || null,
      petNotes: cleanNoteText(rawCustomer.petNotes) || null,
      importantToCustomer: cleanNoteText(rawCustomer.importantToCustomer) || null,
      preferredDays: rawCustomer.preferredDays ?? (rawCustomer.preferredDay ? [rawCustomer.preferredDay.toLowerCase()] : []),
      preferredTimeOfDay: rawCustomer.preferredTimeOfDay ?? (rawCustomer.preferredTime === "PM" ? "PM" : rawCustomer.preferredTime ? "AM" : null),
      paymentMethods: rawCustomer.paymentMethods ?? (rawCustomer.paymentMethod ? [rawCustomer.paymentMethod] : []),
    });
    setLocations(body.locations ?? []);
    setJobs(body.jobs ?? []);
    setQuotes(body.quotes ?? []);
    setInvoices(body.invoices ?? []);
    setRecurringSeries(body.recurringSeries ?? []);
    setAuditLogs(body.auditLogs ?? []);
    setServiceArea(body.serviceArea ?? null);
    setLifetimeSpendCents(Number(body.lifetimeSpendCents ?? 0));
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

  useEffect(() => {
    fetch("/api/employees")
      .then((response) => response.json())
      .then((body) => setEmployees(body.employees ?? []))
      .catch(() => {});
  }, []);

  const location = locations[activeLocationIndex] ?? null;
  const equipmentCustomer = customer as EquipmentCustomer | null;
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
  const activeRecurringSeries = recurringSeries.find((series) => series.isActive) ?? null;
  const lastJob = recentJobs[0] ?? null;
  const openBalance = invoices.reduce((sum, invoice) => sum + (invoice.status === "void" ? 0 : Math.max(invoice.totalCents - invoice.amountPaidCents, 0)), 0);

  const updateCustomer = (key: keyof Customer, value: string | string[] | boolean | null) => setCustomer((current) => (current ? { ...current, [key]: value } : current));
  const togglePreferredDay = (day: string) =>
    setCustomer((current) => {
      if (!current) return current;
      const days = current.preferredDays ?? [];
      return { ...current, preferredDays: days.includes(day) ? days.filter((value) => value !== day) : [...days, day] };
    });
  const togglePaymentMethod = (method: string) =>
    setCustomer((current) => {
      if (!current) return current;
      const methods = current.paymentMethods ?? [];
      return { ...current, paymentMethods: methods.includes(method) ? methods.filter((value) => value !== method) : [...methods, method] };
    });
  const updateHome = (key: string, value: string) => setCustomer((current) => (current ? { ...current, homeDetails: { ...(current.homeDetails ?? {}), [key]: value } } : current));
  const updateEquipment = (key: "mopHeadCount" | "ragCount" | "vacuumCount", value: string) =>
    setCustomer((current) => {
      if (!current) return current;
      const parsed = value.trim() === "" ? null : Number(value);
      return { ...current, [key]: parsed !== null && Number.isInteger(parsed) && parsed >= 0 ? parsed : null } as Customer;
    });
  const updatePetCount = (key: "petHairRating" | "dogCount" | "catCount", value: string) =>
    setCustomer((current) => {
      if (!current) return current;
      const parsed = value.trim() === "" ? null : Number(value);
      return { ...current, [key]: parsed !== null && Number.isInteger(parsed) && parsed >= 0 ? parsed : null } as Customer;
    });
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
        clientType: customer.clientType || "residential",
        companyName: customer.companyName || null,
        source: customer.source || null,
        textMessagingAllowed: Boolean(customer.textMessagingAllowed),
        preferredDays: customer.preferredDays ?? [],
        preferredCleanerId: customer.preferredCleanerId || null,
        preferredTimeOfDay: customer.preferredTimeOfDay || null,
        paymentMethods: customer.paymentMethods ?? [],
        generalNotes: customer.generalNotes || null,
        doNotClean: customer.doNotClean || null,
        petNotes: customer.petNotes || null,
        petHairRating: customer.petHairRating ?? null,
        dogCount: customer.dogCount ?? null,
        catCount: customer.catCount ?? null,
        dogNames: customer.dogNames || null,
        catNames: customer.catNames || null,
        importantToCustomer: customer.importantToCustomer || null,
        homeDetails: customer.homeDetails ?? {},
        mopHeadCount: equipmentCustomer?.mopHeadCount ?? null,
        ragCount: equipmentCustomer?.ragCount ?? null,
        vacuumCount: equipmentCustomer?.vacuumCount ?? null,
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
    setMode("view");
    await load();
  }

  function cancelEdit() {
    setError("");
    setMessage("");
    load().catch(() => {});
    setMode("view");
  }

  async function patchArchive(next: boolean) {
    setArchiving(true);
    setError("");
    const response = await fetch(`/api/customers/${customerId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isArchived: next, archivedReason: next ? archiveReasonInput || null : null }),
    });
    setArchiving(false);
    if (!response.ok) {
      setError("Could not update this customer's archive status.");
      return;
    }
    setShowArchiveConfirm(false);
    setArchiveReasonInput("");
    setMessage(next ? "Customer archived." : "Customer restored.");
    await load();
  }

  async function endRecurringService(seriesId: string, action: "suspend" | "cancel") {
    const verb = action === "suspend" ? "suspend" : "cancel";
    if (!window.confirm(`${verb[0].toUpperCase()}${verb.slice(1)} this recurring service? New visits will stop generating, the customer will be archived, and already-created visits will stay on the schedule for review.`)) return;
    setEndingSeries(true);
    setError("");
    const response = await fetch(`/api/recurring-series/${seriesId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
    const body = await response.json().catch(() => ({}));
    setEndingSeries(false);
    if (!response.ok) {
      setError(typeof body.error === "string" ? body.error : "Could not update the recurring service.");
      return;
    }
    setMessage(body.message ?? "Recurring service updated.");
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
        <p className="mt-2 text-sm text-[var(--co-danger)]">{error}</p>
        <button className="co-button-secondary mt-5" onClick={() => load()}>
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-5 border-b border-[var(--co-line-soft)] pb-5">
        <div className="flex min-w-0 items-center gap-4">
          <InitialsAvatar firstName={customer.firstName} lastName={customer.lastName} companyName={customer.companyName} className="h-16 w-16 rounded-2xl text-xl shadow-sm" />
          <div className="min-w-0">
            <Link href="/customers" className="text-sm font-medium text-[var(--co-evergreen)] hover:underline">
              ← Customers
            </Link>
            <div className="mt-1 flex flex-wrap items-center gap-3">
            {customer.isArchived ? null : <StatusPill domain="customer" status={customer.status} />}
            {customer.isArchived ? (
              <span className="co-badge-muted whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium">
                Archived{customer.archivedAt ? ` ${new Date(customer.archivedAt).toLocaleDateString()}` : ""}
              </span>
            ) : null}
          </div>
          <h1 className="page-title mt-1">
            {customer.companyName ? customer.companyName : `${customer.firstName} ${customer.lastName}`}
          </h1>
          {customer.companyName ? (
            <p className="mt-1 text-sm text-[var(--co-muted)]">
              Contact: {customer.firstName} {customer.lastName}
            </p>
          ) : null}
          <p className="mt-1 text-sm text-[var(--co-muted)]">
            {customer.customerNumber ? `Customer ID ${customer.customerNumber}` : "Customer profile"}
            {customer.recurrence && customer.recurrence !== "none" ? ` · ${customer.recurrence.replace("biweekly", "every other week")}` : ""}
          </p>
          <p className="mt-1 text-sm text-[var(--co-muted)]">Customer since {formatCustomerDate(customer.createdAt.slice(0, 10))}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {customer.status === "lead" ? <Link href={`/quotes/new?customerId=${customer.id}`} className="co-button-primary">+ Create quote</Link> : null}
          <Link href={`/jobs/new?customerId=${customer.id}`} className={customer.status === "lead" ? "co-button-secondary" : "co-button-primary"}>
            <Plus className="h-4 w-4" /> New job
          </Link>
          {mode === "view" && !customer.isArchived && !activeRecurringSeries ? (
            <Link href={`/recurring/new?customerId=${customer.id}`} className="co-button-secondary">
              <Repeat2 className="h-4 w-4" /> Set up recurring service
            </Link>
          ) : null}
          {mode === "view" && activeRecurringSeries ? (
            <>
              <button className="co-button-secondary" onClick={() => endRecurringService(activeRecurringSeries.id, "suspend")} disabled={endingSeries}>
                {endingSeries ? "Updating..." : "Suspend recurring service"}
              </button>
              <button className="co-button-secondary !border-[var(--co-danger)]/30 !text-[var(--co-danger)] hover:!bg-[var(--co-danger)]/10" onClick={() => endRecurringService(activeRecurringSeries.id, "cancel")} disabled={endingSeries}>
                Cancel recurring service
              </button>
            </>
          ) : null}
          {mode === "view" ? (
            <>
              {customer.isArchived ? (
                <button className="co-button-secondary" onClick={() => patchArchive(false)} disabled={archiving}>
                  {archiving ? "Restoring..." : "Restore customer"}
                </button>
              ) : (
                <button className="co-button-secondary" onClick={() => setShowArchiveConfirm(true)}>
                  Archive customer
                </button>
              )}
              <button className="co-button-secondary" onClick={() => setMode("edit")}>
                <Pencil className="h-4 w-4" /> Edit profile
              </button>
            </>
          ) : (
            <>
              <button className="co-button-secondary" onClick={cancelEdit} disabled={saving}>
                Cancel
              </button>
              <button className="co-button-primary" onClick={save} disabled={saving}>
                {saving ? "Saving..." : "Save profile"}
              </button>
            </>
          )}
        </div>
      </header>

      {showArchiveConfirm ? (
        <div className="co-card co-badge-warning space-y-3 p-4">
          <p className="text-sm font-medium">
            Archive {customer.companyName || `${customer.firstName} ${customer.lastName}`}? They&apos;ll drop out of the
            default customers list — history is kept and this can be undone from here.
          </p>
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-semibold">Reason (optional)</span>
            <input
              value={archiveReasonInput}
              onChange={(event) => setArchiveReasonInput(event.target.value)}
              placeholder="e.g. one-time service, didn't sign up for recurring"
              className="co-input w-full"
            />
          </label>
          <div className="flex gap-2">
            <button className="co-button-secondary" onClick={() => setShowArchiveConfirm(false)} disabled={archiving}>
              Cancel
            </button>
            <button className="co-button-primary" onClick={() => patchArchive(true)} disabled={archiving}>
              {archiving ? "Archiving..." : "Archive customer"}
            </button>
          </div>
        </div>
      ) : null}

      {message ? (
        <div role="status" className="co-badge-success rounded-xl px-4 py-3 text-sm">
          {message}
        </div>
      ) : null}
      {error ? (
        <div role="alert" className="co-badge-danger rounded-xl px-4 py-3 text-sm">
          {error}
        </div>
      ) : null}

      {mode === "edit" && (
      <>
      <section id="edit-location" ref={addressSectionRef} className="co-card p-5 scroll-mt-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="eyebrow">Contact, address &amp; access</p>
            <h2 className="mt-1 text-lg font-semibold">{location ? `Editing: ${location.label || "Service address"}` : "Contact details"}</h2>
          </div>
          <span className="text-xs text-[var(--co-muted)]">Sensitive details stay internal</span>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Company name (commercial clients)" value={customer.companyName ?? ""} onChange={(value) => updateCustomer("companyName", value)} />
          <div />
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
              <Field label="Entrance notes" value={location.accessInstructions ?? ""} onChange={(value) => updateLocation("accessInstructions", value)} textarea />
              <Field label="Entry code" value={location.entryCode ?? ""} onChange={(value) => updateLocation("entryCode", value)} type="password" />
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

      <section className="grid gap-5 xl:grid-cols-[1.1fr_1.15fr_0.85fr]">
        <div className="co-card p-5">
          <div className="flex items-start gap-4">
            <InitialsAvatar firstName={customer.firstName} lastName={customer.lastName} companyName={customer.companyName} className="h-20 w-20 rounded-3xl text-2xl" />
            <div className="min-w-0">
              <h2 className="text-lg font-semibold">
                {customer.companyName ? customer.companyName : `${customer.firstName} ${customer.lastName}`}
              </h2>
              {customer.companyName ? (
                <p className="text-sm text-[var(--co-muted)]">
                  Contact: {customer.firstName} {customer.lastName}
                </p>
              ) : null}
              <p className="mt-1 text-sm text-[var(--co-muted)]">{customer.email || "No email"}</p>
              <p className="text-sm text-[var(--co-muted)]">{customer.phone || "No phone"}</p>
              <p className="mt-3 text-xs text-[var(--co-muted)]">Lead source: {customer.source || "Not recorded"}</p>
              <p className="mt-1 text-xs text-[var(--co-muted)]">Plan: {customer.recurrence && customer.recurrence !== "none" ? customer.recurrence : "One-time"}</p>
            </div>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <InfoCard label="Visits" value={`${upcomingJobs.length}`} sub="Upcoming jobs" />
            <InfoCard label="Invoices" value={`${invoices.length}`} sub="Recorded invoices" />
            <InfoCard label="Open balance" value={money(openBalance)} sub={openBalance ? "Needs collection" : "Paid through"} />
            <InfoCard
              label="Service area"
              value={serviceArea?.label ?? "Checking..."}
              sub={serviceArea?.detail ?? "Matched against configured zones"}
            />
          </div>
          <div className="mt-5 grid gap-3 rounded-[var(--co-radius-card)] border border-[var(--co-line-soft)] bg-[var(--co-surface-muted)] p-4 sm:grid-cols-2">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.12em] text-[var(--co-muted)]">Next visit</p>
              {nextJob ? (
                <Link href={`/jobs/${nextJob.id}`} className="mt-2 block text-sm font-semibold text-[var(--co-evergreen)] hover:underline">
                  {formatCustomerDate(nextJob.scheduledDate)}
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
                  {formatCustomerDate(lastJob.scheduledDate)}
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
            <div className="grid gap-3 sm:grid-cols-2">
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
              <label className="block text-xs font-semibold text-[var(--co-muted)]">
                Client type
                <select className="co-input mt-1 w-full" value={customer.clientType ?? "residential"} onChange={(event) => updateCustomer("clientType", event.target.value)}>
                  {CLIENT_TYPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-xs font-semibold text-[var(--co-muted)] sm:col-span-2">
                Plan / recurrence
                <select className="co-input mt-1 w-full" value={customer.recurrence ?? "none"} onChange={(event) => updateCustomer("recurrence", event.target.value)}>
                  <option value="none">One-time / no recurring plan</option>
                  <option value="weekly">Weekly</option>
                  <option value="biweekly">Every other week</option>
                  <option value="every4weeks">Every 4 weeks</option>
                  <option value="monthly">Monthly</option>
                </select>
              </label>
            </div>
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
                    index === activeLocationIndex ? "border-[var(--co-evergreen)] bg-[var(--co-evergreen)] text-white" : "border-[var(--co-line)] bg-[var(--co-surface)] text-[var(--co-muted)]"
                  }`}
                >
                  {item.label}
                </button>
              ))}
              <button className="rounded-full border border-dashed border-[var(--co-line)] px-3 py-1.5 text-xs text-[var(--co-muted)]" onClick={addLocation}>
                + Address
              </button>
              <button onClick={jumpToAddressFields} className="ml-auto text-xs font-medium text-[var(--co-evergreen)] hover:underline">
                Edit address details ↑
              </button>
            </div>
          ) : (
            <button className="co-button-secondary mt-4" onClick={addLocation}>
              Add service address
            </button>
          )}

          <div className="mt-4 rounded-2xl border border-[var(--co-line-soft)] bg-[var(--co-surface-muted)] p-4">
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
              <InfoCard label="Entrance notes" value={cleanNoteText(location?.accessInstructions) || "No instructions"} sub="Visible to internal team" />
              <InfoCard label="Subdivision" value={location?.subdivision || "Not recorded"} sub="Useful for route recall" />
            </div>
          </div>

          {location ? (
            <div className="mt-4 rounded-2xl border border-[var(--co-line-soft)] bg-[var(--co-surface-muted)]/50 p-4 text-sm">
              <p className="font-medium">Entry instructions</p>
              <p className="mt-1 whitespace-pre-line text-[var(--co-muted)]">{cleanNoteText(location.accessInstructions) || "No entry instructions recorded."}</p>
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
                      <p className="text-sm font-medium">{formatCustomerDate(job.scheduledDate)}</p>
                      <p className="text-xs text-[var(--co-muted)]">
                        {job.scheduledStartTime?.slice(0, 5) ?? "No time"} · {TYPE_LABELS[job.type] ?? job.type}
                      </p>
                    </div>
                    <span className="rounded-full border border-[var(--co-line)] bg-[var(--co-surface)] px-2.5 py-1 text-xs text-[var(--co-muted)]">{job.status.replaceAll("_", " ")}</span>
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
                      <p className="font-medium">{formatCustomerDate(invoice.createdAt.slice(0, 10))}</p>
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

          <Section eyebrow="Sales" title="Quote history" description="Every proposal created for this customer, newest first.">
            {quotes.length === 0 ? (
              <p className="py-4 text-sm text-[var(--co-muted)]">No quotes created yet.</p>
            ) : (
              <div className="space-y-2">
                {quotes.slice(0, 5).map((quote) => (
                  <Link key={quote.id} href={`/quotes/${quote.id}`} className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--co-line-soft)] px-3 py-3 text-sm hover:bg-[var(--co-surface-muted)]">
                    <div>
                      <p className="font-medium">Q-{quote.id.slice(0, 6).toUpperCase()} · {formatCustomerDate(quote.createdAt.slice(0, 10))}</p>
                      <p className="text-xs text-[var(--co-muted)]">{(quote.acceptedServiceType ?? quote.requestedServiceType)?.replaceAll("_", " ") ?? "Service not selected"}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <p className="font-semibold">{quote.acceptedServiceType || quote.requestedServiceType ? money(quote.totalCents) : "—"}</p>
                      <StatusPill domain="quote" status={quote.status} />
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
                      <p className="font-medium">{formatCustomerDate(job.scheduledDate)}</p>
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

      <section className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <Section eyebrow="Notes" title="General notes" description="One place for the context the team should remember about this customer.">
          <div className="space-y-4">
            <Field label="General notes" value={customer.generalNotes ?? ""} onChange={(value) => updateCustomer("generalNotes", value)} textarea />
            <Field label="Do not clean" value={customer.doNotClean ?? ""} onChange={(value) => updateCustomer("doNotClean", value || null)} textarea />
            <div>
              <span className="mb-1.5 block text-xs font-semibold text-[var(--co-muted)]">Pets</span>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm">
                  <span className="mb-1 block text-xs text-[var(--co-muted)]">Pet hair rating (1–5)</span>
                  <select className={input} value={customer.petHairRating ?? ""} onChange={(event) => updatePetCount("petHairRating", event.target.value)}>
                    <option value="">None</option>
                    {[1, 2, 3, 4, 5].map((score) => <option key={score} value={score}>Level {score}</option>)}
                  </select>
                </label>
                <div />
                <Field label="Dogs" type="number" value={customer.dogCount != null ? String(customer.dogCount) : ""} onChange={(value) => updatePetCount("dogCount", value)} />
                <Field label="Cats" type="number" value={customer.catCount != null ? String(customer.catCount) : ""} onChange={(value) => updatePetCount("catCount", value)} />
                <Field label="Dog names" value={customer.dogNames ?? ""} onChange={(value) => updateCustomer("dogNames", value || null)} />
                <Field label="Cat names" value={customer.catNames ?? ""} onChange={(value) => updateCustomer("catNames", value || null)} />
              </div>
              <div className="mt-3">
                <Field label="Other pet notes" value={customer.petNotes ?? ""} onChange={(value) => updateCustomer("petNotes", value || null)} textarea />
              </div>
            </div>
            <Field label="Important to customer" value={customer.importantToCustomer ?? ""} onChange={(value) => updateCustomer("importantToCustomer", value || null)} textarea />
          </div>
        </Section>

        <Section eyebrow="Preferences" title="Scheduling and payment" description="Keep repeat-visit preferences compact and easy to scan.">
          <div className="space-y-5">
            <div>
              <p className="mb-2 text-xs font-semibold text-[var(--co-muted)]">Preferred day</p>
              <div className="flex flex-wrap gap-2">
                {WEEKDAY_OPTIONS.map(([value, label]) => {
                  const selected = customer.preferredDays?.includes(value) ?? false;
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => togglePreferredDay(value)}
                      className={`rounded-lg border px-3 py-2 text-xs font-semibold ${selected ? "border-[var(--co-evergreen)] bg-[var(--co-evergreen)] text-white" : "border-[var(--co-line-soft)] bg-[var(--co-surface-muted)] text-[var(--co-muted)] hover:border-[var(--co-evergreen)]"}`}
                      aria-pressed={selected}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-semibold text-[var(--co-muted)]">Preferred cleaner</span>
              <select className={input} value={customer.preferredCleanerId ?? ""} onChange={(event) => updateCustomer("preferredCleanerId", event.target.value || null)}>
                <option value="">Any available cleaner</option>
                {employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.firstName} {employee.lastName}</option>)}
              </select>
            </label>
            <div>
              <p className="mb-2 text-xs font-semibold text-[var(--co-muted)]">Preferred time of day</p>
              <div className="grid grid-cols-2 gap-2">
                {["AM", "PM"].map((period) => {
                  const selected = customer.preferredTimeOfDay === period;
                  return <button key={period} type="button" onClick={() => updateCustomer("preferredTimeOfDay", selected ? null : period)} className={`rounded-lg border px-3 py-2 text-sm font-semibold ${selected ? "border-[var(--co-evergreen)] bg-[var(--co-evergreen)] text-white" : "border-[var(--co-line-soft)] bg-[var(--co-surface-muted)] text-[var(--co-muted)] hover:border-[var(--co-evergreen)]"}`} aria-pressed={selected}>{period}</button>;
                })}
              </div>
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold text-[var(--co-muted)]">Accepted payment methods</p>
              <div className="flex flex-wrap gap-2">
                {PAYMENT_METHOD_OPTIONS.map((method) => {
                  const selected = customer.paymentMethods?.includes(method) ?? false;
                  return <button key={method} type="button" onClick={() => togglePaymentMethod(method)} className={`rounded-lg px-3 py-2 text-xs font-semibold ${selected ? "co-badge-info" : "border border-[var(--co-line-soft)] bg-[var(--co-surface)] text-[var(--co-muted)] hover:border-[var(--co-evergreen)]"}`} aria-pressed={selected}>{method}</button>;
                })}
              </div>
            </div>
          </div>
        </Section>
      </section>

      <section>
        <Section eyebrow="Equipment" title="Cleaning equipment" description="Set the real counts a cleaner should bring. Leave a field blank when it is not set.">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Mop heads" type="number" value={String(equipmentCustomer?.mopHeadCount ?? "")} onChange={(value) => updateEquipment("mopHeadCount", value)} />
            <Field label="Rags" type="number" value={String(equipmentCustomer?.ragCount ?? "")} onChange={(value) => updateEquipment("ragCount", value)} />
            <Field label="Vacuum" type="number" value={String(equipmentCustomer?.vacuumCount ?? "")} onChange={(value) => updateEquipment("vacuumCount", value)} />
          </div>
        </Section>
      </section>

      <section>
        <Section eyebrow="Home profile" title="Rooms and preferences" description="The fields your team needs when they first walk in.">
          <div className="grid gap-3 sm:grid-cols-2">
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

      <section>
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

      </>
      )}

      {mode === "view" && (
        <CustomerViewCards
          customer={customer as EquipmentCustomer}
          location={location}
          roomTypes={roomTypes}
          locations={locations}
          primaryAddress={primaryAddress}
          upcomingJobs={upcomingJobs}
          recentJobs={recentJobs}
          nextJob={nextJob}
          lastJob={lastJob}
          openBalance={openBalance}
          lifetimeSpendCents={lifetimeSpendCents}
          quotes={quotes}
          auditLogs={auditLogs}
          onEditFocus={() => setMode("edit")}
        />
      )}
    </div>
  );
}
