"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type TravelZone = { id: string; name: string; feeCents: number; sortOrder: number };
type DirtyTier = { level: number; discountPercent: number };
type Location = {
  id: string;
  name: string;
  hourlyRateCents: number;
  minimums: Record<string, number>;
  dirtyCodeTiers: DirtyTier[];
  isActive: boolean;
  travelZones: TravelZone[];
};

const SERVICE_TYPES = [
  { value: "supreme_deep", label: "Supreme Deep Cleaning" },
  { value: "deep", label: "Deep Cleaning" },
  { value: "first_time", label: "First Time Cleaning" },
  { value: "weekly", label: "Weekly" },
  { value: "biweekly", label: "Bi-Weekly" },
  { value: "four_weeks", label: "4 Weeks" },
  { value: "move_in_out", label: "Move In/Out" },
] as const;

function dollars(cents: number): string {
  return (cents / 100).toFixed(2);
}

export default function PricingSettingsPage() {
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [savedAt, setSavedAt] = useState<Record<string, boolean>>({});

  async function load() {
    setLoading(true);
    const data = await fetch("/api/service-locations?all=1").then((r) => r.json());
    setLocations(data.locations ?? []);
    setLoading(false);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- standard fetch-on-mount pattern
    load();
  }, []);

  function flashSaved(locationId: string) {
    setSavedAt((s) => ({ ...s, [locationId]: true }));
    setTimeout(() => setSavedAt((s) => ({ ...s, [locationId]: false })), 1500);
  }

  async function saveLocation(locationId: string, fields: Record<string, unknown>) {
    await fetch(`/api/service-locations/${locationId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fields),
    });
    await load();
    flashSaved(locationId);
  }

  async function addZone(locationId: string, name: string, feeDollars: string) {
    if (!name.trim()) return;
    await fetch(`/api/service-locations/${locationId}/travel-zones`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, feeCents: Math.round(parseFloat(feeDollars || "0") * 100) }),
    });
    await load();
  }

  async function saveZone(locationId: string, zoneId: string, fields: Record<string, unknown>) {
    await fetch(`/api/service-locations/${locationId}/travel-zones/${zoneId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fields),
    });
    await load();
  }

  async function deleteZone(locationId: string, zoneId: string) {
    const res = await fetch(`/api/service-locations/${locationId}/travel-zones/${zoneId}`, { method: "DELETE" });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      alert(body.error ?? "Could not delete this zone.");
      return;
    }
    await load();
  }

  if (loading) return <div className="co-card p-6 text-sm text-[var(--co-muted)]">Loading pricing settings…</div>;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Settings / Quote engine</p>
          <h1 className="page-title mt-2">Pricing &amp; service locations</h1>
          <p className="page-subtitle">Control the rates and travel rules used by every quote calculation.</p>
        </div>
        <Link href="/settings" className="co-button-secondary">
        ← Settings
        </Link>
      </header>
      <section className="rounded-2xl border border-[var(--co-line)] bg-[var(--co-surface-muted)]/70 p-4 text-sm text-[var(--co-muted)]">
        <span className="font-semibold text-[var(--co-ink)]">Keep this page operational.</span> Changes save when you leave a field, and affect new quotes immediately.
      </section>
      <section className="rounded-2xl border border-[var(--co-line)] bg-white p-4 text-sm text-[var(--co-muted)]">
        <p className="font-semibold text-[var(--co-ink)]">Service areas are configurable per company.</p>
        <p className="mt-1">
          Rename travel zones to match the towns, ZIP codes, or neighborhoods each business serves. CleanOps uses these zones to price travel and to block quotes
          outside the service area when a customer falls beyond the configured coverage.
        </p>
      </section>

      {locations.map((loc) => (
        <LocationCard
          key={loc.id}
          location={loc}
          saved={savedAt[loc.id]}
          onSave={(fields) => saveLocation(loc.id, fields)}
          onAddZone={(name, fee) => addZone(loc.id, name, fee)}
          onSaveZone={(zoneId, fields) => saveZone(loc.id, zoneId, fields)}
          onDeleteZone={(zoneId) => deleteZone(loc.id, zoneId)}
        />
      ))}
    </div>
  );
}

