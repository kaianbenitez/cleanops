"use client";

import { useEffect, useRef, useState } from "react";

type Employee = { id: string; firstName: string; lastName: string };

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
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onMouseDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
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
          <div className="max-h-64 space-y-0.5 overflow-y-auto">
            {employees.map((employee) => {
              const checked = assignedUserIds.includes(employee.id);
              const isLead = assignedUserIds[0] === employee.id;
              return (
                <div key={employee.id} className="flex items-center gap-2 rounded-xl px-1.5 py-1 hover:bg-[var(--co-surface-muted)]/70">
                  <label className="flex flex-1 cursor-pointer items-center gap-2 text-xs">
                    <input type="checkbox" checked={checked} onChange={() => toggle(employee.id)} className="h-3.5 w-3.5 accent-[var(--co-evergreen)]" />
                    <span className="truncate">
                      {employee.firstName} {employee.lastName}
                    </span>
                  </label>
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
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
