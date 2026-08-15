// Single source of truth for status badges across jobs, quotes, customers, and
// invoices. Previously each surface carried its own STATUS_STYLES map (seven
// copies). They happened to agree on the tone scale below, so this consolidates
// rather than re-colours — the only deliberate change is that surfaces which
// rendered a raw enum ("in_progress") now get the same labels as everywhere else.

// Tones map onto the shared .co-badge-* recipe in globals.css, which mixes
// each --co-* token against --co-tint-base (white in light, the dark surface
// in dark) so the badge itself darkens with the theme instead of staying a
// pale near-white chip that washes out its own foreground color. Each
// .co-badge-* class already supplies its own border, so callers should not
// pair these with a separate `border` utility.
const TONES = {
  neutral: "co-badge-neutral",
  info: "co-badge-info",
  warning: "co-badge-warning",
  success: "co-badge-success",
  danger: "co-badge-danger",
  muted: "co-badge-muted",
} as const;

type Tone = keyof typeof TONES;
export type StatusDomain = "job" | "quote" | "customer" | "invoice";

const STATUSES: Record<StatusDomain, Record<string, { label: string; tone: Tone }>> = {
  job: {
    scheduled: { label: "Scheduled", tone: "neutral" },
    in_progress: { label: "In progress", tone: "warning" },
    completed: { label: "Completed", tone: "success" },
    cancelled: { label: "Cancelled", tone: "muted" },
    no_show: { label: "No show", tone: "danger" },
  },
  quote: {
    draft: { label: "Draft", tone: "neutral" },
    sent: { label: "Sent", tone: "info" },
    viewed: { label: "Viewed", tone: "warning" },
    accepted: { label: "Accepted", tone: "success" },
    declined: { label: "Declined", tone: "danger" },
    expired: { label: "Expired", tone: "muted" },
  },
  customer: {
    lead: { label: "Lead", tone: "neutral" },
    quoted: { label: "Quoted", tone: "info" },
    first_clean_booked: { label: "First clean booked", tone: "warning" },
    client: { label: "Active client", tone: "success" },
    lost: { label: "Lost", tone: "danger" },
    moved: { label: "Moved", tone: "muted" },
  },
  // An unpaid invoice that has gone out is a thing to chase, so `sent` is a
  // warning here where the same word is merely informational on a quote.
  invoice: {
    draft: { label: "Draft", tone: "neutral" },
    sent: { label: "Sent", tone: "warning" },
    paid: { label: "Paid", tone: "success" },
    void: { label: "Void", tone: "muted" },
  },
};

function entryFor(domain: StatusDomain, status: string) {
  return STATUSES[domain][status] ?? { label: status.replaceAll("_", " "), tone: "neutral" as Tone };
}

/** Tailwind classes for a status tone, for the rare caller that needs the string itself. */
export function statusToneClass(domain: StatusDomain, status: string) {
  return TONES[entryFor(domain, status).tone];
}

/** Human-readable label for a status value. */
export function statusLabel(domain: StatusDomain, status: string) {
  return entryFor(domain, status).label;
}

/** Ordered status values and labels for filter controls. */
export function statusOptions(domain: StatusDomain): Array<{ value: string; label: string }> {
  return Object.entries(STATUSES[domain]).map(([value, entry]) => ({ value, label: entry.label }));
}

export function StatusPill({
  domain,
  status,
  label,
  className = "",
}: {
  domain: StatusDomain;
  status: string;
  /** Overrides the derived label for states the enum doesn't carry, e.g. an overdue invoice. */
  label?: string;
  className?: string;
}) {
  const entry = entryFor(domain, status);
  return (
    <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${TONES[entry.tone]} ${className}`}>
      {label ?? entry.label}
    </span>
  );
}
