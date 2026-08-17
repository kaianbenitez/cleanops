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
  prefilledFromQuote = false,
}: {
  services: SeriesServiceOption[];
  priceCents: number;
  onPriceCentsChange: (priceCents: number) => void;
  prefilledFromQuote?: boolean;
}) {
  return (
    <section className="co-card p-5">
      <p className="eyebrow">Visit details</p>
      <h2 className="mt-1 text-lg font-semibold">What does each visit cost?</h2>
      {prefilledFromQuote ? (
        <p className="mt-2 text-xs font-medium text-[var(--co-accent-text)]">Prefilled from this customer&apos;s most recent quote — adjust it below if needed.</p>
      ) : null}

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
        <div className="flex items-stretch">
          <span className="flex items-center rounded-l-[var(--co-radius-control)] border border-r-0 border-[var(--co-input-border)] bg-[var(--co-input-bg)] px-3 text-sm text-[var(--co-muted)]">
            $
          </span>
          <input
            required
            type="number"
            min="0"
            step="0.01"
            className="co-input w-full rounded-l-none"
            value={(priceCents / 100).toFixed(2)}
            onChange={(event) => onPriceCentsChange(Math.round(Number(event.target.value || 0) * 100))}
            onFocus={(event) => event.target.select()}
          />
        </div>
      </label>
    </section>
  );
}
