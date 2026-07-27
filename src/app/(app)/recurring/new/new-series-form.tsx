"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import CustomerSearchPicker from "@/components/customer-search-picker";
import type { NewSeriesOptions } from "@/lib/recurring/new-series-data";
import CadenceSection from "./cadence-section";
import SeriesSummary from "./series-summary";
import TeamSection from "./team-section";
import VisitDetailsSection from "./visit-details-section";
import type { SeriesFrequency } from "./constants";
import type { Submission } from "./types";

/**
 * The interactive half of `/recurring/new`. Owns the form state; the option
 * lists arrive as props from the server component, so there is no fetch-on-mount
 * waterfall and every picker is populated on first paint.
 */
export default function NewSeriesForm({ customers, employees, services }: NewSeriesOptions) {
  const router = useRouter();
  const [customerId, setCustomerId] = useState("");
  const [frequency, setFrequency] = useState<SeriesFrequency>("weekly");
  const [dayOfWeek, setDayOfWeek] = useState(1);
  const [startDate, setStartDate] = useState("");
  const [priceCents, setPriceCents] = useState(0);
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<string[]>([]);
  const [submission, setSubmission] = useState<Submission>({ state: "idle" });

  const customer = customers.find((entry) => entry.id === customerId) ?? null;

  async function submit(event: React.FormEvent) {
    event.preventDefault();

    if (!customerId || !startDate || priceCents <= 0) {
      setSubmission({ state: "error", message: "Customer, start date, and a price greater than $0 are required." });
      return;
    }

    setSubmission({ state: "submitting" });

    const response = await fetch("/api/recurring-series", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customerId,
        frequency,
        // Monthly series are anchored to the start date's day-of-month; the
        // generator ignores dayOfWeek, so don't send a misleading value.
        dayOfWeek: frequency === "monthly" ? undefined : dayOfWeek,
        startDate,
        priceCents,
        employeeIds: selectedEmployeeIds,
      }),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setSubmission({ state: "error", message: body.error ? JSON.stringify(body.error) : "Failed to create series." });
      return;
    }

    const data = await response.json();
    setSubmission({ state: "done", created: data.generation.created, skipped: data.generation.skipped });
  }

  return (
    <form onSubmit={submit} className="grid gap-5 xl:grid-cols-[1fr_360px]">
      <div className="space-y-5">
        <section className="co-card p-5">
          <p className="eyebrow">Customer</p>
          <h2 className="mt-1 text-lg font-semibold">Who is on the recurring schedule?</h2>
          <div className="mt-5">
            <CustomerSearchPicker customers={customers} value={customerId} onChange={setCustomerId} />
          </div>
        </section>

        <CadenceSection
          frequency={frequency}
          onFrequencyChange={setFrequency}
          dayOfWeek={dayOfWeek}
          onDayOfWeekChange={setDayOfWeek}
          startDate={startDate}
          onStartDateChange={setStartDate}
        />

        <VisitDetailsSection services={services} priceCents={priceCents} onPriceCentsChange={setPriceCents} />

        <TeamSection employees={employees} selectedEmployeeIds={selectedEmployeeIds} onChange={setSelectedEmployeeIds} />
      </div>

      <SeriesSummary
        customer={customer}
        frequency={frequency}
        dayOfWeek={dayOfWeek}
        startDate={startDate}
        priceCents={priceCents}
        teamCount={selectedEmployeeIds.length}
        submission={submission}
        onViewCalendar={() => {
          router.push("/calendar");
          router.refresh();
        }}
      />
    </form>
  );
}
