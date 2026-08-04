import { eq } from "drizzle-orm";
import { CheckCircle2, Clock3, Phone, Wrench } from "lucide-react";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { companies } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";

const RELEASES = [
  {
    version: "v0.1.2",
    date: "August 4, 2026",
    title: "CleanOps is now ServiceSpark",
    changes: [
      "CleanOps has a new name: ServiceSpark. It&apos;s the same product and team, with the new branding now throughout the app, including navigation and the login screen.",
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
  const branding = ((company?.settings as { branding?: { phone?: string | null } } | null)?.branding ?? null) as { phone?: string | null } | null;
  const officePhone = branding?.phone ?? null;

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <p className="eyebrow">Support</p>
        <h1 className="page-title mt-2">Help Center</h1>
        <p className="page-subtitle">Find help, contact the office, and see what&apos;s new in ServiceSpark.</p>
      </div>

      <div className="co-card space-y-4 p-5">
        {officePhone ? (
          <a href={`tel:${officePhone}`} className="co-button-primary justify-center gap-1.5">
            <Phone className="h-4 w-4" aria-hidden />
            Call the office · {officePhone}
          </a>
        ) : (
          <p className="text-sm text-[var(--co-muted)]">No office phone number is on file yet. Contact your administrator.</p>
        )}
        <p className="text-sm leading-6 text-[var(--co-muted)]">
          For anything urgent while you&apos;re on a job — access issues, schedule changes, or a customer question — call the office and someone will help right away.
        </p>
      </div>

      <section className="co-card overflow-hidden">
        <div className="border-b border-[var(--co-line-soft)] px-5 py-4 sm:px-6">
          <div className="flex items-center gap-2 text-[var(--co-evergreen)]"><Clock3 className="h-5 w-5" aria-hidden /><p className="eyebrow text-[var(--co-evergreen)]">Product updates</p></div>
          <h2 className="mt-2 text-lg font-semibold">Changelog</h2>
          <p className="mt-1 text-sm text-[var(--co-muted)]">A plain-language record of new features, improvements, and fixes.</p>
        </div>
        <div className="divide-y divide-[var(--co-line-soft)]">
          {RELEASES.map((release) => (
            <article key={release.version} className="px-5 py-5 sm:px-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2"><span className="rounded-full bg-[var(--co-evergreen)] px-2.5 py-1 text-xs font-bold text-white">{release.version}</span><h3 className="font-semibold">{release.title}</h3></div>
                <time className="text-xs font-medium text-[var(--co-muted)]">{release.date}</time>
              </div>
              <ul className="mt-4 space-y-2.5">
                {release.changes.map((change) => <li key={change} className="flex gap-2.5 text-sm leading-5 text-[var(--co-muted)]"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--co-success)]" aria-hidden />{change}</li>)}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <aside className="co-card flex items-start gap-3 p-5">
        <Wrench className="mt-0.5 h-5 w-5 shrink-0 text-[var(--co-evergreen)]" aria-hidden />
        <p className="text-sm leading-6 text-[var(--co-muted)]">For urgent access issues, schedule changes, or customer questions while you&apos;re on a job, call the office for immediate help.</p>
      </aside>
    </div>
  );
}
