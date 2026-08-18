"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, ChevronLeft, ChevronRight } from "lucide-react";
import { DateInput } from "@/components/date-input";
import { commitJobPatch, type JobPatch } from "./drag-commit";
import { displayCustomer, formatEstimatedTime, TYPE_LABELS } from "./shared";
import { formatDisplayDate, toISODate, addDays } from "@/lib/scheduling/dates";
import type { EmployeePtoRecord, PtoPeriod } from "@/lib/scheduling/pto";

type Employee = { id: string; firstName: string; lastName: string; isActive?: boolean };

export type MoveAssignJob = {
  id: string;
  status: string;
  type: string;
  scheduledDate: string;
  scheduledStartTime: string | null;
  estimatedDurationMinutes: number | null;
  customerFirstName: string;
  customerLastName: string;
  companyName: string | null;
  customerAddress: string | null;
  customerCity: string | null;
  assignedUserIds: string[];
};

type ArrivalWindow = "morning" | "afternoon";

const WINDOW_START_MINUTES: Record<ArrivalWindow, number> = { morning: 9 * 60, afternoon: 13 * 60 };
const WINDOW_DEFAULT_TIME: Record<ArrivalWindow, string> = { morning: "09:00:00", afternoon: "13:00:00" };
const LOCKED_STATUSES = ["completed", "cancelled", "no_show"];

function windowFor(time: string | null): ArrivalWindow | null {
  if (!time) return null;
  return time.slice(0, 5) < "12:00" ? "morning" : "afternoon";
}

function clockLabel(totalMinutes: number) {
  const hour24 = Math.floor(totalMinutes / 60);
  const minute = Math.round(totalMinutes % 60);
  const hour12 = ((hour24 + 11) % 12) + 1;
  const suffix = hour24 < 12 ? "AM" : "PM";
  return `${hour12}:${String(minute).padStart(2, "0")} ${suffix}`;
}

