import { eq } from "drizzle-orm";
import { CheckCircle2, Clock3, Phone, Wrench } from "lucide-react";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { companies } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";

const RELEASES = [
  {
    version: "v0.2.29",
    date: "August 10, 2026",
    title: "A stronger opening image for the ServiceSpark page",
    changes: [
      "The homepage now leads with the dashboard screenshot instead of the calendar, and the calendar moved down to the 'one operating rhythm' section with its own caption.",
      "Removed a leftover caption line under the homepage's main screenshot.",
    ],
  },
  {
    version: "v0.2.28",
    date: "August 10, 2026",
    title: "Landing page copy, colors, and content refresh",
    changes: [
      "The 'Join the beta' section is easier on the eyes now — no more full-screen bright blue.",
      "'More than the basics' now points to notifications and fully customizable settings (pricing, quote presentation, add-ons, service catalog, payroll tiers) instead of two cards that weren't ready yet.",
      "The crew app description and the 'Built for the field' section now mention the feedback-and-tip link, payment tagging, and schedule visibility cleaners already have.",
      "The crew app screenshot in the feature list is properly sized now instead of floating oddly.",
      "The homepage headline, subhead, and page title were rewritten for search and clarity.",
    ],
  },
  {
    version: "v0.2.27",
    date: "August 10, 2026",
    title: "A shorter, tighter ServiceSpark landing page",
    changes: [
      "The feature list is now a click-through set of tabs instead of one long scrolling list, so the page reads in far less scrolling.",
      "The 'More than the basics' section now highlights instant global search and time-off/PTO tracking in place of supplies and recurring service plans, which aren't ready to show yet.",
    ],
  },
  {
    version: "v0.2.26",
    date: "August 10, 2026",
    title: "A livelier ServiceSpark landing page",
    changes: [
      "The public ServiceSpark page now has a dedicated 'Built for the field' showcase for the My Day crew app, with a phone-in-hand view of a real workday.",
      "A new 'More than the basics' section highlights quality and feedback reports, reporting and CSV export, GoHighLevel automation, recurring service plans, supplies, and the team directory.",
      "Scrolling through the page now feels smoother and more polished, with motion that eases in as you scroll and turns off automatically if you've asked your device to reduce motion.",
    ],
  },
  {
    version: "v0.2.25",
    date: "August 9, 2026",
    title: "Rotational task reminders for recurring clients",
    changes: [
      "Calendar and My Day now show the current Week 1–4 rotation plus the complete reference checklist for recurring-client visits, including the every-time couch-cushion task.",
    ],
  },
  {
    version: "v0.2.24",
    date: "August 8, 2026",
    title: "Supplies temporarily tucked away",
    changes: [
      "Supplies is temporarily hidden from the main navigation while the rest of the workspace remains available.",
    ],
  },
  {
    version: "v0.2.23",
    date: "August 8, 2026",
    title: "A collapsible desktop navigation",
    changes: [
      "Minimize the desktop navigation to an icon-only rail when you need more working space, then expand it again from the sidebar.",
    ],
  },
  {
    version: "v0.2.22",
    date: "August 8, 2026",
    title: "Internally approved quotes now close the loop",
    changes: [
      "Scheduling a quote after approval received outside the customer proposal now marks it Accepted, while preserving the staff note that no customer signature was collected.",
    ],
  },
  {
    version: "v0.2.21",
    date: "August 7, 2026",
    title: "A compact Calendar control panel",
    changes: [
      "Calendar navigation, view tabs, summaries, and filters now live in one clearer dispatch control panel.",
      "Daily job count and projected revenue now use labeled summary metrics, with icons for filter and unassigned-work actions.",
    ],
  },
  {
    version: "v0.2.20",
    date: "August 7, 2026",
    title: "Simpler Calendar dispatch controls",
    changes: [
      "Calendar view buttons now use the shorter Vertical and Horizontal labels.",
      "The staff-board assignment strip was removed; the calendar toolbar now includes daily projected revenue and an Unassigned jobs button.",
    ],
  },
  {
    version: "v0.2.19",
    date: "August 7, 2026",
    title: "Visible Calendar views and right-aligned filters",
    changes: [
      "Calendar now shows Week, Month, Day, Employee vertical, and Employee horizontal as visible view buttons.",
      "Calendar job counts and filters now align to the right side of their row.",
    ],
  },
  {
    version: "v0.2.18",
    date: "August 7, 2026",
    title: "A full-width Calendar dispatch board",
    changes: [
      "The calendar view selector now sits at the far right of the date-navigation row.",
      "Unassigned work no longer reserves a permanent right column; use the Unassigned jobs button to open it only when needed.",
    ],
  },
  {
    version: "v0.2.17",
    date: "August 7, 2026",
    title: "A single-row Calendar toolbar",
    changes: [
      "The date picker, calendar view selector, and date navigation now stay together on one scrollable row instead of stacking.",
      "The Staff board starts directly with dispatch controls, without the redundant Staff Daily heading and sort action.",
    ],
  },
  {
    version: "v0.2.16",
    date: "August 7, 2026",
    title: "A full unassigned queue in Calendar",
    changes: [
      "Calendar now lets dispatchers expand the unassigned queue into the page, so every waiting job remains reachable without a cramped nested scroll area.",
    ],
  },
  {
    version: "v0.2.15",
    date: "August 7, 2026",
    title: "Start recurring service from a customer profile",
    changes: [
      "Customer profiles now include a Set up recurring service action that opens the schedule with the customer already selected.",
    ],
  },
  {
    version: "v0.2.14",
    date: "August 7, 2026",
    title: "Calendar controls that fit every screen",
    changes: [
      "The Calendar date picker now stays fully visible on smaller screens.",
      "Calendar, dashboard, report, and form date controls now share clearer calendar styling and more comfortable touch targets.",
    ],
  },
  {
    version: "v0.2.13",
    date: "August 7, 2026",
    title: "Clearer product examples on the ServiceSpark page",
    changes: [
      "Feature screenshots are now much bigger and easier to read, and each feature has its own icon.",
      "The crew app now uses the real device photo provided by the founder.",
      "Customer-record and quote examples now show real customer and public proposal pages instead of internal lists.",
      "The beta sign-up section now says what it needs to say once, without repeating itself.",
    ],
  },
  {
    version: "v0.2.12",
    date: "August 7, 2026",
    title: "A clearer beta sign-up page",
    changes: [
      "The ServiceSpark feature list is now easier to scan without side-scrolling.",
      "The FAQ now answers more of the practical questions people ask before switching.",
      "Every sign-up button now clearly says ServiceSpark is in beta and free to join, rather than implying a paid product.",
    ],
  },
  {
    version: "v0.2.11",
    date: "August 7, 2026",
    title: "A clearer, more complete ServiceSpark landing page",
    changes: [
      "The public ServiceSpark page now focuses on the product itself, with the previous comparison table removed.",
      "Product examples are easier to read, and the crew app is now shown in a real phone frame.",
      "The page has more visual variety from section to section, and its examples now show a fuller cleaning business with more customers, paid invoices, and team members.",
    ],
  },
  {
    version: "v0.2.10",
    date: "August 7, 2026",
    title: "A more complete ServiceSpark landing page",
    changes: [
      "The ServiceSpark page now shows how it compares with pen and paper, spreadsheets, calendars, and generic scheduling software.",
      "You can browse the full lineup of scheduling, field work, customer, quote, invoicing, and payroll features in one place.",
      "The page now explains the real cleaning-business experience behind ServiceSpark and answers common early-access questions.",
    ],
  },
  {
    version: "v0.2.9",
    date: "August 7, 2026",
    title: "A clearer ServiceSpark early-access page",
    changes: [
      "The public ServiceSpark page now shows real examples of scheduling, field work, customer records, quotes, invoicing, payroll-related team tracking, and the dashboard.",
      "Early-access requests now only require a business name and email address.",
    ],
  },
  {
    version: "v0.2.8",
    date: "August 7, 2026",
    title: "Faster manual time entry",
    changes: [
      "When logging a technician's time by hand on a job, you can now enter total hours worked instead of separate start and end times.",
      "Manual time entry no longer asks you to pick a date -- it always uses the job's own scheduled date.",
    ],
  },
  {
    version: "v0.2.6",
    date: "August 7, 2026",
    title: "Per-visit price and Job Ticket Hours adjustments",
    changes: [
      "Administrators can now adjust the price charged or Job Ticket Hours for one job occurrence without changing its recurring schedule.",
      "Manually set Job Ticket Hours now stay in place when payroll is refreshed.",
    ],
  },
  {
    version: "v0.2.7",
    date: "August 7, 2026",
    title: "Customer added dates",
    changes: [
      "You can now see when each customer was added, on their customer list card and on their profile page.",
    ],
  },
  {
    version: "v0.2.5",
    date: "August 7, 2026",
    title: "Sales reports and smoother previews",
    changes: [
      "Sales report added to Reports & Exports, with leads, quote progress, and recurring client activity in one place.",
      "Report previews now expand directly in their cards instead of popping up as a separate window.",
    ],
  },
  {
    version: "v0.2.4",
    date: "August 7, 2026",
    title: "Reports and exports center",
    changes: [
      "Administrators can now preview and download payroll, tips, accounts receivable, and jobs reports from one place.",
      "Reports support a shared date range, and accounts receivable and jobs can be narrowed to a customer area.",
    ],
  },
  {
    version: "v0.2.3",
    date: "August 7, 2026",
    title: "Safer quote scheduling and clearer sales records",
    changes: [
      "Room counts entered while creating a quote now update the customer profile automatically.",
      "Dashboard accepted and booked quote totals now use the date the customer accepted the quote.",
      "Scheduling a quote without a customer signature now requires a staff reason and is clearly recorded on the quote.",
    ],
  },
  {
    version: "v0.2.2",
    date: "August 7, 2026",
    title: "Clearer navigation and calendar notes",
    changes: [
      "The account menu at the bottom of the sidebar now stays available, even in shorter browser windows.",
      "Older customer notes in Calendar now show normal punctuation instead of stray text codes.",
    ],
  },
  {
    version: "v0.2.1",
    date: "August 6, 2026",
    title: "Clearer dashboard reporting",
    changes: [
      "Simplified the Dashboard date filter into one compact control, with quick choices for recent weeks, months, and years plus a custom date range when needed.",
      "Dashboard reporting controls now stay alongside the page heading, with the selected date range always visible and ready to adjust.",
      "Removed duplicate quote numbers and extra create buttons so the Dashboard stays focused on the information that matters.",
      "Today’s schedule is now a full table with the time, customer, cleaning type, location, assigned cleaners, and job status for every visit.",
    ],
  },
  {
    version: "v0.2.0",
    date: "August 6, 2026",
    title: "Operations dashboard refresh",
    changes: [
      "The Dashboard now brings client growth, quote conversion, weekly paid revenue, quote pipeline, and sales performance into one view.",
      "Dashboard insights now call out conversion changes, progress toward the configured revenue target, and sent quotes that have been waiting more than seven days.",
    ],
  },
  {
    version: "v0.1.9",
    date: "August 6, 2026",
    title: "Early access requests are ready",
    changes: [
      "The public ServiceSpark page is now available to visitors who are not signed in.",
      "Early-access requests now reach the ServiceSpark team without sending visitors to the login screen.",
    ],
  },
  {
    version: "v0.1.8",
    date: "August 6, 2026",
    title: "ServiceSpark early access is open",
    changes: [
      "Cleaning-business owners can now learn about ServiceSpark's scheduling, field, customer, quoting, invoicing, payroll, and visibility tools on a new public page.",
      "Interested owners can request early access with a simple form, without needing to create an account first.",
    ],
  },
  {
    version: "v0.1.7",
    date: "August 6, 2026",
    title: "A refreshed ServiceSpark look",
    changes: [
      "The login screen now has a cleaner, centered layout with a fresh ServiceSpark sparkle mark.",
      "The same updated mark now appears in the app navigation and browser tab for a more consistent look.",
    ],
  },
  {
    version: "v0.1.6",
    date: "August 6, 2026",
    title: "Cleaning equipment counts before each stop",
    changes: [
      "Cleaners can now see mop-head, rag, and vacuum counts on My Day before heading to a home.",
      "Administrators can save the real counts on each customer profile; a clearly marked mop-head estimate is shown only when room details are available and no confirmed count has been set.",
    ],
  },
  {
    version: "v0.1.5",
    date: "August 6, 2026",
    title: "Clearer job cancellations and cleaner route prep",
    changes: [
      "Cancelling a job now asks for the reason right in the page or calendar panel, instead of opening a browser popup.",
      "My Day now shows each job's service type, gives cleaners a Job details link before leaving, and keeps next-stop entry instructions and access codes close at hand.",
    ],
  },
  {
    version: "v0.1.4",
    date: "August 6, 2026",
    title: "Secure Square and Maps setup",
    changes: [
      "Administrators can now securely save Square and Google Maps API keys under Settings → Square & Google Maps. Keys are encrypted and are never shown again once saved.",
      "Nothing changes today because no real keys are configured yet: Square remains in its current test mode, and Maps behavior is unchanged.",
    ],
  },
  {
    version: "v0.1.3",
    date: "August 5, 2026",
    title: "Self-service Square and Maps setup",
    changes: [
      "Administrators can now save Square invoicing and Google Maps connection keys in Settings. The saved values are encrypted and are never shown again after saving.",
      "Route maps now remember a customer address after it is first located, reducing repeat Google Maps lookups.",
    ],
  },
  {
    version: "v0.1.2",
    date: "August 4, 2026",
    title: "CleanOps is now ServiceSpark",
    changes: [
      "CleanOps has a new name: ServiceSpark. It's the same product and team, with the new branding now throughout the app, including navigation and the login screen.",
      "A complete Privacy Policy is now available in the Legal section, explaining what information we collect, how we use it, and how we protect it.",
    ],
  },
  {
    version: "v0.1.1",
    date: "August 3-4, 2026",
    title: "Customer tools, smoother navigation, and stronger privacy",
    changes: [
      "Improved navigation on phones and mid-size screens: pages stay centered, the menu includes the same items as desktop, and search remains available.",
      "Customers can now be sorted by name or by when they were added.",
      "Customer search now finds phone numbers, with new service-history, cancelled-job, and repeat-customer filters plus a highest-revenue sort.",
      "Quick-cancelling an unassigned job now asks for a cancellation reason first.",
      "Proactively found and closed a privacy gap that could have allowed customer and staff records to be viewed without signing in. All data access now requires proper authorization.",
    ],
  },
  {
    version: "v0.1.0",
    date: "July 30, 2026",
    title: "Field updates and customer-profile polish",
    changes: [
      "House details are easier to scan with compact room and home-information icons.",
      "Service notes now stay compact and omit empty legacy fields.",
      "Customer note fields can be expanded by dragging their lower-right corner.",
      "My Day discard now undoes a clock-in without completing the job.",
      "Admins receive bell notifications when cleaners are on the way, finish work, add close-out information, or upload before/after photos.",
      "Cleaners can record payment methods, check numbers, and damage notes when closing out a job.",
      "Calendar staff boards gained improved daily lanes, cleaner search, property context, and more reliable drag behavior.",
    ],
  },
  {
    version: "v0.0.5",
    date: "July 29, 2026",
    title: "Dispatch, calendar, and team operations",
    changes: [
      "Added a Staff Daily calendar view, employee color coding, column ordering, and a later daily schedule window.",
      "Calendar jobs can open in a quick detail panel with service, price, customer, room, and house information.",
      "Dispatchers can reschedule, change amounts, cancel jobs, assign crews, and set exact start times from the calendar.",
      "The Calendar List view now shows clock status, inline cancellation and rescheduling, and clearer service details.",
      "Admins can also work as field staff, and inactive employees remain available in historical records.",
      "Customer profiles now show upcoming visits with the option to expand the list.",
    ],
  },
  {
    version: "v0.0.4",
    date: "July 27-28, 2026",
    title: "Reliable scheduling and safer administration",
    changes: [
      "Calendar dispatch now supports week and month views, lane rescheduling, undo, conflict warnings, holidays, weekend work, and working-day settings.",
      "Added accessible crew assignment controls, searchable pickers, and improved availability handling.",
      "Jobs, customers, and invoices received faster filtering, pagination, and more accurate operational metrics.",
      "Settings now include clearer payroll tiers, room types, services, quote-template storage, and GHL configuration safeguards.",
      "Login and account security improved with stronger passwords, CAPTCHA support, and administrator password resets.",
      "Schema-drift checks and browser smoke-test coverage were added to help catch production issues before release.",
    ],
  },
  {
    version: "v0.0.3",
    date: "July 24-26, 2026",
    title: "Operations workspace redesign",
    changes: [
      "Rebuilt the Jobs workspace with active, pending, and history views, operational metrics, filters, audit history, and manual time entry.",
      "Reworked Job Detail around customer context, service progress, team coordination, photos, and close-out actions.",
      "Redesigned customer profiles with residential/commercial details, room counts, access instructions, payment status, notes, and cleaner preferences.",
      "Added employee profile photos, account-management improvements, and schedule-agenda views.",
      "Expanded the dashboard with revenue, cash, crew-coverage, date-range, and operations views.",
      "Improved quotes with address-aware pricing, lead handoff, clearer proposal service details, and stronger acceptance safeguards.",
    ],
  },
  {
    version: "v0.0.2",
    date: "July 19-23, 2026",
    title: "Core operations foundation",
    changes: [
      "Introduced the ServiceSpark design system and refreshed the dashboard, quoting, My Day, and public proposal experiences.",
      "Added employee accounts, self-service password changes, configurable payroll brackets, and multi-cleaner job assignment.",
      "Added TheCustomerFactor customer import and recurring-service backfill support.",
      "Improved navigation speed, search, route previews, customer filters, and date handling.",
      "Added monitoring, deployment configuration, environment checks, backups, and initial automated smoke testing.",
    ],
  },
  {
    version: "v0.0.1",
    date: "July 18, 2026",
    title: "Initial ServiceSpark build",
    changes: [
      "Launched the first ServiceSpark operations workspace for customers, jobs, quotes, scheduling, payroll, and field work.",
    ],
  },
];

