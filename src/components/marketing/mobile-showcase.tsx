"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import { gsap, prefersReducedMotion } from "./marketing-motion";

const steps = [
  ["On my way", "Crews see today's route, travel to the next stop, and log arrival with one tap."],
  ["On site", "Entry codes stay masked until needed, and special-instruction chips flag pets, do-not-clean areas, and anything else that matters."],
  ["Proof of work", "Before/after photos and damage notes are captured on the job, and cleaners tag exactly how payment was collected: cash, check, or card."],
  ["Feedback, with a tip link", "Completing a job can send the customer a private link automatically, so ratings, feedback, and tips start coming in the same day."],
  ["Their schedule, always on hand", "Every cleaner can check today's and next week's jobs right from their phone, no calling the office to ask."],
] as const;

export function MobileShowcase() {
  const section = useRef<HTMLDivElement>(null);
  const phone = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (prefersReducedMotion()) return;
    const sectionEl = section.current;
    if (!sectionEl) return;

    const ctx = gsap.context(() => {
      gsap.fromTo(
        phone.current,
        { autoAlpha: 0, y: 24 },
        { autoAlpha: 1, y: 0, duration: 0.5, ease: "power2.out", scrollTrigger: { trigger: sectionEl, start: "top 80%", toggleActions: "play none none reverse" } },
      );
    }, sectionEl);

    return () => ctx.revert();
  }, []);

  return (
    <section ref={section} className="relative overflow-hidden border-y border-[var(--co-line)] bg-[linear-gradient(160deg,var(--co-surface-muted)_0%,var(--co-surface)_60%)]">
      <div className="mx-auto grid max-w-6xl gap-12 px-4 py-16 sm:px-6 lg:grid-cols-[0.85fr_1.15fr] lg:items-center lg:gap-16 lg:px-8 lg:py-20">
        <div>
          <p className="eyebrow text-[var(--co-spark-accent)]">Built for the field</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-[-0.025em] sm:text-4xl">The same app your crew already uses every day.</h2>
          <p className="mt-4 max-w-lg leading-7 text-[var(--co-muted)]">My Day is the mobile home base for every cleaner on your team, built around the real shape of a workday, from the first stop to getting paid.</p>
          <ol className="mt-8 space-y-5">
            {steps.map(([title, body], index) => (
              <li key={title} className="flex gap-4">
                <span className="pt-1 font-mono text-xs font-semibold text-[var(--co-accent)]">0{index + 1}</span>
                <div><p className="font-semibold text-[var(--co-ink)]">{title}</p><p className="mt-1 text-sm leading-6 text-[var(--co-muted)]">{body}</p></div>
              </li>
            ))}
          </ol>
        </div>
        <div ref={phone} className="relative w-full overflow-hidden rounded-2xl border border-[var(--co-line)] shadow-[0_30px_60px_-25px_rgba(15,23,42,0.35)]">
          <Image src="/marketing/crew-app.jpg" alt="ServiceSpark My Day app: today's route, a job's entry codes, and closing out a visit" width={1448} height={1086} sizes="(min-width: 1024px) 660px, 100vw" className="h-auto w-full" />
        </div>
      </div>
    </section>
  );
}
