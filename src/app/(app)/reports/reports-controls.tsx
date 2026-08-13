"use client";

import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CalendarDays,
  Download,
  Eye,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";

const PRESETS = [
  ["all_time", "All time"],
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

type SortState = { column: number; direction: "asc" | "desc" };

function sortRows(rows: string[][], sort: SortState | null) {
  if (!sort) return rows;
  const { column, direction } = sort;
  return [...rows].sort((a, b) => {
    const left = a[column] ?? "";
    const right = b[column] ?? "";
    const leftNumber = Number(left.replace(/[^0-9.-]/g, ""));
    const rightNumber = Number(right.replace(/[^0-9.-]/g, ""));
    const bothNumeric =
      left !== "" &&
      right !== "" &&
      !Number.isNaN(leftNumber) &&
      !Number.isNaN(rightNumber);
    const comparison = bothNumeric
      ? leftNumber - rightNumber
      : left.localeCompare(right);
    return direction === "asc" ? comparison : -comparison;
  });
}

function ReportPreviewModal({
  exportHref,
  name,
  onClose,
  preview,
}: {
  exportHref: string;
  name: string;
  onClose: () => void;
  preview: PreviewTable;
}) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortState | null>(null);

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const filteredRows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const matched = needle
      ? preview.rows.filter((row) =>
          row.some((cell) => cell.toLowerCase().includes(needle)),
        )
      : preview.rows;
    return sortRows(matched, sort);
  }, [preview.rows, query, sort]);

  function toggleSort(column: number) {
    setSort((current) => {
      if (!current || current.column !== column)
        return { column, direction: "asc" };
      if (current.direction === "asc")
        return { column, direction: "desc" };
      return null;
    });
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${name} preview`}
        className="co-card flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden p-0"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-[var(--co-line-soft)] p-5">
          <div>
            <h3 className="font-semibold text-[var(--co-ink)]">{name}</h3>
            <p className="mt-1 text-sm text-[var(--co-muted)]">
              {preview.summary ?? `${preview.rows.length} rows`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <a className="co-button-primary gap-1.5" href={exportHref}>
              <Download className="h-4 w-4" aria-hidden />
              CSV
            </a>
            <button
              type="button"
              className="co-button-secondary p-2"
              onClick={onClose}
              aria-label="Close preview"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>
        </div>
        <div className="border-b border-[var(--co-line-soft)] p-4">
          <Input
            type="search"
            placeholder="Filter rows…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="max-w-sm"
            autoFocus
          />
        </div>
        <div className="flex-1 overflow-auto">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-[var(--co-surface-muted)] text-[var(--co-muted)]">
              <tr>
                {preview.columns.map((column, index) => {
                  const active = sort?.column === index;
                  return (
                    <th
                      key={column}
                      className="whitespace-nowrap px-4 py-3 font-medium"
                    >
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 hover:text-[var(--co-ink)]"
                        onClick={() => toggleSort(index)}
                      >
                        {column}
                        {active && sort?.direction === "asc" ? (
                          <ArrowUp className="h-3.5 w-3.5" aria-hidden />
                        ) : active && sort?.direction === "desc" ? (
                          <ArrowDown className="h-3.5 w-3.5" aria-hidden />
                        ) : (
                          <ArrowUpDown
                            className="h-3.5 w-3.5 opacity-30"
                            aria-hidden
                          />
                        )}
                      </button>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--co-line-soft)]">
              {filteredRows.map((row, index) => (
                <tr key={`${row.join("-")}-${index}`}>
                  {row.map((value, cell) => (
                    <td key={cell} className="whitespace-nowrap px-4 py-3">
                      {value}
                    </td>
                  ))}
                </tr>
              ))}
              {filteredRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={preview.columns.length}
                    className="px-4 py-10 text-center text-[var(--co-muted)]"
                  >
                    No rows match &ldquo;{query}&rdquo;.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <div className="border-t border-[var(--co-line-soft)] px-5 py-3 text-xs text-[var(--co-muted)]">
          {query
            ? `${filteredRows.length} of ${preview.rows.length} rows match`
            : `${preview.rows.length} rows`}
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function ReportActions({
  exportHref,
  name,
  preview,
}: {
  exportHref: string;
  name: string;
  preview: PreviewTable;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="co-button-secondary gap-1.5"
          onClick={() => setOpen(true)}
        >
          <Eye className="h-4 w-4" aria-hidden />
          Preview
        </button>
        <a className="co-button-primary gap-1.5" href={exportHref}>
          <Download className="h-4 w-4" aria-hidden />
          CSV
        </a>
      </div>
      {open ? (
        <ReportPreviewModal
          exportHref={exportHref}
          name={name}
          onClose={() => setOpen(false)}
          preview={preview}
        />
      ) : null}
    </>
  );
}
