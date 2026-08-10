"use client";

import { FileSpreadsheet, Package, Repeat, Star, Users, Workflow } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useGroupReveal } from "./marketing-motion";

const items = [
  { icon: Star, title: "Quality & feedback reports", body: "Star ratings from every completed job roll up into a quality report you can export any time.", isNew: true },
  { icon: FileSpreadsheet, title: "Reports & CSV export", body: "Sales, jobs, receivables, payroll, and quality — pull any of it as a CSV whenever you need it.", isNew: false },
  { icon: Workflow, title: "GoHighLevel automation", body: "Lead, quote, job, and invoice status changes push straight into your GHL workflows, with a sync-issues monitor watching for anything that fails.", isNew: false },
  { icon: Repeat, title: "Recurring service plans", body: "Set up a repeating cleaning plan once, with rotational Week 1–4 task checklists built in.", isNew: false },
  { icon: Package, title: "Supplies & inventory", body: "Track supply levels by category with reorder thresholds, so a crew never shows up short.", isNew: false },
  { icon: Users, title: "Team directory", body: "A searchable roster of every employee, with the details dispatch actually needs on a busy day.", isNew: false },
] as const;

export function FeatureBento() {
  const scope = useGroupReveal("[data-reveal-item]");

  return (
    <div ref={scope} className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {items.map(({ icon: Icon, title, body, isNew }) => (
        <div key={title} data-reveal-item className="co-card flex flex-col gap-3 p-6">
          <div className="flex items-center justify-between">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--co-accent-tint)] text-[var(--co-accent)]">
              <Icon aria-hidden="true" className="h-5 w-5" strokeWidth={2.2} />
            </div>
            {isNew ? <Badge className="bg-[var(--co-spark-accent-tint)] text-[var(--co-spark-accent)]">New</Badge> : null}
          </div>
          <h3 className="text-lg font-semibold tracking-[-0.01em] text-[var(--co-ink)]">{title}</h3>
          <p className="text-sm leading-6 text-[var(--co-muted)]">{body}</p>
        </div>
      ))}
    </div>
  );
}
