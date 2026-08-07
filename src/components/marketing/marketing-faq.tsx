"use client";

import { ChevronDown } from "lucide-react";
import { useState } from "react";

const questions = [
  ["Do my cleaners need to download an app?", "No — it opens right in their phone’s browser, nothing to install."],
  ["What does early access cost?", "Free while we onboard the first businesses."],
  ["Is customer access info like gate codes secure?", "Kept masked in the system, only revealed to the assigned technician."],
  ["Does it handle payroll too?", "Yes — payroll is generated from tracked clock-in/out time, with tiered hourly rates and commission support."],
] as const;

export function MarketingFaq() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <div className="divide-y divide-[var(--co-line-soft)] border-y border-[var(--co-line-soft)]">
      {questions.map(([question, answer], index) => {
        const isOpen = openIndex === index;
        const panelId = `faq-panel-${index}`;
        return <div key={question}>
          <h3>
            <button type="button" aria-expanded={isOpen} aria-controls={panelId} onClick={() => setOpenIndex(isOpen ? null : index)} className="flex w-full items-center justify-between gap-5 py-5 text-left font-semibold hover:text-[var(--co-accent)]">
              {question}
              <ChevronDown aria-hidden="true" className={`size-5 shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`} />
            </button>
          </h3>
          <div id={panelId} hidden={!isOpen} className="pb-5 pr-10 leading-7 text-[var(--co-muted)]">{answer}</div>
        </div>;
      })}
    </div>
  );
}
