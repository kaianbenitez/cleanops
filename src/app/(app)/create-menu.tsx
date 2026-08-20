"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Plus, ChevronDown, CalendarClock, Clock3, FileText, ClipboardList, UserPlus } from "lucide-react";
import { createPortal } from "react-dom";
import AppointmentPanel from "./calendar/appointment-panel";

type StaffMember = { id: string; firstName: string; lastName: string };

export default function CreateMenu({
  compact = false,
  leadingItem,
  appointments,
  portal = false,
}: {
  compact?: boolean;
  /** An extra menu item rendered above Customer/Quote — e.g. Calendar's own
   * "Schedule job" shortcut, which replaces the generic "Job" item below it.
   * Additive only; omitting it (every existing call site) renders the
   * original 3-item menu unchanged. Icon is fixed (not a prop) — a component
   * reference can't cross the server/client boundary from a server-rendered
   * caller like calendar-toolbar.tsx. */
  leadingItem?: { href: string; label: string };
  /** When set, adds an "Internal meeting" item below a divider that opens
   * the same AppointmentPanel create flow new-appointment-button.tsx used to
   * render as its own standalone toolbar button. Additive only. */
  appointments?: { staffRoster: StaffMember[]; defaultDate: string };
  /** Renders the dropdown via createPortal + fixed positioning instead of an
   * absolute-positioned child — needed when the trigger sits inside a
   * clipping ancestor, like Calendar's overflow-hidden toolbar card. The two
   * original call sites aren't, so they default to false and are unchanged. */
  portal?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [appointmentKind, setAppointmentKind] = useState<"meeting" | "blocker" | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [dialogPosition, setDialogPosition] = useState({ top: 0, right: 0 });

  useEffect(() => {
    if (!open) return;
    function handleClick(event: MouseEvent) {
      const target = event.target as Node;
      if (portal) {
        if (!panelRef.current?.contains(target) && !triggerRef.current?.contains(target)) setOpen(false);
        return;
      }
      if (ref.current && !ref.current.contains(target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open, portal]);

  useEffect(() => {
    if (!portal || !open) return;
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
  }, [portal, open]);

  const menu = (
    <div
      ref={portal ? panelRef : undefined}
      role="menu"
      style={portal ? dialogPosition : undefined}
      className={portal ? "co-date-popover fixed z-[60] w-48 overflow-hidden py-1" : "absolute right-0 top-full z-30 mt-2 w-48 overflow-hidden rounded-2xl border border-[var(--co-line-soft)] bg-[var(--co-surface)] py-1 shadow-[0_10px_32px_rgba(18,24,19,0.12)]"}
    >
      {leadingItem ? (
        <Link
          href={leadingItem.href}
          role="menuitem"
          onClick={() => setOpen(false)}
          className="flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-[var(--co-ink)] transition hover:bg-[var(--co-surface-muted)]"
        >
          <CalendarClock className="h-4 w-4 text-[var(--co-muted)]" aria-hidden />
          {leadingItem.label}
        </Link>
      ) : null}
      <Link
        href="/customers/new"
        role="menuitem"
        onClick={() => setOpen(false)}
        className="flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-[var(--co-ink)] transition hover:bg-[var(--co-surface-muted)]"
      >
        <UserPlus className="h-4 w-4 text-[var(--co-muted)]" aria-hidden />
        Customer
      </Link>
      <Link
        href="/quotes/new"
        role="menuitem"
        onClick={() => setOpen(false)}
        className="flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-[var(--co-ink)] transition hover:bg-[var(--co-surface-muted)]"
      >
        <FileText className="h-4 w-4 text-[var(--co-muted)]" aria-hidden />
        Quote
      </Link>
      {!leadingItem ? (
        <Link
          href="/jobs/new"
          role="menuitem"
          onClick={() => setOpen(false)}
          className="flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-[var(--co-ink)] transition hover:bg-[var(--co-surface-muted)]"
        >
          <ClipboardList className="h-4 w-4 text-[var(--co-muted)]" aria-hidden />
          Job
        </Link>
      ) : null}
      {appointments ? (
        <>
          <div role="separator" className="my-1 border-t border-[var(--co-line-soft)]" />
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setAppointmentKind("meeting");
              setOpen(false);
            }}
            className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm font-medium text-[var(--co-ink)] transition hover:bg-[var(--co-surface-muted)]"
          >
            <CalendarClock className="h-4 w-4 text-[var(--co-muted)]" aria-hidden />
            Internal meeting
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setAppointmentKind("blocker");
              setOpen(false);
            }}
            className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm font-medium text-[var(--co-ink)] transition hover:bg-[var(--co-surface-muted)]"
          >
            <Clock3 className="h-4 w-4 text-[var(--co-muted)]" aria-hidden />
            Block time
          </button>
        </>
      ) : null}
    </div>
  );

  return (
    <div ref={ref} className="relative">
      {compact ? (
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setOpen((current) => !current)}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label="Create new"
          className="rounded-full p-2 text-[var(--co-muted)] transition-colors hover:bg-[var(--co-surface-muted)] hover:text-[var(--co-ink)]"
        >
          <Plus className="h-5 w-5" strokeWidth={1.75} aria-hidden />
        </button>
      ) : (
        <button ref={triggerRef} type="button" onClick={() => setOpen((current) => !current)} aria-haspopup="menu" aria-expanded={open} className="co-button-primary">
          <Plus className="h-4 w-4" aria-hidden />
          Create new
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
        </button>
      )}

      {open ? (portal ? createPortal(menu, document.body) : menu) : null}
      {appointments && appointmentKind ? (
        <AppointmentPanel mode="create" kind={appointmentKind} staffRoster={appointments.staffRoster} defaultDate={appointments.defaultDate} onClose={() => setAppointmentKind(null)} />
      ) : null}
    </div>
  );
}
