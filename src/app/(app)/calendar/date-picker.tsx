"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

function iso(date: Date) { return date.toISOString().slice(0, 10); }
function mondayIndex(date: Date) { return (date.getUTCDay() + 6) % 7; }

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
    else if (view === "staff") params.set("day", selected);
    else {
      const monday = new Date(date);
      const offset = mondayIndex(monday);
      monday.setUTCDate(monday.getUTCDate() - offset);
      params.set("week", iso(monday));
    }
    router.push(`${pathname}?${params.toString()}`);
    setOpen(false);
  }

  return <div ref={pickerRef} className="relative"><button type="button" onClick={() => setOpen((current) => !current)} aria-expanded={open} className="co-button-secondary min-w-[170px] text-left"><span>{label}</span></button>{open ? <div className="absolute right-0 top-full z-50 mt-2 w-[286px] rounded-xl border border-[var(--co-line)] bg-white p-3 shadow-[0_12px_32px_rgba(18,24,19,0.16)]"><div className="flex items-center justify-between px-1"><button type="button" aria-label="Previous month" onClick={() => setMonth((current) => new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth() - 1, 1)))} className="rounded-md px-2 py-1 text-[var(--co-muted)] hover:bg-[var(--co-surface-muted)]">&lt;</button><p className="text-sm font-semibold">{month.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" })}</p><button type="button" aria-label="Next month" onClick={() => setMonth((current) => new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth() + 1, 1)))} className="rounded-md px-2 py-1 text-[var(--co-muted)] hover:bg-[var(--co-surface-muted)]">&gt;</button></div><div className="mt-3 grid grid-cols-7 text-center text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--co-faint)]">{["M", "T", "W", "T", "F", "S", "S"].map((day, index) => <span key={`${day}-${index}`} className="py-1">{day}</span>)}{cells.map((day, index) => day ? <button key={day} type="button" onClick={() => selectDay(day)} className={`rounded-md py-2 text-xs hover:bg-[var(--co-accent-tint)] ${day === value.getUTCDate() && month.getUTCMonth() === value.getUTCMonth() ? "bg-[var(--co-evergreen)] font-semibold text-white" : "text-[var(--co-ink)]"}`}>{day}</button> : <span key={`empty-${index}`} />)}</div></div> : null}</div>;
}
