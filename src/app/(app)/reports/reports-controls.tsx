"use client";

import { CalendarDays, Download, Eye } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";

const PRESETS = [
  ["yesterday", "Yesterday"],
  ["this_week", "This week"],
  ["last_week", "Last week"],
  ["last_30_days", "Last 30 days"],
  ["this_month", "This month"],
  ["last_month", "Last month"],
  ["this_year", "This year"],
  ["last_year", "Last year"],
] as const;

function formatRange(fromIso: string, toIso: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
  return `${formatter.format(new Date(`${fromIso}T00:00:00Z`))} – ${formatter.format(new Date(`${toIso}T00:00:00Z`))}`;
}

export function ReportsFilters({
  areas,
  area,
  fromIso,
  preset,
  toIso,
}: {
  areas: string[];
  area?: string;
  fromIso: string;
  preset: string;
  toIso: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(fromIso);
  const [to, setTo] = useState(toIso);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function close(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node))
        setOpen(false);
    }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  function update(mutator: (next: URLSearchParams) => void) {
    const next = new URLSearchParams(params.toString());
    mutator(next);
    router.push(`${pathname}?${next.toString()}`);
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="sr-only" htmlFor="reports-area">
        Area
      </label>
      <select
        id="reports-area"
        className="co-input min-h-10 min-w-36"
        value={area ?? ""}
        onChange={(event) =>
          update((next) => {
            if (event.target.value) {
              next.set("area", event.target.value);
            } else {
              next.delete("area");
            }
          })
        }
      >
        <option value="">All Areas</option>
        {areas.map((city) => (
          <option key={city} value={city}>
            {city}
          </option>
        ))}
      </select>
      <label className="sr-only" htmlFor="reports-period">
        Reporting period
      </label>
      <select
        id="reports-period"
        className="co-input min-h-10 min-w-36"
        value={PRESETS.some(([value]) => value === preset) ? preset : ""}
        onChange={(event) =>
          update((next) => {
            next.delete("from");
            next.delete("to");
            next.set("preset", event.target.value);
          })
        }
      >
        {!PRESETS.some(([value]) => value === preset) ? (
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
      <div ref={ref} className="relative">
        <button
          type="button"
          className="co-button-secondary min-h-10 gap-2"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-haspopup="dialog"
        >
          <CalendarDays className="h-4 w-4" aria-hidden />
          {formatRange(fromIso, toIso)}
        </button>
        {open ? (
          <div
            role="dialog"
            aria-label="Custom date range"
            className="co-date-popover co-date-popover-responsive absolute right-0 top-full z-50 mt-2 w-72 max-w-[calc(100vw-2rem)] p-3"
          >
            <label className="grid gap-1 text-sm text-[var(--co-muted)]">
              From
              <Input
                type="date"
                value={from}
                onChange={(event) => setFrom(event.target.value)}
              />
            </label>
            <label className="mt-3 grid gap-1 text-sm text-[var(--co-muted)]">
              Through
              <Input
                type="date"
                value={to}
                onChange={(event) => setTo(event.target.value)}
              />
            </label>
            <button
              type="button"
              className="co-button-primary mt-3 w-full"
              onClick={() => {
                update((next) => {
                  next.set("preset", "custom");
                  next.set("from", from);
                  next.set("to", to);
                });
                setOpen(false);
              }}
            >
              Apply
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export type PreviewTable = {
  columns: string[];
  rows: string[][];
  summary?: string;
};

export function ReportActions({
  exportHref,
  preview,
}: {
  exportHref: string;
  preview: PreviewTable;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="co-button-secondary gap-1.5"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
        >
          <Eye className="h-4 w-4" aria-hidden />
          {open ? "Hide" : "Preview"}
        </button>
        <a className="co-button-primary gap-1.5" href={exportHref}>
          <Download className="h-4 w-4" aria-hidden />
          CSV
        </a>
      </div>
      {open ? (
        <div className="mt-4 border-t border-[var(--co-line-soft)] pt-4">
          <p className="mb-3 text-sm text-[var(--co-muted)]">
            {preview.summary ?? `Showing ${preview.rows.length} rows`}
          </p>
          <div className="max-h-96 overflow-auto">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-[var(--co-surface-muted)] text-[var(--co-muted)]">
                <tr>
                  {preview.columns.map((column) => (
                    <th
                      key={column}
                      className="whitespace-nowrap px-4 py-3 font-medium"
                    >
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--co-line-soft)]">
                {preview.rows.map((row, index) => (
                  <tr key={`${row.join("-")}-${index}`}>
                    {row.map((value, cell) => (
                      <td key={cell} className="whitespace-nowrap px-4 py-3">
                        {value}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </>
  );
}
