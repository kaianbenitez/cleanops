"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { CalendarDays, ChevronLeft, ChevronRight, Columns3, Rows3 } from "lucide-react";
import { useDialogFocus } from "./dialog-focus";

function iso(date: Date) { return date.toISOString().slice(0, 10); }
function mondayIndex(date: Date) { return (date.getUTCDay() + 6) % 7; }

// Three period pills — Day / Week / Month. "Day" collapses the old
// Board/Day pair: both are the same single day, just drawn differently
// (timeline lanes vs. a list), so the shape choice moved to
// CalendarShapeToggle below and only shows up once Day is selected. The URL
// contract is unchanged — "Day" still resolves to view=board or view=list,
// nothing bookmarked breaks. page.tsx still accepts legacy "staff"/
// "staff_vertical" aliases for old bookmarks/cookies, resolving them to
// board+axis before this component ever sees them.
const PERIODS = [
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
] as const;

type PeriodValue = (typeof PERIODS)[number]["value"];

// Timeline vs. List — the two ways a single focused day can be drawn.
// "Timeline" maps to view=board, "List" maps to view=list; the URL param
// values are unchanged, only the button copy is friendlier than the old
// literal "Board"/"Day" pill labels.
const SHAPES = [
  { value: "board", label: "Timeline" },
  { value: "list", label: "List" },
] as const;

type ShapeValue = (typeof SHAPES)[number]["value"];

export default function DatePicker({ view, value, label }: { view: string; value: Date; label: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const pickerRef = useRef<HTMLDivElement>(null);
  const [dialogPosition, setDialogPosition] = useState({ left: 0, top: 0 });
  const dialogFocusRef = useDialogFocus<HTMLDivElement>(open);
  const [month, setMonth] = useState(new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), 1)));
  const valueMonthKey = `${value.getUTCFullYear()}-${value.getUTCMonth()}`;
  const previousValueMonthKey = useRef(valueMonthKey);
  useEffect(() => {
    if (previousValueMonthKey.current === valueMonthKey) return;
    previousValueMonthKey.current = valueMonthKey;
    setMonth(new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), 1)));
  }, [value, valueMonthKey]);
  const daysInMonth = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 0)).getUTCDate();
  const cells = useMemo(() => Array.from({ length: mondayIndex(month) + daysInMonth }, (_, index) => index < mondayIndex(month) ? null : index - mondayIndex(month) + 1), [month, daysInMonth]);

  useEffect(() => {
    if (!open) return;
    function closePicker(event: MouseEvent) {
      const target = event.target as Node;
      if (!pickerRef.current?.contains(target) && !dialogFocusRef.current?.contains(target)) setOpen(false);
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
  }, [dialogFocusRef, open]);

  useEffect(() => {
    if (!open) return;
    function updateDialogPosition() {
      const bounds = pickerRef.current?.getBoundingClientRect();
      const dialog = dialogFocusRef.current;
      if (!bounds || !dialog) return;
      const viewportGutter = 16;
      const dialogBounds = dialog.getBoundingClientRect();
      const maxLeft = Math.max(viewportGutter, window.innerWidth - dialogBounds.width - viewportGutter);
      const left = Math.min(Math.max(bounds.left, viewportGutter), maxLeft);
      const preferredTop = bounds.bottom + 8;
      const top = preferredTop + dialogBounds.height <= window.innerHeight - viewportGutter
        ? preferredTop
        : Math.max(viewportGutter, bounds.top - dialogBounds.height - 8);
      setDialogPosition({ left, top });
    }
    updateDialogPosition();
    window.addEventListener("resize", updateDialogPosition);
    window.addEventListener("scroll", updateDialogPosition, true);
    return () => {
      window.removeEventListener("resize", updateDialogPosition);
      window.removeEventListener("scroll", updateDialogPosition, true);
    };
  }, [dialogFocusRef, month, open]);

  function selectDay(day: number) {
    const date = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), day));
    const params = new URLSearchParams(searchParams.toString());
    params.delete("week"); params.delete("day"); params.delete("month");
    const selected = iso(date);
    if (view === "month") params.set("month", selected.slice(0, 7));
    else if (view === "board" || view === "list") params.set("day", selected);
    else {
      const monday = new Date(date);
      const offset = mondayIndex(monday);
      monday.setUTCDate(monday.getUTCDate() - offset);
      params.set("week", iso(monday));
    }
    startTransition(() => router.push(`${pathname}?${params.toString()}`));
    setOpen(false);
  }

  const selectedMonth = month.getUTCMonth() === value.getUTCMonth() && month.getUTCFullYear() === value.getUTCFullYear();
  const dialog = open ? (
    <div
      ref={dialogFocusRef}
      tabIndex={-1}
      role="dialog"
      aria-label="Choose calendar date"
      className="co-date-popover fixed z-[60] w-[min(19rem,calc(100vw-2rem))] p-3"
      style={dialogPosition}
    >
      <div className="flex items-center justify-between border-b border-[var(--co-line-soft)] pb-2">
        <button type="button" aria-label="Previous month" onClick={() => setMonth((current) => new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth() - 1, 1)))} className="co-date-nav h-11 w-11"><ChevronLeft className="h-4 w-4" aria-hidden /></button>
        <p className="type-admin-body font-semibold text-[var(--co-ink)]">{month.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" })}</p>
        <button type="button" aria-label="Next month" onClick={() => setMonth((current) => new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth() + 1, 1)))} className="co-date-nav h-11 w-11"><ChevronRight className="h-4 w-4" aria-hidden /></button>
      </div>
      <div className="type-admin-micro mt-2 grid grid-cols-7 text-center font-semibold uppercase tracking-[0.08em] text-[var(--co-faint)]">
        {["M", "T", "W", "T", "F", "S", "S"].map((day, index) => <span key={`${day}-${index}`} className="py-1.5">{day}</span>)}
        {cells.map((day, index) => day ? <button key={day} type="button" onClick={() => selectDay(day)} aria-pressed={selectedMonth && day === value.getUTCDate()} className={`co-date-day ${selectedMonth && day === value.getUTCDate() ? "co-date-day-selected" : ""}`}>{day}</button> : <span key={`empty-${index}`} />)}
      </div>
    </div>
  ) : null;

  return (
    <div aria-busy={isPending} className="flex items-center gap-2">
      <div ref={pickerRef} className="relative">
        <button type="button" onClick={() => setOpen((current) => !current)} aria-expanded={open} aria-haspopup="dialog" className="co-button-secondary min-w-[170px] justify-start gap-2 text-left"><CalendarDays className="h-4 w-4 shrink-0 text-[var(--co-accent-text)]" aria-hidden /><span>{label}</span></button>
        {dialog ? createPortal(dialog, document.body) : null}
      </div>
      {isPending ? <span role="status" className="text-xs text-[var(--co-muted)]">Updating…</span> : null}
    </div>
  );
}

