import { Bath, BedDouble, KeyRound, PawPrint } from "lucide-react";
import { cleanNoteText } from "@/lib/format";

type ClientHomeSymbolsProps = {
  roomCounts?: { name: string; count: number }[];
  gateCodeOrKeyNotes?: string | null;
  petNotes?: string | null;
  className?: string;
};

/** High-visibility property indicators for dispatchers. Titles expose full details on hover. */
export default function ClientHomeSymbols({ roomCounts = [], gateCodeOrKeyNotes, petNotes, className = "" }: ClientHomeSymbolsProps) {
  const bedrooms = roomCounts.filter((room) => room.name.toLowerCase().includes("bed")).reduce((total, room) => total + room.count, 0);
  const bathrooms = roomCounts.filter((room) => room.name.toLowerCase().includes("bath")).reduce((total, room) => total + room.count, 0);
  const symbols = [
    bedrooms ? { icon: BedDouble, label: `${bedrooms} bedroom${bedrooms === 1 ? "" : "s"}`, tone: "text-[var(--co-accent-text)]", count: bedrooms } : null,
    bathrooms ? { icon: Bath, label: `${bathrooms} bathroom${bathrooms === 1 ? "" : "s"}`, tone: "text-[var(--co-accent-text)]", count: bathrooms } : null,
    petNotes ? { icon: PawPrint, label: `Pets: ${cleanNoteText(petNotes)}`, tone: "text-[var(--co-ink)]", count: null } : null,
    gateCodeOrKeyNotes ? { icon: KeyRound, label: `Entry: ${cleanNoteText(gateCodeOrKeyNotes)}`, tone: "text-[var(--co-ink)]", count: null } : null,
  ].filter((symbol): symbol is { icon: typeof BedDouble; label: string; tone: string; count: number | null } => Boolean(symbol));

  if (!symbols.length) return null;

  return <span className={`flex shrink-0 items-center gap-2 ${className}`} aria-label={symbols.map((symbol) => symbol.label).join("; ")}>{symbols.map(({ icon: Icon, label, tone, count }) => <span key={label} title={label} className={`flex items-center gap-0.5 ${tone}`}><Icon className="h-5 w-5" aria-hidden />{count ? <span className="text-xs font-bold tabular-nums">{count}</span> : null}</span>)}</span>;
}
