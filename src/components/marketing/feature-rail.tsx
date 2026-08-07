"use client";

import { useRef } from "react";
import { ProductScreenshot } from "./marketing-visuals";

type Feature = readonly [string, string, string, number, number];

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
        {features.map(([title, description, screenshot, width, height], index) => (
          <article key={title} className="w-[86vw] shrink-0 snap-start rounded-xl border border-[var(--co-line)] bg-[var(--co-surface)] p-4 sm:w-[34rem] sm:p-5">
            <ProductScreenshot src={screenshot} alt={`${title} in the ServiceSpark app`} width={width} height={height} />
            <p className="mt-5 font-mono text-sm font-semibold text-[var(--co-accent)]">0{index + 1}</p>
            <h3 className="mt-3 text-2xl font-semibold tracking-[-0.025em]">{title}</h3>
            <p className="mt-3 leading-7 text-[var(--co-muted)]">{description}</p>
          </article>
        ))}
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
