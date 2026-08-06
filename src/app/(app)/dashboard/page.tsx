import { Suspense } from "react";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { companies } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import { resolveRange } from "@/lib/dashboard/range";
import type { DashboardRange } from "@/lib/dashboard/types";
import { Skeleton } from "@/components/ui/skeleton";
import DateRangeControls from "./date-range-controls";
import TodaysRun from "./todays-run";
import TechnicianRoutes from "./technician-routes";
import CashToCollect from "./cash-to-collect";
import OperationsOverview from "./operations-overview";

type SearchParams = { from?: string; to?: string; preset?: string };
const cardSkeleton = (
  <div className="co-card p-5">
    <Skeleton className="h-5 w-32" />
    <Skeleton className="mt-4 h-16 w-full" />
  </div>
);

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const admin = await getCurrentUser();
  if (!admin) redirect("/login");
  if (admin.role !== "admin") redirect("/my-day");
  const company = await db
    .select({ timezone: companies.timezone, settings: companies.settings })
    .from(companies)
    .where(eq(companies.id, admin.companyId))
    .limit(1)
    .then((rows) => rows[0] ?? null);
  if (!company) redirect("/login");
  const range: DashboardRange = resolveRange(
    await searchParams,
    company.timezone,
  );
  const revenueTargetCents =
    typeof (company.settings as { revenueTargetCents?: unknown } | null)
      ?.revenueTargetCents === "number"
      ? (company.settings as { revenueTargetCents: number }).revenueTargetCents
      : null;
  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="page-title">Performance overview</h1>
          <p className="page-subtitle">
            Client growth, paid revenue, and quote performance for your
            business.
          </p>
        </div>
        <DateRangeControls
          preset={range.preset}
          fromIso={range.fromIso}
          toIso={range.toIso}
        />
      </header>
      <Suspense
        fallback={
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {cardSkeleton}
            {cardSkeleton}
            {cardSkeleton}
            {cardSkeleton}
          </div>
        }
      >
        <OperationsOverview
          companyId={admin.companyId}
          range={range}
          revenueTargetCents={revenueTargetCents}
        />
      </Suspense>
      <section className="space-y-4 pt-2" aria-labelledby="operations-title">
        <div>
          <h2
            id="operations-title"
            className="text-xl font-semibold tracking-[-0.02em] text-[var(--co-ink)]"
          >
            Operations today
          </h2>
          <p className="mt-1 text-sm text-[var(--co-muted)]">
            Schedule, cleaner routes, and invoices that need follow-up.
          </p>
        </div>
        <div className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
          <Suspense fallback={cardSkeleton}>
            <TodaysRun companyId={admin.companyId} todayIso={range.todayIso} />
          </Suspense>
          <Suspense fallback={cardSkeleton}>
            <TechnicianRoutes
              companyId={admin.companyId}
              todayIso={range.todayIso}
            />
          </Suspense>
        </div>
        <div className="grid gap-5 xl:grid-cols-2">
          <Suspense fallback={cardSkeleton}>
            <CashToCollect companyId={admin.companyId} />
          </Suspense>
        </div>
      </section>
    </div>
  );
}
