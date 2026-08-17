import Link from "next/link";

type StatTileProps = {
  label: string;
  value: string;
  note: string;
  trend?: string;
  tone?: "neutral" | "good" | "warn" | "danger" | "default";
  href?: string;
  sparkline?: React.ReactNode;
  className?: string;
  compact?: boolean;
};

export function StatTile({ label, value, note, trend, tone = "neutral", href, sparkline, className, compact = false }: StatTileProps) {
  const accent = tone === "good" ? "text-[var(--co-success)]" : tone === "warn" ? "text-[var(--co-warning)]" : tone === "danger" ? "text-[var(--co-danger)]" : "text-[var(--co-ink)]";
  const content = (
    <>
      <p className={`text-[11px] font-semibold uppercase text-[var(--co-muted)] ${compact ? "tracking-[0.1em]" : "tracking-[0.14em]"}`}>{label}</p>
      <div className={`${compact ? "mt-1.5" : "mt-2"} flex items-start justify-between gap-4`}>
        <div>
          <p className={`${compact ? "text-2xl tracking-[-0.04em]" : "text-3xl tracking-[-0.045em]"} font-semibold ${accent}`}>{value}</p>
          <p className={`${compact ? "mt-1" : "mt-2"} text-xs text-[var(--co-muted)]`}>{note}</p>
          {trend ? <p className="mt-1 text-xs font-medium text-[var(--co-success)]">{trend}</p> : null}
        </div>
        {sparkline}
      </div>
    </>
  );

  const classes = className ?? "co-card p-5";
  return href ? <Link href={href} className={classes}>{content}</Link> : <div className={classes}>{content}</div>;
}