export default async function HelpCenterPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const company = await db
    .select({ settings: companies.settings })
    .from(companies)
    .where(eq(companies.id, user.companyId))
    .limit(1)
    .then((rows) => rows[0] ?? null);
  const branding = ((
    company?.settings as { branding?: { phone?: string | null } } | null
  )?.branding ?? null) as { phone?: string | null } | null;
  const officePhone = branding?.phone ?? null;

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <p className="eyebrow">Support</p>
        <h1 className="page-title mt-2">Help Center</h1>
        <p className="page-subtitle">
          Find help, contact the office, and see what&apos;s new in
          ServiceSpark.
        </p>
      </div>

      <div className="co-card space-y-4 p-5">
        {officePhone ? (
          <a
            href={`tel:${officePhone}`}
            className="co-button-primary justify-center gap-1.5"
          >
            <Phone className="h-4 w-4" aria-hidden />
            Call the office · {officePhone}
          </a>
        ) : (
          <p className="text-sm text-[var(--co-muted)]">
            No office phone number is on file yet. Contact your administrator.
          </p>
        )}
        <p className="text-sm leading-6 text-[var(--co-muted)]">
          For anything urgent while you&apos;re on a job — access issues,
          schedule changes, or a customer question — call the office and someone
          will help right away.
        </p>
      </div>

      <section className="co-card overflow-hidden">
        <div className="border-b border-[var(--co-line-soft)] px-5 py-4 sm:px-6">
          <div className="flex items-center gap-2 text-[var(--co-evergreen)]">
            <Clock3 className="h-5 w-5" aria-hidden />
            <p className="eyebrow text-[var(--co-evergreen)]">
              Product updates
            </p>
          </div>
          <h2 className="mt-2 text-lg font-semibold">Changelog</h2>
          <p className="mt-1 text-sm text-[var(--co-muted)]">
            A plain-language record of new features, improvements, and fixes.
          </p>
        </div>
        <div className="divide-y divide-[var(--co-line-soft)]">
          {RELEASES.map((release) => (
            <article key={release.version} className="px-5 py-5 sm:px-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-[var(--co-evergreen)] px-2.5 py-1 text-xs font-bold text-white">
                    {release.version}
                  </span>
                  <h3 className="font-semibold">{release.title}</h3>
                </div>
                <time className="text-xs font-medium text-[var(--co-muted)]">
                  {release.date}
                </time>
              </div>
              <ul className="mt-4 space-y-2.5">
                {release.changes.map((change) => (
                  <li
                    key={change}
                    className="flex gap-2.5 text-sm leading-5 text-[var(--co-muted)]"
                  >
                    <CheckCircle2
                      className="mt-0.5 h-4 w-4 shrink-0 text-[var(--co-success)]"
                      aria-hidden
                    />
                    {change}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <aside className="co-card flex items-start gap-3 p-5">
        <Wrench
          className="mt-0.5 h-5 w-5 shrink-0 text-[var(--co-evergreen)]"
          aria-hidden
        />
        <p className="text-sm leading-6 text-[var(--co-muted)]">
          For urgent access issues, schedule changes, or customer questions
          while you&apos;re on a job, call the office for immediate help.
        </p>
      </aside>
    </div>
  );
}
