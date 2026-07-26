type Props = {
  value: number;
  total: number;
  centerLabel: string;
  centerCaption: string;
  title: string;
  description: string;
  size?: number;
  thickness?: number;
};

export function Donut({ value, total, centerLabel, centerCaption, title, description, size = 156, thickness = 16 }: Props) {
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const percent = total > 0 ? Math.min(1, Math.max(0, value / total)) : 0;

  return (
    <div className="grid justify-items-center gap-2">
      <p className="sr-only">{title}: {description}</p>
      <svg aria-hidden="true" width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--co-surface-muted)" strokeWidth={thickness} />
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--co-evergreen)" strokeWidth={thickness} strokeDasharray={circumference} strokeDashoffset={circumference * (1 - percent)} strokeLinecap="round" transform={`rotate(-90 ${size / 2} ${size / 2})`} />
        <text x="50%" y="48%" textAnchor="middle" fill="currentColor" fontSize="20" fontWeight="700">{centerLabel}</text>
        <text x="50%" y="62%" textAnchor="middle" fill="currentColor" fontSize="10">{centerCaption}</text>
      </svg>
      {total === 0 ? <p className="text-sm text-[var(--co-muted)]">No data for this period.</p> : null}
    </div>
  );
}
