export function sparklinePath(values: number[]) {
  if (values.length === 0) return "";
  const width = 160;
  const height = 56;
  const padding = 4;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = Math.max(max - min, 1);
  return values
    .map((value, index) => {
      const x = padding + (index * (width - padding * 2)) / Math.max(values.length - 1, 1);
      const y = height - padding - ((value - min) / range) * (height - padding * 2);
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" L ");
}

export function Sparkline({ values }: { values: number[] }) {
  const path = sparklinePath(values);
  return (
    <svg aria-hidden="true" className="mt-1 h-14 w-24 shrink-0 text-[var(--co-accent-text)]" viewBox="0 0 160 56" fill="none">
      <path d={`M ${path} L 156 52 L 4 52 Z`} fill="currentColor" fillOpacity="0.08" />
      <path d={`M ${path}`} stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
