"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import { gsap, prefersReducedMotion, useGroupReveal } from "./marketing-motion";

type Feature = readonly [string, string, string];

function FeatureIcon({ index }: { index: number }) {
  const shared = { fill: "none", stroke: "currentColor", strokeWidth: 2.2, strokeLinejoin: "miter" as const, strokeLinecap: "square" as const };
  const icons = [
    <><path {...shared} d="M12 4 20 8 12 12 4 8 12 4Z M4 8v8l8 4 8-4V8 M12 12v8" /><path {...shared} d="m16 2 1.5 3.5L21 7l-3.5 1.5L16 12l-1.5-3.5L11 7l3.5-1.5L16 2Z" /></>,
    <><path {...shared} d="M8 3h8l3 3v12l-3 3H8l-3-3V6l3-3Z" /><path {...shared} d="M9 12h6M12 9v6" /><path {...shared} d="m18 2 1 2.5L22 6l-3 1.5-1 2.5-1-2.5L14 6l3-1.5L18 2Z" /></>,
    <><path {...shared} d="M12 3 20 8v8l-8 5-8-5V8l8-5Z" /><path {...shared} d="M8 15v-3.5C8 9.6 9.8 8 12 8s4 1.6 4 3.5V15" /><path {...shared} d="M6 19h12" /></>,
    <><path {...shared} d="M7 3h10l3 3v15H7V3Z" /><path {...shared} d="M17 3v4h3M10 11h7M10 15h4" /><path {...shared} d="m5 8 1.5 3.5L10 13l-3.5 1.5L5 18l-1.5-3.5L0 13l3.5-1.5L5 8Z" /></>,
    <><path {...shared} d="M5 5h14v14H5z" /><path {...shared} d="M8 9h8M8 13h3" /><path {...shared} d="m16 15 2 2 4-5" /></>,
    <><path {...shared} d="M4 7 12 3l8 4v10l-8 4-8-4V7Z" /><path {...shared} d="M4 7l8 4 8-4M12 11v10" /><path {...shared} d="m18 2 1 2.5L22 6l-3 1.5-1 2.5-1-2.5L14 6l3-1.5L18 2Z" /></>,
  ];

  return <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5">{icons[index]}</svg>;
}

export function FeatureTabs({ features }: { features: readonly Feature[] }) {
  const [active, setActive] = useState(0);
  const scope = useGroupReveal("[data-reveal-item]", { stagger: 0.05, y: 16 });
  const panel = useRef<HTMLDivElement>(null);

  function select(index: number) {
    if (index === active) return;
    if (panel.current && !prefersReducedMotion()) {
      gsap.fromTo(panel.current, { autoAlpha: 0.35, y: 6 }, { autoAlpha: 1, y: 0, duration: 0.3, ease: "power2.out" });
    }
    setActive(index);
  }

  const [title, description, screenshot] = features[active];

  return (
    <div ref={scope} className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-center lg:gap-12">
      <div data-reveal-item role="tablist" aria-label="Shimmer features" className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:gap-1.5 lg:overflow-visible lg:pb-0">
        {features.map(([featureTitle], index) => {
          const isActive = index === active;
          return (
            <button
              key={featureTitle}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => select(index)}
              className={`flex shrink-0 items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm font-semibold transition-colors lg:shrink ${isActive ? "border-[var(--co-accent)] bg-[var(--co-accent-tint)] text-[var(--co-ink)]" : "border-transparent text-[var(--co-muted)] hover:bg-[var(--co-surface-muted)] hover:text-[var(--co-ink)]"}`}
            >
              <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${isActive ? "bg-[var(--co-accent)] text-white" : "bg-[var(--co-surface-muted-strong)] text-[var(--co-ink)]"}`}>
                <FeatureIcon index={index} />
              </span>
              {featureTitle}
            </button>
          );
        })}
      </div>

      <div data-reveal-item>
        <div ref={panel} className="overflow-hidden rounded-xl border border-[var(--co-line-soft)] bg-[var(--co-surface)]">
          <div className="relative h-[380px] bg-[var(--co-surface)] p-6 sm:h-[440px] sm:p-8">
            <Image src={screenshot} alt={`${title} in the Shimmer app`} fill sizes="(min-width: 1024px) 800px, 100vw" className="object-contain" />
          </div>
        </div>
        <p className="mt-4 max-w-xl text-base leading-7 text-[var(--co-muted)]">{description}</p>
      </div>
    </div>
  );
}
