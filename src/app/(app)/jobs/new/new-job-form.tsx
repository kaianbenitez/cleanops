"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import CustomerSearchPicker from "@/components/customer-search-picker";
import TeamSearchPicker from "@/components/team-search-picker";
import type { NewJobOptions } from "@/lib/jobs/new-job-data";

const JOB_TYPES = ["first_clean", "one_time", "deep_clean", "move_out"] as const;
const LABELS: Record<string, string> = {
  first_clean: "First clean",
  one_time: "One-time clean",
  deep_clean: "Deep clean",
  move_out: "Move-out clean",
};

/** Encodes the Job type <select>'s value space: a built-in type is just its
 * enum value; a custom main-job preset is prefixed so both can share one
 * control without colliding with a real service uuid. */
const PRESET_PREFIX = "preset:";

/**
 * The interactive half of `/jobs/new`. Owns the form state; the option lists
 * arrive as props from the server component, so there is no fetch-on-mount
 * waterfall and every picker is populated on first paint.
 */
export default function NewJobForm({ customers, employees, services }: NewJobOptions) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [customerId, setCustomerId] = useState(searchParams.get("customerId") ?? "");
  const [type, setType] = useState<(typeof JOB_TYPES)[number]>("one_time");
  const [serviceId, setServiceId] = useState<string>("");
  const [addOnIds, setAddOnIds] = useState<string[]>([]);
  const [scheduledDate, setScheduledDate] = useState(searchParams.get("date") ?? "");
  const [scheduledStartTime, setScheduledStartTime] = useState("09:00");
  const [priceCents, setPriceCents] = useState(0);
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const selectedCustomer = customers.find((customer) => customer.id === customerId) ?? null;
  const mainPresets = useMemo(() => services.filter((service) => service.category === "main"), [services]);
  const allAddOns = useMemo(() => services.filter((service) => service.category === "add_on"), [services]);
  const selectedPreset = mainPresets.find((preset) => preset.id === serviceId) ?? null;
  const availableAddOns = useMemo(() => {
    if (!selectedPreset || selectedPreset.availableAddOnIds.length === 0) return allAddOns;
    return allAddOns.filter((addOn) => selectedPreset.availableAddOnIds.includes(addOn.id));
  }, [selectedPreset, allAddOns]);
  const addOnTotalCents = addOnIds.reduce((sum, id) => {
    const addOn = allAddOns.find((entry) => entry.id === id);
    return sum + (addOn?.defaultPriceCents ?? 0);
  }, 0);
  const hasVariablePricedAddOn = addOnIds.some((id) => allAddOns.find((entry) => entry.id === id)?.defaultPriceCents == null);
  const totalCents = priceCents + addOnTotalCents;
  const serviceLabel = selectedPreset ? selectedPreset.name : LABELS[type];

  function handleTypeSelect(value: string) {
    if (value.startsWith(PRESET_PREFIX)) {
      const preset = mainPresets.find((entry) => entry.id === value.slice(PRESET_PREFIX.length));
      if (!preset) return;
      setServiceId(preset.id);
      setType("one_time");
      setPriceCents(preset.defaultPriceCents ?? 0);
      // Add-ons picked for a previous preset may not apply to this one.
      setAddOnIds((current) => current.filter((id) => preset.availableAddOnIds.length === 0 || preset.availableAddOnIds.includes(id)));
    } else {
      setServiceId("");
      setType(value as (typeof JOB_TYPES)[number]);
    }
  }

  function toggleAddOn(addOnId: string) {
    setAddOnIds((current) => (current.includes(addOnId) ? current.filter((id) => id !== addOnId) : [...current, addOnId]));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (!customerId || !scheduledDate || !scheduledStartTime || !type) {
      setError("Customer, service, date, and time are required.");
      return;
    }
    setSubmitting(true);
    const response = await fetch("/api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customerId,
        type,
        scheduledDate,
        scheduledStartTime: `${scheduledStartTime}:00`,
        priceCents: totalCents,
        employeeIds: selectedEmployeeIds,
        serviceId: serviceId || undefined,
        addOnIds: addOnIds.length ? addOnIds : undefined,
      }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.error ? JSON.stringify(body.error) : "Failed to create job.");
      setSubmitting(false);
      return;
    }
    // Explicit view+day beats the calendar's remembered last-viewed cookie,
    // so the newly created job's own date is what actually renders instead
    // of silently falling back to whatever day was last viewed.
    router.push(`/calendar?view=staff&day=${scheduledDate}`);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-5 xl:grid-cols-[1fr_360px]">
      <div className="space-y-5">
        <section className="co-card p-5">
          <p className="eyebrow">Customer</p>
          <h2 className="mt-1 text-lg font-semibold">Who is this visit for?</h2>
          <div className="mt-5">
            <CustomerSearchPicker customers={customers} value={customerId} onChange={setCustomerId} />
          </div>
        </section>

        <section className="co-card p-5">
          <p className="eyebrow">Service details</p>
          <h2 className="mt-1 text-lg font-semibold">What are we doing?</h2>
          <div className="mt-5">
            <label className="block text-sm">
              <span className="mb-2 block text-xs font-semibold text-[var(--co-muted)]">Job type</span>
              <select
                required
                className="co-input w-full"
                value={serviceId ? `${PRESET_PREFIX}${serviceId}` : type}
                onChange={(event) => handleTypeSelect(event.target.value)}
              >
                <optgroup label="Built-in">
                  {JOB_TYPES.map((entry) => (
                    <option key={entry} value={entry}>
                      {LABELS[entry]}
                    </option>
                  ))}
                </optgroup>
                {mainPresets.length > 0 && (
                  <optgroup label="Custom presets">
                    {mainPresets.map((preset) => (
                      <option key={preset.id} value={`${PRESET_PREFIX}${preset.id}`}>
                        {preset.name} · ${((preset.defaultPriceCents ?? 0) / 100).toFixed(2)}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
            </label>
          </div>
          {availableAddOns.length > 0 && (
            <div className="mt-4">
              <span className="mb-2 block text-xs font-semibold text-[var(--co-muted)]">Add-ons</span>
              <div className="flex flex-wrap gap-2">
                {availableAddOns.map((addOn) => {
                  const checked = addOnIds.includes(addOn.id);
                  return (
                    <label
                      key={addOn.id}
                      className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs ${
                        checked
                          ? "border-[var(--co-evergreen)] bg-[var(--co-evergreen)]/10 text-[var(--co-evergreen)]"
                          : "border-[var(--co-line)] text-[var(--co-muted)]"
                      }`}
                    >
                      <input type="checkbox" checked={checked} onChange={() => toggleAddOn(addOn.id)} className="h-3.5 w-3.5" />
                      {addOn.name}
                      {addOn.defaultPriceCents != null
                        ? ` · $${(addOn.defaultPriceCents / 100).toFixed(2)}`
                        : addOn.priceLabel
                          ? ` · ${addOn.priceLabel}`
                          : ""}
                    </label>
                  );
                })}
              </div>
            </div>
          )}
          <label className="mt-4 block text-sm">
            <span className="mb-2 block text-xs font-semibold text-[var(--co-muted)]">Base price to invoice</span>
            <div className="relative">
              <span className="absolute left-3 top-1/2 z-10 pointer-events-none -translate-y-1/2 text-sm text-[var(--co-muted)]">$</span>
              <input
                required
                type="number"
                step="0.01"
                min="0"
                value={(priceCents / 100).toFixed(2)}
                onChange={(event) => setPriceCents(Math.round(Number(event.target.value || 0) * 100))}
                className="co-input w-full pl-8"
              />
            </div>
          </label>
          {addOnIds.length > 0 && (
            <p className="mt-2 text-xs text-[var(--co-muted)]">
              + ${(addOnTotalCents / 100).toFixed(2)} in add-ons
              {hasVariablePricedAddOn ? " (some priced on request — adjust the base price to match)" : ""} = $
              {(totalCents / 100).toFixed(2)} total
            </p>
          )}
        </section>

        <section className="co-card p-5">
          <p className="eyebrow">Schedule</p>
          <h2 className="mt-1 text-lg font-semibold">Place it on the calendar</h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-2 block text-xs font-semibold text-[var(--co-muted)]">Date</span>
              <input required type="date" value={scheduledDate} onChange={(event) => setScheduledDate(event.target.value)} className="co-input w-full" />
            </label>
            <label className="block text-sm">
              <span className="mb-2 block text-xs font-semibold text-[var(--co-muted)]">Start time</span>
              <input required type="time" value={scheduledStartTime} onChange={(event) => setScheduledStartTime(event.target.value)} className="co-input w-full" />
            </label>
          </div>
        </section>

        <section className="co-card p-5">
          <p className="eyebrow">Team assignment</p>
          <h2 className="mt-1 text-lg font-semibold">Who is cleaning?</h2>
          <p className="mt-1 text-sm text-[var(--co-muted)]">You can leave this empty and assign the job later from Calendar.</p>
          <div className="mt-5">
            <TeamSearchPicker employees={employees} selectedIds={selectedEmployeeIds} onChange={setSelectedEmployeeIds} />
          </div>
        </section>
      </div>

      <aside className="xl:sticky xl:top-5 xl:self-start">
        <section className="co-card p-5">
          <p className="eyebrow">Job summary</p>
          <h2 className="mt-1 text-xl font-semibold">Ready to schedule</h2>
          <div className="mt-5 space-y-4 border-y border-[var(--co-line-soft)] py-5 text-sm">
            <Summary label="Customer" value={selectedCustomer ? `${selectedCustomer.firstName} ${selectedCustomer.lastName}` : "Not selected"} />
            <Summary label="Service" value={serviceLabel} />
            <Summary label="Date" value={scheduledDate || "Not selected"} />
            <Summary label="Time" value={scheduledStartTime || "Not selected"} />
            <Summary label="Team" value={selectedEmployeeIds.length ? `${selectedEmployeeIds.length} assigned` : "Assign later"} />
            <Summary label="Price" value={`$${(totalCents / 100).toFixed(2)}`} />
          </div>
          {error ? <p className="mt-4 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}
          <button type="submit" disabled={submitting} className="co-button-primary mt-5 w-full py-3">
            {submitting ? "Creating job…" : "Create job →"}
          </button>
          <p className="mt-3 text-center text-xs leading-5 text-[var(--co-muted)]">The job will appear on Calendar immediately.</p>
        </section>
      </aside>
    </form>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-[var(--co-muted)]">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}
