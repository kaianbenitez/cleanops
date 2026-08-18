"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";

function iso(date: Date) { return date.toISOString().slice(0, 10); }
function mondayIndex(date: Date) { return (date.getUTCDay() + 6) % 7; }

// Visible labels describe the scheduler's task, not the underlying grid
// geometry — "Horizontal"/"Vertical" told a first-time user nothing about
// what each view was for. Internal query values are unchanged so existing
// links, the state cookie, and bookmarks keep working.
const PRIMARY_VIEWS = [
  { value: "staff", label: "Dispatch" },
  { value: "week", label: "Capacity" },
  { value: "month", label: "Month" },
] as const;

const MORE_VIEWS = [
  { value: "list", label: "Day list" },
  { value: "staff_vertical", label: "Vertical timeline" },
] as const;

type ViewValue = (typeof PRIMARY_VIEWS)[number]["value"] | (typeof MORE_VIEWS)[number]["value"];

export default function DatePicker({ view, value, label }: { view: string; value: Date; label: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const [dialogPosition, setDialogPosition] = useState({ left: 0, top: 0 });
  const [month, setMonth] = useState(new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), 1)));
  const daysInMonth = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 0)).getUTCDate();
  const cells = useMemo(() => Array.from({ length: mondayIndex(month) + daysInMonth }, (_, index) => index < mondayIndex(month) ? null : index - mondayIndex(month) + 1), [month, daysInMonth]);

  useEffect(() => {
    if (!open) return;
    function closePicker(event: MouseEvent) {
      const target = event.target as Node;
      if (!pickerRef.current?.contains(target) && !dialogRef.current?.contains(target)) setOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", closePicker);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closePicker);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function updateDialogPosition() {
      const bounds = pickerRef.current?.getBoundingClientRect();
      if (bounds) setDialogPosition({ left: bounds.left, top: bounds.bottom + 8 });
    }
    updateDialogPosition();
    window.addEventListener("resize", updateDialogPosition);
    window.addEventListener("scroll", updateDialogPosition, true);
    return () => {
      window.removeEventListener("resize", updateDialogPosition);
      window.removeEventListener("scroll", updateDialogPosition, true);
    };
  }, [open]);

  function selectDay(day: number) {
    const date = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), day));
    const params = new URLSearchParams(searchParams.toString());
    params.delete("week"); params.delete("day"); params.delete("month");
    const selected = iso(date);
    if (view === "month") params.set("month", selected.slice(0, 7));
    else if (view === "staff" || view === "staff_vertical" || view === "list") params.set("day", selected);
    else {
      const monday = new Date(date);
      const offset = mondayIndex(monday);
      monday.setUTCDate(monday.getUTCDate() - offset);
      params.set("week", iso(monday));
    }
    router.push(`${pathname}?${params.toString()}`);
    setOpen(false);
  }

  const selectedMonth = month.getUTCMonth() === value.getUTCMonth() && month.getUTCFullYear() === value.getUTCFullYear();
  const dialog = open ? (
    <div
      ref={dialogRef}
      role="dialog"
      aria-label="Choose calendar date"
      className="co-date-popover fixed z-[60] w-[min(19rem,calc(100vw-2rem))] p-3"
      style={dialogPosition}
    >
      <div className="flex items-center justify-between border-b border-[var(--co-line-soft)] pb-2">
        <button type="button" aria-label="Previous month" onClick={() => setMonth((current) => new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth() - 1, 1)))} className="co-date-nav"><ChevronLeft className="h-4 w-4" aria-hidden /></button>
        <p className="text-sm font-semibold text-[var(--co-ink)]">{month.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" })}</p>
        <button type="button" aria-label="Next month" onClick={() => setMonth((current) => new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth() + 1, 1)))} className="co-date-nav"><ChevronRight className="h-4 w-4" aria-hidden /></button>
      </div>
      <div className="mt-2 grid grid-cols-7 text-center text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--co-faint)]">
        {["M", "T", "W", "T", "F", "S", "S"].map((day, index) => <span key={`${day}-${index}`} className="py-1.5">{day}</span>)}
        {cells.map((day, index) => day ? <button key={day} type="button" onClick={() => selectDay(day)} aria-pressed={selectedMonth && day === value.getUTCDate()} className={`co-date-day ${selectedMonth && day === value.getUTCDate() ? "co-date-day-selected" : ""}`}>{day}</button> : <span key={`empty-${index}`} />)}
      </div>
    </div>
  ) : null;

  return <div ref={pickerRef} className="relative"><button type="button" onClick={() => setOpen((current) => !current)} aria-expanded={open} aria-haspopup="dialog" className="co-button-secondary min-w-[170px] justify-start gap-2 text-left"><CalendarDays className="h-4 w-4 shrink-0 text-[var(--co-accent-text)]" aria-hidden /><span>{label}</span></button>{dialog ? createPortal(dialog, document.body) : null}</div>;
}

