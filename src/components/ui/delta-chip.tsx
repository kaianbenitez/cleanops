export function DeltaChip({ value }: { value: number | null }) {
  if (value === null || value === 0) return <span className="text-xs text-[var(--co-muted)]">Steady</span>;
  const positive = value > 0;
  return <span className="text-xs font-semibold">{positive ? "Up" : "Down"} {Math.abs(value).toFixed(1)}%</span>;
}
