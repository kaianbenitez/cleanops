"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Search,
  MapPin,
  Bed,
  Bath,
  Droplet,
  Sofa,
  UtensilsCrossed,
  ChefHat,
  Briefcase,
  Car,
  Shirt,
  Building2,
  DoorOpen,
  Minus,
  Plus,
  Percent,
  Route,
  MessageSquareText,
  Sparkles,
  Check,
  type LucideIcon,
} from "lucide-react";
import { ADD_ONS, detectRequestedAddOns, type AddOnKey } from "@/lib/pricing/add-ons";

type Customer = {
  id: string;
  firstName: string;
  lastName: string;
  status: string;
  city?: string | null;
  zip?: string | null;
};
type CustomerAddress = { id: string; label: string; addressLine1: string; city?: string | null; state?: string | null; zip?: string | null; subdivision?: string | null };

type RoomType = { id: string; name: string; sortOrder: number };
type TravelZone = { id: string; name: string; feeCents: number };
type ServiceLocation = {
  id: string;
  name: string;
  hourlyRateCents: number;
  minimums: Record<string, number>;
  dirtyCodeTiers: Array<{ level: number; discountPercent: number }>;
  travelZones: TravelZone[];
};

type ServiceType = "supreme_deep" | "deep" | "first_time" | "weekly" | "biweekly" | "four_weeks" | "move_in_out";
type Breakdown = {
  roomLines: Array<{ roomTypeId: string; count: number; weightHours: number; subtotalCents: number }>;
  roomSubtotalCents: number;
  travelFeeCents: number;
  rawTotalCents: number;
  discountPercent: number;
  discountedCents: number;
  minimumCents: number;
  finalCents: number;
  minimumApplied: boolean;
};

const SERVICE_TYPES: Array<{ value: ServiceType; label: string; description: string }> = [
  { value: "supreme_deep", label: "Supreme Deep", description: "Hand wipe + steam mop + fridge + oven." },
  { value: "deep", label: "Deep Clean", description: "Hand wipe only." },
  { value: "first_time", label: "First Time", description: "Dusting only." },
  { value: "weekly", label: "Weekly", description: "Maintenance clean." },
  { value: "biweekly", label: "Bi-Weekly", description: "Every 2 weeks." },
  { value: "four_weeks", label: "Every 4 Weeks", description: "Every 4 weeks." },
  { value: "move_in_out", label: "Move In / Out", description: "Move-in / move-out." },
];

// serviceType here only picks which tier's room-line breakdown the calculate
// endpoint echoes back — it's never surfaced as a "selected" tier and never sent
// to the create endpoint. Every tier is priced (allTiers) and every tier is sent.
const BREAKDOWN_PREVIEW_TYPE: ServiceType = "first_time";

function roomTypeIcon(name: string): LucideIcon {
  const n = name.toLowerCase();
  if (n.includes("half bath")) return Droplet;
  if (n.includes("bath")) return Bath;
  if (n.includes("bed")) return Bed;
  if (n.includes("living")) return Sofa;
  if (n.includes("dining")) return UtensilsCrossed;
  if (n.includes("kitchen")) return ChefHat;
  if (n.includes("office")) return Briefcase;
  if (n.includes("garage")) return Car;
  if (n.includes("laundry")) return Shirt;
  if (n.includes("stor") || n.includes("floor")) return Building2;
  return DoorOpen;
}

