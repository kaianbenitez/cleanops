"use client";

import { Bell, FileSpreadsheet, SlidersHorizontal, Star, Users, Workflow } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useGroupReveal } from "./marketing-motion";

const items = [
  { icon: Star, title: "Quality & feedback reports", body: "Star ratings from every completed job roll up into a quality report you can export any time.", isNew: true },
  { icon: FileSpreadsheet, title: "Reports & CSV export", body: "Sales, jobs, receivables, payroll, and quality: pull any of it as a CSV whenever you need it.", isNew: false },
  { icon: Bell, title: "Web notifications for the office", body: "Get notified the moment a quote is viewed, a job needs attention, or something needs a decision, right in the app.", isNew: false },
  { icon: SlidersHorizontal, title: "Fully customizable settings", body: "Configure your own pricing, quote presentation, add-ons, service catalog, and payroll tiers per employee. Shimmer adapts to how your business already runs.", isNew: false },
  { icon: Users, title: "Team directory", body: "A searchable roster of every employee, with the details dispatch actually needs on a busy day.", isNew: false },
  { icon: Workflow, title: "GoHighLevel automation", body: "Already on GHL? Lead, quote, job, and invoice status changes push straight into your workflows, with a sync-issues monitor watching for anything that fails.", isNew: false },
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
