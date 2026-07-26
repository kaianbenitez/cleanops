type Props = {
  label: string;
  value: number;
  max: number;
  suffix?: string;
  tone?: "primary" | "muted";
};

export function ProgressRow({
  label,
  value,
  max,
  suffix = "",
  tone = "primary",
}: Props) {
  const percent = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;

  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span>{label}</span>
        <span className="font-semibold">{value}{suffix}</span>
      </div>
      <div className="h-2 overflow-hidden rounded bg-[var(--co-surface-muted)]">
        <div
          className={tone === "primary" ? "h-full bg-[var(--co-evergreen)]" : "h-full bg-[var(--co-muted)]"}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
