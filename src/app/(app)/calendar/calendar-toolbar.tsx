"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { ChevronLeft, ChevronRight, PanelLeft } from "lucide-react";
import { ATTENTION_RAIL_TOGGLE_EVENT } from "./shared";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
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
    <div className="hidden min-w-0 flex-1 items-center justify-center gap-3 overflow-hidden px-2 3xl:flex 3xl:gap-4" aria-label="Selected day summary">
      <div className="min-w-0 text-center">
        <p className="type-admin-micro font-semibold uppercase tracking-[0.08em] text-[var(--co-faint)]">Crew working</p>
        <p className="type-admin-body mt-0.5 font-bold tabular-nums text-[var(--co-ink)]">{workingEmployees}/{totalEmployees}</p>
        <p className="type-admin-micro truncate text-[var(--co-muted)]">{recurringClients} recurring client{recurringClients === 1 ? "" : "s"}</p>
      </div>
      <div className="h-8 w-px bg-[var(--co-line-soft)]" aria-hidden />
      <div className="min-w-0 text-center">
        <p className="type-admin-micro font-semibold uppercase tracking-[0.08em] text-[var(--co-faint)]">Projected revenue</p>
        <p className="type-admin-body mt-0.5 font-bold tabular-nums text-[var(--co-ink)]">{money(revenueCents)}</p>
      </div>
      <div className="h-8 w-px bg-[var(--co-line-soft)]" aria-hidden />
      <div className="min-w-0 text-center">
        <p className="type-admin-micro font-semibold uppercase tracking-[0.08em] text-[var(--co-faint)]">Discounts</p>
        <p className="type-admin-body mt-0.5 font-bold tabular-nums text-[var(--co-ink)]">{money(discountCents)}</p>
      </div>
    </div>
  );
}

function CompactDaySummary({
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
    <details className="order-last w-full rounded-xl border border-[var(--co-line-soft)] bg-[var(--co-surface-muted)]/45 px-3 py-2 3xl:hidden">
      <summary className="flex min-h-8 cursor-pointer list-none items-center justify-between text-xs font-semibold text-[var(--co-body)] [&::-webkit-details-marker]:hidden">
        <span>Day summary</span>
        <span className="tabular-nums text-[var(--co-muted)]">{workingEmployees}/{totalEmployees} crew working</span>
      </summary>
      <div className="grid grid-cols-3 gap-3 border-t border-[var(--co-line-soft)] pt-2 text-xs">
        <div><span className="block text-[var(--co-faint)]">Recurring</span><span className="font-semibold text-[var(--co-ink)]">{recurringClients}</span></div>
        <div><span className="block text-[var(--co-faint)]">Revenue</span><span className="font-semibold text-[var(--co-ink)]">{money(revenueCents)}</span></div>
        <div><span className="block text-[var(--co-faint)]">Discounts</span><span className="font-semibold text-[var(--co-ink)]">{money(discountCents)}</span></div>
      </div>
    </details>
  );
}

const STORAGE_KEY = "co-calendar-focus-mode";

