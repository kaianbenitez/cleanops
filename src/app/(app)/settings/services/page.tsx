"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Service = {
  id: string;
  category: "main" | "add_on";
  name: string;
  description: string | null;
  defaultPriceCents: number | null;
  priceLabel: string | null;
  defaultDurationMinutes: number | null;
  availableAddOnIds: string[];
  isActive: boolean;
};

const dollars = (cents: number) => (cents / 100).toFixed(2);

export default function ServiceCatalogPage() {
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  async function load() {
    setLoading(true);
    const data = await fetch("/api/services?all=1").then((response) => response.json());
    setServices(data.services ?? []);
    setLoading(false);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load server-backed settings on mount
    load();
  }, []);

  async function saveField(id: string, fields: Record<string, unknown>) {
    const response = await fetch(`/api/services/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fields),
    });
    setMessage(response.ok ? "Saved." : "Could not save.");
    await load();
  }

  if (loading) {
    return <div className="co-card p-8 text-sm text-[var(--co-muted)]">Loading service catalog…</div>;
  }

  const addOns = services.filter((service) => service.category === "add_on");
  const mainJobs = services.filter((service) => service.category === "main");

  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow">Pricing & quoting</p>
        <h1 className="page-title mt-2">Service catalog</h1>
        <p className="page-subtitle">
          Manage the job presets and add-ons available when creating one-off jobs. Quote pricing is configured separately.
        </p>
      </div>

      {message && <p className="text-sm font-medium text-[var(--co-accent-text)]">{message}</p>}

      <AddOnSection addOns={addOns} onSave={saveField} onReload={load} />
      <MainJobSection mainJobs={mainJobs} addOns={addOns} onSave={saveField} onReload={load} />
    </div>
  );
}

function AddOnSection({
  addOns,
  onSave,
  onReload,
}: {
  addOns: Service[];
  onSave: (id: string, fields: Record<string, unknown>) => Promise<void>;
  onReload: () => Promise<void>;
}) {
  const [newName, setNewName] = useState("");
  const [newPrice, setNewPrice] = useState("");
  const [newPriceLabel, setNewPriceLabel] = useState("");
  const [error, setError] = useState("");
  const nameInputRef = useRef<HTMLInputElement>(null);

  async function addAddOn() {
    const trimmedName = newName.trim();
    if (!trimmedName) return;
    if (!newPrice.trim() && !newPriceLabel.trim()) {
      setError("Add either a price or a price note (e.g. \"$10–$20 per window\").");
      return;
    }
    setError("");
    const response = await fetch("/api/services", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        category: "add_on",
        name: trimmedName,
        defaultPriceCents: newPrice.trim() ? Math.round(Number(newPrice) * 100) : null,
        priceLabel: newPriceLabel.trim() || null,
      }),
    });
    if (!response.ok) {
      setError("Could not add add-on.");
      return;
    }
    setNewName("");
    setNewPrice("");
    setNewPriceLabel("");
    nameInputRef.current?.focus();
    await onReload();
  }

  return (
    <section className="co-card overflow-hidden">
      <div className="flex items-center justify-between border-b border-[var(--co-line-soft)] px-5 py-4">
        <div>
          <p className="eyebrow">Add-ons</p>
          <h2 className="mt-1 text-lg font-semibold">Extras customers can add to a job</h2>
        </div>
        <span className="text-xs text-[var(--co-muted)]">{addOns.filter((a) => a.isActive).length} active</span>
      </div>
      <div className="divide-y divide-[var(--co-line-soft)]">
        {addOns.map((addOn) => (
          <div key={addOn.id} className={`p-5 ${!addOn.isActive ? "opacity-60" : ""}`}>
            <div className="flex flex-wrap items-start gap-3">
              <input
                defaultValue={addOn.name}
                onBlur={(event) => event.target.value !== addOn.name && onSave(addOn.id, { name: event.target.value })}
                className="co-input min-w-[220px] flex-1 font-semibold"
              />
              <button onClick={() => onSave(addOn.id, { isActive: !addOn.isActive })} className="co-button-secondary text-xs">
                {addOn.isActive ? "Deactivate" : "Activate"}
              </button>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="block text-xs font-semibold text-[var(--co-muted)]">
                Flat price (optional)
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  defaultValue={addOn.defaultPriceCents != null ? dollars(addOn.defaultPriceCents) : ""}
                  placeholder="Leave blank if price varies"
                  onBlur={(event) =>
                    onSave(addOn.id, {
                      defaultPriceCents: event.target.value.trim() ? Math.round(Number(event.target.value) * 100) : null,
                    })
                  }
                  className="co-input mt-1 w-full"
                />
              </label>
              <label className="block text-xs font-semibold text-[var(--co-muted)]">
                Price note (shown when price varies)
                <input
                  defaultValue={addOn.priceLabel ?? ""}
                  placeholder="e.g. $10–$20 per window"
                  onBlur={(event) => onSave(addOn.id, { priceLabel: event.target.value.trim() || null })}
                  className="co-input mt-1 w-full"
                />
              </label>
            </div>
          </div>
        ))}
        {addOns.length === 0 && (
          <p className="p-10 text-center text-sm text-[var(--co-muted)]">No add-ons yet. Add your first one below.</p>
        )}
      </div>
      <div className="border-t border-[var(--co-line-soft)] p-5">
        <p className="eyebrow">Add extra</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_130px_1fr_auto]">
          <input
            ref={nameInputRef}
            className="co-input"
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            placeholder="Window cleaning"
          />
          <input
            className="co-input"
            type="number"
            min="0"
            step="0.01"
            value={newPrice}
            onChange={(event) => setNewPrice(event.target.value)}
            placeholder="Flat price"
          />
          <input
            className="co-input"
            value={newPriceLabel}
            onChange={(event) => setNewPriceLabel(event.target.value)}
            placeholder="Price note (if price varies)"
          />
          <button onClick={addAddOn} className="co-button-primary">
            Add extra
          </button>
        </div>
        {error && <p className="mt-3 text-sm font-medium text-[var(--co-warning)]">{error}</p>}
      </div>
    </section>
  );
}

function MainJobSection({
  mainJobs,
  addOns,
  onSave,
  onReload,
}: {
  mainJobs: Service[];
  addOns: Service[];
  onSave: (id: string, fields: Record<string, unknown>) => Promise<void>;
  onReload: () => Promise<void>;
}) {
  const [newName, setNewName] = useState("");
  const [newPrice, setNewPrice] = useState("0");
  const [newDuration, setNewDuration] = useState("120");
  const [message, setMessage] = useState("");
  const [duplicateWarning, setDuplicateWarning] = useState("");
  const nameInputRef = useRef<HTMLInputElement>(null);
  const activeAddOns = useMemo(() => addOns.filter((a) => a.isActive), [addOns]);

  function toggleAvailableAddOn(job: Service, addOnId: string) {
    const current = job.availableAddOnIds ?? [];
    const next = current.includes(addOnId) ? current.filter((id) => id !== addOnId) : [...current, addOnId];
    onSave(job.id, { availableAddOnIds: next });
  }

  async function addJob() {
    const trimmedName = newName.trim();
    if (!trimmedName) return;

    if (!duplicateWarning) {
      const duplicate = mainJobs.some((job) => job.name.trim().toLowerCase() === trimmedName.toLowerCase());
      if (duplicate) {
        setDuplicateWarning(`A job preset named "${trimmedName}" already exists. Add it anyway?`);
        return;
      }
    }

    const response = await fetch("/api/services", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        category: "main",
        name: trimmedName,
        defaultPriceCents: Math.round(Number(newPrice || 0) * 100),
        defaultDurationMinutes: Number(newDuration || 0),
      }),
    });
    if (!response.ok) {
      setMessage("Could not add job preset.");
      return;
    }
    setNewName("");
    setNewPrice("0");
    setNewDuration("120");
    setDuplicateWarning("");
    setMessage("Job preset added.");
    nameInputRef.current?.focus();
    await onReload();
  }

  return (
    <div className="space-y-6">
      <section className="co-card overflow-hidden">
        <div className="flex items-center justify-between border-b border-[var(--co-line-soft)] px-5 py-4">
          <div>
            <p className="eyebrow">Main jobs</p>
            <h2 className="mt-1 text-lg font-semibold">Job presets</h2>
            <p className="mt-1 text-xs text-[var(--co-muted)]">
              These show up as choices on the New Job form&apos;s Job type picker, alongside First clean / Deep clean / Move-out.
            </p>
          </div>
          <span className="text-xs text-[var(--co-muted)]">{mainJobs.filter((service) => service.isActive).length} active</span>
        </div>
        <div className="divide-y divide-[var(--co-line-soft)]">
          {mainJobs.map((service) => (
            <div key={service.id} className={`p-5 ${!service.isActive ? "opacity-60" : ""}`}>
              <div className="flex flex-wrap items-start gap-3">
                <input
                  defaultValue={service.name}
                  onBlur={(event) =>
                    event.target.value !== service.name && onSave(service.id, { name: event.target.value })
                  }
                  className="co-input min-w-[220px] flex-1 font-semibold"
                />
                <button onClick={() => onSave(service.id, { isActive: !service.isActive })} className="co-button-secondary text-xs">
                  {service.isActive ? "Deactivate" : "Activate"}
                </button>
              </div>
              <textarea
                defaultValue={service.description ?? ""}
                onBlur={(event) =>
                  event.target.value !== (service.description ?? "") &&
                  onSave(service.id, { description: event.target.value || null })
                }
                placeholder="Description (optional)"
                rows={2}
                className="co-input mt-3 w-full resize-none"
              />
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="block text-xs font-semibold text-[var(--co-muted)]">
                  Default price
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    defaultValue={service.defaultPriceCents != null ? dollars(service.defaultPriceCents) : ""}
                    onBlur={(event) =>
                      onSave(service.id, { defaultPriceCents: Math.round(Number(event.target.value || 0) * 100) })
                    }
                    className="co-input mt-1 w-full"
                  />
                </label>
                <label className="block text-xs font-semibold text-[var(--co-muted)]">
                  Duration (minutes)
                  <input
                    type="number"
                    min="0"
                    step="15"
                    defaultValue={service.defaultDurationMinutes ?? 0}
                    onBlur={(event) => onSave(service.id, { defaultDurationMinutes: Number(event.target.value || 0) })}
                    className="co-input mt-1 w-full"
                  />
                </label>
              </div>
              {activeAddOns.length > 0 && (
                <div className="mt-4">
                  <p className="text-xs font-semibold text-[var(--co-muted)]">Available add-ons for this job</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {activeAddOns.map((addOn) => {
                      const checked = (service.availableAddOnIds ?? []).includes(addOn.id);
                      return (
                        <label
                          key={addOn.id}
                          className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs ${
                            checked
                              ? "border-[var(--co-accent-text)] bg-[var(--co-accent-text)]/10 text-[var(--co-accent-text)]"
                              : "border-[var(--co-line)] text-[var(--co-muted)]"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleAvailableAddOn(service, addOn.id)}
                            className="h-3.5 w-3.5"
                          />
                          {addOn.name}
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ))}
          {mainJobs.length === 0 && (
            <p className="p-10 text-center text-sm text-[var(--co-muted)]">
              No job presets yet. Add your first one below.
            </p>
          )}
        </div>
      </section>

      <section className="co-card p-5">
        <p className="eyebrow">Add job preset</p>
        <h2 className="mt-1 text-lg font-semibold">Create a main job</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_150px_170px_auto]">
          <input
            ref={nameInputRef}
            className="co-input"
            value={newName}
            onChange={(event) => {
              setNewName(event.target.value);
              setDuplicateWarning("");
            }}
            placeholder="Standard weekly clean"
          />
          <input
            className="co-input"
            type="number"
            min="0"
            step="0.01"
            value={newPrice}
            onChange={(event) => setNewPrice(event.target.value)}
            placeholder="Price"
          />
          <input
            className="co-input"
            type="number"
            min="0"
            step="15"
            value={newDuration}
            onChange={(event) => setNewDuration(event.target.value)}
            placeholder="Minutes"
          />
          <button onClick={addJob} className="co-button-primary">
            {duplicateWarning ? "Add anyway" : "Add job preset"}
          </button>
        </div>
        {duplicateWarning && (
          <p className="mt-3 text-sm font-medium text-[var(--co-warning)]">
            {duplicateWarning}{" "}
            <button onClick={() => setDuplicateWarning("")} className="underline hover:opacity-80">
              Cancel
            </button>
          </p>
        )}
        {!duplicateWarning && message && (
          <p className="mt-3 text-sm font-medium text-[var(--co-accent-text)]">{message}</p>
        )}
      </section>
    </div>
  );
}