function LocationCard({
  location,
  saved,
  onSave,
  onAddZone,
  onSaveZone,
  onDeleteZone,
}: {
  location: Location;
  saved?: boolean;
  onSave: (fields: Record<string, unknown>) => void;
  onAddZone: (name: string, feeDollars: string) => void;
  onSaveZone: (zoneId: string, fields: Record<string, unknown>) => void;
  onDeleteZone: (zoneId: string) => void;
}) {
  const [newZoneName, setNewZoneName] = useState("");
  const [newZoneFee, setNewZoneFee] = useState("0");

  return (
    <section className="co-card space-y-6 p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--co-line-soft)] pb-4">
        <div>
          <p className="eyebrow">Service location</p>
          <h2 className="mt-1 text-xl font-semibold text-[var(--co-ink)]">
          {location.name}
          {!location.isActive && <span className="ml-2 rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-500">Inactive</span>}
          </h2>
        </div>
        <div className="flex items-center gap-2">
          {saved && <span className="text-xs font-semibold text-[var(--co-evergreen)]">Saved</span>}
          <button
            onClick={() => onSave({ isActive: !location.isActive })}
            className="co-button-secondary text-xs"
          >
            {location.isActive ? "Deactivate" : "Activate"}
          </button>
        </div>
      </div>

      <label className="block max-w-xs text-sm">
        <span className="mb-1 block text-xs font-semibold text-[var(--co-muted)]">Hourly rate ($/hr)</span>
        <input
          type="number"
          step="0.01"
          min="0"
          defaultValue={dollars(location.hourlyRateCents)}
          onBlur={(e) => onSave({ hourlyRateCents: Math.round(parseFloat(e.target.value || "0") * 100) })}
          className="co-input w-full"
        />
      </label>

      <div>
        <h3 className="eyebrow">Minimum price per service type</h3>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {SERVICE_TYPES.map((s) => (
            <label key={s.value} className="block text-xs">
              <span className="mb-1 block text-xs text-[var(--co-muted)]">{s.label}</span>
              <input
                type="number"
                step="0.01"
                min="0"
                defaultValue={dollars(location.minimums[s.value] ?? 0)}
                onBlur={(e) =>
                  onSave({
                    minimums: { ...location.minimums, [s.value]: Math.round(parseFloat(e.target.value || "0") * 100) },
                  })
                }
                className="co-input w-full py-2 text-sm"
              />
            </label>
          ))}
        </div>
      </div>

      <div>
        <h3 className="eyebrow">Dirty-code discount tiers</h3>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[1, 2, 3, 4].map((level) => {
            const tier = location.dirtyCodeTiers.find((t) => t.level === level);
            return (
              <label key={level} className="block text-xs">
                <span className="mb-1 block text-xs text-[var(--co-muted)]">Level {level} (%)</span>
                <input
                  type="number"
                  step="1"
                  defaultValue={((tier?.discountPercent ?? 0) * 100).toFixed(0)}
                  onBlur={(e) => {
                    const newTiers = [1, 2, 3, 4].map((l) => {
                      if (l === level) return { level: l, discountPercent: parseFloat(e.target.value || "0") / 100 };
                      const existing = location.dirtyCodeTiers.find((t) => t.level === l);
                      return existing ?? { level: l, discountPercent: 0 };
                    });
                    onSave({ dirtyCodeTiers: newTiers });
                  }}
                  className="co-input w-full py-2 text-sm"
                />
              </label>
            );
          })}
        </div>
      </div>

      <div>
        <h3 className="eyebrow">Travel zones</h3>
        <div className="mt-3 divide-y divide-[var(--co-line-soft)] overflow-hidden rounded-xl border border-[var(--co-line)]">
          {location.travelZones.map((zone) => (
            <div key={zone.id} className="flex flex-wrap items-center gap-2 bg-white px-3 py-3 text-sm">
              <input
                defaultValue={zone.name}
                onBlur={(e) => e.target.value !== zone.name && onSaveZone(zone.id, { name: e.target.value })}
                aria-label={`${zone.name} zone name`}
                className="co-input min-w-[180px] flex-1 py-2 text-sm"
              />
              <span className="text-[var(--co-muted)]">$</span>
              <input
                type="number"
                step="0.01"
                min="0"
                defaultValue={dollars(zone.feeCents)}
                onBlur={(e) => onSaveZone(zone.id, { feeCents: Math.round(parseFloat(e.target.value || "0") * 100) })}
                aria-label={`${zone.name} travel fee`}
                className="co-input w-24 py-2 text-sm"
              />
              <button type="button" onClick={() => onDeleteZone(zone.id)} className="text-xs font-semibold text-rose-600 hover:underline">
                Remove
              </button>
            </div>
          ))}
          {location.travelZones.length === 0 && (
            <p className="px-3 py-3 text-xs text-[var(--co-muted)]">No travel zones yet.</p>
          )}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            value={newZoneName}
            onChange={(e) => setNewZoneName(e.target.value)}
            placeholder="Zone name (town or zip)"
            aria-label="New zone name"
            className="co-input min-w-[180px] flex-1 py-2 text-sm"
          />
          <span className="text-[var(--co-muted)]">$</span>
          <input
            type="number"
            step="0.01"
            min="0"
            value={newZoneFee}
            onChange={(e) => setNewZoneFee(e.target.value)}
            aria-label="New zone fee"
            className="co-input w-24 py-2 text-sm"
          />
          <button
            onClick={() => {
              onAddZone(newZoneName, newZoneFee);
              setNewZoneName("");
              setNewZoneFee("0");
            }}
            className="co-button-primary py-2 text-xs"
          >
            Add zone
          </button>
        </div>
        <p className="mt-2 text-xs text-[var(--co-muted)]">
          Tip: use zone names that match how the owner thinks about service coverage. This keeps quoting flexible for any company.
        </p>
      </div>
    </section>
  );
}
