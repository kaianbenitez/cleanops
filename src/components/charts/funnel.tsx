type Stage = { label: string; value: number; pct: number };
export function Funnel({ stages, title, description }: { stages: Stage[]; title: string; description: string }) {
  return <div><p className="sr-only">{title}: {description}</p>{stages.length === 0 ? <p className="text-sm text-[var(--co-muted)]">No data for this period.</p> : <div className="grid gap-2">{stages.map((stage) => <div key={stage.label} className="flex items-center justify-between bg-[var(--co-surface-muted)] px-3 py-2"><span>{stage.label}</span><span className="font-semibold">{stage.value} ({stage.pct}%)</span></div>)}</div>}</div>;
}
