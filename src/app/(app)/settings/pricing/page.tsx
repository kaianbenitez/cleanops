"use client";

import { useEffect, useState } from "react";

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
  const [newAreaName, setNewAreaName] = useState("");
  const [newAreaRate, setNewAreaRate] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

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

  async function createServiceArea() {
    if (!newAreaName.trim()) {
      setCreateError("Name is required.");
      return;
    }
    const rateCents = Math.round(parseFloat(newAreaRate || "0") * 100);
    if (!rateCents || rateCents <= 0) {
      setCreateError("Enter an hourly rate greater than $0.");
      return;
    }
    setCreating(true);
    setCreateError("");
    const res = await fetch("/api/service-locations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newAreaName.trim(), hourlyRateCents: rateCents, minimums: {}, dirtyCodeTiers: [] }),
    });
    const body = await res.json().catch(() => ({}));
    setCreating(false);
    if (!res.ok) {
      setCreateError(body.error ? JSON.stringify(body.error) : "Could not create this service area.");
      return;
    }
    setNewAreaName("");
    setNewAreaRate("");
    await load();
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
      <div>
        <p className="eyebrow">Pricing & quoting</p>
        <h1 className="page-title mt-2">Pricing &amp; travel zones</h1>
        <p className="page-subtitle">Control the rates and travel rules used by every quote calculation.</p>
      </div>
      <section className="rounded-2xl border border-[var(--co-line)] bg-[var(--co-surface-muted)]/70 p-4 text-sm text-[var(--co-muted)]">
        <span className="font-semibold text-[var(--co-ink)]">Keep this page operational.</span> Changes save when you leave a field, and affect new quotes immediately.
      </section>
      <section className="rounded-2xl border border-[var(--co-line)] bg-white p-4 text-sm text-[var(--co-muted)]">
        <p className="font-semibold text-[var(--co-ink)]">How this maps to a real business: one office, with fees for the cities around it.</p>
        <p className="mt-1">
          A <strong>service area</strong> below is your office/branch — most companies only need one. It sets the base hourly rate. If you serve a single
          area, add just one. Only add a second if you genuinely run a separate branch with its own crew and rate (e.g. a second office in another city).
        </p>
        <p className="mt-2">
          <strong>Travel zones</strong> (inside each service area) are the nearby towns/ZIP codes you drive out to, each with its own flat travel fee added
          on top of the hourly rate — e.g. your home city might be $0, a town 20 minutes out might add a $15 travel fee. A customer whose address falls
          outside every configured travel zone will be blocked from getting a quote, so add every area you actually serve.
        </p>
      </section>

      {locations.length === 0 && !loading && (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <p className="font-semibold">No service areas yet — quotes can&apos;t be created until you add one.</p>
          <p className="mt-1">A service area sets the hourly rate and travel fees for a city or branch. Add your first one below.</p>
        </section>
      )}

      <section className="co-card space-y-4 p-5 sm:p-6">
        <div>
          <p className="eyebrow">Add a service area</p>
          <h2 className="mt-1 text-lg font-semibold">New pricing zone</h2>
          <p className="mt-1 text-sm text-[var(--co-muted)]">e.g. the city or branch this covers. You can add travel zones and minimums after creating it.</p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-semibold text-[var(--co-muted)]">Name</span>
            <input
              value={newAreaName}
              onChange={(e) => setNewAreaName(e.target.value)}
              placeholder="e.g. Bartlesville"
              className="co-input w-56"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-semibold text-[var(--co-muted)]">Hourly rate ($/hr)</span>
            <input
              type="number"
              step="0.01"
              min="0"
              value={newAreaRate}
              onChange={(e) => setNewAreaRate(e.target.value)}
              placeholder="45.00"
              className="co-input w-32"
            />
          </label>
          <button onClick={createServiceArea} disabled={creating} className="co-button-primary">
            {creating ? "Adding..." : "Add service area"}
          </button>
        </div>
        {createError && <p className="text-sm text-rose-600">{createError}</p>}
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
          <p className="eyebrow">Pricing zone</p>
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
          onFocus={(e) => e.target.select()}
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
                onFocus={(e) => e.target.select()}
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
