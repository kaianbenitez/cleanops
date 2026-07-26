import type { ReactNode } from "react";
export function KpiTile({ label, value, note, delta, footer }: { label: string; value: string; note: string; delta?: ReactNode; footer?: ReactNode }) {
  return <section className="co-card p-4"><div className="flex justify-between gap-3"><p className="text-sm text-[var(--co-muted)]">{label}</p>{delta}</div><p className="mt-3 text-3xl font-semibold">{value}</p><p className="mt-1 text-sm text-[var(--co-muted)]">{note}</p>{footer ? <div className="mt-4">{footer}</div> : null}</section>;
}
