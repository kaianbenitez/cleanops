"use client";

import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { marketingFaq } from "./marketing-faq-data";

export function MarketingFaq() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const items = list.current?.querySelectorAll<HTMLElement>("[data-reveal]");
    if (
      !items ||
      !window.matchMedia("(prefers-reduced-motion: no-preference)").matches
    )
      return;
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
    items.forEach((item) => {
      item.classList.add("is-pending");
      observer.observe(item);
    });
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={list}
      className="divide-y divide-[var(--co-line-soft)] border-y border-[var(--co-line-soft)]"
    >
      {marketingFaq.map(({ question, answer }, index) => {
        const isOpen = openIndex === index;
        const panelId = `faq-panel-${index}`;
        const [beforePrivacy, afterPrivacy] = answer.split("Privacy Policy");
        return (
          <div key={question} data-reveal className="marketing-reveal">
            <h3>
              <button
                type="button"
                aria-expanded={isOpen}
                aria-controls={panelId}
                onClick={() => setOpenIndex(isOpen ? null : index)}
                className="flex w-full items-center justify-between gap-5 py-5 text-left font-semibold hover:text-[var(--co-accent)]"
              >
                {question}
                <ChevronDown
                  aria-hidden="true"
                  className={`size-5 shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`}
                />
              </button>
            </h3>
            <div
              id={panelId}
              hidden={!isOpen}
              className="pb-5 pr-10 leading-7 text-[var(--co-muted)]"
            >
              {afterPrivacy === undefined ? (
                answer
              ) : (
                <>
                  {beforePrivacy}
                  <Link
                    href="/privacy-policy"
                    className="font-semibold text-[var(--co-accent)] underline underline-offset-4"
                  >
                    Privacy Policy
                  </Link>
                  {afterPrivacy}
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
