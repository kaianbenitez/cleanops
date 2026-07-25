import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { companies } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import { resolveRange, startOfMonthIso, startOfWeekIso } from "@/lib/dashboard/range";
import type { DashboardRange } from "@/lib/dashboard/types";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import DateRangeControls from "./date-range-controls";
import ExceptionStrip from "./exception-strip";
import PulseTiles from "./pulse-tiles";
import TodaysRun from "./todays-run";
import TechnicianRoutes from "./technician-routes";

type SearchParams = { from?: string; to?: string; preset?: string };
const cardSkeleton = <div className="co-card p-5"><Skeleton className="h-5 w-32" /><Skeleton className="mt-4 h-16 w-full" /></div>;

export default async function DashboardPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const admin = await getCurrentUser();
  if (!admin) redirect("/login");
  if (admin.role !== "admin") redirect("/my-day");
  const company = await db.select({ timezone: companies.timezone }).from(companies).where(eq(companies.id, admin.companyId)).limit(1).then((rows) => rows[0] ?? null);
  if (!company) redirect("/login");
  const range: DashboardRange = resolveRange(await searchParams, company.timezone);
  return <div className="space-y-6"><header className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="page-title">Dashboard</h1><p className="page-subtitle">Today&apos;s execution and the blockers that need attention.</p></div><div className="flex gap-2"><Button render={<Link href="/jobs/new" />} className="min-h-11">New job</Button><Button render={<Link href="/quotes/new" />} variant="outline" className="min-h-11">New quote</Button></div></header><DateRangeControls todayIso={range.todayIso} weekStartIso={startOfWeekIso(range.todayIso)} monthStartIso={startOfMonthIso(range.todayIso)} fromIso={range.fromIso} toIso={range.toIso} /><Suspense fallback={<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{cardSkeleton}{cardSkeleton}{cardSkeleton}{cardSkeleton}</div>}><PulseTiles companyId={admin.companyId} range={range} /></Suspense><div className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]"><Suspense fallback={cardSkeleton}><TodaysRun companyId={admin.companyId} todayIso={range.todayIso} /></Suspense><Suspense fallback={cardSkeleton}><TechnicianRoutes companyId={admin.companyId} todayIso={range.todayIso} /></Suspense></div><Suspense fallback={cardSkeleton}><ExceptionStrip companyId={admin.companyId} todayIso={range.todayIso} /></Suspense></div>;
}
