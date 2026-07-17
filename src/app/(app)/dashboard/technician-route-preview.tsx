"use client";

import { useMemo, useState } from "react";
import RoutePreview from "../calendar/route-preview";

export type RouteStop = {
  id: string;
  firstName: string;
  lastName: string;
  address: string;
  city: string;
  zip: string;
  time: string;
};

export type TechnicianRoute = {
  employeeId: string;
  employeeName: string;
  jobs: RouteStop[];
};

export default function TechnicianRoutePreview({
  routes,
  fallbackTitle = "Today's route",
}: {
  routes: TechnicianRoute[];
  fallbackTitle?: string;
}) {
  const [selectedId, setSelectedId] = useState(routes.find((route) => route.jobs.length > 0)?.employeeId ?? "all");

  const mergedJobs = useMemo(() => routes.flatMap((route) => route.jobs), [routes]);
  const selectedRoute = selectedId === "all" ? { employeeId: "all", employeeName: "All technicians", jobs: mergedJobs } : routes.find((route) => route.employeeId === selectedId) ?? routes[0];
  const jobs = selectedRoute?.jobs ?? [];
  const totalStops = jobs.length;
  const firstStop = jobs[0]?.time ?? null;
  const lastStop = jobs.at(-1)?.time ?? null;

  return (
    <div className="co-card overflow-hidden">
      <div className="border-b border-[var(--co-line-soft)] px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="eyebrow">Route preview</p>
            <h2 className="mt-1 text-lg font-semibold">{selectedRoute?.employeeName ?? fallbackTitle}</h2>
            <p className="mt-1 text-sm text-[var(--co-muted)]">Filter by technician to see the route order for the day.</p>
          </div>
          <span className="rounded-full border border-[var(--co-line-soft)] bg-[var(--co-surface-muted)] px-3 py-1.5 text-xs font-medium text-[var(--co-evergreen)]">
            {totalStops} stops
          </span>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <label className="block text-xs font-semibold uppercase tracking-[0.08em] text-[var(--co-muted)]">
            Technician
            <select className="co-input mt-2 min-w-[220px]" value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>
              <option value="all">All technicians</option>
              {routes.map((route) => (
                <option key={route.employeeId} value={route.employeeId}>
                  {route.employeeName} ({route.jobs.length})
                </option>
              ))}
            </select>
          </label>

          <div className="grid flex-1 gap-2 sm:grid-cols-3">
            <div className="rounded-2xl border border-[var(--co-line-soft)] bg-[var(--co-surface-muted)]/40 px-3 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--co-muted)]">Stops</p>
              <p className="mt-1 text-sm font-semibold text-[var(--co-ink)]">{totalStops}</p>
            </div>
            <div className="rounded-2xl border border-[var(--co-line-soft)] bg-[var(--co-surface-muted)]/40 px-3 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--co-muted)]">First stop</p>
              <p className="mt-1 text-sm font-semibold text-[var(--co-ink)]">{firstStop ?? "—"}</p>
            </div>
            <div className="rounded-2xl border border-[var(--co-line-soft)] bg-[var(--co-surface-muted)]/40 px-3 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--co-muted)]">Last stop</p>
              <p className="mt-1 text-sm font-semibold text-[var(--co-ink)]">{lastStop ?? "—"}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="border-b border-[var(--co-line-soft)] px-5 py-5">
        <RoutePreview title={selectedRoute?.employeeName ?? fallbackTitle} jobs={jobs} />
      </div>

      <div className="divide-y divide-[var(--co-line-soft)]">
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
      </div>
    </div>
  );
}
