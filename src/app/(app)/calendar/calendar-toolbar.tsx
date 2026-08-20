"use client";

import { useEffect, useState, useTransition } from "react";
import { ChevronLeft, ChevronRight, PanelLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import DatePicker, { CalendarAxisToggle, CalendarViewSelector } from "./date-picker";
import FilterBar from "./filter-bar";
import GlobalSearch from "../global-search";
import CreateMenu from "../create-menu";
import NotificationsMenu, { type Notification } from "../notifications-menu";

type StaffMember = { id: string; firstName: string; lastName: string };
type Employee = { id: string; firstName: string; lastName: string; isActive?: boolean };

function money(cents: number) {
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function CalendarDaySummary({
  totalEmployees,
  workingEmployees,
  recurringClients,
  revenueCents,
  discountCents,
}: {
  totalEmployees: number;
  workingEmployees: number;
  recurringClients: number;
  revenueCents: number;
  discountCents: number;
}) {
  return (
    <div className="flex min-w-0 flex-1 items-center justify-center gap-3 overflow-hidden px-2 lg:gap-4" aria-label="Selected day summary">
      <div className="min-w-0 text-center">
        <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--co-faint)]">Employees working</p>
        <p className="mt-0.5 text-sm font-bold tabular-nums text-[var(--co-ink)]">{workingEmployees}/{totalEmployees}</p>
        <p className="truncate text-[10px] text-[var(--co-muted)]">{recurringClients} recurring client{recurringClients === 1 ? "" : "s"}</p>
      </div>
      <div className="h-8 w-px bg-[var(--co-line-soft)]" aria-hidden />
      <div className="min-w-0 text-center">
        <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--co-faint)]">Projected revenue</p>
        <p className="mt-0.5 text-sm font-bold tabular-nums text-[var(--co-ink)]">{money(revenueCents)}</p>
      </div>
      <div className="h-8 w-px bg-[var(--co-line-soft)]" aria-hidden />
      <div className="min-w-0 text-center">
        <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--co-faint)]">Discounts</p>
        <p className="mt-0.5 text-sm font-bold tabular-nums text-[var(--co-ink)]">{money(discountCents)}</p>
      </div>
    </div>
  );
}

const STORAGE_KEY = "co-calendar-focus-mode";

/** The whole calendar toolbar, one row: nav toggle, date nav, view pills,
 * attention/filters (filter-bar.tsx), then — only while the nav is hidden —
 * the app tools absorbed from the top bar: search, notifications, create,
 * separated by a divider. When the nav is showing (focused = false), those
 * three are dropped since the real top bar's own copies are visible right
 * above and would otherwise duplicate them. Date/view routing stays in
 * date-picker.tsx; the prev/next/today hrefs are computed by page.tsx from
 * the current search params and just rendered here. */
export default function CalendarToolbar({
  view,
  axis,
  currentDate,
  dateLabel,
  focusDayIso,
  prevHref,
  nextHref,
  todayHref,
  staffRoster,
  appointmentDefaultDate,
  employees,
  attentionCount,
  totalEmployees,
  dailySummary,
  initialNotifications,
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
  staffRoster: StaffMember[];
  appointmentDefaultDate: string;
  employees: Employee[];
  attentionCount: number;
  totalEmployees: number;
  dailySummary: {
    workingEmployees: number;
    recurringClients: number;
    revenueCents: number;
    discountCents: number;
  };
  initialNotifications: Notification[];
}) {
  const router = useRouter();
  const [isDateNavPending, startDateNavTransition] = useTransition();
  const [focused, setFocused] = useState(true);

  useEffect(() => {
    // Reading localStorage after mount, same pattern as today-list-board.tsx's clock init.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFocused(localStorage.getItem(STORAGE_KEY) !== "off");
  }, []);

  useEffect(() => {
    if (focused) document.documentElement.dataset.focusMode = "calendar";
    else delete document.documentElement.dataset.focusMode;
    return () => {
      delete document.documentElement.dataset.focusMode;
    };
  }, [focused]);

  function toggleFocus() {
    setFocused((current) => {
      const next = !current;
      localStorage.setItem(STORAGE_KEY, next ? "on" : "off");
      return next;
    });
  }

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
    <div className="flex w-full min-w-0 items-center justify-between gap-2">
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={toggleFocus}
          aria-pressed={!focused}
          aria-label={focused ? "Show navigation" : "Hide navigation"}
          className="co-button-secondary flex h-9 w-9 shrink-0 items-center justify-center !p-0"
        >
          <PanelLeft className="h-4 w-4" aria-hidden />
        </button>
        <div aria-busy={isDateNavPending} className="flex items-center gap-2">
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
        <CalendarViewSelector view={view} axis={axis} focusDayIso={focusDayIso} />
        {view === "board" ? <CalendarAxisToggle axis={axis} /> : null}
        <FilterBar employees={employees} attentionCount={attentionCount} />
      </div>
      <CalendarDaySummary totalEmployees={totalEmployees} {...dailySummary} />
      {focused ? (
        <div className="flex shrink-0 items-center gap-2">
          <div className="mx-1 h-6 w-px bg-[var(--co-line-soft)]" aria-hidden />
          <GlobalSearch variant="icon" />
          <NotificationsMenu initialNotifications={initialNotifications} portal />
          <CreateMenu
            compact
            portal
            leadingItem={{ href: "/jobs/new", label: "Schedule a job" }}
            appointments={{ staffRoster, defaultDate: appointmentDefaultDate }}
          />
        </div>
      ) : null}
    </div>
  );
}
