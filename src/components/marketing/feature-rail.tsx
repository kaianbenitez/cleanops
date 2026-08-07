"use client";

import { useRef } from "react";
import Image from "next/image";

type Feature = readonly [string, string, string, string];

export function FeatureRail({ features }: { features: readonly Feature[] }) {
  const rail = useRef<HTMLDivElement>(null);
  const drag = useRef<{ startX: number; startScroll: number } | null>(null);

  function scrollRail(direction: 1 | -1) {
    rail.current?.scrollBy({ left: direction * (rail.current.clientWidth * 0.82), behavior: "smooth" });
  }

  return (
    <div className="relative">
      <div
        ref={rail}
        tabIndex={0}
        role="region"
        aria-label="ServiceSpark features. Use left and right arrow keys to browse."
        className="flex snap-x snap-mandatory gap-5 overflow-x-auto pb-5 pr-[12vw] [scrollbar-color:var(--co-line)_transparent] [scrollbar-width:thin] focus:outline-none"
        onKeyDown={(event) => {
          if (event.key === "ArrowRight") { event.preventDefault(); scrollRail(1); }
          if (event.key === "ArrowLeft") { event.preventDefault(); scrollRail(-1); }
        }}
        onPointerDown={(event) => {
          drag.current = { startX: event.clientX, startScroll: event.currentTarget.scrollLeft };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (drag.current) event.currentTarget.scrollLeft = drag.current.startScroll - (event.clientX - drag.current.startX);
        }}
        onPointerUp={() => { drag.current = null; }}
        onPointerCancel={() => { drag.current = null; }}
      >
        {features.map(([title, description, screenshot, objectPosition], index) => {
          const isCrewApp = screenshot === "/marketing/my-day-mobile.png";
          return (
          <article key={title} className={`w-[86vw] shrink-0 snap-start rounded-xl border p-4 sm:w-[38rem] sm:p-5 ${isCrewApp ? "border-[var(--co-accent)] bg-[var(--co-accent-tint)]" : "border-[var(--co-line)] bg-[var(--co-surface)]"}`}>
            {isCrewApp ? (
              <div className="flex min-h-[31rem] items-center justify-center overflow-hidden rounded-lg bg-[var(--co-accent-soft)] px-5 py-8 sm:min-h-[35rem]">
                <div className="relative w-[14rem] overflow-hidden rounded-[2.25rem] border-[5px] border-[var(--co-ink)] bg-[var(--co-ink)] shadow-[0_16px_28px_rgba(24,33,61,0.28)] sm:w-[15.5rem]">
                  <div aria-hidden="true" className="absolute left-1/2 top-2 z-10 h-5 w-[5.625rem] -translate-x-1/2 rounded-full bg-[var(--co-ink)]" />
                  <Image src={screenshot} alt={`${title} in the ServiceSpark app`} width={400} height={1190} priority sizes="(min-width: 640px) 248px, 224px" className="block h-auto w-full" />
                </div>
              </div>
            ) : (
              <div className="relative aspect-[3/2] overflow-hidden rounded-lg border border-[var(--co-line-soft)] bg-[var(--co-surface-muted)]">
                <Image src={screenshot} alt={`${title} in the ServiceSpark app`} fill sizes="(min-width: 640px) 608px, 86vw" className="object-cover" style={{ objectPosition }} />
              </div>
            )}
            <p className="mt-5 font-mono text-sm font-semibold text-[var(--co-accent)]">0{index + 1}</p>
            <h3 className="mt-3 text-2xl font-semibold tracking-[-0.025em]">{title}</h3>
            <p className="mt-3 leading-7 text-[var(--co-muted)]">{description}</p>
          </article>
          );
        })}
      </div>
      <div className="mt-1 flex items-center justify-between gap-4 text-sm text-[var(--co-muted)]">
        <p>Scroll, drag, or use the arrow keys to explore.</p>
        <div className="hidden gap-2 sm:flex">
          <button type="button" onClick={() => scrollRail(-1)} className="co-button-secondary min-h-0 px-3 py-1.5" aria-label="Previous feature">←</button>
          <button type="button" onClick={() => scrollRail(1)} className="co-button-secondary min-h-0 px-3 py-1.5" aria-label="Next feature">→</button>
        </div>
      </div>
    </div>
  );
}
