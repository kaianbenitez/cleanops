"use client";

import { useState } from "react";
import { Phone } from "lucide-react";
import TeamSearchPicker from "@/components/team-search-picker";
import { CARD_CLASS, type Assignment, type Employee } from "./types";

/**
 * Assigned crew for a job, plus the picker that changes it.
 *
 * The picker holds a *draft* selection that only reaches the server on "Save
 * team". The parent remounts this component (via `key`) whenever the saved
 * assignments change, which resets the draft back to server truth — no effect
 * syncing props into state.
 */
export default function TeamPanel({
  employees,
  assignments,
  assignedEmployees,
  saving,
  onSave,
}: {
  employees: Employee[];
  assignments: Assignment[];
  assignedEmployees: Employee[];
  saving: boolean;
  onSave: (employeeIds: string[]) => void;
}) {
  const [selectedIds, setSelectedIds] = useState<string[]>(() => assignments.map((assignment) => assignment.userId));

  return (
    <section id="assignment" className={CARD_CLASS}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold">Assigned team</h2>
        <span className="rounded bg-[#eef1f5] px-2 py-1 text-xs font-bold text-slate-600">
          {assignedEmployees.length ? `${assignedEmployees.length} assigned` : "Unassigned"}
        </span>
      </div>

      <div className="mt-4 space-y-3">
        {assignedEmployees.length ? (
          assignedEmployees.map((employee) => (
            <div key={employee.id} className="flex items-center gap-3 rounded-xl border border-[#d5ded5] p-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#e4eee2] text-xs font-bold text-[var(--co-evergreen)]">
                {employee.firstName[0]}
                {employee.lastName[0]}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{employee.firstName} {employee.lastName}</p>
                <p className="text-xs text-[var(--co-muted)]">
                  {assignments.find((assignment) => assignment.userId === employee.id)?.role === "lead"
                    ? "Team lead"
                    : "Cleaning professional"}
                </p>
              </div>
              <span aria-hidden className="rounded-full bg-[#f0f5ef] p-2 text-[var(--co-evergreen)]">
                <Phone className="h-4 w-4" />
              </span>
            </div>
          ))
        ) : (
          <p className="rounded-xl border border-dashed border-[#cad6ca] p-4 text-sm text-[var(--co-muted)]">
            No one is assigned yet. Use Reassign to choose the crew.
          </p>
        )}
      </div>

      <details className="mt-4 rounded-xl border border-[#d5ded5] p-3">
        <summary className="cursor-pointer text-sm font-semibold text-[var(--co-evergreen)]">Manage assignment</summary>
        <div className="mt-3">
          <TeamSearchPicker employees={employees} selectedIds={selectedIds} onChange={setSelectedIds} />
        </div>
        <button type="button" disabled={saving} onClick={() => onSave(selectedIds)} className="co-button-primary mt-3">
          {saving ? "Saving..." : "Save team"}
        </button>
      </details>
    </section>
  );
}
