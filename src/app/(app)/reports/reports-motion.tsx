"use client";

import { useLayoutEffect, useRef } from "react";
import gsap from "gsap";

export default function ReportsMotion({ children }: { children: React.ReactNode }) {
  const root = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const ctx = gsap.context(() => {
      const blocks = gsap.utils.toArray<HTMLElement>("[data-report-reveal]");
      const chips = gsap.utils.toArray<HTMLElement>("[data-report-chip]");
      const cards = gsap.utils.toArray<HTMLElement>("[data-report-card]");

      gsap.set([...blocks, ...chips, ...cards], { autoAlpha: 0, y: 14 });

      const tl = gsap.timeline({ defaults: { ease: "power2.out" } });
      tl.to(blocks, { autoAlpha: 1, y: 0, duration: 0.68, stagger: 0.08, clearProps: "transform,opacity" })
        .to(chips, { autoAlpha: 1, y: 0, duration: 0.45, stagger: 0.035, clearProps: "transform,opacity" }, "-=0.2")
        .to(cards, { autoAlpha: 1, y: 0, duration: 0.55, stagger: 0.04, clearProps: "transform,opacity" }, "-=0.1");
    }, root);

    return () => ctx.revert();
  }, []);

  return <div ref={root}>{children}</div>;
}
