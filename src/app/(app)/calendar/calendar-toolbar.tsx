"use client";

import { useEffect, useTransition } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { ATTENTION_RAIL_TOGGLE_EVENT } from "./shared";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import DatePicker, { CalendarAxisToggle, CalendarShapeToggle, CalendarViewSelector } from "./date-picker";
import FilterBar from "./filter-bar";

type Employee = { id: string; firstName: string; lastName: string; isActive?: boolean };

/** The calendar toolbar: a single command bar in three zones — date
 * navigation on the left, the Day/Week/Month period selector centered, and
 * filters/attention (plus, only on Day, the Timeline/List shape toggle and
 * axis toggle) on the right. Stays on one line at lg (1024px) and above;
 * below that it wraps deliberately zone-by-zone rather than breaking a
 * single control's own controls apart. The day summary and active filter
 * chips no longer live here — see day-ledger.tsx, rendered separately below
 * the board so the figures sit next to the chips that define what they
 * count. The app-wide navigation and tools remain in the shell above it;
 * Calendar does not replace that shell with an alternate navigation mode. */
export default function CalendarToolbar({
  view,
  axis,
  currentDate,
  dateLabel,
  focusDayIso,
  prevHref,
  nextHref,
  todayHref,
  employees,
  attentionCount,
  attentionDateIso,
}: {
  view: "board" | "week" | "month" | "list";
  axis: "vertical" | "horizontal";
  currentDate: Date;
  dateLabel: string;
  /** The last specific day the user looked at, tracked independently of the
   * current view — see date-picker.tsx's CalendarViewSelector. */
  focusDayIso: string;
  prevHref: string;
  nextHref: string;
  todayHref: string;
  employees: Employee[];
  attentionCount: number;
  attentionJobCount: number;
  attentionDateIso?: string;
}) {
  const isDayView = view === "board" || view === "list";
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isDateNavPending, startDateNavTransition] = useTransition();

  useEffect(() => {
    function handleShortcut(event: KeyboardEvent) {
      const target = event.target as HTMLElement;
      if (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const key = event.key.toLowerCase();
      const nextView = key === "b" ? "board" : key === "l" ? "list" : key === "w" ? "week" : key === "m" ? "month" : null;
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        router.push(prevHref);
        return;
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        router.push(nextHref);
        return;
      }
      if (key === "t") {
        event.preventDefault();
        router.push(todayHref);
        return;
      }
      if (!nextView || nextView === view) return;
      event.preventDefault();
      const params = new URLSearchParams(searchParams.toString());
      params.set("view", nextView);
      if (nextView === "board" || nextView === "list") params.set("day", focusDayIso);
      else if (nextView === "month") params.set("month", focusDayIso.slice(0, 7));
      else {
        const monday = new Date(`${focusDayIso}T00:00:00.000Z`);
        monday.setUTCDate(monday.getUTCDate() - monday.getUTCDay() + 1);
        params.set("week", monday.toISOString().slice(0, 10));
      }
      router.push(`${pathname}?${params.toString()}`);
    }
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [focusDayIso, nextHref, pathname, prevHref, router, searchParams, todayHref, view]);

  useEffect(() => {
    function openAttentionDestination() {
      if (view === "board") return;
      const params = new URLSearchParams(searchParams.toString());
      params.set("view", "board");
      params.delete("week");
      params.delete("month");
      params.set("day", attentionDateIso ?? focusDayIso);
      params.set("attention", "1");
      router.push(`${pathname}?${params.toString()}`);
    }
    window.addEventListener(ATTENTION_RAIL_TOGGLE_EVENT, openAttentionDestination);
    return () => window.removeEventListener(ATTENTION_RAIL_TOGGLE_EVENT, openAttentionDestination);
  }, [attentionDateIso, focusDayIso, pathname, router, searchParams, view]);

  // Real <Link>s (not buttons) so cmd/ctrl/middle-click still opens the
  // target date in a new tab and right-click still offers "copy link" — only
  // a plain left-click is intercepted, wrapped in a transition so the board
  // stays on screen with a quiet "Updating…" cue instead of flashing
  // loading.tsx while the RSC round-trip resolves.
  function navigate(event: React.MouseEvent<HTMLAnchorElement>, href: string) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    startDateNavTransition(() => router.push(href));
  }

  return (
    <div className="flex w-full min-w-0 flex-wrap items-center gap-2 lg:flex-nowrap lg:justify-between">
      {/* LEFT: date navigation */}
      <div aria-busy={isDateNavPending} className="flex shrink-0 items-center gap-2">
        <Link
          href={prevHref}
          onClick={(event) => navigate(event, prevHref)}
          aria-label="Previous period"
          className="co-button-secondary min-h-11 w-11 !px-0"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
        </Link>
        <DatePicker view={view} value={currentDate} label={dateLabel} />
        <Link
          href={nextHref}
          onClick={(event) => navigate(event, nextHref)}
          aria-label="Next period"
          className="co-button-secondary min-h-11 w-11 !px-0"
        >
          <ChevronRight className="h-4 w-4" aria-hidden />
        </Link>
        <Link href={todayHref} onClick={(event) => navigate(event, todayHref)} className="co-button-secondary">
          Today
        </Link>
        {isDateNavPending ? <span role="status" className="text-xs text-[var(--co-muted)]">Updating…</span> : null}
      </div>

      {/* CENTER: period selector */}
      <div className="flex shrink-0 items-center gap-2">
        <CalendarViewSelector view={view} axis={axis} focusDayIso={focusDayIso} />
      </div>

      {/* RIGHT: Day-only shape/axis, then filters and attention */}
      <div className="flex shrink-0 items-center gap-2">
        {isDayView ? <CalendarShapeToggle view={view} focusDayIso={focusDayIso} /> : null}
        {view === "board" ? <CalendarAxisToggle axis={axis} /> : null}
        <FilterBar employees={employees} attentionCount={attentionCount} />
      </div>
    </div>
  );
}
