"use client";

import { useEffect, useRef } from "react";
import { gsap, prefersReducedMotion } from "./marketing-motion";

export function MagneticCta({ href, className, children }: { href: string; className?: string; children: React.ReactNode }) {
  const ref = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    if (prefersReducedMotion()) return;
    const el = ref.current;
    if (!el) return;

    const xTo = gsap.quickTo(el, "x", { duration: 0.4, ease: "elastic.out(1,0.4)" });
    const yTo = gsap.quickTo(el, "y", { duration: 0.4, ease: "elastic.out(1,0.4)" });

    function handleMove(event: MouseEvent) {
      const rect = el!.getBoundingClientRect();
      xTo((event.clientX - rect.left - rect.width / 2) * 0.3);
      yTo((event.clientY - rect.top - rect.height / 2) * 0.3);
    }
    function handleLeave() {
      xTo(0);
      yTo(0);
    }

    el.addEventListener("mousemove", handleMove);
    el.addEventListener("mouseleave", handleLeave);
    return () => {
      el.removeEventListener("mousemove", handleMove);
      el.removeEventListener("mouseleave", handleLeave);
    };
  }, []);

  return (
    <a ref={ref} href={href} className={className} style={{ willChange: "transform" }}>
      {children}
    </a>
  );
}
