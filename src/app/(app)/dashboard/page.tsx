import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { companies } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import { monthRangeBefore, quarterRangeFor, resolveRange, startOfMonthIso } from "@/lib/dashboard/range";
import type { DashboardRange } from "@/lib/dashboard/types";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import DateRangeControls from "./date-range-controls";
import OperationsOverview from "./operations-overview";

type SearchParams = { from?: string; to?: string; preset?: string };
const cardSkeleton = <div className="co-card p-5"><Skeleton className="h-5 w-32" /><Skeleton className="mt-4 h-16 w-full" /></div>;

export default async function DashboardPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const admin = await getCurrentUser();
  if (!admin) redirect("/login");
  if (admin.role !== "admin") redirect("/my-day");
  const company = await db.select({ timezone: companies.timezone, settings: companies.settings }).from(companies).where(eq(companies.id, admin.companyId)).limit(1).then((rows) => rows[0] ?? null);
  if (!company) redirect("/login");
  const range: DashboardRange = resolveRange(await searchParams, company.timezone);
  const revenueTargetCents = typeof (company.settings as { revenueTargetCents?: unknown } | null)?.revenueTargetCents === "number" ? (company.settings as { revenueTargetCents: number }).revenueTargetCents : null;
  const lastMonth = monthRangeBefore(range.todayIso);
  const quarter = quarterRangeFor(range.todayIso);
  return <div className="space-y-6"><header className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="page-title">Dashboard</h1><p className="page-subtitle">Client, revenue, and quote performance at a glance.</p></div><div className="flex gap-2"><Button render={<Link href="/jobs/new" />} className="min-h-11">New job</Button><Button render={<Link href="/quotes/new" />} variant="outline" className="min-h-11">New quote</Button></div></header><DateRangeControls todayIso={range.todayIso} monthStartIso={startOfMonthIso(range.todayIso)} lastMonthStartIso={lastMonth.fromIso} lastMonthEndIso={lastMonth.toIso} quarterStartIso={quarter.fromIso} quarterEndIso={quarter.toIso} fromIso={range.fromIso} toIso={range.toIso} /><Suspense fallback={<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{cardSkeleton}{cardSkeleton}{cardSkeleton}{cardSkeleton}</div>}><OperationsOverview companyId={admin.companyId} range={range} revenueTargetCents={revenueTargetCents} /></Suspense></div>;
}