function joinNames(names: string[]) {
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

/** The one non-drag path for every scheduling change: assign, reassign, move
 * date, or move arrival window. Nothing here writes until Confirm — cross-
 * cleaner drag opens this with `targetEmployeeId` set and performs zero
 * requests before that. Uses the existing `PATCH /api/jobs/[jobId]` contract
 * exclusively (no second mutation endpoint). */
export default function MoveAssignPanel({
  job,
  employees,
  dayJobs,
  ptoRecords,
  ptoDayIso,
  todayIso,
  targetEmployeeId,
  onClose,
  onSaved,
}: {
  job: MoveAssignJob;
  employees: Employee[];
  /** Other jobs already on the *original* day, for the crew-conflict hint. */
  dayJobs: { id: string; scheduledStartTime: string | null; assignedUserIds: string[]; customerFirstName: string; customerLastName: string; companyName: string | null }[];
  /** PTO records covering `ptoDayIso` — badges degrade gracefully once the
   * draft date is moved away from it (see the note rendered below the list). */
  ptoRecords: EmployeePtoRecord[];
  ptoDayIso: string;
  /** Company-timezone "today", computed server-side — never derive today
   * from the browser's clock here (see HANDOFF.calendar-audit.md Task 2). */
  todayIso: string;
  targetEmployeeId?: string | null;
  onClose: () => void;
  onSaved: (patch: JobPatch, previous: JobPatch) => void;
}) {
  const isLocked = LOCKED_STATUSES.includes(job.status);
  const initialWindow = windowFor(job.scheduledStartTime);
  const [draftDate, setDraftDate] = useState(job.scheduledDate);
  const [draftWindow, setDraftWindow] = useState<ArrivalWindow | null>(initialWindow);
  const [draftTime, setDraftTime] = useState(job.scheduledStartTime);
  const [assignedIds, setAssignedIds] = useState(job.assignedUserIds);
  const [changeType, setChangeType] = useState<"move" | "add" | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const launchedFromDrop = Boolean(targetEmployeeId);

  useEffect(() => {
    const launchingElement = document.activeElement as HTMLElement | null;
    closeButtonRef.current?.focus();
    return () => {
      launchingElement?.focus?.();
    };
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onClose();
    }
    function trapFocus(event: KeyboardEvent) {
      if (event.key !== "Tab" || !panelRef.current) return;
      const focusable = panelRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
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
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("keydown", trapFocus);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("keydown", trapFocus);
    };
  }, [onClose]);

  function selectWindow(next: ArrivalWindow) {
    setValidationError(null);
    if (next === draftWindow) return;
    setDraftWindow(next);
    setDraftTime(WINDOW_DEFAULT_TIME[next]);
  }

  function toggleEmployee(employeeId: string) {
    setAssignedIds((current) =>
      current.includes(employeeId) ? current.filter((id) => id !== employeeId) : [...current, employeeId],
    );
  }

  function applyChangeType(next: "move" | "add") {
    setChangeType(next);
    if (!targetEmployeeId) return;
    setAssignedIds(next === "move" ? [targetEmployeeId] : Array.from(new Set([...job.assignedUserIds, targetEmployeeId])));
  }

  const eligibleEmployees = employees.filter(
    (employee) => employee.isActive !== false || assignedIds.includes(employee.id),
  );
  const crewNames = assignedIds
    .map((id) => employees.find((employee) => employee.id === id))
    .filter((employee): employee is Employee => Boolean(employee))
    .map((employee) => `${employee.firstName} ${employee.lastName}${employee.isActive === false ? " (inactive)" : ""}`);

  const ptoAvailableForDraftDate = draftDate === ptoDayIso;
  const ptoByEmployee = new Map<string, PtoPeriod>();
  if (ptoAvailableForDraftDate) {
    for (const pto of ptoRecords) {
      if (pto.startDate > draftDate || pto.endDate < draftDate) continue;
      const period: PtoPeriod =
        pto.startDate === pto.endDate ? (pto.startPeriod === pto.endPeriod ? pto.startPeriod : "full") : pto.startDate === draftDate ? pto.startPeriod : pto.endDate === draftDate ? pto.endPeriod : "full";
      ptoByEmployee.set(pto.userId, period);
    }
  }
  const conflictByEmployee = new Map<string, string>();
  if (draftDate === job.scheduledDate && draftWindow) {
    for (const other of dayJobs) {
      if (other.id === job.id) continue;
      const otherWindow = windowFor(other.scheduledStartTime);
      if (otherWindow !== draftWindow) continue;
      const otherName = other.companyName?.trim() || `${other.customerFirstName} ${other.customerLastName}`;
      for (const employeeId of other.assignedUserIds) conflictByEmployee.set(employeeId, otherName);
    }
  }

  const durationLabel = formatEstimatedTime(job.estimatedDurationMinutes);
  const elapsedMinutes =
    job.estimatedDurationMinutes && assignedIds.length ? job.estimatedDurationMinutes / assignedIds.length : null;
  const finishLabel =
    draftWindow && elapsedMinutes
      ? clockLabel(WINDOW_START_MINUTES[draftWindow] + elapsedMinutes)
      : null;
  const reviewSentence = `Move ${displayCustomer(job)} to ${formatDisplayDate(draftDate)}${
    draftWindow ? `, ${draftWindow === "morning" ? "in the morning" : "in the afternoon"}` : ", with no arrival window chosen yet"
  }${crewNames.length ? ` with ${joinNames(crewNames)}` : ", unassigned"}.${finishLabel ? ` Expected finish: about ${finishLabel}.` : ""}`;

  function shiftDay(deltaDays: number) {
    setDraftDate(toISODate(addDays(new Date(`${draftDate}T00:00:00.000Z`), deltaDays)));
  }

  async function confirm() {
    if (!draftWindow) {
      setValidationError("Choose Morning or Afternoon before confirming.");
      return;
    }
    if (launchedFromDrop && !changeType) {
      setValidationError("Choose Move to this cleaner or Add to current crew.");
      return;
    }
    setValidationError(null);
    const patch: JobPatch = {
      scheduledDate: draftDate,
      scheduledStartTime: draftTime,
      employeeIds: assignedIds,
    };
    const previous: JobPatch = {
      scheduledDate: job.scheduledDate,
      scheduledStartTime: job.scheduledStartTime,
      employeeIds: job.assignedUserIds,
    };
    let hadWarning = false;
    const ok = await commitJobPatch(job.id, patch, {
      onOptimistic: () => {
        setSaving(true);
        setError(null);
        setWarning(null);
      },
      onWarning: (message) => {
        hadWarning = true;
        setWarning(message);
      },
      onError: setError,
      onSettled: () => setSaving(false),
    });
    if (!ok) return;
    onSaved(patch, previous);
    // A soft double-booking warning already saved server-side (see
    // route.ts) — keep the panel open so the coordinator can see and act on
    // it, matching how JobDetailPanel/UnassignedPanel already handle this
    // response shape. A clean save closes the panel.
    if (!hadWarning) onClose();
  }

  const dateLabel = formatDisplayDate(job.scheduledDate);
  const windowLabel = initialWindow === "morning" ? "morning" : initialWindow === "afternoon" ? "afternoon" : "no arrival window set";
  const currentCrewLabel = job.assignedUserIds.length
    ? joinNames(
        job.assignedUserIds
          .map((id) => employees.find((employee) => employee.id === id))
          .filter((employee): employee is Employee => Boolean(employee))
          .map((employee) => `${employee.firstName} ${employee.lastName}`),
      )
    : "Unassigned";
  const location = [job.customerAddress, job.customerCity].filter(Boolean).join(", ");

  return (
    <div className="fixed inset-0 z-40 flex justify-end" role="presentation">
      <button type="button" aria-label="Close move or assign panel" onClick={onClose} className="absolute inset-0 bg-black/30" />
      <aside
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Move or assign job"
        className="relative flex h-full w-full max-w-lg flex-col overflow-y-auto border-l border-[var(--co-line)] bg-[var(--co-surface)] shadow-[0_0_60px_rgba(15,23,20,0.25)]"
      >
        <div className="flex items-start justify-between gap-3 border-b border-[var(--co-line-soft)] px-5 py-4">
          <div>
            <p className="eyebrow">Move or assign</p>
            <h2 className="mt-1 text-lg font-semibold">{displayCustomer(job)}</h2>
          </div>
          <button ref={closeButtonRef} type="button" onClick={onClose} className="min-h-11 min-w-11 rounded-full text-[var(--co-muted)] hover:bg-[var(--co-surface-muted)]" aria-label="Close">
            ✕
          </button>
        </div>

        <div className="flex-1 space-y-5 px-5 py-5 text-[15px]">
          {isLocked ? (
            <p role="alert" className="co-badge-warning px-3 py-2 text-sm font-medium">
              This job is {job.status === "completed" ? "completed" : job.status === "cancelled" ? "cancelled" : "marked no-show"} and can’t be rescheduled.
            </p>
          ) : null}

          <section className="rounded-xl border border-[var(--co-line-soft)] bg-[var(--co-surface-muted)]/50 p-3.5">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--co-muted)]">Job being changed</p>
            <p className="mt-1.5 text-sm font-semibold text-[var(--co-ink)]">{displayCustomer(job)}</p>
            <p className="mt-0.5 text-sm text-[var(--co-muted)]">{location || "No address on file"}</p>
            <p className="mt-1 text-sm text-[var(--co-muted)]">{TYPE_LABELS[job.type] ?? job.type} · {durationLabel}</p>
            <p className="mt-1 text-sm text-[var(--co-muted)]">Currently {dateLabel}, {windowLabel} · {currentCrewLabel}</p>
          </section>

          {error ? (
            <p role="alert" className="flex items-start gap-2 rounded-lg border border-[var(--co-danger)]/30 bg-[var(--co-danger)]/10 px-3 py-2 text-sm font-medium text-[var(--co-danger)]">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <span>
                {error}{" "}
                <button type="button" onClick={confirm} className="font-semibold underline">
                  Try again
                </button>
              </span>
            </p>
          ) : null}
          {warning ? (
            <p role="status" className="co-badge-warning px-3 py-2 text-sm font-medium">
              Saved, with a scheduling warning: {warning}
            </p>
          ) : null}
          {validationError ? <p role="alert" className="text-sm font-medium text-[var(--co-danger)]">{validationError}</p> : null}

          <fieldset disabled={isLocked} className="space-y-2">
            <legend className="text-sm font-semibold text-[var(--co-ink)]">Date</legend>
            <div className="flex items-center gap-2">
              <button type="button" aria-label="One day earlier" onClick={() => shiftDay(-1)} className="co-button-secondary min-h-11 w-11 !px-0">
                <ChevronLeft className="h-4 w-4" aria-hidden />
              </button>
              <div className="flex-1">
                <DateInput value={draftDate} onChange={(value) => value && setDraftDate(value)} />
              </div>
              <button type="button" aria-label="One day later" onClick={() => shiftDay(1)} className="co-button-secondary min-h-11 w-11 !px-0">
                <ChevronRight className="h-4 w-4" aria-hidden />
              </button>
              <button type="button" onClick={() => setDraftDate(todayIso)} className="co-button-secondary min-h-11">
                Today
              </button>
            </div>
          </fieldset>

          <fieldset disabled={isLocked} className="space-y-2">
            <legend className="text-sm font-semibold text-[var(--co-ink)]">Arrival window</legend>
            <div className="grid grid-cols-2 gap-2">
              {(["morning", "afternoon"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={draftWindow === option}
                  onClick={() => selectWindow(option)}
                  className={`min-h-16 rounded-xl border-2 px-3 py-3 text-left text-sm font-semibold transition ${
                    draftWindow === option
                      ? "border-[var(--co-accent-text)] bg-[var(--co-accent-tint)] text-[var(--co-accent-text)]"
                      : "border-[var(--co-line)] text-[var(--co-ink)] hover:border-[var(--co-line-soft)]"
                  }`}
                >
                  {option === "morning" ? "Morning" : "Afternoon"}
                  <span className="mt-0.5 block text-xs font-medium text-[var(--co-muted)]">
                    {option === "morning" ? "9:00–9:30 AM arrival" : "1:00–1:30 PM arrival"}
                  </span>
                </button>
              ))}
            </div>
            {draftTime ? (
              <p className="text-xs text-[var(--co-muted)]">Exact time on file: {draftTime.slice(0, 5)}</p>
            ) : null}
          </fieldset>

          {launchedFromDrop ? (
            <fieldset disabled={isLocked} className="space-y-2">
              <legend className="text-sm font-semibold text-[var(--co-ink)]">Change type</legend>
              <div className="grid grid-cols-1 gap-2">
                <label className={`flex min-h-11 items-center gap-2 rounded-lg border px-3 py-2 text-sm ${changeType === "move" ? "border-[var(--co-accent-text)] bg-[var(--co-accent-tint)]" : "border-[var(--co-line)]"}`}>
                  <input type="radio" name="change-type" checked={changeType === "move"} onChange={() => applyChangeType("move")} className="h-4 w-4" />
                  Move to this cleaner — replace the existing crew
                </label>
                <label className={`flex min-h-11 items-center gap-2 rounded-lg border px-3 py-2 text-sm ${changeType === "add" ? "border-[var(--co-accent-text)] bg-[var(--co-accent-tint)]" : "border-[var(--co-line)]"}`}>
                  <input type="radio" name="change-type" checked={changeType === "add"} onChange={() => applyChangeType("add")} className="h-4 w-4" />
                  Add to current crew — keep everyone already assigned
                </label>
              </div>
            </fieldset>
          ) : null}

          <fieldset disabled={isLocked} className="space-y-2">
            <legend className="text-sm font-semibold text-[var(--co-ink)]">Crew</legend>
            {eligibleEmployees.length === 0 ? (
              <p className="text-sm text-[var(--co-muted)]">No active cleaners on this team yet.</p>
            ) : (
              <div className="max-h-64 space-y-1 overflow-y-auto rounded-lg border border-[var(--co-line-soft)] p-1.5">
                {eligibleEmployees.map((employee) => {
                  const checked = assignedIds.includes(employee.id);
                  const ptoPeriod = ptoByEmployee.get(employee.id);
                  const conflictWith = conflictByEmployee.get(employee.id);
                  return (
                    <label key={employee.id} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 hover:bg-[var(--co-surface-muted)]/70">
                      <input type="checkbox" checked={checked} onChange={() => toggleEmployee(employee.id)} className="h-4 w-4" />
                      <span className="flex-1 text-sm">
                        {employee.firstName} {employee.lastName}
                        {employee.isActive === false ? <span className="ml-1 text-xs font-semibold text-[var(--co-muted)]">(Inactive)</span> : null}
                      </span>
                      {ptoPeriod ? (
                        <span className="co-badge-warning shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold">
                          PTO{ptoPeriod === "full" ? "" : ` · ${ptoPeriod}`}
                        </span>
                      ) : null}
                      {conflictWith ? (
                        <span className="co-badge-danger shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold">
                          Also on {conflictWith}
                        </span>
                      ) : null}
                    </label>
                  );
                })}
              </div>
            )}
            {!ptoAvailableForDraftDate ? (
              <p className="text-xs text-[var(--co-muted)]">Time off shown is for the originally scheduled date only — the server still checks the new date before saving.</p>
            ) : null}
          </fieldset>

          <section aria-live="polite" className="rounded-xl border border-[var(--co-accent-text)]/30 bg-[var(--co-accent-tint)] p-3.5 text-sm font-medium text-[var(--co-ink)]">
            {reviewSentence}
          </section>
        </div>

        <div className="flex gap-2 border-t border-[var(--co-line-soft)] px-5 py-4">
          <button type="button" onClick={onClose} className="co-button-secondary flex-1">
            Cancel
          </button>
          <button type="button" disabled={isLocked || saving} onClick={confirm} className="co-button-primary flex-1 disabled:opacity-50">
            {saving ? "Saving…" : "Confirm schedule"}
          </button>
        </div>
      </aside>
    </div>
  );
}
