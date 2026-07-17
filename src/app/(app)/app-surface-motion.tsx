"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import gsap from "gsap";

export default function AppSurfaceMotion({ children }: { children: React.ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const element = root.current;
    if (!element) return;

    const ctx = gsap.context(() => {
      const targets = element.querySelectorAll<HTMLElement>([
        "[data-app-reveal]",
        "h1.page-title",
        ".page-subtitle",
        ".eyebrow",
        ".co-card",
        ".co-button-primary",
        ".co-button-secondary",
      ].join(","));
      gsap.fromTo(
        element,
        { autoAlpha: 0, y: 8 },
        { autoAlpha: 1, y: 0, duration: 0.3, ease: "power2.out", clearProps: "opacity,transform" },
      );

      if (targets.length) {
        gsap.fromTo(
          targets,
          { autoAlpha: 0, y: 12 },
          { autoAlpha: 1, y: 0, duration: 0.42, stagger: 0.028, ease: "power2.out", delay: 0.04, clearProps: "opacity,transform" },
        );
      }
    }, element);

    return () => ctx.revert();
  }, [pathname]);

  return <div ref={root}>{children}</div>;
}
