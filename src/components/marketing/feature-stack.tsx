"use client";

import Image from "next/image";
import { PhoneFrame } from "./phone-frame";
import { useRowReveal } from "./marketing-motion";

type Feature = readonly [string, string, string, string];

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

  return <svg viewBox="0 0 24 24" aria-hidden="true" className="h-6 w-6 text-[var(--co-ink)]">{icons[index]}</svg>;
}

export function FeatureStack({ features }: { features: readonly Feature[] }) {
  const scope = useRowReveal("[data-reveal-row]", "[data-reveal-item]");

  return <div ref={scope} className="space-y-14 lg:space-y-20">
    {features.map(([title, description, screenshot, objectPosition], index) => {
      const isCrewApp = screenshot === "/marketing/crew-app-mockup.png";
      return <article key={title} data-reveal-row className="border-t border-[var(--co-line-soft)] pt-9 first:border-t-0 first:pt-0 lg:pt-11">
        <div className="flex max-w-3xl items-start gap-4">
          <div data-reveal-item className="flex h-12 w-12 shrink-0 items-center justify-center bg-[linear-gradient(135deg,color-mix(in_srgb,var(--co-accent)_22%,white),color-mix(in_srgb,var(--co-spark-accent)_30%,white))]">
            <FeatureIcon index={index} />
          </div>
          <div>
            <div data-reveal-item className="flex items-center gap-3"><p className="font-mono text-xs font-semibold text-[var(--co-accent)]">0{index + 1}</p><div className="h-px w-8 bg-[linear-gradient(90deg,var(--co-accent),var(--co-spark-accent))]" /></div>
            <h3 data-reveal-item className="mt-2 text-2xl font-semibold tracking-[-0.025em] sm:text-3xl">{title}</h3>
            <p data-reveal-item className="mt-2 max-w-2xl leading-7 text-[var(--co-muted)]">{description}</p>
          </div>
        </div>
        {isCrewApp
          ? <div data-reveal-item className="mt-7"><PhoneFrame src={screenshot} alt={`${title} in the ServiceSpark app`} width={926} height={1698} /></div>
          : <div data-reveal-item className="relative mt-7 aspect-[3/2] overflow-hidden border border-[var(--co-line-soft)] bg-[var(--co-surface)]"><Image src={screenshot} alt={`${title} in the ServiceSpark app`} fill sizes="(min-width: 1024px) 1152px, 100vw" quality={90} className="object-cover" style={{ objectPosition }} /></div>}
      </article>;
    })}
  </div>;
}
