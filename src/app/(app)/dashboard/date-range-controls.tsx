"use client";

import { CalendarDays } from "lucide-react";
import { useEffect, useRef, useState } from "react";
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
type Preset = (typeof PRESETS)[number][0];

function isPreset(value: string): value is Preset {
  return PRESETS.some(([preset]) => preset === value);
}

function formatRange(fromIso: string, toIso: string) {
  const from = new Date(`${fromIso}T00:00:00.000Z`);
  const to = new Date(`${toIso}T00:00:00.000Z`);
  const monthDay = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
  const year = new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    timeZone: "UTC",
  });
  if (fromIso === toIso)
    return `${monthDay.format(from)}, ${year.format(from)}`;
  if (from.getUTCFullYear() === to.getUTCFullYear())
    return `${monthDay.format(from)} – ${monthDay.format(to)}, ${year.format(to)}`;
  return `${monthDay.format(from)}, ${year.format(from)} – ${monthDay.format(to)}, ${year.format(to)}`;
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
  const pickerRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(fromIso);
  const [to, setTo] = useState(toIso);
  const selectedPreset = isPreset(preset) ? preset : "";

  useEffect(() => {
    if (!open) return;
    function closePicker(event: MouseEvent) {
      if (
        pickerRef.current &&
        !pickerRef.current.contains(event.target as Node)
      )
        setOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", closePicker);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closePicker);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  function selectPreset(nextPreset: Preset) {
    const next = new URLSearchParams(params.toString());
    next.delete("from");
    next.delete("to");
    next.set("preset", nextPreset);
    router.push(`/dashboard?${next.toString()}`);
  }
  function applyCustomRange() {
    const next = new URLSearchParams(params.toString());
    next.set("from", from);
    next.set("to", to);
    next.set("preset", "custom");
    router.push(`/dashboard?${next.toString()}`);
    setOpen(false);
  }

  return (
    <div ref={pickerRef} className="flex flex-wrap items-center gap-2">
      <label className="sr-only" htmlFor="dashboard-reporting-period">
        Reporting period
      </label>
      <select
        id="dashboard-reporting-period"
        className="co-input min-h-11 min-w-40"
        value={selectedPreset}
        onChange={(event) => selectPreset(event.target.value as Preset)}
      >
        {selectedPreset === "" ? (
          <option value="" disabled>
            Custom range
          </option>
        ) : null}
        {PRESETS.map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
      <div className="relative">
        <Button
          type="button"
          variant="outline"
          onClick={() => setOpen((current) => !current)}
          aria-expanded={open}
          aria-haspopup="dialog"
          aria-label={`Choose custom date range, currently ${formatRange(fromIso, toIso)}`}
          className="min-h-11 gap-2 whitespace-nowrap"
        >
          <CalendarDays className="h-4 w-4" aria-hidden />
          {formatRange(fromIso, toIso)}
        </Button>
        {open ? (
          <div
            role="dialog"
            aria-label="Custom date range"
            className="co-date-popover co-date-popover-responsive absolute right-0 top-full z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] p-3"
          >
            <div className="grid gap-3">
              <label className="grid gap-1 text-xs font-medium text-[var(--co-muted)]">
                <span>From</span>
                <Input
                  type="date"
                  value={from}
                  onChange={(event) => setFrom(event.target.value)}
                  className="min-h-11"
                />
              </label>
              <label className="grid gap-1 text-xs font-medium text-[var(--co-muted)]">
                <span>Through</span>
                <Input
                  type="date"
                  value={to}
                  onChange={(event) => setTo(event.target.value)}
                  className="min-h-11"
                />
              </label>
              <Button
                type="button"
                onClick={applyCustomRange}
                className="min-h-11"
              >
                Apply
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
