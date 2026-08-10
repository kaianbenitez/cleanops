"use client";

import Image from "next/image";
import { useEffect, useRef } from "react";
import { PhoneFrame } from "./phone-frame";
import { gsap, prefersReducedMotion } from "./marketing-motion";

const steps = [
  ["On my way", "Crews see today's route, travel to the next stop, and log arrival with one tap."],
  ["On site", "Entry codes stay masked until needed, and special-instruction chips flag pets, do-not-clean areas, and anything else that matters."],
  ["Before, during, after", "Before/after photos, damage notes, and payment collected are captured on the job — no separate paperwork."],
  ["Job complete", "Completing a job can generate a customer feedback link automatically, so ratings and tips start coming in the same day."],
] as const;

export function MobileShowcase() {
  const section = useRef<HTMLDivElement>(null);
  const primary = useRef<HTMLDivElement>(null);
  const secondary = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (prefersReducedMotion()) return;
    const sectionEl = section.current;
    if (!sectionEl) return;

    const mm = gsap.matchMedia();

    mm.add("(min-width: 1024px)", () => {
      const ctx = gsap.context(() => {
        gsap.set(secondary.current, { autoAlpha: 0, y: 36, x: -16 });
        const tl = gsap.timeline({
          scrollTrigger: { trigger: sectionEl, start: "top top", end: "+=50%", scrub: 0.6, pin: true },
        });
        tl.to(primary.current, { y: -36, duration: 1 }, 0).to(secondary.current, { autoAlpha: 1, y: 0, x: 0, duration: 1 }, 0.2);
      }, sectionEl);
      return () => ctx.revert();
    });

    mm.add("(max-width: 1023px)", () => {
      const ctx = gsap.context(() => {
        gsap.fromTo(
          [primary.current, secondary.current],
          { autoAlpha: 0, y: 24 },
          { autoAlpha: 1, y: 0, duration: 0.5, stagger: 0.12, ease: "power2.out", scrollTrigger: { trigger: sectionEl, start: "top 80%", toggleActions: "play none none reverse" } },
        );
      }, sectionEl);
      return () => ctx.revert();
    });

    return () => mm.revert();
  }, []);

  return (
    <section ref={section} className="relative overflow-hidden border-y border-[var(--co-line)] bg-[linear-gradient(160deg,var(--co-surface-muted)_0%,var(--co-surface)_60%)]">
      <div className="mx-auto grid max-w-6xl gap-12 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:items-center lg:gap-16 lg:px-8 lg:py-20">
        <div>
          <p className="eyebrow text-[var(--co-spark-accent)]">Built for the field</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-[-0.025em] sm:text-4xl">The same app your crew already uses every day.</h2>
          <p className="mt-4 max-w-lg leading-7 text-[var(--co-muted)]">My Day is the mobile home base for every cleaner on your team — built around the real shape of a workday, from the first stop to getting paid.</p>
          <ol className="mt-8 space-y-5">
            {steps.map(([title, body], index) => (
              <li key={title} className="flex gap-4">
                <span className="pt-1 font-mono text-xs font-semibold text-[var(--co-accent)]">0{index + 1}</span>
                <div><p className="font-semibold text-[var(--co-ink)]">{title}</p><p className="mt-1 text-sm leading-6 text-[var(--co-muted)]">{body}</p></div>
              </li>
            ))}
          </ol>
        </div>
        <div className="relative mx-auto w-full max-w-sm">
          <div ref={primary}><PhoneFrame src="/marketing/crew-app-mockup.png" alt="ServiceSpark My Day app on a crew member's phone" width={926} height={1698} maxWidthClass="mx-auto max-w-[19rem]" /></div>
          <div ref={secondary} className="absolute -right-4 bottom-8 hidden w-36 overflow-hidden rounded-xl border border-[var(--co-line)] bg-[var(--co-surface)] shadow-lg sm:block lg:-right-12 lg:w-40">
            <div className="relative aspect-[3/4]">
              <Image src="/marketing/my-day-mobile.png" alt="A closer look at a My Day job screen" fill sizes="160px" className="object-cover object-top" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
