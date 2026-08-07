"use client";

import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

const questions = [
  ["I don't have time to enter all my clients — can you help?", <>Yes — send us your customer list however you have it (a spreadsheet, an export from your old system, even handwritten) and we&apos;ll get it set up in your account for you.</>],
  ["What happens to my information? Do I still own it?", <>Yes, it&apos;s yours. We only use your data to run your account — see our <Link href="/privacy-policy" className="font-semibold text-[var(--co-accent)] underline underline-offset-4">Privacy Policy</Link> for the details.</>],
  ["Do my cleaners need to download an app?", <>No — it opens right in their phone&apos;s browser, nothing to install.</>],
  ["What does it cost right now?", <>ServiceSpark is currently in beta, so early testers get full access for free while we build this out together.</>],
  ["Is customer access info like gate codes secure?", <>Kept masked in the system, only revealed to the assigned technician.</>],
  ["Does it handle payroll too?", <>Yes — payroll is generated from tracked clock-in/out time, with tiered hourly rates and commission support.</>],
  ["What is ServiceSpark?", <>Operations software built specifically for residential and commercial cleaning businesses — scheduling, a crew app, customer records, online quotes, invoicing, and payroll, all in one place, so you&apos;re not stitching together five different tools to run your day.</>],
] as const;

export function MarketingFaq() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const items = list.current?.querySelectorAll<HTMLElement>("[data-reveal]");
    if (!items || !window.matchMedia("(prefers-reduced-motion: no-preference)").matches) return;
    const observer = new IntersectionObserver((entries) => entries.forEach((entry) => {
      if (entry.isIntersecting) { entry.target.classList.add("is-visible"); observer.unobserve(entry.target); }
    }), { threshold: 0.16 });
    items.forEach((item) => { item.classList.add("is-pending"); observer.observe(item); });
    return () => observer.disconnect();
  }, []);

  return <div ref={list} className="divide-y divide-[var(--co-line-soft)] border-y border-[var(--co-line-soft)]">{questions.map(([question, answer], index) => {
    const isOpen = openIndex === index;
    const panelId = `faq-panel-${index}`;
    return <div key={question} data-reveal className="marketing-reveal"><h3><button type="button" aria-expanded={isOpen} aria-controls={panelId} onClick={() => setOpenIndex(isOpen ? null : index)} className="flex w-full items-center justify-between gap-5 py-5 text-left font-semibold hover:text-[var(--co-accent)]">{question}<ChevronDown aria-hidden="true" className={`size-5 shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`} /></button></h3><div id={panelId} hidden={!isOpen} className="pb-5 pr-10 leading-7 text-[var(--co-muted)]">{answer}</div></div>;
  })}</div>;
}
