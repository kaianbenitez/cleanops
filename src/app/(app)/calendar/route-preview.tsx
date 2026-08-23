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

const GEOCODE_CONCURRENCY = 2;
const GEOCODE_TIMEOUT_MS = 8_000;
const geocodeCache = new Map<string, { lat: number; lng: number }>();

function coordinateKey(address: string) {
  return address.trim().toLowerCase();
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
  const routeRef = useRef<GooglePolyline | null>(null);
  const [googleReady, setGoogleReady] = useState(Boolean(typeof window !== "undefined" && window.google?.maps));
  const [mapError, setMapError] = useState(false);
  const [showStopList, setShowStopList] = useState(false);

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
    const points: Array<GoogleLatLng | undefined> = [];
    let active = true;
    const cacheController = new AbortController();

    const drawRoute = () => {
      if (!active || points.length === 0) return;
      map.fitBounds(bounds);
      const routePoints = points.filter((point): point is GoogleLatLng => Boolean(point));
      routeRef.current?.setMap(null);
      routeRef.current = null;
      if (routePoints.length > 1) {
        routeRef.current = new maps.Polyline({ map, path: routePoints, strokeColor: "#2457ff", strokeOpacity: 0.85, strokeWeight: 3 });
      }
    };

    orderedJobs.forEach((job, index) => {
      if (job.latitude != null && job.longitude != null) {
        const position = { lat: job.latitude, lng: job.longitude };
        points[index] = position;
        bounds.extend(position);
        const marker = new maps.Marker({ map, position, label: String(index + 1), title: `${index + 1}. ${job.firstName} ${job.lastName}` });
        overlaysRef.current.push(marker);
      }
    });

    const geocode = (address: string) => {
      const key = coordinateKey(address);
      const cached = geocodeCache.get(key);
      if (cached) return Promise.resolve<GoogleLatLng>(cached);
      return new Promise<GoogleLatLng | null>((resolve) => {
        let settled = false;
        const finish = (position: GoogleLatLng | null) => {
          if (settled) return;
          settled = true;
          window.clearTimeout(timeoutId);
          if (position) {
            const lat = typeof position.lat === "function" ? position.lat() : position.lat;
            const lng = typeof position.lng === "function" ? position.lng() : position.lng;
            geocodeCache.set(key, { lat, lng });
          }
          resolve(position);
        };
        const timeoutId = window.setTimeout(() => finish(null), GEOCODE_TIMEOUT_MS);
        geocoder.geocode({ address }, (results, status) => {
          finish(status === "OK" && results[0] ? results[0].geometry.location : null);
        });
      });
    };

    drawRoute();

    const loadMissingStops = async () => {
      const missingStops = orderedJobs
        .map((job, index) => ({ job, index, address: `${job.address}, ${job.city} ${job.zip}` }))
        .filter(({ job }) => job.latitude == null || job.longitude == null);
      let nextStop = 0;
      const worker = async () => {
        while (active) {
          const stop = missingStops[nextStop++];
          if (!stop) return;
          const position = await geocode(stop.address);
          if (!active || !position) continue;
          const latitude = typeof position.lat === "function" ? position.lat() : position.lat;
          const longitude = typeof position.lng === "function" ? position.lng() : position.lng;
          points[stop.index] = position;
          bounds.extend(position);
          overlaysRef.current.push(new maps.Marker({
            map,
            position,
            label: String(stop.index + 1),
            title: `${stop.index + 1}. ${stop.job.firstName} ${stop.job.lastName}`,
          }));
          drawRoute();
          void fetch("/api/maps/geocode-cache", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ customerId: stop.job.customerId, latitude, longitude }),
            signal: cacheController.signal,
          }).catch(() => undefined);
        }
      };
      await Promise.all(Array.from({ length: Math.min(GEOCODE_CONCURRENCY, missingStops.length) }, () => worker()));
    };

    void loadMissingStops();

    return () => {
      active = false;
      cacheController.abort();
      routeRef.current?.setMap(null);
      routeRef.current = null;
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
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--co-muted)]">Stops</p>
            <p className="mt-1 text-sm font-semibold text-[var(--co-ink)]">{totalStops}</p>
          </div>
          <div className="rounded-2xl border border-[var(--co-line-soft)] bg-[var(--co-surface-muted)]/35 px-3 py-3">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--co-muted)]">First stop</p>
            <p className="mt-1 text-sm font-semibold text-[var(--co-ink)]">{firstStop ?? "—"}</p>
          </div>
          <div className="rounded-2xl border border-[var(--co-line-soft)] bg-[var(--co-surface-muted)]/35 px-3 py-3">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--co-muted)]">Last stop</p>
            <p className="mt-1 text-sm font-semibold text-[var(--co-ink)]">{lastStop ?? "—"}</p>
          </div>
        </div>
      )}

      <div className="mt-4 overflow-hidden rounded-xl border border-[var(--co-line-soft)] bg-[var(--co-surface-muted)]">
        {apiKey && !mapError ? (
          <>
            <div
              ref={mapElement}
              className="min-h-[210px] bg-[var(--co-surface-muted)]"
              role="region"
              aria-roledescription="map"
              aria-label={`Route map showing ${totalStops} stops in scheduled order`}
            />
            <div className="flex items-center justify-between gap-3 border-t border-[var(--co-line-soft)] bg-[var(--co-surface)] px-3 py-2">
              <p className="min-w-0 text-xs text-[var(--co-muted)]">Open a stop for its full job details.</p>
              <button
                type="button"
                onClick={() => setShowStopList((current) => !current)}
                aria-expanded={showStopList}
                aria-controls="route-preview-stop-list"
                className="co-button-secondary min-h-11 shrink-0 px-3 py-2 text-xs font-semibold"
              >
                {showStopList ? "Hide stop list" : "View stop list"}
              </button>
            </div>
            {showStopList ? (
              <div id="route-preview-stop-list" className="border-t border-[var(--co-line-soft)] bg-[var(--co-surface-muted)] p-3">
                <ol className="max-h-72 space-y-2 overflow-y-auto" aria-label="Visible scheduled stop list">
                  {orderedJobs.map((job, index) => (
                    <li key={job.id}>
                      <Link
                        href={`/jobs/${job.id}`}
                        className="flex min-w-0 w-full items-center gap-3 rounded-2xl border border-[var(--co-line-soft)] bg-[var(--co-surface)] px-3 py-2 text-xs shadow-[var(--co-shadow-control)]"
                      >
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--co-accent-fill)] text-xs font-semibold text-white">{index + 1}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block font-semibold text-[var(--co-ink)]">
                            {job.firstName} {job.lastName}
                          </span>
                          <span className="mt-0.5 block break-words text-xs text-[var(--co-muted)]">
                            {job.address}
                            {job.city ? `, ${job.city}` : ""}
                            {job.zip ? ` ${job.zip}` : ""}
                          </span>
                        </span>
                        <span className="shrink-0 rounded-full bg-[var(--co-surface-muted)] px-2 py-1 text-xs font-medium text-[var(--co-accent-text)]">{job.time}</span>
                      </Link>
                    </li>
                  ))}
                </ol>
              </div>
            ) : null}
            <ol className="sr-only" aria-label="Scheduled stop order">
              {orderedJobs.map((job, index) => (
                <li key={job.id}>
                  Stop {index + 1}: {job.firstName} {job.lastName}, {job.address}, {job.city} {job.zip}
                </li>
              ))}
            </ol>
          </>
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
                    className="flex w-full items-center gap-3 rounded-2xl border border-[var(--co-line-soft)] bg-[var(--co-surface)] px-3 py-2 text-xs shadow-[var(--co-shadow-control)]"
                  >
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--co-accent-fill)] text-xs font-semibold text-white">{index + 1}</span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="font-semibold text-[var(--co-ink)]">
                        {job.firstName} {job.lastName}
                      </span>
                      <span className="truncate text-xs text-[var(--co-muted)]">{job.address}</span>
                    </span>
                    <span className="rounded-full bg-[var(--co-surface-muted)] px-2 py-1 text-xs font-medium text-[var(--co-accent-text)]">{job.time}</span>
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
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--co-muted)]">Stops</p>
          <p className="mt-1 text-sm font-semibold text-[var(--co-ink)]">{orderedJobs.length}</p>
        </div>
        <div className="rounded-2xl border border-[var(--co-line-soft)] bg-[var(--co-surface-muted)]/35 px-3 py-3">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--co-muted)]">Route mode</p>
          <p className="mt-1 text-sm font-semibold text-[var(--co-ink)]">{hasStops ? "Manual order" : "Awaiting assignment"}</p>
        </div>
        <div className="rounded-2xl border border-[var(--co-line-soft)] bg-[var(--co-surface-muted)]/35 px-3 py-3">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--co-muted)]">Source</p>
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
