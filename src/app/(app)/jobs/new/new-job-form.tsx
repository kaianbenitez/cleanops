"use client";

import { useState } from "react";
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

/**
 * The interactive half of `/jobs/new`. Owns the form state; the option lists
 * arrive as props from the server component, so there is no fetch-on-mount
 * waterfall and every picker is populated on first paint.
 */
export default function NewJobForm({ customers, employees, services }: NewJobOptions) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [customerId, setCustomerId] = useState("");
  const [type, setType] = useState<(typeof JOB_TYPES)[number]>("one_time");
  const [scheduledDate, setScheduledDate] = useState(searchParams.get("date") ?? "");
  const [scheduledStartTime, setScheduledStartTime] = useState("09:00");
  const [priceCents, setPriceCents] = useState(0);
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const selectedCustomer = customers.find((customer) => customer.id === customerId) ?? null;

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
        priceCents,
        employeeIds: selectedEmployeeIds,
      }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.error ? JSON.stringify(body.error) : "Failed to create job.");
      setSubmitting(false);
      return;
    }
    router.push("/calendar");
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
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-2 block text-xs font-semibold text-[var(--co-muted)]">Job type</span>
              <select required className="co-input w-full" value={type} onChange={(event) => setType(event.target.value as (typeof JOB_TYPES)[number])}>
                {JOB_TYPES.map((entry) => (
                  <option key={entry} value={entry}>
                    {LABELS[entry]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-2 block text-xs font-semibold text-[var(--co-muted)]">Prefill from service</span>
              <select
                className="co-input w-full"
                onChange={(event) => {
                  const service = services.find((entry) => entry.id === event.target.value);
                  if (service) setPriceCents(service.defaultPriceCents);
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
          </div>
          <label className="mt-4 block text-sm">
            <span className="mb-2 block text-xs font-semibold text-[var(--co-muted)]">Price to invoice</span>
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-sm text-[var(--co-muted)]">$</span>
              <input
                required
                type="number"
                step="0.01"
                min="0"
                value={(priceCents / 100).toFixed(2)}
                onChange={(event) => setPriceCents(Math.round(Number(event.target.value || 0) * 100))}
                className="co-input w-full pl-7"
              />
            </div>
          </label>
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
            <Summary label="Service" value={LABELS[type]} />
            <Summary label="Date" value={scheduledDate || "Not selected"} />
            <Summary label="Time" value={scheduledStartTime || "Not selected"} />
            <Summary label="Team" value={selectedEmployeeIds.length ? `${selectedEmployeeIds.length} assigned` : "Assign later"} />
            <Summary label="Price" value={`$${(priceCents / 100).toFixed(2)}`} />
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
