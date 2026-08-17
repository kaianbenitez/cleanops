"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Employee = { id: string; firstName: string; lastName: string; isActive?: boolean };

/** Search-to-add multi-select for assigning a crew. Replaces a plain checkbox
 * grid with a filterable combobox + removable chips, since scanning a long
 * checkbox list doesn't scale as headcount grows. The first selected person
 * is the lead (order matters — callers persist selectedIds as-is and the API
 * treats index 0 as lead), so removing/reordering chips changes who leads. */
export default function TeamSearchPicker({
  employees,
  selectedIds,
  onChange,
  placeholder = "Search technicians by name…",
}: {
  employees: Employee[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  placeholder?: string;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onMouseDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [open]);

  const selectedEmployees = selectedIds.map((id) => employees.find((employee) => employee.id === id)).filter((employee): employee is Employee => Boolean(employee));

  const matches = useMemo(() => {
    const term = query.trim().toLowerCase();
    return employees
      .filter((employee) => employee.isActive !== false)
      .filter((employee) => !selectedIds.includes(employee.id))
      .filter((employee) => !term || `${employee.firstName} ${employee.lastName}`.toLowerCase().includes(term))
      .slice(0, 8);
  }, [employees, selectedIds, query]);

  function add(employeeId: string) {
    onChange([...selectedIds, employeeId]);
    setQuery("");
  }

  function remove(employeeId: string) {
    onChange(selectedIds.filter((id) => id !== employeeId));
  }

  function makeLead(employeeId: string) {
    if (selectedIds[0] === employeeId) return;
    onChange([employeeId, ...selectedIds.filter((id) => id !== employeeId)]);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      if (matches[0]) add(matches[0].id);
    } else if (event.key === "Backspace" && !query && selectedIds.length) {
      remove(selectedIds[selectedIds.length - 1]);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div ref={containerRef} className="relative">
      {selectedEmployees.length ? (
        <div className="mb-2 flex flex-wrap gap-2">
          {selectedEmployees.map((employee, index) => (
            <span key={employee.id} className="flex items-center gap-1.5 rounded-full border border-[var(--co-line)] bg-[var(--co-surface-muted)] py-1 pl-3 pr-1.5 text-xs font-medium">
              {index === 0 ? <span className="rounded-full bg-[var(--co-accent-fill)] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">Lead</span> : null}
              {employee.isActive === false ? <span className="co-badge-neutral rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide">Inactive</span> : null}
              {employee.firstName} {employee.lastName}
              {index !== 0 ? (
                <button type="button" onClick={() => makeLead(employee.id)} className="rounded-full px-1.5 py-0.5 text-[10px] text-[var(--co-muted)] hover:text-[var(--co-accent-text)]">
                  Make lead
                </button>
              ) : null}
              <button type="button" onClick={() => remove(employee.id)} aria-label={`Remove ${employee.firstName} ${employee.lastName}`} className="rounded-full p-1 text-[var(--co-muted)] hover:bg-[var(--co-surface)] hover:text-[var(--co-danger)]">
                ✕
              </button>
            </span>
          ))}
        </div>
      ) : null}

      <input
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
        aria-label="Search technicians to assign"
      />

      {open ? (
        <div className="absolute left-0 top-full z-30 mt-1 w-full rounded-2xl border border-[var(--co-line)] bg-white p-1.5 shadow-[0_12px_32px_rgba(15,23,20,0.18)]">
          {matches.length ? (
            matches.map((employee) => (
              <button
                key={employee.id}
                type="button"
                onClick={() => add(employee.id)}
                className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-sm hover:bg-[var(--co-surface-muted)]"
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--co-surface-muted)] text-[10px] font-bold text-[var(--co-accent-text)]">
                  {employee.firstName[0]}
                  {employee.lastName[0]}
                </span>
                {employee.firstName} {employee.lastName}
              </button>
            ))
          ) : (
            <p className="px-2.5 py-2 text-xs text-[var(--co-muted)]">{employees.length === selectedIds.length ? "Everyone available is already assigned." : "No technicians match."}</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
