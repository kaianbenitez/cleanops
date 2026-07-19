"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Customer = {
  id: string;
  firstName: string;
  lastName: string;
  status: string;
  city?: string | null;
  zip?: string | null;
};

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
  { value: "supreme_deep", label: "Supreme Deep", description: "The most detailed clean for a reset or special occasion." },
  { value: "deep", label: "Deep Clean", description: "A thorough clean with extra attention to buildup and detail." },
  { value: "first_time", label: "First Time", description: "A strong starting point before recurring maintenance." },
  { value: "weekly", label: "Weekly", description: "Reliable maintenance for a consistently cared-for home." },
  { value: "biweekly", label: "Bi-Weekly", description: "Our most popular recurring rhythm for busy homes." },
  { value: "four_weeks", label: "Every 4 Weeks", description: "A monthly maintenance option with more time between visits." },
  { value: "move_in_out", label: "Move In / Out", description: "A reset clean for a transition between homes." },
];

function dollars(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function SelectedStatus({ text }: { text: string }) {
  return (
    <span className="rounded-full bg-[var(--co-surface-muted)] px-3 py-1 text-xs font-medium text-[var(--co-evergreen)]">
      {text}
    </span>
  );
}

export default function NewQuotePage() {
  const router = useRouter();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [roomTypes, setRoomTypes] = useState<RoomType[]>([]);
  const [locations, setLocations] = useState<ServiceLocation[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [serviceLocationId, setServiceLocationId] = useState("");
  const [serviceType, setServiceType] = useState<ServiceType>("first_time");
  const [travelZoneId, setTravelZoneId] = useState("");
  const [dirtyCodeLevel, setDirtyCodeLevel] = useState<number | "">("");
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [allTiers, setAllTiers] = useState<Record<string, Breakdown> | null>(null);
  const [calculating, setCalculating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [notes, setNotes] = useState("");
  const [validUntil, setValidUntil] = useState("");

  useEffect(() => {
    Promise.all([
      fetch("/api/customers").then((response) => response.json()),
      fetch("/api/room-types").then((response) => response.json()),
      fetch("/api/service-locations").then((response) => response.json()),
    ])
      .then(([customerBody, roomBody, locationBody]) => {
        setCustomers(customerBody.customers ?? []);
        setRoomTypes(roomBody.roomTypes ?? []);
        setLocations(locationBody.locations ?? []);
        if (locationBody.locations?.[0]) setServiceLocationId(locationBody.locations[0].id);
      })
      .catch(() => setError("Quote setup could not be loaded."));
  }, []);

  const selectedLocation = useMemo(
    () => locations.find((location) => location.id === serviceLocationId) ?? null,
    [locations, serviceLocationId]
  );

  const roomCounts = useMemo(
    () =>
      roomTypes
        .map((room) => ({ roomTypeId: room.id, count: counts[room.id] ?? 0 }))
        .filter((room) => room.count > 0),
    [counts, roomTypes]
  );

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
        serviceType,
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
  }, [dirtyCodeLevel, roomCounts, serviceLocationId, serviceType, travelZoneId]);

  useEffect(() => {
    // Recalculate after the form inputs change; this is the quote preview's source of truth.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    calculate();
  }, [calculate]);

  const selectedBreakdown = allTiers?.[serviceType];

  function setCount(id: string, count: number) {
    setCounts((current) => ({ ...current, [id]: Math.max(0, count) }));
  }

  async function saveQuote() {
    setError("");
    if (!customerId || !serviceLocationId || !roomCounts.length || !selectedBreakdown) {
      setError("Customer, location, and at least one room are required.");
      return;
    }

    setSubmitting(true);
    const response = await fetch("/api/quotes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customerId,
        serviceLocationId,
        requestedServiceType: serviceType,
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
        <h1 className="page-title mt-2">New quote</h1>
        <p className="page-subtitle">Build the home profile once, then compare every service option before sending.</p>
      </header>

      <div className="grid gap-5 xl:grid-cols-[0.82fr_1.18fr]">
        <div className="space-y-5">
          <section className="co-card p-5">
            <p className="eyebrow">Customer and location</p>
            <h2 className="mt-1 text-lg font-semibold">Who is this for?</h2>
            <div className="mt-4 space-y-3">
              <label className="block text-sm">
                <span className="mb-1 block text-xs font-semibold text-[var(--co-muted)]">Customer</span>
                <select
                  className="co-input w-full"
                  value={customerId}
                  onChange={(event) => setCustomerId(event.target.value)}
                >
                  <option value="">Select a customer</option>
                  {customers.map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.firstName} {customer.lastName}
                      {customer.city || customer.zip ? ` · ${[customer.city, customer.zip].filter(Boolean).join(" ")}` : ""}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block text-sm">
                <span className="mb-1 block text-xs font-semibold text-[var(--co-muted)]">Service location</span>
                <select
                  className="co-input w-full"
                  value={serviceLocationId}
                  onChange={(event) => {
                    setServiceLocationId(event.target.value);
                    setTravelZoneId("");
                  }}
                >
                  <option value="">Select a pricing location</option>
                  {locations.map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.name} · {dollars(location.hourlyRateCents)}/hr
                    </option>
                  ))}
                </select>
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
              <span className="text-xs text-[var(--co-muted)]">{roomCounts.reduce((sum, room) => sum + room.count, 0)} rooms</span>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {roomTypes.map((room) => (
                <label key={room.id} className="block text-sm">
                  <span className="mb-1 block text-xs text-[var(--co-muted)]">{room.name}</span>
                  <input
                    type="number"
                    min="0"
                    value={counts[room.id] ?? 0}
                    onChange={(event) => setCount(room.id, Number(event.target.value || 0))}
                    className="co-input w-full"
                  />
                </label>
              ))}
            </div>
          </section>

          <section className="co-card p-5">
            <p className="eyebrow">Pricing context</p>
            <h2 className="mt-1 text-lg font-semibold">Service options</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="mb-1 block text-xs font-semibold text-[var(--co-muted)]">Travel zone</span>
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

              <label className="block text-sm">
                <span className="mb-1 block text-xs font-semibold text-[var(--co-muted)]">Dirty code</span>
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
            </div>
            <SelectedStatus
              text={calculating ? "Calculating..." : selectedBreakdown ? `${dollars(selectedBreakdown.finalCents)} selected` : "Waiting for rooms"}
            />
          </div>

          {!allTiers ? (
            <div className="flex min-h-64 items-center justify-center text-center text-sm text-[var(--co-muted)]">
              Enter at least one room to see all customer options.
            </div>
          ) : (
            <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {SERVICE_TYPES.map((service, index) => {
                const tier = allTiers[service.value];
                const selected = service.value === serviceType;
                return (
                  <button
                    key={service.value}
                    onClick={() => setServiceType(service.value)}
                    className={`relative rounded-2xl border p-4 text-left transition-transform hover:-translate-y-0.5 ${
                      selected ? "border-[var(--co-evergreen)] bg-[var(--co-surface-muted)] ring-2 ring-[var(--co-accent)]" : "border-[var(--co-line)] bg-white"
                    }`}
                  >
                    {index === 4 ? (
                      <span className="absolute -top-3 right-3 rounded-full bg-[var(--co-evergreen)] px-2 py-1 text-[10px] font-bold text-white">
                        Most popular
                      </span>
                    ) : null}
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-semibold">{service.label}</h3>
                      <span
                        className={`flex h-5 w-5 items-center justify-center rounded-full border text-xs ${
                          selected ? "border-[var(--co-evergreen)] bg-[var(--co-evergreen)] text-white" : "border-[var(--co-line)]"
                        }`}
                      >
                        {selected ? "✓" : ""}
                      </span>
                    </div>
                    <p className="mt-2 min-h-12 text-xs leading-5 text-[var(--co-muted)]">{service.description}</p>
                    <p className="mt-4 text-2xl font-semibold text-[var(--co-ink)]">{dollars(tier?.finalCents ?? 0)}</p>
                    <p className="mt-1 text-xs text-[var(--co-muted)]">
                      {tier?.roomSubtotalCents
                        ? `${tier.roomLines.reduce((sum, line) => sum + line.weightHours * line.count, 0).toFixed(1)} estimated hrs`
                        : "Calculated from profile"}
                    </p>
                  </button>
                );
              })}
            </div>
          )}

          {selectedBreakdown ? (
            <div className="mt-5 border-t border-[var(--co-line-soft)] pt-4">
              <div className="flex justify-between text-sm">
                <span className="text-[var(--co-muted)]">Selected option</span>
                <span className="font-medium">{SERVICE_TYPES.find((service) => service.value === serviceType)?.label}</span>
              </div>
              <div className="mt-2 flex justify-between text-lg font-semibold">
                <span>Total</span>
                <span>{dollars(selectedBreakdown.finalCents)}</span>
              </div>
            </div>
          ) : null}

          {error ? <p className="mt-4 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}

          <button
            onClick={saveQuote}
            disabled={submitting || !selectedBreakdown}
            className="co-button-primary mt-5 w-full py-3"
          >
            {submitting ? "Saving quote..." : "Save quote →"}
          </button>
        </div>
      </div>
    </div>
  );
}
