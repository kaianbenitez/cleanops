"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { DateInput } from "@/components/date-input";
import { TimeInput } from "@/components/time-input";
import AttendeePicker from "./attendee-picker";

type StaffMember = { id: string; firstName: string; lastName: string };

type AppointmentForm = {
  title: string;
  scheduledDate: string;
  startTime: string;
  durationMinutes: number;
  employeeIds: string[];
  note: string;
};

const DURATION_OPTIONS = [
  { value: 30, label: "30 min" },
  { value: 60, label: "1 hour" },
  { value: 90, label: "1.5 hours" },
  { value: 120, label: "2 hours" },
];

function emptyForm(defaultDate: string): AppointmentForm {
  return { title: "", scheduledDate: defaultDate, startTime: "09:00", durationMinutes: 60, employeeIds: [], note: "" };
}

export default function AppointmentPanel({
  mode,
  kind = "meeting",
  eventId,
  staffRoster,
  defaultDate,
  onClose,
}: {
  mode: "create" | "edit";
  kind?: "meeting" | "blocker";
  eventId?: string;
  staffRoster: StaffMember[];
  defaultDate: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [form, setForm] = useState<AppointmentForm>(() => emptyForm(defaultDate));
  const [appointmentKind, setAppointmentKind] = useState(kind);
  const [status, setStatus] = useState<string>("scheduled");
  const [loading, setLoading] = useState(mode === "edit");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [cancellationReason, setCancellationReason] = useState("");

  useEffect(() => {
    if (mode !== "edit" || !eventId) return;
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/calendar-events/${eventId}`);
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok || !data.event) {
          setError("Couldn't load this appointment.");
          return;
        }
        setForm({
          title: data.event.title,
          scheduledDate: data.event.scheduledDate,
          startTime: data.event.startTime?.slice(0, 5) ?? "09:00",
          durationMinutes: data.event.durationMinutes ?? 60,
          employeeIds: data.event.employeeIds ?? [],
          note: data.event.note ?? "",
        });
        setAppointmentKind(data.event.category === "reminder" ? "blocker" : "meeting");
        setStatus(data.event.status);
      } catch {
        if (!cancelled) setError("Couldn't load this appointment.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load resolves asynchronously.
    load();
    return () => {
      cancelled = true;
    };
  }, [mode, eventId]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  async function save() {
    if (!form.title.trim()) {
      setError(`Enter a ${appointmentKind === "blocker" ? "reason" : "title"} for this appointment.`);
      return;
    }
    if (appointmentKind === "blocker" && form.employeeIds.length !== 1) {
      setError("Choose the cleaner whose day should be blocked.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const body = {
        title: form.title.trim(),
        scheduledDate: form.scheduledDate,
        isAllDay: false,
        startTime: form.startTime,
        durationMinutes: form.durationMinutes,
        employeeIds: form.employeeIds,
        note: form.note.trim() || null,
        ...(mode === "create"
          ? { category: appointmentKind === "blocker" ? ("reminder" as const) : ("meeting" as const) }
          : {}),
      };
      const res = await fetch(mode === "create" ? "/api/calendar-events" : `/api/calendar-events/${eventId}`, {
        method: mode === "create" ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error?.formErrors?.[0] ?? data.error ?? "Couldn't save this appointment.");
        return;
      }
      router.refresh();
      onClose();
    } catch {
      setError("Couldn't save this appointment.");
    } finally {
      setSaving(false);
    }
  }

  async function confirmCancel() {
    if (!cancellationReason.trim()) {
      setError("Enter a reason before cancelling this appointment.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/calendar-events/${eventId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "cancelled", note: cancellationReason.trim() }),
      });
      if (!res.ok) {
        setError("Couldn't cancel this appointment.");
        return;
      }
      router.refresh();
      onClose();
    } catch {
      setError("Couldn't cancel this appointment.");
    } finally {
      setSaving(false);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-40 flex justify-end">
      <button type="button" aria-label="Close appointment panel" onClick={onClose} className="absolute inset-0 bg-black/30" />
      <aside className="relative flex h-full w-full max-w-md flex-col overflow-y-auto border-l border-[var(--co-line)] bg-[var(--co-surface)] shadow-[0_0_60px_rgba(15,23,20,0.25)]">
        <div className="flex items-start justify-between gap-3 border-b border-[var(--co-line-soft)] px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold">
              {mode === "create"
                ? appointmentKind === "blocker"
                  ? "Block time"
                  : "New appointment"
                : "Edit appointment"}
            </h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-1 text-[var(--co-muted)] hover:bg-[var(--co-surface-muted)]" aria-label="Close">
            ✕
          </button>
        </div>

        {loading ? (
          <div className="p-5 text-sm text-[var(--co-muted)]">Loading...</div>
        ) : (
          <div className="flex-1 space-y-5 px-5 py-5">
            {error ? <p className="text-xs font-medium text-[var(--co-danger)]">{error}</p> : null}
            {status === "cancelled" ? (
              <p className="co-badge-neutral rounded-lg px-3 py-2 text-xs font-semibold uppercase tracking-[0.08em]">Cancelled</p>
            ) : null}

            <label className="block text-xs font-semibold text-[var(--co-muted)]">
              {appointmentKind === "blocker" ? "Reason" : "Title"}
              <input
                type="text"
                value={form.title}
                onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                placeholder={appointmentKind === "blocker" ? "Dentist appointment, birthday…" : "Weekly team meeting"}
                className="co-input mt-1 w-full"
              />
            </label>

            <div className="grid grid-cols-2 gap-3">
              <DateInput
                label="Date"
                value={form.scheduledDate}
                onChange={(value) => setForm((current) => ({ ...current, scheduledDate: value }))}
              />
              <TimeInput
                label="Start time"
                value={form.startTime}
                onChange={(value) => setForm((current) => ({ ...current, startTime: value }))}
              />
            </div>

            <label className="block text-xs font-semibold text-[var(--co-muted)]">
              Duration
              <select
                value={form.durationMinutes}
                onChange={(event) => setForm((current) => ({ ...current, durationMinutes: Number(event.target.value) }))}
                className="co-input mt-1 w-full"
              >
                {DURATION_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <span className="mt-1 block text-[11px] font-normal normal-case text-[var(--co-muted)]">
                {appointmentKind === "blocker"
                  ? "This time will appear on the selected cleaner's day."
                  : "Every attendee is automatically paid for this much time."}
              </span>
            </label>

            {appointmentKind === "meeting" ? (
              <div className="block text-xs font-semibold text-[var(--co-muted)]">
                Attendees
                <div className="mt-1">
                  <AttendeePicker staff={staffRoster} selectedIds={form.employeeIds} onChange={(ids) => setForm((current) => ({ ...current, employeeIds: ids }))} />
                </div>
              </div>
            ) : (
              <div className="block text-xs font-semibold text-[var(--co-muted)]">
                Cleaner
                <div className="mt-1">
                  <AttendeePicker
                    staff={staffRoster}
                    selectedIds={form.employeeIds}
                    onChange={(ids) =>
                      setForm((current) => ({
                        ...current,
                        employeeIds: ids.slice(-1),
                      }))
                    }
                    placeholder="Search cleaner by name…"
                  />
                </div>
                <span className="mt-1 block text-[11px] font-normal normal-case text-[var(--co-muted)]">
                  This marks the selected cleaner&apos;s time unavailable. It does not create a job or affect payroll.
                </span>
              </div>
            )}

            <label className="block text-xs font-semibold text-[var(--co-muted)]">
              Notes
              <textarea
                value={form.note}
                onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))}
                rows={3}
                placeholder={appointmentKind === "blocker" ? "Optional details" : "Agenda, location, or other notes"}
                className="co-input mt-1 w-full resize-none"
              />
            </label>

            <div className="flex flex-wrap gap-2 border-t border-[var(--co-line-soft)] pt-4">
              <button type="button" disabled={saving} onClick={save} className="co-button-primary disabled:opacity-50">
                {saving
                  ? "Saving..."
                  : mode === "create"
                    ? appointmentKind === "blocker"
                      ? "Block time"
                      : "Create appointment"
                    : "Save changes"}
              </button>
              {mode === "edit" && status !== "cancelled" ? (
                confirmingCancel ? (
                  <div className="w-full space-y-2 co-badge-danger rounded-lg p-3">
                    <label className="block text-xs font-semibold text-[var(--co-danger)]">
                      Cancellation reason
                      <textarea value={cancellationReason} onChange={(event) => setCancellationReason(event.target.value)} rows={2} placeholder="Why is this appointment being cancelled?" className="co-input mt-1 w-full resize-none" />
                    </label>
                    <div className="flex gap-2">
                      <button type="button" disabled={saving} onClick={() => { setConfirmingCancel(false); setCancellationReason(""); }} className="co-button-secondary py-1 text-xs disabled:opacity-50">Keep appointment</button>
                      <button type="button" disabled={saving || !cancellationReason.trim()} onClick={confirmCancel} className="rounded-lg border border-[var(--co-danger)]/30 bg-[var(--co-danger)]/10 px-3 py-1 text-xs font-semibold text-[var(--co-danger)] hover:bg-[var(--co-danger)]/20 disabled:opacity-50">Confirm cancel</button>
                    </div>
                  </div>
                ) : (
                  <button type="button" onClick={() => setConfirmingCancel(true)} className="co-button-secondary">Cancel appointment</button>
                )
              ) : null}
            </div>
          </div>
        )}
      </aside>
    </div>,
    document.body,
  );
}
