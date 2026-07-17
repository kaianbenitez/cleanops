"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type Customer = { id: string; firstName: string; lastName: string; status: string };
type Employee = { id: string; firstName: string; lastName: string };
type Service = { id: string; name: string; defaultPriceCents: number; defaultDurationMinutes: number };

const JOB_TYPES = ["first_clean", "one_time", "deep_clean", "move_out"] as const;
const LABELS: Record<string, string> = {
  first_clean: "First clean",
  one_time: "One-time clean",
  deep_clean: "Deep clean",
  move_out: "Move-out clean",
};

export default function NewJobPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [type, setType] = useState<(typeof JOB_TYPES)[number]>("one_time");
  const [scheduledDate, setScheduledDate] = useState(searchParams.get("date") ?? "");
  const [scheduledStartTime, setScheduledStartTime] = useState("09:00");
  const [priceCents, setPriceCents] = useState(0);
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/customers").then((response) => response.json()),
      fetch("/api/employees").then((response) => response.json()),
      fetch("/api/services").then((response) => response.json()),
    ]).then(([customersData, employeesData, servicesData]) => {
      setCustomers(customersData.customers ?? []);
      setEmployees(employeesData.employees ?? []);
      setServices(servicesData.services ?? []);
    });
  }, []);

  function toggleEmployee(id: string) {
    setSelectedEmployeeIds((current) => (current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id]));
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

  const selectedCustomer = customers.find((customer) => customer.id === customerId);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Operations / Jobs</p>
          <h1 className="page-title mt-2">New job</h1>
          <p className="page-subtitle">Create a service visit, assign the team, and place it on the calendar.</p>
        </div>
        <Link href="/jobs" className="co-button-secondary">
          ← Back to jobs
        </Link>
      </header>

      <form onSubmit={handleSubmit} className="grid gap-5 xl:grid-cols-[1fr_360px]">
        <div className="space-y-5">
          <section className="co-card p-5">
            <p className="eyebrow">Customer</p>
            <h2 className="mt-1 text-lg font-semibold">Who is this visit for?</h2>
            <label className="mt-5 block text-sm">
              <span className="mb-2 block text-xs font-semibold text-[var(--co-muted)]">Customer</span>
              <select required className="co-input w-full" value={customerId} onChange={(event) => setCustomerId(event.target.value)}>
                <option value="">Select a customer</option>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.firstName} {customer.lastName} · {customer.status}
                  </option>
                ))}
              </select>
            </label>
            {selectedCustomer ? (
              <div className="mt-4 rounded-xl bg-[var(--co-surface-muted)] p-4 text-sm">
                <p className="font-semibold">
                  {selectedCustomer.firstName} {selectedCustomer.lastName}
                </p>
                <p className="mt-1 text-xs text-[var(--co-muted)]">Customer details will be pulled into the job automatically.</p>
              </div>
            ) : null}
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
            <div className="mt-5 grid gap-2 sm:grid-cols-2">
              {employees.map((employee) => (
                <label
                  key={employee.id}
                  className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 text-sm ${
                    selectedEmployeeIds.includes(employee.id) ? "border-[var(--co-evergreen)] bg-[var(--co-surface-muted)]" : "border-[var(--co-line)] bg-white"
                  }`}
                >
                  <input type="checkbox" checked={selectedEmployeeIds.includes(employee.id)} onChange={() => toggleEmployee(employee.id)} className="accent-[#14211f]" />
                  <span>
                    <span className="block font-medium">
                      {employee.firstName} {employee.lastName}
                    </span>
                    <span className="block text-xs text-[var(--co-muted)]">Cleaning technician</span>
                  </span>
                </label>
              ))}
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
    </div>
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
