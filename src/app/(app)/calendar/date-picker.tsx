"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";

function iso(date: Date) { return date.toISOString().slice(0, 10); }
function mondayIndex(date: Date) { return (date.getUTCDay() + 6) % 7; }

const VIEWS = [
  { value: "week", label: "Week" },
  { value: "staff", label: "Staff" },
  { value: "staff_vertical", label: "Staff vertical" },
  { value: "month", label: "Month" },
  { value: "list", label: "List" },
] as const;

export default function DatePicker({ view, value, label }: { view: string; value: Date; label: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  const [month, setMonth] = useState(new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), 1)));
  const daysInMonth = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 0)).getUTCDate();
  const cells = useMemo(() => Array.from({ length: mondayIndex(month) + daysInMonth }, (_, index) => index < mondayIndex(month) ? null : index - mondayIndex(month) + 1), [month, daysInMonth]);

  useEffect(() => {
    if (!open) return;
    function closePicker(event: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(event.target as Node)) setOpen(false);
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

  function selectView(nextView: (typeof VIEWS)[number]["value"]) {
    const params = new URLSearchParams(searchParams.toString());
    const selected = iso(value);
    params.set("view", nextView);
    params.delete("week"); params.delete("day"); params.delete("month");
    if (nextView === "month") params.set("month", selected.slice(0, 7));
    else if (nextView === "staff" || nextView === "staff_vertical" || nextView === "list") params.set("day", selected);
    else {
      const monday = new Date(value);
      monday.setUTCDate(monday.getUTCDate() - mondayIndex(monday));
      params.set("week", iso(monday));
    }
    router.push(`${pathname}?${params.toString()}`);
  }

  const selectedMonth = month.getUTCMonth() === value.getUTCMonth() && month.getUTCFullYear() === value.getUTCFullYear();
  return <div className="flex items-center gap-2"><div ref={pickerRef} className="relative"><button type="button" onClick={() => setOpen((current) => !current)} aria-expanded={open} aria-haspopup="dialog" className="co-button-secondary min-w-[170px] justify-start gap-2 text-left"><CalendarDays className="h-4 w-4 shrink-0 text-[var(--co-evergreen)]" aria-hidden /><span>{label}</span></button>{open ? <div role="dialog" aria-label="Choose calendar date" className="co-date-popover absolute left-0 top-full z-50 mt-2 w-[min(19rem,calc(100vw-2rem))] p-3"><div className="flex items-center justify-between border-b border-[var(--co-line-soft)] pb-2"><button type="button" aria-label="Previous month" onClick={() => setMonth((current) => new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth() - 1, 1)))} className="co-date-nav"><ChevronLeft className="h-4 w-4" aria-hidden /></button><p className="text-sm font-semibold text-[var(--co-ink)]">{month.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" })}</p><button type="button" aria-label="Next month" onClick={() => setMonth((current) => new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth() + 1, 1)))} className="co-date-nav"><ChevronRight className="h-4 w-4" aria-hidden /></button></div><div className="mt-2 grid grid-cols-7 text-center text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--co-faint)]">{["M", "T", "W", "T", "F", "S", "S"].map((day, index) => <span key={`${day}-${index}`} className="py-1.5">{day}</span>)}{cells.map((day, index) => day ? <button key={day} type="button" onClick={() => selectDay(day)} aria-pressed={selectedMonth && day === value.getUTCDate()} className={`co-date-day ${selectedMonth && day === value.getUTCDate() ? "co-date-day-selected" : ""}`}>{day}</button> : <span key={`empty-${index}`} />)}</div></div> : null}</div><label className="sr-only" htmlFor="calendar-view">Calendar view</label><select id="calendar-view" value={view} onChange={(event) => selectView(event.target.value as (typeof VIEWS)[number]["value"])} className="co-input min-w-[108px] py-2 text-xs">{VIEWS.map((entry) => <option key={entry.value} value={entry.value}>{entry.label}</option>)}</select></div>;
}
