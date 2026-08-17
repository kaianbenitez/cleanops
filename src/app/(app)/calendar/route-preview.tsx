"use client";

import Link from "next/link";
import Script from "next/script";
import { useEffect, useMemo, useRef, useState } from "react";
import type { GoogleLatLng, GoogleMap, GoogleMarker, GooglePolyline } from "@/lib/google-maps";

type RouteJob = {
  id: string;
  customerId: string;
  firstName: string;
  lastName: string;
  address: string;
  city: string;
  zip: string;
  time: string;
  latitude?: number | null;
  longitude?: number | null;
};

function minutesFromTime(value: string) {
  const [hours, minutes] = value.split(":").map((part) => Number(part || 0));
  return hours * 60 + minutes;
}

export default function RoutePreview({
  jobs,
  title,
  showHeader = true,
  showTopStats = true,
  embedded = false,
  apiKey,
}: {
  jobs: RouteJob[];
  title: string;
  showHeader?: boolean;
  showTopStats?: boolean;
  embedded?: boolean;
  apiKey: string | null;
}) {
  const mapElement = useRef<HTMLDivElement>(null);
  const mapRef = useRef<GoogleMap | null>(null);
  const overlaysRef = useRef<Array<GoogleMarker | GooglePolyline>>([]);
  const [googleReady, setGoogleReady] = useState(Boolean(typeof window !== "undefined" && window.google?.maps));
  const [mapError, setMapError] = useState(false);

  const orderedJobs = useMemo(
    () => [...jobs].sort((a, b) => minutesFromTime(a.time) - minutesFromTime(b.time)),
    [jobs]
  );

  useEffect(() => {
    const maps = window.google?.maps;
    if (!apiKey || !googleReady || !maps || !mapElement.current || orderedJobs.length === 0) return;

    const map = new maps.Map(mapElement.current, {
      // Neutral continental-US default — real stops immediately re-center
      // via fitBounds() below once geocoding resolves, so this is only ever
      // visible for a moment and shouldn't assume any one company's city.
      center: { lat: 39.5, lng: -98.35 },
      zoom: 4,
      disableDefaultUI: true,
      zoomControl: true,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
    });

    mapRef.current = map;
    overlaysRef.current.forEach((overlay) => overlay.setMap(null));
    overlaysRef.current = [];

    const geocoder = new maps.Geocoder();
    const bounds = new maps.LatLngBounds();
    const points: GoogleLatLng[] = [];
    let completed = 0;

    orderedJobs.forEach((job, index) => {
      if (job.latitude != null && job.longitude != null) {
        const position = { lat: job.latitude, lng: job.longitude };
        completed += 1;
        points[index] = position;
        bounds.extend(position);
        const marker = new maps.Marker({ map, position, label: String(index + 1), title: `${index + 1}. ${job.firstName} ${job.lastName}` });
        overlaysRef.current.push(marker);
        if (completed === orderedJobs.length && points.length > 0) {
          map.fitBounds(bounds);
          if (points.filter(Boolean).length > 1) overlaysRef.current.push(new maps.Polyline({ map, path: points.filter(Boolean), strokeColor: "#0f4837", strokeOpacity: 0.85, strokeWeight: 3 }));
        }
        return;
      }
      geocoder.geocode({ address: `${job.address}, ${job.city} ${job.zip}` }, (results, status) => {
        completed += 1;
        if (status === "OK" && results[0]) {
          const position = results[0].geometry.location;
          const latitude = typeof position.lat === "function" ? position.lat() : position.lat;
          const longitude = typeof position.lng === "function" ? position.lng() : position.lng;
          points[index] = position;
          bounds.extend(position);
          const marker = new maps.Marker({
            map,
            position,
            label: String(index + 1),
            title: `${index + 1}. ${job.firstName} ${job.lastName}`,
          });
          overlaysRef.current.push(marker);
          void fetch("/api/maps/geocode-cache", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ customerId: job.customerId, latitude, longitude }) });
        }

        if (completed === orderedJobs.length && points.length > 0) {
          map.fitBounds(bounds);
          if (points.filter(Boolean).length > 1) {
            const line = new maps.Polyline({
              map,
              path: points.filter(Boolean),
              strokeColor: "#0f4837",
              strokeOpacity: 0.85,
              strokeWeight: 3,
            });
            overlaysRef.current.push(line);
          }
        }
      });
    });

    return () => {
      overlaysRef.current.forEach((overlay) => overlay.setMap(null));
      overlaysRef.current = [];
      mapRef.current = null;
    };
  }, [apiKey, googleReady, orderedJobs]);

  const hasStops = orderedJobs.length > 0;
  const totalStops = orderedJobs.length;
  const firstStop = orderedJobs[0]?.time ?? null;
  const lastStop = orderedJobs.at(-1)?.time ?? null;

  return (
    <div className={embedded ? "overflow-hidden" : "co-card overflow-hidden p-4"}>
      {apiKey ? (
        <Script
          id="google-maps-calendar"
          src={`https://maps.googleapis.com/maps/api/js?key=${apiKey}`}
          strategy="afterInteractive"
          onLoad={() => setGoogleReady(true)}
          onError={() => setMapError(true)}
        />
      ) : null}

      {showHeader && (
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="eyebrow">Route preview</p>
            <h2 className="text-lg font-semibold text-[var(--co-ink)]">{title}</h2>
            <p className="mt-1 text-xs text-[var(--co-muted)]">Shows the exact stop order for the selected technician.</p>
          </div>
          <div className="rounded-full border border-[var(--co-line-soft)] bg-[var(--co-surface-muted)]/40 px-3 py-1.5 text-xs font-medium text-[var(--co-accent-text)]">
            {totalStops} stops
          </div>
        </div>
      )}

      {showTopStats && (
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <div className="rounded-2xl border border-[var(--co-line-soft)] bg-[var(--co-surface-muted)]/35 px-3 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--co-muted)]">Stops</p>
            <p className="mt-1 text-sm font-semibold text-[var(--co-ink)]">{totalStops}</p>
          </div>
          <div className="rounded-2xl border border-[var(--co-line-soft)] bg-[var(--co-surface-muted)]/35 px-3 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--co-muted)]">First stop</p>
            <p className="mt-1 text-sm font-semibold text-[var(--co-ink)]">{firstStop ?? "—"}</p>
          </div>
          <div className="rounded-2xl border border-[var(--co-line-soft)] bg-[var(--co-surface-muted)]/35 px-3 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--co-muted)]">Last stop</p>
            <p className="mt-1 text-sm font-semibold text-[var(--co-ink)]">{lastStop ?? "—"}</p>
          </div>
        </div>
      )}

      <div className="mt-4 overflow-hidden rounded-xl border border-[var(--co-line-soft)] bg-[var(--co-surface-muted)]">
        {apiKey && !mapError ? (
          <div ref={mapElement} className="min-h-[210px] bg-[#e8eee6]" aria-label="Route map" />
        ) : (
          <div
            className="relative min-h-[210px] overflow-hidden p-4"
          >
            {hasStops ? (
              <div className="relative space-y-2 p-2">
                {orderedJobs.map((job, index) => (
                  <Link
                    key={job.id}
                    href={`/jobs/${job.id}`}
                    className="flex w-full items-center gap-3 rounded-2xl border border-white/90 bg-[var(--co-surface)] px-3 py-2 text-xs shadow-[0_8px_22px_rgba(27,41,37,0.08)]"
                  >
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--co-accent-fill)] text-[11px] font-semibold text-white">{index + 1}</span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="font-semibold text-[var(--co-ink)]">
                        {job.firstName} {job.lastName}
                      </span>
                      <span className="truncate text-[11px] text-[var(--co-muted)]">{job.address}</span>
                    </span>
                    <span className="rounded-full bg-[var(--co-surface-muted)] px-2 py-1 text-[11px] font-medium text-[var(--co-accent-text)]">{job.time}</span>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="relative text-sm text-[var(--co-muted)]">Select a technician to preview the route.</p>
            )}
          </div>
        )}
      </div>

      {!embedded ? <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <div className="rounded-2xl border border-[var(--co-line-soft)] bg-[var(--co-surface-muted)]/35 px-3 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--co-muted)]">Stops</p>
          <p className="mt-1 text-sm font-semibold text-[var(--co-ink)]">{orderedJobs.length}</p>
        </div>
        <div className="rounded-2xl border border-[var(--co-line-soft)] bg-[var(--co-surface-muted)]/35 px-3 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--co-muted)]">Route mode</p>
          <p className="mt-1 text-sm font-semibold text-[var(--co-ink)]">{hasStops ? "Manual order" : "Awaiting assignment"}</p>
        </div>
        <div className="rounded-2xl border border-[var(--co-line-soft)] bg-[var(--co-surface-muted)]/35 px-3 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--co-muted)]">Source</p>
          <p className="mt-1 text-sm font-semibold text-[var(--co-ink)]">{apiKey && !mapError ? "Google Maps" : "Static preview"}</p>
        </div>
      </div> : null}

      {!embedded ? <div className="mt-3 flex items-center justify-between text-xs text-[var(--co-muted)]">
        <span>{hasStops ? "Stops follow the selected technician's schedule order" : "Choose an employee filter to see a route"}</span>
        <span>{apiKey ? "Live geocoded route" : "Add a Maps key for live routing"}</span>
      </div> : null}
    </div>
  );
}
