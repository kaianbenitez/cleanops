import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import DatePicker, { CalendarViewSelector } from "./date-picker";
import NewAppointmentButton from "./new-appointment-button";
import CalendarFocusMode from "./calendar-focus-mode";

type StaffMember = { id: string; firstName: string; lastName: string };

/** Row-1 layout only. Date/view routing stays in date-picker.tsx; the
 * prev/next/today hrefs are computed by page.tsx from the current search
 * params and just rendered here. */
export default function CalendarToolbar({
  view,
  currentDate,
  dateLabel,
  focusDayIso,
  prevHref,
  nextHref,
  todayHref,
  staffRoster,
  appointmentDefaultDate,
}: {
  view: string;
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
}) {
  return (
    <div className="flex w-full min-w-max items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <CalendarFocusMode />
        <Link
          href={prevHref}
          aria-label="Previous period"
          className="co-button-secondary min-h-11 w-11 !px-0"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
        </Link>
        <DatePicker view={view} value={currentDate} label={dateLabel} />
        <Link
          href={nextHref}
          aria-label="Next period"
          className="co-button-secondary min-h-11 w-11 !px-0"
        >
          <ChevronRight className="h-4 w-4" aria-hidden />
        </Link>
        <Link href={todayHref} className="co-button-secondary">
          Today
        </Link>
      </div>
      <div className="flex items-center gap-2">
        <CalendarViewSelector view={view} focusDayIso={focusDayIso} />
        <NewAppointmentButton staffRoster={staffRoster} defaultDate={appointmentDefaultDate} />
        <Link href="/jobs/new" className="co-button-primary">
          Schedule job
        </Link>
      </div>
    </div>
  );
}
