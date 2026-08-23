"use client";

import { useEffect, useId, useRef, useState } from "react";

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
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popupId = useId();

  useEffect(() => {
    if (!open) return;
    function onMouseDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
        return;
      }
      if (event.key !== "Tab" || !containerRef.current) return;
      const focusable = Array.from(containerRef.current.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled])"));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
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

  function assignFromSearch(employeeId: string) {
    toggle(employeeId);
    setQuery("");
    setOpen(false);
    triggerRef.current?.focus();
  }

  function makeLead(employeeId: string) {
    if (assignedUserIds[0] === employeeId) return;
    onChange([employeeId, ...assignedUserIds.filter((id) => id !== employeeId)]);
  }

  const assignedEmployees = assignedUserIds.map((id) => employees.find((employee) => employee.id === id)).filter((employee): employee is Employee => Boolean(employee));

  const summary =
    assignedEmployees.length === 0
      ? "Crew not assigned"
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
        ref={triggerRef}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        aria-label={ariaLabel}
        aria-controls={popupId}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={`co-input flex min-w-[9rem] items-center justify-between gap-2 py-1.5 text-left text-xs disabled:cursor-not-allowed disabled:opacity-60 ${className ?? ""}`}
      >
        <span className="truncate">{summary}</span>
        <span className="text-[var(--co-muted)]">▾</span>
      </button>

      {open ? (
        <div id={popupId} role="dialog" aria-label="Assign crew" className="absolute left-0 top-full z-50 mt-1 w-64 rounded-2xl border border-[var(--co-line)] bg-[var(--co-surface)] p-2 shadow-[var(--co-shadow-popover)]">
          <p className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--co-muted)]">Assign crew</p>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              event.preventDefault();
              const firstMatch = matchingEmployees.find((employee) => !assignedUserIds.includes(employee.id));
              if (firstMatch) assignFromSearch(firstMatch.id);
              else setOpen(false);
            }}
            placeholder="Search crew members"
            aria-label="Search crew members"
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
                      onClick={() => assignFromSearch(employee.id)}
                      aria-pressed={checked}
                      className="flex min-h-11 flex-1 items-center gap-2 rounded-lg px-2 py-2 text-left text-xs"
                    >
                      <span className="truncate">
                        {employee.firstName} {employee.lastName}
                        {employee.isActive === false ? <span className="ml-1 text-[10px] font-semibold uppercase tracking-[0.04em] text-[var(--co-muted)]">Inactive</span> : null}
                      </span>
                      {checked ? <span className="ml-auto shrink-0 text-[10px] font-semibold text-[var(--co-accent-text)]">Assigned</span> : null}
                    </button>
                    {checked ? (
                      <button
                        type="button"
                        onClick={() => makeLead(employee.id)}
                        disabled={isLead}
                        className={`flex min-h-11 shrink-0 items-center rounded-full border px-3 py-1 text-xs font-medium ${
                          isLead
                            ? "border-[var(--co-accent-text)] bg-[var(--co-surface-muted)] text-[var(--co-accent-text)]"
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
              <p className="px-1 py-2 text-xs text-[var(--co-muted)]">No crew members match your search.</p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
