"use client";

import { useEffect, useRef, useState } from "react";

type Employee = { id: string; firstName: string; lastName: string; isActive?: boolean };

export default function AssigneePicker({
  employees,
  assignedUserIds,
  onChange,
  disabled,
  ariaLabel,
  className,
}: {
  employees: Employee[];
  assignedUserIds: string[];
  onChange: (orderedIds: string[]) => void;
  disabled?: boolean;
  ariaLabel?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onMouseDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function toggle(employeeId: string) {
    if (assignedUserIds.includes(employeeId)) {
      onChange(assignedUserIds.filter((id) => id !== employeeId));
    } else {
      onChange([...assignedUserIds, employeeId]);
    }
  }

  function makeLead(employeeId: string) {
    if (assignedUserIds[0] === employeeId) return;
    onChange([employeeId, ...assignedUserIds.filter((id) => id !== employeeId)]);
  }

  const assignedEmployees = assignedUserIds.map((id) => employees.find((employee) => employee.id === id)).filter((employee): employee is Employee => Boolean(employee));

  const summary =
    assignedEmployees.length === 0
      ? "Unassigned"
      : assignedEmployees.length === 1
        ? `${assignedEmployees[0].firstName} ${assignedEmployees[0].lastName}`
        : `${assignedEmployees[0].firstName} ${assignedEmployees[0].lastName} +${assignedEmployees.length - 1}`;

  const matchingEmployees = employees.filter((employee) => {
    if (employee.isActive === false && !assignedUserIds.includes(employee.id)) return false;
    const name = `${employee.firstName} ${employee.lastName}`.toLowerCase();
    return name.includes(query.trim().toLowerCase());
  });

  return (
    <div ref={containerRef} className="relative inline-block">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        aria-label={ariaLabel}
        className={`co-input flex min-w-[9rem] items-center justify-between gap-2 py-1.5 text-left text-xs disabled:cursor-not-allowed disabled:opacity-60 ${className ?? ""}`}
      >
        <span className="truncate">{summary}</span>
        <span className="text-[var(--co-muted)]">▾</span>
      </button>

      {open ? (
        <div className="absolute left-0 top-full z-50 mt-1 w-64 rounded-2xl border border-[var(--co-line)] bg-white p-2 shadow-[0_12px_32px_rgba(15,23,20,0.18)]">
          <p className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--co-muted)]">Assign crew</p>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search cleaners"
            aria-label="Search cleaners"
            autoFocus
            className="co-input mb-2 w-full py-1.5 text-xs"
          />
          <div className="max-h-64 space-y-0.5 overflow-y-auto">
            {matchingEmployees.length ? (
              matchingEmployees.map((employee) => {
                const checked = assignedUserIds.includes(employee.id);
                const isLead = assignedUserIds[0] === employee.id;
                return (
                  <div key={employee.id} className="flex items-center gap-2 rounded-xl px-1.5 py-1 hover:bg-[var(--co-surface-muted)]/70">
                    <button
                      type="button"
                      onClick={() => toggle(employee.id)}
                      aria-pressed={checked}
                      className="flex flex-1 items-center gap-2 rounded-lg px-1 py-1 text-left text-xs"
                    >
                      <span className="truncate">
                        {employee.firstName} {employee.lastName}
                        {employee.isActive === false ? <span className="ml-1 text-[10px] font-semibold uppercase tracking-[0.04em] text-[var(--co-muted)]">Inactive</span> : null}
                      </span>
                      {checked ? <span className="ml-auto shrink-0 text-[10px] font-semibold text-[var(--co-evergreen)]">Assigned</span> : null}
                    </button>
                    {checked ? (
                      <button
                        type="button"
                        onClick={() => makeLead(employee.id)}
                        disabled={isLead}
                        className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                          isLead
                            ? "border-[var(--co-evergreen)] bg-[var(--co-surface-muted)] text-[var(--co-evergreen)]"
                            : "border-[var(--co-line-soft)] text-[var(--co-muted)] hover:border-[var(--co-line)]"
                        }`}
                      >
                        {isLead ? "Lead" : "Set lead"}
                      </button>
                    ) : null}
                  </div>
                );
              })
            ) : (
              <p className="px-1 py-2 text-xs text-[var(--co-muted)]">No cleaners match your search.</p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
