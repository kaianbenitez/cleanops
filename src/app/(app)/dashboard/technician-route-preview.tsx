"use client";

import { useMemo, useState } from "react";
import RoutePreview from "../calendar/route-preview";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type RouteStop = {
  id: string;
  firstName: string;
  lastName: string;
  address: string;
  city: string;
  zip: string;
  time: string;
  customerId: string;
  latitude?: number | null;
  longitude?: number | null;
};

export type TechnicianRoute = {
  employeeId: string;
  employeeName: string;
  jobs: RouteStop[];
};

export default function TechnicianRoutePreview({
  routes,
  fallbackTitle = "Today's route",
  apiKey,
}: {
  routes: TechnicianRoute[];
  fallbackTitle?: string;
  apiKey: string | null;
}) {
  const [selectedId, setSelectedId] = useState(routes.find((route) => route.jobs.length > 0)?.employeeId ?? "all");

  const mergedJobs = useMemo(() => routes.flatMap((route) => route.jobs), [routes]);
  const selectItems = useMemo(
    () => [
      { value: "all", label: `All technicians (${mergedJobs.length})` },
      ...routes.map((route) => ({ value: route.employeeId, label: `${route.employeeName} (${route.jobs.length})` })),
    ],
    [routes, mergedJobs.length]
  );
  const selectedRoute = selectedId === "all" ? { employeeId: "all", employeeName: "All technicians", jobs: mergedJobs } : routes.find((route) => route.employeeId === selectedId) ?? routes[0];
  const jobs = selectedRoute?.jobs ?? [];
  const totalStops = jobs.length;
  const firstStop = jobs[0]?.time ?? null;
  const lastStop = jobs.at(-1)?.time ?? null;

  return (
    <Card className="gap-0 rounded-[1.1rem] border border-[var(--co-line)] bg-[var(--co-surface)] p-0 shadow-[0_1px_0_rgba(20,33,31,0.03),0_8px_20px_rgba(20,33,31,0.03)] ring-0">
      <CardHeader className="gap-1 rounded-t-[1.1rem] border-b border-[var(--co-line-soft)] px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="eyebrow">Route preview</p>
            <h2 className="mt-1 text-[1.125rem] font-semibold text-[var(--co-ink)]">{selectedRoute?.employeeName ?? fallbackTitle}</h2>
            <p className="mt-1 text-sm text-[var(--co-muted)]">Filter by technician to see the route order for the day.</p>
          </div>
          <Badge className="co-badge-neutral rounded-full px-3 py-1.5 text-xs font-medium">{totalStops} stops</Badge>
        </div>

        <div className="mt-4">
          <Label htmlFor="technician-filter" className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--co-muted)]">
            Technician
          </Label>
          <Select items={selectItems} value={selectedId} onValueChange={(value) => setSelectedId(value ?? "all")}>
            <SelectTrigger
              id="technician-filter"
              className="mt-2 h-[2.55rem] w-full min-w-[220px] justify-between rounded-[0.65rem] border border-[var(--co-input-border)] bg-[var(--co-surface)] px-[0.8rem] text-sm text-[var(--co-ink)] hover:border-[var(--co-input-border-hover)]"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="rounded-[0.65rem] border border-[var(--co-line)] bg-[var(--co-surface)] text-[var(--co-ink)] shadow-[0_1px_0_rgba(20,33,31,0.03),0_12px_30px_rgba(20,33,31,0.035)] ring-0">
              <SelectItem value="all">All technicians ({mergedJobs.length})</SelectItem>
              {routes.map((route) => (
                <SelectItem key={route.employeeId} value={route.employeeId}>
                  {route.employeeName} ({route.jobs.length})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="mt-4 grid flex-1 gap-2 sm:grid-cols-3">
            <div className="rounded-[0.875rem] border border-[var(--co-line-soft)] bg-[var(--co-surface-muted)]/40 px-3 py-3">
              <p className="text-[13px] font-semibold uppercase tracking-[0.08em] text-[var(--co-muted)]">Stops</p>
              <p className="mt-1 text-sm font-semibold text-[var(--co-ink)]">{totalStops}</p>
            </div>
            <div className="rounded-[0.875rem] border border-[var(--co-line-soft)] bg-[var(--co-surface-muted)]/40 px-3 py-3">
              <p className="text-[13px] font-semibold uppercase tracking-[0.08em] text-[var(--co-muted)]">First stop</p>
              <p className="mt-1 text-sm font-semibold text-[var(--co-ink)]">{firstStop ?? "—"}</p>
            </div>
            <div className="rounded-[0.875rem] border border-[var(--co-line-soft)] bg-[var(--co-surface-muted)]/40 px-3 py-3">
              <p className="text-[13px] font-semibold uppercase tracking-[0.08em] text-[var(--co-muted)]">Last stop</p>
              <p className="mt-1 text-sm font-semibold text-[var(--co-ink)]">{lastStop ?? "—"}</p>
            </div>
          </div>
        </div>
      </CardHeader>

      <div className="border-b border-[var(--co-line-soft)] px-5 py-5">
        <RoutePreview embedded showHeader={false} showTopStats={false} title={selectedRoute?.employeeName ?? fallbackTitle} jobs={jobs} apiKey={apiKey} />
      </div>

      <CardContent className="divide-y divide-[var(--co-line-soft)] px-0 py-0">
        {jobs.length === 0 ? (
          <p className="px-5 py-6 text-sm text-[var(--co-muted)]">No route stops are assigned yet.</p>
        ) : (
          jobs.map((job, index) => (
            <div key={job.id} className="flex items-center gap-4 px-5 py-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--co-surface-muted)] text-sm font-semibold text-[var(--co-ink)]">
                {index + 1}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-medium text-[var(--co-ink)]">
                      {job.firstName} {job.lastName}
                    </p>
                    <p className="mt-1 text-xs text-[var(--co-muted)]">
                      {job.address}
                      {job.city ? `, ${job.city}` : ""}
                      {job.zip ? ` ${job.zip}` : ""}
                    </p>
                  </div>
                  <p className="text-right text-xs text-[var(--co-muted)]">
                    {job.time}
                    <br />
                    Planned stop
                  </p>
                </div>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