export function CalendarViewSelector({
  view,
  axis,
  focusDayIso,
}: {
  view: string;
  /** Explicitly re-set on every view switch (not just left to the state
   * cookie) so the axis toggle survives a Day/Week/Month detour even before
   * CalendarStateSync's cookie write lands. */
  axis: "vertical" | "horizontal";
  focusDayIso: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // Remembers whichever Day shape (Timeline vs. List) was last used, purely
  // for this component's lifetime — not written to the state cookie, which
  // already stores "view" as whatever the *current* view is and would get
  // clobbered the moment the admin leaves Day for Week/Month. Clicking back
  // to "Day" restores this; an unknown value (fresh mount on a Week/Month
  // URL) correctly falls back to Timeline per the design brief. Adjusted
  // during render (React's documented pattern for state derived from a prop
  // change) rather than in an Effect, so there's no extra cascading render.
  const [lastDayShape, setLastDayShape] = useState<ShapeValue>(view === "list" ? "list" : "board");
  const [trackedView, setTrackedView] = useState(view);
  if (view !== trackedView) {
    setTrackedView(view);
    if (view === "board" || view === "list") setLastDayShape(view);
  }

  const periodValue: PeriodValue = view === "week" ? "week" : view === "month" ? "month" : "day";

  function selectPeriod(period: PeriodValue) {
    const nextView = period === "day" ? lastDayShape : period;
    if (nextView === view) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("view", nextView);
    params.set("axis", axis);
    params.delete("week"); params.delete("day"); params.delete("month");
    // Anchored on focusDayIso (the last specific day the user actually
    // looked at, tracked independently of the current view) rather than
    // `value` — `value` collapses to the month/week anchor while on Month
    // or Week, which silently dropped the real day on every switch back
    // to a day-based view.
    if (nextView === "month") params.set("month", focusDayIso.slice(0, 7));
    else if (nextView === "board" || nextView === "list") params.set("day", focusDayIso);
    else {
      const monday = new Date(`${focusDayIso}T00:00:00.000Z`);
      monday.setUTCDate(monday.getUTCDate() - mondayIndex(monday));
      params.set("week", iso(monday));
    }
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div role="group" aria-label="Calendar period" className="flex gap-0.5 rounded-xl border border-[var(--co-line)] bg-[var(--co-surface-muted)] p-1">
      {PERIODS.map((entry) => (
        <button
          key={entry.value}
          type="button"
          aria-pressed={periodValue === entry.value}
          onClick={() => selectPeriod(entry.value)}
          className={`type-admin-body min-h-11 whitespace-nowrap rounded-lg px-3 py-1.5 font-semibold transition-colors ${periodValue === entry.value ? "bg-[var(--co-accent-fill)] text-white shadow-[var(--co-shadow-control)]" : "text-[var(--co-muted)] hover:bg-[var(--co-surface)] hover:text-[var(--co-ink)]"}`}
        >
          {entry.label}
        </button>
      ))}
    </div>
  );
}

/** Timeline vs. List — shown by calendar-toolbar.tsx only while the period
 * selector above is on "Day". Preserves every other search param (axis
 * included) exactly like CalendarAxisToggle does, so switching shape never
 * moves the focused date or resets the board's column/row layout. */
export function CalendarShapeToggle({ view, focusDayIso }: { view: ShapeValue; focusDayIso: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function selectShape(shape: ShapeValue) {
    if (shape === view) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("view", shape);
    params.set("day", focusDayIso);
    params.delete("week"); params.delete("month");
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div role="group" aria-label="Day layout" className="flex gap-0.5 rounded-lg border border-[var(--co-line)] bg-[var(--co-surface-muted)] p-1">
      {SHAPES.map((entry) => (
        <button
          key={entry.value}
          type="button"
          aria-pressed={view === entry.value}
          onClick={() => selectShape(entry.value)}
          className={`type-admin-body min-h-11 whitespace-nowrap rounded-md px-2.5 py-1.5 font-semibold transition-colors ${view === entry.value ? "bg-[var(--co-surface)] text-[var(--co-accent-text)] shadow-[var(--co-shadow-control)]" : "text-[var(--co-muted)] hover:bg-[var(--co-surface)] hover:text-[var(--co-ink)]"}`}
        >
          {entry.label}
        </button>
      ))}
    </div>
  );
}

/** Two icon buttons — crews as columns vs. crews as rows — shown only while
 * `view === "board"` (see calendar-toolbar.tsx). Preserves every other
 * search param (including the current day/week/month anchor) so toggling
 * axis never moves the focused date. Matches the prototype's `.axis`
 * styling 1:1 (`calendar-board-prototype.html`, `#axis`). */
export function CalendarAxisToggle({ axis }: { axis: "vertical" | "horizontal" }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function selectAxis(nextAxis: "vertical" | "horizontal") {
    if (nextAxis === axis) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("axis", nextAxis);
    router.push(`${pathname}?${params.toString()}`);
  }

  function axisButtonClass(pressed: boolean) {
    return `grid h-11 w-11 place-items-center rounded-md transition-colors duration-150 ${pressed ? "bg-[var(--co-surface)] text-[var(--co-accent-text)] shadow-[var(--co-shadow-control)]" : "text-[var(--co-muted)] hover:bg-[var(--co-surface)] hover:text-[var(--co-ink)]"}`;
  }

  return (
    <div role="group" aria-label="Crew axis" aria-describedby="calendar-axis-help" className="flex gap-0.5 rounded-lg border border-[var(--co-line)] bg-[var(--co-surface-muted)] p-[3px]">
      <span id="calendar-axis-help" className="sr-only">Choose whether crews appear as columns or rows on the board.</span>
      <button
        type="button"
        aria-pressed={axis === "vertical"}
        aria-label="Crews as columns"
        title="Crews as columns"
        onClick={() => selectAxis("vertical")}
        className={axisButtonClass(axis === "vertical")}
      >
        <Columns3 className="h-4 w-4" aria-hidden strokeWidth={1.75} />
      </button>
      <button
        type="button"
        aria-pressed={axis === "horizontal"}
        aria-label="Crews as rows"
        title="Crews as rows"
        onClick={() => selectAxis("horizontal")}
        className={axisButtonClass(axis === "horizontal")}
      >
        <Rows3 className="h-4 w-4" aria-hidden strokeWidth={1.75} />
      </button>
    </div>
  );
}