export function CalendarViewSelector({ view, focusDayIso }: { view: string; focusDayIso: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!moreOpen) return;
    function onMouseDown(event: MouseEvent) {
      if (!moreRef.current?.contains(event.target as Node)) setMoreOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setMoreOpen(false);
    }
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [moreOpen]);

  function selectView(nextView: ViewValue) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("view", nextView);
    params.delete("week"); params.delete("day"); params.delete("month");
    // Anchored on focusDayIso (the last specific day the user actually
    // looked at, tracked independently of the current view) rather than
    // `value` — `value` collapses to the month/week anchor while on Month
    // or Capacity, which silently dropped the real day on every switch back
    // to a day-based view.
    if (nextView === "month") params.set("month", focusDayIso.slice(0, 7));
    else if (nextView === "staff" || nextView === "staff_vertical" || nextView === "list") params.set("day", focusDayIso);
    else {
      const monday = new Date(`${focusDayIso}T00:00:00.000Z`);
      monday.setUTCDate(monday.getUTCDate() - mondayIndex(monday));
      params.set("week", iso(monday));
    }
    router.push(`${pathname}?${params.toString()}`);
    setMoreOpen(false);
  }

  const activeMoreView = MORE_VIEWS.find((entry) => entry.value === view);

  return (
    <div className="flex items-center gap-1.5">
      <div role="group" aria-label="Calendar view" className="flex overflow-hidden rounded-lg border border-[var(--co-line)] bg-[var(--co-surface-muted)] p-0.5">
        {PRIMARY_VIEWS.map((entry) => (
          <button
            key={entry.value}
            type="button"
            aria-pressed={view === entry.value}
            onClick={() => selectView(entry.value)}
            className={`min-h-9 whitespace-nowrap px-3 py-1.5 text-xs font-semibold ${view === entry.value ? "bg-[var(--co-accent-fill)] text-white" : "text-[var(--co-muted)] hover:bg-[var(--co-surface)] hover:text-[var(--co-ink)]"}`}
          >
            {entry.label}
          </button>
        ))}
      </div>
      <div ref={moreRef} className="relative">
        <button
          type="button"
          onClick={() => setMoreOpen((current) => !current)}
          aria-expanded={moreOpen}
          aria-haspopup="menu"
          className={`co-button-secondary min-h-9 gap-1 py-1.5 text-xs ${activeMoreView ? "border-[var(--co-accent-text)] text-[var(--co-accent-text)]" : ""}`}
        >
          {activeMoreView ? activeMoreView.label : "More views"}
          <ChevronDown className="h-3.5 w-3.5" aria-hidden />
        </button>
        {moreOpen ? (
          <div role="menu" aria-label="More calendar views" className="co-date-popover co-date-popover-responsive absolute right-0 top-full z-50 mt-1 w-48 p-1.5">
            {MORE_VIEWS.map((entry) => (
              <button
                key={entry.value}
                type="button"
                role="menuitemradio"
                aria-checked={view === entry.value}
                onClick={() => selectView(entry.value)}
                className={`block w-full rounded-md px-2.5 py-2 text-left text-xs font-semibold ${view === entry.value ? "bg-[var(--co-accent-tint)] text-[var(--co-accent-text)]" : "text-[var(--co-ink)] hover:bg-[var(--co-surface-muted)]"}`}
              >
                {entry.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
