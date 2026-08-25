"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import {
  ClipboardCheck,
  FileText,
  Sparkles,
  Smartphone,
  UserRound,
  Workflow,
} from "lucide-react";
import { useGroupReveal } from "./marketing-motion";

type Feature = readonly [string, string, string];

function FeatureIcon({ index }: { index: number }) {
  const icons = [Sparkles, Smartphone, UserRound, FileText, ClipboardCheck, Workflow];
  const Icon = icons[index] ?? Sparkles;
  return <Icon aria-hidden="true" className="h-5 w-5" strokeWidth={2} />;
}

export function FeatureTabs({ features }: { features: readonly Feature[] }) {
  const [active, setActive] = useState(0);
  const scope = useGroupReveal("[data-reveal-item]", { stagger: 0.05, y: 16 });
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const panelId = "marketing-feature-panel";

  useEffect(() => {
    const adjacent = [
      (active + 1) % features.length,
      (active - 1 + features.length) % features.length,
    ];
    adjacent.forEach((index) => {
      const image = new window.Image();
      image.src = features[index][2];
    });
  }, [active, features]);

  function select(index: number) {
    if (index === active) return;
    setActive(index);
  }

  function handleKeyDown(
    event: React.KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) {
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight" || event.key === "ArrowDown")
      nextIndex = (index + 1) % features.length;
    if (event.key === "ArrowLeft" || event.key === "ArrowUp")
      nextIndex = (index - 1 + features.length) % features.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = features.length - 1;
    if (nextIndex === null) return;
    event.preventDefault();
    select(nextIndex);
    tabRefs.current[nextIndex]?.focus();
  }

  const [title, description, screenshot] = features[active];

  return (
    <div
      ref={scope}
      className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-center lg:gap-12"
    >
      <div
        data-reveal-item
        role="tablist"
        aria-label="Shimmer features"
        className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:gap-1.5 lg:overflow-visible lg:pb-0"
      >
        {features.map(([featureTitle], index) => {
          const isActive = index === active;
          return (
            <button
              key={featureTitle}
              type="button"
              role="tab"
              id={`marketing-feature-tab-${index}`}
              aria-controls={panelId}
              aria-selected={isActive}
              tabIndex={isActive ? 0 : -1}
              onClick={() => select(index)}
              onKeyDown={(event) => handleKeyDown(event, index)}
              ref={(element) => {
                tabRefs.current[index] = element;
              }}
              className={`flex shrink-0 items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm font-semibold transition-colors lg:shrink ${isActive ? "border-[var(--co-accent)] bg-[var(--co-accent-tint)] text-[var(--co-ink)]" : "border-transparent text-[var(--co-muted)] hover:bg-[var(--co-surface-muted)] hover:text-[var(--co-ink)]"}`}
            >
              <span
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${isActive ? "bg-[var(--co-accent)] text-white" : "bg-[var(--co-surface-muted-strong)] text-[var(--co-ink)]"}`}
              >
                <FeatureIcon index={index} />
              </span>
              {featureTitle}
            </button>
          );
        })}
      </div>

      <div data-reveal-item>
        <div
          id={panelId}
          role="tabpanel"
          aria-labelledby={`marketing-feature-tab-${active}`}
          tabIndex={0}
          className="overflow-hidden rounded-xl border border-[var(--co-line-soft)] bg-[var(--co-surface)]"
        >
          <div className="relative h-[380px] bg-[var(--co-surface)] p-6 sm:h-[440px] sm:p-8">
            <Image
              src={screenshot}
              alt={`${title} in the Shimmer app`}
              fill
              sizes="(min-width: 1024px) 800px, 100vw"
              className="object-contain"
            />
          </div>
        </div>
        <p className="mt-4 max-w-xl text-base leading-7 text-[var(--co-muted)]">
          {description}
        </p>
      </div>
    </div>
  );
}
