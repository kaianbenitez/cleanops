import { eq } from "drizzle-orm";
import { CheckCircle2, Clock3, Phone, Wrench } from "lucide-react";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { companies } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";

const RELEASES = [
  {
    version: "v0.1.0",
    date: "July 30, 2026",
    title: "Customer profile improvements",
    changes: [
      "House details are easier to scan with compact room and home-information icons.",
      "Service notes now stay compact and omit empty legacy fields.",
      "Customer note fields can be expanded by dragging their lower-right corner.",
      "My Day discard now undoes a clock-in without completing the job.",
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
        <p className="page-subtitle">Find help, contact the office, and see what&apos;s new in CleanOps.</p>
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
