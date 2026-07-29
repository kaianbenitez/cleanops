import { CircleSlash, House, KeyRound, PawPrint } from "lucide-react";

type ClientHomeSymbolsProps = {
  homeDetails?: Record<string, unknown> | null;
  gateCodeOrKeyNotes?: string | null;
  petNotes?: string | null;
  doNotClean?: string | null;
  className?: string;
};

function homeProfileLabel(homeDetails: Record<string, unknown> | null | undefined) {
  if (!homeDetails || Object.keys(homeDetails).length === 0) return null;
  const details = [
    homeDetails.dirtLevel ? `Dirt level: ${String(homeDetails.dirtLevel)}` : null,
    homeDetails.clutterCode ? `Clutter code: ${String(homeDetails.clutterCode)}` : null,
    homeDetails.dogs ? `Pets: ${String(homeDetails.dogs)}` : null,
  ].filter(Boolean);
  return details.length ? `House profile — ${details.join(" · ")}` : "House profile available";
}

/** Compact, text-backed alerts for dispatchers. Titles expose the full note on hover. */
export default function ClientHomeSymbols({
  homeDetails,
  gateCodeOrKeyNotes,
  petNotes,
  doNotClean,
  className = "",
}: ClientHomeSymbolsProps) {
  const profileLabel = homeProfileLabel(homeDetails);
  const symbols = [
    profileLabel ? { icon: House, label: profileLabel, tone: "text-[var(--co-evergreen)]" } : null,
    gateCodeOrKeyNotes ? { icon: KeyRound, label: `Access: ${gateCodeOrKeyNotes}`, tone: "text-amber-700" } : null,
    petNotes ? { icon: PawPrint, label: `Pets: ${petNotes}`, tone: "text-[var(--co-muted)]" } : null,
    doNotClean ? { icon: CircleSlash, label: `Don't clean: ${doNotClean}`, tone: "text-rose-700" } : null,
  ].filter((symbol): symbol is { icon: typeof House; label: string; tone: string } => Boolean(symbol));

  if (!symbols.length) return null;

  return (
    <span className={`flex shrink-0 items-center gap-1 ${className}`} aria-label={symbols.map((symbol) => symbol.label).join("; ")}>
      {symbols.map(({ icon: Icon, label, tone }) => (
        <span key={label} title={label} className={tone}>
          <Icon className="h-3.5 w-3.5" aria-hidden />
        </span>
      ))}
    </span>
  );
}
