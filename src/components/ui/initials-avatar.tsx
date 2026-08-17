export function InitialsAvatar({
  firstName,
  lastName,
  companyName,
  className = "h-20 w-20 rounded-3xl text-2xl",
}: {
  firstName: string;
  lastName: string;
  companyName?: string | null;
  className?: string;
}) {
  const initials = companyName ? companyName[0] : `${firstName[0] ?? ""}${lastName[0] ?? ""}`;
  return (
    <div className={`flex shrink-0 items-center justify-center bg-[var(--co-surface-muted)] font-bold text-[var(--co-accent-text)] ${className}`}>
      {initials}
    </div>
  );
}