/** The whole calendar toolbar: a primary row with nav toggle, date nav, and
 * view pills, followed by attention/filters (filter-bar.tsx), then — only while the nav is hidden —
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
  attentionJobCount,
  attentionDateIso,
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
  attentionJobCount: number;
  attentionDateIso?: string;
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
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isDateNavPending, startDateNavTransition] = useTransition();
  const [focused, setFocused] = useState(false);
  const mobileToolsRef = useRef<HTMLDetailsElement>(null);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  useEffect(() => {
    // Reading localStorage after mount, same pattern as today-list-board.tsx's clock init.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFocused(localStorage.getItem(STORAGE_KEY) === "on");
  }, []);

  useEffect(() => {
    function handleShortcut(event: KeyboardEvent) {
      const target = event.target as HTMLElement;
      if (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (document.querySelector('[role="dialog"], [role="menu"], details[open], [aria-expanded="true"][aria-haspopup]')) return;
      const key = event.key.toLowerCase();
      const nextView = key === "b" ? "board" : key === "l" ? "list" : key === "w" ? "week" : key === "m" ? "month" : null;
      if (event.key === "?" || (event.shiftKey && event.key === "/")) {
        event.preventDefault();
        setShortcutsOpen((current) => !current);
        return;
      }
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

  useEffect(() => {
    if (focused) document.documentElement.dataset.focusMode = "calendar";
    else delete document.documentElement.dataset.focusMode;
    return () => {
      delete document.documentElement.dataset.focusMode;
    };
  }, [focused]);

  useEffect(() => {
    function closeMobileTools(event: PointerEvent) {
      const details = mobileToolsRef.current;
      if (!details?.open || details.contains(event.target as Node)) return;
      details.open = false;
      details.querySelector("summary")?.focus();
    }
    document.addEventListener("pointerdown", closeMobileTools);
    return () => document.removeEventListener("pointerdown", closeMobileTools);
  }, []);

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
    <div className="flex w-full min-w-0 flex-wrap items-start gap-x-3 gap-y-3 2xl:flex-nowrap 2xl:items-center 2xl:justify-between">
      <div className="flex min-w-0 max-w-full basis-full flex-1 flex-col gap-2 2xl:basis-auto">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={toggleFocus}
            aria-pressed={focused}
            aria-label={`Focus mode ${focused ? "on" : "off"}. ${focused ? "Show full calendar navigation" : "Focus on the schedule"}`}
            title={`Focus mode: ${focused ? "on" : "off"}`}
            className="co-button-secondary flex h-11 w-11 shrink-0 items-center justify-center !p-0"
          >
            <PanelLeft className="h-4 w-4" aria-hidden />
          </button>
          <div aria-busy={isDateNavPending} aria-label="Date navigation" className="flex items-center gap-2 rounded-xl border border-[var(--co-accent-text)]/25 bg-[var(--co-accent-tint)]/45 p-1">
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
            {isDateNavPending ? <span role="status" className="text-xs text-[var(--co-muted)]">Updating calendar…</span> : null}
          </div>
          <CalendarViewSelector view={view} axis={axis} focusDayIso={focusDayIso} />
          {view === "board" ? (
            <details className="relative shrink-0">
              <summary className="co-button-secondary flex min-h-11 cursor-pointer list-none items-center px-3 text-xs font-semibold [&::-webkit-details-marker]:hidden">Board settings</summary>
              <div className="absolute left-0 top-full z-20 mt-2 flex items-center gap-2 rounded-xl border border-[var(--co-line)] bg-[var(--co-surface)] p-2 shadow-[var(--co-shadow-popover)]">
                <CalendarAxisToggle axis={axis} />
              </div>
            </details>
          ) : null}
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <FilterBar employees={employees} attentionCount={attentionCount} />
          {attentionCount ? (
            <button
              type="button"
              onClick={() => window.dispatchEvent(new Event(ATTENTION_RAIL_TOGGLE_EVENT))}
              aria-controls="calendar-attention-rail"
              aria-label={`Review ${attentionCount} issue${attentionCount === 1 ? "" : "s"} across ${attentionJobCount} job${attentionJobCount === 1 ? "" : "s"}`}
              className="inline-flex min-h-11 items-center rounded-lg border border-[var(--co-warning)]/30 bg-[var(--co-spark-tint)]/25 px-3 text-xs font-semibold text-[var(--co-warning)] hover:bg-[var(--co-spark-tint)]/45"
            >
              Review {attentionCount} issue{attentionCount === 1 ? "" : "s"} · {attentionJobCount} job{attentionJobCount === 1 ? "" : "s"}
            </button>
          ) : null}
        </div>
      </div>
      <CalendarDaySummary totalEmployees={totalEmployees} {...dailySummary} />
      {focused ? (
        <div aria-label="Secondary calendar tools" className="order-2 ml-auto hidden shrink-0 items-center gap-2 rounded-xl border border-[var(--co-line-soft)] bg-[var(--co-surface-muted)]/35 px-1 sm:flex 2xl:order-none 2xl:ml-0">
          <div className="mx-1 h-6 w-px bg-[var(--co-line-soft)]" aria-hidden />
          <GlobalSearch variant="icon" />
          <NotificationsMenu initialNotifications={initialNotifications} portal />
          <CreateMenu
            compact
            portal
            leadingItem={{ href: "/jobs/new", label: "Schedule a job" }}
            appointments={{ staffRoster, defaultDate: appointmentDefaultDate }}
          />
          <details open={shortcutsOpen} onToggle={(event) => setShortcutsOpen(event.currentTarget.open)} className="relative">
            <summary className="co-button-secondary flex min-h-11 cursor-pointer list-none items-center px-3 text-xs font-semibold [&::-webkit-details-marker]:hidden">Keyboard shortcuts</summary>
            <div className="absolute right-0 top-full z-20 mt-2 w-56 rounded-xl border border-[var(--co-line)] bg-[var(--co-surface)] p-3 text-xs shadow-[var(--co-shadow-popover)]">
              <p className="font-semibold text-[var(--co-ink)]">Calendar keyboard shortcuts</p>
              <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[var(--co-muted)]">
                <dt className="font-semibold text-[var(--co-body)]">← / →</dt><dd>Previous / next period</dd>
                <dt className="font-semibold text-[var(--co-body)]">T</dt><dd>Go to today</dd>
                <dt className="font-semibold text-[var(--co-body)]">B / L</dt><dd>Board / daily list</dd>
                <dt className="font-semibold text-[var(--co-body)]">W / M</dt><dd>Week / month</dd>
                <dt className="font-semibold text-[var(--co-body)]">?</dt><dd>Show or hide this guide</dd>
              </dl>
            </div>
          </details>
        </div>
      ) : null}
      {focused ? (
        <details ref={mobileToolsRef} className="relative order-2 ml-auto shrink-0 sm:hidden" onClick={(event) => {
          if ((event.target as HTMLElement).closest("summary")) return;
          window.setTimeout(() => {
            const details = mobileToolsRef.current;
            if (!details?.open) return;
            details.open = false;
            details.querySelector("summary")?.focus();
          }, 0);
        }}>
          <summary className="co-button-secondary flex min-h-11 cursor-pointer list-none items-center px-3 text-xs font-semibold [&::-webkit-details-marker]:hidden">More calendar tools</summary>
          <div className="absolute right-0 top-full z-20 mt-2 flex min-w-52 flex-col gap-2 rounded-xl border border-[var(--co-line)] bg-[var(--co-surface)] p-2 shadow-[var(--co-shadow-popover)]">
            <GlobalSearch variant="icon" />
            <NotificationsMenu initialNotifications={initialNotifications} portal />
            <CreateMenu
              compact
              portal
              leadingItem={{ href: "/jobs/new", label: "Schedule a job" }}
              appointments={{ staffRoster, defaultDate: appointmentDefaultDate }}
            />
            <button type="button" onClick={() => setShortcutsOpen((current) => !current)} className="min-h-11 rounded-md px-3 text-left text-xs font-semibold text-[var(--co-body)] hover:bg-[var(--co-surface-muted)]">{shortcutsOpen ? "Hide keyboard shortcuts" : "Show keyboard shortcuts"}</button>
            {shortcutsOpen ? <div className="border-t border-[var(--co-line-soft)] px-3 pt-2 text-xs text-[var(--co-muted)]">← / → periods · T today · B/L board/daily list · W/M week/month · ? shortcuts</div> : null}
          </div>
        </details>
      ) : null}
      <CompactDaySummary totalEmployees={totalEmployees} {...dailySummary} />
    </div>
  );
}
