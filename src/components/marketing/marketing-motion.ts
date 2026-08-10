"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
}

export { gsap, ScrollTrigger };

export function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

type RevealOptions = { y?: number; duration?: number; stagger?: number; start?: string };
const defaults = { y: 24, duration: 0.5, stagger: 0.08, start: "top 85%" };

/** One ScrollTrigger per element matching `rowSelector`; items matching `itemSelector` inside each row stagger in together. */
export function useRowReveal(rowSelector: string, itemSelector: string, options?: RevealOptions) {
  const scope = useRef<HTMLDivElement>(null);
  const { y, duration, stagger, start } = { ...defaults, ...options };

  useEffect(() => {
    if (prefersReducedMotion()) return;
    const root = scope.current;
    if (!root) return;

    const ctx = gsap.context(() => {
      root.querySelectorAll<HTMLElement>(rowSelector).forEach((row) => {
        const items = row.querySelectorAll<HTMLElement>(itemSelector);
        const targets = items.length ? Array.from(items) : [row];
        gsap.fromTo(
          targets,
          { autoAlpha: 0, y },
          { autoAlpha: 1, y: 0, duration, stagger, ease: "power2.out", scrollTrigger: { trigger: row, start, toggleActions: "play none none reverse" } },
        );
      });
    }, root);

    return () => ctx.revert();
  }, [rowSelector, itemSelector, y, duration, stagger, start]);

  return scope;
}

/** A single ScrollTrigger on the scope container; items matching `itemSelector` stagger in together. */
export function useGroupReveal(itemSelector: string, options?: RevealOptions) {
  const scope = useRef<HTMLDivElement>(null);
  const { y, duration, stagger, start } = { ...defaults, ...options };

  useEffect(() => {
    if (prefersReducedMotion()) return;
    const root = scope.current;
    if (!root) return;

    const ctx = gsap.context(() => {
      const items = root.querySelectorAll<HTMLElement>(itemSelector);
      if (!items.length) return;
      gsap.fromTo(
        Array.from(items),
        { autoAlpha: 0, y },
        { autoAlpha: 1, y: 0, duration, stagger, ease: "power2.out", scrollTrigger: { trigger: root, start, toggleActions: "play none none reverse" } },
      );
    }, root);

    return () => ctx.revert();
  }, [itemSelector, y, duration, stagger, start]);

  return scope;
}
