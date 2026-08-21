"use client";

import { useEffect, useRef } from "react";

export function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

type RevealOptions = {
  y?: number;
  duration?: number;
  stagger?: number;
  start?: string;
};
const defaults = { y: 24, duration: 0.35, stagger: 0.04, start: "top 85%" };

/** One ScrollTrigger per element matching `rowSelector`; items matching `itemSelector` inside each row stagger in together. */
export function useRowReveal(
  rowSelector: string,
  itemSelector: string,
  options?: RevealOptions,
) {
  const scope = useRef<HTMLDivElement>(null);
  const { stagger } = { ...defaults, ...options };

  useEffect(() => {
    if (prefersReducedMotion()) return;
    const root = scope.current;
    if (!root) return;

    const observer = new IntersectionObserver(
      (entries) =>
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        }),
      { threshold: 0.16 },
    );
    root.querySelectorAll<HTMLElement>(rowSelector).forEach((row) => {
      const items = row.querySelectorAll<HTMLElement>(itemSelector);
      const targets = items.length ? Array.from(items) : [row];
      targets.forEach((target, index) => {
        target.classList.add("marketing-reveal", "is-pending");
        target.style.transitionDelay = `${index * stagger}s`;
        observer.observe(target);
      });
    });
    return () => observer.disconnect();
  }, [rowSelector, itemSelector, stagger]);

  return scope;
}

/** A single ScrollTrigger on the scope container; items matching `itemSelector` stagger in together. */
export function useGroupReveal(itemSelector: string, options?: RevealOptions) {
  const scope = useRef<HTMLDivElement>(null);
  const { stagger } = { ...defaults, ...options };

  useEffect(() => {
    if (prefersReducedMotion()) return;
    const root = scope.current;
    if (!root) return;

    const items = root.querySelectorAll<HTMLElement>(itemSelector);
    if (!items.length) return;
    const observer = new IntersectionObserver(
      (entries) =>
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        }),
      { threshold: 0.16 },
    );
    items.forEach((item, index) => {
      item.classList.add("marketing-reveal", "is-pending");
      item.style.transitionDelay = `${index * stagger}s`;
      observer.observe(item);
    });
    return () => observer.disconnect();
  }, [itemSelector, stagger]);

  return scope;
}
