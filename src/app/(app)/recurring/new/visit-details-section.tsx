"use client";

import type { SeriesServiceOption } from "@/lib/recurring/new-series-data";

/** Price per visit, with an optional prefill from the service catalog.
 *
 * The service picker is a convenience only — the series stores a price, not a
 * service id, so changing it after prefilling is expected. */
export default function VisitDetailsSection({
  services,
  priceCents,
  onPriceCentsChange,
}: {
  services: SeriesServiceOption[];
  priceCents: number;
  onPriceCentsChange: (priceCents: number) => void;
}) {
  return (
    <section className="co-card p-5">
      <p className="eyebrow">Visit details</p>
      <h2 className="mt-1 text-lg font-semibold">What does each visit cost?</h2>

      <label className="mt-5 block text-sm">
        <span className="mb-2 block text-xs font-semibold text-[var(--co-muted)]">Prefill from service</span>
        <select
          className="co-input w-full"
          onChange={(event) => {
            const service = services.find((entry) => entry.id === event.target.value);
            if (service) onPriceCentsChange(service.defaultPriceCents);
          }}
        >
          <option value="">None</option>
          {services.map((service) => (
            <option key={service.id} value={service.id}>
              {service.name} · ${(service.defaultPriceCents / 100).toFixed(2)}
            </option>
          ))}
        </select>
      </label>

      <label className="mt-4 block text-sm">
        <span className="mb-2 block text-xs font-semibold text-[var(--co-muted)]">Price per visit</span>
        <div className="relative">
          <span className="absolute left-3 top-2.5 text-sm text-[var(--co-muted)]">$</span>
          <input
            required
            type="number"
            min="0"
            step="0.01"
            className="co-input w-full pl-7"
            value={(priceCents / 100).toFixed(2)}
            onChange={(event) => onPriceCentsChange(Math.round(Number(event.target.value || 0) * 100))}
          />
        </div>
      </label>
    </section>
  );
}
