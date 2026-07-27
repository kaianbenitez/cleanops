"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Customer = { id: string; firstName: string; lastName: string; status: string };

/** Search-to-pick single-select for choosing a customer. The sibling of
 * `TeamSearchPicker`, but single-value: picking replaces the input with the
 * chosen customer plus a "Change" button, so the current selection is always
 * legible without opening the list. Replaces a plain `<select>` that rendered
 * every customer in the company — fine at seed volume, unusable at 700+. */
export default function CustomerSearchPicker({
  customers,
  value,
  onChange,
  placeholder = "Search customers by name…",
}: {
  customers: Customer[];
  value: string;
  onChange: (customerId: string) => void;
  placeholder?: string;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    function onMouseDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [open]);

  const selected = customers.find((customer) => customer.id === value) ?? null;

  const matches = useMemo(() => {
    const term = query.trim().toLowerCase();
    return customers
      .filter((customer) => !term || `${customer.firstName} ${customer.lastName}`.toLowerCase().includes(term))
      .slice(0, 8);
  }, [customers, query]);

  function select(customerId: string) {
    onChange(customerId);
    setQuery("");
    setOpen(false);
  }

  function clear() {
    onChange("");
    setQuery("");
    setOpen(true);
    // The input only exists once nothing is selected, so focus after paint.
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      if (matches[0]) select(matches[0].id);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  }

  if (selected) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-[var(--co-evergreen)] bg-[var(--co-surface-muted)] p-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-[10px] font-bold text-[var(--co-evergreen)]">
          {selected.firstName[0]}
          {selected.lastName[0]}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">
            {selected.firstName} {selected.lastName}
          </span>
          <span className="block text-xs text-[var(--co-muted)]">{selected.status}</span>
        </span>
        <button type="button" onClick={clear} className="shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold text-[var(--co-muted)] hover:bg-white hover:text-[var(--co-evergreen)]">
          Change
        </button>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        className="co-input w-full"
        aria-label="Search customers"
      />

      {open ? (
        <div className="absolute left-0 top-full z-30 mt-1 w-full rounded-2xl border border-[var(--co-line)] bg-white p-1.5 shadow-[0_12px_32px_rgba(15,23,20,0.18)]">
          {matches.length ? (
            matches.map((customer) => (
              <button
                key={customer.id}
                type="button"
                onClick={() => select(customer.id)}
                className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-sm hover:bg-[var(--co-surface-muted)]"
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--co-surface-muted)] text-[10px] font-bold text-[var(--co-evergreen)]">
                  {customer.firstName[0]}
                  {customer.lastName[0]}
                </span>
                <span className="min-w-0 flex-1 truncate">
                  {customer.firstName} {customer.lastName}
                </span>
                <span className="shrink-0 text-xs text-[var(--co-muted)]">{customer.status}</span>
              </button>
            ))
          ) : (
            <p className="px-2.5 py-2 text-xs text-[var(--co-muted)]">
              {customers.length ? "No customers match." : "No customers yet."}
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}
