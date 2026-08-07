"use client";

import Image from "next/image";
import { useEffect, useRef } from "react";

type Feature = readonly [string, string, string, string];

export function FeatureStack({ features }: { features: readonly Feature[] }) {
  const section = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const rows = section.current?.querySelectorAll<HTMLElement>("[data-reveal]");
    if (!rows || !window.matchMedia("(prefers-reduced-motion: no-preference)").matches) return;
    const observer = new IntersectionObserver((entries) => entries.forEach((entry) => {
      if (entry.isIntersecting) { entry.target.classList.add("is-visible"); observer.unobserve(entry.target); }
    }), { threshold: 0.16 });
    rows.forEach((row) => { row.classList.add("is-pending"); observer.observe(row); });
    return () => observer.disconnect();
  }, []);

  return <div ref={section} className="space-y-12 lg:space-y-16">
    {features.map(([title, description, screenshot, objectPosition], index) => {
      const isCrewApp = screenshot === "/marketing/my-day-mobile.png";
      return <article key={title} data-reveal className="marketing-reveal grid gap-7 border-t border-[var(--co-line-soft)] pt-10 first:border-t-0 first:pt-0 lg:grid-cols-2 lg:items-center lg:gap-14">
        <div className={index % 2 === 1 ? "lg:order-2" : ""}><p className="font-mono text-sm font-semibold text-[var(--co-accent)]">0{index + 1}</p><h3 className="mt-3 text-2xl font-semibold tracking-[-0.025em] sm:text-3xl">{title}</h3><p className="mt-3 max-w-xl leading-7 text-[var(--co-muted)]">{description}</p></div>
        {isCrewApp ? <div className="flex justify-center bg-[var(--co-accent-soft)] px-5 py-7 sm:px-8 sm:py-8"><div className="relative w-[14rem] overflow-hidden rounded-[2.25rem] border-[5px] border-[var(--co-ink)] bg-[var(--co-ink)] shadow-[0_16px_28px_rgba(24,33,61,0.28)] sm:w-[15.5rem]"><div aria-hidden="true" className="absolute left-1/2 top-2 z-10 h-5 w-[5.625rem] -translate-x-1/2 rounded-full bg-[var(--co-ink)]" /><div className="h-[24.5rem] overflow-hidden sm:h-[27rem]"><Image src={screenshot} alt={`${title} in the ServiceSpark app`} width={400} height={1190} sizes="(min-width: 640px) 248px, 224px" className="block h-full w-full object-cover object-top" /></div></div></div> : <div className="relative aspect-[3/2] overflow-hidden border border-[var(--co-line-soft)] bg-[var(--co-surface-muted)]"><Image src={screenshot} alt={`${title} in the ServiceSpark app`} fill sizes="(min-width: 1024px) 552px, 100vw" className="object-cover" style={{ objectPosition }} /></div>}
      </article>;
    })}
  </div>;
}
