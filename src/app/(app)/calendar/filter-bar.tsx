"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useState } from "react";

type Employee = { id: string; firstName: string; lastName: string };

const VIEWS = [
  { value: "week", label: "Week" },
  { value: "day", label: "Day" },
  { value: "staff", label: "Staff" },
  { value: "list", label: "List" },
] as const;

const TYPES = [
  { value: "first_clean", label: "First Clean" },
  { value: "recurring", label: "Recurring" },
  { value: "one_time", label: "One-Time" },
  { value: "deep_clean", label: "Deep Clean" },
  { value: "move_out", label: "Move In/Out" },
] as const;

export default function FilterBar({ employees }: { employees: Employee[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [zipDraft, setZipDraft] = useState(searchParams.get("zip") ?? "");

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    // Changing a filter or view shouldn't keep a stale day/week anchor from
    // a different navigation context — but we DO want to keep the current
    // anchor when just switching views, so only the filter setters below
    // touch date params, never this generic setter.
    router.push(`${pathname}?${params.toString()}`);
  }

  function clearAll() {
    const params = new URLSearchParams();
    const view = searchParams.get("view");
    if (view) params.set("view", view);
    const week = searchParams.get("week");
    if (week) params.set("week", week);
    const day = searchParams.get("day");
    if (day) params.set("day", day);
    router.push(`${pathname}?${params.toString()}`);
    setZipDraft("");
  }

  const view = searchParams.get("view") ?? "week";
  const employeeId = searchParams.get("employeeId") ?? "";
  const type = searchParams.get("type") ?? "";
  const recurring = searchParams.get("recurring") ?? "";
  const hasFilters = employeeId || type || recurring || searchParams.get("zip");

  return (
    <div className="co-card flex flex-wrap items-center gap-2 p-3">
      <div className="flex overflow-hidden rounded-xl border border-[var(--co-line)] bg-[var(--co-surface-muted)]/50 p-1">
        {VIEWS.map((v) => (
          <button
            key={v.value}
            type="button"
            aria-pressed={view === v.value}
            onClick={() => setParam("view", v.value === "week" ? "" : v.value)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${view === v.value ? "bg-[var(--co-evergreen)] text-white shadow-sm" : "text-[var(--co-muted)] hover:bg-white hover:text-[var(--co-ink)]"}`}
          >
            {v.label}
          </button>
        ))}
      </div>

      <select
        value={employeeId}
        onChange={(e) => setParam("employeeId", e.target.value)}
        aria-label="Filter by employee"
        className="co-input min-w-[160px] py-2 text-xs"
      >
        <option value="">All employees</option>
        {employees.map((e) => (
          <option key={e.id} value={e.id}>
            {e.firstName} {e.lastName}
          </option>
        ))}
      </select>

      <select
        value={type}
        onChange={(e) => setParam("type", e.target.value)}
        aria-label="Filter by cleaning type"
        className="co-input min-w-[160px] py-2 text-xs"
      >
        <option value="">All cleaning types</option>
        {TYPES.map((t) => (
          <option key={t.value} value={t.value}>
            {t.label}
          </option>
        ))}
      </select>

      <select
        value={recurring}
        onChange={(e) => setParam("recurring", e.target.value)}
        aria-label="Filter by schedule type"
        className="co-input min-w-[170px] py-2 text-xs"
      >
        <option value="">Recurring + one-time</option>
        <option value="yes">Recurring only</option>
        <option value="no">One-time only</option>
      </select>

      <input
        value={zipDraft}
        onChange={(e) => setZipDraft(e.target.value)}
        onBlur={() => setParam("zip", zipDraft.trim())}
        onKeyDown={(e) => e.key === "Enter" && setParam("zip", zipDraft.trim())}
        placeholder="Zip code"
        aria-label="Filter by zip code"
        className="co-input w-28 py-2 text-xs"
      />

      {hasFilters ? (
        <button type="button" onClick={clearAll} className="ml-auto text-xs font-semibold text-[var(--co-evergreen)] hover:underline">
          Clear filters
        </button>
      ) : null}
    </div>
  );
}