function dollars(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function normalizeAddressToken(value: string | null | undefined) {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function matchingPricingArea(address: CustomerAddress, locations: ServiceLocation[]) {
  const tokens = new Set([address.city, address.zip, address.zip?.replace(/\D/g, "").slice(0, 5), address.subdivision].map(normalizeAddressToken).filter(Boolean));
  for (const location of locations) {
    const zone = location.travelZones.find((candidate) => candidate.name.split(/[,&/|;]+/g).flatMap((part) => part.split(/\s+-\s+/g)).map(normalizeAddressToken).some((token) => tokens.has(token)));
    if (zone) return { serviceLocationId: location.id, travelZoneId: zone.id };
  }
  const city = normalizeAddressToken(address.city);
  const namedLocation = locations.find((location) => city && normalizeAddressToken(location.name) === city);
  return namedLocation ? { serviceLocationId: namedLocation.id, travelZoneId: "" } : null;
}

// Quotes are valid for 6 months by default — company policy.
function defaultValidUntil() {
  const date = new Date();
  date.setMonth(date.getMonth() + 6);
  return date.toISOString().slice(0, 10);
}

export default function NewQuotePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [roomTypes, setRoomTypes] = useState<RoomType[]>([]);
  const [locations, setLocations] = useState<ServiceLocation[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerAddresses, setCustomerAddresses] = useState<CustomerAddress[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState("");
  const [serviceLocationId, setServiceLocationId] = useState("");
  const [travelZoneId, setTravelZoneId] = useState("");
  const [dirtyCodeLevel, setDirtyCodeLevel] = useState<number | "">("");
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [allTiers, setAllTiers] = useState<Record<string, Breakdown> | null>(null);
  const [calculating, setCalculating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [notes, setNotes] = useState("");
  const [validUntil, setValidUntil] = useState(defaultValidUntil);
  const [customerNotes, setCustomerNotes] = useState("");
  const [detectedAddOns, setDetectedAddOns] = useState<AddOnKey[]>([]);
  const [selectedAddOns, setSelectedAddOns] = useState<AddOnKey[]>([]);
  const [addOnsAddedToNotes, setAddOnsAddedToNotes] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/customers").then((response) => response.json()),
      fetch("/api/room-types").then((response) => response.json()),
      fetch("/api/service-locations").then((response) => response.json()),
    ])
      .then(([customerBody, roomBody, locationBody]) => {
        const loadedCustomers = customerBody.customers ?? [];
        setCustomers(loadedCustomers);
        const requestedCustomerId = searchParams.get("customerId");
        const requestedCustomer = loadedCustomers.find((customer: Customer) => customer.id === requestedCustomerId);
        if (requestedCustomer) {
          setCustomerId(requestedCustomer.id);
          setCustomerSearch(`${requestedCustomer.firstName} ${requestedCustomer.lastName}`);
        }
        setRoomTypes(roomBody.roomTypes ?? []);
        setLocations(locationBody.locations ?? []);
        if (locationBody.locations?.[0]) setServiceLocationId(locationBody.locations[0].id);
      })
      .catch(() => setError("Quote setup could not be loaded."));
  }, [searchParams]);

  const selectedLocation = useMemo(
    () => locations.find((location) => location.id === serviceLocationId) ?? null,
    [locations, serviceLocationId]
  );
  const matchingCustomers = useMemo(() => {
    const query = customerSearch.trim().toLowerCase();
    if (!query) return [];
    return customers.filter((customer) => `${customer.firstName} ${customer.lastName} ${customer.city ?? ""} ${customer.zip ?? ""}`.toLowerCase().includes(query)).slice(0, 8);
  }, [customerSearch, customers]);

  function selectCustomer(customer: Customer) {
    setCustomerId(customer.id);
    setCustomerSearch(`${customer.firstName} ${customer.lastName}`);
    setCustomerAddresses([]);
    setSelectedAddressId("");
  }

  const [autofilledFor, setAutofilledFor] = useState("");

  useEffect(() => {
    if (customerId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCustomerNotes("");
    setDetectedAddOns([]);
    setSelectedAddOns([]);
    setAddOnsAddedToNotes(false);
  }, [customerId]);

  // Prefill every room count from the customer's stored home profile (keyed by
  // roomTypeId, so it covers whatever room types the company has configured —
  // not just bedrooms/bathrooms), and flag any add-ons they mentioned in their
  // notes (e.g. a GHL intake form submission) — still fully editable afterward
  // (e.g. skip a room they don't want cleaned this visit, or un-flag an add-on
  // that isn't actually wanted).
  useEffect(() => {
    if (!customerId || roomTypes.length === 0 || customerId === autofilledFor) return;
    fetch(`/api/customers/${customerId}`)
      .then((response) => response.json())
      .then((body) => {
        const addresses = (body.locations ?? []) as CustomerAddress[];
        setCustomerAddresses(addresses);
        setSelectedAddressId(addresses.length === 1 ? addresses[0].id : "");
        const home = (body.customer?.homeDetails ?? {}) as { roomCounts?: Record<string, number> };
        const storedRoomCounts = home.roomCounts ?? {};
        setCounts((current) => {
          const next = { ...current };
          for (const roomType of roomTypes) {
            if (storedRoomCounts[roomType.id] != null) next[roomType.id] = Number(storedRoomCounts[roomType.id]) || 0;
          }
          return next;
        });

        const noteText = [body.customer?.notes, body.customer?.operationalNotes, body.customer?.importantToCustomer]
          .filter((value): value is string => Boolean(value))
          .join(" · ");
        setCustomerNotes(noteText);
        const detected = detectRequestedAddOns(noteText);
        setDetectedAddOns(detected);
        setSelectedAddOns(detected);
        setAddOnsAddedToNotes(false);

        setAutofilledFor(customerId);
      })
      .catch(() => {});
  }, [customerId, roomTypes, autofilledFor]);

  useEffect(() => {
    const address = customerAddresses.find((entry) => entry.id === selectedAddressId);
    if (!address || locations.length === 0) return;
    const match = matchingPricingArea(address, locations);
    if (!match) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- synchronize pricing inputs with the explicitly selected service address.
    setServiceLocationId(match.serviceLocationId);
    setTravelZoneId(match.travelZoneId);
  }, [customerAddresses, locations, selectedAddressId]);

  const roomCounts = useMemo(
    () =>
      roomTypes
        .map((room) => ({ roomTypeId: room.id, count: counts[room.id] ?? 0 }))
        .filter((room) => room.count > 0),
    [counts, roomTypes]
  );
  const totalRoomCount = roomCounts.reduce((sum, room) => sum + room.count, 0);

  const calculate = useCallback(async () => {
    if (!serviceLocationId || roomCounts.length === 0) {
      setAllTiers(null);
      return;
    }

    setCalculating(true);
    const response = await fetch("/api/quotes/calculate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        serviceLocationId,
        serviceType: BREAKDOWN_PREVIEW_TYPE,
        roomCounts,
        travelZoneId: travelZoneId || null,
        dirtyCodeLevel: dirtyCodeLevel === "" ? null : dirtyCodeLevel,
      }),
    });

    const body = await response.json().catch(() => ({}));
    if (response.ok) {
      setAllTiers(body.allTiers);
      setError("");
    } else if (body.error) {
      setError(typeof body.error === "string" ? body.error : "Quote calculation failed.");
      setAllTiers(null);
    }
    setCalculating(false);
  }, [dirtyCodeLevel, roomCounts, serviceLocationId, travelZoneId]);

  useEffect(() => {
    // Recalculate after the form inputs change; this is the quote preview's source of truth.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    calculate();
  }, [calculate]);

  function setCount(id: string, count: number) {
    setCounts((current) => ({ ...current, [id]: Math.max(0, count) }));
  }

  function toggleAddOn(key: AddOnKey) {
    setSelectedAddOns((current) => (current.includes(key) ? current.filter((item) => item !== key) : [...current, key]));
    setAddOnsAddedToNotes(false);
  }

  function addSelectedAddOnsToNotes() {
    if (selectedAddOns.length === 0) return;
    const labels = ADD_ONS.filter((addOn) => selectedAddOns.includes(addOn.key)).map((addOn) => addOn.label);
    const line = `Requested add-ons: ${labels.join(", ")}.`;
    setNotes((current) => (current ? `${current}\n${line}` : line));
    setAddOnsAddedToNotes(true);
  }

  async function saveQuote() {
    setError("");
    if (!customerId || !serviceLocationId || !roomCounts.length || !allTiers) {
      setError("Customer, location, and at least one room are required.");
      return;
    }
    if (customerAddresses.length > 1 && !selectedAddressId) {
      setError("Choose the service address for this quote.");
      return;
    }

    setSubmitting(true);
    const response = await fetch("/api/quotes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customerId,
        serviceAddressLocationId: selectedAddressId || undefined,
        serviceLocationId,
        roomCounts,
        travelZoneId: travelZoneId || null,
        dirtyCodeLevel: dirtyCodeLevel === "" ? null : dirtyCodeLevel,
        notesToCustomer: notes || undefined,
        validUntil: validUntil || undefined,
      }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(typeof body.error === "string" ? body.error : body.error ? JSON.stringify(body.error) : "Quote could not be created.");
      setSubmitting(false);
      return;
    }

    router.push(`/quotes/${body.quote.id}`);
  }

  const selectedCustomer = customers.find((customer) => customer.id === customerId) ?? null;

  return (
    <div className="space-y-6">
      <header>
        <p className="eyebrow">Sales / New proposal</p>
        <h1 className="page-title mt-2">Build thoughtful proposal</h1>
        <p className="page-subtitle">Define customer details and property characteristics to generate an accurate estimate.</p>
      </header>

      <div className="grid gap-5 xl:grid-cols-[0.82fr_1.18fr]">
        <div className="space-y-5">
          <section className="co-card p-5">
            <p className="eyebrow">Customer and location</p>
            <h2 className="mt-1 text-lg font-semibold">Who is this for?</h2>
            <div className="mt-4 space-y-3">
              <label className="block text-sm">
                <span className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-[var(--co-muted)]">
                  <Search className="h-3.5 w-3.5" aria-hidden />
                  Customer
                </span>
                <div className="relative">
                  <input
                    className="co-input w-full"
                    value={customerSearch}
                    onChange={(event) => {
                      setCustomerSearch(event.target.value);
                      setCustomerId("");
                    }}
                    placeholder="Search name, city, or ZIP"
                    aria-label="Search customers"
                  />
                  {matchingCustomers.length && (!selectedCustomer || customerSearch !== `${selectedCustomer.firstName} ${selectedCustomer.lastName}`) ? (
                    <div className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-[var(--co-line)] bg-white p-1 shadow-lg">
                      {matchingCustomers.map((customer) => (
                        <button key={customer.id} type="button" onClick={() => selectCustomer(customer)} className="w-full rounded-lg px-3 py-2.5 text-left text-sm hover:bg-[var(--co-surface-muted)]">
                          <span className="block font-semibold text-[var(--co-ink)]">{customer.firstName} {customer.lastName}</span>
                          <span className="block text-xs text-[var(--co-muted)]">{[customer.city, customer.zip].filter(Boolean).join(" · ") || customer.status}</span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              </label>

              {customerAddresses.length > 1 ? (
                <label className="block text-sm">
                  <span className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-[var(--co-muted)]"><MapPin className="h-3.5 w-3.5" aria-hidden />Service address</span>
                  <select className="co-input w-full" value={selectedAddressId} onChange={(event) => setSelectedAddressId(event.target.value)}>
                    <option value="">Choose which address to quote</option>
                    {customerAddresses.map((address) => <option key={address.id} value={address.id}>{address.label} · {[address.addressLine1, address.city, address.zip].filter(Boolean).join(", ")}</option>)}
                  </select>
                  <p className="mt-1 text-xs text-[var(--co-muted)]">Pricing area and travel fee update from the selected address.</p>
                </label>
              ) : customerAddresses.length === 1 ? (
                <p className="rounded-xl bg-[var(--co-surface-muted)]/45 px-3 py-2 text-xs text-[var(--co-muted)]">Service address: <span className="font-semibold text-[var(--co-ink)]">{customerAddresses[0].label} · {[customerAddresses[0].addressLine1, customerAddresses[0].city, customerAddresses[0].zip].filter(Boolean).join(", ")}</span></p>
              ) : null}

              <label className="block text-sm">
                <span className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-[var(--co-muted)]">
                  <MapPin className="h-3.5 w-3.5" aria-hidden />
                  Pricing zone
                </span>
                {locations.length === 0 ? (
                  <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    No pricing zones configured yet. Add one in{" "}
                    <a href="/settings/pricing" className="font-semibold underline">
                      Settings → Pricing
                    </a>{" "}
                    before you can build a quote.
                  </p>
                ) : (
                  <>
                    <select
                      className="co-input w-full"
                      value={serviceLocationId}
                      onChange={(event) => {
                        setServiceLocationId(event.target.value);
                        setTravelZoneId("");
                      }}
                    >
                      <option value="">Select a pricing zone</option>
                      {locations.map((location) => (
                        <option key={location.id} value={location.id}>
                          {location.name} · {dollars(location.hourlyRateCents)}/hr
                        </option>
                      ))}
                    </select>
                    <p className="mt-1 text-xs text-[var(--co-muted)]">This sets the hourly rate and travel fees — it&apos;s the branch/area rate, not the customer&apos;s address.</p>
                  </>
                )}
              </label>
            </div>

            {selectedCustomer ? (
              <div className="mt-4 rounded-2xl border border-[var(--co-line-soft)] bg-[var(--co-surface-muted)]/35 p-4 text-sm text-[var(--co-muted)]">
                <span className="block text-xs font-semibold uppercase tracking-[0.1em]">Selected customer</span>
                <span className="mt-1 block font-medium text-[var(--co-ink)]">
                  {selectedCustomer.firstName} {selectedCustomer.lastName}
                </span>
                <span className="block">
                  {selectedCustomer.city || selectedCustomer.zip ? [selectedCustomer.city, selectedCustomer.zip].filter(Boolean).join(" · ") : "Address not yet shown here"}
                </span>
              </div>
            ) : null}
          </section>

          <section className="co-card p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="eyebrow">Home profile</p>
                <h2 className="mt-1 text-lg font-semibold">Rooms and conditions</h2>
              </div>
              <span className="text-xs text-[var(--co-muted)]">{totalRoomCount} rooms</span>
            </div>
            {customerId && (
              <p className="mt-2 text-xs text-[var(--co-muted)]">
                Bedroom and full bathroom counts auto-populate from this customer&apos;s saved home profile — adjust any count if this visit skips a room.
              </p>
            )}
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {roomTypes.map((room) => {
                const Icon = roomTypeIcon(room.name);
                const count = counts[room.id] ?? 0;
                return (
                  <div
                    key={room.id}
                    className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--co-line-soft)] bg-[var(--co-surface-muted)]/35 px-3 py-2.5"
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <Icon className="h-4 w-4 shrink-0 text-[var(--co-evergreen)]" aria-hidden />
                      <span className="truncate text-sm font-medium text-[var(--co-ink)]">{room.name}</span>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setCount(room.id, count - 1)}
                        aria-label={`Decrease ${room.name}`}
                        className="flex h-7 w-7 items-center justify-center rounded-full border border-[var(--co-line)] text-[var(--co-muted)] hover:bg-white"
                      >
                        <Minus className="h-3.5 w-3.5" aria-hidden />
                      </button>
                      <span className="w-4 text-center text-sm font-semibold tabular-nums text-[var(--co-ink)]">{count}</span>
                      <button
                        type="button"
                        onClick={() => setCount(room.id, count + 1)}
                        aria-label={`Increase ${room.name}`}
                        className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--co-evergreen)] text-white hover:bg-[var(--co-evergreen-soft)]"
                      >
                        <Plus className="h-3.5 w-3.5" aria-hidden />
                      </button>
                    </div>
                  </div>
                );
              })}
              {roomTypes.length === 0 ? <p className="text-sm text-[var(--co-muted)]">No room types configured yet.</p> : null}
            </div>
          </section>

          {customerId ? (
            <section className="co-card p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="eyebrow">Add-on requests</p>
                  <h2 className="mt-1 text-lg font-semibold">Anything requested via their form?</h2>
                </div>
                {detectedAddOns.length > 0 ? (
                  <span className="flex items-center gap-1 rounded-full bg-[var(--co-accent-tint)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--co-evergreen)]">
                    <Sparkles className="h-3 w-3" aria-hidden />
                    {detectedAddOns.length} flagged
                  </span>
                ) : null}
              </div>

              {customerNotes ? (
                <div className="mt-3 flex items-start gap-2 rounded-2xl border border-[var(--co-line-soft)] bg-[var(--co-surface-muted)]/35 p-3 text-sm text-[var(--co-muted)]">
                  <MessageSquareText className="mt-0.5 h-4 w-4 shrink-0 text-[var(--co-evergreen)]" aria-hidden />
                  <p className="italic">&ldquo;{customerNotes}&rdquo;</p>
                </div>
              ) : (
                <p className="mt-3 text-xs text-[var(--co-muted)]">No notes on file for this customer — nothing to flag automatically, but you can still check off add-ons below.</p>
              )}

              <div className="mt-4 flex flex-wrap gap-2">
                {ADD_ONS.map((addOn) => {
                  const selected = selectedAddOns.includes(addOn.key);
                  const wasDetected = detectedAddOns.includes(addOn.key);
                  return (
                    <button
                      key={addOn.key}
                      type="button"
                      onClick={() => toggleAddOn(addOn.key)}
                      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                        selected ? "border-[var(--co-evergreen)] bg-[var(--co-evergreen)] text-white" : "border-[var(--co-line)] bg-white text-[var(--co-muted)]"
                      }`}
                    >
                      {selected ? <Check className="h-3.5 w-3.5" aria-hidden /> : null}
                      {addOn.label} · {addOn.priceCents != null ? `+${dollars(addOn.priceCents)}` : (addOn.priceLabel ?? "ask for pricing")}
                      {wasDetected ? <span className={`text-[10px] ${selected ? "text-white/80" : "text-[var(--co-evergreen)]"}`}>(flagged)</span> : null}
                    </button>
                  );
                })}
              </div>

              <div className="mt-4 flex items-center justify-between gap-3">
                <p className="text-xs text-[var(--co-muted)]">
                  Add-ons aren&apos;t priced into this quote yet — the customer confirms and prices them when they accept. This just makes sure their request isn&apos;t missed.
                </p>
                <button
                  type="button"
                  onClick={addSelectedAddOnsToNotes}
                  disabled={selectedAddOns.length === 0}
                  className="co-button-secondary shrink-0 px-3 py-2 text-xs disabled:opacity-50"
                >
                  {addOnsAddedToNotes ? "Added to notes ✓" : "Add to proposal notes"}
                </button>
              </div>
            </section>
          ) : null}

          <section className="co-card p-5">
            <p className="eyebrow">Pricing context</p>
            <h2 className="mt-1 text-lg font-semibold">Dirt level and travel</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-[var(--co-muted)]">
                  <Percent className="h-3.5 w-3.5" aria-hidden />
                  Dirt level
                </span>
                <select
                  className="co-input w-full"
                  value={dirtyCodeLevel}
                  onChange={(event) => setDirtyCodeLevel(event.target.value === "" ? "" : Number(event.target.value))}
                >
                  <option value="">None</option>
                  {selectedLocation?.dirtyCodeTiers.map((tier) => (
                    <option key={tier.level} value={tier.level}>
                      Level {tier.level} · {(tier.discountPercent * 100).toFixed(0)}%
                    </option>
                  ))}
                </select>
              </label>

              <label className="block text-sm">
                <span className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-[var(--co-muted)]">
                  <Route className="h-3.5 w-3.5" aria-hidden />
                  Travel zone
                </span>
                <select
                  className="co-input w-full"
                  value={travelZoneId}
                  onChange={(event) => setTravelZoneId(event.target.value)}
                >
                  <option value="">No travel fee</option>
                  {selectedLocation?.travelZones.map((zone) => (
                    <option key={zone.id} value={zone.id}>
                      {zone.name} · +{dollars(zone.feeCents)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="mt-3 block text-sm">
              <span className="mb-1 block text-xs font-semibold text-[var(--co-muted)]">Notes to customer</span>
              <textarea
                className="co-input w-full resize-none"
                rows={3}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Add a personal note for the proposal..."
              />
            </label>
            <label className="mt-3 block text-sm">
              <span className="mb-1 block text-xs font-semibold text-[var(--co-muted)]">Valid until</span>
              <input
                type="date"
                className="co-input w-full"
                value={validUntil}
                onChange={(event) => setValidUntil(event.target.value)}
              />
            </label>
          </section>
        </div>

        <div className="co-card p-5 xl:sticky xl:top-5 xl:self-start">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="eyebrow">Live calculation</p>
              <h2 className="mt-1 text-xl font-semibold">Compare service tiers</h2>
              <p className="mt-1 text-sm text-[var(--co-muted)]">Every tier is priced and sent — the customer picks which one to accept.</p>
            </div>
            <span className="rounded-full bg-[var(--co-surface-muted)] px-3 py-1 text-xs font-medium text-[var(--co-evergreen)]">
              {calculating ? "Calculating..." : allTiers ? `${Object.keys(allTiers).length} tiers priced` : "Waiting for rooms"}
            </span>
          </div>

          {!allTiers ? (
            <div className="flex min-h-64 items-center justify-center text-center text-sm text-[var(--co-muted)]">
              Enter at least one room to see all customer options.
            </div>
          ) : (
            <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {SERVICE_TYPES.map((service, index) => {
                const tier = allTiers[service.value];
                return (
                  <div key={service.value} className="relative rounded-2xl border border-[var(--co-line)] bg-white p-4">
                    {index === 4 ? (
                      <span className="absolute -top-3 right-3 rounded-full bg-[var(--co-evergreen)] px-2 py-1 text-[10px] font-bold text-white">
                        Most popular
                      </span>
                    ) : null}
                    <h3 className="font-semibold">{service.label}</h3>
                    <p className="mt-2 min-h-8 text-xs leading-5 text-[var(--co-muted)]">{service.description}</p>
                    <p className="mt-4 text-2xl font-semibold text-[var(--co-ink)]">{dollars(tier?.finalCents ?? 0)}</p>
                    <p className="mt-1 text-xs text-[var(--co-muted)]">
                      {tier?.roomSubtotalCents
                        ? `${tier.roomLines.reduce((sum, line) => sum + line.weightHours * line.count, 0).toFixed(1)} estimated hrs`
                        : "Calculated from profile"}
                    </p>
                  </div>
                );
              })}
            </div>
          )}

          {error ? <p className="mt-4 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--co-line-soft)] pt-4 text-sm">
            <div className="text-[var(--co-muted)]">
              <span className="font-medium text-[var(--co-ink)]">{selectedCustomer ? `${selectedCustomer.firstName} ${selectedCustomer.lastName}` : "No customer selected"}</span>
              {totalRoomCount > 0 ? ` · ${totalRoomCount} rooms` : ""}
              {selectedLocation ? ` · ${selectedLocation.name}` : ""}
            </div>
            <button
              onClick={saveQuote}
              disabled={submitting || !allTiers}
              className="co-button-primary py-3"
            >
              {submitting ? "Saving quote..." : "Save quote →"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
