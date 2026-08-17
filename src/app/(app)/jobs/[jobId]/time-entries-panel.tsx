"use client";

import { useState } from "react";
import { CARD_CLASS, formatTime, readableError, toDateTimeInputValue, type Employee, type TimeEntry } from "./types";

/**
 * Office-side time management for a job: record hours manually for an assigned
 * technician, and correct hours that are already logged.
 *
 * Both actions recalculate payroll server-side, so the response tells us how many
 * open payroll periods were refreshed — surfaced here so the office knows the
 * change landed. `onSaved` re-runs the server query for the fresh totals.
 */
export default function TimeEntriesPanel({
  jobId,
  scheduledDate,
  scheduledStartTime,
  assignedEmployees,
  timeEntries,
  editedEntryIds,
  onSaved,
  onError,
}: {
  jobId: string;
  scheduledDate: string;
  scheduledStartTime: string | null;
  assignedEmployees: Employee[];
  timeEntries: TimeEntry[];
  editedEntryIds: string[];
  onSaved: () => void;
  onError: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const [employeeId, setEmployeeId] = useState("");
  const [entryMode, setEntryMode] = useState<"total-hours" | "times">("total-hours");
  const [totalHours, setTotalHours] = useState("");
  const [clockIn, setClockIn] = useState("");
  const [clockOut, setClockOut] = useState("");
  const [notes, setNotes] = useState("");

  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [editClockIn, setEditClockIn] = useState("");
  const [editClockOut, setEditClockOut] = useState("");
  const [editNotes, setEditNotes] = useState("");

  function payrollNotice(body: { payrollPeriodsRefreshed?: unknown[] }) {
    const refreshed = body.payrollPeriodsRefreshed?.length ?? 0;
    return refreshed
      ? `Refreshed ${refreshed} open payroll period${refreshed === 1 ? "" : "s"}.`
      : "Time saved and payroll recalculated.";
  }

  function clearForm() {
    setEmployeeId("");
    setTotalHours("");
    setClockIn("");
    setClockOut("");
    setNotes("");
  }

  async function recordTime() {
    if (!employeeId) {
      onError("Select a technician.");
      return;
    }

    const dateAtTime = (time: string) => {
      const [year, month, day] = scheduledDate.split("-").map(Number);
      const [hours, minutes] = time.split(":").map(Number);
      return new Date(year, month - 1, day, hours, minutes);
    };

    let entryClockIn: Date;
    let entryClockOut: Date;
    if (entryMode === "total-hours") {
      const hours = Number(totalHours);
      const minutesWorked = Math.round(hours * 60);
      if (!Number.isFinite(hours) || hours <= 0 || hours > 16 || minutesWorked <= 0) {
        onError("Enter total hours between 0.01 and 16.");
        return;
      }

      entryClockIn = dateAtTime(scheduledStartTime ?? "09:00");
      entryClockOut = new Date(entryClockIn.getTime() + minutesWorked * 60_000);
    } else {
      if (!clockIn || !clockOut) {
        onError("Enter both start and end times.");
        return;
      }

      entryClockIn = dateAtTime(clockIn);
      entryClockOut = dateAtTime(clockOut);
      if (entryClockOut <= entryClockIn) entryClockOut.setDate(entryClockOut.getDate() + 1);
    }

    setBusy(true);
    const response = await fetch(`/api/jobs/${jobId}/time-entries`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: employeeId,
        clockIn: entryClockIn.toISOString(),
        clockOut: entryClockOut.toISOString(),
        notes: notes || null,
      }),
    });
    const body = await response.json().catch(() => ({}));
    setBusy(false);

    if (!response.ok) {
      onError(readableError(body));
      return;
    }

    clearForm();
    setNotice(payrollNotice(body));
    onSaved();
  }

  function beginEdit(entry: TimeEntry) {
    setEditingEntryId(entry.id);
    setEditClockIn(toDateTimeInputValue(entry.clockIn));
    setEditClockOut(toDateTimeInputValue(entry.clockOut));
    setEditNotes(entry.notes ?? "");
  }

  async function updateTime(entryId: string) {
    if (!editClockIn || !editClockOut) {
      onError("Enter both start and end times.");
      return;
    }

    setBusy(true);
    const response = await fetch(`/api/jobs/${jobId}/time-entries/${entryId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clockIn: new Date(editClockIn).toISOString(),
        clockOut: new Date(editClockOut).toISOString(),
        notes: editNotes || null,
      }),
    });
    const body = await response.json().catch(() => ({}));
    setBusy(false);

    if (!response.ok) {
      onError(readableError(body));
      return;
    }

    setEditingEntryId(null);
    setNotice(payrollNotice(body));
    onSaved();
  }

  return (
    <section id="time-entries" className={CARD_CLASS}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">Time entries</h2>
          <p className="mt-1 text-xs text-[var(--co-muted)]">Log crew hours manually or correct what was clocked.</p>
        </div>
      </div>

      {notice ? (
        <p className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">{notice}</p>
      ) : null}

      <div className="mt-4 overflow-x-auto rounded-xl border border-[#d5ded5]">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="bg-[#f3f7f2] text-xs uppercase tracking-[0.08em] text-[var(--co-muted)]">
            <tr>
              <th className="px-4 py-3">Technician</th>
              <th className="px-4 py-3">Start</th>
              <th className="px-4 py-3">End</th>
              <th className="px-4 py-3">Total</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-[#e2e9e1]">
            {timeEntries.map((entry) => (
              <tr key={entry.id} className="hover:bg-[#f7faf6]">
                <td className="px-4 py-3 font-medium">
                  {entry.firstName} {entry.lastName}
                  {entry.recordedByAdmin ? (
                    <span className="ml-2 rounded-full bg-[#e4eee2] px-2 py-0.5 text-[10px] font-semibold text-[var(--co-accent-text)]">Manual</span>
                  ) : null}
                </td>
                <td className="px-4 py-3 text-[var(--co-muted)]">{formatTime(entry.clockIn)}</td>
                <td className="px-4 py-3 text-[var(--co-muted)]">{entry.clockOut ? formatTime(entry.clockOut) : "Still clocked in"}</td>
                <td className="px-4 py-3 text-[var(--co-muted)]">{((entry.minutesWorked ?? 0) / 60).toFixed(2)} hrs</td>
                <td className="px-4 py-3 text-right">
                  <button
                    type="button"
                    onClick={() => beginEdit(entry)}
                    className="text-xs font-semibold text-[var(--co-accent-text)] hover:underline"
                  >
                    Edit
                  </button>
                  {editedEntryIds.includes(entry.id) ? <span className="ml-2 text-xs text-[var(--co-muted)]">edited</span> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {timeEntries.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-[var(--co-muted)]">No time recorded yet.</p>
        ) : null}
      </div>

      {editingEntryId ? (
        <div className="mt-4 rounded-xl border border-[#cad6ca] bg-[#f7faf6] p-4">
          <p className="text-sm font-semibold">Edit time entry</p>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <input aria-label="Edited clock in" type="datetime-local" value={editClockIn} onChange={(event) => setEditClockIn(event.target.value)} className="co-input" />
            <input aria-label="Edited clock out" type="datetime-local" value={editClockOut} onChange={(event) => setEditClockOut(event.target.value)} className="co-input" />
          </div>
          <input value={editNotes} onChange={(event) => setEditNotes(event.target.value)} placeholder="Note (optional)" className="co-input mt-3 w-full" />
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" disabled={busy} onClick={() => updateTime(editingEntryId)} className="co-button-primary">
              {busy ? "Saving..." : "Save change"}
            </button>
            <button type="button" onClick={() => setEditingEntryId(null)} className="co-button-secondary">
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      <details className="mt-4 rounded-xl border border-[#d5ded5] p-3">
        <summary className="cursor-pointer text-sm font-semibold text-[var(--co-accent-text)]">Add time manually</summary>
        {assignedEmployees.length === 0 ? (
          <p className="mt-3 text-sm text-[var(--co-muted)]">Assign the crew first — manual time is recorded against an assigned technician.</p>
        ) : (
          <>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <fieldset className="flex flex-wrap gap-4 text-sm md:col-span-2">
                <legend className="sr-only">Manual time entry method</legend>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="manual-time-entry-mode"
                    value="total-hours"
                    checked={entryMode === "total-hours"}
                    onChange={() => setEntryMode("total-hours")}
                  />
                  Total hours
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="manual-time-entry-mode"
                    value="times"
                    checked={entryMode === "times"}
                    onChange={() => setEntryMode("times")}
                  />
                  Time in / time out
                </label>
              </fieldset>
              <select aria-label="Technician" value={employeeId} onChange={(event) => setEmployeeId(event.target.value)} className="co-input md:col-span-2">
                <option value="">Select technician</option>
                {assignedEmployees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.firstName} {employee.lastName}
                  </option>
                ))}
              </select>
              {entryMode === "total-hours" ? (
                <input
                  aria-label="Total hours worked"
                  type="number"
                  min="0.01"
                  max="16"
                  step="0.01"
                  inputMode="decimal"
                  value={totalHours}
                  onChange={(event) => setTotalHours(event.target.value)}
                  placeholder="Total hours worked"
                  className="co-input md:col-span-2"
                />
              ) : (
                <>
                  <input aria-label="Clock in" type="time" value={clockIn} onChange={(event) => setClockIn(event.target.value)} className="co-input" />
                  <input aria-label="Clock out" type="time" value={clockOut} onChange={(event) => setClockOut(event.target.value)} className="co-input" />
                </>
              )}
              <input type="text" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Note (optional)" className="co-input md:col-span-2" />
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" disabled={busy} onClick={recordTime} className="co-button-primary">
                {busy ? "Saving..." : "Add manual time"}
              </button>
              <button type="button" onClick={clearForm} className="co-button-secondary">
                Clear
              </button>
            </div>
          </>
        )}
      </details>
    </section>
  );
}
