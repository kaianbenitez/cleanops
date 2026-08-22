"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useDialogFocus } from "./dialog-focus";

type Employee = { id: string; firstName: string; lastName: string; isActive?: boolean };

const TYPES = [
  { value: "first_clean", label: "First clean" },
  { value: "recurring", label: "Recurring" },
  { value: "one_time", label: "One-time" },
  { value: "deep_clean", label: "Deep clean" },
  { value: "move_out", label: "Move in/out" },
] as const;

const RECURRENCES = [
  { value: "recurring", label: "Recurring (any frequency)" },
  { value: "weekly", label: "Weekly" },
  { value: "biweekly", label: "Biweekly" },
  { value: "every4weeks", label: "Every 4 weeks" },
  { value: "monthly", label: "Monthly" },
  { value: "custom", label: "Custom recurring" },
  { value: "none", label: "One-time" },
] as const;

const STATUSES = [
  { value: "scheduled", label: "Scheduled" },
  { value: "in_progress", label: "In progress" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
  { value: "no_show", label: "No show" },
] as const;

/** Owns every job-list filter field (employee, status, recurrence, service
 * type, assignment, ZIP) behind the Filters button in filter-bar.tsx. Routing
 * is self-contained here rather than threaded through the trigger, matching
 * date-picker.tsx's existing pattern. */
export default function CalendarFiltersPanel({
  employees,
  open,
  onClose,
  triggerRef,
}: {
  employees: Employee[];
  open: boolean;
  onClose: () => void;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const panelRef = useRef<HTMLDivElement>(null);
  const dialogFocusRef = useDialogFocus<HTMLDivElement>(open);
  const zip = searchParams.get("zip") ?? "";
  const [dialogPosition, setDialogPosition] = useState({ top: 0, right: 0 });

  useEffect(() => {
    if (!open) return;
    function onMouseDown(event: MouseEvent) {
      const target = event.target as Node;
      if (!panelRef.current?.contains(target) && !triggerRef.current?.contains(target)) onClose();
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
        triggerRef.current?.focus();
      }
    }
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose, triggerRef]);

  // Same createPortal + getBoundingClientRect + fixed pattern date-picker.tsx
  // uses, so the popover escapes page.tsx's overflow-hidden co-card section
  // instead of being clipped by it. Anchored on the trigger's right edge
  // (via a CSS `right` offset) rather than `left`, matching the panel's
  // original right-aligned position relative to the Filters button.
  useEffect(() => {
    if (!open) return;
    function updateDialogPosition() {
      const bounds = triggerRef.current?.getBoundingClientRect();
      if (bounds) setDialogPosition({ top: bounds.bottom + 8, right: window.innerWidth - bounds.right });
    }
    updateDialogPosition();
    window.addEventListener("resize", updateDialogPosition);
    window.addEventListener("scroll", updateDialogPosition, true);
    return () => {
      window.removeEventListener("resize", updateDialogPosition);
      window.removeEventListener("scroll", updateDialogPosition, true);
    };
  }, [open, triggerRef]);

  if (!open) return null;

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    router.push(`${pathname}?${params.toString()}`);
  }

  const employeeId = searchParams.get("employeeId") ?? "";
  const type = searchParams.get("type") ?? "";
  const recurrence = searchParams.get("recurrence") ?? "";
  const status = searchParams.get("status") ?? "";
  const assignment = searchParams.get("assignment") ?? "";

  const panel = (
    <div
      ref={(node) => {
        panelRef.current = node;
        dialogFocusRef.current = node;
      }}
      tabIndex={-1}
      role="dialog"
      aria-label="Calendar filters"
      style={dialogPosition}
      className="co-date-popover fixed z-[60] w-[min(22rem,calc(100vw-2rem))] space-y-3 p-4"
    >
      <select aria-label="Technician" value={employeeId} onChange={(event) => setParam("employeeId", event.target.value)} className="co-input w-full py-2 text-sm">
        <option value="">All technicians</option>
        {employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.firstName} {employee.lastName}{employee.isActive === false ? " (Inactive)" : ""}</option>)}
      </select>

      <select aria-label="Status" value={status} onChange={(event) => setParam("status", event.target.value)} className="co-input w-full py-2 text-sm">
        <option value="">All statuses</option>
        {STATUSES.map((entry) => <option key={entry.value} value={entry.value}>{entry.label}</option>)}
      </select>

      <select aria-label="Assignment" value={assignment} onChange={(event) => setParam("assignment", event.target.value)} className="co-input w-full py-2 text-sm">
        <option value="">All jobs</option>
        <option value="unassigned">Unassigned only</option>
      </select>

      <select aria-label="Recurrence" value={recurrence} onChange={(event) => setParam("recurrence", event.target.value)} className="co-input w-full py-2 text-sm">
        <option value="">All recurrence</option>
        {RECURRENCES.map((entry) => <option key={entry.value} value={entry.value}>{entry.label}</option>)}
      </select>

      <select aria-label="Service type" value={type} onChange={(event) => setParam("type", event.target.value)} className="co-input w-full py-2 text-sm">
        <option value="">All service types</option>
        {TYPES.map((entry) => <option key={entry.value} value={entry.value}>{entry.label}</option>)}
      </select>

      <input
        key={`zip-${zip}`}
        aria-label="ZIP code"
        defaultValue={zip}
        onBlur={(event) => setParam("zip", event.target.value.trim())}
        onKeyDown={(event) => event.key === "Enter" && setParam("zip", event.currentTarget.value.trim())}
        placeholder="ZIP code"
        className="co-input w-full py-2 text-sm"
      />

      <button type="button" onClick={onClose} className="co-button-secondary w-full">
        Done
      </button>
    </div>
  );

  return createPortal(panel, document.body);
}
