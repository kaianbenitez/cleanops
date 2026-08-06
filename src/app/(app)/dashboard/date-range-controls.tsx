"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const PRESETS = [
  ["yesterday", "Yesterday"],
  ["this_week", "This week"],
  ["last_week", "Last week"],
  ["this_month", "This month"],
  ["last_month", "Last month"],
  ["this_year", "This year"],
  ["last_year", "Last year"],
] as const;
type Preset = (typeof PRESETS)[number][0] | "custom";
function isPreset(value: string | undefined): value is Preset {
  return value === "custom" || PRESETS.some(([preset]) => preset === value);
}

export default function DateRangeControls({
  fromIso,
  preset,
  toIso,
}: {
  fromIso: string;
  preset: string;
  toIso: string;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [from, setFrom] = useState(fromIso);
  const [to, setTo] = useState(toIso);
  const [selectedPreset, setSelectedPreset] = useState<Preset>(
    isPreset(preset) ? preset : "custom",
  );
  function setRange(nextFrom: string, nextTo: string, nextPreset: Preset) {
    const next = new URLSearchParams(params.toString());
    next.set("from", nextFrom);
    next.set("to", nextTo);
    next.set("preset", nextPreset);
    router.push(`/dashboard?${next.toString()}`);
  }
  function selectPreset(nextPreset: Preset) {
    setSelectedPreset(nextPreset);
    if (nextPreset === "custom") return;
    const next = new URLSearchParams(params.toString());
    next.delete("from");
    next.delete("to");
    next.set("preset", nextPreset);
    router.push(`/dashboard?${next.toString()}`);
  }
  return (
    <section
      aria-label="Performance reporting date range"
      className="co-card px-4 py-3"
    >
      <div className="flex flex-wrap items-end gap-2">
        <label className="grid gap-1 text-xs font-medium text-[var(--co-muted)]">
          <span>Reporting period</span>
          <select
            aria-label="Reporting period"
            className="co-input min-h-11 w-full min-w-44 sm:w-48"
            value={selectedPreset}
            onChange={(event) => selectPreset(event.target.value as Preset)}
          >
            {PRESETS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
            <option value="custom">Custom</option>
          </select>
        </label>
        {selectedPreset === "custom" ? (
          <>
            <label className="grid gap-1 text-xs font-medium text-[var(--co-muted)]">
              <span>From</span>
              <Input
                type="date"
                value={from}
                onChange={(event) => setFrom(event.target.value)}
                className="min-h-11 w-40"
              />
            </label>
            <label className="grid gap-1 text-xs font-medium text-[var(--co-muted)]">
              <span>Through</span>
              <Input
                type="date"
                value={to}
                onChange={(event) => setTo(event.target.value)}
                className="min-h-11 w-40"
              />
            </label>
            <Button
              type="button"
              variant="outline"
              onClick={() => setRange(from, to, "custom")}
              className="min-h-11"
            >
              Apply
            </Button>
          </>
        ) : null}
        <p className="pb-1 text-xs text-[var(--co-muted)] sm:ml-auto">
          Schedule, routes, and due invoices below always show current data.
        </p>
      </div>
    </section>
  );
}
